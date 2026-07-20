'use strict';

const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { generateExternalImageInternal } = require('./externalProviders');
const { probeQoderStatus, runQoderImageStream } = require('../utils/qoderCliRunner');

const router = express.Router();
const internalRouter = express.Router();
const bridgeContexts = new Map();
const BRIDGE_TTL_MS = 2 * 60 * 60 * 1000;

function beginSse(res) {
  res.setTimeout?.(0);
  res.socket?.setTimeout?.(0);
  res.socket?.setKeepAlive?.(true);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Encoding': 'identity',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
}

function sendSse(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  res.flush?.();
}

function isLoopbackRequest(req) {
  const address = String(req.socket?.remoteAddress || '');
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function pruneBridgeContexts() {
  const now = Date.now();
  for (const [token, context] of bridgeContexts.entries()) {
    if (now - Number(context.createdAt || 0) > BRIDGE_TTL_MS) bridgeContexts.delete(token);
  }
}

function bridgeToken(req) {
  const auth = String(req.headers.authorization || '');
  return auth.replace(/^Bearer\s+/i, '').trim();
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function qoderToolDefinition() {
  return {
    name: 'generate_image',
    description: '使用 T8 画布中已经选定的扩展平台和图像模型生成真实图片。必须调用此工具，不能只输出提示词。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '整理后的最终生图提示词' },
        negativePrompt: { type: 'string' },
        images: { type: 'array', items: { type: 'string' }, description: '参考图提示；实际附件由 T8 任务上下文固定提供' },
        size: { type: 'string' },
        aspectRatio: { type: 'string' },
        quality: { type: 'string' },
        count: { type: 'integer', minimum: 1, maximum: 4 },
        outputFormat: { type: 'string', enum: ['png', 'jpg'] },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  };
}

async function callBridgeImageTool(context, args = {}) {
  if (context.result) return context.result;
  if (context.running) return context.running;
  const body = context.body;
  const count = Math.max(1, Math.min(4, Number(body.count || args.count || 1) || 1));
  const task = generateExternalImageInternal({
    providerId: body.providerId,
    providerSource: body.providerSource,
    providerModel: body.providerModel,
    model: body.providerModel,
    providerParams: body.providerParams,
    prompt: String(args.prompt || body.prompt || '').trim(),
    negativePrompt: String(body.negativePrompt || args.negativePrompt || '').trim() || undefined,
    negative: String(body.negativePrompt || args.negativePrompt || '').trim() || undefined,
    images: Array.isArray(body.images) ? body.images : [],
    size: body.size || args.size,
    image_size: body.imageSize || undefined,
    aspect_ratio: body.aspectRatio || args.aspectRatio,
    quality: body.quality || args.quality,
    n: count,
    count,
    outputFormat: body.outputFormat || args.outputFormat || 'png',
    historyContext: {
      sourceNodeId: body.nodeId,
      sourceNodeType: 'qoder-image-conjure',
      nodeTitle: body.nodeTitle || 'Qoder 生图工作台',
    },
    timeoutMs: body.timeoutMs,
  }, { user: context.user, signal: context.signal });
  context.running = task;
  try {
    context.result = await task;
    return context.result;
  } finally {
    context.running = null;
  }
}

internalRouter.post('/mcp', async (req, res) => {
  if (!isLoopbackRequest(req)) return res.status(403).json(jsonRpcError(req.body?.id, -32001, '仅允许本机访问。'));
  pruneBridgeContexts();
  const context = bridgeContexts.get(bridgeToken(req));
  if (!context) return res.status(401).json(jsonRpcError(req.body?.id, -32002, 'Qoder MCP token 无效或已过期。'));
  const message = req.body || {};
  const method = String(message.method || '');
  res.setHeader('Mcp-Session-Id', context.sessionId);
  if (method === 'initialize') {
    return res.json(jsonRpcResult(message.id, {
      protocolVersion: message.params?.protocolVersion || '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 't8-image', version: config.APP_VERSION || '1.0.0' },
    }));
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return res.status(202).end();
  if (method === 'ping') return res.json(jsonRpcResult(message.id, {}));
  if (method === 'tools/list') return res.json(jsonRpcResult(message.id, { tools: [qoderToolDefinition()] }));
  if (method === 'tools/call') {
    if (message.params?.name !== 'generate_image') {
      return res.json(jsonRpcError(message.id, -32602, '未知的 Qoder MCP 工具。'));
    }
    try {
      const result = await callBridgeImageTool(context, message.params?.arguments || {});
      return res.json(jsonRpcResult(message.id, {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            imageUrl: result.imageUrl || result.imageUrls?.[0] || '',
            imageUrls: result.imageUrls || [],
            provider: result.provider,
            taskId: result.taskId,
          }),
        }],
        structuredContent: {
          imageUrl: result.imageUrl || result.imageUrls?.[0] || '',
          imageUrls: result.imageUrls || [],
          taskId: result.taskId,
        },
        isError: false,
      }));
    } catch (error) {
      return res.json(jsonRpcResult(message.id, {
        content: [{ type: 'text', text: error?.message || String(error) }],
        isError: true,
      }));
    }
  }
  return res.json(jsonRpcError(message.id, -32601, `不支持的 MCP 方法：${method}`));
});

router.get('/status', async (req, res) => {
  try {
    const status = await probeQoderStatus({ executablePath: req.query.executablePath, timeoutMs: 12000 });
    return res.json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, code: 'qoder_cli_status_failed', error: error?.message || String(error) });
  }
});

router.post('/stream', async (req, res) => {
  const body = req.body || {};
  if (!String(body.providerId || '').trim() || !String(body.providerModel || '').trim()) {
    return res.status(400).json({ success: false, code: 'qoder_image_provider_required', error: '请选择可用的扩展生图平台和模型。' });
  }
  const abortController = new AbortController();
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomUUID();
  const context = {
    createdAt: Date.now(),
    sessionId,
    body,
    user: req.user || null,
    signal: abortController.signal,
    result: null,
    running: null,
  };
  bridgeContexts.set(token, context);
  const close = () => {
    if (!abortController.signal.aborted) abortController.abort();
  };
  req.on('aborted', close);
  res.on('close', () => {
    if (!res.writableEnded) close();
  });

  beginSse(res);
  sendSse(res, 'turn.started', { message: 'Qoder 生图任务已开始', progress: 1 });
  let heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(`: keep-alive ${Date.now()}\n\n`);
  }, 10000);
  heartbeat.unref?.();
  try {
    const prompt = [
      String(body.prompt || '').trim(),
      '你必须调用 mcp__t8-image__generate_image 生成真实图片。',
      '扩展平台与生图模型已经由 T8 固定选择，不要改用其他平台或只输出提示词。',
      `请求数量：${Math.max(1, Math.min(4, Number(body.count || 1) || 1))}。`,
    ].filter(Boolean).join('\n\n');
    const cliResult = await runQoderImageStream({
      ...body,
      prompt,
      bridgeToken: token,
      bridgeUrl: `http://127.0.0.1:${config.PORT}/internal/qoder-cli/mcp`,
    }, {
      signal: abortController.signal,
      onDelta(delta) {
        sendSse(res, 'message.delta', { delta, text: delta });
      },
      onProgress(message, event) {
        sendSse(res, 'tool.progress', { message, rawType: event?.type });
      },
    });
    const generated = context.result;
    if (!generated?.imageUrls?.length) throw new Error('Qoder CLI 未调用扩展平台生图工具，任务没有返回图片。');
    const artifacts = generated.imageUrls.map((url, index) => ({
      id: `qoder-image-${sessionId}-${index + 1}`,
      kind: 'image',
      title: `Qoder 图像 ${index + 1}`,
      url,
      urls: [url],
      status: 'completed',
      progress: 100,
    }));
    const result = {
      ...cliResult,
      imageUrl: generated.imageUrls[0],
      imageUrls: generated.imageUrls,
      artifacts,
      provider: generated.provider,
      taskId: generated.taskId,
    };
    for (const artifact of artifacts) sendSse(res, 'artifact.completed', { artifact, result: { imageUrl: artifact.url, imageUrls: artifact.urls } });
    sendSse(res, 'turn.completed', { message: 'Qoder 生图任务完成', result, progress: 100 });
    sendSse(res, 'done', { done: true, result });
    res.end();
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Qoder 生图任务已取消。' : (error?.message || String(error));
    sendSse(res, 'turn.failed', { error: message, message, progress: 100 });
    sendSse(res, 'done', { done: true, error: message, result: { text: '', reply: '', artifacts: [] } });
    if (!res.writableEnded) res.end();
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    bridgeContexts.delete(token);
  }
});

router.internalRouter = internalRouter;
router._bridgeContextsForTests = bridgeContexts;
router._qoderToolDefinitionForTests = qoderToolDefinition;

module.exports = router;
