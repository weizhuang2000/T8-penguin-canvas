const openaiCompatible = require('./openaiCompatible');

const DEFAULT_BASE_URL = 'https://ai.gitee.com/v1';
const DEFAULT_MODEL = 'flux-1-schnell';
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1500;

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
  const value = raw?.error?.message || raw?.error || raw?.message || raw?.detail || raw?.data?.error || raw?.data?.message;
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
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
    size: String(input.size || provider.defaults?.size || '1024x1024'),
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
    if (!submit.ok) return { ok: false, code: 'http_error', statusCode: submit.status, providerId: provider.id, protocol: 'gitee-flux', error: `Gitee Flux 提交失败：HTTP ${submit.status}${errorDetail(raw) ? ` ${errorDetail(raw)}` : ''}`, raw };
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

async function testProvider(provider, options = {}) {
  const result = await openaiCompatible.testProvider({ ...provider, baseUrl: cleanBaseUrl(provider?.baseUrl) }, options);
  return { ...result, providerId: provider?.id, protocol: 'gitee-flux' };
}

module.exports = { generateImage, queryImageTask, testProvider };
