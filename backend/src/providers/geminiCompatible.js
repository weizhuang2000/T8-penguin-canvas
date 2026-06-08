const { resolveMediaRef } = require('./mediaResolver');

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_IMAGE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BASE_URL = 'https://ai.t8star.org/v1';
const DEFAULT_IMAGE_MODEL = 'nano-banana-2';

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

function hasApiKey(provider) {
  return typeof provider?.apiKey === 'string' && provider.apiKey.trim().length > 0;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl || fetch;
  const { timeoutMs, fetchImpl: _fetchImpl, ...fetchOptions } = options;
  try {
    return await fetchImpl(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function validateProvider(provider, { apiKeyRequired = true } = {}) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl);
  if (apiKeyRequired && !hasApiKey(provider)) {
    return { ok: false, code: 'missing_api_key', error: '请先填写 Gemini / 香蕉兼容 API Key。' };
  }
  return { ok: true, baseUrl };
}

function selectedModel(requested, providerModels, fallback) {
  const fromList = Array.isArray(providerModels) ? providerModels.find((item) => String(item || '').trim()) : '';
  let model = String(requested || fromList || fallback || '').trim();
  if (!model) throw new Error('模型名称不能为空。');
  if (model.length > 240 || /[\x00-\x1f\x7f]/.test(model)) throw new Error('模型名称不合法。');
  if (model === 'gemini-2.5-flash-image-preview') model = 'nano-banana-2';
  return model;
}

function shouldRetryAsBanana(model) {
  const text = String(model || '').toLowerCase();
  return text.includes('gemini') && text !== DEFAULT_IMAGE_MODEL;
}

function imageBaseUrl(provider) {
  const defaults = provider?.defaults || {};
  const override = defaults.imageBaseUrl || defaults.image_base_url;
  const base = cleanBaseUrl(override || provider?.baseUrl || DEFAULT_BASE_URL);
  if (/\/images$/i.test(base)) return base;
  return `${base}/images`;
}

function generationUrl(provider) {
  const defaults = provider?.defaults || {};
  const override = defaults.imageGenerationEndpoint || defaults.image_generation_endpoint;
  if (typeof override === 'string' && override.trim()) {
    const raw = override.trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${cleanBaseUrl(provider?.baseUrl)}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }
  return `${imageBaseUrl(provider)}/generations?async=true`;
}

function editUrl(provider) {
  const defaults = provider?.defaults || {};
  const override = defaults.imageEditEndpoint || defaults.image_edit_endpoint;
  if (typeof override === 'string' && override.trim()) {
    const raw = override.trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${cleanBaseUrl(provider?.baseUrl)}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }
  return `${imageBaseUrl(provider)}/edits?async=true`;
}

function bearerHeaders(provider, json = true) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function responseJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function trimBodyForError(value) {
  const message = value?.error?.message || value?.message || value?.error || value;
  return String(message || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function firstText(raw) {
  const candidates = raw?.candidates || raw?.data?.candidates || [];
  const out = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    for (const part of candidate?.content?.parts || []) {
      if (typeof part?.text === 'string' && part.text.trim()) out.push(part.text.trim());
    }
  }
  const choice = Array.isArray(raw?.choices) ? raw.choices[0] : null;
  const choiceText = choice?.message?.content || choice?.text;
  if (choiceText) out.push(String(choiceText).trim());
  return out.filter(Boolean).join('\n').trim();
}

function collectImageUrls(value, out = []) {
  if (!value) return out;
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^(https?:\/\/|data:image\/)/i.test(text)) out.push(text);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, out));
    return out;
  }
  if (typeof value !== 'object') return out;

  const inline = value.inlineData || value.inline_data;
  if (inline?.data) {
    const mime = inline.mimeType || inline.mime_type || 'image/png';
    out.push(`data:${mime};base64,${inline.data}`);
  }

  const mime = value.mime_type || value.mime || value.content_type || 'image/png';
  const direct = value.url || value.image_url || value.imageUrl || value.uri || value.value;
  if (direct) collectImageUrls(direct, out);
  if (value.b64_json || value.base64 || value.image_base64) {
    const b64 = value.b64_json || value.base64 || value.image_base64;
    out.push(/^data:image\//i.test(String(b64)) ? String(b64) : `data:${mime};base64,${b64}`);
  }
  for (const key of ['data', 'images', 'image', 'image_urls', 'imageUrls', 'output', 'outputs', 'results', 'parts', 'content', 'candidates']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) collectImageUrls(value[key], out);
  }
  return out;
}

function extractImageUrls(raw) {
  return [...new Set(collectImageUrls(raw))];
}

function extractTaskId(raw) {
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : {};
  return String(
    raw?.task_id || raw?.taskId || raw?.id ||
    data?.task_id || data?.taskId || data?.id ||
    (typeof raw?.data === 'string' ? raw.data : '') ||
    '',
  ).trim();
}

function imageStatus(raw) {
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : {};
  return String(raw?.status || raw?.state || data?.status || data?.state || data?.task_status || '').toLowerCase();
}

function isFailure(raw) {
  const status = imageStatus(raw);
  return ['failure', 'failed', 'error', 'cancelled', 'canceled'].includes(status) ||
    raw?.error || raw?.code === 'error' || raw?.success === false;
}

function isSuccess(raw) {
  const status = imageStatus(raw);
  return ['success', 'completed', 'complete', 'done', 'finished'].includes(status);
}

function imageError(raw) {
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : {};
  return trimBodyForError(raw?.error?.message || raw?.error || raw?.message || data?.error || data?.message || data?.fail_reason || '');
}

function normalizeAspectRatio(value) {
  const ratio = String(value || '').trim();
  if (!ratio || /^auto$/i.test(ratio)) return '1:1';
  return ratio;
}

function normalizeImageSize(value) {
  const text = String(value || '').trim().toUpperCase();
  if (['1K', '2K', '4K'].includes(text)) return text;
  return '2K';
}

async function resolveReferenceImageFiles(refs, options = {}) {
  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const value = typeof ref === 'string' ? ref : ref?.url || ref?.imageUrl || ref?.value;
    if (!value) continue;

    const dataMatch = String(value).trim().match(/^data:([^;,]+);base64,(.+)$/i);
    if (dataMatch) {
      const mime = dataMatch[1] || 'image/png';
      out.push({
        buffer: Buffer.from(dataMatch[2] || '', 'base64'),
        mime,
        ext: (mime.split('/')[1] || 'png').replace('jpeg', 'jpg'),
      });
      continue;
    }

    const local = await resolveMediaRef(value, {
      target: 'local-path',
      baseUrl: options.baseUrl,
    }).catch(() => null);
    if (local?.path) {
      const fs = require('fs');
      const path = require('path');
      const mime = local.mime || 'image/png';
      out.push({
        buffer: fs.readFileSync(local.path),
        mime,
        ext: (path.extname(local.path).replace(/^\./, '') || mime.split('/')[1] || 'png').replace('jpeg', 'jpg'),
      });
      continue;
    }

    const remote = await resolveMediaRef(value, {
      target: 'url',
      baseUrl: options.baseUrl,
    });
    const res = await fetchWithTimeout(remote.url || value, {
      method: 'GET',
      timeoutMs: options.timeoutMs || DEFAULT_IMAGE_TIMEOUT_MS,
      fetchImpl: options.fetchImpl,
    });
    if (!res.ok) throw new Error(`参考图下载失败：HTTP ${res.status}`);
    const mime = res.headers?.get?.('content-type') || 'image/png';
    out.push({
      buffer: Buffer.from(await res.arrayBuffer()),
      mime,
      ext: (mime.split('/')[1] || 'png').replace('jpeg', 'jpg'),
    });
  }
  return out;
}

async function submitBananaLikeImage(provider, input, model, options = {}) {
  const prompt = String(input.prompt || '').trim();
  const aspectRatio = normalizeAspectRatio(input.aspect_ratio || input.aspectRatio || input.providerParams?.aspect_ratio || input.providerParams?.aspectRatio);
  const imageSize = normalizeImageSize(input.image_size || input.imageSize || input.providerParams?.image_size || input.providerParams?.imageSize);
  const refs = await resolveReferenceImageFiles(input.images || input.referenceImages || input.reference_images, {
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });

  if (refs.length) {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('model', model);
    form.append('aspect_ratio', aspectRatio);
    form.append('image_size', imageSize);
    if (input.seed != null && Number(input.seed) > 0) form.append('seed', String(Math.floor(Number(input.seed))));
    if (input.n != null) form.append('n', String(Number(input.n)));
    refs.forEach((ref, index) => {
      form.append('image', new Blob([ref.buffer], { type: ref.mime }), `image_${index}.${ref.ext}`);
    });
    return fetchWithTimeout(editUrl(provider), {
      method: 'POST',
      headers: bearerHeaders(provider, false),
      body: form,
      timeoutMs: options.timeoutMs || DEFAULT_IMAGE_TIMEOUT_MS,
      fetchImpl: options.fetchImpl,
    });
  }

  const body = {
    prompt,
    model,
    aspect_ratio: aspectRatio,
    image_size: imageSize,
  };
  if (input.seed != null && Number(input.seed) > 0) body.seed = Math.floor(Number(input.seed));
  if (input.n != null) body.n = Number(input.n);
  return fetchWithTimeout(generationUrl(provider), {
    method: 'POST',
    headers: bearerHeaders(provider, true),
    body: JSON.stringify(body),
    timeoutMs: options.timeoutMs || DEFAULT_IMAGE_TIMEOUT_MS,
    fetchImpl: options.fetchImpl,
  });
}

async function pollImageTask(provider, taskId, options = {}) {
  const maxRetries = Math.max(1, Math.min(1800, Number(options.maxPolls) || 1800));
  const interval = Math.max(200, Math.min(10000, Number(options.pollIntervalMs) || 2000));
  const taskUrl = `${imageBaseUrl(provider)}/tasks/${encodeURIComponent(taskId)}`;
  let lastRaw = null;
  for (let i = 0; i < maxRetries; i += 1) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, interval));
    const res = await fetchWithTimeout(taskUrl, {
      method: 'GET',
      headers: bearerHeaders(provider, false),
      timeoutMs: options.timeoutMs || DEFAULT_IMAGE_TIMEOUT_MS,
      fetchImpl: options.fetchImpl,
    });
    const raw = await responseJson(res);
    lastRaw = raw;
    if (!res.ok) throw new Error(`任务查询失败：HTTP ${res.status}${trimBodyForError(raw) ? ` ${trimBodyForError(raw)}` : ''}`);
    if (isFailure(raw)) throw new Error(imageError(raw) || '图像任务失败');
    const imageUrls = extractImageUrls(raw);
    if (isSuccess(raw) || imageUrls.length) return { imageUrls, raw };
  }
  throw new Error(`图像任务轮询超时：${taskId}${lastRaw ? ` ${trimBodyForError(lastRaw)}` : ''}`);
}

async function generateImage(provider, input = {}, options = {}) {
  const validation = validateProvider(provider, { apiKeyRequired: true });
  if (!validation.ok) return { ...validation, providerId: provider?.id, protocol: 'gemini-compatible' };

  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    return { ok: false, code: 'missing_prompt', providerId: provider.id, protocol: 'gemini-compatible', error: '请输入图像提示词。' };
  }

  let model;
  try {
    model = selectedModel(input.model || input.providerModel, provider.imageModels, provider.defaults?.imageModel || DEFAULT_IMAGE_MODEL);
  } catch (e) {
    return { ok: false, code: 'invalid_model', providerId: provider.id, protocol: 'gemini-compatible', error: e.message };
  }

  let raw;
  let finalModel = model;
  try {
    let res = await submitBananaLikeImage(provider, input, model, options);
    raw = await responseJson(res);
    if (!res.ok && Number(res.status) === 400 && shouldRetryAsBanana(model)) {
      finalModel = DEFAULT_IMAGE_MODEL;
      res = await submitBananaLikeImage(provider, input, finalModel, options);
      raw = await responseJson(res);
    }
    if (!res.ok) {
      return {
        ok: false,
        code: 'http_error',
        providerId: provider.id,
        protocol: 'gemini-compatible',
        error: `Gemini/香蕉兼容图像调用失败：HTTP ${res.status}${trimBodyForError(raw) ? ` ${trimBodyForError(raw)}` : ''}`,
        raw,
      };
    }
    if (isFailure(raw)) {
      return { ok: false, code: 'task_failed', providerId: provider.id, protocol: 'gemini-compatible', model: finalModel, error: imageError(raw) || '图像任务失败', raw };
    }
    let imageUrls = extractImageUrls(raw);
    const taskId = extractTaskId(raw);
    if (!imageUrls.length && taskId) {
      const polled = await pollImageTask(provider, taskId, options);
      imageUrls = polled.imageUrls;
      raw = { submit: raw, task: polled.raw };
    }
    if (!imageUrls.length) {
      return { ok: false, code: 'empty_image', providerId: provider.id, protocol: 'gemini-compatible', model: finalModel, taskId, error: 'Gemini/香蕉兼容图像接口没有返回图片。', raw };
    }
    return { ok: true, kind: 'image', code: 'completed', providerId: provider.id, protocol: 'gemini-compatible', model: finalModel, taskId, imageUrls, raw };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerId: provider.id,
      protocol: 'gemini-compatible',
      model: finalModel,
      error: e?.name === 'AbortError' ? 'Gemini/香蕉兼容图像调用超时。' : (e?.message || 'Gemini/香蕉兼容图像调用失败。'),
      raw,
    };
  }
}

function chatEndpoint(provider, model) {
  const defaults = provider?.defaults || {};
  const override = defaults.geminiEndpoint || defaults.chatEndpoint || defaults.chat_endpoint;
  if (typeof override === 'string' && override.trim()) {
    const raw = override.trim();
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\{model\}/g, encodeURIComponent(model));
    return `${cleanBaseUrl(provider?.baseUrl)}${raw.startsWith('/') ? raw : `/${raw}`}`.replace(/\{model\}/g, encodeURIComponent(model));
  }
  return `${cleanBaseUrl(provider?.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`;
}

async function generateChat(provider, input = {}, options = {}) {
  const validation = validateProvider(provider, { apiKeyRequired: true });
  if (!validation.ok) return { ...validation, providerId: provider?.id, protocol: 'gemini-compatible' };

  let model;
  try {
    model = selectedModel(input.model || input.providerModel, provider.chatModels, provider.defaults?.chatModel || 'gemini-2.5-flash');
  } catch (e) {
    return { ok: false, code: 'invalid_model', providerId: provider.id, protocol: 'gemini-compatible', error: e.message };
  }

  const prompt = String(input.prompt || '').trim();
  const messages = Array.isArray(input.messages) && input.messages.length
    ? input.messages
    : [{ role: 'user', content: prompt }];
  const contents = messages
    .map((message) => ({
      role: message?.role === 'assistant' || message?.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(message?.content || '').trim() }],
    }))
    .filter((item) => item.parts[0].text);
  if (!contents.length) {
    return { ok: false, code: 'missing_prompt', providerId: provider.id, protocol: 'gemini-compatible', error: '请输入要发送给 Gemini 的内容。' };
  }

  const body = { contents };
  if (input.temperature != null || input.maxTokens != null || input.max_tokens != null) {
    body.generationConfig = {};
    if (input.temperature != null) body.generationConfig.temperature = Number(input.temperature);
    if (input.maxTokens != null) body.generationConfig.maxOutputTokens = Number(input.maxTokens);
    if (input.max_tokens != null) body.generationConfig.maxOutputTokens = Number(input.max_tokens);
  }

  try {
    const res = await fetchWithTimeout(chatEndpoint(provider, model), {
      method: 'POST',
      headers: bearerHeaders(provider, true),
      body: JSON.stringify(body),
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
    const raw = await responseJson(res);
    if (!res.ok) {
      return {
        ok: false,
        code: 'http_error',
        providerId: provider.id,
        protocol: 'gemini-compatible',
        error: `Gemini LLM 调用失败：HTTP ${res.status}${trimBodyForError(raw) ? ` ${trimBodyForError(raw)}` : ''}`,
        raw,
      };
    }
    const text = firstText(raw);
    if (!text) {
      return { ok: false, code: 'empty_text', providerId: provider.id, protocol: 'gemini-compatible', error: 'Gemini LLM 没有返回文本。', raw };
    }
    return { ok: true, kind: 'llm', code: 'completed', providerId: provider.id, protocol: 'gemini-compatible', model, text, raw };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerId: provider.id,
      protocol: 'gemini-compatible',
      error: e?.name === 'AbortError' ? 'Gemini LLM 调用超时。' : (e?.message || 'Gemini LLM 调用失败。'),
    };
  }
}

async function testProvider(provider, options = {}) {
  const validation = validateProvider(provider, { apiKeyRequired: true });
  if (!validation.ok) return { ...validation, providerId: provider?.id, protocol: 'gemini-compatible' };
  const result = await generateChat(provider, { prompt: 'ping', model: provider?.chatModels?.[0] || provider?.defaults?.chatModel || 'gemini-2.5-flash' }, options);
  if (!result.ok) return result;
  return {
    ok: true,
    code: 'ok',
    providerId: provider.id,
    protocol: 'gemini-compatible',
    message: 'Gemini 连接可用。',
    raw: result.raw,
  };
}

module.exports = {
  generateChat,
  generateImage,
  testProvider,
};
