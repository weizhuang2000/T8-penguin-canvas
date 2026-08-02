import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const designTeamDbPath = require.resolve('../backend/src/auth/designTeamDb.js');
require.cache[designTeamDbPath] = {
  id: designTeamDbPath,
  filename: designTeamDbPath,
  loaded: true,
  exports: {
    findUserById: async () => null,
  },
};
const config = require('../backend/src/config.js');
const history = require('../backend/src/utils/generationHistory.js');

function withTempData(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-history-'));
  const old = {
    DATA_DIR: config.DATA_DIR,
    OUTPUT_DIR: config.OUTPUT_DIR,
    CANVAS_FILE: config.CANVAS_FILE,
  };
  const cleanup = () => {
    Object.assign(config, old);
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  config.DATA_DIR = path.join(tmp, 'data');
  config.OUTPUT_DIR = path.join(tmp, 'output');
  config.CANVAS_FILE = path.join(config.DATA_DIR, 'canvas_list.json');
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  try {
    const result = fn(tmp);
    if (result && typeof result.then === 'function') return result.finally(cleanup);
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function writeCanvases(list) {
  fs.writeFileSync(config.CANVAS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

test('history items follow canvas owner/shared/admin visibility', () => withTempData(() => {
  writeCanvases([
    { id: 'c1', name: 'Owner canvas', ownerUserId: 'u1', sharedWith: [{ userId: 'u2', permission: 'view' }] },
    { id: 'c2', name: 'Other canvas', ownerUserId: 'u3', sharedWith: [] },
  ]);
  history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image' }], { canvasId: 'c1' }, { id: 'u1', role: 'designer' });
  history.addHistoryItems([{ url: '/files/output/b.mp4', kind: 'video' }], { canvasId: 'c2' }, { id: 'u3', role: 'designer' });

  assert.deepEqual(history.listVisibleItems({ id: 'u1', role: 'designer' }).map((item) => item.url), ['/files/output/a.png']);
  assert.deepEqual(history.listVisibleItems({ id: 'u2', role: 'designer' }).map((item) => item.url), ['/files/output/a.png']);
  assert.deepEqual(history.listVisibleItems({ id: 'admin', role: 'admin' }).map((item) => item.url).sort(), ['/files/output/a.png', '/files/output/b.mp4']);
}));

test('history items follow all-users canvas sharing', () => withTempData(() => {
  writeCanvases([
    { id: 'c1', name: 'Team canvas', ownerUserId: 'u1', allUsersShare: { enabled: true, permission: 'view' } },
    { id: 'c2', name: 'Private canvas', ownerUserId: 'u3' },
  ]);
  history.addHistoryItems([{ url: '/files/output/team.png', kind: 'image' }], { canvasId: 'c1' }, { id: 'u1', role: 'designer' });
  history.addHistoryItems([{ url: '/files/output/private.png', kind: 'image' }], { canvasId: 'c2' }, { id: 'u3', role: 'designer' });

  assert.deepEqual(history.listVisibleItems({ id: 'u2', role: 'designer' }).map((item) => item.url), ['/files/output/team.png']);
}));

test('addHistoryItems deduplicates by url and updates context', () => withTempData(() => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image', title: 'A' }], { canvasId: 'c1', prompt: 'old' }, { id: 'u1', role: 'designer' });
  history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image', title: 'B' }], { canvasId: 'c1', prompt: 'new' }, { id: 'u1', role: 'designer' });
  const items = history.listVisibleItems({ id: 'u1', role: 'designer' });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'B');
  assert.equal(items[0].prompt, 'new');
}));

test('history title can use outputTitle before nodeTitle', () => withTempData(() => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  history.addHistoryItems(
    [{ url: '/files/output/named.png', kind: 'image' }],
    { canvasId: 'c1', nodeTitle: '节点标题', outputTitle: '序厅-1' },
    { id: 'u1', role: 'designer' },
  );
  history.addHistoryItems(
    [{ url: '/files/output/fallback.png', kind: 'image' }],
    { canvasId: 'c1', nodeTitle: '节点标题' },
    { id: 'u1', role: 'designer' },
  );
  const byUrl = new Map(history.listVisibleItems({ id: 'u1', role: 'designer' }).map((item) => [item.url, item]));
  assert.equal(byUrl.get('/files/output/named.png')?.title, '序厅-1');
  assert.equal(byUrl.get('/files/output/fallback.png')?.title, '节点标题');
}));

test('history keeps full long prompts for copy actions', () => withTempData(() => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  const longPrompt = Array.from({ length: 900 }, (_, index) => `section-${index}`).join('\n');
  const [created] = history.addHistoryItems(
    [{ url: '/files/output/long.png', kind: 'image', title: 'Long' }],
    { canvasId: 'c1', prompt: longPrompt },
    { id: 'u1', role: 'designer' },
  );
  assert.equal(created.prompt, longPrompt);

  const items = history.listVisibleItems({ id: 'u1', role: 'designer' });
  assert.equal(items[0].prompt, longPrompt);
  assert.ok(items[0].prompt.length > 500);
}));

test('image history stores and returns generated image resolution', async () => withTempData(async () => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  fs.writeFileSync(
    path.join(config.OUTPUT_DIR, 'sized.png'),
    await sharp({
      create: {
        width: 320,
        height: 192,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer(),
  );

  const [created] = history.addHistoryItems(
    [{ url: '/files/output/sized.png', kind: 'image' }],
    { canvasId: 'c1' },
    { id: 'u1', role: 'designer' },
  );
  assert.equal(created.width, 320);
  assert.equal(created.height, 192);

  const [listed] = history.listVisibleItems({ id: 'u1', role: 'designer' });
  assert.equal(listed.width, 320);
  assert.equal(listed.height, 192);
}));

test('legacy image history without stored dimensions is enriched from output file', async () => withTempData(async () => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  fs.writeFileSync(
    path.join(config.OUTPUT_DIR, 'legacy-sized.png'),
    await sharp({
      create: {
        width: 111,
        height: 222,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer(),
  );
  const db = history.readDb();
  db.items.push({
    id: 'legacy_sized',
    kind: 'image',
    url: '/files/output/legacy-sized.png',
    fileName: 'legacy-sized.png',
    title: 'Legacy sized',
    canvasId: 'c1',
    createdAt: Date.now(),
    hidden: false,
    favorite: false,
    tags: [],
  });
  history.writeDb(db);

  const [listed] = history.listVisibleItems({ id: 'u1', role: 'designer' });
  assert.equal(listed.width, 111);
  assert.equal(listed.height, 222);
}));

test('history items persist, update, and search image seed', () => withTempData(() => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image', title: 'A' }], { canvasId: 'c1', seed: 12345 }, { id: 'u1', role: 'designer' });
  let items = history.listVisibleItems({ id: 'u1', role: 'designer' });
  assert.equal(items.length, 1);
  assert.equal(items[0].seed, 12345);

  history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image', title: 'B', seed: 67890 }], { canvasId: 'c1' }, { id: 'u1', role: 'designer' });
  items = history.listVisibleItems({ id: 'u1', role: 'designer' });
  assert.equal(items.length, 1);
  assert.equal(items[0].seed, 67890);

  const searched = history.listVisibleItems({ id: 'u1', role: 'designer' }, { q: '67890' });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].url, '/files/output/a.png');
}));

test('admin can filter history by user and model while regular users cannot widen scope', () => withTempData(() => {
  writeCanvases([
    { id: 'c1', ownerUserId: 'u1' },
    { id: 'c2', ownerUserId: 'u2' },
  ]);
  history.addHistoryItems(
    [{ url: '/files/output/a.png', kind: 'image' }],
    { canvasId: 'c1', provider: 'zhenzhen', model: 'gpt-image-2', sourceNodeType: 'image' },
    { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' },
  );
  history.addHistoryItems(
    [{ url: '/files/output/b.mp4', kind: 'video' }],
    { canvasId: 'c2', provider: 'seedance', model: 'seedance-2', sourceNodeType: 'seedance' },
    { id: 'u2', username: 'bob', name: 'Bob', role: 'pm' },
  );

  const adminByUser = history.listVisibleItems({ id: 'admin', role: 'admin' }, { userId: 'u2' });
  assert.deepEqual(adminByUser.map((item) => item.url), ['/files/output/b.mp4']);
  assert.equal(adminByUser[0].createdByUserName, 'Bob');
  assert.equal(adminByUser[0].createdByUserRole, 'pm');

  const adminByModel = history.listVisibleItems({ id: 'admin', role: 'admin' }, { model: 'gpt-image' });
  assert.deepEqual(adminByModel.map((item) => item.url), ['/files/output/a.png']);

  const regular = history.listVisibleItems({ id: 'u1', role: 'designer' }, { userId: 'u2' });
  assert.deepEqual(regular.map((item) => item.url), ['/files/output/a.png']);
}));

test('web image editor results are grouped in an owner-only virtual history project', () => withTempData(() => {
  writeCanvases([
    { id: 'c1', name: 'Shared canvas', ownerUserId: 'u1', sharedWith: [{ userId: 'u2', permission: 'view' }] },
  ]);
  const alice = { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' };
  const bob = { id: 'u2', username: 'bob', name: 'Bob', role: 'designer' };
  history.addHistoryItems([{ url: '/files/output/canvas.png', kind: 'image' }], { canvasId: 'c1', sourceNodeType: 'image' }, alice);
  const [webItem] = history.addHistoryItems(
    [{ url: '/files/output/web.png', kind: 'image' }],
    { canvasId: history.imageEditorProjectId('u1'), sourceNodeType: 'image-editor' },
    alice,
  );

  const webProjectId = history.imageEditorProjectId('u1');
  assert.equal(webItem.canvasId, webProjectId);
  assert.equal(history.listVisibleItems(alice, { canvasId: webProjectId }).map((item) => item.url)[0], '/files/output/web.png');
  assert.deepEqual(history.listVisibleItems(alice, { canvasId: 'c1' }).map((item) => item.url), ['/files/output/canvas.png']);
  assert.deepEqual(history.listVisibleItems(bob, { canvasId: webProjectId }), []);
  assert.deepEqual(history.listVisibleItems(bob).map((item) => item.url), ['/files/output/canvas.png']);

  const projects = history.listProjects(alice);
  const webProject = projects.find((project) => project.id === webProjectId);
  assert.ok(webProject);
  assert.equal(webProject.name, 'Alice · 网页版生图');
  assert.equal(webProject.counts.image, 1);
}));

test('legacy web image editor results move to the creator virtual project without migration', () => withTempData(() => {
  writeCanvases([{ id: 'c1', name: 'Old canvas', ownerUserId: 'u1' }]);
  const alice = { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' };
  history.addHistoryItems(
    [{ url: '/files/output/legacy-web.png', kind: 'image' }],
    { canvasId: 'c1', sourceNodeType: 'image-editor' },
    alice,
  );
  const db = history.readDb();
  db.items[0].canvasId = 'c1';
  history.writeDb(db);

  const webProjectId = history.imageEditorProjectId('u1');
  assert.deepEqual(history.listVisibleItems(alice, { canvasId: webProjectId }).map((item) => item.url), ['/files/output/legacy-web.png']);
  assert.deepEqual(history.listVisibleItems(alice, { canvasId: 'c1' }), []);
  assert.equal(history.listProjects(alice).find((project) => project.id === webProjectId)?.counts.total, 1);
}));

test('web image editor virtual projects are separated by user and manager can manage all results', () => withTempData(() => {
  writeCanvases([]);
  const alice = { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' };
  const bob = { id: 'u2', username: 'bob', name: 'Bob', role: 'designer' };
  const manager = { id: 'admin', role: 'manager' };
  const [aliceItem] = history.addHistoryItems(
    [{ url: '/files/output/alice-web.png', kind: 'image' }],
    { canvasId: history.imageEditorProjectId('u2'), sourceNodeType: 'image-editor' },
    alice,
  );
  const [bobItem] = history.addHistoryItems(
    [{ url: '/files/output/bob-web.png', kind: 'image' }],
    { canvasId: history.imageEditorProjectId('u2'), sourceNodeType: 'image-editor' },
    bob,
  );

  assert.equal(aliceItem.canvasId, history.imageEditorProjectId('u1'));
  assert.deepEqual(history.listVisibleItems(alice).map((item) => item.url), ['/files/output/alice-web.png']);
  assert.deepEqual(history.listVisibleItems(bob, { canvasId: history.imageEditorProjectId('u1') }), []);
  const managerProjects = history.listProjects(manager);
  assert.ok(managerProjects.some((project) => project.id === history.imageEditorProjectId('u1')));
  assert.ok(managerProjects.some((project) => project.id === history.imageEditorProjectId('u2')));
  assert.equal(history.updateHistoryItem(bob, aliceItem.id, { favorite: true }).status, 403);
  assert.equal(history.updateHistoryItem(manager, aliceItem.id, { favorite: true }).status, 200);
  assert.equal(history.deleteHistoryItem(manager, bobItem.id, 'hide').status, 200);
  assert.deepEqual(
    history.listVisibleItems(manager, { canvasId: history.imageEditorProjectId('u2'), includeHidden: true }).map((item) => item.url),
    ['/files/output/bob-web.png'],
  );
}));

test('history item listing supports bounded pagination', () => withTempData(() => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  for (let i = 0; i < 5; i += 1) {
    history.addHistoryItems(
      [{ url: `/files/output/page-${i}.png`, kind: 'image', title: `Page ${i}` }],
      { canvasId: 'c1' },
      { id: 'u1', role: 'designer' },
    );
  }

  const page1 = history.listVisibleItems({ id: 'u1', role: 'designer' }, { limit: 2 });
  const page2 = history.listVisibleItems({ id: 'u1', role: 'designer' }, { limit: 2, offset: 2 });
  assert.equal(page1.length, 2);
  assert.equal(page2.length, 2);
  assert.equal(new Set([...page1, ...page2].map((item) => item.id)).size, 4);
}));

test('owner can hide without deleting output file', () => withTempData(() => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  const file = path.join(config.OUTPUT_DIR, 'a.png');
  fs.writeFileSync(file, 'x');
  const [item] = history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image' }], { canvasId: 'c1' }, { id: 'u1', role: 'designer' });
  const result = history.deleteHistoryItem({ id: 'u1', role: 'designer' }, item.id, 'hide');
  assert.equal(result.status, 200);
  assert.equal(fs.existsSync(file), true);
  assert.equal(history.listVisibleItems({ id: 'u1', role: 'designer' }).length, 0);
  assert.equal(history.listVisibleItems({ id: 'u1', role: 'designer' }, { includeHidden: true }).length, 1);
}));

test('admin can delete file while regular users cannot', () => withTempData(() => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1', sharedWith: [{ userId: 'u2', permission: 'edit' }] }]);
  const file = path.join(config.OUTPUT_DIR, 'a.png');
  fs.writeFileSync(file, 'x');
  const [item] = history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image' }], { canvasId: 'c1' }, { id: 'u1', role: 'designer' });

  assert.equal(history.deleteHistoryItem({ id: 'u1', role: 'designer' }, item.id, 'delete-file').status, 403);
  assert.equal(history.deleteHistoryItem({ id: 'u2', role: 'designer' }, item.id, 'delete-file').status, 403);
  const adminResult = history.deleteHistoryItem({ id: 'admin', role: 'manager' }, item.id, 'delete-file');
  assert.equal(adminResult.status, 200);
  assert.equal(fs.existsSync(file), false);
}));

test('scanned output files are visible only to admin in unarchived project', () => withTempData(() => {
  writeCanvases([]);
  fs.writeFileSync(path.join(config.OUTPUT_DIR, 'legacy.png'), 'x');
  assert.equal(history.listVisibleItems({ id: 'u1', role: 'designer' }).length, 0);
  const adminItems = history.listVisibleItems({ id: 'admin', role: 'admin' });
  assert.equal(adminItems.length, 1);
  assert.equal(adminItems[0].canvasId, history.UNARCHIVED_PROJECT_ID);
}));

test('admin can delete scanned unarchived output files', () => withTempData(() => {
  writeCanvases([]);
  const file = path.join(config.OUTPUT_DIR, 'legacy.png');
  fs.writeFileSync(file, 'x');
  const [item] = history.listVisibleItems({ id: 'admin', role: 'admin' });
  const result = history.deleteHistoryItem({ id: 'admin', role: 'admin' }, item.id, 'delete-file');
  assert.equal(result.status, 200);
  assert.equal(fs.existsSync(file), false);
}));
