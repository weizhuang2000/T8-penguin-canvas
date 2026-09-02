'use strict';

const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const config = require('../../config');
const { resolveMediaRef, mimeFromPath } = require('../../providers/mediaResolver');

const MAX_ASSETS = 32;
const MAX_REMOTE_BYTES = 500 * 1024 * 1024;
const MAX_DATA_URL_BYTES = 50 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 60 * 1000;
const MAX_REDIRECTS = 5;

function isInside(root, target) {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  return resolved === base || resolved.startsWith(base + path.sep);
}

function resourceLibraryRoot() {
  try {
    if (fs.existsSync(config.SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf8'));
      if (String(settings.resourceLibraryPath || '').trim()) return String(settings.resourceLibraryPath).trim();
    }
  } catch (_) {}
  return config.DEFAULT_RESOURCE_LIBRARY_DIR || '';
}

function allowedLocalRoots() {
  return [
    config.INPUT_DIR,
    config.OUTPUT_DIR,
    // Output/input storage may materialize cloud-backed files into these
    // server-managed caches before a worker consumes them. They remain
    // controlled application directories, so allow only these exact roots.
    path.join(config.DATA_DIR, 'input-cache'),
    path.join(config.DATA_DIR, 'output-cache'),
    config.THUMBNAILS_DIR,
    config.CAM_OUTPUT_ROOT,
    resourceLibraryRoot(),
  ].filter(Boolean).map((item) => path.resolve(item));
}

function isPrivateAddress(address) {
  const type = net.isIP(address);
  if (type === 4) {
    const p = address.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254)
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
  }
  if (type === 6) {
    const v = address.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:');
  }
  return true;
}

async function assertSafeRemoteUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('远端素材仅支持 HTTP/HTTPS');
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost')) throw new Error('禁止访问本机素材地址');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error('禁止访问内网素材地址');
  return url;
}

function safeAssetId(value, index) {
  return String(value || `asset-${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || `asset-${index + 1}`;
}

function extensionFor(asset, mime = '') {
  const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.mp4', '.webm', '.mov', '.m4v', '.mkv', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
  for (const candidate of [asset.label, asset.url]) {
    try {
      const value = /^https?:/i.test(String(candidate || '')) ? new URL(candidate).pathname : String(candidate || '').split(/[?#]/)[0];
      const ext = path.extname(value).toLowerCase();
      if (allowed.has(ext)) return ext;
    } catch (_) {}
  }
  const low = String(mime || '').toLowerCase();
  if (low.includes('png')) return '.png';
  if (low.includes('jpeg')) return '.jpg';
  if (low.includes('webp')) return '.webp';
  if (low.includes('gif')) return '.gif';
  if (low.includes('webm')) return '.webm';
  if (low.includes('quicktime')) return '.mov';
  if (low.includes('mp4')) return '.mp4';
  if (low.includes('wav')) return '.wav';
  if (low.includes('ogg')) return '.ogg';
  if (low.includes('flac')) return '.flac';
  if (low.includes('audio') || low.includes('mpeg')) return '.mp3';
  return asset.kind === 'image' ? '.png' : asset.kind === 'video' ? '.mp4' : '.mp3';
}

async function fetchRemoteToFile(rawUrl, target, asset) {
  let current = String(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertSafeRemoteUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
    try {
      const response = await fetch(current, { signal: controller.signal, redirect: 'manual' });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('远端素材重定向缺少 Location');
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`拉取远端素材失败: HTTP ${response.status}`);
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > MAX_REMOTE_BYTES) throw new Error('远端素材超过 500MB 限制');
      let written = 0;
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          written += chunk.length;
          if (written > MAX_REMOTE_BYTES) callback(new Error('远端素材超过 500MB 限制'));
          else callback(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(target, { flags: 'wx' }));
      return { mime: response.headers.get('content-type') || '', size: written, finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('远端素材重定向次数过多');
}

async function stageOne(asset, index, publicDir) {
  const id = safeAssetId(asset.id, index);
  if (!['image', 'video', 'audio'].includes(asset.kind)) throw new Error(`素材 ${id} 类型无效`);
  const raw = String(asset.url || '').trim();
  if (!raw) throw new Error(`素材 ${id} 地址为空`);

  if (/^data:[^;,]+;base64,/i.test(raw)) {
    const match = raw.match(/^data:([^;,]+);base64,(.+)$/i);
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_DATA_URL_BYTES) throw new Error(`素材 ${id} 的 data URL 超过 50MB`);
    const ext = extensionFor(asset, match[1]);
    const name = `${String(index + 1).padStart(2, '0')}-${id}${ext}`;
    fs.writeFileSync(path.join(publicDir, name), buffer, { flag: 'wx' });
    return { id, kind: asset.kind, label: String(asset.label || id).slice(0, 200), src: name, mime: match[1], size: buffer.length };
  }

  if (/^https?:\/\//i.test(raw)) {
    const provisional = `${String(index + 1).padStart(2, '0')}-${id}${extensionFor(asset)}`;
    const target = path.join(publicDir, provisional);
    const downloaded = await fetchRemoteToFile(raw, target, asset);
    return { id, kind: asset.kind, label: String(asset.label || id).slice(0, 200), src: provisional, mime: downloaded.mime || mimeFromPath(target), size: downloaded.size };
  }

  const resolved = await resolveMediaRef(raw, { target: 'local-path' });
  const localPath = path.resolve(resolved.path);
  if (!allowedLocalRoots().some((root) => isInside(root, localPath))) throw new Error(`素材 ${id} 不在允许的本地目录中`);
  if (!fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) throw new Error(`素材 ${id} 文件不存在`);
  const ext = extensionFor(asset, resolved.mime || mimeFromPath(localPath));
  const name = `${String(index + 1).padStart(2, '0')}-${id}${ext}`;
  fs.copyFileSync(localPath, path.join(publicDir, name), fs.constants.COPYFILE_EXCL);
  const stat = fs.statSync(localPath);
  return { id, kind: asset.kind, label: String(asset.label || path.basename(localPath)).slice(0, 200), src: name, mime: resolved.mime || mimeFromPath(localPath), size: stat.size };
}

async function stageAssets(assets, publicDir) {
  const list = Array.isArray(assets) ? assets : [];
  if (list.length > MAX_ASSETS) throw new Error(`素材数量超过 ${MAX_ASSETS} 个限制`);
  fs.mkdirSync(publicDir, { recursive: true });
  const out = [];
  const seen = new Set();
  for (let index = 0; index < list.length; index += 1) {
    const staged = await stageOne(list[index], index, publicDir);
    if (seen.has(staged.id)) throw new Error(`素材 ID 重复: ${staged.id}`);
    seen.add(staged.id);
    out.push(staged);
  }
  return out;
}

module.exports = {
  MAX_ASSETS,
  MAX_DATA_URL_BYTES,
  MAX_REMOTE_BYTES,
  allowedLocalRoots,
  assertSafeRemoteUrl,
  isPrivateAddress,
  stageAssets,
};
