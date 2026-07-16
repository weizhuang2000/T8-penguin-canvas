'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const REQUEST_TIMEOUT_MS = 30_000;
const TRANSFER_TIMEOUT_MS = 30 * 60_000;

function splitRemotePath(value) {
  return String(value || '').replace(/\\/g, '/').split('/').map((part) => part.trim()).filter(Boolean);
}

function joinRemotePath(...values) {
  const parts = values.flatMap(splitRemotePath);
  return parts.length ? `/${parts.join('/')}` : '/';
}

function dirnameRemotePath(value) {
  const parts = splitRemotePath(value);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

function encodeRemotePath(value) {
  return splitRemotePath(value).map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

function buildWebdavUrl(baseUrl, remotePath = '') {
  const parsed = new URL(String(baseUrl || ''));
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  const base = parsed.href.replace(/\/+$/, '');
  const suffix = encodeRemotePath(remotePath);
  return suffix ? `${base}/${suffix}` : base;
}

function webdavAuthHeaders(cfg = {}) {
  const username = String(cfg.username || '').trim();
  const password = String(cfg.password || '').trim();
  return username || password
    ? { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
    : {};
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function responseError(response, fallback) {
  const text = await response.text().catch(() => '');
  const error = new Error(text.slice(0, 500) || fallback || `WebDAV HTTP ${response.status}`);
  error.status = response.status;
  return error;
}

async function ensureDirectory(cfg, directoryPath) {
  let current = '';
  for (const segment of splitRemotePath(directoryPath)) {
    current = joinRemotePath(current, segment);
    const response = await fetchWithTimeout(buildWebdavUrl(cfg.webdavUrl, current), {
      method: 'MKCOL',
      headers: webdavAuthHeaders(cfg),
    });
    if ([200, 201, 204, 405].includes(response.status)) continue;
    throw await responseError(response, `WebDAV 创建目录失败 HTTP ${response.status}`);
  }
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

async function putFile(cfg, remotePath, filePath, contentType = 'application/octet-stream') {
  const stat = fs.statSync(filePath);
  const sha256 = await sha256File(filePath);
  await ensureDirectory(cfg, dirnameRemotePath(remotePath));
  const response = await fetchWithTimeout(buildWebdavUrl(cfg.webdavUrl, remotePath), {
    method: 'PUT',
    headers: {
      ...webdavAuthHeaders(cfg),
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
    },
    body: fs.createReadStream(filePath),
    duplex: 'half',
  }, TRANSFER_TIMEOUT_MS);
  if (!response.ok) throw await responseError(response, `WebDAV 上传失败 HTTP ${response.status}`);

  const head = await fetchWithTimeout(buildWebdavUrl(cfg.webdavUrl, remotePath), {
    method: 'HEAD',
    headers: webdavAuthHeaders(cfg),
  });
  if (!head.ok) throw await responseError(head, `WebDAV 上传校验失败 HTTP ${head.status}`);
  const remoteSize = Number(head.headers.get('content-length') || 0);
  if (remoteSize > 0 && remoteSize !== stat.size) throw new Error(`WebDAV 上传校验失败：远端大小 ${remoteSize}，本地大小 ${stat.size}`);
  return {
    remotePath: joinRemotePath(remotePath),
    size: stat.size,
    sha256,
    etag: String(head.headers.get('etag') || '').replace(/^W\//, ''),
    contentType: head.headers.get('content-type') || contentType,
  };
}

async function deletePath(cfg, remotePath) {
  const response = await fetchWithTimeout(buildWebdavUrl(cfg.webdavUrl, remotePath), {
    method: 'DELETE',
    headers: webdavAuthHeaders(cfg),
  });
  if ([200, 202, 204, 404].includes(response.status)) return response.status !== 404;
  throw await responseError(response, `WebDAV 删除失败 HTTP ${response.status}`);
}

async function proxyFile(cfg, remotePath, req, res) {
  const forwarded = webdavAuthHeaders(cfg);
  if (req.headers.range) forwarded.Range = req.headers.range;
  if (req.headers['if-none-match']) forwarded['If-None-Match'] = req.headers['if-none-match'];
  if (req.headers['if-modified-since']) forwarded['If-Modified-Since'] = req.headers['if-modified-since'];
  const response = await fetchWithTimeout(buildWebdavUrl(cfg.webdavUrl, remotePath), {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: forwarded,
  }, TRANSFER_TIMEOUT_MS);
  res.status(response.status);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control']) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!response.body || req.method === 'HEAD') return res.end();
  return Readable.fromWeb(response.body).pipe(res);
}

async function downloadFile(cfg, remotePath, targetPath) {
  const response = await fetchWithTimeout(buildWebdavUrl(cfg.webdavUrl, remotePath), {
    headers: webdavAuthHeaders(cfg),
  }, TRANSFER_TIMEOUT_MS);
  if (!response.ok || !response.body) throw await responseError(response, `WebDAV 下载失败 HTTP ${response.status}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temp = `${targetPath}.tmp-${Date.now()}`;
  const output = fs.createWriteStream(temp, { flags: 'wx' });
  try {
    await new Promise((resolve, reject) => {
      const input = Readable.fromWeb(response.body);
      input.on('error', reject);
      output.on('error', reject).on('finish', resolve);
      input.pipe(output);
    });
    fs.renameSync(temp, targetPath);
    return targetPath;
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* ignore */ }
    throw error;
  }
}

function xmlUnescape(value) {
  return String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function xmlTag(block, name) {
  const match = new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, 'i').exec(block);
  return match ? xmlUnescape(match[1]).trim() : '';
}

function hrefToRemotePath(cfg, href) {
  try {
    const base = new URL(String(cfg.webdavUrl || ''));
    const url = new URL(href, base);
    const basePath = decodeURIComponent(base.pathname).replace(/\/+$/, '');
    const fullPath = decodeURIComponent(url.pathname);
    const relative = fullPath.startsWith(`${basePath}/`) ? fullPath.slice(basePath.length) : fullPath;
    return joinRemotePath(relative);
  } catch {
    return '';
  }
}

function parsePropfind(cfg, xml) {
  const blocks = String(xml || '').match(/<(?:[\w-]+:)?response\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?response>/gi) || [];
  return blocks.map((block) => {
    const remotePath = hrefToRemotePath(cfg, xmlTag(block, 'href'));
    const isDirectory = /<(?:[\w-]+:)?collection\b/i.test(block);
    return {
      remotePath,
      isDirectory,
      size: Number(xmlTag(block, 'getcontentlength')) || 0,
      contentType: xmlTag(block, 'getcontenttype'),
      etag: xmlTag(block, 'getetag').replace(/^W\//, ''),
      mtimeMs: Date.parse(xmlTag(block, 'getlastmodified')) || 0,
    };
  }).filter((item) => item.remotePath);
}

async function propfind(cfg, remotePath) {
  const body = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getcontenttype/><d:getetag/><d:getlastmodified/></d:prop></d:propfind>';
  const response = await fetchWithTimeout(buildWebdavUrl(cfg.webdavUrl, remotePath), {
    method: 'PROPFIND',
    headers: { ...webdavAuthHeaders(cfg), Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    body,
  });
  if (response.status !== 207 && !response.ok) throw await responseError(response, `WebDAV 列表读取失败 HTTP ${response.status}`);
  return parsePropfind(cfg, await response.text());
}

function ignoredRemotePath(remotePath) {
  const text = String(remotePath || '').toLowerCase();
  return text.includes('/.t8-upload-check') || /(?:\.upload-|\.part$|\.tmp$)/.test(text);
}

async function listFilesRecursive(cfg, rootPath) {
  const root = joinRemotePath(rootPath);
  const queue = [root];
  const visited = new Set();
  const files = [];
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const items = await propfind(cfg, current);
    for (const item of items) {
      if (item.remotePath === current || ignoredRemotePath(item.remotePath)) continue;
      if (item.isDirectory) queue.push(item.remotePath);
      else files.push(item);
    }
  }
  return files;
}

async function testConnection(cfg) {
  const folder = joinRemotePath(cfg.folder || '/T8PenguinCanvas');
  await ensureDirectory(cfg, folder);
  await propfind(cfg, folder);
  return { ok: true, provider: 'baidu-netdisk', capacityManagedExternally: true };
}

module.exports = {
  buildWebdavUrl,
  deletePath,
  dirnameRemotePath,
  downloadFile,
  encodeRemotePath,
  ensureDirectory,
  joinRemotePath,
  listFilesRecursive,
  parsePropfind,
  propfind,
  proxyFile,
  putFile,
  splitRemotePath,
  testConnection,
  webdavAuthHeaders,
};
