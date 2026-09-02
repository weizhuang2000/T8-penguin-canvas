'use strict';

const config = require('../config');
const settingsRouter = require('../routes/settings');
const { resolveLlmApiRoot, resolveLlmChatCompletionsUrl, resolveLlmResponsesUrl } = require('../utils/llmBaseUrl');
const { normalizeLlmMessageMedia } = require('./llmMedia');
const { generateImage } = require('./openaiCompatible');
const { writeImageOutput } = require('../utils/imageOutput');

const DEFAULT_TIMEOUT_MS = 180 * 1000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_AGENT_IMAGE_BYTES = 50 * 1024 * 1024;

function loadRawSettings() {
  try {
    return settingsRouter.loadSettings({ persistMigrations: false });
  } catch {
    return null;
  }
}

function zhenzhenBaseUrl(settings) {
  const normalized = typeof settingsRouter.normalizeZhenzhenBaseUrl === 'function'
    ? settingsRouter.normalizeZhenzhenBaseUrl(settings?.zhenzhenBaseUrl)
    : '';
  return normalized || config.ZHENZHEN_BASE_URL;
}

function resolveLlmConfig(settings, keyId = '') {
  if (!settings) return null;
  const configs = settingsRouter.normalizeLlmConfigs(
    settings.llmConfigs || settings.llmApiKeys,
    settings.llmConfigs || settings.llmApiKeys,
    { apiKey: settings.llmApiKey, baseUrl: settings.llmBaseUrl, model: settings.llmModel },
  );
  const requestedId = String(keyId || '').trim();
  const selected = requestedId
    ? configs.find((item) => item.id === requestedId)
    : (configs.find((item) => item.isDefault) || configs[0]);
  if (requestedId && !selected) return { error: '选择的 LLM 配置不存在或已被删除' };
  const apiKey = selected?.apiKey || settings.llmApiKey || '';
  if (!apiKey) return { error: '未配置 LLM 独立 API Key' };
  return {
    apiKey,
    baseUrl: selected?.baseUrl || settings.llmBaseUrl,
    model: selected?.model || settings.llmModel,
    keyId: selected?.id || 'default',
    label: selected?.label || '默认 LLM',
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
    }, { once: true });
  });
}

function combinedSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(externalSignal?.reason || new Error('请求已取消'));
  if (externalSignal?.aborted) onAbort();
  else externalSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`LLM 请求超过 ${Math.round(timeoutMs / 1000)} 秒`));
  }, timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', onAbort);
    },
  };
}

function extractResponse(data) {
  const choice = data?.choices?.[0];
  let content = choice?.message?.content || '';
  const imageUrls = [];
  if (Array.isArray(content)) {
    let text = '';
    for (const part of content) {
      if (part?.type === 'text') text += part.text || '';
      else if ((part?.type === 'image_url' || part?.type === 'image') && part.image_url?.url) imageUrls.push(part.image_url.url);
    }
    content = text;
  }
  if (Array.isArray(data?.data)) {
    for (const item of data.data) {
      if (item?.url) imageUrls.push(item.url);
      else if (item?.b64_json) imageUrls.push(`data:image/png;base64,${item.b64_json}`);
    }
  }
  return { content: String(content || ''), imageUrls };
}

function safePreview(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function generateConfiguredLlm(options = {}) {
  const settings = options.settings || loadRawSettings();
  const selected = resolveLlmConfig(settings, options.llmKeyId);
  if (!selected || selected.error) throw new Error(selected?.error || '未配置 LLM 独立 API Key');
  const model = String(options.model || selected.model || '').trim();
  if (!model) throw new Error('LLM 独立配置缺少模型名称');
  if (!Array.isArray(options.messages)) throw new Error('messages 必须是数组');

  const normalizedMessages = await normalizeLlmMessageMedia(options.messages, {
    llmVideoMode: options.llmVideoMode || 'frames',
    videoFrameCount: options.videoFrameCount || 8,
  }, { baseUrl: `http://127.0.0.1:${config.PORT}` });
  const upstream = resolveLlmChatCompletionsUrl(selected.baseUrl, zhenzhenBaseUrl(settings));
  const payload = {
    model,
    messages: normalizedMessages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? options.max_tokens ?? 4096,
    stream: false,
  };
  const retries = Math.max(0, Math.min(2, Number(options.retries ?? 2)));
  const timeoutMs = Math.max(10_000, Math.min(10 * 60_000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options.signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    const active = combinedSignal(options.signal, timeoutMs);
    try {
      const response = await fetch(upstream, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${selected.apiKey}` },
        body: JSON.stringify(payload),
        signal: active.signal,
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        const error = new Error(`LLM 上游返回非 JSON：HTTP ${response.status}。响应片段：${safePreview(text)}`);
        error.status = response.status;
        throw error;
      }
      if (!response.ok) {
        const error = new Error(data?.error?.message || data?.message || `LLM 上游 HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return { ...extractResponse(data), raw: data, model, llmKeyId: selected.keyId, llmLabel: selected.label };
    } catch (error) {
      if (options.signal?.aborted || (error?.name === 'AbortError' && !active.didTimeout())) {
        throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
      }
      lastError = active.didTimeout()
        ? Object.assign(new Error(`LLM 请求超过 ${Math.round(timeoutMs / 1000)} 秒`), { status: 408 })
        : error;
      const retryable = RETRYABLE_STATUSES.has(Number(lastError?.status)) || /fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(String(lastError?.message || ''));
      if (!retryable || attempt >= retries) break;
      await sleep(attempt === 0 ? 1000 : 3000, options.signal);
    } finally {
      active.dispose();
    }
  }
  throw lastError || new Error('LLM 请求失败');
}

async function generateConfiguredImage(options = {}) {
  const settings = options.settings || loadRawSettings();
  const selected = resolveLlmConfig(settings, options.llmKeyId);
  if (!selected || selected.error) throw new Error(selected?.error || '未配置 LLM 独立 API Key');
  const model = String(selected.model || '').trim();
  if (!model) throw new Error('LLM 独立配置缺少模型名称');
  const prompt = String(options.prompt || '').trim();
  if (!prompt) throw new Error('生图提示词不能为空');

  const provider = {
    id: `llm-config-${selected.keyId}`,
    label: selected.label,
    protocol: 'openai-compatible',
    enabled: true,
    apiKey: selected.apiKey,
    baseUrl: resolveLlmApiRoot(selected.baseUrl, zhenzhenBaseUrl(settings)),
    imageModels: [model],
    defaults: { imageModel: model },
  };
  const result = await generateImage(provider, {
    prompt,
    model,
    images: Array.isArray(options.images) ? options.images : [],
    n: options.n ?? 1,
    size: options.size,
    quality: options.quality,
    response_format: options.responseFormat || options.response_format,
    seed: options.seed,
  }, {
    baseUrl: `http://127.0.0.1:${config.PORT}`,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });
  if (!result?.ok) {
    const error = new Error(result?.error || '所选 LLM 独立配置的图片接口调用失败');
    error.status = Number(result?.statusCode) || undefined;
    error.code = result?.code || 'llm_image_failed';
    throw error;
  }
  const imageUrls = options.persistOutputs === false
    ? (Array.isArray(result.imageUrls) ? result.imageUrls.filter(Boolean) : [])
    : await persistConfiguredImageUrls(result.imageUrls, options.outputFormat);
  return {
    content: '',
    imageUrls,
    raw: result.raw,
    model,
    llmKeyId: selected.keyId,
    llmLabel: selected.label,
  };
}

async function persistConfiguredImageUrl(value, outputFormat) {
  const url = String(value || '').trim();
  if (!url || url.startsWith('/files/output/')) return url;
  let buffer;
  const dataMatch = url.match(/^data:image\/[^;,]+;base64,(.+)$/i);
  if (dataMatch) {
    buffer = Buffer.from(dataMatch[1], 'base64');
  } else if (/^https?:\/\//i.test(url)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    timer.unref?.();
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return url;
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.startsWith('image/')) return url;
      const contentLength = Number(response.headers.get('content-length')) || 0;
      if (contentLength > MAX_AGENT_IMAGE_BYTES) throw new Error('模型返回的图片超过 50MB，已停止写入画布。');
      buffer = Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  } else {
    return url;
  }
  if (!buffer?.length) return url;
  if (buffer.length > MAX_AGENT_IMAGE_BYTES) throw new Error('模型返回的图片超过 50MB，已停止写入画布。');
  const output = await writeImageOutput(config.OUTPUT_DIR, 'codex-agent', buffer, outputFormat || 'png');
  return output.url;
}

async function persistConfiguredImageUrls(values, outputFormat) {
  const urls = Array.isArray(values) ? values.filter(Boolean) : [];
  const out = [];
  for (const value of urls) out.push(await persistConfiguredImageUrl(value, outputFormat));
  return out;
}

function extractResponsesImageResult(data) {
  const imageUrls = [];
  const textParts = [];
  const seen = new Set();
  const addImage = (value, mime = 'image/png') => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const url = /^(?:data:image\/|https?:\/\/|\/files\/)/i.test(raw)
      ? raw
      : `data:${mime || 'image/png'};base64,${raw}`;
    if (!seen.has(url)) {
      seen.add(url);
      imageUrls.push(url);
    }
  };
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const type = String(value.type || '').toLowerCase();
    if (type === 'output_text' && value.text) textParts.push(String(value.text));
    if (type === 'image_generation_call') {
      if (typeof value.result === 'string') addImage(value.result, value.mime_type || value.mimeType);
      else visit(value.result);
    }
    if (value.b64_json || value.base64 || value.image_base64) {
      addImage(value.b64_json || value.base64 || value.image_base64, value.mime_type || value.mimeType);
    }
    const imageUrl = typeof value.image_url === 'string' ? value.image_url : value.image_url?.url;
    if (imageUrl) addImage(imageUrl, value.mime_type || value.mimeType);
    if (type === 'output_image' && value.url) addImage(value.url, value.mime_type || value.mimeType);
    for (const key of ['output', 'content', 'data', 'images', 'results']) visit(value[key]);
  };
  visit(data);
  if (typeof data?.output_text === 'string' && data.output_text.trim()) textParts.unshift(data.output_text.trim());
  return { content: textParts.filter(Boolean).join('\n').trim(), imageUrls };
}

async function generateConfiguredResponseImage(options = {}) {
  const settings = options.settings || loadRawSettings();
  const selected = resolveLlmConfig(settings, options.llmKeyId);
  if (!selected || selected.error) throw new Error(selected?.error || '未配置 LLM 独立 API Key');
  const model = String(selected.model || '').trim();
  if (!model) throw new Error('LLM 独立配置缺少模型名称');
  const prompt = String(options.prompt || '').trim();
  if (!prompt) throw new Error('生图提示词不能为空');

  const normalized = await normalizeLlmMessageMedia([{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      ...(Array.isArray(options.images) ? options.images : []).filter(Boolean)
        .map((url) => ({ type: 'image_url', image_url: { url } })),
    ],
  }], {}, { baseUrl: `http://127.0.0.1:${config.PORT}` });
  const inputContent = (normalized[0]?.content || []).map((part) => {
    if (part?.type === 'text') return { type: 'input_text', text: part.text || '' };
    if (part?.type === 'image_url' && part.image_url?.url) return { type: 'input_image', image_url: part.image_url.url };
    return null;
  }).filter(Boolean);
  const payload = {
    model,
    input: [{ role: 'user', content: inputContent }],
    tools: [{ type: 'image_generation' }],
    tool_choice: { type: 'image_generation' },
  };
  const timeoutMs = Math.max(10_000, Math.min(10 * 60_000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
  const active = combinedSignal(options.signal, timeoutMs);
  try {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(resolveLlmResponsesUrl(selected.baseUrl, zhenzhenBaseUrl(settings)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${selected.apiKey}` },
      body: JSON.stringify(payload),
      signal: active.signal,
    });
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      const error = new Error(`Responses 生图接口返回非 JSON：HTTP ${response.status}。响应片段：${safePreview(responseText)}`);
      error.status = response.status;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(data?.error?.message || data?.message || `Responses 生图接口 HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const extracted = extractResponsesImageResult(data);
    if (!extracted.imageUrls.length) {
      const error = new Error('Responses API 已响应，但 image_generation 工具没有返回图片。');
      error.status = 422;
      throw error;
    }
    const imageUrls = options.persistOutputs === false
      ? extracted.imageUrls
      : await persistConfiguredImageUrls(extracted.imageUrls, options.outputFormat);
    return {
      content: extracted.content,
      imageUrls,
      raw: data,
      model,
      llmKeyId: selected.keyId,
      llmLabel: selected.label,
    };
  } catch (error) {
    if (options.signal?.aborted || (error?.name === 'AbortError' && !active.didTimeout())) {
      throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    }
    throw active.didTimeout()
      ? Object.assign(new Error(`Responses 生图请求超过 ${Math.round(timeoutMs / 1000)} 秒`), { status: 408 })
      : error;
  } finally {
    active.dispose();
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  RETRYABLE_STATUSES,
  extractResponse,
  extractResponsesImageResult,
  generateConfiguredImage,
  generateConfiguredLlm,
  generateConfiguredResponseImage,
  loadRawSettings,
  persistConfiguredImageUrls,
  resolveLlmConfig,
};
