import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('settings route persists configurable zhenzhen base url', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-zhenzhen-base-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const config = require('../backend/src/config.js');
  const oldConfig = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_LOCAL_SAVE_DIR: config.DEFAULT_LOCAL_SAVE_DIR,
    DEFAULT_CANVAS_AUTO_SAVE_DIR: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    DEFAULT_THEME_TEMPLATE_DIR: config.DEFAULT_THEME_TEMPLATE_DIR,
  };
  t.after(() => {
    Object.assign(config, oldConfig);
  });
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.DEFAULT_LOCAL_SAVE_DIR = path.join(tmpDir, 'save');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = path.join(tmpDir, 'canvas');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = path.join(tmpDir, 'resources');
  config.DEFAULT_THEME_TEMPLATE_DIR = path.join(tmpDir, 'themes');

  const express = require('express');
  const settingsRouter = require('../backend/src/routes/settings.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.user = { id: 'test-admin', role: 'admin' };
    next();
  });
  app.use('/api/settings', settingsRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => {
    server.close();
  });

  const base = `http://127.0.0.1:${server.address().port}/api/settings`;
  const initial = await fetch(base).then((res) => res.json());
  assert.equal(initial.success, true);
  assert.equal(initial.data.zhenzhenBaseUrl, 'https://ai.t8star.org');

  const save = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zhenzhenBaseUrl: 'https://proxy.example.com/base/' }),
  }).then(async (res) => ({ status: res.status, body: await res.json() }));
  assert.equal(save.status, 200);
  assert.equal(save.body.success, true);

  const afterSave = await fetch(base).then((res) => res.json());
  assert.equal(afterSave.data.zhenzhenBaseUrl, 'https://proxy.example.com/base');
  assert.equal(settingsRouter.loadSettings().zhenzhenBaseUrl, 'https://proxy.example.com/base');

  const invalid = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zhenzhenBaseUrl: 'ftp://proxy.example.com' }),
  }).then(async (res) => ({ status: res.status, body: await res.json() }));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.success, false);
  assert.equal(settingsRouter.loadSettings().zhenzhenBaseUrl, 'https://proxy.example.com/base');
});
