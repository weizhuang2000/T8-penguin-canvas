'use strict';

const fs = require('fs');
const { Readable } = require('stream');

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 30 * 60_000;

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = require('crypto').createHash('sha256');
    fs.createReadStream(filePath).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

function endpoint(space, pathname) {
  return `${String(space?.baseUrl || '').replace(/\/+$/, '')}${pathname}`;
}

function headers(space, extra = {}) {
  return { Authorization: `Bearer ${space.apiToken}`, ...extra };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseError(response) {
  const body = await response.text().catch(() => '');
  try {
    const json = JSON.parse(body);
    return json?.error || json?.message || `HTTP ${response.status}`;
  } catch {
    return body.slice(0, 300) || `HTTP ${response.status}`;
  }
}

async function testStorageSpace(space) {
  const response = await fetchWithTimeout(endpoint(space, '/v1/health'), {
    headers: headers(space),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

async function uploadStorageFile(space, key, filePath, meta = {}) {
  const stat = fs.statSync(filePath);
  const digest = await sha256File(filePath);
  const response = await fetchWithTimeout(
    endpoint(space, `/v1/files/${encodeURIComponent(key).replace(/%2F/gi, '/')}`),
    {
      method: 'PUT',
      headers: headers(space, {
        'Content-Type': meta.contentType || 'application/octet-stream',
        'Content-Length': String(stat.size),
        'X-T8-Content-SHA256': digest,
      }),
      body: fs.createReadStream(filePath),
      duplex: 'half',
    },
    UPLOAD_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(await parseError(response));
  const result = await response.json();
  const remoteDigest = result?.data?.etag || result?.etag || '';
  if (remoteDigest && remoteDigest !== digest) throw new Error('远端存储文件摘要校验失败');
  return result;
}

async function deleteStorageFile(space, key) {
  const response = await fetchWithTimeout(
    endpoint(space, `/v1/files/${encodeURIComponent(key).replace(/%2F/gi, '/')}`),
    { method: 'DELETE', headers: headers(space) },
  );
  if (!response.ok && response.status !== 404) throw new Error(await parseError(response));
  return response.status !== 404;
}

async function downloadStorageFile(space, key, targetPath) {
  const response = await fetchWithTimeout(
    endpoint(space, `/v1/files/${encodeURIComponent(key).replace(/%2F/gi, '/')}`),
    { headers: headers(space) },
    5 * 60_000,
  );
  if (!response.ok || !response.body) throw new Error(await parseError(response));
  const temp = `${targetPath}.tmp-${Date.now()}`;
  fs.mkdirSync(require('path').dirname(targetPath), { recursive: true });
  const output = fs.createWriteStream(temp, { flags: 'wx' });
  try {
    await new Promise((resolve, reject) => {
      Readable.fromWeb(response.body).pipe(output).on('finish', resolve).on('error', reject);
    });
    fs.renameSync(temp, targetPath);
    return targetPath;
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* ignore */ }
    throw error;
  }
}

async function listStorageFiles(space, cursor = '', limit = 500) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  const response = await fetchWithTimeout(endpoint(space, `/v1/files?${query}`), {
    headers: headers(space),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

async function proxyStorageFile(space, key, req, res) {
  const forwarded = {};
  if (req.headers.range) forwarded.Range = req.headers.range;
  if (req.headers['if-none-match']) forwarded['If-None-Match'] = req.headers['if-none-match'];
  if (req.headers['if-modified-since']) forwarded['If-Modified-Since'] = req.headers['if-modified-since'];
  const response = await fetchWithTimeout(
    endpoint(space, `/v1/files/${encodeURIComponent(key).replace(/%2F/gi, '/')}`),
    { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: headers(space, forwarded) },
    5 * 60_000,
  );
  res.status(response.status);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control']) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader(
    'Cache-Control',
    response.status === 200 || response.status === 206
      ? 'private, max-age=31536000, immutable'
      : 'no-store',
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!response.body || req.method === 'HEAD') return res.end();
  return Readable.fromWeb(response.body).pipe(res);
}

module.exports = {
  deleteStorageFile,
  downloadStorageFile,
  listStorageFiles,
  proxyStorageFile,
  testStorageSpace,
  uploadStorageFile,
};
