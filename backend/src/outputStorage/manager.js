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
const { prewarmThumbnailSources } = require('../utils/thumbnailCache');

const INDEX_FILE = path.join(config.DATA_DIR, 'output_storage_index.json');
// The output directory is only a compatibility/fallback source. New files are
// registered by publishLocalFile() at write time, so the periodic scan should
// stay low frequency and must not block the request loop on large mounts.
const SCAN_INTERVAL_MS = Math.max(5000, Number(process.env.T8_OUTPUT_STORAGE_SCAN_MS) || 30_000);
const UPLOAD_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.T8_OUTPUT_STORAGE_UPLOAD_CONCURRENCY) || 2));
const MATERIALIZE_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.T8_OUTPUT_STORAGE_DOWNLOAD_CONCURRENCY) || 2));
const REMOTE_RETRY_BASE_MS = Math.max(1000, Number(process.env.T8_OUTPUT_STORAGE_RETRY_BASE_MS) || 15_000);
const REMOTE_RETRY_MAX_MS = Math.max(REMOTE_RETRY_BASE_MS, Number(process.env.T8_OUTPUT_STORAGE_RETRY_MAX_MS) || 15 * 60_000);
const LOCAL_OUTPUT_RETENTION_MS = Math.max(
  60 * 60_000,
  Number(process.env.T8_OUTPUT_STORAGE_LOCAL_RETENTION_MS) || 7 * 24 * 60 * 60_000,
);
const LOCAL_OUTPUT_CLEANUP_HOUR = Math.min(23, Math.max(0, Number(process.env.T8_OUTPUT_STORAGE_CLEANUP_HOUR) || 4));
const LEGACY_MIGRATION_BATCH_SIZE = Math.max(1, Math.min(200, Number(process.env.T8_OUTPUT_STORAGE_BACKFILL_BATCH_SIZE) || 20));
const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60_000;
const IMMUTABLE_PRIVATE_OUTPUT_CACHE = 'private, max-age=31536000, immutable';
const MANAGED_INPUT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff',
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus',
  '.mp4', '.webm', '.mov', '.m4v', '.mkv',
]);
const stableFiles = new Map();
let indexCache = null;
let indexMtime = 0;
let scanRunning = false;
let timer = null;
let cleanupTimer = null;
let nextCleanupAt = 0;
let lastCleanupReport = null;
const materializeInflight = new Map();
const materializeQueue = [];
let activeMaterializeJobs = 0;

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac', '.opus': 'audio/opus',
  '.json': 'application/json', '.pdf': 'application/pdf',
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

function pathForInputKey(key) {
  const safe = safeKey(key);
  if (!safe) return '';
  const root = path.resolve(config.INPUT_DIR);
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

function keyFromInputUrl(url) {
  const clean = String(url || '').split(/[?#]/)[0];
  for (const prefix of ['/files/input/', '/input/']) {
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

function webdavStoragePath(target, namespace, key) {
  const cfg = webdavConfigForTarget(target);
  return joinRemotePath(cfg.folder || '/T8PenguinCanvas', namespace === 'input' ? 'input' : 'output', key);
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

function storageIndexKey(namespace, key) {
  const safe = safeKey(key);
  if (!safe) return '';
  return namespace === 'input' ? `input/${safe}` : safe;
}

function storageEntryForKey(key, namespace = 'output') {
  const indexKey = storageIndexKey(namespace, key);
  if (!indexKey) return null;
  const index = loadIndex();
  if (index.items[indexKey]) return index.items[indexKey];
  // Convenience for callers that pass the persisted input namespace key.
  if (namespace === 'output' && String(key).startsWith('input/')) {
    const inputKey = safeKey(String(key).slice('input/'.length));
    return inputKey ? index.items[storageIndexKey('input', inputKey)] || null : null;
  }
  return null;
}

function storageEntryForInputKey(key) {
  return storageEntryForKey(key, 'input');
}

function storageEntryForUrl(url) {
  const outputKey = keyFromOutputUrl(url);
  if (outputKey) return storageEntryForKey(outputKey, 'output');
  const inputKey = keyFromInputUrl(url);
  return inputKey ? storageEntryForKey(inputKey, 'input') : null;
}

function upsertEntry(key, patch) {
  const safe = safeKey(key);
  if (!safe) throw new Error('Invalid output storage key');
  const namespace = patch?.namespace === 'input' ? 'input' : 'output';
  const indexKey = storageIndexKey(namespace, safe);
  const index = loadIndex();
  index.items[indexKey] = {
    key: safe,
    namespace,
    storageSpaceId: 'primary',
    createdAt: Date.now(),
    ...index.items[indexKey],
    ...patch,
    key: safe,
    namespace,
    updatedAt: Date.now(),
  };
  writeIndex(index);
  return index.items[indexKey];
}

function isManagedInputFile(key) {
  return MANAGED_INPUT_EXTENSIONS.has(path.extname(String(key || '')).toLowerCase());
}

function shouldScanInputRoot() {
  return path.dirname(path.resolve(config.INPUT_DIR)) === path.dirname(path.resolve(config.OUTPUT_DIR));
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

async function listLocalFilesAsync(root = config.OUTPUT_DIR) {
  try {
    const out = [];
    const walk = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) {
          let stat;
          try { stat = await fs.promises.stat(full); } catch { continue; }
          const key = path.relative(root, full).split(path.sep).join('/');
          out.push({ key, filePath: full, size: stat.size, mtimeMs: stat.mtimeMs || 0 });
        }
      }
    };
    await walk(root);
    return out;
  } catch {
    return [];
  }
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

function pruneEmptyParents(filePath, rootDir) {
  const root = path.resolve(rootDir);
  let current = path.dirname(path.resolve(filePath));
  while (current !== root && current.startsWith(root + path.sep)) {
    try {
      if (fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch { break; }
  }
}

async function removePublishedLocalFileAsync(filePath, rootDir = config.OUTPUT_DIR) {
  try {
    await fs.promises.unlink(filePath);
    pruneEmptyParents(filePath, rootDir);
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
  const files = [
    ...listLocalFiles(config.OUTPUT_DIR).map((file) => ({ ...file, namespace: 'output' })),
    ...(shouldScanInputRoot() ? listLocalFiles(config.INPUT_DIR).filter((file) => isManagedInputFile(file.key)).map((file) => ({ ...file, namespace: 'input' })) : []),
  ];
  for (const file of files) {
    const indexKey = storageIndexKey(file.namespace, file.key);
    if (index.items[indexKey]) continue;
    // Completed FHL backlogs must drain to the selected remote space after a restart.
    if (file.namespace === 'output' && publishExistingFhl && isFhlOutputKey(file.key)) continue;
    index.items[indexKey] = {
      key: file.key,
      namespace: file.namespace,
      sourceRoot: path.resolve(file.namespace === 'input' ? config.INPUT_DIR : config.OUTPUT_DIR),
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

async function registerExistingLocalFilesAsync(storageSettings = getStorageSettings()) {
  const index = loadIndex();
  const activeSpace = storageSettings.spaces.find((item) => item.id === storageSettings.activeId) || storageSettings.spaces[0];
  const publishExistingFhl = activeSpace && activeSpace.id !== 'primary';
  let changed = false;
  const files = [
    ...(await listLocalFilesAsync(config.OUTPUT_DIR)).map((file) => ({ ...file, namespace: 'output' })),
    ...(shouldScanInputRoot() ? (await listLocalFilesAsync(config.INPUT_DIR)).filter((file) => isManagedInputFile(file.key)).map((file) => ({ ...file, namespace: 'input' })) : []),
  ];
  for (const file of files) {
    const indexKey = storageIndexKey(file.namespace, file.key);
    if (index.items[indexKey]) continue;
    if (file.namespace === 'output' && publishExistingFhl && isFhlOutputKey(file.key)) continue;
    index.items[indexKey] = {
      key: file.key,
      namespace: file.namespace,
      sourceRoot: path.resolve(file.namespace === 'input' ? config.INPUT_DIR : config.OUTPUT_DIR),
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
  const namespace = options.namespace === 'input' ? 'input' : 'output';
  const contentType = MIME_BY_EXT[path.extname(file.key).toLowerCase()] || 'application/octet-stream';
  if (!activeSpace || activeSpace.id === 'primary') {
    const entry = upsertEntry(file.key, {
      namespace,
      sourceRoot: path.resolve(namespace === 'input' ? config.INPUT_DIR : config.OUTPUT_DIR),
      storageSpaceId: 'primary', size: file.size, contentType, createdAt: file.mtimeMs || Date.now(),
      sourceMtimeMs: file.mtimeMs || 0,
    });
    if (contentType.startsWith('image/')) {
      void prewarmThumbnailSources(file.filePath, { outputKey: namespace + ':' + file.key, storageEntry: entry });
    }
    return entry;
  }
  try {
    let result;
    let storagePatch = {};
    if (activeSpace.type === 'cloud-upload-target') {
      const target = cloudTargetForSpace(storageSettings, activeSpace);
      if (!target?.enabled) throw new Error('百度网盘云端目标未启用');
      const cfg = webdavConfigForTarget(target);
      if (!cfg.webdavUrl) throw new Error('百度网盘缺少 WebDAV 地址');
      const remotePath = webdavStoragePath(target, namespace, file.key);
      result = await putWebdavFile(cfg, remotePath, file.filePath, contentType);
      storagePatch = {
        cloudTargetId: target.id,
        provider: target.provider,
        remotePath: result.remotePath,
        sha256: result.sha256,
      };
    } else {
      result = await uploadStorageFile(activeSpace, namespace === 'input' ? `input/${file.key}` : file.key, file.filePath, { contentType });
    }
    const entry = upsertEntry(file.key, {
      namespace,
      sourceRoot: path.resolve(namespace === 'input' ? config.INPUT_DIR : config.OUTPUT_DIR),
      storageSpaceId: activeSpace.id,
      size: Number(result?.data?.size ?? result?.size ?? file.size) || file.size,
      contentType,
      etag: result?.data?.etag || result?.etag || '',
      createdAt: file.mtimeMs || Date.now(),
      sourceMtimeMs: file.mtimeMs || 0,
      remoteVerifiedAt: Date.now(),
      localRetentionStartedAt: Date.now(),
      legacy: false,
      storageFallbackFrom: '',
      storageError: '',
      pendingRemoteRetry: false,
      remoteRetryCount: 0,
      nextRemoteRetryAt: 0,
      ...storagePatch,
    });
    if (contentType.startsWith('image/')) {
      await prewarmThumbnailSources(file.filePath, { outputKey: namespace + ':' + file.key, storageEntry: entry });
    }
    // Keep a local copy for the retention window. The daily cleanup task removes
    // successfully published files after they have been local for seven days.
    return entry;
  } catch (error) {
    console.warn(`[output-storage] ${activeSpace.label || activeSpace.id} 写入失败，已回落当前服务器:`, error?.message || error);
    const previous = storageEntryForKey(file.key, namespace);
    const retryCount = options.retryRemote === true ? Math.max(0, Number(previous?.remoteRetryCount) || 0) + 1 : 0;
    const retryDelay = Math.min(REMOTE_RETRY_MAX_MS, REMOTE_RETRY_BASE_MS * (2 ** Math.min(6, Math.max(0, retryCount - 1))));
    return upsertEntry(file.key, {
      namespace,
      sourceRoot: path.resolve(namespace === 'input' ? config.INPUT_DIR : config.OUTPUT_DIR),
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
    const files = [
      ...(await listLocalFilesAsync(config.OUTPUT_DIR)).map((file) => ({ ...file, namespace: 'output' })),
      ...(shouldScanInputRoot() ? (await listLocalFilesAsync(config.INPUT_DIR)).filter((file) => isManagedInputFile(file.key)).map((file) => ({ ...file, namespace: 'input' })) : []),
    ];
    const present = new Set(files.map((item) => `${item.namespace}:${item.key}`));
    for (const key of stableFiles.keys()) if (!present.has(key)) stableFiles.delete(key);
    const newCandidates = [];
    const migrationCandidates = [];
    for (const file of files) {
      const indexKey = storageIndexKey(file.namespace, file.key);
      const indexedEntry = index.items[indexKey] || null;
      const expectedRoot = path.resolve(file.namespace === 'input' ? config.INPUT_DIR : config.OUTPUT_DIR);
      const entry = indexedEntry && indexedEntry.sourceRoot && path.resolve(indexedEntry.sourceRoot) !== expectedRoot
        ? null
        : indexedEntry;
      const fhlOutput = file.namespace === 'output' && isFhlOutputKey(file.key);
      if (fhlOutput && !isFhlOutputReady(file.key)) continue;

      let targetSpace = activeSpace;
      if (entry?.storageSpaceId === 'primary') {
        // A primary entry is the only local copy until a configured remote
        // space confirms the upload. Migrate these entries in bounded batches;
        // cleanup remains disabled until publishLocalFile records verification.
        if (activeSpace?.id === 'primary') continue;
        if (entry.pendingRemoteRetry && Number(entry.nextRemoteRetryAt) > Date.now()) continue;
        targetSpace = spaces.find((item) => item.id === entry.storageFallbackFrom && item.enabled) || activeSpace;
      } else if (entry?.storageSpaceId) {
        targetSpace = spaces.find((item) => item.id === entry.storageSpaceId && item.enabled)
          || (activeSpace?.id !== 'primary' ? activeSpace : null);
        if (!targetSpace) continue;
        const samePublishedFile = Number(entry.sourceMtimeMs) > 0
          && Number(entry.size) === Number(file.size)
          && Math.abs(Number(entry.sourceMtimeMs) - Number(file.mtimeMs)) < 2;
        if (samePublishedFile) continue;
      }
      const stableKey = `${file.namespace}:${file.key}`;
      const fingerprint = `${file.size}:${file.mtimeMs}`;
      const previous = stableFiles.get(stableKey);
      if (!previous || previous.fingerprint !== fingerprint) {
        stableFiles.set(stableKey, { fingerprint, stableCount: 0 });
        continue;
      }
      previous.stableCount += 1;
      // 连续两个扫描周期大小和 mtime 都不再变化，避免把仍在渲染的大视频提前上传。
      if (previous.stableCount < 2) continue;
      const candidate = { file, targetSpace, retryRemote: targetSpace?.id !== 'primary', namespace: file.namespace };
      if (entry?.storageSpaceId === 'primary') migrationCandidates.push(candidate);
      else newCandidates.push(candidate);
    }
    const candidates = [...newCandidates, ...migrationCandidates.slice(0, LEGACY_MIGRATION_BATCH_SIZE)];
    for (const candidate of candidates) stableFiles.delete(`${candidate.namespace}:${candidate.file.key}`);
    await mapWithConcurrency(candidates, UPLOAD_CONCURRENCY, ({ file, targetSpace, retryRemote }) => (
      publishLocalFile(file, targetSpace, storageSettings, { retryRemote, namespace: file.namespace })
    ));
  } finally {
    scanRunning = false;
  }
}

async function cleanupPublishedLocalFiles(options = {}) {
  const normalized = typeof options === 'number' ? { nowMs: options } : options;
  const nowMs = Number(normalized.nowMs) || Date.now();
  const dryRun = normalized.dryRun === true;
  const index = loadIndex();
  const cutoff = nowMs - LOCAL_OUTPUT_RETENTION_MS;
  const report = {
    dryRun,
    startedAt: nowMs,
    cutoff,
    scanned: 0,
    eligible: 0,
    eligibleBytes: 0,
    removed: 0,
    removedBytes: 0,
    skipped: {
      missingIndex: 0,
      primaryOnly: 0,
      pendingRemoteRetry: 0,
      remoteUnverified: 0,
      remoteSizeMismatch: 0,
      withinRetention: 0,
      deleteFailed: 0,
    },
    sampleKeys: [],
  };
  const files = [
    ...(await listLocalFilesAsync(config.OUTPUT_DIR)).map((file) => ({ ...file, namespace: 'output', rootDir: config.OUTPUT_DIR })),
    ...(shouldScanInputRoot() ? (await listLocalFilesAsync(config.INPUT_DIR)).filter((file) => isManagedInputFile(file.key)).map((file) => ({ ...file, namespace: 'input', rootDir: config.INPUT_DIR })) : []),
  ];
  for (const file of files) {
    report.scanned += 1;
    const entry = index.items[storageIndexKey(file.namespace, file.key)];
    if (!entry) { report.skipped.missingIndex += 1; continue; }
    const expectedRoot = path.resolve(file.rootDir);
    if (entry.sourceRoot && path.resolve(entry.sourceRoot) !== expectedRoot) {
      report.skipped.missingIndex += 1;
      continue;
    }
    if (entry.storageSpaceId === 'primary') { report.skipped.primaryOnly += 1; continue; }
    if (entry.pendingRemoteRetry) { report.skipped.pendingRemoteRetry += 1; continue; }
    const remoteVerified = Number(entry.remoteVerifiedAt) > 0 || !!entry.sha256 || !!entry.etag;
    if (!remoteVerified) { report.skipped.remoteUnverified += 1; continue; }
    if (Number(entry.size) > 0 && Number(entry.size) !== Number(file.size)) {
      report.skipped.remoteSizeMismatch += 1;
      continue;
    }
    const retentionStartedAt = Number(
      entry.localRetentionStartedAt || entry.remoteVerifiedAt || entry.updatedAt || entry.createdAt || 0,
    );
    if (!retentionStartedAt || retentionStartedAt > cutoff) {
      report.skipped.withinRetention += 1;
      continue;
    }
    report.eligible += 1;
    report.eligibleBytes += Number(file.size) || 0;
    if (report.sampleKeys.length < 50) report.sampleKeys.push(file.namespace === 'input' ? `input/${file.key}` : file.key);
    if (dryRun) continue;
    if (await removePublishedLocalFileAsync(file.filePath, file.rootDir)) {
      report.removed += 1;
      report.removedBytes += Number(file.size) || 0;
    } else {
      report.skipped.deleteFailed += 1;
    }
  }
  report.completedAt = Date.now();
  lastCleanupReport = report;
  console.log(
    `[output-storage] local cleanup ${dryRun ? 'preview' : 'completed'}: `
    + `scanned=${report.scanned}, eligible=${report.eligible}, removed=${report.removed}, `
    + `primary=${report.skipped.primaryOnly}, unverified=${report.skipped.remoteUnverified}, `
    + `retained=${report.skipped.withinRetention}, failed=${report.skipped.deleteFailed}`,
  );
  return report;
}

function nextBeijingCleanupTime(nowMs = Date.now(), hour = LOCAL_OUTPUT_CLEANUP_HOUR) {
  const shifted = new Date(nowMs + BEIJING_UTC_OFFSET_MS);
  let next = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    hour,
    0,
    0,
    0,
  ) - BEIJING_UTC_OFFSET_MS;
  if (next <= nowMs) next += 24 * 60 * 60_000;
  return next;
}

function scheduleNextLocalCleanup() {
  if (cleanupTimer) clearTimeout(cleanupTimer);
  const nowMs = Date.now();
  nextCleanupAt = nextBeijingCleanupTime(nowMs);
  cleanupTimer = setTimeout(async () => {
    try {
      await cleanupPublishedLocalFiles();
    } catch (error) {
      console.warn('[output-storage] scheduled local cleanup failed:', error?.message || error);
    } finally {
      scheduleNextLocalCleanup();
    }
  }, Math.max(1000, nextCleanupAt - nowMs));
  cleanupTimer.unref?.();
  console.log(
    `[output-storage] next local cleanup: ${new Date(nextCleanupAt).toISOString()} `
    + `(Asia/Shanghai ${String(LOCAL_OUTPUT_CLEANUP_HOUR).padStart(2, '0')}:00)`,
  );
}

function getLocalCleanupState() {
  return {
    retentionMs: LOCAL_OUTPUT_RETENTION_MS,
    timezone: 'Asia/Shanghai',
    hour: LOCAL_OUTPUT_CLEANUP_HOUR,
    nextCleanupAt,
    lastCleanupReport,
  };
}

function startOutputStorageManager() {
  const cacheDirs = [path.join(config.DATA_DIR, 'output-cache'), path.join(config.DATA_DIR, 'input-cache')];
  try {
    for (const cacheDir of cacheDirs) {
      if (fs.existsSync(cacheDir)) {
        const cutoff = Date.now() - 24 * 60 * 60_000;
        for (const entry of fs.readdirSync(cacheDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const target = path.join(cacheDir, entry.name);
          if ((fs.statSync(target).mtimeMs || 0) < cutoff) fs.unlinkSync(target);
        }
      }
    }
  } catch (error) {
    console.warn('[output-storage] 清理远端文件缓存失败:', error?.message || error);
  }
  // Do not synchronously walk a potentially remote/large output mount while
  // Express is starting. The normal write path registers files immediately;
  // this is only a best-effort legacy backfill.
  if (!timer) {
    void registerExistingLocalFilesAsync(getStorageSettings())
      .then(() => scanAndPublishNewFiles())
      .catch((error) => {
        console.warn('[output-storage] initial legacy scan failed:', error?.message || error);
      });
    timer = setInterval(() => void scanAndPublishNewFiles(), SCAN_INTERVAL_MS);
    timer.unref?.();
  }
  void cleanupPublishedLocalFiles().catch((error) => {
    console.warn('[output-storage] startup local cleanup failed:', error?.message || error);
  });
  scheduleNextLocalCleanup();
}

function stopOutputStorageManager() {
  if (timer) clearInterval(timer);
  timer = null;
  if (cleanupTimer) clearTimeout(cleanupTimer);
  cleanupTimer = null;
  nextCleanupAt = 0;
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

async function serveInputFile(req, res) {
  const key = safeKey(req.params?.[0] || req.path || '');
  if (!key) return res.status(400).json({ success: false, error: 'Invalid input path' });
  const localPath = pathForInputKey(key);
  if (localPath && fs.existsSync(localPath)) {
    res.setHeader('Cache-Control', IMMUTABLE_PRIVATE_OUTPUT_CACHE);
    return res.sendFile(localPath);
  }
  const entry = storageEntryForKey(key, 'input');
  if (!entry || entry.storageSpaceId === 'primary') return res.status(404).json({ success: false, error: 'Input file not found' });
  const storageSettings = getStorageSettings();
  const space = storageSettings.spaces.find((item) => item.id === entry.storageSpaceId && item.enabled);
  if (!space) return res.status(503).json({ success: false, error: '文件所属存储空间当前未启用' });
  try {
    if (space.type === 'cloud-upload-target') {
      const target = cloudTargetForSpace(storageSettings, space);
      if (!target) throw new Error('百度网盘云端目标配置不存在');
      return await proxyWebdavFile(webdavConfigForTarget(target), entry.remotePath || webdavStoragePath(target, 'input', key), req, res);
    }
    return await proxyStorageFile(space, `input/${key}`, req, res);
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

function pumpMaterializeQueue() {
  while (activeMaterializeJobs < MATERIALIZE_CONCURRENCY && materializeQueue.length > 0) {
    const job = materializeQueue.shift();
    activeMaterializeJobs += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeMaterializeJobs -= 1;
        pumpMaterializeQueue();
      });
  }
}

function queueMaterialize(task) {
  return new Promise((resolve, reject) => {
    materializeQueue.push({ task, resolve, reject });
    pumpMaterializeQueue();
  });
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
  const inflightKey = `${entry.storageSpaceId}:${key}`;
  const existing = materializeInflight.get(inflightKey);
  if (existing) return existing;
  const pending = queueMaterialize(async () => {
    if (fs.existsSync(cachePath)) return cachePath;
    if (space.type === 'cloud-upload-target') {
      const target = cloudTargetForSpace(storageSettings, space);
      if (!target) throw new Error('百度网盘云端目标配置不存在');
      await downloadWebdavFile(webdavConfigForTarget(target), entry.remotePath || webdavOutputPath(target, key), cachePath);
    } else {
      await downloadStorageFile(space, key, cachePath);
    }
    return cachePath;
  }).finally(() => {
    materializeInflight.delete(inflightKey);
  });
  materializeInflight.set(inflightKey, pending);
  return pending;
}

async function materializeInputUrl(url) {
  const key = keyFromInputUrl(url);
  if (!key) return '';
  const localPath = pathForInputKey(key);
  if (localPath && fs.existsSync(localPath)) return localPath;
  const entry = storageEntryForKey(key, 'input');
  if (!entry || entry.storageSpaceId === 'primary') return '';
  const storageSettings = getStorageSettings();
  const space = storageSettings.spaces.find((item) => item.id === entry.storageSpaceId && item.enabled);
  if (!space) throw new Error('文件所属存储空间当前未启用');
  const ext = path.extname(key).slice(0, 16);
  const cacheDir = path.join(config.DATA_DIR, 'input-cache');
  const cachePath = path.join(cacheDir, `${crypto.createHash('sha256').update(`${entry.storageSpaceId}:input:${key}`).digest('hex')}${ext}`);
  if (fs.existsSync(cachePath)) return cachePath;
  const inflightKey = `${entry.storageSpaceId}:input:${key}`;
  const existing = materializeInflight.get(inflightKey);
  if (existing) return existing;
  const pending = queueMaterialize(async () => {
    if (fs.existsSync(cachePath)) return cachePath;
    if (space.type === 'cloud-upload-target') {
      const target = cloudTargetForSpace(storageSettings, space);
      if (!target) throw new Error('百度网盘云端目标配置不存在');
      await downloadWebdavFile(webdavConfigForTarget(target), entry.remotePath || webdavStoragePath(target, 'input', key), cachePath);
    } else {
      await downloadStorageFile(space, `input/${key}`, cachePath);
    }
    return cachePath;
  }).finally(() => materializeInflight.delete(inflightKey));
  materializeInflight.set(inflightKey, pending);
  return pending;
}

async function reconcileRemoteSpace(space) {
  if (space?.type === 'cloud-upload-target') {
    const storageSettings = getStorageSettings();
    const target = cloudTargetForSpace(storageSettings, space);
    if (!target) throw new Error('百度网盘云端目标配置不存在');
    const cfg = webdavConfigForTarget(target);
    const root = joinRemotePath(cfg.folder || '/T8PenguinCanvas');
    const outputRoot = joinRemotePath(root, 'output');
    const inputRoot = joinRemotePath(root, 'input');
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
      let namespace = 'output';
      if (remotePath.startsWith(`${outputRoot}/`)) {
        key = safeKey(remotePath.slice(outputRoot.length + 1));
      } else if (remotePath.startsWith(`${inputRoot}/`)) {
        namespace = 'input';
        key = safeKey(remotePath.slice(inputRoot.length + 1));
      } else {
        const base = safeKey(path.basename(remotePath)) || 'file.bin';
        const digest = crypto.createHash('sha1').update(remotePath).digest('hex').slice(0, 16);
        key = safeKey(`baidu-import/${digest}/${base}`);
      }
      const conflicting = key ? storageEntryForKey(key, namespace) : null;
      if (conflicting && conflicting.remotePath !== remotePath) {
        const base = safeKey(path.basename(remotePath)) || 'file.bin';
        const digest = crypto.createHash('sha1').update(remotePath).digest('hex').slice(0, 16);
        key = safeKey(`baidu-import/${digest}/${base}`);
      }
      if (!key || storageEntryForKey(key, namespace)) { skipped += 1; continue; }
      upsertEntry(key, {
        namespace,
        storageSpaceId: space.id,
        cloudTargetId: target.id,
        provider: target.provider,
        remotePath,
        size: Number(file.size) || 0,
        contentType: file.contentType || MIME_BY_EXT[path.extname(remotePath).toLowerCase()] || 'application/octet-stream',
        etag: file.etag || '',
        createdAt: Number(file.mtimeMs) || Date.now(),
        reconciled: true,
        importedFromCloud: !remotePath.startsWith(`${outputRoot}/`) && !remotePath.startsWith(`${inputRoot}/`),
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
      const rawKey = safeKey(file.key);
      const namespace = rawKey.startsWith('input/') ? 'input' : 'output';
      const key = namespace === 'input' ? safeKey(rawKey.slice('input/'.length)) : rawKey;
      if (!key || storageEntryForKey(key, namespace)) continue;
      upsertEntry(key, {
        namespace,
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
  const outputKey = keyFromOutputUrl(url);
  const inputKey = keyFromInputUrl(url);
  const key = outputKey || inputKey;
  const entry = outputKey ? storageEntryForKey(outputKey) : inputKey ? storageEntryForKey(inputKey, 'input') : null;
  return {
    storageKey: key,
    namespace: inputKey ? 'input' : 'output',
    storageSpaceId: entry?.storageSpaceId || 'primary',
    storageFallbackFrom: entry?.storageFallbackFrom || '',
    storageError: entry?.storageError || '',
  };
}

module.exports = {
  INDEX_FILE,
  deleteOutputByKey,
  getStorageSettings,
  getLocalCleanupState,
  keyFromOutputUrl,
  keyFromInputUrl,
  loadIndex,
  materializeOutputUrl,
  materializeInputUrl,
  outputUrlForKey,
  pathForLocalKey,
  pathForInputKey,
  reconcileRemoteSpace,
  registerExistingLocalFiles,
  registerExistingLocalFilesAsync,
  safeKey,
  scanAndPublishNewFiles,
  cleanupPublishedLocalFiles,
  nextBeijingCleanupTime,
  serveOutputFile,
  serveInputFile,
  startOutputStorageManager,
  stopOutputStorageManager,
  storageEntryForKey,
  storageEntryForUrl,
  storageMetadataForUrl,
  testStorageSpace,
  upsertEntry,
  storageEntryForInputKey,
  isManagedInputFile,
  webdavStoragePath,
};
