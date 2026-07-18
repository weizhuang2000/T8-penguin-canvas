'use strict';

const express = require('express');
const { runLocalHooks } = require('../extensions/runtimeHooks');
const settingsRouter = require('./settings');
const {
  CODEX_DISABLED_MESSAGE,
  createCodexWorkspace,
  createProjectSkill,
  deleteProjectSkill,
  listCodexSkills,
  probeCodexStatus,
  runCodexExecStream,
  sendSse,
  updateProjectSkill,
} = require('../utils/codexCliRunner');

const router = express.Router();

function beginSse(res) {
  if (res.headersSent) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function cleanHookData(result = {}) {
  const data = result.data && typeof result.data === 'object' ? { ...result.data } : { ...result };
  delete data.handled;
  delete data.config;
  delete data.action;
  delete data.statusCode;
  return data;
}

function artifactPatch(artifact = {}) {
  const kind = artifact.kind;
  const urls = Array.isArray(artifact.urls) ? artifact.urls : (artifact.url ? [artifact.url] : []);
  if (kind === 'image') return { imageUrl: urls[0] || '', imageUrls: urls };
  if (kind === 'video') return { videoUrl: urls[0] || '', videoUrls: urls };
  if (kind === 'audio') return { audioUrl: urls[0] || '', audioUrls: urls };
  if (kind === 'model3d') return { modelUrl: urls[0] || '', modelUrls: urls };
  return {};
}

function resultWithArtifacts(result = {}) {
  const out = { ...result };
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  for (const artifact of artifacts) Object.assign(out, artifactPatch(artifact));
  return out;
}

function codexRequestError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function resolveAgentLlmProvider(body = {}) {
  if (body.agentProvider !== 'llm-config') return null;
  const llmKeyId = String(body.llmKeyId || '').trim();
  if (!llmKeyId) {
    throw codexRequestError('请选择用于 Codex Agent 的 LLM 独立配置。', 'codex_llm_config_required');
  }
  const settings = settingsRouter.loadSettings({ persistMigrations: false });
  const configs = settingsRouter.normalizeLlmConfigs(
    settings.llmConfigs || settings.llmApiKeys,
    settings.llmConfigs || settings.llmApiKeys,
    { apiKey: settings.llmApiKey, baseUrl: settings.llmBaseUrl, model: settings.llmModel },
  );
  const selected = configs.find((item) => item.id === llmKeyId);
  if (!selected) {
    throw codexRequestError('所选 LLM 独立配置不存在或已被删除，请重新选择。', 'codex_llm_config_missing');
  }
  if (!String(selected.apiKey || '').trim()) {
    throw codexRequestError('所选 LLM 独立配置缺少 API Key。', 'codex_llm_api_key_missing');
  }
  return {
    id: selected.id,
    label: selected.label,
    apiKey: selected.apiKey,
    baseUrl: selected.baseUrl,
    model: selected.model,
  };
}

function friendlyAgentStreamError(error, body = {}) {
  const message = error?.message || CODEX_DISABLED_MESSAGE;
  if (body.agentProvider !== 'llm-config') return message;
  if (/\/responses[^\n]*(?:404|not found)|(?:404|not found)[^\n]*\/responses/i.test(message)) {
    return '所选 LLM 独立配置不支持 Responses API（/v1/responses），无法作为 Codex Agent 模型。';
  }
  if (/not logged in|codex login|OPENAI_API_KEY|unauthorized|forbidden|\b401\b|\b403\b/i.test(message)) {
    return '所选 LLM 独立配置认证失败，请检查该配置的 API Key、Base URL 和 Responses API 权限。';
  }
  return message;
}

router.get('/status', async (req, res) => {
  try {
    const hookResult = await runLocalHooks('codexCli.status', { req, handled: false });
    if (hookResult?.handled) {
      return res.json({ success: true, data: cleanHookData(hookResult) });
    }
    const data = await probeCodexStatus({
      executablePath: req.query.executablePath,
      runtimeOnly: req.query.runtimeOnly === '1' || req.query.runtimeOnly === 'true',
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_status_failed',
      error: error?.message || String(error),
    });
  }
});

router.get('/skills', async (req, res) => {
  try {
    const workspace = createCodexWorkspace({
      nodeId: req.query.nodeId || 'codex-skills',
      sessionId: req.query.sessionId || 'skills',
      workspaceDir: req.query.workspaceDir || '',
    });
    const skills = listCodexSkills({ workspaceDir: workspace.dir });
    return res.json({
      success: true,
      data: {
        workspaceDir: workspace.dir,
        skills,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_skills_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/skills/project', async (req, res) => {
  try {
    const body = req.body || {};
    const workspace = createCodexWorkspace({
      nodeId: body.nodeId || 'codex-project-skill',
      sessionId: body.sessionId || 'project-skills',
      workspaceDir: body.workspaceDir || '',
    });
    const skill = createProjectSkill({
      ...body,
      workspaceDir: workspace.dir,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir: workspace.dir,
        skill,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_failed',
      error: error?.message || String(error),
    });
  }
});

router.put('/skills/project/:name', async (req, res) => {
  try {
    const body = req.body || {};
    const workspace = createCodexWorkspace({
      nodeId: body.nodeId || 'codex-project-skill',
      sessionId: body.sessionId || 'project-skills',
      workspaceDir: body.workspaceDir || '',
    });
    const skill = updateProjectSkill({
      ...body,
      oldName: req.params.name,
      workspaceDir: workspace.dir,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir: workspace.dir,
        skill,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_update_failed',
      error: error?.message || String(error),
    });
  }
});

router.delete('/skills/project/:name', async (req, res) => {
  try {
    const body = req.body || {};
    const workspace = createCodexWorkspace({
      nodeId: body.nodeId || req.query.nodeId || 'codex-project-skill',
      sessionId: body.sessionId || req.query.sessionId || 'project-skills',
      workspaceDir: body.workspaceDir || req.query.workspaceDir || '',
    });
    const result = deleteProjectSkill({
      workspaceDir: workspace.dir,
      name: req.params.name,
    });
    return res.json({
      success: true,
      data: {
        workspaceDir: workspace.dir,
        ...result,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'codex_cli_project_skill_delete_failed',
      error: error?.message || String(error),
    });
  }
});

router.post('/agent/stream', async (req, res) => {
  const body = req.body || {};
  const mode = String(body.mode || 'chat');
  const turnId = String(body.turnId || '');
  const abortController = new AbortController();
  const meta = {
    mode,
    turnId,
    command: String(body.command || body.preset || mode),
  };
  const abortStream = () => {
    if (!res.writableEnded && !abortController.signal.aborted) {
      abortController.abort();
    }
  };
  res.on('close', abortStream);
  req.on('aborted', abortStream);
  req.on('close', () => {
    if (req.aborted) abortStream();
  });
  try {
    const hookResult = await runLocalHooks('codexCli.agentStream', {
      req,
      res,
      body,
      handled: false,
    });
    if (hookResult?.handled) return undefined;

    const llmProvider = resolveAgentLlmProvider(body);
    const runBody = llmProvider
      ? { ...body, model: llmProvider.model, llmProvider }
      : body;

    beginSse(res);
    sendSse(res, 'turn.started', {
      ...meta,
      message: 'Codex CLI 创作任务已开始',
      progress: 1,
    });
    sendSse(res, 'tool.progress', {
      ...meta,
      message: body.workspaceDir ? '正在使用已设置的 Codex 创作工作区...' : '正在打开 Codex 创作工作区...',
      progress: 5,
    });

    const result = await runCodexExecStream(runBody, {
      signal: abortController.signal,
      onDelta(delta, event) {
        sendSse(res, 'message.delta', {
          ...meta,
          delta,
          text: delta,
          rawType: event?.type,
        });
      },
      onProgress(message, event) {
        sendSse(res, 'tool.progress', {
          ...meta,
          message,
          rawType: event?.type,
          progress: typeof event?.progress === 'number' ? event.progress : undefined,
        });
      },
      onRawEvent(event) {
        if (event?.type === 'error') {
          sendSse(res, 'artifact.failed', {
            ...meta,
            error: event.error || event.message || 'Codex CLI 事件失败',
          });
        }
      },
    });

    const finalResult = resultWithArtifacts(result);
    for (const artifact of result.artifacts || []) {
      sendSse(res, 'artifact.completed', {
        ...meta,
        artifact,
        result: artifactPatch(artifact),
        progress: 100,
      });
    }
    sendSse(res, 'turn.completed', {
      ...meta,
      message: 'Codex CLI 创作任务完成',
      result: finalResult,
      progress: 100,
    });
    sendSse(res, 'done', {
      ...meta,
      done: true,
      result: finalResult,
    });
    res.end();
    return undefined;
  } catch (error) {
    const message = friendlyAgentStreamError(error, body);
    const errorArtifacts = Array.isArray(error?.artifacts) ? error.artifacts : [];
    if (abortController.signal.aborted && res.writableEnded) return undefined;
    if (!res.headersSent) {
      return res.status(Number(error?.statusCode) || 500).json({
        success: false,
        code: error?.code || 'codex_cli_agent_stream_failed',
        error: message,
      });
    }
    for (const artifact of errorArtifacts) {
      sendSse(res, 'artifact.completed', {
        ...meta,
        artifact,
        result: artifactPatch(artifact),
        progress: 100,
      });
    }
    sendSse(res, 'artifact.failed', {
      ...meta,
      error: message,
      message,
      progress: 100,
    });
    sendSse(res, 'turn.failed', {
      ...meta,
      error: message,
      message,
      progress: 100,
    });
    sendSse(res, 'done', {
      ...meta,
      done: true,
      error: message,
      result: {
        status: 'error',
        message,
        text: error?.partialText || '',
        reply: error?.partialText || '',
        artifacts: errorArtifacts,
        workspace: error?.workspace,
        executable: error?.executable,
        elapsedMs: error?.elapsedMs,
        ...resultWithArtifacts({ artifacts: errorArtifacts }),
      },
    });
    if (!res.writableEnded) res.end();
    return undefined;
  }
});

module.exports = router;
