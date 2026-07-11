import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
async function startApp(t, user) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-design-options-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const config = require('../backend/src/config.js');
  const oldDataDir = config.DATA_DIR;
  t.after(() => { config.DATA_DIR = oldDataDir; });
  config.DATA_DIR = tmpDir;
  delete require.cache[require.resolve('../backend/src/routes/promptLibrary.js')];
  const express = require('express');
  const router = require('../backend/src/routes/promptLibrary.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/prompt-library', router);
  const server = await new Promise((resolve) => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('design option presets are readable and admin managed', async (t) => {
  const userBase = await startApp(t, { id: 'u1', role: 'designer' });
  const defaults = await fetch(`${userBase}/api/prompt-library/design-options/exhibition-scene-design`).then((res) => res.json());
  assert.equal(defaults.success, true);
  assert.deepEqual(defaults.data.sceneCategories, []);
  const denied = await fetch(`${userBase}/api/prompt-library/design-options/exhibition-scene-design/sceneCategories`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presets: [{ id: 'custom-scene', label: '自定义场景', prompt: 'custom scene prompt' }] }),
  });
  assert.equal(denied.status, 403);

  const adminBase = await startApp(t, { id: 'a1', role: 'admin' });
  const saved = await fetch(`${adminBase}/api/prompt-library/design-options/sculpture-relief-design/viewAngles`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presets: [{ id: 'hero-view', label: '主视觉视角', prompt: 'hero perspective view' }] }),
  }).then((res) => res.json());
  assert.equal(saved.success, true);
  const listed = await fetch(`${adminBase}/api/prompt-library/design-options/sculpture-relief-design`).then((res) => res.json());
  assert.equal(listed.data.viewAngles[0].id, 'hero-view');
});
