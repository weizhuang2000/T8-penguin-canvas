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

test('exhibition recolor presets are readable and admin managed', async (t) => {
  const userBase = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });
  const defaults = await fetch(`${userBase}/api/prompt-library/exhibition-recolor/presets`).then((res) => res.json());
  assert.equal(defaults.success, true);
  assert.ok(defaults.data.palettes.length >= 1);
  assert.equal(defaults.data.palettes[0].primaryColor, '#1f5f8b');
  assert.equal(defaults.data.palettes[0].harmonyColor, '#e7dcc7');
  assert.equal(defaults.data.palettes[0].category, '文化展陈');
  assert.deepEqual(defaults.data.exclusions.map((item) => item.id).slice(0, 3), ['exhibit', 'sand-table', 'sculpture']);
  assert.equal(defaults.data.floors[0].id, 'keep-floor');
  assert.equal(defaults.data.ceilings[0].id, 'keep-ceiling');

  const denied = await fetch(`${userBase}/api/prompt-library/exhibition-recolor/presets/exclusions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ label: '普通用户不能保存' }] }),
  });
  assert.equal(denied.status, 403);
  const deniedFloors = await fetch(`${userBase}/api/prompt-library/exhibition-recolor/presets/floors`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ label: '普通用户不能保存', prompt: 'deny' }] }),
  });
  assert.equal(deniedFloors.status, 403);

  const adminBase = await startApp(t, { id: 'admin', username: 'root', name: 'Root', role: 'admin' });
  const palettes = await fetch(`${adminBase}/api/prompt-library/exhibition-recolor/presets/palettes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presets: [
        {
          id: 'custom',
          label: '自定义配色',
          category: '品牌展厅',
          primaryColor: '#ABC',
          secondaryColor: '#123456',
          harmonyColor: '#def',
          accentColor: 'bad',
          description: '测试配色',
        },
      ],
    }),
  }).then((res) => res.json());

  assert.equal(palettes.success, true);
  assert.deepEqual(
    palettes.data.map((item) => [item.id, item.label, item.category, item.primaryColor, item.secondaryColor, item.harmonyColor, item.accentColor, item.description, item.order]),
    [['custom', '自定义配色', '品牌展厅', '#aabbcc', '#123456', '#ddeeff', '#e94b35', '测试配色', 0]],
  );

  const exclusions = await fetch(`${adminBase}/api/prompt-library/exhibition-recolor/presets/exclusions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ id: 'hero-case', label: '重点展柜' }] }),
  }).then((res) => res.json());
  assert.equal(exclusions.success, true);
  assert.deepEqual(exclusions.data.map((item) => [item.id, item.label, item.order]), [['hero-case', '重点展柜', 0]]);

  const floors = await fetch(`${adminBase}/api/prompt-library/exhibition-recolor/presets/floors`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ id: 'custom-floor', label: '自定义地面', prompt: '地面改为浅灰石材' }] }),
  }).then((res) => res.json());
  assert.equal(floors.success, true);
  assert.deepEqual(floors.data.map((item) => [item.id, item.label, item.prompt, item.order]), [['custom-floor', '自定义地面', '地面改为浅灰石材', 0]]);

  const ceilings = await fetch(`${adminBase}/api/prompt-library/exhibition-recolor/presets/ceilings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ id: 'custom-ceiling', label: '自定义天花', prompt: '天花改为线性灯带顶' }] }),
  }).then((res) => res.json());
  assert.equal(ceilings.success, true);
  assert.deepEqual(ceilings.data.map((item) => [item.id, item.label, item.prompt, item.order]), [['custom-ceiling', '自定义天花', '天花改为线性灯带顶', 0]]);
});

test('exhibition AI plan layout presets are readable and manager managed', async (t) => {
  const userBase = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });
  const defaults = await fetch(`${userBase}/api/prompt-library/exhibition-ai-plan-layout/presets`).then((res) => res.json());
  assert.equal(defaults.success, true);
  assert.ok(defaults.data.styles.length >= 1);
  assert.ok(defaults.data.requirements.length >= 1);

  const denied = await fetch(`${userBase}/api/prompt-library/exhibition-ai-plan-layout/presets/styles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ label: '用户不可写', prompt: '不应保存' }] }),
  });
  assert.equal(denied.status, 403);

  const managerBase = await startApp(t, { id: 'm1', username: 'manager', name: 'Manager', role: 'manager' });
  const styles = await fetch(`${managerBase}/api/prompt-library/exhibition-ai-plan-layout/presets/styles`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ label: '科技蓝白', prompt: '科技馆蓝白线稿汇报风' }] }),
  }).then((res) => res.json());
  assert.equal(styles.success, true);
  assert.equal(styles.data[0].label, '科技蓝白');
  assert.equal(styles.data[0].prompt, '科技馆蓝白线稿汇报风');

  const requirements = await fetch(`${managerBase}/api/prompt-library/exhibition-ai-plan-layout/presets/requirements`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ label: '保留消防通道', prompt: '保留消防通道，动线单向无分叉' }] }),
  }).then((res) => res.json());
  assert.equal(requirements.success, true);
  assert.equal(requirements.data[0].label, '保留消防通道');
  assert.equal(requirements.data[0].prompt, '保留消防通道，动线单向无分叉');
});

test('exhibition img2img exclusions are managed separately from creative exclusions', async (t) => {
  const userBase = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });
  const defaults = await fetch(`${userBase}/api/prompt-library/exhibition-img2img/presets`).then((res) => res.json());
  assert.equal(defaults.success, true);
  assert.deepEqual(defaults.data.exclusions.map((item) => item.id).slice(0, 3), ['readable-wrong-text', 'real-brand-logo', 'instruction-table']);

  const denied = await fetch(`${userBase}/api/prompt-library/exhibition-img2img/presets/exclusions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ id: 'img-deny', label: 'regular users cannot save img2img exclusions' }] }),
  });
  assert.equal(denied.status, 403);

  const adminBase = await startApp(t, { id: 'admin', username: 'root', name: 'Root', role: 'admin' });
  const img2img = await fetch(`${adminBase}/api/prompt-library/exhibition-img2img/presets/exclusions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ id: 'img-only', label: 'img2img only exclusion' }] }),
  }).then((res) => res.json());
  assert.equal(img2img.success, true);
  assert.deepEqual(img2img.data.map((item) => [item.id, item.label, item.order]), [['img-only', 'img2img only exclusion', 0]]);

  const creative = await fetch(`${adminBase}/api/prompt-library/exhibition-creative/presets/exclusions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ id: 'creative-only', label: 'creative only exclusion' }] }),
  }).then((res) => res.json());
  assert.equal(creative.success, true);
  assert.deepEqual(creative.data.map((item) => [item.id, item.label, item.order]), [['creative-only', 'creative only exclusion', 0]]);

  const listedImg2Img = await fetch(`${adminBase}/api/prompt-library/exhibition-img2img/presets`).then((res) => res.json());
  const listedCreative = await fetch(`${adminBase}/api/prompt-library/exhibition-creative/presets`).then((res) => res.json());
  assert.deepEqual(listedImg2Img.data.exclusions.map((item) => item.id), ['img-only']);
  assert.deepEqual(listedCreative.data.exclusions.map((item) => item.id), ['creative-only']);
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

test('elevation color material presets expose info and are admin managed', async (t) => {
  const adminBase = await startApp(t, { id: 'admin', username: 'root', name: 'Root', role: 'admin' });

  const defaults = await fetch(`${adminBase}/api/prompt-library/elevation/presets`).then((res) => res.json());
  assert.equal(defaults.success, true);
  assert.equal(defaults.data.colorMaterial[0].label, '极简主义 / 少即是多');
  assert.equal(defaults.data.colorMaterial[0].category, '默认');
  assert.match(defaults.data.colorMaterial[0].core, /大量留白/);
  assert.match(defaults.data.colorMaterial[0].features, /黑白灰/);
  assert.match(defaults.data.colorMaterial[0].info, /核心/);
  assert.equal(defaults.data.crafts[0].label, '展板');
  assert.match(defaults.data.crafts[0].prompt, /展板/);

  const saved = await fetch(`${adminBase}/api/prompt-library/elevation/presets/colorMaterial`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presets: [
        { category: '科技展厅', label: '测试色材体系', core: '只写内容本身', features: '不要字段名前缀', usage: '仅作提示' },
        { label: '第二套体系', info: '核心：信息可拆分。特征：自动提取。适用：测试。' },
      ],
    }),
  }).then((res) => res.json());

  assert.equal(saved.success, true);
  assert.deepEqual(saved.data.map((item) => [item.category, item.label, item.core, item.features, item.usage, item.order]), [
    ['科技展厅', '测试色材体系', '只写内容本身', '不要字段名前缀', '仅作提示', 0],
    ['默认', '第二套体系', '信息可拆分。', '自动提取。', '测试。', 1],
  ]);

  const userBase = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });
  const denied = await fetch(`${userBase}/api/prompt-library/elevation/presets/colorMaterial`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ label: '普通用户不能保存', info: 'deny' }] }),
  });
  assert.equal(denied.status, 403);
});

test('elevation color material presets keep entries beyond eighty', async (t) => {
  const adminBase = await startApp(t, { id: 'admin', username: 'root', name: 'Root', role: 'admin' });
  const presets = Array.from({ length: 95 }, (_, index) => ({
    category: index >= 80 ? '尾部分类' : '默认',
    label: `色材预设 ${index + 1}`,
    core: `核心 ${index + 1}`,
    features: `特征 ${index + 1}`,
    usage: `适用 ${index + 1}`,
  }));

  const saved = await fetch(`${adminBase}/api/prompt-library/elevation/presets/colorMaterial`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets }),
  }).then((res) => res.json());

  assert.equal(saved.success, true);
  assert.equal(saved.data.length, 95);
  assert.equal(saved.data.at(-1).label, '色材预设 95');

  const listed = await fetch(`${adminBase}/api/prompt-library/elevation/presets`).then((res) => res.json());
  assert.equal(listed.success, true);
  assert.equal(listed.data.colorMaterial.length, 95);
  assert.equal(listed.data.colorMaterial.at(-1).label, '色材预设 95');
});

test('elevation craft presets are managed by admin and manager only', async (t) => {
  const managerBase = await startApp(t, { id: 'm1', username: 'manager', name: 'Manager', role: 'manager' });

  const saved = await fetch(`${managerBase}/api/prompt-library/elevation/presets/crafts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presets: [
        { category: '展柜', label: '定制工艺', prompt: '定制工艺提示词' },
        { label: '第二工艺', prompt: '第二工艺提示词' },
      ],
    }),
  }).then((res) => res.json());

  assert.equal(saved.success, true);
  assert.deepEqual(saved.data.map((item) => [item.category, item.label, item.prompt, item.order]), [
    ['展柜', '定制工艺', '定制工艺提示词', 0],
    ['其它', '第二工艺', '第二工艺提示词', 1],
  ]);

  const userBase = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });
  const denied = await fetch(`${userBase}/api/prompt-library/elevation/presets/crafts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets: [{ label: '普通用户不能保存', prompt: 'deny' }] }),
  });
  assert.equal(denied.status, 403);
});

test('unit panel materials are readable and admin managed', async (t) => {
  const userBase = await startApp(t, { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' });
  const defaults = await fetch(`${userBase}/api/prompt-library/unit-panel/materials`).then((res) => res.json());
  assert.equal(defaults.success, true);
  assert.ok(defaults.data.length >= 3);
  assert.equal(defaults.data[0].order, 0);

  const denied = await fetch(`${userBase}/api/prompt-library/unit-panel/materials`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ materials: [{ label: '普通用户材质' }] }),
  });
  assert.equal(denied.status, 403);

  const adminBase = await startApp(t, { id: 'admin', username: 'root', name: 'Root', role: 'admin' });
  const saved = await fetch(`${adminBase}/api/prompt-library/unit-panel/materials`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      materials: [
        { category: '金属', label: '测试主材质', description: '主面板', texture: '哑光', usage: '主材质' },
        { category: '亚克力', label: '测试辅助材质', description: '发光层', texture: '磨砂透光', usage: '辅助材质' },
      ],
    }),
  }).then((res) => res.json());

  assert.equal(saved.success, true);
  assert.deepEqual(saved.data.map((item) => [item.category, item.label, item.description, item.texture, item.usage, item.order]), [
    ['金属', '测试主材质', '主面板', '哑光', '主材质', 0],
    ['亚克力', '测试辅助材质', '发光层', '磨砂透光', '辅助材质', 1],
  ]);

  const listed = await fetch(`${adminBase}/api/prompt-library/unit-panel/materials`).then((res) => res.json());
  assert.equal(listed.success, true);
  assert.equal(listed.data[1].label, '测试辅助材质');
});
