'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { normalizeCloudUploadTargets } = require('../cloudUploads/settings');
const {
  normalizeActiveOutputStorageSpaceId,
  normalizeOutputStorageSpaces,
} = require('./settings');
const {
  deleteStorageFile,
  downloadStorageFile,
  listStorageFiles,
  proxyStorageFile,
  testStorageSpace: testNodeStorageSpace,
  uploadStorageFile,
} = require('./client');
const {
  deletePath: deleteWebdavPath,
  downloadFile: downloadWebdavFile,
  joinRemotePath,
  listFilesRecursive,
  proxyFile: proxyWebdavFile,
  putFile: putWebdavFile,
  testConnection: testWebdavConnection,
} = require('./webdav');

const INDEX_FILE = path.join(config.DATA_DIR, 'output_storage_index.json');
const SCAN_INTERVAL_MS = Math.max(1000, Number(process.env.T8_OUTPUT_STORAGE_SCAN_MS) || 2500);
const UPLOAD_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.T8_OUTPUT_STORAGE_UPLOAD_CONCURRENCY) || 2));
const REMOTE_RETRY_BASE_MS = Math.max(1000, Number(process.env.T8_OUTPUT_STORAGE_RETRY_BASE_MS) || 15_000);
const REMOTE_RETRY_MAX_MS = Math.max(REMOTE_RETRY_BASE_MS, Number(process.env.T8_OUTPUT_STORAGE_RETRY_MAX_MS) || 15 * 60_000);
const IMMUTABLE_PRIVATE_OUTPUT_CACHE = 'private, max-age=31536000, immutable';
const stableFiles = new Map();
let indexCache = null;
let indexMtime = 0;
let scanRunning = false;
let timer = null;

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.json': 'application/json', '.pdf': 'application/pdf',
};

function emptyIndex() {
  return { schema: 't8-output-storage-index', version: 2, updatedAt: new Date().toISOString(), items: {} };
}

function safeKey(value) {
  let decoded = '';
  try { decoded = decodeURIComponent(String(value || '')); } catch { decoded = String(value || ''); }
  const key = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!key || key.includes('\0')) return '';
  const parts = key.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return '';
  return parts.join('/');
}

function pathForLocalKey(key) {
  const safe = safeKey(key);
  if (!safe) return '';
  const root = path.resolve(config.OUTPUT_DIR);
  const target = path.resolve(root, ...safe.split('/'));
  return target === root || target.startsWith(root + path.sep) ? target : '';
}

function keyFromOutputUrl(url) {
  const clean = String(url || '').split(/[?#]/)[0];
  for (const prefix of ['/files/output/', '/output/']) {
    if (clean.startsWith(prefix)) return safeKey(clean.slice(prefix.length));
  }
  return '';
}

function outputUrlForKey(key) {
  const safe = safeKey(key);
  return safe ? `/files/output/${safe.split('/').map(encodeURIComponent).join('/')}` : '';
}

function readRawSettings() {
  try {
    if (!fs.existsSync(config.SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function getStorageSettings() {
  const raw = readRawSettings();
  const cloudTargets = normalizeCloudUploadTargets(raw.cloudUploadTargets, raw.cloudUploadTargets);
  const spaces = normalizeOutputStorageSpaces(raw.outputStorageSpaces, raw.outputStorageSpaces, cloudTargets);
  return {
    spaces,
    cloudTargets,
    activeId: normalizeActiveOutputStorageSpaceId(raw.activeOutputStorageSpaceId, spaces),
  };
}

function cloudTargetForSpace(settings, space) {
  if (space?.type !== 'cloud-upload-target') return null;
  return settings.cloudTargets.find((item) => item.id === space.cloudTargetId && item.provider === space.provider) || null;
}

function webdavConfigForTarget(target) {
  return target?.provider === 'baidu-netdisk' ? target.baiduNetdisk || {} : {};
}

function webdavOutputPath(target, key) {
  const cfg = webdavConfigForTarget(target);
  return joinRemotePath(cfg.folder || '/T8PenguinCanvas', 'output', key);
}

function loadIndex() {
  let mtime = 0;
  try { mtime = fs.statSync(INDEX_FILE).mtimeMs || 0; } catch { /* empty */ }
  if (indexCache && mtime === indexMtime) return indexCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    indexCache = parsed?.items && typeof parsed.items === 'object' ? { ...parsed, version: 2 } : emptyIndex();
  } catch {
    indexCache = emptyIndex();
  }
  indexMtime = mtime;
  return indexCache;
}

function writeIndex(index) {
  if (!fs.existsSync(config.DATA_DIR)) fs.mkdirSync(config.DATA_DIR, { recursive: true });
  index.updatedAt = new Date().toISOString();
  const tmp = `${INDEX_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2), 'utf8');
  fs.renameSync(tmp, INDEX_FILE);
  indexCache = index;
  indexMtime = fs.statSync(INDEX_FILE).mtimeMs || Date.now();
}

function storageEntryForKey(key) {
  const safe = safeKey(key);
  return safe ? loadIndex().items[safe] || null : null;
}

function storageEntryForUrl(url) {
  const key = keyFromOutputUrl(url);
  return key ? storageEntryForKey(key) : null;
}

function upsertEntry(key, patch) {
  const safe = safeKey(key);
  if (!safe) throw new Error('Invalid output storage key');
  const index = loadIndex();
  index.items[safe] = {
    key: safe,
    storageSpaceId: 'primary',
    createdAt: Date.now(),
    ...index.items[safe],
    ...patch,
    key: safe,
    updatedAt: Date.now(),
  };
  writeIndex(index);
  return index.items[safe];
}

function listLocalFiles(root = config.OUTPUT_DIR) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const key = path.relative(root, full).split(path.sep).join('/');
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        out.push({ key, filePath: full, size: stat.size, mtimeMs: stat.mtimeMs || 0 });
      }
    }
  };
  walk(root);
  return out;
}

function isFhlOutputKey(key) {
  return safeKey(key).startsWith('fhl/');
}

function fhlJobIdFromKey(key) {
  const parts = safeKey(key).split('/');
  return parts[0] === 'fhl' && parts[1] ? parts[1] : '';
}

function isFhlOutputReady(key) {
  const jobId = fhlJobIdFromKey(key);
  if (!jobId) return true;
  const file = path.join(config.DATA_DIR, 'fhl-image', 'jobs', `${jobId}.json`);
  if (!fs.existsSync(file)) return true;
  try {
    const job = JSON.parse(fs.readFileSync(file, 'utf8'));
    return ['completed', 'partial', 'failed', 'cancelled'].includes(String(job?.status || ''));
  } catch {
    return false;
  }
}

function pruneEmptyOutputParents(filePath) {
  const root = path.resolve(config.OUTPUT_DIR);
  let current = path.dirname(path.resolve(filePath));
  while (current !== root && current.startsWith(root + path.sep)) {
    try {
      if (fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch {
      break;
    }
  }
}

function removePublishedLocalFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    pruneEmptyOutputParents(filePath);
    return true;
  } catch {
    return false;
  }
}

function registerExistingLocalFiles(storageSettings = getStorageSettings()) {
  const index = loadIndex();
  const activeSpace = storageSettings.spaces.find((item) => item.id === storageSettings.activeId) || storageSettings.spaces[0];
  const publishExistingFhl = activeSpace && activeSpace.id !== 'primary';
  let changed = false;
  for (const file of listLocalFiles()) {
    if (index.items[file.key]) continue;
    // Completed FHL backlogs must drain to the selected remote space after a restart.
    if (publishExistingFhl && isFhlOutputKey(file.key)) continue;
    index.items[file.key] = {
      key: file.key,
      storageSpaceId: 'primary',
      size: file.size,
      contentType: MIME_BY_EXT[path.extname(file.key).toLowerCase()] || 'application/octet-stream',
      createdAt: file.mtimeMs || Date.now(),
      updatedAt: Date.now(),
      legacy: true,
    };
    changed = true;
  }
  if (changed) writeIndex(index);
}

async function publishLocalFile(file, activeSpace, storageSettings = getStorageSettings(), options = {}) {
  const contentType = MIME_BY_EXT[path.extname(file.key).toLowerCase()] || 'application/octet-stream';
  if (!activeSpace || activeSpace.id === 'primary') {
    return upsertEntry(file.key, {
      storageSpaceId: 'primary', size: file.size, contentType, createdAt: file.mtimeMs || Date.now(),
      sourceMtimeMs: file.mtimeMs || 0,
    });
  }
  try {
    let result;
    let storagePatch = {};
    if (activeSpace.type === 'cloud-upload-target') {
      const target = cloudTargetForSpace(storageSettings, activeSpace);
      if (!target?.enabled) throw new Error('百度网盘云端目标未启用');
      const cfg = webdavConfigForTarget(target);
      if (!cfg.webdavUrl) throw new Error('百度网盘缺少 WebDAV 地址');
      const remotePath = webdavOutputPath(target, file.key);
      result = await putWebdavFile(cfg, remotePath, file.filePath, contentType);
      storagePatch = {
        cloudTargetId: target.id,
        provider: target.provider,
        remotePath: result.remotePath,
        sha256: result.sha256,
      };
    } else {
      result = await uploadStorageFile(activeSpace, file.key, file.filePath, { contentType });
    }
    const entry = upsertEntry(file.key, {
      storageSpaceId: activeSpace.id,
      size: Number(result?.data?.size ?? result?.size ?? file.size) || file.size,
      contentType,
      etag: result?.data?.etag || result?.etag || '',
      createdAt: file.mtimeMs || Date.now(),
      sourceMtimeMs: file.mtimeMs || 0,
      storageFallbackFrom: '',
      storageError: '',
      pendingRemoteRetry: false,
      remoteRetryCount: 0,
      nextRemoteRetryAt: 0,
      ...storagePatch,
    });
    try {
      if (!removePublishedLocalFile(file.filePath)) throw new Error('local output is still in use');
    } catch (error) {
      console.warn(`[output-storage] 远端上传成功，但无法删除暂存文件 ${file.key}:`, error?.message || error);
    }
    return entry;
  } catch (error) {
    console.warn(`[output-storage] ${activeSpace.label || activeSpace.id} 写入失败，已回落当前服务器:`, error?.message || error);
    const previous = storageEntryForKey(file.key);
    const retryCount = options.retryRemote === true ? Math.max(0, Number(previous?.remoteRetryCount) || 0) + 1 : 0;
    const retryDelay = Math.min(REMOTE_RETRY_MAX_MS, REMOTE_RETRY_BASE_MS * (2 ** Math.min(6, Math.max(0, retryCount - 1))));
    return upsertEntry(file.key, {
      storageSpaceId: 'primary', size: file.size, contentType,
      createdAt: file.mtimeMs || Date.now(), storageFallbackFrom: activeSpace.id,
      storageError: String(error?.message || error).slice(0, 500),
      sourceMtimeMs: file.mtimeMs || 0,
      pendingRemoteRetry: options.retryRemote === true,
      remoteRetryCount: retryCount,
      nextRemoteRetryAt: options.retryRemote === true ? Date.now() + retryDelay : 0,
    });
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function scanAndPublishNewFiles() {
  if (scanRunning) return;
  scanRunning = true;
  try {
    const index = loadIndex();
    const storageSettings = getStorageSettings();
    const { spaces, activeId } = storageSettings;
    const activeSpace = spaces.find((item) => item.id === activeId) || spaces[0];
    const files = listLocalFiles();
    const present = new Set(files.map((item) => item.key));
    for (const key of stableFiles.keys()) if (!present.has(key)) stableFiles.delete(key);
    const candidates = [];
    for (const file of files) {
      const entry = index.items[file.key] || null;
      const fhlOutput = isFhlOutputKey(file.key);
      if (fhlOutput && !isFhlOutputReady(file.key)) continue;

      let targetSpace = activeSpace;
      if (entry?.storageSpaceId === 'primary') {
        // Other providers preserve the existing "switch affects new files only" behavior.
        // FHL additionally drains completed local backlogs and transient fallbacks.
        if (!fhlOutput || activeSpace?.id === 'primary') continue;
        if (entry.pendingRemoteRetry && Number(entry.nextRemoteRetryAt) > Date.now()) continue;
      } else if (entry?.storageSpaceId) {
        targetSpace = spaces.find((item) => item.id === entry.storageSpaceId && item.enabled)
          || (fhlOutput && activeSpace?.id !== 'primary' ? activeSpace : null);
        if (!targetSpace) continue;
        const samePublishedFile = Number(entry.sourceMtimeMs) > 0
          && Number(entry.size) === Number(file.size)
          && Math.abs(Number(entry.sourceMtimeMs) - Number(file.mtimeMs)) < 2;
        if (samePublishedFile) {
          removePublishedLocalFile(file.filePath);
          continue;
        }
      }
      const fingerprint = `${file.size}:${file.mtimeMs}`;
      const previous = stableFiles.get(file.key);
      if (!previous || previous.fingerprint !== fingerprint) {
        stableFiles.set(file.key, { fingerprint, stableCount: 0 });
        continue;
      }
      previous.stableCount += 1;
      // 连续两个扫描周期大小和 mtime 都不再变化，避免把仍在渲染的大视频提前上传。
      if (previous.stableCount < 2) continue;
      stableFiles.delete(file.key);
      candidates.push({ file, targetSpace, retryRemote: fhlOutput });
    }
    await mapWithConcurrency(candidates, UPLOAD_CONCURRENCY, ({ file, targetSpace, retryRemote }) => (
      publishLocalFile(file, targetSpace, storageSettings, { retryRemote })
    ));
  } finally {
    scanRunning = false;
  }
}

function startOutputStorageManager() {
  const cacheDir = path.join(config.DATA_DIR, 'output-cache');
  try {
    if (fs.existsSync(cacheDir)) {
      const cutoff = Date.now() - 24 * 60 * 60_000;
      for (const entry of fs.readdirSync(cacheDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const target = path.join(cacheDir, entry.name);
        if ((fs.statSync(target).mtimeMs || 0) < cutoff) fs.unlinkSync(target);
      }
    }
  } catch (error) {
    console.warn('[output-storage] 清理远端文件缓存失败:', error?.message || error);
  }
  registerExistingLocalFiles(getStorageSettings());
  if (timer) return;
  timer = setInterval(() => void scanAndPublishNewFiles(), SCAN_INTERVAL_MS);
  timer.unref?.();
}

function stopOutputStorageManager() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function serveOutputFile(req, res) {
  const key = safeKey(req.params?.[0] || req.path || '');
  if (!key) return res.status(400).json({ success: false, error: 'Invalid output path' });
  const localPath = pathForLocalKey(key);
  if (localPath && fs.existsSync(localPath)) {
    res.setHeader('Cache-Control', IMMUTABLE_PRIVATE_OUTPUT_CACHE);
    return res.sendFile(localPath);
  }
  const entry = storageEntryForKey(key);
  if (!entry) return res.status(404).json({ success: false, error: 'Output file not found' });
  if (entry.storageSpaceId === 'primary') return res.status(404).json({ success: false, error: 'Output file not found' });
  const storageSettings = getStorageSettings();
  const { spaces } = storageSettings;
  const space = spaces.find((item) => item.id === entry.storageSpaceId && item.enabled);
  if (!space) return res.status(503).json({ success: false, error: '文件所属存储空间当前未启用' });
  try {
    if (space.type === 'cloud-upload-target') {
      const target = cloudTargetForSpace(storageSettings, space);
      if (!target) throw new Error('百度网盘云端目标配置不存在');
      return await proxyWebdavFile(webdavConfigForTarget(target), entry.remotePath || webdavOutputPath(target, key), req, res);
    }
    return await proxyStorageFile(space, key, req, res);
  } catch (error) {
    if (!res.headersSent) return res.status(502).json({ success: false, error: `远端存储读取失败: ${error?.message || error}` });
    return res.end();
  }
}

async function deleteOutputByKey(key) {
  const safe = safeKey(key);
  const entry = storageEntryForKey(safe);
  const localPath = pathForLocalKey(safe);
  if (!entry || entry.storageSpaceId === 'primary') {
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } else {
    const storageSettings = getStorageSettings();
    const { spaces } = storageSettings;
    const space = spaces.find((item) => item.id === entry.storageSpaceId);
    if (!space) throw new Error('文件所属存储空间配置不存在');
    if (space.type === 'cloud-upload-target') {
      const target = cloudTargetForSpace(storageSettings, space);
      if (!target) throw new Error('百度网盘云端目标配置不存在');
      await deleteWebdavPath(webdavConfigForTarget(target), entry.remotePath || webdavOutputPath(target, safe));
    } else {
      await deleteStorageFile(space, safe);
    }
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
  const index = loadIndex();
  delete index.items[safe];
  writeIndex(index);
  return true;
}

async function materializeOutputUrl(url) {
  const key = keyFromOutputUrl(url);
  if (!key) return '';
  const localPath = pathForLocalKey(key);
  if (localPath && fs.existsSync(localPath)) return localPath;
  const entry = storageEntryForKey(key);
  if (!entry || entry.storageSpaceId === 'primary') return '';
  const storageSettings = getStorageSettings();
  const { spaces } = storageSettings;
  const space = spaces.find((item) => item.id === entry.storageSpaceId && item.enabled);
  if (!space) throw new Error('文件所属存储空间当前未启用');
  const ext = path.extname(key).slice(0, 16);
  const cacheDir = path.join(config.DATA_DIR, 'output-cache');
  const cachePath = path.join(cacheDir, `${crypto.createHash('sha256').update(`${entry.storageSpaceId}:${key}`).digest('hex')}${ext}`);
  if (fs.existsSync(cachePath)) return cachePath;
  if (space.type === 'cloud-upload-target') {
    const target = cloudTargetForSpace(storageSettings, space);
    if (!target) throw new Error('百度网盘云端目标配置不存在');
    await downloadWebdavFile(webdavConfigForTarget(target), entry.remotePath || webdavOutputPath(target, key), cachePath);
  } else {
    await downloadStorageFile(space, key, cachePath);
  }
  return cachePath;
}

async function reconcileRemoteSpace(space) {
  if (space?.type === 'cloud-upload-target') {
    const storageSettings = getStorageSettings();
    const target = cloudTargetForSpace(storageSettings, space);
    if (!target) throw new Error('百度网盘云端目标配置不存在');
    const cfg = webdavConfigForTarget(target);
    const root = joinRemotePath(cfg.folder || '/T8PenguinCanvas');
    const outputRoot = joinRemotePath(root, 'output');
    const files = await listFilesRecursive(cfg, root);
    const knownRemotePaths = new Set(
      Object.values(loadIndex().items || {})
        .filter((item) => item?.storageSpaceId === space.id && item?.remotePath)
        .map((item) => String(item.remotePath)),
    );
    let added = 0;
    let skipped = 0;
    for (const file of files) {
      const remotePath = joinRemotePath(file.remotePath);
      if (knownRemotePaths.has(remotePath)) { skipped += 1; continue; }
      let key = '';
      if (remotePath.startsWith(`${outputRoot}/`)) {
        key = safeKey(remotePath.slice(outputRoot.length + 1));
      } else {
        const base = safeKey(path.basename(remotePath)) || 'file.bin';
        const digest = crypto.createHash('sha1').update(remotePath).digest('hex').slice(0, 16);
        key = safeKey(`baidu-import/${digest}/${base}`);
      }
      const conflicting = key ? storageEntryForKey(key) : null;
      if (conflicting && conflicting.remotePath !== remotePath) {
        const base = safeKey(path.basename(remotePath)) || 'file.bin';
        const digest = crypto.createHash('sha1').update(remotePath).digest('hex').slice(0, 16);
        key = safeKey(`baidu-import/${digest}/${base}`);
      }
      if (!key || storageEntryForKey(key)) { skipped += 1; continue; }
      upsertEntry(key, {
        storageSpaceId: space.id,
        cloudTargetId: target.id,
        provider: target.provider,
        remotePath,
        size: Number(file.size) || 0,
        contentType: file.contentType || MIME_BY_EXT[path.extname(remotePath).toLowerCase()] || 'application/octet-stream',
        etag: file.etag || '',
        createdAt: Number(file.mtimeMs) || Date.now(),
        reconciled: true,
        importedFromCloud: !remotePath.startsWith(`${outputRoot}/`),
      });
      knownRemotePaths.add(remotePath);
      added += 1;
    }
    return { added, skipped, scanned: files.length };
  }
  let cursor = '';
  let added = 0;
  do {
    const result = await listStorageFiles(space, cursor, 500);
    const data = result?.data || result || {};
    for (const file of Array.isArray(data.items) ? data.items : []) {
      const key = safeKey(file.key);
      if (!key || storageEntryForKey(key)) continue;
      upsertEntry(key, {
        storageSpaceId: space.id,
        size: Number(file.size) || 0,
        contentType: file.contentType || MIME_BY_EXT[path.extname(key).toLowerCase()] || 'application/octet-stream',
        etag: file.etag || '',
        createdAt: Number(file.mtimeMs) || Date.now(),
        reconciled: true,
      });
      added += 1;
    }
    cursor = String(data.nextCursor || '');
  } while (cursor);
  return { added };
}

async function testStorageSpace(space) {
  if (space?.type !== 'cloud-upload-target') return testNodeStorageSpace(space);
  const storageSettings = getStorageSettings();
  const target = cloudTargetForSpace(storageSettings, space);
  if (!target?.enabled) throw new Error('百度网盘云端目标未启用');
  return testWebdavConnection(webdavConfigForTarget(target));
}

function storageMetadataForUrl(url) {
  const key = keyFromOutputUrl(url);
  const entry = key ? storageEntryForKey(key) : null;
  return {
    storageKey: key,
    storageSpaceId: entry?.storageSpaceId || 'primary',
    storageFallbackFrom: entry?.storageFallbackFrom || '',
    storageError: entry?.storageError || '',
  };
}

module.exports = {
  INDEX_FILE,
  deleteOutputByKey,
  getStorageSettings,
  keyFromOutputUrl,
  loadIndex,
  materializeOutputUrl,
  outputUrlForKey,
  pathForLocalKey,
  reconcileRemoteSpace,
  registerExistingLocalFiles,
  safeKey,
  scanAndPublishNewFiles,
  serveOutputFile,
  startOutputStorageManager,
  stopOutputStorageManager,
  storageEntryForKey,
  storageEntryForUrl,
  storageMetadataForUrl,
  testStorageSpace,
  upsertEntry,
};
