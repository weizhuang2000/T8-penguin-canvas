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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-exhibition-library-'));
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

test('regular users can manage personal entries but cannot create team entries', async (t) => {
  const base = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });

  const personal = await fetch(`${base}/api/prompt-library/exhibition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: 'personal',
      dimension: 'spaceType',
      label: '我的博物馆',
      text: '小型博物馆展厅',
    }),
  }).then((res) => res.json());

  assert.equal(personal.success, true);
  assert.equal(personal.data.ownerUserId, 'u1');

  const team = await fetch(`${base}/api/prompt-library/exhibition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: 'team',
      dimension: 'spaceType',
      label: '团队博物馆',
      text: '团队词条',
    }),
  });

  assert.equal(team.status, 403);
});

test('admin can manage team entries and reject invalid dimensions', async (t) => {
  const base = await startApp(t, { id: 'admin', username: 'root', name: 'Root', role: 'manager' });

  const invalid = await fetch(`${base}/api/prompt-library/exhibition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: 'team',
      dimension: 'bad',
      label: '坏维度',
      text: '无效',
    }),
  });
  assert.equal(invalid.status, 400);

  const created = await fetch(`${base}/api/prompt-library/exhibition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: 'team',
      dimension: 'exhibitionCraft',
      label: '展柜工艺',
      text: '低反射玻璃展柜',
    }),
  }).then((res) => res.json());
  assert.equal(created.success, true);

  const listed = await fetch(`${base}/api/prompt-library/exhibition?includePersonal=1`).then((res) => res.json());
  assert.equal(listed.success, true);
  assert.deepEqual(listed.data.map((item) => [item.scope, item.dimension, item.label]), [
    ['team', 'exhibitionCraft', '展柜工艺'],
  ]);
});

test('admin can configure dimension presets while regular users cannot', async (t) => {
  const adminBase = await startApp(t, { id: 'admin', username: 'root', name: 'Root', role: 'admin' });

  const saved = await fetch(`${adminBase}/api/prompt-library/exhibition/presets/spaceType`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presets: [
        { label: '企业馆', text: '企业品牌展馆，强调品牌历程与核心产品' },
        { label: '艺术馆', text: '当代艺术展厅，强调策展叙事与观众停留体验' },
      ],
    }),
  }).then((res) => res.json());

  assert.equal(saved.success, true);
  assert.deepEqual(saved.data.map((item) => [item.label, item.order]), [['企业馆', 0], ['艺术馆', 1]]);

  const presets = await fetch(`${adminBase}/api/prompt-library/exhibition/presets`).then((res) => res.json());
  assert.equal(presets.success, true);
  assert.equal(presets.data.spaceType[0].text, '企业品牌展馆，强调品牌历程与核心产品');

  const userBase = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });
  const denied = await fetch(`${userBase}/api/prompt-library/exhibition/presets/spaceType`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ label: '普通用户', text: '不能保存' }] }),
  });
  assert.equal(denied.status, 403);
});
