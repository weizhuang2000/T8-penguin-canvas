const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const settingsRouter = require('./settings');
const { maskAdvancedProviders, normalizeAdvancedProviders } = require('../providers/registry');
const { writeImageOutput } = require('../utils/imageOutput');
const {
  generateChatWithProvider,
  generateImageWithProvider,
  generateMusicWithProvider,
  generateVideoWithProvider,
  queryImageTaskWithProvider,
  testProviderConnection,
} = require('../providers/adapters');
const { addHistoryItems } = require('../utils/generationHistory');

const router = express.Router();
const EXTERNAL_GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
const EXTERNAL_IMAGE_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const externalImageJobs = new Map();
const GITEE_MUSIC_PROVIDER_ID = 'gitee-music';

function resolveMusicProvider(body, settings) {
  const providerId = String(body?.providerId || '').trim();
  if (providerId === GITEE_MUSIC_PROVIDER_ID || providerId === 'gitee-flux') {
    return {
      ok: true,
      provider: {
        id: GITEE_MUSIC_PROVIDER_ID,
        label: 'Gitee ACE-Step',
        protocol: 'gitee-flux',
        baseUrl: 'https://ai.gitee.com/v1',
        apiKey: String(settings?.giteeMusicApiKey || '').trim(),
        enabled: true,
      },
    };
  }
  const currentProviders = normalizeAdvancedProviders(settings?.advancedProviders);
  return resolveRunnableProvider(body || {}, currentProviders);
}

function generationTimeoutMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return EXTERNAL_GENERATION_TIMEOUT_MS;
  return Math.max(EXTERNAL_GENERATION_TIMEOUT_MS, Math.round(n));
}

function safeProviderForResponse(provider) {
  const masked = maskAdvancedProviders([provider]);
  const id = String(provider?.id || '').trim();
  const protocol = String(provider?.protocol || '').trim();
  return masked.find((item) => item.id === id && item.protocol === protocol) || masked[0] || null;
}

function resolveProvider(body, currentProviders) {
  if (body?.provider && typeof body.provider === 'object') {
    const normalized = normalizeAdvancedProviders([body.provider], currentProviders);
    const id = String(body.provider.id || '').trim();
    return normalized.find((provider) => provider.id === id) || normalized[0] || null;
  }
  const providerId = String(body?.providerId || '').trim();
  if (!providerId) return null;
  return currentProviders.find((provider) => provider.id === providerId) || null;
}

function resolveRunnableProvider(body, currentProviders) {
  const provider = resolveProvider(body, currentProviders);
  if (!provider) {
    return { ok: false, code: 'provider_not_found', error: '未找到扩展平台配置。' };
  }
  if (!provider.enabled) {
    return { ok: false, code: 'provider_disabled', error: '扩展平台未启用，请先在 API 设置中启用。', provider };
  }
  return { ok: true, provider };
}

function outputExtFromMime(mime, fallback = '.png') {
  const text = String(mime || '').toLowerCase();
  if (text.includes('mp4')) return '.mp4';
  if (text.includes('webm')) return '.webm';
  if (text.includes('quicktime')) return '.mov';
  if (text.includes('mpeg') || text.includes('mp3')) return '.mp3';
  if (text.includes('wav')) return '.wav';
  if (text.includes('ogg')) return '.ogg';
  if (text.includes('jpeg') || text.includes('jpg')) return '.jpg';
  if (text.includes('webp')) return '.webp';
  if (text.includes('gif')) return '.gif';
  if (text.includes('bmp')) return '.bmp';
  if (text.includes('png')) return '.png';
  return fallback;
}

function outputExtFromUrl(url, fallback = '.png') {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.ogg'].includes(ext)) return ext;
  } catch {
    // ignore
  }
  return fallback;
}

function writeOutputBuffer(buffer, ext) {
  if (!fs.existsSync(config.OUTPUT_DIR)) fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  const suffix = crypto.randomBytes(4).toString('hex');
  const filename = `external_${Date.now()}_${suffix}${ext || '.png'}`;
  fs.writeFileSync(path.join(config.OUTPUT_DIR, filename), buffer);
  return `/files/output/${filename}`;
}

function defaultExtForKind(kind) {
  if (kind === 'video') return '.mp4';
  if (kind === 'audio') return '.mp3';
  return '.png';
}

async function saveOneMediaOutput(url, kind = 'image', options = {}) {
  const text = String(url || '').trim();
  if (!text) return '';
  const outputFormat = options.outputFormat || '';
  const needConvert = kind === 'image' && (outputFormat === 'jpg' || outputFormat === 'png');
  const dataMatch = text.match(/^data:([^;,]+);base64,(.+)$/i);
  if (dataMatch) {
    const buf = Buffer.from(dataMatch[2], 'base64');
    if (needConvert) {
      const out = await writeImageOutput(config.OUTPUT_DIR, 'external', buf, outputFormat);
      return out.url;
    }
    const ext = outputExtFromMime(dataMatch[1], defaultExtForKind(kind));
    return writeOutputBuffer(buf, ext);
  }
  if (/^https?:\/\//i.test(text)) {
    const fetchImpl = options.fetchImpl || fetch;
    const res = await fetchImpl(text);
    if (!res.ok) throw new Error(`下载扩展平台输出失败：HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (needConvert) {
      const out = await writeImageOutput(config.OUTPUT_DIR, 'external', buf, outputFormat);
      return out.url;
    }
    const mime = typeof res.headers?.get === 'function' ? res.headers.get('content-type') : '';
    const ext = outputExtFromMime(mime, outputExtFromUrl(text, defaultExtForKind(kind)));
    return writeOutputBuffer(buf, ext);
  }
  if (text.startsWith('/files/output/')) return text;
  return text;
}

async function saveImageOutputs(urls, options = {}) {
  const out = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    try {
      const saved = await saveOneMediaOutput(url, 'image', options);
      if (saved) out.push(saved);
    } catch (e) {
      console.warn('[external/image] save output failed, falling back to remote url:', e?.message || e);
      if (typeof url === 'string' && url) out.push(url);
    }
  }
  return out;
}

async function saveVideoOutputs(urls, options = {}) {
  const out = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    const saved = await saveOneMediaOutput(url, 'video', options);
    if (saved) out.push(saved);
  }
  return out;
}

async function saveAudioOutputs(urls, options = {}) {
  const out = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    const saved = await saveOneMediaOutput(url, 'audio', options);
    if (saved) out.push(saved);
  }
  return out;
}

function resultResponse(res, result, provider, dataPatch = {}) {
  const payload = {
    ...result,
    ...dataPatch,
    provider: safeProviderForResponse(provider),
  };
  return res.json({
    success: !!result.ok,
    code: result.code,
    error: result.ok ? undefined : result.error,
    data: payload,
  });
}

function parseHistoryContext(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function rememberExternalOutputs(req, urls, kind, provider, extra = {}) {
  const source = req.body && Object.keys(req.body).length ? req.body : (req.query || {});
  const list = (Array.isArray(urls) ? urls : [])
    .filter((url) => typeof url === 'string' && url)
    .map((url) => ({ url, kind, ...extra }));
  if (!list.length) return;
  try {
    addHistoryItems(list, {
      ...parseHistoryContext(source?.historyContext),
      prompt: source?.prompt,
      provider: provider?.label || provider?.id || '',
      model: source?.providerModel || source?.model || '',
      taskId: extra.taskId || req.body?.taskId || '',
      seed: source?.seed,
    }, req.user);
  } catch (e) {
    console.warn('[generation-history] external record failed:', e?.message || e);
  }
}

function canContinueImageTask(result) {
  if (!result?.taskId) return false;
  const code = String(result.code || '');
  if (['timeout', 'network_error', 'empty_image'].includes(code)) return true;
  if (code !== 'http_error') return false;
  const status = Number(result.statusCode || result.httpStatus || result.raw?.status || result.raw?.statusCode);
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function imageTaskRunningResult(result, code = 'running') {
  return {
    ...result,
    ok: true,
    kind: 'image',
    code,
    status: 'running',
  };
}

function clonePlain(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return {};
  }
}

async function generateExternalImageInternal(body = {}, options = {}) {
  const settings = settingsRouter.loadSettings({ persistMigrations: false });
  const currentProviders = normalizeAdvancedProviders(settings.advancedProviders);
  const resolved = resolveRunnableProvider(body, currentProviders);
  if (!resolved.ok) {
    const error = new Error(resolved.error || '扩展平台不可用。');
    error.code = resolved.code || 'provider_unavailable';
    throw error;
  }
  const requestedSource = String(body.providerSource || '').trim();
  if (requestedSource && requestedSource !== String(resolved.provider.protocol || '').trim()) {
    const error = new Error('扩展平台协议与当前节点选择不一致。');
    error.code = 'provider_source_mismatch';
    throw error;
  }

  const timeoutMs = generationTimeoutMs(body.timeoutMs);
  const startedAt = Date.now();
  const baseUrl = `http://127.0.0.1:${config.PORT}`;
  let result = await generateImageWithProvider(resolved.provider, body, { timeoutMs, baseUrl, signal: options.signal });
  let taskId = result?.taskId || '';
  const shouldPoll = (value) => Boolean(
    value?.taskId
    && (!Array.isArray(value.imageUrls) || !value.imageUrls.length)
    && (
      canContinueImageTask(value)
      || ['running', 'pending', 'queued', 'processing', 'submitted'].includes(String(value.code || value.status || '').toLowerCase())
    )
  );

  while (shouldPoll(result)) {
    if (options.signal?.aborted) {
      const error = new Error('Qoder 生图任务已取消。');
      error.name = 'AbortError';
      throw error;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      const error = new Error('扩展平台生图任务超时。');
      error.code = 'timeout';
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    result = await queryImageTaskWithProvider(resolved.provider, taskId, {
      timeoutMs: Math.max(1000, timeoutMs - (Date.now() - startedAt)),
      baseUrl,
      signal: options.signal,
    });
    taskId = result?.taskId || taskId;
  }

  if (!result?.ok || !Array.isArray(result.imageUrls) || !result.imageUrls.length) {
    const error = new Error(result?.error || '扩展平台完成任务但没有返回图片。');
    error.code = result?.code || 'empty_image';
    error.result = result;
    throw error;
  }

  const remoteImageUrls = result.imageUrls;
  const imageUrls = await saveImageOutputs(remoteImageUrls, { outputFormat: body.outputFormat });
  rememberExternalOutputs(
    { body, user: options.user || null },
    imageUrls,
    'image',
    resolved.provider,
    { taskId: taskId || result.taskId },
  );
  return {
    ...result,
    provider: safeProviderForResponse(resolved.provider),
    taskId: taskId || result.taskId,
    remoteImageUrls,
    imageUrls,
    imageUrl: imageUrls[0] || '',
  };
}

function pruneExternalImageJobs() {
  const now = Date.now();
  for (const [id, job] of externalImageJobs.entries()) {
    if (now - Number(job.updatedAt || job.createdAt || 0) > EXTERNAL_IMAGE_JOB_TTL_MS) {
      externalImageJobs.delete(id);
    }
  }
}

function localImageJobPayload(job) {
  return {
    taskId: job.id,
    upstreamTaskId: job.upstreamTaskId || undefined,
    status: job.status,
    code: job.code,
    imageUrls: Array.isArray(job.imageUrls) ? job.imageUrls : [],
    remoteImageUrls: Array.isArray(job.remoteImageUrls) ? job.remoteImageUrls : [],
    error: job.error || undefined,
    raw: job.raw,
    provider: safeProviderForResponse(job.provider),
  };
}

function setLocalImageJobRunning(job, patch = {}) {
  Object.assign(job, {
    ...patch,
    status: 'running',
    code: patch.code || job.code || 'running',
    updatedAt: Date.now(),
  });
}

function setLocalImageJobFailed(job, result) {
  Object.assign(job, {
    status: 'failed',
    code: result?.code || 'failed',
    error: result?.error || '扩展平台图像任务失败。',
    raw: result?.raw,
    updatedAt: Date.now(),
  });
}

async function setLocalImageJobCompleted(job, result) {
  const remoteImageUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [];
  const imageUrls = await saveImageOutputs(remoteImageUrls, { outputFormat: job.body?.outputFormat });
  Object.assign(job, {
    status: 'completed',
    code: 'completed',
    imageUrls,
    remoteImageUrls,
    upstreamTaskId: result.taskId || job.upstreamTaskId || '',
    raw: result.raw,
    updatedAt: Date.now(),
  });
  rememberExternalOutputs({ body: job.body, user: job.user }, imageUrls, 'image', job.provider, { taskId: job.upstreamTaskId || result.taskId || job.id });
}

async function runLocalImageJob(job) {
  try {
    const result = await generateImageWithProvider(job.provider, job.body, {
      timeoutMs: generationTimeoutMs(job.body?.timeoutMs),
      baseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    if (!result.ok) {
      if (canContinueImageTask(result)) {
        setLocalImageJobRunning(job, {
          code: 'running',
          upstreamTaskId: result.taskId || job.upstreamTaskId || '',
          raw: result.raw,
        });
        return;
      }
      setLocalImageJobFailed(job, result);
      return;
    }
    await setLocalImageJobCompleted(job, result);
  } catch (e) {
    setLocalImageJobFailed(job, {
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      error: e?.message || String(e),
    });
  }
}

function createLocalImageJob(req, provider) {
  pruneExternalImageJobs();
  const id = `external-image-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const job = {
    id,
    provider,
    body: clonePlain(req.body),
    user: req.user || null,
    status: 'running',
    code: 'running',
    imageUrls: [],
    remoteImageUrls: [],
    upstreamTaskId: '',
    raw: undefined,
    error: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  externalImageJobs.set(id, job);
  setImmediate(() => {
    runLocalImageJob(job).catch((e) => {
      setLocalImageJobFailed(job, {
        code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
        error: e?.message || String(e),
      });
    });
  });
  return job;
}

async function refreshLocalImageJob(job, query = {}) {
  if (job.status !== 'running' || !job.upstreamTaskId) return job;
  const result = await queryImageTaskWithProvider(job.provider, job.upstreamTaskId, {
    timeoutMs: Number(query?.timeoutMs) || undefined,
    baseUrl: `http://127.0.0.1:${config.PORT}`,
  });
  if (!result.ok) {
    if (canContinueImageTask(result)) {
      setLocalImageJobRunning(job, { code: 'transient_error', raw: result.raw });
      return job;
    }
    setLocalImageJobFailed(job, result);
    return job;
  }
  if (Array.isArray(result.imageUrls) && result.imageUrls.length) {
    await setLocalImageJobCompleted(job, result);
    return job;
  }
  setLocalImageJobRunning(job, {
    code: result.code || 'running',
    raw: result.raw,
  });
  return job;
}

router.post('/test-provider', async (req, res) => {
  try {
    const settings = settingsRouter.loadSettings({ persistMigrations: false });
    const currentProviders = normalizeAdvancedProviders(settings.advancedProviders);
    const provider = resolveProvider(req.body || {}, currentProviders);
    if (!provider) {
      return res.json({
        success: false,
        code: 'provider_not_found',
        error: '未找到扩展平台配置。',
      });
    }

    const result = await testProviderConnection(provider, {
      dryRun: !!req.body?.dryRun,
      timeoutMs: Number(req.body?.timeoutMs) || undefined,
    });
    const data = {
      ...result,
      provider: safeProviderForResponse(provider),
    };
    return res.json({
      success: !!result.ok,
      code: result.code,
      error: result.ok ? undefined : result.error,
      data,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      code: 'provider_test_failed',
      error: e?.message || String(e),
    });
  }
});

router.post('/llm', async (req, res) => {
  try {
    const settings = settingsRouter.loadSettings({ persistMigrations: false });
    const currentProviders = normalizeAdvancedProviders(settings.advancedProviders);
    const resolved = resolveRunnableProvider(req.body || {}, currentProviders);
    if (!resolved.ok) {
      return res.json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        data: resolved.provider ? { provider: safeProviderForResponse(resolved.provider) } : undefined,
      });
    }
    const result = await generateChatWithProvider(resolved.provider, req.body || {}, {
      timeoutMs: Number(req.body?.timeoutMs) || undefined,
      baseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    return resultResponse(res, result, resolved.provider);
  } catch (e) {
    return res.status(500).json({
      success: false,
      code: 'external_llm_failed',
      error: e?.message || String(e),
    });
  }
});

router.post('/image', async (req, res) => {
  try {
    const settings = settingsRouter.loadSettings({ persistMigrations: false });
    const currentProviders = normalizeAdvancedProviders(settings.advancedProviders);
    const resolved = resolveRunnableProvider(req.body || {}, currentProviders);
    if (!resolved.ok) {
      return res.json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        data: resolved.provider ? { provider: safeProviderForResponse(resolved.provider) } : undefined,
      });
    }
    if (req.body?.async === true) {
      const job = createLocalImageJob(req, resolved.provider);
      return resultResponse(res, imageTaskRunningResult({
        ok: true,
        kind: 'image',
        code: 'running',
        taskId: job.id,
        status: 'running',
      }), resolved.provider, { imageUrls: [], remoteImageUrls: [] });
    }
    const result = await generateImageWithProvider(resolved.provider, req.body || {}, {
      timeoutMs: generationTimeoutMs(req.body?.timeoutMs),
      baseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    if (!result.ok) {
      if (canContinueImageTask(result)) {
        return resultResponse(res, imageTaskRunningResult(result), resolved.provider, { imageUrls: [], remoteImageUrls: [] });
      }
      return resultResponse(res, result, resolved.provider);
    }
    const remoteImageUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [];
    const imageUrls = await saveImageOutputs(remoteImageUrls, { outputFormat: req.body?.outputFormat });
    rememberExternalOutputs(req, imageUrls, 'image', resolved.provider, { taskId: result.taskId });
    return resultResponse(res, result, resolved.provider, {
      remoteImageUrls,
      imageUrls,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      code: 'external_image_failed',
      error: e?.message || String(e),
    });
  }
});

router.get('/image/status/:taskId', async (req, res) => {
  try {
    if (String(req.params.taskId || '').startsWith('external-image-')) {
      const job = externalImageJobs.get(String(req.params.taskId || ''));
      if (!job) {
        return res.json({
          success: false,
          code: 'local_task_not_found',
          error: '未找到本地扩展图像任务，可能已重启或任务已过期。',
          data: { taskId: req.params.taskId },
        });
      }
      await refreshLocalImageJob(job, req.query || {});
      return res.json({
        success: job.status !== 'failed',
        code: job.code,
        error: job.status === 'failed' ? job.error : undefined,
        data: localImageJobPayload(job),
      });
    }
    const settings = settingsRouter.loadSettings({ persistMigrations: false });
    const currentProviders = normalizeAdvancedProviders(settings.advancedProviders);
    const resolved = resolveRunnableProvider(req.query || {}, currentProviders);
    if (!resolved.ok) {
      return res.json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        data: resolved.provider ? { provider: safeProviderForResponse(resolved.provider) } : undefined,
      });
    }
    const result = await queryImageTaskWithProvider(resolved.provider, req.params.taskId, {
      timeoutMs: Number(req.query?.timeoutMs) || undefined,
      baseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    if (!result.ok && canContinueImageTask(result)) {
      return resultResponse(res, imageTaskRunningResult(result, 'transient_error'), resolved.provider, {
        imageUrls: [],
        remoteImageUrls: [],
      });
    }
    if (!result.ok) return resultResponse(res, result, resolved.provider);

    const remoteImageUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [];
    const imageUrls = remoteImageUrls.length ? await saveImageOutputs(remoteImageUrls, { outputFormat: req.query?.outputFormat }) : [];
    if (imageUrls.length) {
      rememberExternalOutputs(req, imageUrls, 'image', resolved.provider, { taskId: result.taskId || req.params.taskId });
    }
    return resultResponse(res, result, resolved.provider, {
      remoteImageUrls,
      imageUrls,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      code: 'external_image_status_failed',
      error: e?.message || String(e),
    });
  }
});

router.post('/video', async (req, res) => {
  try {
    const settings = settingsRouter.loadSettings({ persistMigrations: false });
    const currentProviders = normalizeAdvancedProviders(settings.advancedProviders);
    const resolved = resolveRunnableProvider(req.body || {}, currentProviders);
    if (!resolved.ok) {
      return res.json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        data: resolved.provider ? { provider: safeProviderForResponse(resolved.provider) } : undefined,
      });
    }
    const result = await generateVideoWithProvider(resolved.provider, req.body || {}, {
      timeoutMs: generationTimeoutMs(req.body?.timeoutMs),
      baseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    if (!result.ok) return resultResponse(res, result, resolved.provider);
    const remoteVideoUrls = Array.isArray(result.videoUrls) ? result.videoUrls : [];
    const videoUrls = await saveVideoOutputs(remoteVideoUrls);
    return resultResponse(res, result, resolved.provider, {
      remoteVideoUrls,
      videoUrls,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      code: 'external_video_failed',
      error: e?.message || String(e),
    });
  }
});

router.post('/music', async (req, res) => {
  try {
    const settings = settingsRouter.loadSettings({ persistMigrations: false });
    const resolved = resolveMusicProvider(req.body || {}, settings);
    if (!resolved.ok) {
      return res.json({
        success: false,
        code: resolved.code,
        error: resolved.error,
        data: resolved.provider ? { provider: safeProviderForResponse(resolved.provider) } : undefined,
      });
    }
    const result = await generateMusicWithProvider(resolved.provider, req.body || {}, {
      timeoutMs: generationTimeoutMs(req.body?.timeoutMs),
      baseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    if (!result.ok) return resultResponse(res, result, resolved.provider);
    const remoteAudioUrls = Array.isArray(result.audioUrls) ? result.audioUrls : [];
    const audioUrls = await saveAudioOutputs(remoteAudioUrls);
    rememberExternalOutputs(req, audioUrls, 'audio', resolved.provider, { taskId: result.taskId });
    return resultResponse(res, result, resolved.provider, {
      remoteAudioUrls,
      audioUrls,
      audioUrl: audioUrls[0] || '',
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      code: 'external_music_failed',
      error: e?.message || String(e),
    });
  }
});

module.exports = router;
module.exports.generateExternalImageInternal = generateExternalImageInternal;
