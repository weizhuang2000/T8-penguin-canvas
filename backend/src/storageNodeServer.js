'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const ROOT = path.resolve(process.env.T8_STORAGE_ROOT || path.join(process.cwd(), 'storage-data'));
const TOKEN = String(process.env.T8_STORAGE_TOKEN || '').trim();
const HOST = process.env.T8_STORAGE_HOST || '127.0.0.1';
const PORT = Number(process.env.T8_STORAGE_PORT) || 18768;
const MAX_BYTES = Math.max(1024 * 1024, Number(process.env.T8_STORAGE_MAX_BYTES) || 5 * 1024 * 1024 * 1024);

if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

function safeKey(value) {
  let decoded = '';
  try { decoded = decodeURIComponent(String(value || '')); } catch { decoded = String(value || ''); }
  const key = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!key || key.includes('\0')) return '';
  const parts = key.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return '';
  return parts.join('/');
}

function fileForKey(key) {
  const safe = safeKey(key);
  if (!safe) return '';
  const target = path.resolve(ROOT, ...safe.split('/'));
  return target.startsWith(ROOT + path.sep) ? target : '';
}

function authorized(req) {
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function requireToken(req, res, next) {
  if (!authorized(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  return next();
}

function walkFiles(dir = ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile() && !entry.name.includes('.upload-')) {
      const stat = fs.statSync(full);
      out.push({
        key: path.relative(ROOT, full).split(path.sep).join('/'),
        size: stat.size,
        mtimeMs: stat.mtimeMs || 0,
      });
    }
  }
  return out;
}

const app = express();
app.disable('x-powered-by');
app.use(requireToken);

app.get('/v1/health', (_req, res) => {
  let disk = {};
  try {
    const stat = fs.statfsSync(ROOT);
    disk = {
      totalBytes: Number(stat.blocks) * Number(stat.bsize),
      freeBytes: Number(stat.bfree) * Number(stat.bsize),
      availableBytes: Number(stat.bavail) * Number(stat.bsize),
    };
  } catch { /* Node/platform may not expose statfsSync. */ }
  res.json({ success: true, data: { ok: true, service: 't8-output-storage-node', version: 1, ...disk } });
});

app.get('/v1/files', (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
  const cursor = safeKey(req.query.cursor || '');
  const all = walkFiles().sort((a, b) => a.key.localeCompare(b.key));
  const found = cursor ? all.findIndex((item) => item.key > cursor) : 0;
  const start = cursor && found < 0 ? all.length : found;
  const items = start < 0 ? [] : all.slice(start, start + limit);
  const nextCursor = start >= 0 && start + limit < all.length ? items.at(-1)?.key || '' : '';
  res.json({ success: true, data: { items, nextCursor } });
});

app.put('/v1/files/*', (req, res) => {
  const key = safeKey(req.params[0]);
  const target = fileForKey(key);
  if (!target) return res.status(400).json({ success: false, error: 'Invalid file key' });
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return res.status(413).json({ success: false, error: 'File is too large' });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.upload-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  const output = fs.createWriteStream(temp, { flags: 'wx' });
  const hash = crypto.createHash('sha256');
  const expectedHash = String(req.headers['x-t8-content-sha256'] || '').trim().toLowerCase();
  let size = 0;
  let done = false;

  const cleanup = () => {
    if (done) return;
    done = true;
    try { output.destroy(); } catch { /* ignore */ }
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* ignore */ }
  };
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      cleanup();
      req.destroy();
      return;
    }
    hash.update(chunk);
  });
  req.on('aborted', cleanup);
  output.on('error', (error) => {
    cleanup();
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
  });
  output.on('finish', () => {
    if (done) return;
    if (size > MAX_BYTES) {
      cleanup();
      return res.status(413).json({ success: false, error: 'File is too large' });
    }
    done = true;
    try {
      const etag = hash.digest('hex');
      if (expectedHash && (!/^[a-f0-9]{64}$/.test(expectedHash) || expectedHash !== etag)) {
        try { fs.unlinkSync(temp); } catch { /* ignore */ }
        return res.status(400).json({ success: false, error: 'SHA-256 mismatch' });
      }
      fs.renameSync(temp, target);
      return res.json({ success: true, data: { key, size, etag } });
    } catch (error) {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* ignore */ }
      return res.status(500).json({ success: false, error: error.message });
    }
  });
  req.pipe(output);
});

function sendFile(req, res) {
  const key = safeKey(req.params[0]);
  const target = fileForKey(key);
  if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(target);
}
app.get('/v1/files/*', sendFile);
app.head('/v1/files/*', sendFile);

app.delete('/v1/files/*', (req, res) => {
  const key = safeKey(req.params[0]);
  const target = fileForKey(key);
  if (!target) return res.status(400).json({ success: false, error: 'Invalid file key' });
  if (!fs.existsSync(target)) return res.status(404).json({ success: false, error: 'File not found' });
  fs.unlinkSync(target);
  res.json({ success: true, data: { key, deleted: true } });
});

if (require.main === module) {
  if (!TOKEN || TOKEN.length < 24) {
    console.error('T8_STORAGE_TOKEN 必须设置为至少 24 个字符的随机 Token');
    process.exit(1);
  }
  app.listen(PORT, HOST, () => {
    console.log(`[t8-storage-node] listening on http://${HOST}:${PORT}`);
    console.log(`[t8-storage-node] root: ${ROOT}`);
  });
}

module.exports = { app, fileForKey, safeKey };
