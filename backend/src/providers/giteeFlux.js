const openaiCompatible = require('./openaiCompatible');

const DEFAULT_BASE_URL = 'https://ai.gitee.com/v1';
const DEFAULT_MODEL = 'flux-1-schnell';
const DEFAULT_MUSIC_MODEL = 'ACE-Step-v1-3.5B';
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1500;
const SUPPORTED_IMAGE_SIZES = new Set(['1024x1024', '1536x1536', '2048x2048']);

function cleanBaseUrl(value) {
  const base = String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return base || DEFAULT_BASE_URL;
}

function responseJson(res) {
  return res.text().then((text) => {
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { message: text }; }
  });
}

function taskIdFrom(raw) {
  return String(raw?.task_id || raw?.taskId || raw?.data?.task_id || raw?.data?.taskId || '').trim();
}

function taskStatus(raw) {
  if (typeof raw === 'string') return raw.trim().toUpperCase();
  return String(raw?.status || raw?.task_status || raw?.state || raw?.data?.status || raw?.data?.task_status || '').trim().toUpperCase();
}

function errorDetail(raw) {
  const candidates = [
    raw?.error?.message,
    raw?.detail?.message,
    raw?.message,
    raw?.msg,
    raw?.reason,
    raw?.error_description,
    raw?.data?.error?.message,
    raw?.data?.message,
  ];
  const value = candidates.find((item) => typeof item === 'string' && item.trim());
  if (value) return value.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (raw && typeof raw === 'object') {
    try { return JSON.stringify(raw).slice(0, 500); } catch { return ''; }
  }
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function normalizeImageSize(value) {
  const size = String(value || '').trim().toLowerCase().replace('*', 'x');
  return SUPPORTED_IMAGE_SIZES.has(size) ? size : '1024x1024';
}

function extractImages(raw) {
  const candidates = [raw, raw?.output, raw?.data, raw?.result, raw?.results, raw?.urls, raw?.images, raw?.image];
  const urls = [];
  for (const candidate of candidates) {
    for (const url of openaiCompatible.extractImageUrls(candidate)) {
      if (!urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}

function extractAudioUrls(raw) {
  const urls = [];
  const seenObjects = new Set();
  const add = (value) => {
    const url = String(value || '').trim();
    if (!url || urls.includes(url)) return;
    if (/^(?:https?:\/\/|data:audio\/|\/files\/output\/)/i.test(url)) urls.push(url);
  };
  const visit = (value, depth = 0) => {
    if (depth > 5 || value == null) return;
    if (typeof value === 'string') {
      add(value);
      return;
    }
    if (typeof value !== 'object' || seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const key of ['file_url', 'audio_url', 'audioUrl', 'url']) add(value[key]);
    for (const key of ['output', 'data', 'result', 'results', 'urls', 'audios', 'audio']) {
      visit(value[key], depth + 1);
    }
  };
  visit(raw);
  return urls;
}

function isDone(status) {
  return ['SUCCESS', 'SUCCEED', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'DONE', 'FINISHED'].includes(status);
}

function isFailed(status) {
  return ['FAILED', 'FAIL', 'FAILURE', 'ERROR', 'CANCELED', 'CANCELLED', 'TIMEOUT', 'REVOKED'].includes(status);
}

function validation(provider) {
  return openaiCompatible.validateProvider({
    ...provider,
    baseUrl: cleanBaseUrl(provider?.baseUrl),
  }, { apiKeyRequired: true });
}

async function queryImageTask(provider, taskId, options = {}) {
  const check = validation(provider);
  if (!check.ok) return { ...check, providerId: provider?.id, protocol: 'gitee-flux' };
  const id = String(taskId || '').trim();
  if (!id || id.length > 240 || /[\x00-\x1f\x7f]/.test(id)) {
    return { ok: false, code: 'missing_task_id', providerId: provider.id, protocol: 'gitee-flux', error: '缺少 Gitee Flux task_id。' };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${provider.apiKey}` };
  try {
    const statusRes = await openaiCompatible.fetchWithTimeout(`${check.baseUrl}/task/${encodeURIComponent(id)}/status`, {
      method: 'GET', headers, timeoutMs: options.pollTimeoutMs || options.timeoutMs || 120000, fetchImpl,
    });
    const statusRaw = await responseJson(statusRes);
    if (!statusRes.ok) return { ok: false, code: 'http_error', statusCode: statusRes.status, providerId: provider.id, protocol: 'gitee-flux', taskId: id, error: `Gitee Flux 状态查询失败：HTTP ${statusRes.status}`, raw: statusRaw };
    const status = taskStatus(statusRaw);
    if (isFailed(status)) return { ok: false, code: 'task_failed', providerId: provider.id, protocol: 'gitee-flux', taskId: id, error: `Gitee Flux 任务失败${errorDetail(statusRaw) ? `：${errorDetail(statusRaw)}` : ''}`, raw: statusRaw };
    if (!isDone(status)) return { ok: true, kind: 'image', code: 'running', providerId: provider.id, protocol: 'gitee-flux', taskId: id, status: status || 'WAITING', raw: statusRaw };

    const resultRes = await openaiCompatible.fetchWithTimeout(`${check.baseUrl}/task/${encodeURIComponent(id)}/get`, {
      method: 'GET', headers, timeoutMs: options.pollTimeoutMs || options.timeoutMs || 120000, fetchImpl,
    });
    const resultRaw = await responseJson(resultRes);
    if (!resultRes.ok) return { ok: false, code: 'http_error', statusCode: resultRes.status, providerId: provider.id, protocol: 'gitee-flux', taskId: id, error: `Gitee Flux 结果查询失败：HTTP ${resultRes.status}`, raw: resultRaw };
    const imageUrls = extractImages(resultRaw);
    if (!imageUrls.length) return { ok: false, code: 'empty_image', providerId: provider.id, protocol: 'gitee-flux', taskId: id, error: 'Gitee Flux 任务完成但未返回图片。', raw: resultRaw };
    return { ok: true, kind: 'image', code: 'completed', providerId: provider.id, protocol: 'gitee-flux', taskId: id, imageUrls, raw: resultRaw };
  } catch (e) {
    return { ok: false, code: e?.name === 'AbortError' ? 'timeout' : 'network_error', providerId: provider.id, protocol: 'gitee-flux', taskId: id, error: e?.message || 'Gitee Flux 状态查询失败' };
  }
}

async function generateImage(provider, input = {}, options = {}) {
  const check = validation(provider);
  if (!check.ok) return { ...check, providerId: provider?.id, protocol: 'gitee-flux' };
  const prompt = String(input.prompt || '').trim();
  if (!prompt) return { ok: false, code: 'missing_prompt', providerId: provider.id, protocol: 'gitee-flux', error: '请输入图像提示词。' };
  const model = String(input.model || input.providerModel || provider.defaults?.imageModel || provider.imageModels?.[0] || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const payload = {
    model,
    prompt: prompt.slice(0, 2000),
    size: normalizeImageSize(input.size || provider.defaults?.size),
    n: Math.max(1, Math.min(1, Number(input.n) || 1)),
    response_format: String(input.response_format || provider.defaults?.responseFormat || 'url') === 'b64_json' ? 'b64_json' : 'url',
  };
  if (input.user) payload.user = String(input.user).slice(0, 200);
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(DEFAULT_TIMEOUT_MS, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const pollIntervalMs = Math.max(300, Number(options.pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  let activeTaskId = '';
  try {
    const submit = await openaiCompatible.fetchWithTimeout(`${check.baseUrl}/async/images/generations`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(payload), timeoutMs: options.submitTimeoutMs || 120000, fetchImpl,
    });
    const raw = await responseJson(submit);
    if (!submit.ok) return { ok: false, code: 'http_error', statusCode: submit.status, providerId: provider.id, protocol: 'gitee-flux', error: `Gitee Flux 提交失败：HTTP ${submit.status}（model=${model}, size=${payload.size}）${errorDetail(raw) ? ` ${errorDetail(raw)}` : ''}`, raw };
    activeTaskId = taskIdFrom(raw);
    if (!activeTaskId) {
      const imageUrls = extractImages(raw);
      return imageUrls.length
        ? { ok: true, kind: 'image', code: 'completed', providerId: provider.id, protocol: 'gitee-flux', model, imageUrls, raw }
        : { ok: false, code: 'missing_task_id', providerId: provider.id, protocol: 'gitee-flux', error: 'Gitee Flux 未返回 task_id。', raw };
    }
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const result = await queryImageTask(provider, activeTaskId, { ...options, fetchImpl });
      if (result.ok && result.imageUrls?.length) return { ...result, model };
      if (!result.ok && !['timeout', 'network_error', 'http_error'].includes(result.code)) return { ...result, model };
    }
    return { ok: false, code: 'timeout', providerId: provider.id, protocol: 'gitee-flux', model, taskId: activeTaskId, error: 'Gitee Flux 生图任务超时。' };
  } catch (e) {
    return { ok: false, code: e?.name === 'AbortError' ? 'timeout' : 'network_error', providerId: provider.id, protocol: 'gitee-flux', model, taskId: activeTaskId, error: e?.message || 'Gitee Flux 生图失败' };
  }
}

async function queryMusicTask(provider, taskId, options = {}) {
  const check = validation(provider);
  if (!check.ok) return { ...check, providerId: provider?.id, protocol: 'gitee-flux' };
  const id = String(taskId || '').trim();
  if (!id || id.length > 240 || /[\x00-\x1f\x7f]/.test(id)) {
    return { ok: false, code: 'missing_task_id', providerId: provider.id, protocol: 'gitee-flux', error: '缺少 Gitee ACE-Step task_id。' };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${provider.apiKey}` };
  try {
    const response = await openaiCompatible.fetchWithTimeout(`${check.baseUrl}/task/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers,
      timeoutMs: options.pollTimeoutMs || options.timeoutMs || 120000,
      fetchImpl,
    });
    const raw = await responseJson(response);
    if (!response.ok) {
      return {
        ok: false,
        code: 'http_error',
        statusCode: response.status,
        providerId: provider.id,
        protocol: 'gitee-flux',
        taskId: id,
        error: `Gitee ACE-Step 任务查询失败：HTTP ${response.status}${errorDetail(raw) ? ` ${errorDetail(raw)}` : ''}`,
        raw,
      };
    }
    const status = taskStatus(raw);
    if (isFailed(status)) {
      return {
        ok: false,
        code: 'task_failed',
        providerId: provider.id,
        protocol: 'gitee-flux',
        taskId: id,
        error: `Gitee ACE-Step 任务失败${errorDetail(raw) ? `：${errorDetail(raw)}` : ''}`,
        raw,
      };
    }
    if (!isDone(status)) {
      return { ok: true, kind: 'audio', code: 'running', providerId: provider.id, protocol: 'gitee-flux', taskId: id, status: status || 'WAITING', audioUrls: [], raw };
    }
    const audioUrls = extractAudioUrls(raw);
    if (!audioUrls.length) {
      return { ok: false, code: 'empty_audio', providerId: provider.id, protocol: 'gitee-flux', taskId: id, error: 'Gitee ACE-Step 任务完成但未返回音频文件。', raw };
    }
    return { ok: true, kind: 'audio', code: 'completed', providerId: provider.id, protocol: 'gitee-flux', taskId: id, status, audioUrls, raw };
  } catch (e) {
    return { ok: false, code: e?.name === 'AbortError' ? 'timeout' : 'network_error', providerId: provider.id, protocol: 'gitee-flux', taskId: id, error: e?.message || 'Gitee ACE-Step 任务查询失败。' };
  }
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

async function generateMusic(provider, input = {}, options = {}) {
  const check = validation(provider);
  if (!check.ok) return { ...check, providerId: provider?.id, protocol: 'gitee-flux' };
  const prompt = String(input.prompt || '').trim();
  const lyrics = String(input.lyrics || '').trim();
  if (!prompt && !lyrics) {
    return { ok: false, code: 'missing_prompt', providerId: provider.id, protocol: 'gitee-flux', error: '请填写英文音乐风格提示词或歌词。' };
  }

  const model = String(input.model || input.providerModel || DEFAULT_MUSIC_MODEL).trim() || DEFAULT_MUSIC_MODEL;
  const loraName = input.lora_name === 'ACE-Step-v1-chinese-rap-LoRA' ? input.lora_name : 'None';
  const schedulerType = input.scheduler_type === 'heun' ? 'heun' : 'euler';
  const cfgType = ['cfg', 'apg', 'cfg_star'].includes(input.cfg_type) ? input.cfg_type : 'apg';
  const payload = {
    model,
    task: 'text2music',
    duration: clampNumber(input.duration, 60, 30, 240),
    reference_audio_strength: clampNumber(input.reference_audio_strength, 0.3, 0, 1),
    lora_name: loraName,
    prompt: prompt.slice(0, 4000),
    lyrics: lyrics.slice(0, 16000),
    infer_steps: Math.round(clampNumber(input.infer_steps, 60, 1, 60)),
    guidance_scale: clampNumber(input.guidance_scale, 15, 0, 200),
    guidance_scale_text: clampNumber(input.guidance_scale_text, 0, 0, 200),
    guidance_scale_lyric: clampNumber(input.guidance_scale_lyric, 0, 0, 200),
    scheduler_type: schedulerType,
    cfg_type: cfgType,
    omega_scale: clampNumber(input.omega_scale, 10, -100, 100),
    guidance_interval: clampNumber(input.guidance_interval, 0.5, 0, 1),
    guidance_interval_decay: clampNumber(input.guidance_interval_decay, 0, 0, 1),
    min_guidance_scale: clampNumber(input.min_guidance_scale, 3, 0, 200),
    use_erg_tag: input.use_erg_tag !== false,
    use_erg_lyric: input.use_erg_lyric !== false,
    use_erg_diffusion: input.use_erg_diffusion !== false,
  };
  const seeds = (Array.isArray(input.seeds) ? input.seeds : [input.seed])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .slice(0, 8);
  if (seeds.length) payload.seeds = seeds;

  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(DEFAULT_TIMEOUT_MS, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const pollIntervalMs = Math.max(300, Number(options.pollIntervalMs) || 5000);
  const deadline = Date.now() + timeoutMs;
  let activeTaskId = '';
  try {
    const submit = await openaiCompatible.fetchWithTimeout(`${check.baseUrl}/async/music/generations`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(payload),
      timeoutMs: options.submitTimeoutMs || 120000,
      fetchImpl,
    });
    const raw = await responseJson(submit);
    if (!submit.ok) {
      return { ok: false, code: 'http_error', statusCode: submit.status, providerId: provider.id, protocol: 'gitee-flux', model, error: `Gitee ACE-Step 提交失败：HTTP ${submit.status}${errorDetail(raw) ? ` ${errorDetail(raw)}` : ''}`, raw };
    }
    activeTaskId = taskIdFrom(raw);
    if (!activeTaskId) {
      const audioUrls = extractAudioUrls(raw);
      return audioUrls.length
        ? { ok: true, kind: 'audio', code: 'completed', providerId: provider.id, protocol: 'gitee-flux', model, audioUrls, raw }
        : { ok: false, code: 'missing_task_id', providerId: provider.id, protocol: 'gitee-flux', model, error: 'Gitee ACE-Step 未返回 task_id。', raw };
    }
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const result = await queryMusicTask(provider, activeTaskId, { ...options, fetchImpl });
      if (result.ok && result.audioUrls?.length) return { ...result, model };
      if (!result.ok && !['timeout', 'network_error', 'http_error', 'empty_audio'].includes(result.code)) return { ...result, model };
    }
    return { ok: false, code: 'timeout', providerId: provider.id, protocol: 'gitee-flux', model, taskId: activeTaskId, error: 'Gitee ACE-Step 音乐生成任务超时。' };
  } catch (e) {
    return { ok: false, code: e?.name === 'AbortError' ? 'timeout' : 'network_error', providerId: provider.id, protocol: 'gitee-flux', model, taskId: activeTaskId, error: e?.message || 'Gitee ACE-Step 音乐生成失败。' };
  }
}

async function testProvider(provider, options = {}) {
  const result = await openaiCompatible.testProvider({ ...provider, baseUrl: cleanBaseUrl(provider?.baseUrl) }, options);
  return { ...result, providerId: provider?.id, protocol: 'gitee-flux' };
}

module.exports = { generateImage, generateMusic, normalizeImageSize, queryImageTask, queryMusicTask, testProvider };
