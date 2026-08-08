import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('output storage settings normalize active space and preserve masked token', () => {
  const settings = require('../backend/src/outputStorage/settings.js');
  const current = settings.normalizeOutputStorageSpaces([
    { id: 'ecs-secondary', type: 't8-storage-node', label: 'ECS 2', enabled: true, baseUrl: 'https://storage.example.com', apiToken: 'secret-token-1234567890' },
  ]);
  const next = settings.normalizeOutputStorageSpaces([
    { id: 'ecs-secondary', type: 't8-storage-node', label: 'ECS 2', enabled: true, baseUrl: 'https://storage.example.com/', apiToken: '****7890' },
  ], current);
  const remote = next.find((item) => item.id === 'ecs-secondary');
  assert.equal(next[0].id, 'primary');
  assert.equal(remote.apiToken, 'secret-token-1234567890');
  assert.equal(remote.baseUrl, 'https://storage.example.com');
  assert.equal(settings.normalizeActiveOutputStorageSpaceId('ecs-secondary', next), 'ecs-secondary');
  assert.equal(settings.maskOutputStorageSpaces(next).find((item) => item.id === 'ecs-secondary').apiToken, '****7890');
});

test('enabled Baidu cloud target is derived as an output storage space', () => {
  const settings = require('../backend/src/outputStorage/settings.js');
  const spaces = settings.normalizeOutputStorageSpaces([], [], [{
    id: 'baidu-netdisk',
    provider: 'baidu-netdisk',
    label: '我的百度网盘',
    enabled: true,
    baiduNetdisk: { webdavUrl: 'http://127.0.0.1:5244/dav/baidu' },
  }]);
  const baidu = spaces.find((item) => item.id === 'cloud-baidu-netdisk');
  assert.equal(baidu.type, 'cloud-upload-target');
  assert.equal(baidu.cloudTargetId, 'baidu-netdisk');
  assert.equal(baidu.enabled, true);
  assert.equal(settings.normalizeActiveOutputStorageSpaceId(baidu.id, spaces), baidu.id);
});

function createMockWebdavServer() {
  const files = new Map();
  const directories = new Set(['/']);
  const state = { failPuts: 0, headMethodNotAllowed: false, getCounts: new Map(), getDelayMs: 0 };
  const rootPrefix = '/dav/百度网盘';
  const remotePath = (url) => {
    const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
    const relative = pathname.startsWith(rootPrefix) ? pathname.slice(rootPrefix.length) : pathname;
    return `/${relative.split('/').filter(Boolean).join('/')}`;
  };
  const parent = (value) => {
    const parts = value.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join('/')}` : '/';
  };
  const href = (value) => `${encodeURI(rootPrefix)}${value.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Basic ${Buffer.from('alist-user:alist-pass').toString('base64')}`) {
      res.writeHead(401).end();
      return;
    }
    const key = remotePath(req.url);
    if (req.method === 'MKCOL') {
      directories.add(key);
      res.writeHead(201).end();
      return;
    }
    if (req.method === 'PUT') {
      if (state.failPuts > 0) {
        state.failPuts -= 1;
        res.writeHead(503).end('temporary upload failure');
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      directories.add(parent(key));
      files.set(key, Buffer.concat(chunks));
      res.writeHead(201).end();
      return;
    }
    if (req.method === 'HEAD') {
      if (state.headMethodNotAllowed) { res.writeHead(405).end('Method Not Allowed'); return; }
      const body = files.get(key);
      if (!body) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Length': body.length, 'Content-Type': 'application/octet-stream', ETag: 'mock-etag' }).end();
      return;
    }
    if (req.method === 'GET') {
      state.getCounts.set(key, (state.getCounts.get(key) || 0) + 1);
      if (state.getDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, state.getDelayMs));
      const body = files.get(key);
      if (!body) { res.writeHead(404).end(); return; }
      const match = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ''));
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : body.length - 1;
        const part = body.subarray(start, Math.min(end + 1, body.length));
        res.writeHead(206, { 'Content-Length': part.length, 'Content-Range': `bytes ${start}-${start + part.length - 1}/${body.length}`, 'Accept-Ranges': 'bytes' });
        res.end(part);
      } else {
        res.writeHead(200, { 'Content-Length': body.length, 'Accept-Ranges': 'bytes' });
        res.end(body);
      }
      return;
    }
    if (req.method === 'DELETE') {
      const existed = files.delete(key) || directories.delete(key);
      res.writeHead(existed ? 204 : 404).end();
      return;
    }
    if (req.method === 'PROPFIND') {
      const children = [];
      for (const dir of directories) if (dir !== key && parent(dir) === key) children.push({ key: dir, directory: true, size: 0 });
      for (const [file, body] of files) if (parent(file) === key) children.push({ key: file, directory: false, size: body.length });
      const responseXml = [{ key, directory: true, size: 0 }, ...children].map((item) => (
        `<d:response><d:href>${href(item.key)}</d:href><d:propstat><d:prop><d:resourcetype>${item.directory ? '<d:collection/>' : ''}</d:resourcetype><d:getcontentlength>${item.size}</d:getcontentlength><d:getcontenttype>${item.directory ? '' : 'application/octet-stream'}</d:getcontenttype><d:getetag>mock-etag</d:getetag><d:getlastmodified>Wed, 16 Jul 2026 00:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>`
      )).join('');
      res.writeHead(207, { 'Content-Type': 'application/xml' });
      res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${responseXml}</d:multistatus>`);
      return;
    }
    res.writeHead(405).end();
  });
  return { server, files, directories, state };
}

test('WebDAV upload succeeds when the gateway rejects HEAD verification', async (t) => {
  const mock = createMockWebdavServer();
  const server = await new Promise((resolve) => {
    const instance = mock.server.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  mock.state.headMethodNotAllowed = true;

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-webdav-head-405-'));
  const local = path.join(temp, 'test.png');
  fs.writeFileSync(local, Buffer.from('head-unsupported-payload'));
  const webdav = require('../backend/src/outputStorage/webdav.js');
  const webdavUrl = `http://127.0.0.1:${server.address().port}/dav/%E7%99%BE%E5%BA%A6%E7%BD%91%E7%9B%98`;
  const result = await webdav.putFile({ webdavUrl, username: 'alist-user', password: 'alist-pass' }, '/T8PenguinCanvas/output/test.png', local, 'image/png');

  assert.equal(result.size, Buffer.byteLength('head-unsupported-payload'));
  assert.equal(result.etag, '');
  assert.equal(mock.files.get('/T8PenguinCanvas/output/test.png').toString(), 'head-unsupported-payload');
});

test('storage node and manager upload, proxy metadata, reconcile and delete remote output', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-output-storage-'));
  const storageRoot = path.join(temp, 'remote');
  const outputRoot = path.join(temp, 'output');
  const dataRoot = path.join(temp, 'data');
  fs.mkdirSync(storageRoot, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(dataRoot, { recursive: true });

  const token = 'test-token-abcdefghijklmnopqrstuvwxyz';
  process.env.T8_STORAGE_ROOT = storageRoot;
  process.env.T8_STORAGE_TOKEN = token;
  const nodeModulePath = require.resolve('../backend/src/storageNodeServer.js');
  delete require.cache[nodeModulePath];
  const { app } = require(nodeModulePath);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: `Bearer ${token}` };

  const unauthorized = await fetch(`${baseUrl}/v1/health`);
  assert.equal(unauthorized.status, 401);
  const health = await fetch(`${baseUrl}/v1/health`, { headers: auth });
  assert.equal(health.status, 200);

  const config = require('../backend/src/config.js');
  config.DATA_DIR = dataRoot;
  config.OUTPUT_DIR = outputRoot;
  config.SETTINGS_FILE = path.join(dataRoot, 'settings.json');
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify({
    activeOutputStorageSpaceId: 'ecs-secondary',
    outputStorageSpaces: [
      { id: 'primary', type: 'local', label: 'Primary', enabled: true },
      { id: 'ecs-secondary', type: 't8-storage-node', label: 'ECS 2', enabled: true, baseUrl, apiToken: token },
    ],
  }));

  const managerPath = require.resolve('../backend/src/outputStorage/manager.js');
  delete require.cache[managerPath];
  const manager = require(managerPath);
  const key = 'image/generated-test.png';
  const local = path.join(outputRoot, 'image', 'generated-test.png');
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, Buffer.from('png-test-payload'));

  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  const entry = manager.storageEntryForKey(key);
  assert.equal(entry.storageSpaceId, 'ecs-secondary');
  assert.equal(fs.existsSync(local), false);
  assert.equal(fs.readFileSync(path.join(storageRoot, 'image', 'generated-test.png'), 'utf8'), 'png-test-payload');

  const range = await fetch(`${baseUrl}/v1/files/image/generated-test.png`, {
    headers: { ...auth, Range: 'bytes=0-2' },
  });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), 'png');

  const proxyApp = require('../backend/node_modules/express')();
  proxyApp.get('/files/output/*', manager.serveOutputFile);
  const proxyServer = await new Promise((resolve) => {
    const instance = proxyApp.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => proxyServer.close(resolve)));
  const proxied = await fetch(`http://127.0.0.1:${proxyServer.address().port}/files/output/${key}`, {
    headers: { Range: 'bytes=0-2' },
  });
  assert.equal(proxied.status, 206);
  assert.equal(proxied.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  assert.equal(await proxied.text(), 'png');

  const listed = await fetch(`${baseUrl}/v1/files?limit=10`, { headers: auth }).then((res) => res.json());
  assert.equal(listed.data.items[0].key, key);
  assert.equal(manager.storageMetadataForUrl('/files/output/image/generated-test.png').storageSpaceId, 'ecs-secondary');

  await manager.deleteOutputByKey(key);
  assert.equal(fs.existsSync(path.join(storageRoot, 'image', 'generated-test.png')), false);
  assert.equal(manager.storageEntryForKey(key), null);
});

test('Baidu WebDAV works as active output storage and reconciles the whole T8 directory', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-baidu-output-'));
  const mock = createMockWebdavServer();
  await new Promise((resolve) => mock.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => mock.server.close(resolve)));
  const webdavUrl = `http://127.0.0.1:${mock.server.address().port}/dav/%E7%99%BE%E5%BA%A6%E7%BD%91%E7%9B%98`;

  const config = require('../backend/src/config.js');
  config.DATA_DIR = path.join(temp, 'data');
  config.OUTPUT_DIR = path.join(temp, 'output');
  config.SETTINGS_FILE = path.join(config.DATA_DIR, 'settings.json');
  config.CANVAS_FILE = path.join(config.DATA_DIR, 'canvas_list.json');
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(config.CANVAS_FILE, '[]');
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify({
    activeOutputStorageSpaceId: 'cloud-baidu-netdisk',
    outputStorageSpaces: [
      { id: 'primary', type: 'local', label: 'Primary', enabled: true },
      { id: 'ecs-secondary', type: 't8-storage-node', label: 'ECS 2', enabled: false },
    ],
    cloudUploadTargets: [{
      id: 'baidu-netdisk', provider: 'baidu-netdisk', label: '百度网盘', enabled: true,
      prefix: 'T8PenguinCanvas/{kind}/{yyyy-mm}',
      baiduNetdisk: { webdavUrl, username: 'alist-user', password: 'alist-pass', folder: '/T8PenguinCanvas' },
    }],
  }));

  const managerPath = require.resolve('../backend/src/outputStorage/manager.js');
  delete require.cache[managerPath];
  const manager = require(managerPath);
  const settings = manager.getStorageSettings();
  const baiduSpace = settings.spaces.find((item) => item.id === 'cloud-baidu-netdisk');
  assert.equal(settings.activeId, 'cloud-baidu-netdisk');
  assert.equal(baiduSpace.enabled, true);

  const key = 'image/baidu-generated.png';
  const local = path.join(config.OUTPUT_DIR, 'image', 'baidu-generated.png');
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, Buffer.from('baidu-generated-payload'));
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  const entry = manager.storageEntryForKey(key);
  assert.equal(entry.storageSpaceId, 'cloud-baidu-netdisk');
  assert.equal(entry.provider, 'baidu-netdisk');
  assert.equal(entry.remotePath, '/T8PenguinCanvas/output/image/baidu-generated.png');
  assert.equal(fs.existsSync(local), false);
  assert.equal(mock.files.get(entry.remotePath).toString(), 'baidu-generated-payload');

  const proxyApp = require('../backend/node_modules/express')();
  proxyApp.get('/files/output/*', manager.serveOutputFile);
  const proxyServer = await new Promise((resolve) => {
    const instance = proxyApp.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => proxyServer.close(resolve)));
  const proxied = await fetch(`http://127.0.0.1:${proxyServer.address().port}/files/output/${key}`, { headers: { Range: 'bytes=0-3' } });
  assert.equal(proxied.status, 206);
  assert.equal(proxied.headers.get('cache-control'), 'private, max-age=31536000, immutable');
  assert.equal(await proxied.text(), 'baid');

  const getCountBeforeMaterialize = mock.state.getCounts.get(entry.remotePath) || 0;
  mock.state.getDelayMs = 40;
  const materializedCopies = await Promise.all(Array.from({ length: 6 }, () => (
    manager.materializeOutputUrl('/files/output/image/baidu-generated.png')
  )));
  mock.state.getDelayMs = 0;
  assert.equal(new Set(materializedCopies).size, 1);
  assert.equal(fs.readFileSync(materializedCopies[0], 'utf8'), 'baidu-generated-payload');
  assert.equal((mock.state.getCounts.get(entry.remotePath) || 0) - getCountBeforeMaterialize, 1);

  mock.directories.add('/T8PenguinCanvas/archive');
  mock.files.set('/T8PenguinCanvas/archive/manual-old.png', Buffer.from('manual-old'));
  const reconciled = await manager.reconcileRemoteSpace(baiduSpace);
  assert.equal(reconciled.scanned, 2);
  assert.equal(reconciled.added, 1);
  const imported = Object.values(manager.loadIndex().items).find((item) => item.remotePath === '/T8PenguinCanvas/archive/manual-old.png');
  assert.match(imported.key, /^baidu-import\//);
  assert.equal(imported.importedFromCloud, true);

  const historyPath = require.resolve('../backend/src/utils/generationHistory.js');
  delete require.cache[historyPath];
  const history = require(historyPath);
  assert.equal(history.listVisibleItems({ id: 'designer', role: 'designer' }).some((item) => item.storageKey === imported.key), false);
  assert.equal(history.listVisibleItems({ id: 'admin', role: 'admin' }).some((item) => item.storageKey === imported.key), true);

  await manager.deleteOutputByKey(imported.key);
  assert.equal(mock.files.has('/T8PenguinCanvas/archive/manual-old.png'), false);
});

test('completed FHL outputs drain to Baidu, retry transient failures, and remove empty local folders', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-fhl-output-storage-'));
  const mock = createMockWebdavServer();
  await new Promise((resolve) => mock.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => mock.server.close(resolve)));
  const webdavUrl = `http://127.0.0.1:${mock.server.address().port}/dav/%E7%99%BE%E5%BA%A6%E7%BD%91%E7%9B%98`;

  const config = require('../backend/src/config.js');
  config.DATA_DIR = path.join(temp, 'data');
  config.OUTPUT_DIR = path.join(temp, 'output');
  config.SETTINGS_FILE = path.join(config.DATA_DIR, 'settings.json');
  fs.mkdirSync(path.join(config.DATA_DIR, 'fhl-image', 'jobs'), { recursive: true });
  fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify({
    activeOutputStorageSpaceId: 'cloud-baidu-netdisk',
    outputStorageSpaces: [{ id: 'primary', type: 'local', label: 'Primary', enabled: true }],
    cloudUploadTargets: [{
      id: 'baidu-netdisk', provider: 'baidu-netdisk', label: 'Baidu', enabled: true,
      baiduNetdisk: { webdavUrl, username: 'alist-user', password: 'alist-pass', folder: '/T8PenguinCanvas' },
    }],
  }));

  const managerPath = require.resolve('../backend/src/outputStorage/manager.js');
  delete require.cache[managerPath];
  const manager = require(managerPath);
  const jobId = 'fhl-test-drain';
  const jobFile = path.join(config.DATA_DIR, 'fhl-image', 'jobs', `${jobId}.json`);
  const localDir = path.join(config.OUTPUT_DIR, 'fhl', jobId);
  const localFile = path.join(localDir, '001.png');
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(localFile, Buffer.from('fhl-image-payload'));
  fs.writeFileSync(jobFile, JSON.stringify({ id: jobId, status: 'running' }));

  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  assert.equal(fs.existsSync(localFile), true);
  assert.equal(manager.storageEntryForKey(`fhl/${jobId}/001.png`), null);

  fs.writeFileSync(jobFile, JSON.stringify({ id: jobId, status: 'completed' }));
  mock.state.failPuts = 1;
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  const fallback = manager.storageEntryForKey(`fhl/${jobId}/001.png`);
  assert.equal(fallback.storageSpaceId, 'primary');
  assert.equal(fallback.pendingRemoteRetry, true);
  assert.equal(fs.existsSync(localFile), true);

  manager.upsertEntry(fallback.key, { nextRemoteRetryAt: 0 });
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  const published = manager.storageEntryForKey(fallback.key);
  assert.equal(published.storageSpaceId, 'cloud-baidu-netdisk');
  assert.equal(published.pendingRemoteRetry, false);
  assert.equal(mock.files.get(`/T8PenguinCanvas/output/fhl/${jobId}/001.png`).toString(), 'fhl-image-payload');
  assert.equal(fs.existsSync(localFile), false);
  assert.equal(fs.existsSync(localDir), false);
});

test('manager falls back to primary when remote storage is unavailable', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-output-fallback-'));
  const config = require('../backend/src/config.js');
  config.DATA_DIR = path.join(temp, 'data');
  config.OUTPUT_DIR = path.join(temp, 'output');
  config.SETTINGS_FILE = path.join(config.DATA_DIR, 'settings.json');
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify({
    activeOutputStorageSpaceId: 'ecs-secondary',
    outputStorageSpaces: [
      { id: 'primary', type: 'local', label: 'Primary', enabled: true },
      { id: 'ecs-secondary', type: 't8-storage-node', label: 'Offline', enabled: true, baseUrl: 'http://127.0.0.1:1', apiToken: 'offline-token-abcdefghijklmnopqrstuvwxyz' },
    ],
  }));
  const managerPath = require.resolve('../backend/src/outputStorage/manager.js');
  delete require.cache[managerPath];
  const manager = require(managerPath);
  const file = path.join(config.OUTPUT_DIR, 'fallback.mp4');
  fs.writeFileSync(file, Buffer.from('video'));
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  await manager.scanAndPublishNewFiles();
  const entry = manager.storageEntryForKey('fallback.mp4');
  assert.equal(entry.storageSpaceId, 'primary');
  assert.equal(entry.storageFallbackFrom, 'ecs-secondary');
  assert.equal(fs.existsSync(file), true);
});

test('settings route masks output storage token and preserves it on masked update', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-output-settings-'));
  const config = require('../backend/src/config.js');
  config.DATA_DIR = path.join(temp, 'data');
  config.SETTINGS_FILE = path.join(config.DATA_DIR, 'settings.json');
  config.DEFAULT_LOCAL_SAVE_DIR = path.join(temp, 'saved');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = path.join(temp, 'canvas');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = path.join(temp, 'resources');
  config.DEFAULT_THEME_TEMPLATE_DIR = path.join(temp, 'themes');
  fs.mkdirSync(config.DATA_DIR, { recursive: true });

  const routePath = require.resolve('../backend/src/routes/settings.js');
  delete require.cache[routePath];
  const settingsRouter = require(routePath);
  const express = require('../backend/node_modules/express');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'admin', role: 'admin' }; next(); });
  app.use('/api/settings', settingsRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/settings`;

  const saved = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outputStorageSpaces: [
        { id: 'primary', type: 'local', label: 'Primary', enabled: true },
        { id: 'ecs-secondary', type: 't8-storage-node', label: 'ECS 2', enabled: true, baseUrl: 'https://storage.example.com', apiToken: 'route-secret-abcdefghijklmnopqrstuvwxyz' },
      ],
      activeOutputStorageSpaceId: 'ecs-secondary',
    }),
  }).then((res) => res.json());
  assert.equal(saved.success, true);
  const masked = await fetch(base).then((res) => res.json());
  assert.equal(masked.data.activeOutputStorageSpaceId, 'ecs-secondary');
  assert.equal(masked.data.outputStorageSpaces[1].apiToken, '****wxyz');

  await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outputStorageSpaces: masked.data.outputStorageSpaces }),
  });
  const raw = await fetch(`${base}/raw`).then((res) => res.json());
  assert.equal(raw.data.outputStorageSpaces[1].apiToken, 'route-secret-abcdefghijklmnopqrstuvwxyz');

  await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cloudUploadTargets: [{
        id: 'baidu-netdisk', provider: 'baidu-netdisk', label: '我的百度网盘', enabled: true,
        baiduNetdisk: { webdavUrl: 'http://127.0.0.1:5244/dav/baidu', username: 'alist', password: 'alist-secret', folder: '/T8PenguinCanvas' },
      }],
      activeOutputStorageSpaceId: 'cloud-baidu-netdisk',
    }),
  });
  const withBaidu = await fetch(base).then((res) => res.json());
  const baidu = withBaidu.data.outputStorageSpaces.find((item) => item.id === 'cloud-baidu-netdisk');
  assert.equal(baidu.type, 'cloud-upload-target');
  assert.equal(baidu.enabled, true);
  assert.equal(withBaidu.data.activeOutputStorageSpaceId, 'cloud-baidu-netdisk');
  assert.equal(JSON.stringify(baidu).includes('alist-secret'), false);
});
