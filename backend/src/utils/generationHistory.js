'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { canManageCanvasSharing, canViewCanvas, isCanvasOwner } = require('../auth/canvasAccess');
const { isAdminRole } = require('../auth/middleware');
const { findUserById } = require('../auth/designTeamDb');
const {
  INDEX_FILE: OUTPUT_STORAGE_INDEX_FILE,
  deleteOutputByKey,
  keyFromOutputUrl,
  loadIndex: loadStorageIndex,
  pathForLocalKey,
  storageEntryForKey,
  storageMetadataForUrl,
} = require('../outputStorage/manager');

const KINDS = new Set(['image', 'video', 'audio']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
const UNARCHIVED_PROJECT_ID = '__unarchived__';
const IMAGE_EDITOR_PROJECT_PREFIX = '__image_editor_user__:';
const MAX_LIST_LIMIT = 200;
const IMAGE_ANALYSIS_STRENGTHS = ['concise', 'standard', 'detailed', 'extreme'];
const IMAGE_ANALYSIS_LANGUAGES = ['zh', 'en'];
const IMAGE_ANALYSIS_PROMPT_MAX_LENGTH = 20_000;
let mergedItemsCache = null;

function now() {
  return Date.now();
}

function safeText(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 500);
}

function safePrompt(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function normalizePromptLanguage(value) {
  const language = String(value || '').trim().toLowerCase();
  return language === 'zh' || language === 'en' ? language : '';
}

function detectPromptLanguage(prompt, explicitLanguage = '') {
  const explicit = normalizePromptLanguage(explicitLanguage);
  if (explicit) return explicit;
  const text = safePrompt(prompt);
  const cjkCount = (text.match(/\p{Script=Han}/gu) || []).length;
  const latinWordCount = (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
  if (!cjkCount && !latinWordCount) return 'zh';
  return cjkCount > 0 && cjkCount >= latinWordCount ? 'zh' : 'en';
}

function normalizeHistoryImageAnalysis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const reversePrompts = {};
  const sourcePrompts = value.reversePrompts && typeof value.reversePrompts === 'object' ? value.reversePrompts : {};
  for (const strength of IMAGE_ANALYSIS_STRENGTHS) {
    const sourceLanguages = sourcePrompts[strength];
    if (!sourceLanguages || typeof sourceLanguages !== 'object' || Array.isArray(sourceLanguages)) continue;
    const languages = {};
    for (const language of IMAGE_ANALYSIS_LANGUAGES) {
      const prompt = typeof sourceLanguages[language] === 'string'
        ? sourceLanguages[language].trim().slice(0, IMAGE_ANALYSIS_PROMPT_MAX_LENGTH)
        : '';
      if (prompt) languages[language] = prompt;
    }
    if (Object.keys(languages).length) reversePrompts[strength] = languages;
  }
  return {
    version: 1,
    secondaryTags: Array.isArray(value.secondaryTags)
      ? [...new Set(value.secondaryTags.map((tag) => safeText(tag)).filter(Boolean))].slice(0, 3)
      : [],
    reversePrompts,
    classifiedAt: Math.max(0, Number(value.classifiedAt) || 0),
  };
}

function mergeHistoryImageAnalysis(currentValue, nextValue, fillMissing = false) {
  const current = normalizeHistoryImageAnalysis(currentValue);
  const next = normalizeHistoryImageAnalysis(nextValue);
  if (!next) return current;
  if (!current) return next;
  const reversePrompts = { ...(current.reversePrompts || {}) };
  for (const strength of IMAGE_ANALYSIS_STRENGTHS) {
    const nextLanguages = next.reversePrompts[strength];
    if (!nextLanguages) continue;
    const mergedLanguages = { ...(reversePrompts[strength] || {}) };
    for (const language of IMAGE_ANALYSIS_LANGUAGES) {
      if (!nextLanguages[language]) continue;
      if (!fillMissing || !mergedLanguages[language]) mergedLanguages[language] = nextLanguages[language];
    }
    if (Object.keys(mergedLanguages).length) reversePrompts[strength] = mergedLanguages;
  }
  return normalizeHistoryImageAnalysis({
    version: 1,
    secondaryTags: next.secondaryTags.length ? next.secondaryTags : current.secondaryTags,
    reversePrompts,
    classifiedAt: next.classifiedAt || current.classifiedAt,
  });
}

function normalizeSeed(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizePositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function parsePositiveInt(value, fallback = 0, max = MAX_LIST_LIMIT) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function parseNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function genId() {
  return `hist_${now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function outputUrlToFilename(url) {
  const clean = String(url || '').split(/[?#]/)[0];
  const prefixes = ['/files/output/', '/output/'];
  for (const prefix of prefixes) {
    if (clean.startsWith(prefix)) {
      try {
        return decodeURIComponent(clean.slice(prefix.length)).replace(/^[/\\]+/, '');
      } catch {
        return clean.slice(prefix.length).replace(/^[/\\]+/, '');
      }
    }
  }
  return '';
}

function urlFromFilename(filename) {
  return `/files/output/${encodeURIComponent(filename).replace(/%2F/gi, '/')}`;
}

function kindFromUrl(url) {
  const ext = path.extname(outputUrlToFilename(url) || String(url || '').split(/[?#]/)[0]).toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return '';
}

function normalizeKind(kind, url) {
  const k = String(kind || '').toLowerCase();
  return KINDS.has(k) ? k : kindFromUrl(url);
}

function normalizeTags(tags) {
  return Array.isArray(tags)
    ? tags.map((tag) => safeText(tag).slice(0, 64)).filter(Boolean).slice(0, 20)
    : [];
}

function emptyDb() {
  return {
    schema: 't8-generation-history',
    version: 1,
    updatedAt: new Date().toISOString(),
    items: [],
  };
}

function dbFile() {
  return path.join(config.DATA_DIR, 'generation_history.json');
}

function mtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function invalidateMergedItemsCache() {
  mergedItemsCache = null;
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = safeText(raw.url || raw.fileUrl);
  const kind = normalizeKind(raw.kind, url);
  if (!url || !kind) return null;
  const fileName = safeText(raw.fileName || outputUrlToFilename(url) || path.basename(url));
  const createdAt = Number(raw.createdAt) || now();
  return {
    id: safeText(raw.id, genId()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96) || genId(),
    kind,
    url,
    fileName,
    title: safeText(raw.title, fileName || kind),
    canvasId: safeText(raw.canvasId),
    sourceNodeId: safeText(raw.sourceNodeId),
    sourceNodeType: safeText(raw.sourceNodeType),
    prompt: safePrompt(raw.prompt),
    promptLanguage: normalizePromptLanguage(raw.promptLanguage),
    imageAnalysis: kind === 'image' ? normalizeHistoryImageAnalysis(raw.imageAnalysis) : null,
    provider: safeText(raw.provider),
    model: safeText(raw.model),
    taskId: safeText(raw.taskId),
    seed: normalizeSeed(raw.seed),
    width: normalizePositiveInt(raw.width),
    height: normalizePositiveInt(raw.height),
    createdAt,
    hidden: !!raw.hidden,
    favorite: !!raw.favorite,
    tags: normalizeTags(raw.tags),
    deletedAt: Number(raw.deletedAt) || 0,
    deletedByUserId: raw.deletedByUserId != null ? String(raw.deletedByUserId) : '',
    createdByUserId: raw.createdByUserId != null ? String(raw.createdByUserId) : '',
    createdByUserName: safeText(raw.createdByUserName),
    createdByUserRole: safeText(raw.createdByUserRole),
    storageSpaceId: safeText(raw.storageSpaceId, 'primary') || 'primary',
    storageKey: safeText(raw.storageKey || keyFromOutputUrl(url)),
    storageFallbackFrom: safeText(raw.storageFallbackFrom),
    storageError: safeText(raw.storageError),
  };
}

function readDb() {
  let raw = null;
  try {
    const file = dbFile();
    if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    raw = null;
  }
  const db = emptyDb();
  const seen = new Set();
  for (const item of Array.isArray(raw?.items) ? raw.items : []) {
    const normalized = normalizeItem(item);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    db.items.push(normalized);
  }
  return db;
}

function writeDb(db) {
  if (!fs.existsSync(config.DATA_DIR)) fs.mkdirSync(config.DATA_DIR, { recursive: true });
  db.updatedAt = new Date().toISOString();
  const file = dbFile();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
  invalidateMergedItemsCache();
}

function loadCanvasList() {
  try {
    if (!fs.existsSync(config.CANVAS_FILE)) return [];
    const list = JSON.parse(fs.readFileSync(config.CANVAS_FILE, 'utf-8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function findCanvas(canvasId, canvases = loadCanvasList()) {
  return canvases.find((canvas) => canvas?.id === canvasId) || null;
}

function loadCanvasData(canvasId) {
  const id = safeText(canvasId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) return null;
  const file = path.join(config.DATA_DIR, `canvas_${id}.json`);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function seedFromCanvasNode(canvasData) {
  const nodes = Array.isArray(canvasData?.nodes) ? canvasData.nodes : [];
  return (nodeId) => {
    if (!nodeId) return 0;
    const node = nodes.find((entry) => entry?.id === nodeId);
    const data = node?.data || {};
    return normalizeSeed(data.lastSeed || data.seed || data.mjSeed || data.nbSeed);
  };
}

function imageEditorProjectId(userId) {
  const id = safeText(userId);
  return id ? `${IMAGE_EDITOR_PROJECT_PREFIX}${id}` : '';
}

function imageEditorProjectUserId(canvasId) {
  const value = safeText(canvasId);
  if (!value.startsWith(IMAGE_EDITOR_PROJECT_PREFIX)) return '';
  return value.slice(IMAGE_EDITOR_PROJECT_PREFIX.length);
}

function isImageEditorHistoryItem(item) {
  return String(item?.sourceNodeType || '').trim().toLowerCase() === 'image-editor';
}

function imageEditorOwnerId(item) {
  return safeText(item?.createdByUserId) || imageEditorProjectUserId(item?.canvasId);
}

function canViewImageEditorItem(user, item) {
  if (isAdminRole(user?.role)) return true;
  const ownerId = imageEditorOwnerId(item);
  return !!ownerId && user?.id != null && ownerId === String(user.id);
}

function canViewProject(user, canvasId, canvases) {
  const imageEditorUserId = imageEditorProjectUserId(canvasId);
  if (imageEditorUserId) return isAdminRole(user?.role) || (user?.id != null && imageEditorUserId === String(user.id));
  if (!canvasId || canvasId === UNARCHIVED_PROJECT_ID) return isAdminRole(user?.role);
  const canvas = findCanvas(canvasId, canvases);
  return canvas ? canViewCanvas(user, canvas) : isAdminRole(user?.role);
}

function canViewHistoryItem(user, item, canvases) {
  if (isImageEditorHistoryItem(item)) return canViewImageEditorItem(user, item);
  return canViewProject(user, item?.canvasId, canvases);
}

function canManageHistoryItem(user, item, canvases) {
  if (!user || !item) return false;
  if (isAdminRole(user.role)) return true;
  if (isImageEditorHistoryItem(item)) return canViewImageEditorItem(user, item);
  if (!item.canvasId || item.canvasId === UNARCHIVED_PROJECT_ID) return false;
  const canvas = findCanvas(item.canvasId, canvases);
  if (!canvas) return false;
  return isCanvasOwner(user, canvas);
}

function outputPathForItem(item) {
  const key = item?.storageKey || keyFromOutputUrl(item?.url) || item?.fileName;
  const entry = key ? storageEntryForKey(key) : null;
  if (entry && entry.storageSpaceId !== 'primary') return '';
  return key ? pathForLocalKey(key) : '';
}

function readPngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGifSize(buffer) {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readBmpSize(buffer) {
  if (buffer.length < 26 || buffer.toString('ascii', 0, 2) !== 'BM') return null;
  return { width: buffer.readUInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
}

function readJpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isSof = (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    );
    if (isSof && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function readWebpSize(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const type = buffer.toString('ascii', 12, 16);
  if (type === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (type === 'VP8L' && buffer.length >= 25) {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + ((b3 << 6) | ((b2 & 0x0f) << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (type === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  return null;
}

function readAvifSize(buffer) {
  const text = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('latin1');
  if (!text.includes('ftyp') || !/(avif|avis|mif1|msf1)/.test(text)) return null;
  const index = buffer.indexOf(Buffer.from('ispe'));
  if (index < 4 || index + 20 > buffer.length) return null;
  return { width: buffer.readUInt32BE(index + 12), height: buffer.readUInt32BE(index + 16) };
}

function readImageSizeFromBuffer(buffer) {
  const size = readPngSize(buffer)
    || readJpegSize(buffer)
    || readWebpSize(buffer)
    || readGifSize(buffer)
    || readBmpSize(buffer)
    || readAvifSize(buffer);
  const width = normalizePositiveInt(size?.width);
  const height = normalizePositiveInt(size?.height);
  return width && height ? { width, height } : { width: 0, height: 0 };
}

function readLocalImageSize(item) {
  if (!item || item.kind !== 'image') return { width: 0, height: 0 };
  const target = outputPathForItem(item);
  if (!target || !fs.existsSync(target)) return { width: 0, height: 0 };
  let handle = null;
  try {
    const stat = fs.statSync(target);
    const length = Math.min(Math.max(0, stat.size || 0), 1024 * 1024);
    if (!length) return { width: 0, height: 0 };
    const buffer = Buffer.alloc(length);
    handle = fs.openSync(target, 'r');
    const bytesRead = fs.readSync(handle, buffer, 0, length, 0);
    return readImageSizeFromBuffer(bytesRead === length ? buffer : buffer.subarray(0, bytesRead));
  } catch {
    return { width: 0, height: 0 };
  } finally {
    if (handle != null) {
      try {
        fs.closeSync(handle);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

function findOrMaterializeItem(db, id) {
  let item = db.items.find((entry) => entry.id === id);
  if (item) return item;
  item = scanOutputItems().find((entry) => entry.id === id);
  if (item) {
    db.items.push(item);
    return item;
  }
  return null;
}

function decorateItem(item, user, canvases, seedReaderCache = null) {
  const canManage = canManageHistoryItem(user, item, canvases);
  let fallbackSeed = item.seed;
  if (!fallbackSeed && !isImageEditorHistoryItem(item) && item.canvasId && item.canvasId !== UNARCHIVED_PROJECT_ID) {
    let seedReader = seedReaderCache?.get(item.canvasId);
    if (!seedReader) {
      seedReader = seedFromCanvasNode(loadCanvasData(item.canvasId));
      seedReaderCache?.set(item.canvasId, seedReader);
    }
    fallbackSeed = seedReader(item.sourceNodeId);
  }
  let width = item.width;
  let height = item.height;
  if (item.kind === 'image' && (!width || !height)) {
    const size = readLocalImageSize(item);
    width = size.width;
    height = size.height;
  }
  const storage = storageMetadataForUrl(item.url);
  return {
    ...item,
    ...storage,
    seed: fallbackSeed,
    width,
    height,
    access: {
      canView: true,
      canManage,
      canDeleteFile: isAdminRole(user?.role),
    },
  };
}

function normalizeHistoryContext(context = {}, user = null) {
  const normalized = {
    canvasId: safeText(context.canvasId),
    sourceNodeId: safeText(context.sourceNodeId),
    sourceNodeType: safeText(context.sourceNodeType),
    nodeTitle: safeText(context.nodeTitle),
    outputTitle: safeText(context.outputTitle),
    promptLanguage: normalizePromptLanguage(context.promptLanguage),
  };
  const requestedImageEditorUserId = imageEditorProjectUserId(normalized.canvasId);
  if (isImageEditorHistoryItem(normalized)) {
    normalized.canvasId = imageEditorProjectId(user?.id) || normalized.canvasId;
  } else if (requestedImageEditorUserId) {
    // Virtual projects are reserved for the web image editor. Do not allow a
    // caller to place an arbitrary generation in another user's namespace.
    normalized.canvasId = '';
  }
  return normalized;
}

function addHistoryItems(items, context = {}, user = null) {
  const normalizedContext = normalizeHistoryContext(context, user);
  const db = readDb();
  const byUrl = new Map(db.items.map((item) => [item.url, item]));
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const url = typeof raw === 'string' ? raw : raw?.url;
    const kind = normalizeKind(raw?.kind, url);
    if (!url || !kind) continue;
    const fileName = outputUrlToFilename(url);
    const title = safeText(raw?.title || normalizedContext.outputTitle || normalizedContext.nodeTitle || fileName || path.basename(url));
    const existing = byUrl.get(url);
    const patch = {
      kind,
      url,
      fileName,
      title,
      canvasId: normalizedContext.canvasId,
      sourceNodeId: normalizedContext.sourceNodeId,
      sourceNodeType: normalizedContext.sourceNodeType,
      prompt: safePrompt(raw?.prompt || context.prompt),
      promptLanguage: normalizePromptLanguage(raw?.promptLanguage || normalizedContext.promptLanguage),
      provider: safeText(raw?.provider || context.provider),
      model: safeText(raw?.model || context.model),
      taskId: safeText(raw?.taskId || context.taskId),
      seed: normalizeSeed(raw?.seed ?? context.seed),
      width: normalizePositiveInt(raw?.width ?? context.width),
      height: normalizePositiveInt(raw?.height ?? context.height),
      createdByUserId: user?.id != null ? String(user.id) : '',
      createdByUserName: safeText(user?.name || user?.realName || user?.username),
      createdByUserRole: safeText(user?.role),
      ...storageMetadataForUrl(url),
    };
    if (kind === 'image' && patch.prompt) {
      const language = detectPromptLanguage(patch.prompt, patch.promptLanguage);
      patch.imageAnalysis = mergeHistoryImageAnalysis(existing?.imageAnalysis, {
        version: 1,
        secondaryTags: [],
        reversePrompts: { extreme: { [language]: patch.prompt } },
        classifiedAt: 0,
      }, true);
    }
    if (existing) {
      Object.assign(existing, Object.fromEntries(Object.entries(patch).filter(([key, value]) => value !== '' && (key !== 'seed' || value > 0))));
      if (existing.kind === 'image' && (!existing.width || !existing.height)) {
        Object.assign(existing, readLocalImageSize(existing));
      }
      existing.hidden = false;
      out.push(existing);
    } else {
      const item = normalizeItem({
        id: genId(),
        ...patch,
        createdAt: now(),
      });
      if (!item) continue;
      if (item.kind === 'image' && (!item.width || !item.height)) {
        Object.assign(item, readLocalImageSize(item));
      }
      db.items.push(item);
      byUrl.set(item.url, item);
      out.push(item);
    }
  }
  if (out.length) writeDb(db);
  return out;
}

async function addGeneratedHistoryItems(items, context = {}, user = null) {
  return addHistoryItems(items, context, user);
}

function scanOutputItems() {
  if (!fs.existsSync(config.OUTPUT_DIR)) return [];
  const entries = [];
  for (const name of fs.readdirSync(config.OUTPUT_DIR)) {
    const fp = path.join(config.OUTPUT_DIR, name);
    let stat;
    try {
      stat = fs.statSync(fp);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    let kind = '';
    if (IMAGE_EXT.has(ext)) kind = 'image';
    else if (VIDEO_EXT.has(ext)) kind = 'video';
    else if (AUDIO_EXT.has(ext)) kind = 'audio';
    if (!kind) continue;
    const item = normalizeItem({
      id: `scan_${crypto.createHash('sha1').update(name).digest('hex').slice(0, 16)}`,
      kind,
      url: urlFromFilename(name),
      fileName: name,
      title: name,
      canvasId: UNARCHIVED_PROJECT_ID,
      createdAt: stat.mtimeMs || stat.ctimeMs || now(),
    });
    if (item?.kind === 'image') Object.assign(item, readLocalImageSize(item));
    entries.push(item);
  }
  return entries.filter(Boolean);
}

function scanIndexedOutputItems() {
  const entries = [];
  if (path.resolve(path.dirname(OUTPUT_STORAGE_INDEX_FILE)) !== path.resolve(config.DATA_DIR)) return entries;
  const index = loadStorageIndex();
  for (const entry of Object.values(index.items || {})) {
    const key = String(entry?.key || '').trim();
    const url = key ? urlFromFilename(key) : '';
    const kind = normalizeKind('', url);
    if (!key || !kind) continue;
    const item = normalizeItem({
      id: `storage_${crypto.createHash('sha1').update(`${entry.storageSpaceId}:${key}`).digest('hex').slice(0, 16)}`,
      kind,
      url,
      fileName: key,
      title: path.basename(key),
      canvasId: UNARCHIVED_PROJECT_ID,
      createdAt: Number(entry.createdAt) || now(),
      storageSpaceId: entry.storageSpaceId,
      storageKey: key,
      storageFallbackFrom: entry.storageFallbackFrom,
      storageError: entry.storageError,
    });
    if (item) entries.push(item);
  }
  return entries;
}

function collectMergedItems() {
  const cacheKey = `${dbFile()}|${path.resolve(config.OUTPUT_DIR)}|${OUTPUT_STORAGE_INDEX_FILE}`;
  const dbMtimeMs = mtimeMs(dbFile());
  const outputMtimeMs = mtimeMs(config.OUTPUT_DIR);
  const storageIndexMtimeMs = mtimeMs(OUTPUT_STORAGE_INDEX_FILE);
  if (
    mergedItemsCache &&
    mergedItemsCache.cacheKey === cacheKey &&
    mergedItemsCache.dbMtimeMs === dbMtimeMs &&
    mergedItemsCache.outputMtimeMs === outputMtimeMs &&
    mergedItemsCache.storageIndexMtimeMs === storageIndexMtimeMs
  ) {
    return mergedItemsCache.items;
  }
  const db = readDb();
  const seen = new Set();
  const merged = [];
  for (const item of db.items) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      merged.push(item);
    }
  }
  for (const item of scanOutputItems()) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      merged.push(item);
    }
  }
  for (const item of scanIndexedOutputItems()) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      merged.push(item);
    }
  }
  mergedItemsCache = { cacheKey, dbMtimeMs, outputMtimeMs, storageIndexMtimeMs, items: merged };
  return merged;
}

async function mapWithConcurrency(items, limit, mapper) {
  const out = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      out[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return out;
}

function listVisibleItems(user, params = {}) {
  const canvases = loadCanvasList();
  const admin = isAdminRole(user?.role);
  const merged = collectMergedItems();
  const kind = normalizeKind(params.kind);
  const q = safeText(params.q).toLowerCase();
  const includeHidden = params.includeHidden === true || params.includeHidden === '1' || params.includeHidden === 'true';
  const favoriteOnly = params.favorite === true || params.favorite === '1' || params.favorite === 'true';
  const canvasId = safeText(params.canvasId);
  const selectedImageEditorUserId = imageEditorProjectUserId(canvasId);
  const userId = admin ? safeText(params.userId) : '';
  const role = admin ? safeText(params.role).toLowerCase() : '';
  const provider = admin ? safeText(params.provider).toLowerCase() : '';
  const model = admin ? safeText(params.model).toLowerCase() : '';
  const sourceNodeType = admin ? safeText(params.sourceNodeType).toLowerCase() : '';
  const limit = parsePositiveInt(params.limit);
  const offset = parseNonNegativeInt(params.offset);
  const sorted = merged
    .filter((item) => {
      if (item.deletedAt) return false;
      if (!includeHidden && item.hidden) return false;
      if (kind && item.kind !== kind) return false;
      if (favoriteOnly && !item.favorite) return false;
      if (selectedImageEditorUserId) {
        if (!isImageEditorHistoryItem(item) || imageEditorOwnerId(item) !== selectedImageEditorUserId) return false;
      } else if (canvasId) {
        if (isImageEditorHistoryItem(item) || item.canvasId !== canvasId) return false;
      }
      if (userId && item.createdByUserId !== userId) return false;
      if (role && String(item.createdByUserRole || '').toLowerCase() !== role) return false;
      if (provider && !String(item.provider || '').toLowerCase().includes(provider)) return false;
      if (model && !String(item.model || '').toLowerCase().includes(model)) return false;
      if (sourceNodeType && String(item.sourceNodeType || '').toLowerCase() !== sourceNodeType) return false;
      if (!canViewHistoryItem(user, item, canvases)) return false;
      if (q) {
        const haystack = `${item.title} ${item.fileName} ${item.prompt} ${item.provider} ${item.model} ${item.seed || ''} ${item.tags.join(' ')} ${item.createdByUserName} ${item.createdByUserRole} ${item.sourceNodeType}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const page = limit ? sorted.slice(offset, offset + limit) : (offset ? sorted.slice(offset) : sorted);
  const seedReaderCache = new Map();
  return page.map((item) => decorateItem(item, user, canvases, seedReaderCache));
}

async function listHistoryUsers(user) {
  if (!isAdminRole(user?.role)) return [];
  const db = readDb();
  const counts = new Map();
  for (const item of db.items) {
    if (item.deletedAt || !item.createdByUserId) continue;
    const current = counts.get(item.createdByUserId) || {
      userId: item.createdByUserId,
      username: '',
      name: item.createdByUserName || item.createdByUserId,
      role: item.createdByUserRole || '',
      counts: { image: 0, video: 0, audio: 0, total: 0 },
      lastCreatedAt: 0,
    };
    current.counts[item.kind] = (current.counts[item.kind] || 0) + 1;
    current.counts.total += 1;
    current.lastCreatedAt = Math.max(current.lastCreatedAt, Number(item.createdAt) || 0);
    if (item.createdByUserName) current.name = item.createdByUserName;
    if (item.createdByUserRole) current.role = item.createdByUserRole;
    counts.set(item.createdByUserId, current);
  }
  const entries = Array.from(counts.values());
  const out = await mapWithConcurrency(entries, 8, async (entry) => {
    try {
      const found = await findUserById(entry.userId);
      if (found) {
        entry.username = found.username || entry.username;
        entry.name = found.name || found.realName || found.username || entry.name;
        entry.role = found.role || entry.role;
      }
    } catch {
      // Best effort enrichment only.
    }
    return entry;
  });
  return out.sort((a, b) => b.lastCreatedAt - a.lastCreatedAt);
}

function listProjects(user) {
  const canvases = loadCanvasList();
  const items = collectMergedItems();
  const counts = new Map();
  const imageEditorProjects = new Map();
  for (const item of items) {
    if (item.hidden || item.deletedAt) continue;
    if (!canViewHistoryItem(user, item, canvases)) continue;
    if (isImageEditorHistoryItem(item)) {
      const userId = imageEditorOwnerId(item);
      if (!userId) continue;
      const current = imageEditorProjects.get(userId) || {
        userId,
        name: item.createdByUserName || userId,
        counts: { image: 0, video: 0, audio: 0, total: 0 },
        updatedAt: 0,
      };
      current.counts[item.kind] += 1;
      current.counts.total += 1;
      current.updatedAt = Math.max(current.updatedAt, Number(item.createdAt) || 0);
      if (item.createdByUserName) current.name = item.createdByUserName;
      imageEditorProjects.set(userId, current);
      continue;
    }
    const key = item.canvasId || UNARCHIVED_PROJECT_ID;
    const current = counts.get(key) || { image: 0, video: 0, audio: 0, total: 0 };
    current[item.kind] += 1;
    current.total += 1;
    counts.set(key, current);
  }
  const projects = canvases
    .filter((canvas) => canViewCanvas(user, canvas))
    .map((canvas) => ({
      id: canvas.id,
      name: canvas.name || canvas.id,
      ownerUserId: canvas.ownerUserId || null,
      readonly: false,
      counts: counts.get(canvas.id) || { image: 0, video: 0, audio: 0, total: 0 },
      updatedAt: Number(canvas.updatedAt) || 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  projects.push(...Array.from(imageEditorProjects.values())
    .map((project) => ({
      id: imageEditorProjectId(project.userId),
      name: `${project.name} · 网页版生图`,
      ownerUserId: project.userId,
      readonly: false,
      counts: project.counts,
      updatedAt: project.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt));
  if (isAdminRole(user?.role)) {
    projects.push({
      id: UNARCHIVED_PROJECT_ID,
      name: '未归档',
      ownerUserId: null,
      readonly: true,
      counts: counts.get(UNARCHIVED_PROJECT_ID) || { image: 0, video: 0, audio: 0, total: 0 },
      updatedAt: 0,
    });
  }
  return projects;
}

function updateHistoryItem(user, id, patch = {}) {
  const canvases = loadCanvasList();
  const db = readDb();
  const item = findOrMaterializeItem(db, id);
  if (!item) return { status: 404, error: 'History item not found' };
  if (!canViewHistoryItem(user, item, canvases)) return { status: 403, error: 'No permission to access this history item' };
  if (!canManageHistoryItem(user, item, canvases)) return { status: 403, error: 'No permission to manage this history item' };
  if (patch.title != null) item.title = safeText(patch.title, item.title).slice(0, 200) || item.title;
  if (patch.favorite != null) item.favorite = !!patch.favorite;
  if (patch.hidden != null) item.hidden = !!patch.hidden;
  if (patch.tags != null) item.tags = normalizeTags(patch.tags);
  if (item.kind === 'image' && patch.imageAnalysis != null) {
    item.imageAnalysis = mergeHistoryImageAnalysis(item.imageAnalysis, patch.imageAnalysis);
  }
  writeDb(db);
  return { status: 200, item: decorateItem(item, user, canvases) };
}

function deleteHistoryItem(user, id, mode = 'hide') {
  const canvases = loadCanvasList();
  const db = readDb();
  const item = findOrMaterializeItem(db, id);
  if (!item) return { status: 404, error: 'History item not found' };
  if (!canViewHistoryItem(user, item, canvases)) return { status: 403, error: 'No permission to access this history item' };
  if (mode === 'delete-file') {
    if (!isAdminRole(user?.role)) return { status: 403, error: 'Only admin or manager can delete files' };
    const key = item.storageKey || keyFromOutputUrl(item.url);
    if (!key) return { status: 400, error: 'Invalid output file path' };
    const finalize = () => {
      item.deletedAt = now();
      item.deletedByUserId = String(user.id);
      item.hidden = true;
      writeDb(db);
      return { status: 200, item: decorateItem(item, user, canvases) };
    };
    const entry = storageEntryForKey(key);
    if (entry && entry.storageSpaceId !== 'primary') {
      return deleteOutputByKey(key)
        .then(finalize)
        .catch((error) => ({ status: 502, error: `Failed to delete remote output file: ${error?.message || error}` }));
    }
    const target = outputPathForItem(item);
    if (target && fs.existsSync(target)) fs.unlinkSync(target);
    deleteOutputByKey(key).catch(() => {});
    return finalize();
  } else {
    if (!canManageHistoryItem(user, item, canvases)) return { status: 403, error: 'No permission to manage this history item' };
    item.hidden = true;
  }
  writeDb(db);
  return { status: 200, item: decorateItem(item, user, canvases) };
}

module.exports = {
  IMAGE_EDITOR_PROJECT_PREFIX,
  UNARCHIVED_PROJECT_ID,
  addGeneratedHistoryItems,
  addHistoryItems,
  deleteHistoryItem,
  detectPromptLanguage,
  mergeHistoryImageAnalysis,
  kindFromUrl,
  imageEditorProjectId,
  listHistoryUsers,
  listProjects,
  listVisibleItems,
  outputPathForItem,
  readDb,
  updateHistoryItem,
  writeDb,
};
