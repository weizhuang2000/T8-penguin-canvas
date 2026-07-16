import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  assert.equal(await proxied.text(), 'png');

  const listed = await fetch(`${baseUrl}/v1/files?limit=10`, { headers: auth }).then((res) => res.json());
  assert.equal(listed.data.items[0].key, key);
  assert.equal(manager.storageMetadataForUrl('/files/output/image/generated-test.png').storageSpaceId, 'ecs-secondary');

  await manager.deleteOutputByKey(key);
  assert.equal(fs.existsSync(path.join(storageRoot, 'image', 'generated-test.png')), false);
  assert.equal(manager.storageEntryForKey(key), null);
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
});
