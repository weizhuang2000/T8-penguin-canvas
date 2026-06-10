const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const settingsRouter = require('./settings');
const { normalizeImageOutputFormat, writeImageOutput } = require('../utils/imageOutput');
const { addHistoryItems, kindFromUrl } = require('../utils/generationHistory');
const { requireNodePermission } = require('../auth/toolPermissions');
const { maskAdvancedProviders, normalizeAdvancedProviders } = require('../providers/registry');
const {
  generateChatWithProvider,
  generateImageWithProvider,
  generateVideoWithProvider,
  queryImageTaskWithProvider,
  testProviderConnection,
} = require('../providers/adapters');

const router = express.Router();
const externalImageJobs = new Map();
const EXTERNAL_IMAGE_JOB_TTL_MS = 6 * 60 * 60 * 1000;
const EXTERNAL_IMAGE_JOB_MAX = 300;
const EXTERNAL_IMAGE_BACKGROUND_TIMEOUT_MS = 30 * 60 * 1000;
const EXTERNAL_IMAGE_OUTPUT_FALLBACK_MS = 20 * 60 * 1000;
const IMAGE_OUTPUT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function safeProviderForResponse(provider) {
  return maskAdvancedProviders([provider])[0] || null;
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

function outputFileSnapshot() {
  try {
    if (!fs.existsSync(config.OUTPUT_DIR)) return [];
    return fs.readdirSync(config.OUTPUT_DIR)
      .filter((name) => IMAGE_OUTPUT_EXTS.has(path.extname(name).toLowerCase()));
  } catch {
    return [];
  }
}

function findNewOutputImages(job) {
  const known = new Set(Array.isArray(job.knownOutputFiles) ? job.knownOutputFiles : []);
  const minMtime = Math.max(0, Number(job.createdAt || 0) - 2000);
  const out = [];
  try {
    if (!fs.existsSync(config.OUTPUT_DIR)) return out;
    for (const name of fs.readdirSync(config.OUTPUT_DIR)) {
      if (known.has(name)) continue;
      if (!IMAGE_OUTPUT_EXTS.has(path.extname(name).toLowerCase())) continue;
      const full = path.join(config.OUTPUT_DIR, name);
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.mtimeMs < minMtime) continue;
      out.push({ name, mtimeMs: stat.mtimeMs });
    }
  } catch {
    return [];
  }
  return out
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .map((item) => `/files/output/${encodeURIComponent(item.name).replace(/%2F/gi, '/')}`);
}

function completeJobFromServerOutputs(job) {
  const imageUrls = findNewOutputImages(job);
  if (!imageUrls.length) return false;
  job.status = 'completed';
  job.code = 'completed';
  job.progress = '100%';
  job.imageUrls = imageUrls;
  job.remoteImageUrls = job.remoteImageUrls || [];
  job.error = '';
  job.updatedAt = Date.now();
  rememberExternalOutputs(
    { body: job.body, user: job.user },
    imageUrls,
    job.provider,
    { kind: 'image', taskId: job.providerTaskId || job.id },
  );
  return true;
}

function pruneExternalImageJobs() {
  const now = Date.now();
  for (const [id, job] of externalImageJobs.entries()) {
    const done = job.status === 'completed' || job.status === 'failed';
    if (done && now - Number(job.updatedAt || job.createdAt || 0) > EXTERNAL_IMAGE_JOB_TTL_MS) {
      externalImageJobs.delete(id);
    }
  }
  while (externalImageJobs.size > EXTERNAL_IMAGE_JOB_MAX) {
    const first = externalImageJobs.keys().next().value;
    if (!first) break;
    externalImageJobs.delete(first);
  }
}

function createExternalImageJob(provider, body, user) {
  pruneExternalImageJobs();
  const id = `external-image-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = Date.now();
  const job = {
    id,
    provider,
    body: JSON.parse(JSON.stringify(body || {})),
    user,
    status: 'running',
    code: 'running',
    progress: '0%',
    imageUrls: [],
    remoteImageUrls: [],
    knownOutputFiles: outputFileSnapshot(),
    providerTaskId: '',
    raw: null,
    error: '',
    lastError: '',
    fallbackUntil: now + EXTERNAL_IMAGE_OUTPUT_FALLBACK_MS,
    createdAt: now,
    updatedAt: now,
  };
  externalImageJobs.set(id, job);
  return job;
}

function localJobResult(job) {
  return {
    ok: job.status !== 'failed',
    kind: 'image',
    code: job.status === 'completed' ? 'completed' : 'running',
    status: job.status,
    progress: job.progress || (job.status === 'completed' ? '100%' : '0%'),
    taskId: job.id,
    providerTaskId: job.providerTaskId || undefined,
    imageUrls: Array.isArray(job.imageUrls) ? job.imageUrls : [],
    remoteImageUrls: Array.isArray(job.remoteImageUrls) ? job.remoteImageUrls : [],
    raw: job.raw,
    error: job.status === 'failed' ? (job.error || undefined) : undefined,
  };
}

function sendLocalImageJobResponse(res, job) {
  const result = localJobResult(job);
  const payload = {
    ...result,
    provider: safeProviderForResponse(job.provider),
  };
  return res.json({
    success: result.ok,
    code: result.code,
    error: result.ok ? undefined : result.error,
    data: payload,
  });
}

function runningImageResponse(res, result, provider) {
  return resultResponse(res, {
    ...result,
    ok: true,
    code: 'running',
    status: 'running',
    imageUrls: [],
  }, provider, {
    imageUrls: [],
  });
}

async function writeImageOutputBuffer(buffer, format = 'jpg') {
  const result = await writeImageOutput(config.OUTPUT_DIR, 'external', buffer, format);
  return result.url;
}

function defaultExtForKind(kind) {
  if (kind === 'video') return '.mp4';
  if (kind === 'audio') return '.mp3';
  return '.png';
}

async function saveOneMediaOutput(url, kind = 'image', options = {}) {
  const imageOutputFormat = normalizeImageOutputFormat(options.outputFormat);
  const text = String(url || '').trim();
  if (!text) return '';
  const dataMatch = text.match(/^data:([^;,]+);base64,(.+)$/i);
  if (dataMatch) {
    if (kind === 'image') {
      return writeImageOutputBuffer(Buffer.from(dataMatch[2], 'base64'), imageOutputFormat);
    }
    const ext = outputExtFromMime(dataMatch[1], defaultExtForKind(kind));
    return writeOutputBuffer(Buffer.from(dataMatch[2], 'base64'), ext);
  }
  if (/^https?:\/\//i.test(text)) {
    const fetchImpl = options.fetchImpl || fetch;
    const res = await fetchImpl(text);
    if (!res.ok) throw new Error(`下载扩展平台输出失败：HTTP ${res.status}`);
    const mime = typeof res.headers?.get === 'function' ? res.headers.get('content-type') : '';
    const ext = outputExtFromMime(mime, outputExtFromUrl(text, defaultExtForKind(kind)));
    const buf = Buffer.from(await res.arrayBuffer());
    if (kind === 'image') {
      return writeImageOutputBuffer(buf, imageOutputFormat);
    }
    return writeOutputBuffer(buf, ext);
  }
  if (text.startsWith('/files/output/')) return text;
  return text;
}

async function saveImageOutputs(urls, options = {}) {
  const out = [];
  for (const url of Array.isArray(urls) ? urls : []) {
    const saved = await saveOneMediaOutput(url, 'image', options);
    if (saved) out.push(saved);
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

function rememberExternalOutputs(req, urls, provider, extra = {}) {
  const list = (Array.isArray(urls) ? urls : [])
    .filter((url) => typeof url === 'string' && url)
    .map((url) => ({ url, kind: extra.kind || kindFromUrl(url), ...extra }));
  if (!list.length) return;
  const ctx = req.body?.historyContext && typeof req.body.historyContext === 'object' ? req.body.historyContext : {};
  try {
    addHistoryItems(list, {
      ...ctx,
      prompt: req.body?.prompt || ctx.prompt,
      provider: provider?.label || provider?.id || ctx.provider,
      model: req.body?.providerModel || req.body?.model || ctx.model,
      taskId: extra.taskId || ctx.taskId,
      seed: extra.seed ?? req.body?.seed ?? ctx.seed,
    }, req.user);
  } catch (e) {
    console.warn('[generation-history] record external output failed:', e?.message || e);
  }
}

function parseHistoryContextQuery(value) {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function runExternalImageGeneration(provider, body, user, options = {}) {
  const requestBody = body || {};
  const result = await generateImageWithProvider(provider, requestBody, {
    timeoutMs: options.timeoutMs || Number(requestBody?.timeoutMs) || undefined,
    baseUrl: `http://127.0.0.1:${config.PORT}`,
    outputFormat: requestBody?.outputFormat,
  });
  if (!result.ok) return result;
  const remoteImageUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [];
  const imageUrls = await saveImageOutputs(remoteImageUrls, {
    outputFormat: requestBody?.outputFormat,
  });
  rememberExternalOutputs(
    { body: requestBody, user },
    imageUrls,
    provider,
    { kind: 'image', taskId: result.taskId },
  );
  return {
    ...result,
    remoteImageUrls,
    imageUrls,
  };
}

function startExternalImageJob(job) {
  setImmediate(async () => {
    try {
      const result = await runExternalImageGeneration(job.provider, job.body, job.user, {
        timeoutMs: EXTERNAL_IMAGE_BACKGROUND_TIMEOUT_MS,
      });
      job.updatedAt = Date.now();
      job.raw = result.raw || result;
      job.providerTaskId = result.taskId || job.providerTaskId || '';
      if (!result.ok) {
        if (completeJobFromServerOutputs(job)) return;
        if (result.taskId && (result.code === 'timeout' || result.code === 'empty_image')) {
          job.status = 'running';
          job.code = 'running';
          job.progress = '生成中';
          job.error = '';
          return;
        }
        if (['timeout', 'network_error', 'external_image_failed'].includes(result.code) || /fetch failed/i.test(String(result.error || ''))) {
          job.status = 'running';
          job.code = 'running';
          job.progress = '等待平台输出';
          job.lastError = result.error || result.code || 'fetch failed';
          job.error = '';
          return;
        }
        job.status = 'failed';
        job.code = result.code || 'failed';
        job.error = result.error || '扩展平台生图失败。';
        return;
      }
      job.status = 'completed';
      job.code = 'completed';
      job.progress = '100%';
      job.imageUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [];
      job.remoteImageUrls = Array.isArray(result.remoteImageUrls) ? result.remoteImageUrls : [];
      job.error = '';
    } catch (e) {
      job.updatedAt = Date.now();
      if (completeJobFromServerOutputs(job)) return;
      job.status = 'running';
      job.code = 'running';
      job.progress = '等待平台输出';
      job.lastError = e?.message || String(e);
      job.error = '';
      job.raw = { error: job.lastError };
    }
  });
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

router.post('/llm', requireNodePermission('llm'), async (req, res) => {
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

router.post('/image', requireNodePermission(['image', 'exhibition-img2img', 'exhibition-creative-image']), async (req, res) => {
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
    if (req.body?.async === true || req.body?.background === true) {
      const job = createExternalImageJob(resolved.provider, req.body || {}, req.user);
      startExternalImageJob(job);
      return sendLocalImageJobResponse(res, job);
    }
    const result = await runExternalImageGeneration(resolved.provider, req.body || {}, req.user);
    if (!result.ok) {
      if (result.taskId && (result.code === 'timeout' || result.code === 'empty_image')) {
        return runningImageResponse(res, result, resolved.provider);
      }
      return resultResponse(res, result, resolved.provider);
    }
    return resultResponse(res, result, resolved.provider, {
      remoteImageUrls: result.remoteImageUrls || [],
      imageUrls: result.imageUrls || [],
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      code: 'external_image_failed',
      error: e?.message || String(e),
    });
  }
});

router.get('/image/status/:taskId', requireNodePermission(['image', 'exhibition-img2img', 'exhibition-creative-image']), async (req, res) => {
  try {
    pruneExternalImageJobs();
    const taskId = String(req.params.taskId || '').trim();
    const localJob = externalImageJobs.get(taskId);
    if (localJob) {
      if (localJob.status === 'running' && completeJobFromServerOutputs(localJob)) {
        return sendLocalImageJobResponse(res, localJob);
      }
      if (
        localJob.status === 'running' &&
        localJob.lastError &&
        Date.now() > Number(localJob.fallbackUntil || 0)
      ) {
        localJob.status = 'failed';
        localJob.code = 'external_image_failed';
        localJob.error = `扩展平台请求失败，且等待输出目录后仍未发现新图片：${localJob.lastError}`;
        localJob.updatedAt = Date.now();
        return sendLocalImageJobResponse(res, localJob);
      }
      if (localJob.status !== 'running' || !localJob.providerTaskId) {
        return sendLocalImageJobResponse(res, localJob);
      }
      const providerResult = await queryImageTaskWithProvider(localJob.provider, localJob.providerTaskId, {
        timeoutMs: Number(req.query?.timeoutMs) || undefined,
        baseUrl: `http://127.0.0.1:${config.PORT}`,
        outputFormat: localJob.body?.outputFormat,
      });
      localJob.updatedAt = Date.now();
      localJob.raw = providerResult.raw || providerResult;
      if (!providerResult.ok) {
        if (completeJobFromServerOutputs(localJob)) {
          return sendLocalImageJobResponse(res, localJob);
        }
        if (providerResult.code === 'timeout' || providerResult.code === 'network_error') {
          localJob.lastError = providerResult.error || providerResult.code || localJob.lastError;
          return sendLocalImageJobResponse(res, localJob);
        }
        localJob.status = 'failed';
        localJob.code = providerResult.code || 'failed';
        localJob.error = providerResult.error || '扩展平台生图失败。';
        return sendLocalImageJobResponse(res, localJob);
      }
      if (providerResult.code !== 'completed') {
        localJob.progress = providerResult.progress || localJob.progress || '生成中';
        return sendLocalImageJobResponse(res, localJob);
      }
      const remoteImageUrls = Array.isArray(providerResult.imageUrls) ? providerResult.imageUrls : [];
      const imageUrls = await saveImageOutputs(remoteImageUrls, {
        outputFormat: localJob.body?.outputFormat,
      });
      rememberExternalOutputs(
        { body: localJob.body, user: localJob.user },
        imageUrls,
        localJob.provider,
        { kind: 'image', taskId: providerResult.taskId || localJob.providerTaskId },
      );
      localJob.status = 'completed';
      localJob.code = 'completed';
      localJob.progress = '100%';
      localJob.imageUrls = imageUrls;
      localJob.remoteImageUrls = remoteImageUrls;
      localJob.error = '';
      return sendLocalImageJobResponse(res, localJob);
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
    const result = await queryImageTaskWithProvider(resolved.provider, taskId, {
      timeoutMs: Number(req.query?.timeoutMs) || undefined,
      baseUrl: `http://127.0.0.1:${config.PORT}`,
      outputFormat: req.query?.outputFormat,
    });
    if (!result.ok) return resultResponse(res, result, resolved.provider);
    if (result.code !== 'completed') {
      return resultResponse(res, result, resolved.provider, {
        imageUrls: [],
        remoteImageUrls: [],
      });
    }
    const remoteImageUrls = Array.isArray(result.imageUrls) ? result.imageUrls : [];
    const imageUrls = await saveImageOutputs(remoteImageUrls, {
      outputFormat: req.query?.outputFormat,
    });
    rememberExternalOutputs(
      { ...req, body: { historyContext: parseHistoryContextQuery(req.query?.historyContext), prompt: req.query?.prompt, providerModel: req.query?.providerModel } },
      imageUrls,
      resolved.provider,
      { kind: 'image', taskId: result.taskId || taskId },
    );
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

router.post('/video', requireNodePermission('video'), async (req, res) => {
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
      timeoutMs: Number(req.body?.timeoutMs) || undefined,
      baseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    if (!result.ok) return resultResponse(res, result, resolved.provider);
    const remoteVideoUrls = Array.isArray(result.videoUrls) ? result.videoUrls : [];
    const videoUrls = await saveVideoOutputs(remoteVideoUrls);
    rememberExternalOutputs(req, videoUrls, resolved.provider, { kind: 'video', taskId: result.taskId });
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

module.exports = router;
