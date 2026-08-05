import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('SeedVR2 settings persist Base URL and mask, preserve, then clear the API Key', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-seedvr2-settings-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  const config = require('../backend/src/config.js');
  const previous = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_LOCAL_SAVE_DIR: config.DEFAULT_LOCAL_SAVE_DIR,
    DEFAULT_CANVAS_AUTO_SAVE_DIR: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    DEFAULT_THEME_TEMPLATE_DIR: config.DEFAULT_THEME_TEMPLATE_DIR,
  };
  t.after(() => Object.assign(config, previous));
  config.SETTINGS_FILE = path.join(temp, 'settings.json');
  config.DEFAULT_LOCAL_SAVE_DIR = path.join(temp, 'save');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = path.join(temp, 'canvas');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = path.join(temp, 'resources');
  config.DEFAULT_THEME_TEMPLATE_DIR = path.join(temp, 'themes');

  delete require.cache[require.resolve('../backend/src/routes/settings.js')];
  const settingsRouter = require('../backend/src/routes/settings.js');
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req: any, _res: any, next: any) => { req.user = { id: 'admin', role: 'admin' }; next(); });
  app.use('/api/settings', settingsRouter);
  const server: any = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/settings`;

  const initial = await fetch(base).then((response) => response.json());
  assert.equal(initial.data.seedvr2BaseUrl, 'https://api2.65535.space');
  assert.equal(initial.data.seedvr2ApiKey, '');

  const saved = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seedvr2BaseUrl: 'https://proxy.example.com/base/v1/',
      seedvr2ApiKey: 'sk-seedvr2-7890',
    }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.success, true);

  const masked = await fetch(base).then((response) => response.json());
  assert.equal(masked.data.seedvr2BaseUrl, 'https://proxy.example.com/base/v1');
  assert.equal(masked.data.seedvr2ApiKey, '****7890');
  const raw = await fetch(`${base}/raw`).then((response) => response.json());
  assert.equal(raw.data.seedvr2ApiKey, 'sk-seedvr2-7890');

  await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seedvr2BaseUrl: 'https://proxy-2.example.com/' }),
  });
  assert.equal(settingsRouter.loadSettings().seedvr2ApiKey, 'sk-seedvr2-7890');
  assert.equal(settingsRouter.loadSettings().seedvr2BaseUrl, 'https://proxy-2.example.com');

  const invalid = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seedvr2BaseUrl: 'ftp://invalid.example.com' }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.success, false);
  assert.equal(settingsRouter.loadSettings().seedvr2BaseUrl, 'https://proxy-2.example.com');

  await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seedvr2ApiKey: '' }),
  });
  assert.equal(settingsRouter.loadSettings().seedvr2ApiKey, '');
});
