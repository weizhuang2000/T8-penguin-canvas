import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('canvas list recovers missing entries from entity files and preserves the current index', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-canvas-recovery-'));
  const dataDir = path.join(root, 'data');
  const autoRoot = path.join(root, 'autosave');
  const autoDir = path.join(autoRoot, 'T8-penguin-canvas', 'canvases');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(autoDir, { recursive: true });

  const config = require('../backend/src/config.js');
  const previous = {
    DATA_DIR: config.DATA_DIR,
    CANVAS_FILE: config.CANVAS_FILE,
    SETTINGS_FILE: config.SETTINGS_FILE,
  };
  config.DATA_DIR = dataDir;
  config.CANVAS_FILE = path.join(dataDir, 'canvas_list.json');
  config.SETTINGS_FILE = path.join(dataDir, 'settings.json');
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify({ canvasAutoSavePath: autoRoot }));

  const existingId = 'canvas-1784000000000-existing';
  const missingId = 'canvas-1784100000000-missing';
  fs.writeFileSync(config.CANVAS_FILE, JSON.stringify([{
    id: existingId,
    name: 'Existing canvas',
    ownerUserId: '1',
    ownerName: 'Admin',
    ownerRole: 'admin',
    nodeCount: 1,
    createdAt: 1784000000000,
    updatedAt: 1784000000001,
  }]));
  fs.writeFileSync(path.join(dataDir, `canvas_${existingId}.json`), JSON.stringify({
    ownerUserId: '1', ownerName: 'Admin', ownerRole: 'admin',
    nodes: [{ id: 'existing-node' }], edges: [],
  }));
  fs.writeFileSync(path.join(dataDir, `canvas_${missingId}.json`), JSON.stringify({
    ownerUserId: '32', ownerName: 'Designer', ownerRole: 'designer',
    sharedWith: [{ userId: '2', permission: 'view' }],
    nodes: [{ id: 'one' }, { id: 'two' }], edges: [],
  }));
  fs.writeFileSync(path.join(autoDir, 'designer-canvas.json'), JSON.stringify({
    schema: 't8-penguin-canvas-autosave',
    autoSavedAt: '2026-07-25T12:00:00.000Z',
    canvas: {
      id: missingId,
      name: 'Recovered designer canvas',
      ownerUserId: '32',
      ownerName: 'Designer',
      ownerRole: 'designer',
      createdAt: 1784100000000,
      updatedAt: 1784100001000,
    },
    nodes: [{ id: 'one' }, { id: 'two' }],
    edges: [],
  }));

  const routePath = require.resolve('../backend/src/routes/canvas.js');
  delete require.cache[routePath];
  const router = require(routePath);
  const express = require('../backend/node_modules/express');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: '1', role: 'admin', name: 'Admin' };
    next();
  });
  app.use('/api/canvas', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(() => {
    delete require.cache[routePath];
    Object.assign(config, previous);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/canvas`).then((res) => res.json());
  assert.equal(response.success, true);
  assert.equal(response.data.length, 2);
  const recovered = response.data.find((item) => item.id === missingId);
  assert.equal(recovered.name, 'Recovered designer canvas');
  assert.equal(recovered.ownerUserId, '32');
  assert.equal(recovered.nodeCount, 2);
  assert.equal(recovered.recoveredFromDataFile, true);

  const saved = JSON.parse(fs.readFileSync(config.CANVAS_FILE, 'utf8'));
  assert.deepEqual(new Set(saved.map((item) => item.id)), new Set([existingId, missingId]));
  assert.equal(fs.readdirSync(dataDir).some((name) => /^canvas_list\.json\.recovery-\d+\.bak$/.test(name)), true);

  router._test.saveCanvasList([{
    ...saved.find((item) => item.id === existingId),
    name: 'Existing canvas renamed',
    updatedAt: Date.now(),
  }]);
  const mergedAfterStaleSave = JSON.parse(fs.readFileSync(config.CANVAS_FILE, 'utf8'));
  assert.equal(mergedAfterStaleSave.length, 2, 'a stale per-canvas save must not drop other canvas entries');
  assert.equal(mergedAfterStaleSave.find((item) => item.id === existingId).name, 'Existing canvas renamed');
});
