'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { resolveMediaRef } = require('./mediaResolver');

const MODEL = 'seedvr2-7b';
const MAX_PIXELS = 34_000_000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const COLOR_CORRECTIONS = new Set(['wavelet', 'none']);
const RESIZE_METHODS = new Set(['lanczos', 'bicubic']);

class Seedvr2Error extends Error {
  constructor(message, status = 400, code = 'seedvr2_error') {
    super(message);
    this.name = 'Seedvr2Error';
    this.status = status;
    this.code = code;
  }
}

function normalizeSeedvr2BaseUrl(value, fallback = '') {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return fallback;
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}

function resolveSeedvr2EditUrl(baseUrl) {
  const normalized = normalizeSeedvr2BaseUrl(baseUrl);
  if (!normalized) throw new Seedvr2Error('SeedVR2 Base URL 必须是有效的 http/https 地址');
  const parsed = new URL(normalized);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (/\/v1\/images\/edits$/i.test(pathname) || /\/images\/edits$/i.test(pathname)) {
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  }
  pathname = /\/v1$/i.test(pathname) ? `${pathname}/images/edits` : `${pathname}/v1/images/edits`;
  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

function normalizeApiKey(value) {
  return String(value || '').trim().replace(/^Bearer\s+/i, '');
}

function orientedDimensions(meta) {
  if (meta?.autoOrient?.width && meta?.autoOrient?.height) {
    return { width: meta.autoOrient.width, height: meta.autoOrient.height };
  }
  const shouldSwap = [5, 6, 7, 8].includes(Number(meta?.orientation));
  return {
    width: shouldSwap ? Number(meta?.height) : Number(meta?.width),
    height: shouldSwap ? Number(meta?.width) : Number(meta?.height),
  };
}

function positiveInteger(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Seedvr2Error(`${label}必须是正整数`);
  return n;
}

function normalizeSeed(value) {
  const n = value == null || value === '' ? 42 : Number(value);
  if (!Number.isSafeInteger(n)) throw new Seedvr2Error('seed 必须是整数');
  return n;
}

function validateTargetSize(sourceWidth, sourceHeight, width, height) {
  const targetWidth = positiveInteger(width, '目标宽度');
  const targetHeight = positiveInteger(height, '目标高度');
  if (targetWidth * targetHeight > MAX_PIXELS) {
    throw new Seedvr2Error('目标尺寸超过 SeedVR2 的 3400 万像素上限');
  }
  if (BigInt(sourceWidth) * BigInt(targetHeight) !== BigInt(sourceHeight) * BigInt(targetWidth)) {
    throw new Seedvr2Error('目标尺寸比例必须与原图完全一致');
  }
  return { width: targetWidth, height: targetHeight };
}

function parseDataImage(value) {
  const match = String(value || '').trim().match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  return { buffer: Buffer.from(match[2], 'base64'), mime: match[1].toLowerCase() };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const externalSignal = options.signal;
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener?.('abort', abort, { once: true });
  const { timeoutMs, fetchImpl = fetch, signal: _signal, readBody, ...init } = options;
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (typeof readBody !== 'function') return response;
    return { response, body: await readBody(response) };
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener?.('abort', abort);
  }
}

async function loadImage(imageUrl, options = {}) {
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) throw new Seedvr2Error('缺少输入图片');
  const dataImage = parseDataImage(imageUrl);
  if (dataImage) return dataImage;

  const local = await resolveMediaRef(imageUrl, { target: 'local-path', baseUrl: options.localBaseUrl }).catch(() => null);
  if (local?.path && fs.existsSync(local.path)) {
    return { buffer: await fsp.readFile(local.path), mime: local.mime || 'image/png' };
  }

  const remote = await resolveMediaRef(imageUrl, { target: 'url', baseUrl: options.localBaseUrl }).catch(() => null);
  if (!remote?.url || !/^https?:\/\//i.test(remote.url)) throw new Seedvr2Error('无法解析输入图片');
  const loaded = await fetchWithTimeout(remote.url, {
    method: 'GET',
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    readBody: async (response) => Buffer.from(await response.arrayBuffer()),
  });
  const response = loaded.response;
  if (!response.ok) throw new Seedvr2Error(`下载输入图片失败：HTTP ${response.status}`, 502, 'input_download_failed');
  const mime = String(response.headers?.get?.('content-type') || 'image/png').split(';')[0];
  return { buffer: loaded.body, mime };
}

function shortErrorBody(value, secrets = []) {
  let text = String(value || '');
  const values = [...new Set(secrets.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const secret of values) text = text.split(secret).join('[REDACTED]');
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function outputExtension(format) {
  if (format === 'jpeg') return 'jpg';
  if (['png', 'webp', 'avif'].includes(format)) return format;
  return 'png';
}

async function runSeedvr2Upscale(input, options = {}) {
  const apiKey = normalizeApiKey(options.apiKey);
  if (!apiKey) throw new Seedvr2Error('请先在 API Key 设置中填写 SeedVR2 API Key');
  const baseUrl = normalizeSeedvr2BaseUrl(options.baseUrl || config.SEEDVR2_BASE_URL);
  if (!baseUrl) throw new Seedvr2Error('SeedVR2 Base URL 必须是有效的 http/https 地址');

  const source = await loadImage(input?.imageUrl, options);
  const sourceMeta = await sharp(source.buffer).metadata().catch(() => null);
  const sourceSize = orientedDimensions(sourceMeta);
  if (!sourceMeta?.format || !sourceSize.width || !sourceSize.height) throw new Seedvr2Error('输入文件不是有效图片');

  const target = validateTargetSize(sourceSize.width, sourceSize.height, input?.width, input?.height);
  const seed = normalizeSeed(input?.seed);
  const colorCorrection = String(input?.colorCorrection || 'wavelet').trim().toLowerCase();
  const resizeMethod = String(input?.resizeMethod || 'lanczos').trim().toLowerCase();
  if (!COLOR_CORRECTIONS.has(colorCorrection)) throw new Seedvr2Error('colorCorrection 仅支持 wavelet 或 none');
  if (!RESIZE_METHODS.has(resizeMethod)) throw new Seedvr2Error('resizeMethod 仅支持 lanczos 或 bicubic');
  const prompt = String(input?.prompt || 'Upscale this image').trim().slice(0, 1000) || 'Upscale this image';

  const form = new FormData();
  const sourceExt = outputExtension(sourceMeta.format);
  form.append('image', new Blob([source.buffer], { type: source.mime || `image/${sourceExt}` }), `seedvr2-input.${sourceExt}`);
  form.append('model', MODEL);
  form.append('prompt', prompt);
  form.append('size', `${target.width}x${target.height}`);
  form.append('seed', String(seed));
  form.append('color_correction', colorCorrection);
  form.append('resize_method', resizeMethod);
  form.append('response_format', 'b64_json');

  let response;
  let text = '';
  try {
    const loaded = await fetchWithTimeout(resolveSeedvr2EditUrl(baseUrl), {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      body: form,
      timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
      readBody: (upstreamResponse) => upstreamResponse.text(),
    });
    response = loaded.response;
    text = loaded.body;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Seedvr2Error('SeedVR2 请求超时，请稍后重试', 504, 'timeout');
    const detail = shortErrorBody(error?.message || '网络错误', [apiKey, `Bearer ${apiKey}`]);
    throw new Seedvr2Error(`SeedVR2 请求失败：${detail || '网络错误'}`, 502, 'network_error');
  }

  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!response.ok) {
    const detail = shortErrorBody(json?.error?.message || json?.error || json?.message || text, [apiKey, `Bearer ${apiKey}`]);
    throw new Seedvr2Error(`SeedVR2 调用失败：HTTP ${response.status}${detail ? ` ${detail}` : ''}`, 502, 'upstream_error');
  }
  const base64 = String(json?.data?.[0]?.b64_json || json?.data?.b64_json || '').trim();
  if (!base64) throw new Seedvr2Error('SeedVR2 未返回 b64_json 图像', 502, 'empty_output');

  const outputBuffer = Buffer.from(base64, 'base64');
  const outputMeta = await sharp(outputBuffer).metadata().catch(() => null);
  const outputSize = orientedDimensions(outputMeta);
  if (!outputMeta?.format || !outputSize.width || !outputSize.height) {
    throw new Seedvr2Error('SeedVR2 返回的内容不是有效图片', 502, 'invalid_output');
  }
  if (outputSize.width * outputSize.height > MAX_PIXELS) {
    throw new Seedvr2Error('SeedVR2 返回图片超过 3400 万像素上限', 502, 'oversized_output');
  }

  await fsp.mkdir(config.OUTPUT_DIR, { recursive: true });
  const filename = `seedvr2_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${outputExtension(outputMeta.format)}`;
  await fsp.writeFile(path.join(config.OUTPUT_DIR, filename), outputBuffer);
  return {
    imageUrl: `/files/output/${filename}`,
    width: outputSize.width,
    height: outputSize.height,
    sourceWidth: sourceSize.width,
    sourceHeight: sourceSize.height,
    requestedWidth: target.width,
    requestedHeight: target.height,
    seed,
    colorCorrection,
    resizeMethod,
    model: MODEL,
  };
}

module.exports = {
  COLOR_CORRECTIONS,
  DEFAULT_TIMEOUT_MS,
  MAX_PIXELS,
  MODEL,
  RESIZE_METHODS,
  Seedvr2Error,
  normalizeSeedvr2BaseUrl,
  resolveSeedvr2EditUrl,
  runSeedvr2Upscale,
  validateTargetSize,
};
