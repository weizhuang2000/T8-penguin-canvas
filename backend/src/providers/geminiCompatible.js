const { resolveMediaRef } = require('./mediaResolver');

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_IMAGE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1';

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
    return { ok: false, code: 'missing_api_key', error: '请先填写 Gemini API Key。' };
  }
  return { ok: true, baseUrl };
}

function selectedModel(requested, providerModels, fallback) {
  const fromList = Array.isArray(providerModels) ? providerModels.find((item) => String(item || '').trim()) : '';
  let model = String(requested || fromList || fallback || '').trim();
  if (!model) throw new Error('模型名称不能为空。');
  if (model.length > 240 || /[\x00-\x1f\x7f]/.test(model)) throw new Error('模型名称不合法。');
  if (model === 'gemini-2.5-flash-image-preview') model = 'gemini-2.5-flash-image';
  return model;
}

function modelEndpoint(provider, model, method = 'generateContent') {
  const defaults = provider?.defaults || {};
  const override = defaults.geminiEndpoint || defaults.endpoint || defaults.generateContentEndpoint;
  if (typeof override === 'string' && override.trim()) {
    const raw = override.trim();
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\{model\}/g, encodeURIComponent(model));
    return `${cleanBaseUrl(provider?.baseUrl)}${raw.startsWith('/') ? raw : `/${raw}`}`.replace(/\{model\}/g, encodeURIComponent(model));
  }
  return `${cleanBaseUrl(provider?.baseUrl)}/models/${encodeURIComponent(model)}:${method}`;
}

function bearerHeaders(provider) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-goog-api-key': provider.apiKey,
  };
  if (provider?.defaults?.authHeader === 'bearer') {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }
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
  return out.join('\n').trim();
}

function collectInlineImages(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    value.forEach((item) => collectInlineImages(item, out));
    return out;
  }
  if (typeof value !== 'object') return out;
  const inline = value.inlineData || value.inline_data;
  if (inline?.data) {
    const mime = inline.mimeType || inline.mime_type || 'image/png';
    out.push(`data:${mime};base64,${inline.data}`);
  }
  for (const key of ['parts', 'content', 'candidates', 'data', 'outputs', 'images']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) collectInlineImages(value[key], out);
  }
  return out;
}

function collectUrlImages(value, out = []) {
  if (!value) return out;
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^(https?:\/\/|data:image\/)/i.test(text)) out.push(text);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrlImages(item, out));
    return out;
  }
  if (typeof value !== 'object') return out;
  const direct = value.url || value.image_url || value.imageUrl || value.uri;
  if (direct) collectUrlImages(direct, out);
  for (const key of ['data', 'images', 'imageUrls', 'image_urls', 'outputs']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) collectUrlImages(value[key], out);
  }
  return out;
}

function extractImageUrls(raw) {
  return [...new Set([...collectInlineImages(raw), ...collectUrlImages(raw)])];
}

function normalizeAspectRatio(value) {
  const ratio = String(value || '').trim();
  if (!ratio || /^auto$/i.test(ratio)) return '1:1';
  return ratio;
}

function normalizeImageSize(value) {
  const text = String(value || '').trim().toUpperCase();
  if (['1K', '2K', '4K'].includes(text)) return text;
  if (/^\d+x\d+$/i.test(text)) return undefined;
  return '1K';
}

function supportsImageSize(model) {
  const text = String(model || '').toLowerCase();
  return text.includes('3.') || text.includes('pro');
}

function imageResponseFormatFromInput(input = {}, model = '') {
  const params = input.providerParams && typeof input.providerParams === 'object' ? input.providerParams : {};
  const aspectRatio = params.aspectRatio || params.aspect_ratio || input.aspect_ratio || input.aspectRatio;
  const imageSize = params.imageSize || params.image_size || input.image_size || input.imageSize;
  const image = {
    aspectRatio: normalizeAspectRatio(aspectRatio),
  };
  const normalizedSize = normalizeImageSize(imageSize);
  if (normalizedSize && supportsImageSize(model)) image.imageSize = normalizedSize;
  return { type: 'IMAGE', image };
}

async function resolveInlineImageParts(refs, options = {}) {
  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const value = typeof ref === 'string' ? ref : ref?.url || ref?.imageUrl || ref?.value;
    if (!value) continue;
    const resolved = await resolveMediaRef(value, {
      target: 'data-url',
      baseUrl: options.baseUrl,
    });
    const dataUrl = resolved.dataUrl || '';
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) continue;
    out.push({
      inlineData: {
        mimeType: match[1] || 'image/png',
        data: match[2] || '',
      },
    });
  }
  return out;
}

function generationConfig(input = {}, responseFormat) {
  const params = input.providerParams && typeof input.providerParams === 'object' ? input.providerParams : {};
  const config = {
    responseModalities: ['TEXT', 'IMAGE'],
    responseFormat,
  };
  if (params.temperature != null) config.temperature = Number(params.temperature);
  if (params.topP != null) config.topP = Number(params.topP);
  if (input.seed != null && Number(input.seed) > 0) config.seed = Math.floor(Number(input.seed));
  return config;
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
    model = selectedModel(input.model || input.providerModel, provider.imageModels, provider.defaults?.imageModel || 'gemini-2.5-flash-image-preview');
  } catch (e) {
    return { ok: false, code: 'invalid_model', providerId: provider.id, protocol: 'gemini-compatible', error: e.message };
  }

  let imageParts = [];
  try {
    imageParts = await resolveInlineImageParts(input.images || input.referenceImages || input.reference_images, {
      baseUrl: options.baseUrl,
    });
  } catch (e) {
    return { ok: false, code: 'invalid_reference', providerId: provider.id, protocol: 'gemini-compatible', error: e?.message || '参考图解析失败。' };
  }

  const responseFormat = imageResponseFormatFromInput(input, model);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          ...imageParts,
        ],
      },
    ],
    generationConfig: generationConfig(input, responseFormat),
  };

  try {
    const res = await fetchWithTimeout(modelEndpoint(provider, model), {
      method: 'POST',
      headers: bearerHeaders(provider),
      body: JSON.stringify(body),
      timeoutMs: options.timeoutMs || DEFAULT_IMAGE_TIMEOUT_MS,
      fetchImpl: options.fetchImpl,
    });
    const raw = await responseJson(res);
    if (!res.ok) {
      return {
        ok: false,
        code: 'http_error',
        providerId: provider.id,
        protocol: 'gemini-compatible',
        error: `Gemini 图像调用失败：HTTP ${res.status}${trimBodyForError(raw) ? ` ${trimBodyForError(raw)}` : ''}`,
        raw,
      };
    }
    const imageUrls = extractImageUrls(raw);
    if (!imageUrls.length) {
      return { ok: false, code: 'empty_image', providerId: provider.id, protocol: 'gemini-compatible', error: 'Gemini 图像接口没有返回图片。', raw };
    }
    return { ok: true, kind: 'image', code: 'completed', providerId: provider.id, protocol: 'gemini-compatible', model, imageUrls, raw };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'timeout' : 'network_error',
      providerId: provider.id,
      protocol: 'gemini-compatible',
      error: e?.name === 'AbortError' ? 'Gemini 图像调用超时。' : (e?.message || 'Gemini 图像调用失败。'),
    };
  }
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
    const res = await fetchWithTimeout(modelEndpoint(provider, model), {
      method: 'POST',
      headers: bearerHeaders(provider),
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
