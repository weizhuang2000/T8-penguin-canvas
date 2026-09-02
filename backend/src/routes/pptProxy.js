'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { serviceUrl, getPptServiceState } = require('../pptServiceManager');

const router = express.Router();
router.use(requireAuth);

function identityHeader(value) {
  return encodeURIComponent(String(value || ''));
}

function parsedRequestBody(req) {
  if (req.body === undefined || !req.readableEnded) return null;
  if (Buffer.isBuffer(req.body)) return req.body;
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Buffer.from(new URLSearchParams(req.body).toString());
  }
  if (typeof req.body === 'string') return Buffer.from(req.body);
  return Buffer.from(JSON.stringify(req.body));
}

function proxy(req, res) {
  const suffix = req.originalUrl.replace(/^\/api\/ppt/, '') || '/';
  const target = new URL(`/api${suffix.startsWith('/') ? suffix : `/${suffix}`}`, serviceUrl());
  const transport = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host, connection: 'close' };
  ['authorization', 'cookie', 'x-t8-ppt-internal-secret', 'x-t8-user-id', 'x-t8-username', 'x-t8-email', 'x-t8-name', 'x-t8-role'].forEach((key) => delete headers[key]);
  headers['x-t8-ppt-internal-secret'] = process.env.T8_PPT_INTERNAL_SECRET || '';
  headers['x-t8-user-id'] = identityHeader(req.user.id);
  headers['x-t8-username'] = identityHeader(req.user.username);
  headers['x-t8-email'] = identityHeader(req.user.email);
  headers['x-t8-name'] = identityHeader(req.user.name || req.user.username);
  headers['x-t8-role'] = identityHeader(req.user.role || 'designer');
  // The global Express body parsers run before this router. Replay an already
  // consumed JSON/form body; otherwise Python waits forever for the original
  // Content-Length. Multipart, SSE, and binary traffic remains streaming.
  const body = parsedRequestBody(req);
  if (body) {
    headers['content-length'] = String(body.length);
    delete headers['transfer-encoding'];
  }
  const upstream = transport.request({ protocol: target.protocol, hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers }, (up) => {
    res.statusCode = up.statusCode || 502;
    Object.entries(up.headers).forEach(([key, value]) => { if (value !== undefined) res.setHeader(key, value); });
    up.pipe(res);
  });
  upstream.on('error', (error) => { if (!res.headersSent) res.status(503).json({ success: false, error: `PPT 服务不可用：${error.message}` }); else res.destroy(error); });
  if (body) upstream.end(body);
  else req.pipe(upstream);
}

router.get('/health', (_req, res) => res.json({ success: true, data: getPptServiceState() }));
router.use((req, res) => proxy(req, res));

module.exports = router;
