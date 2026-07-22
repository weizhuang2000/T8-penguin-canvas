import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const config = require('../backend/src/config.js');
const imageOpsRouter = require('../backend/src/routes/imageOps.js');

test('storyboard uniform grid crop returns identical tile dimensions with gap and indivisible source size', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-storyboard-grid-crop-'));
  const previousOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = root;
  t.after(() => {
    config.OUTPUT_DIR = previousOutputDir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const sourcePath = path.join(root, 'source.png');
  await sharp({ create: { width: 101, height: 103, channels: 3, background: '#4f46e5' } })
    .png()
    .toFile(sourcePath);

  const app = express();
  app.use(express.json());
  app.use('/api/image', imageOpsRouter);
  const server = await new Promise((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/image/grid-crop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl: `/files/output/${path.basename(sourcePath)}`,
      rows: 3,
      cols: 2,
      gap: 5,
      orderMode: 'row',
      uniformTiles: true,
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.error);
  assert.equal(payload.data.urls.length, 6);
  assert.equal(payload.data.layout.uniformTiles, true);

  const dimensions = await Promise.all(payload.data.urls.map(async (url) => {
    const filename = decodeURIComponent(String(url).replace('/files/output/', ''));
    const metadata = await sharp(path.join(root, filename)).metadata();
    return `${metadata.width}x${metadata.height}`;
  }));
  assert.deepEqual(new Set(dimensions), new Set([`${payload.data.layout.tileWidth}x${payload.data.layout.tileHeight}`]));
});
