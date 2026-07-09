const fs = require('fs');
const path = require('path');
const config = require('../config');

const DEFAULT_BASE_URL = `http://127.0.0.1:${config.PORT}`;

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.txt': 'text/plain',
  '.json': 'application/json',
};

function cleanBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function isDataUrl(value) {
  return /^data:[^;,]+;base64,/i.test(String(value || '').trim());
}

function parseDataUrl(value) {
  const text = String(value || '').trim();
  const match = text.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;
  return {
    mime: match[1] || 'application/octet-stream',
    base64: match[2] || '',
    dataUrl: text,
  };
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isT8RelativeUrl(value) {
  return /^\/(?:files|api\/resources|api\/files|input|output)\//.test(String(value || '').trim());
}

function mediaRefToAbsoluteUrl(value, options = {}) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (isDataUrl(text) || isRemoteUrl(text)) return text;
  if (isT8RelativeUrl(text)) return `${cleanBaseUrl(options.baseUrl)}${text}`;
  return text;
}

function safeJoinInside(root, relative) {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return '';
  return target;
}

function decodeUrlPathPart(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/^\/+/, ''));
  } catch {
    return String(value || '').replace(/^\/+/, '');
  }
}

function readSettingsResourceLibraryPath() {
  try {
    if (!fs.existsSync(config.SETTINGS_FILE)) return '';
    const settings = JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf-8'));
    return String(settings.resourceLibraryPath || '').trim();
  } catch {
    return '';
  }
}

function resourceLibraryRoot(options = {}) {
  return String(
    options.resourceLibraryPath
    || readSettingsResourceLibraryPath()
    || config.DEFAULT_RESOURCE_LIBRARY_DIR
    || '',
  ).trim();
}

function readResourceLibraryDb(root) {
  if (!root) return null;
  try {
    const file = path.join(root, 'resource_library.json');
    if (!fs.existsSync(file)) return null;
    const db = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return db && typeof db === 'object' ? db : null;
  } catch {
    return null;
  }
}

function findResourceItem(db, id) {
  const cleanId = String(id || '').trim();
  if (!cleanId || !Array.isArray(db?.items)) return null;
  return db.items.find((item) => String(item?.id || '') === cleanId) || null;
}

function resolveResourceLibraryMediaPath(value, options = {}) {
  const text = String(value || '').trim().split(/[?#]/)[0];
  const fileMatch = /^\/api\/resources\/file\/([^/?#]+)/.exec(text);
  const setFileMatch = /^\/api\/resources\/set-file\/([^/?#]+)\/(\d+)/.exec(text);
  if (!fileMatch && !setFileMatch) return null;

  const root = resourceLibraryRoot(options);
  const db = readResourceLibraryDb(root);
  if (!db) return null;

  if (fileMatch) {
    const item = findResourceItem(db, decodeUrlPathPart(fileMatch[1]));
    if (!item?.fileRel) return null;
    const filePath = safeJoinInside(root, item.fileRel);
    return filePath ? {
      path: filePath,
      mime: item.mime || mimeFromPath(filePath),
    } : null;
  }

  const item = findResourceItem(db, decodeUrlPathPart(setFileMatch[1]));
  const index = Number(setFileMatch[2]);
  const child = item?.kind === 'set' && Array.isArray(item.materialSetItems)
    ? item.materialSetItems[index]
    : null;
  if (!child?.fileRel) return null;
  const filePath = safeJoinInside(root, child.fileRel);
  return filePath ? {
    path: filePath,
    mime: child.mime || mimeFromPath(filePath),
  } : null;
}

function uniqueExistingDirs(dirs) {
  const seen = new Set();
  const out = [];
  for (const dir of dirs) {
    const clean = String(dir || '').trim();
    if (!clean) continue;
    const resolved = path.resolve(clean);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    if (fs.existsSync(resolved)) out.push(resolved);
  }
  return out;
}

function resolvePublicAssetMediaPath(value) {
  const text = String(value || '').trim().split(/[?#]/)[0];
  const prefix = '/artist-style-master/generated/';
  if (!text.startsWith(prefix)) return '';

  const relative = decodeUrlPathPart(text.slice(prefix.length));
  if (!relative) return '';

  const roots = uniqueExistingDirs([
    config.FRONTEND_DIST ? path.join(config.FRONTEND_DIST, 'artist-style-master', 'generated') : '',
    path.join(config.BASE_DIR, 'public', 'artist-style-master', 'generated'),
    path.resolve(__dirname, '..', '..', '..', 'public', 'artist-style-master', 'generated'),
  ]);

  for (const root of roots) {
    const filePath = safeJoinInside(root, relative);
    if (filePath && fs.existsSync(filePath)) return filePath;
  }
  return '';
}

function resolveT8LocalMediaPath(value, options = {}) {
  const text = String(value || '').trim().split(/[?#]/)[0];
  const resourcePath = resolveResourceLibraryMediaPath(text, options);
  if (resourcePath?.path) return resourcePath.path;
  const publicAssetPath = resolvePublicAssetMediaPath(text);
  if (publicAssetPath) return publicAssetPath;
  const rules = [
    ['/files/input/', config.INPUT_DIR],
    ['/input/', config.INPUT_DIR],
    ['/files/output/', config.OUTPUT_DIR],
    ['/output/', config.OUTPUT_DIR],
    ['/files/thumbnails/', config.THUMBNAILS_DIR],
  ];
  for (const [prefix, root] of rules) {
    if (text.startsWith(prefix)) {
      const relative = decodeUrlPathPart(text.slice(prefix.length));
      return safeJoinInside(root, relative);
    }
  }
  const camPrefix = '/files/cam-output/';
  if (text.startsWith(camPrefix)) {
    const parts = text.slice(camPrefix.length).split('/').map(decodeUrlPathPart);
    if (parts.length === 2 && parts[0] && parts[1]) {
      return safeJoinInside(path.join(config.CAM_OUTPUT_ROOT, parts[0], 'camoutput'), parts[1]);
    }
  }
  const legacyCamPrefix = '/api/files/cam-output/projects/';
  if (text.startsWith(legacyCamPrefix)) {
    const rest = text.slice(legacyCamPrefix.length);
    const marker = '/image/';
    const markerIndex = rest.indexOf(marker);
    if (markerIndex > 0) {
      const project = decodeUrlPathPart(rest.slice(0, markerIndex));
      const filename = decodeUrlPathPart(rest.slice(markerIndex + marker.length));
      if (project && filename) {
        return safeJoinInside(path.join(config.CAM_OUTPUT_ROOT, project, 'camoutput'), filename);
      }
    }
  }
  return '';
}

function mimeFromPath(filePath, fallback = 'application/octet-stream') {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return MIME_BY_EXT[ext] || fallback;
}

function filePathFromFileUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'file:') return '';
    let p = decodeURIComponent(parsed.pathname || '');
    if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
    return p;
  } catch {
    return '';
  }
}

function resolveDirectLocalPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('file://')) return filePathFromFileUrl(text);
  if (path.isAbsolute(text)) return text;
  return '';
}

function dataUrlFromFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const mime = mimeFromPath(filePath);
  const base64 = buf.toString('base64');
  return {
    kind: 'data-url',
    dataUrl: `data:${mime};base64,${base64}`,
    base64,
    mime,
    path: filePath,
  };
}

async function resolveMediaRef(value, options = {}) {
  const target = options.target || 'url';
  const text = String(value || '').trim();
  if (!text) throw new Error('媒体引用为空');

  if (isDataUrl(text)) {
    const parsed = parseDataUrl(text);
    return {
      kind: 'data-url',
      source: text,
      dataUrl: parsed.dataUrl,
      base64: parsed.base64,
      mime: parsed.mime,
      url: parsed.dataUrl,
    };
  }

  const resourcePath = resolveResourceLibraryMediaPath(text, options);
  const t8Path = resourcePath?.path || resolveT8LocalMediaPath(text, options);
  const localPath = t8Path || resolveDirectLocalPath(text);

  if (target === 'local-path') {
    if (localPath && fs.existsSync(localPath)) {
      return {
        kind: 'local-path',
        source: text,
        path: localPath,
        mime: resourcePath?.mime || mimeFromPath(localPath),
      };
    }
    throw new Error(`无法解析本地媒体路径：${text.slice(0, 160)}`);
  }

  if (target === 'data-url' || target === 'base64') {
    if (localPath && fs.existsSync(localPath)) {
      const resolved = dataUrlFromFile(localPath);
      return target === 'base64'
        ? { ...resolved, kind: 'base64', dataUrl: undefined }
        : { ...resolved, source: text };
    }
    if (isRemoteUrl(text) || isT8RelativeUrl(text)) {
      const url = mediaRefToAbsoluteUrl(text, options);
      return {
        kind: 'url',
        source: text,
        url,
      };
    }
    throw new Error(`无法转换媒体为 base64：${text.slice(0, 160)}`);
  }

  if (isRemoteUrl(text) || isT8RelativeUrl(text)) {
    return {
      kind: 'url',
      source: text,
      url: mediaRefToAbsoluteUrl(text, options),
    };
  }

  if (localPath && fs.existsSync(localPath)) {
    return {
      kind: 'local-path',
      source: text,
      path: localPath,
      mime: mimeFromPath(localPath),
    };
  }

  throw new Error(`不支持的媒体引用：${text.slice(0, 160)}`);
}

module.exports = {
  isDataUrl,
  mediaRefToAbsoluteUrl,
  mimeFromPath,
  resolveMediaRef,
  resolvePublicAssetMediaPath,
  resolveResourceLibraryMediaPath,
  resolveT8LocalMediaPath,
};
