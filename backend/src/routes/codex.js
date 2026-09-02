'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const express = require('express');
const { URL } = require('url');
const { requireAuth } = require('../auth/middleware');
const settingsRouter = require('./settings');

const router = express.Router();
const MAX_MODEL_COUNT = 100;

function configuredServiceUrl() {
  const value = String(process.env.T8_CODEX_SERVICE_URL || '').trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return value;
  } catch {
    return '';
  }
}

function bridgeSecret() {
  return String(process.env.T8_CODEX_BRIDGE_SECRET || '').trim();
}

function buildSharedLlmConfig(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems.filter(Boolean) : [];
  const selected = items.find((item) => item?.isDefault) || items[0] || null;
  if (!selected?.apiKey || !selected?.baseUrl || !selected?.model) return null;
  const orderedItems = [selected, ...items.filter((item) => item !== selected)];
  const configsByModel = new Map();

  for (const item of orderedItems) {
    if (!item?.apiKey || !item?.baseUrl || !item?.model) continue;
    const config = {
      apiKey: String(item.apiKey),
      baseUrl: String(item.baseUrl),
      model: String(item.model).trim(),
      id: String(item.id || ''),
    };
    const modelIds = [
      config.model,
      ...(Array.isArray(item.availableModels) ? item.availableModels : []),
    ].map((model) => String(model || '').trim()).filter(Boolean);

    for (const modelId of modelIds) {
      if (configsByModel.has(modelId)) continue;
      if (configsByModel.size >= MAX_MODEL_COUNT) break;
      configsByModel.set(modelId, config);
    }
  }

  const availableModels = Array.from(configsByModel.keys());
  return {
    apiKey: String(selected.apiKey),
    baseUrl: String(selected.baseUrl),
    model: String(selected.model).trim(),
    availableModels,
    configsByModel,
  };
}

function selectedLlmConfig() {
  const settings = settingsRouter.loadSettings({ persistMigrations: false }) || {};
  const items = Array.isArray(settings.llmConfigs) ? settings.llmConfigs : settings.llmApiKeys;
  return buildSharedLlmConfig(items);
}

function chatCompletionsUrl(baseUrl) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  base = base.replace(/\/(chat\/completions|responses)$/i, '');
  if (!/\/v1$/i.test(base)) base += '/v1';
  return `${base}/chat/completions`;
}

function bridgeIdentity(user) {
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const payload = {
    id: String(user?.id || ''),
    username: String(user?.username || ''),
    email: String(user?.email || ''),
    name: String(user?.name || user?.username || ''),
    role: String(user?.role || 'designer'),
    issuedAt: Date.now(),
    expiresAt,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = bridgeSecret();
  const signature = secret ? crypto.createHmac('sha256', secret).update(encoded).digest('hex') : '';
  return { encoded, signature };
}

function requireCodexAuth(req, res, next) {
  if (req.user) return next();
  const supplied = String(req.headers['x-t8-codex-internal'] || '');
  const expected = bridgeSecret();
  if (expected && supplied && supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return next();
  return requireAuth(req, res, next);
}

function serviceUnavailable(res) {
  return res.status(503).json({ success: false, error: 'Codex 工作区服务未配置或不可用，请联系管理员设置 T8_CODEX_SERVICE_URL。' });
}

function parsedRequestBody(req) {
  if (req.body === undefined || !req.readableEnded) return null;
  if (Buffer.isBuffer(req.body)) return req.body;
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (type.includes('application/x-www-form-urlencoded')) return Buffer.from(new URLSearchParams(req.body).toString());
  if (typeof req.body === 'string') return Buffer.from(req.body);
  return Buffer.from(JSON.stringify(req.body));
}

router.get('/health', requireCodexAuth, async (_req, res) => {
  const base = configuredServiceUrl();
  if (!base || !bridgeSecret()) return serviceUnavailable(res);
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    return res.json({ success: response.ok, data: { configured: true, status: response.status } });
  } catch (error) {
    return res.status(503).json({ success: false, error: `Codex 工作区服务不可用：${error.message}` });
  }
});

function sendModels(_req, res) {
  const config = selectedLlmConfig();
  if (!config) return res.status(503).json({ success: false, error: '未配置可用的默认 LLM 共享账户。' });
  return res.json({ success: true, data: config.availableModels.map((id) => ({ id, object: 'model', owned_by: 't8-shared' })) });
}

router.get('/models', requireCodexAuth, sendModels);
// LibreChat custom endpoints append /models to the configured /v1 base URL.
router.get('/v1/models', requireCodexAuth, (_req, res) => {
  const config = selectedLlmConfig();
  if (!config) return res.status(503).json({ error: { message: '未配置可用的默认 LLM 共享账户。', type: 'configuration_error' } });
  return res.json({ object: 'list', data: config.availableModels.map((id) => ({ id, object: 'model', owned_by: 't8-shared' })) });
});

router.post('/v1/chat/completions', requireCodexAuth, async (req, res) => {
  const config = selectedLlmConfig();
  if (!config) return res.status(503).json({ error: { message: '未配置可用的默认 LLM 共享账户。', type: 'configuration_error' } });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const model = String(body.model || config.model).trim();
  const modelConfig = config.configsByModel.get(model);
  if (!modelConfig) {
    return res.status(400).json({ error: { message: '所选模型不在管理员配置的 Codex 共享模型目录中。', type: 'invalid_model' } });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages 必填。', type: 'invalid_request_error' } });
  }
  const controller = new AbortController();
  req.once('aborted', () => controller.abort());
  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const upstream = await fetch(chatCompletionsUrl(modelConfig.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${modelConfig.apiKey}` },
      body: JSON.stringify({ ...body, model }),
      signal: controller.signal,
    });
    res.status(upstream.status);
    for (const [key, value] of upstream.headers.entries()) {
      if (['content-type', 'cache-control'].includes(key.toLowerCase())) res.setHeader(key, value);
    }
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    return res.end();
  } catch (error) {
    if (controller.signal.aborted) return res.end();
    return res.status(502).json({ error: { message: `共享 LLM 上游不可用：${error.message}`, type: 'upstream_error' } });
  }
});

function proxyToLibreChat(req, res) {
  const base = configuredServiceUrl();
  if (!base || !bridgeSecret()) return serviceUnavailable(res);
  const targetPath = req.originalUrl.replace(/^\/api\/codex|^\/codex/, '') || '/';
  const target = new URL(targetPath, `${base}/`);
  const transport = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host, connection: 'close' };
  ['cookie', 'authorization', 'x-t8-codex-user', 'x-t8-codex-signature'].forEach((key) => delete headers[key]);
  const identity = bridgeIdentity(req.user);
  headers['x-t8-codex-user'] = identity.encoded;
  headers['x-t8-codex-signature'] = identity.signature;
  headers['x-forwarded-prefix'] = '/codex';
  const body = parsedRequestBody(req);
  if (body) {
    headers['content-length'] = String(body.length);
    delete headers['transfer-encoding'];
  }
  const upstream = transport.request({ protocol: target.protocol, hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers }, (response) => {
    res.statusCode = response.statusCode || 502;
    for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) res.setHeader(key, value);
    response.pipe(res);
  });
  upstream.on('error', (error) => {
    if (!res.headersSent) res.status(503).json({ success: false, error: `Codex 工作区服务不可用：${error.message}` });
    else res.destroy(error);
  });
  if (body) upstream.end(body);
  else req.pipe(upstream);
}

router.proxyToLibreChat = proxyToLibreChat;
router.bridgeIdentity = bridgeIdentity;
router.buildSharedLlmConfig = buildSharedLlmConfig;
router.selectedLlmConfig = selectedLlmConfig;
router.use(requireCodexAuth);
router.use((req, res) => proxyToLibreChat(req, res));
module.exports = router;
