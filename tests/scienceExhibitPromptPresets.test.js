import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function asUser(user) {
  return (req, _res, next) => {
    req.user = user;
    next();
  };
}

async function startApp(t, user) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-science-exhibit-presets-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const config = require('../backend/src/config.js');
  const oldDataDir = config.DATA_DIR;
  t.after(() => { config.DATA_DIR = oldDataDir; });
  config.DATA_DIR = tmpDir;
  delete require.cache[require.resolve('../backend/src/routes/promptLibrary.js')];
  const express = require('express');
  const router = require('../backend/src/routes/promptLibrary.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(asUser(user));
  app.use('/api/prompt-library', router);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('science exhibit presets are readable and admin managed', async (t) => {
  const userBase = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });
  const defaults = await fetch(`${userBase}/api/prompt-library/science-exhibit/presets`).then((res) => res.json());
  assert.equal(defaults.success, true);
  assert.ok(defaults.data.domains.length >= 1);
  assert.ok(defaults.data.types.length >= 1);
  assert.ok(defaults.data.interactions.length >= 1);
  assert.ok(defaults.data.audiences.length >= 1);
  assert.ok(defaults.data.scales.length >= 1);
  assert.equal(defaults.data.domains[0].id, 'physics');

  const denied = await fetch(`${userBase}/api/prompt-library/science-exhibit/presets/domains`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ id: 'deny', label: '普通用户不能保存', prompt: 'deny' }] }),
  });
  assert.equal(denied.status, 403);

  const managerBase = await startApp(t, { id: 'm1', username: 'manager', name: 'Manager', role: 'manager' });
  const saved = await fetch(`${managerBase}/api/prompt-library/science-exhibit/presets/domains`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presets: [
        { id: 'late', label: '后置领域', prompt: 'late prompt', order: 9 },
        { id: 'early', label: '前置领域', prompt: 'early prompt', order: 1 },
        { id: 'invalid-no-prompt', label: '无 prompt' },
      ],
    }),
  }).then((res) => res.json());
  assert.equal(saved.success, true);
  assert.deepEqual(saved.data.map((item) => [item.id, item.label, item.prompt, item.order]), [
    ['early', '前置领域', 'early prompt', 0],
    ['late', '后置领域', 'late prompt', 1],
  ]);

  const badGroup = await fetch(`${managerBase}/api/prompt-library/science-exhibit/presets/bad`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ id: 'x', label: 'X', prompt: 'x' }] }),
  });
  assert.equal(badGroup.status, 400);
});
