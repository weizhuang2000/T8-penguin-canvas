'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { canManageCanvasSharing, canViewCanvas, isCanvasOwner } = require('../auth/canvasAccess');
const { isAdminRole } = require('../auth/middleware');

const KINDS = new Set(['image', 'video', 'audio']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
const UNARCHIVED_PROJECT_ID = '__unarchived__';

function now() {
  return Date.now();
}

function safeText(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 500);
}

function normalizeSeed(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
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
    prompt: safeText(raw.prompt).slice(0, 20_000),
    provider: safeText(raw.provider),
    model: safeText(raw.model),
    taskId: safeText(raw.taskId),
    seed: normalizeSeed(raw.seed),
    createdAt,
    hidden: !!raw.hidden,
    favorite: !!raw.favorite,
    tags: normalizeTags(raw.tags),
    deletedAt: Number(raw.deletedAt) || 0,
    deletedByUserId: raw.deletedByUserId != null ? String(raw.deletedByUserId) : '',
    createdByUserId: raw.createdByUserId != null ? String(raw.createdByUserId) : '',
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

function canViewProject(user, canvasId, canvases) {
  if (!canvasId || canvasId === UNARCHIVED_PROJECT_ID) return isAdminRole(user?.role);
  const canvas = findCanvas(canvasId, canvases);
  return canvas ? canViewCanvas(user, canvas) : isAdminRole(user?.role);
}

function canManageHistoryItem(user, item, canvases) {
  if (!user || !item) return false;
  if (isAdminRole(user.role)) return true;
  if (!item.canvasId || item.canvasId === UNARCHIVED_PROJECT_ID) return false;
  const canvas = findCanvas(item.canvasId, canvases);
  if (!canvas) return false;
  return isCanvasOwner(user, canvas);
}

function outputPathForItem(item) {
  const fileName = outputUrlToFilename(item?.url) || item?.fileName;
  if (!fileName) return '';
  const root = path.resolve(config.OUTPUT_DIR);
  const target = path.resolve(root, fileName);
  if (target !== root && !target.startsWith(root + path.sep)) return '';
  return target;
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

function decorateItem(item, user, canvases) {
  const canManage = canManageHistoryItem(user, item, canvases);
  return {
    ...item,
    access: {
      canView: true,
      canManage,
      canDeleteFile: isAdminRole(user?.role),
    },
  };
}

function normalizeHistoryContext(context = {}) {
  return {
    canvasId: safeText(context.canvasId),
    sourceNodeId: safeText(context.sourceNodeId),
    sourceNodeType: safeText(context.sourceNodeType),
    nodeTitle: safeText(context.nodeTitle),
  };
}

function addHistoryItems(items, context = {}, user = null) {
  const normalizedContext = normalizeHistoryContext(context);
  const db = readDb();
  const byUrl = new Map(db.items.map((item) => [item.url, item]));
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const url = typeof raw === 'string' ? raw : raw?.url;
    const kind = normalizeKind(raw?.kind, url);
    if (!url || !kind) continue;
    const fileName = outputUrlToFilename(url);
    const title = safeText(raw?.title || normalizedContext.nodeTitle || fileName || path.basename(url));
    const existing = byUrl.get(url);
    const patch = {
      kind,
      url,
      fileName,
      title,
      canvasId: normalizedContext.canvasId,
      sourceNodeId: normalizedContext.sourceNodeId,
      sourceNodeType: normalizedContext.sourceNodeType,
      prompt: safeText(raw?.prompt || context.prompt).slice(0, 20_000),
      provider: safeText(raw?.provider || context.provider),
      model: safeText(raw?.model || context.model),
      taskId: safeText(raw?.taskId || context.taskId),
      seed: normalizeSeed(raw?.seed ?? context.seed),
      createdByUserId: user?.id != null ? String(user.id) : '',
    };
    if (existing) {
      Object.assign(existing, Object.fromEntries(Object.entries(patch).filter(([key, value]) => value !== '' && (key !== 'seed' || value > 0))));
      existing.hidden = false;
      out.push(existing);
    } else {
      const item = normalizeItem({
        id: genId(),
        ...patch,
        createdAt: now(),
      });
      if (!item) continue;
      db.items.push(item);
      byUrl.set(item.url, item);
      out.push(item);
    }
  }
  if (out.length) writeDb(db);
  return out;
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
    entries.push(normalizeItem({
      id: `scan_${crypto.createHash('sha1').update(name).digest('hex').slice(0, 16)}`,
      kind,
      url: urlFromFilename(name),
      fileName: name,
      title: name,
      canvasId: UNARCHIVED_PROJECT_ID,
      createdAt: stat.mtimeMs || stat.ctimeMs || now(),
    }));
  }
  return entries.filter(Boolean);
}

function listVisibleItems(user, params = {}) {
  const canvases = loadCanvasList();
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
  const kind = normalizeKind(params.kind);
  const q = safeText(params.q).toLowerCase();
  const includeHidden = params.includeHidden === true || params.includeHidden === '1' || params.includeHidden === 'true';
  const favoriteOnly = params.favorite === true || params.favorite === '1' || params.favorite === 'true';
  const canvasId = safeText(params.canvasId);
  return merged
    .filter((item) => {
      if (item.deletedAt) return false;
      if (!includeHidden && item.hidden) return false;
      if (kind && item.kind !== kind) return false;
      if (favoriteOnly && !item.favorite) return false;
      if (canvasId && item.canvasId !== canvasId) return false;
      if (!canViewProject(user, item.canvasId, canvases)) return false;
      if (q) {
        const haystack = `${item.title} ${item.fileName} ${item.prompt} ${item.provider} ${item.model} ${item.seed || ''} ${item.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((item) => decorateItem(item, user, canvases));
}

function listProjects(user) {
  const canvases = loadCanvasList();
  const items = listVisibleItems(user, { includeHidden: true });
  const counts = new Map();
  for (const item of items) {
    if (item.hidden || item.deletedAt) continue;
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
  if (!canViewProject(user, item.canvasId, canvases)) return { status: 403, error: 'No permission to access this history item' };
  if (!canManageHistoryItem(user, item, canvases)) return { status: 403, error: 'No permission to manage this history item' };
  if (patch.title != null) item.title = safeText(patch.title, item.title).slice(0, 200) || item.title;
  if (patch.favorite != null) item.favorite = !!patch.favorite;
  if (patch.hidden != null) item.hidden = !!patch.hidden;
  if (patch.tags != null) item.tags = normalizeTags(patch.tags);
  writeDb(db);
  return { status: 200, item: decorateItem(item, user, canvases) };
}

function deleteHistoryItem(user, id, mode = 'hide') {
  const canvases = loadCanvasList();
  const db = readDb();
  const item = findOrMaterializeItem(db, id);
  if (!item) return { status: 404, error: 'History item not found' };
  if (!canViewProject(user, item.canvasId, canvases)) return { status: 403, error: 'No permission to access this history item' };
  if (mode === 'delete-file') {
    if (!isAdminRole(user?.role)) return { status: 403, error: 'Only admin or manager can delete files' };
    const target = outputPathForItem(item);
    if (!target) return { status: 400, error: 'Invalid output file path' };
    if (fs.existsSync(target)) fs.unlinkSync(target);
    item.deletedAt = now();
    item.deletedByUserId = String(user.id);
    item.hidden = true;
  } else {
    if (!canManageHistoryItem(user, item, canvases)) return { status: 403, error: 'No permission to manage this history item' };
    item.hidden = true;
  }
  writeDb(db);
  return { status: 200, item: decorateItem(item, user, canvases) };
}

module.exports = {
  UNARCHIVED_PROJECT_ID,
  addHistoryItems,
  deleteHistoryItem,
  kindFromUrl,
  listProjects,
  listVisibleItems,
  outputPathForItem,
  readDb,
  updateHistoryItem,
  writeDb,
};
