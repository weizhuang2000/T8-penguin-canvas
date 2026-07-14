'use strict';

const config = require('../config');
const settingsRouter = require('../routes/settings');
const { resolveLlmChatCompletionsUrl } = require('../utils/llmBaseUrl');
const { normalizeLlmMessageMedia } = require('./llmMedia');

const DEFAULT_TIMEOUT_MS = 180 * 1000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

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

module.exports = {
  DEFAULT_TIMEOUT_MS,
  RETRYABLE_STATUSES,
  extractResponse,
  generateConfiguredLlm,
  loadRawSettings,
  resolveLlmConfig,
};
