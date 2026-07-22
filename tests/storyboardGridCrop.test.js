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

test('storyboard adaptive grid crop follows uneven row boundaries without leaking adjacent rows', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-storyboard-adaptive-grid-'));
  const previousOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = root;
  t.after(() => {
    config.OUTPUT_DIR = previousOutputDir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const sourcePath = path.join(root, 'uneven.png');
  const rowBounds = [0, 30, 75, 120];
  const colBounds = [0, 55, 120];
  const colors = [
    { r: 220, g: 30, b: 30 }, { r: 30, g: 180, b: 40 },
    { r: 30, g: 80, b: 220 }, { r: 220, g: 180, b: 30 },
    { r: 180, g: 30, b: 200 }, { r: 30, g: 190, b: 190 },
  ];
  const composites = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 2; col++) {
      composites.push({
        input: await sharp({
          create: {
            width: colBounds[col + 1] - colBounds[col],
            height: rowBounds[row + 1] - rowBounds[row],
            channels: 3,
            background: colors[row * 2 + col],
          },
        }).png().toBuffer(),
        left: colBounds[col],
        top: rowBounds[row],
      });
    }
  }
  await sharp({ create: { width: 120, height: 120, channels: 3, background: '#000000' } })
    .composite(composites)
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
      gap: 0,
      orderMode: 'row',
      uniformTiles: true,
      detectGridLines: true,
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.error);
  assert.deepEqual(payload.data.layout.rowBoundaries, rowBounds);
  assert.deepEqual(payload.data.layout.colBoundaries, colBounds);
  assert.equal(payload.data.layout.detectedRows, 2);
  assert.equal(payload.data.layout.detectedCols, 1);

  const samples = await Promise.all(payload.data.urls.map(async (url) => {
    const filename = decodeURIComponent(String(url).replace('/files/output/', ''));
    const { data, info } = await sharp(path.join(root, filename)).raw().toBuffer({ resolveWithObject: true });
    const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    return Array.from(data.subarray(offset, offset + 3));
  }));
  samples.forEach((sample, index) => {
    const expected = colors[index];
    assert.ok(Math.abs(sample[0] - expected.r) <= 2, `tile ${index + 1} red channel leaked`);
    assert.ok(Math.abs(sample[1] - expected.g) <= 2, `tile ${index + 1} green channel leaked`);
    assert.ok(Math.abs(sample[2] - expected.b) <= 2, `tile ${index + 1} blue channel leaked`);
  });
});
