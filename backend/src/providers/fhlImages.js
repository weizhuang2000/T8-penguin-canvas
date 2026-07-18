'use strict';

const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { resolveMediaRef, mimeFromPath } = require('./mediaResolver');

const API_ROOT = 'https://www.fhl.mom';
const GENERATIONS_URL = `${API_ROOT}/v1/images/generations`;
const EDITS_URL = `${API_ROOT}/v1/images/edits`;
const MODEL = 'gpt-image-2';
const MAX_WORKERS = 10;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 180_000;
const RETRY_DELAY_MS = 15_000;
const WORKER_COOLDOWN_MS = 60_000;

const RATIO_SUPPORT = {
  generate: {
    '2K': ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '2:1', '1:2', '7:4', '4:7'],
    '4K': ['1:1', '3:2', '2:3', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '7:4', '4:7'],
  },
  edit: {
    '2K': ['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '7:4', '4:7'],
    '4K': ['1:1', '3:2', '2:3', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '7:4', '4:7'],
  },
};

const SIZE_MATRIX = {
  '2K': {
    '1:1': '2048x2048', '3:2': '2048x1360', '2:3': '1360x2048', '4:3': '2048x1536',
    '3:4': '1536x2048', '5:4': '2048x1632', '4:5': '1632x2048', '16:9': '2048x1152',
    '9:16': '1152x2048', '2:1': '2048x1024', '1:2': '1024x2048', '3:1': '2048x688',
    '1:3': '688x2048', '7:4': '2208x1264', '4:7': '1264x2208',
  },
  '4K': {
    '1:1': '2880x2880', '3:2': '3520x2352', '2:3': '2352x3520', '4:3': '3840x2880',
    '3:4': '2880x3840', '5:4': '3840x3072', '4:5': '3072x3840', '16:9': '3840x2160',
    '9:16': '2160x3840', '2:1': '3840x1920', '1:2': '1920x3840', '3:1': '3840x1280',
    '1:3': '1280x3840', '7:4': '3808x2176', '4:7': '2176x3808',
  },
};

function cleanText(value, max = 240) {
  return String(value || '').trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, max);
}

function isMaskedKey(value) {
  return /^\*{2,}/.test(String(value || '').trim());
}

function normalizeWorkers(value, previous = []) {
  const oldById = new Map((Array.isArray(previous) ? previous : []).map((item) => [String(item?.id || ''), item]));
  const out = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  for (const [index, raw] of (Array.isArray(value) ? value : []).entries()) {
    if (!raw || typeof raw !== 'object' || out.length >= MAX_WORKERS) continue;
    let id = cleanText(raw.id || `worker-${index + 1}`, 48).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!id || seenIds.has(id)) id = `worker-${index + 1}`;
    const old = oldById.get(id);
    const incomingKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
    const apiKey = (!incomingKey || isMaskedKey(incomingKey)) ? String(old?.apiKey || '') : incomingKey.slice(0, 4096);
    if (!apiKey || seenKeys.has(apiKey)) continue;
    seenIds.add(id);
    seenKeys.add(apiKey);
    out.push({
      id,
      name: cleanText(raw.name || old?.name || `worker ${out.length + 1}`, 80) || `worker ${out.length + 1}`,
      apiKey,
      enabled: raw.enabled !== false,
      createdAt: cleanText(raw.createdAt || old?.createdAt || new Date().toISOString(), 64),
    });
  }
  return out;
}

function previewKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (key.length <= 10) return `****${key.slice(-4)}`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function maskWorkers(value) {
  return normalizeWorkers(value).map((worker, index) => ({
    index: index + 1,
    id: worker.id,
    name: worker.name,
    enabled: worker.enabled,
    hasApiKey: true,
    keyPreview: previewKey(worker.apiKey),
    createdAt: worker.createdAt,
  }));
}

function resolveSize(quality = '2K', aspect = '1:1', operation = 'generate') {
  const q = String(quality || '2K').toUpperCase();
  const op = operation === 'edit' ? 'edit' : 'generate';
  if (!RATIO_SUPPORT[op][q]) throw new Error('FHL 仅支持 2K，或由用户显式选择 4K。');
  const ratio = String(aspect || '1:1').trim();
  if (!RATIO_SUPPORT[op][q].includes(ratio)) throw new Error(`FHL ${q} ${op === 'edit' ? '编辑' : '生成'}不支持比例 ${ratio}`);
  return SIZE_MATRIX[q][ratio];
}

function aspectPromptSuffix(size) {
  const match = /^(\d+)x(\d+)$/.exec(String(size || ''));
  if (!match) return '';
  const width = Number(match[1]);
  const height = Number(match[2]);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height);
  const ratio = `${width / divisor}:${height / divisor}`;
  if (width === height) return `请严格按照 ${ratio} 正方形画幅生成最终图片，整张图片必须为 ${ratio} 比例。`;
  if (height > width) return `请严格按照 ${ratio} 竖版画幅生成最终图片，整张图片必须为 ${ratio} 竖向构图，不要正方形，不要横版。`;
  return `请严格按照 ${ratio} 横版画幅生成最终图片，整张图片必须为 ${ratio} 横向构图，不要正方形，不要竖版。`;
}

function promptWithAspect(prompt, size) {
  const suffix = aspectPromptSuffix(size);
  return suffix ? `${String(prompt || '').trim()}\n\n${suffix}` : String(prompt || '').trim();
}

function buildGenerationBody(prompt, size) {
  return {
    model: MODEL,
    prompt: promptWithAspect(prompt, size),
    n: 1,
    size,
    quality: 'auto',
    output_format: 'png',
    response_format: 'b64_json',
  };
}

function buildEditForm(prompt, size, sources) {
  const form = new FormData();
  sources.forEach((source, index) => {
    form.append(index === 0 ? 'image' : 'image[]', new Blob([source.buffer], { type: source.mime }), source.name);
  });
  form.append('prompt', promptWithAspect(prompt, size));
  form.append('model', MODEL);
  form.append('n', '1');
  form.append('size', size);
  form.append('quality', 'auto');
  form.append('output_format', 'png');
  form.append('response_format', 'b64_json');
  return form;
}

function isPrivateIp(address) {
  const value = String(address || '').toLowerCase();
  if (value.startsWith('::ffff:')) return isPrivateIp(value.slice(7));
  if (value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

async function validatePublicHttpsUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('远程参考图只允许 HTTPS 地址。');
  const records = await dns.lookup(parsed.hostname, { all: true });
  if (!records.length || records.some((item) => isPrivateIp(item.address))) throw new Error('远程参考图不能指向本机或私有网络。');
  return parsed.toString();
}

async function fetchWithTimeout(url, init, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = fetch) {
  const controller = new AbortController();
  const external = init?.signal;
  const abort = () => controller.abort();
  external?.addEventListener?.('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener?.('abort', abort);
  }
}

async function loadReference(value, options = {}) {
  const text = String(value || '').trim();
  if (!text) throw new Error('参考图为空。');
  const dataMatch = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(text);
  if (dataMatch) {
    const buffer = Buffer.from(dataMatch[2], 'base64');
    if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('参考图为空或超过 20MB。');
    return { buffer, mime: dataMatch[1], name: `reference.${dataMatch[1].split('/')[1] || 'png'}` };
  }
  if (/^https?:\/\//i.test(text)) {
    const url = await validatePublicHttpsUrl(text);
    const response = await fetchWithTimeout(url, { headers: { Accept: 'image/*' } }, REQUEST_TIMEOUT_MS, options.fetchImpl);
    if (!response.ok) throw new Error(`参考图下载失败：HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('参考图为空或超过 20MB。');
    const mime = response.headers.get('content-type')?.split(';')[0] || '';
    if (mime && !mime.startsWith('image/')) throw new Error('远程参考地址没有返回图片。');
    return { buffer, mime: mime || 'image/png', name: path.basename(new URL(url).pathname) || 'reference.png' };
  }
  if (path.isAbsolute(text) || /^file:\/\//i.test(text)) throw new Error('不允许通过 FHL 节点读取任意本地绝对路径，请先上传到画布。');
  const resolved = await resolveMediaRef(text, { target: 'local-path', baseUrl: options.baseUrl });
  const stat = fs.statSync(resolved.path);
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('参考图不存在或超过 20MB。');
  return { buffer: fs.readFileSync(resolved.path), mime: resolved.mime || mimeFromPath(resolved.path), name: path.basename(resolved.path) };
}

function extractBase64(json) {
  const items = Array.isArray(json?.data) ? json.data : [];
  return items.map((item) => item?.b64_json || item?.image?.b64_json || item?.base64).find((item) => typeof item === 'string' && item.trim()) || '';
}

async function parseError(response) {
  const text = await response.text().catch(() => '');
  let message = text;
  try {
    const json = JSON.parse(text);
    message = json?.error?.message || json?.message || text;
  } catch (_) {}
  return `HTTP ${response.status}${message ? ` ${String(message).slice(0, 500)}` : ''}`;
}

function normalizeOutputFormat(value, outputPath = '') {
  const format = String(value || '').trim().toLowerCase();
  if (format === 'jpg' || format === 'jpeg') return 'jpg';
  if (format === 'png') return 'png';
  return /\.jpe?g$/i.test(String(outputPath || '')) ? 'jpg' : 'png';
}

function rawPngPath(outputPath, outputFormat) {
  if (outputFormat === 'png') return outputPath;
  const extension = path.extname(outputPath);
  return path.join(path.dirname(outputPath), `${path.basename(outputPath, extension)}__raw.png`);
}

async function writeFormattedImage(buffer, outputPath, outputFormat, resizeSize = '') {
  let pipeline = sharp(buffer, { limitInputPixels: false });
  const match = /^(\d+)x(\d+)$/.exec(resizeSize);
  if (match) pipeline = pipeline.resize(Number(match[1]), Number(match[2]), { fit: 'fill' });
  if (outputFormat === 'jpg') {
    pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 100, chromaSubsampling: '4:4:4', mozjpeg: true });
  } else {
    pipeline = pipeline.png();
  }
  await pipeline.toFile(outputPath);
}

async function saveRawPng(base64, outputPath, resizeSize = '', requestedFormat = '') {
  const clean = String(base64 || '').replace(/^data:image\/[^;]+;base64,/i, '').trim();
  if (!clean) throw new Error('FHL Images API 未返回 b64_json。');
  const buffer = Buffer.from(clean, 'base64');
  const meta = await sharp(buffer, { limitInputPixels: false }).metadata();
  if (meta.format !== 'png') throw new Error(`FHL Images API 返回了非 PNG 栅格：${meta.format || 'unknown'}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const outputFormat = normalizeOutputFormat(requestedFormat, outputPath);
  const sourcePath = rawPngPath(outputPath, outputFormat);
  fs.writeFileSync(sourcePath, buffer);
  if (outputFormat === 'jpg') await writeFormattedImage(buffer, outputPath, outputFormat);
  const result = { outputPath, rawOutputPath: sourcePath, outputFormat, size: fs.statSync(outputPath).size, width: meta.width || 0, height: meta.height || 0 };
  if (resizeSize) {
    const match = /^(\d+)x(\d+)$/.exec(resizeSize);
    if (match) {
      const extension = outputFormat === 'jpg' ? 'jpg' : 'png';
      const resizedPath = outputPath.replace(/\.(?:png|jpe?g)$/i, `__resized_${match[1]}x${match[2]}.${extension}`);
      await writeFormattedImage(buffer, resizedPath, outputFormat, resizeSize);
      result.resizedPath = resizedPath;
    }
  }
  return result;
}

async function requestImage(worker, task, options = {}) {
  const size = resolveSize(task.quality, task.aspect, task.operation);
  const headers = { Accept: 'application/json', Authorization: `Bearer ${worker.apiKey}` };
  let response;
  if (task.operation === 'edit') {
    const sources = [];
    for (const value of task.images || []) sources.push(await loadReference(value, options));
    response = await fetchWithTimeout(EDITS_URL, { method: 'POST', headers, body: buildEditForm(task.prompt, size, sources), signal: options.signal }, REQUEST_TIMEOUT_MS, options.fetchImpl);
  } else {
    response = await fetchWithTimeout(GENERATIONS_URL, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(buildGenerationBody(task.prompt, size)), signal: options.signal,
    }, REQUEST_TIMEOUT_MS, options.fetchImpl);
  }
  if (!response.ok) return { ok: false, status: response.status, error: await parseError(response) };
  const json = await response.json().catch(() => null);
  const base64 = extractBase64(json);
  if (!base64) return { ok: false, status: response.status, error: 'FHL Images API 未返回 b64_json。' };
  const saved = await saveRawPng(base64, task.outputPath, task.resize ? size : '', task.outputFormat);
  return { ok: true, ...saved, sizeName: size };
}

function isRetryableError(result) {
  const status = Number(result?.status || 0);
  const text = String(result?.error || '').toLowerCase();
  return [429, 502, 503, 504, 524].includes(status) || ['rate limit', 'no available account', 'account pool busy', 'temporarily unavailable', 'timeout', 'fetch failed', 'econnreset'].some((part) => text.includes(part));
}

function isAuthError(result) {
  const status = Number(result?.status || 0);
  const text = String(result?.error || '').toLowerCase();
  return status === 401 || status === 403 || text.includes('invalid api key') || text.includes('unauthorized') || text.includes('forbidden');
}

function errorClass(result) {
  const text = String(result?.error || '').toLowerCase();
  if (Number(result?.status) === 524 || text.includes('524')) return 'timeout_524';
  if (text.includes('b64_json')) return 'no_image_result';
  if (isAuthError(result)) return 'auth';
  if (text.includes('content policy') || text.includes('moderation') || text.includes('safety')) return 'content_policy';
  if (isRetryableError(result)) return 'retryable';
  if (text.includes('fetch') || text.includes('network') || text.includes('socket')) return 'network';
  return 'fatal';
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function runWorkerQueue(workers, tasks, options = {}) {
  const enabled = normalizeWorkers(workers).filter((item) => item.enabled !== false);
  if (!enabled.length) throw new Error('请先配置并启用至少一个 FHL worker。');
  const sessions = enabled.map((worker) => ({ ...worker, busy: false, fatal: false, disabledUntil: 0, assigned: 0, success: 0, failed: 0, retries: 0, cooldowns: 0, lastError: '' }));
  const states = tasks.map((task, index) => ({ task, index, pending: true, running: false, done: false, attempts: 0, retries: 0, notBefore: 0, result: null }));
  const groupAssignments = new Map();
  const runningGroups = new Set();
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 1, states.length || 1, sessions.length, MAX_WORKERS));
  const maxRetries = options.maxRetries == null ? MAX_RETRIES : Math.max(0, Number(options.maxRetries));
  const retryDelay = options.retryDelayMs == null ? RETRY_DELAY_MS : Math.max(0, Number(options.retryDelayMs));
  const cooldown = options.cooldownMs == null ? WORKER_COOLDOWN_MS : Math.max(0, Number(options.cooldownMs));
  let cancelled = false;
  options.signal?.addEventListener?.('abort', () => { cancelled = true; }, { once: true });

  const take = () => {
    const now = Date.now();
    const available = sessions.filter((item) => !item.busy && !item.fatal && item.disabledUntil <= now).sort((a, b) => a.assigned - b.assigned || a.id.localeCompare(b.id));
    const ready = states.filter((item) => item.pending && !item.done && item.notBefore <= now);
    let worker = available[0];
    let state = ready[0];
    if (options.stickyGroups) {
      state = ready.find((item) => {
        const group = String(item.task?.groupKey || '');
        const assignedWorker = groupAssignments.get(group);
        return group && !runningGroups.has(group) && assignedWorker && available.some((candidate) => candidate.id === assignedWorker);
      });
      if (state) worker = available.find((candidate) => candidate.id === groupAssignments.get(String(state.task.groupKey))) || worker;
      if (!state) {
        state = ready.find((item) => {
          const group = String(item.task?.groupKey || '');
          return group && !runningGroups.has(group) && !groupAssignments.has(group);
        });
        if (state && worker) groupAssignments.set(String(state.task.groupKey), worker.id);
      }
      if (!state) state = ready.find((item) => !item.task?.groupKey);
    }
    if (!worker || !state) return null;
    worker.busy = true; worker.assigned += 1; state.pending = false; state.running = true; state.attempts += 1;
    if (state.task?.groupKey) runningGroups.add(String(state.task.groupKey));
    return { worker, state };
  };

  const dispatcher = async () => {
    while (!cancelled && states.some((item) => !item.done)) {
      const picked = take();
      if (!picked) {
        if (!sessions.some((item) => !item.fatal)) {
          states.filter((item) => !item.done && !item.running).forEach((item) => {
            item.done = true;
            item.pending = false;
            item.result = { ok: false, error: '没有可用的 FHL worker。', errorClass: 'auth', attempts: item.attempts, retries: item.retries };
          });
          break;
        }
        await sleep(25); continue;
      }
      const { worker, state } = picked;
      options.onUpdate?.({ type: 'start', worker, state });
      let result;
      try { result = await options.runTask(worker, state.task, state); }
      catch (error) { result = { ok: false, error: error?.name === 'AbortError' ? '任务已停止' : (error?.message || String(error)) }; }
      worker.busy = false; state.running = false;
      if (state.task?.groupKey) runningGroups.delete(String(state.task.groupKey));
      if (cancelled) {
        state.done = true;
        state.result = { ok: false, cancelled: true, error: '任务已停止', errorClass: 'cancelled', attempts: state.attempts, retries: state.retries };
        continue;
      }
      if (result.ok) {
        worker.success += 1;
        state.done = true;
        state.result = { ...result, workerId: worker.id, workerName: worker.name, attempts: state.attempts, retries: state.retries };
        options.onUpdate?.({ type: 'complete', worker, state });
        continue;
      }
      worker.failed += 1; worker.lastError = result.error || 'Unknown error';
      const auth = isAuthError(result); const retryable = isRetryableError(result);
      if (auth) {
        worker.fatal = true;
        for (const [group, workerId] of groupAssignments.entries()) if (workerId === worker.id) groupAssignments.delete(group);
      }
      else if (retryable && options.adaptive !== false) { worker.disabledUntil = Date.now() + (sessions.length > 1 ? cooldown : retryDelay); worker.cooldowns += 1; }
      const canRetry = !cancelled && (retryable || auth) && state.retries < maxRetries && sessions.some((item) => !item.fatal);
      if (canRetry) {
        state.retries += 1; worker.retries += 1; state.pending = true;
        if (options.adaptive === false && retryable) state.notBefore = Date.now() + retryDelay;
        options.onUpdate?.({ type: 'retry', worker, state, result });
      } else {
        state.done = true;
        state.result = { ...result, workerId: worker.id, workerName: worker.name, attempts: state.attempts, retries: state.retries, errorClass: errorClass(result) };
        options.onUpdate?.({ type: 'complete', worker, state });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, dispatcher));
  if (cancelled) {
    states.forEach((state) => {
      if (!state.done) state.result = { ok: false, cancelled: true, error: '任务已停止', errorClass: 'cancelled', attempts: state.attempts, retries: state.retries };
      state.done = true;
    });
  }
  const results = states.map((state) => state.result);
  return {
    results,
    workerStats: sessions.map(({ id, name, assigned, success, failed, retries, cooldowns, lastError }) => ({ id, name, assigned, success, failed, retries, cooldowns, lastError })),
    success: results.filter((item) => item?.ok).length,
    failed: results.filter((item) => item && !item.ok && !item.cancelled).length,
    cancelled: results.filter((item) => item?.cancelled).length,
  };
}

module.exports = {
  API_ROOT, GENERATIONS_URL, EDITS_URL, MODEL, MAX_WORKERS, MAX_RETRIES, REQUEST_TIMEOUT_MS,
  RATIO_SUPPORT, SIZE_MATRIX, normalizeWorkers, maskWorkers, previewKey, resolveSize,
  aspectPromptSuffix, buildGenerationBody, buildEditForm, loadReference, normalizeOutputFormat, saveRawPng,
  requestImage, runWorkerQueue, isRetryableError, isAuthError, errorClass,
};
