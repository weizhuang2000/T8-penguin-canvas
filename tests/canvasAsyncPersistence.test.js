import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('canvas disk writes yield the event loop and remain atomic', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-canvas-async-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const config = require('../backend/src/config.js');
  const previousConfig = {
    DATA_DIR: config.DATA_DIR,
    CANVAS_FILE: config.CANVAS_FILE,
    SETTINGS_FILE: config.SETTINGS_FILE,
  };
  config.DATA_DIR = dataDir;
  config.CANVAS_FILE = path.join(dataDir, 'canvas_list.json');
  config.SETTINGS_FILE = path.join(dataDir, 'settings.json');

  const canvasId = 'canvas-async-write-test';
  fs.writeFileSync(config.CANVAS_FILE, JSON.stringify([
    { id: canvasId, name: 'Async', ownerUserId: '1', nodeCount: 0, createdAt: 1, updatedAt: 1 },
  ]));
  fs.writeFileSync(path.join(dataDir, `canvas_${canvasId}.json`), JSON.stringify({ nodes: [], edges: [] }));

  const originalWriteFile = fs.promises.writeFile;
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  let markWriteStarted;
  const writeStarted = new Promise((resolve) => { markWriteStarted = resolve; });
  fs.promises.writeFile = async (...args) => {
    if (String(args[0]).includes(`canvas_${canvasId}.json`)) {
      markWriteStarted();
      await writeGate;
    }
    return originalWriteFile.apply(fs.promises, args);
  };

  const express = require('express');
  const canvasRouter = require('../backend/src/routes/canvas.js');
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req, _res, next) => {
    req.user = { id: '1', role: 'admin', name: 'Admin' };
    next();
  });
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.use('/api/canvas', canvasRouter);

  const server = await new Promise((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  t.after(() => server.close());
  t.after(() => {
    fs.promises.writeFile = originalWriteFile;
    Object.assign(config, previousConfig);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const savePromise = fetch(`${base}/api/canvas/${canvasId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes: [{ id: 'n1', type: 'text', position: { x: 0, y: 0 }, data: { text: 'saved' } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
  });

  await writeStarted;
  const ping = await fetch(`${base}/ping`).then((res) => res.json());
  assert.equal(ping.ok, true, 'another response should complete while the canvas file write is pending');

  releaseWrite();
  const saved = await savePromise.then((res) => res.json());
  assert.equal(saved.success, true);
  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, `canvas_${canvasId}.json`), 'utf8'));
  assert.equal(persisted.nodes[0].data.text, 'saved');
});
