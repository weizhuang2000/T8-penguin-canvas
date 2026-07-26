'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)$/i;
const MAX_JOBS = Math.max(1, Math.min(4, Number.parseInt(process.env.T8PC_THUMBNAIL_CONCURRENCY || '4', 10) || 4));
const inflight = new Map();
const queue = [];
let activeJobs = 0;

function canonicalThumbnailSize(value) {
  const raw = Number.parseInt(String(value || ''), 10);
  const size = Number.isFinite(raw) ? Math.max(96, Math.min(1024, raw)) : (config.THUMBNAIL_SIZE || 320);
  if (size <= 360) return 360;
  if (size <= 720) return 720;
  return 1024;
}

function outputRevision(storageEntry) {
  return String(
    storageEntry?.sha256
      || storageEntry?.etag
      || String(storageEntry?.size || 0) + ':' + String(storageEntry?.sourceMtimeMs || storageEntry?.createdAt || 0) + ':' + String(storageEntry?.remotePath || ''),
  );
}

function thumbnailCacheFile({ sourcePath = '', stat = null, size = 360, outputKey = '', storageEntry = null } = {}) {
  const canonicalSize = canonicalThumbnailSize(size);
  // 只有中央索引已经确认了逻辑输出键时才使用稳定的远端/逻辑键；
  // 尚未登记的本地 output 文件必须回退到路径、大小和 mtime，避免同名文件复用旧缩略图。
  const identity = outputKey && storageEntry
    ? 'output:' + outputKey + '|' + outputRevision(storageEntry) + '|' + canonicalSize
    : 'local:' + sourcePath + '|' + (stat?.size || 0) + '|' + Math.round(stat?.mtimeMs || 0) + '|' + canonicalSize;
  const key = crypto.createHash('sha1').update(identity).digest('hex').slice(0, 28);
  return path.join(config.THUMBNAILS_DIR, 'preview_' + canonicalSize + '_' + key + '.webp');
}

function pump() {
  while (activeJobs < MAX_JOBS && queue.length) {
    const job = queue.shift();
    activeJobs += 1;
    Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
      activeJobs -= 1;
      pump();
    });
  }
}

function ensureThumbnailFile(sourcePath, target, size) {
  if (fs.existsSync(target)) return Promise.resolve(target);
  const existing = inflight.get(target);
  if (existing) return existing;
  const promise = new Promise((resolve, reject) => {
    queue.push({ resolve, reject, task: async () => {
      if (fs.existsSync(target)) return target;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const canonicalSize = canonicalThumbnailSize(size);
      await sharp(sourcePath, { animated: false, limitInputPixels: false })
        .rotate()
        .resize({ width: canonicalSize, height: canonicalSize, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: config.THUMBNAIL_QUALITY || 78, effort: 2 })
        .toFile(target);
      return target;
    }});
    pump();
  }).finally(() => inflight.delete(target));
  inflight.set(target, promise);
  return promise;
}

async function ensureThumbnailForSource(sourcePath, options = {}) {
  if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('缩略图源文件不存在');
  if (!IMAGE_EXT_RE.test(String(sourcePath).split(/[?#]/)[0])) throw new Error('不支持的缩略图源文件格式');
  const stat = fs.statSync(sourcePath);
  const target = thumbnailCacheFile({ sourcePath, stat, size: options.size, outputKey: options.outputKey, storageEntry: options.storageEntry });
  await ensureThumbnailFile(sourcePath, target, options.size);
  return target;
}

async function prewarmThumbnailSources(sourcePath, options = {}) {
  const sizes = Array.isArray(options.sizes) && options.sizes.length ? options.sizes : [360, 720];
  const targets = [];
  for (const size of sizes) {
    try {
      targets.push(await ensureThumbnailForSource(sourcePath, { ...options, size }));
    } catch (error) {
      console.warn('[thumbnail] 预热缩略图失败 ' + sourcePath + ':', error?.message || error);
    }
  }
  return targets;
}

module.exports = {
  canonicalThumbnailSize,
  ensureThumbnailFile,
  ensureThumbnailForSource,
  prewarmThumbnailSources,
  thumbnailCacheFile,
};
