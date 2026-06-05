import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const config = require('../backend/src/config.js');
const history = require('../backend/src/utils/generationHistory.js');

function withTempData(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-history-'));
  const old = {
    DATA_DIR: config.DATA_DIR,
    OUTPUT_DIR: config.OUTPUT_DIR,
    CANVAS_FILE: config.CANVAS_FILE,
  };
  config.DATA_DIR = path.join(tmp, 'data');
  config.OUTPUT_DIR = path.join(tmp, 'output');
  config.CANVAS_FILE = path.join(config.DATA_DIR, 'canvas_list.json');
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  try {
    return fn(tmp);
  } finally {
    Object.assign(config, old);
    fs.rmSync(tmp, { recursive: true, force: true });
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

test('addHistoryItems deduplicates by url and updates context', () => withTempData(() => {
  writeCanvases([{ id: 'c1', ownerUserId: 'u1' }]);
  history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image', title: 'A' }], { canvasId: 'c1', prompt: 'old' }, { id: 'u1', role: 'designer' });
  history.addHistoryItems([{ url: '/files/output/a.png', kind: 'image', title: 'B' }], { canvasId: 'c1', prompt: 'new' }, { id: 'u1', role: 'designer' });
  const items = history.listVisibleItems({ id: 'u1', role: 'designer' });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'B');
  assert.equal(items[0].prompt, 'new');
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
