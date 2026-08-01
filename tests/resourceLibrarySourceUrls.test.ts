import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');

test('resource library migrates sourceUrl and accumulates duplicate sourceUrls', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-resource-source-urls-'));
  const inputDir = path.join(tmpDir, 'input');
  const resourcesDir = path.join(tmpDir, 'resources');
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(path.join(resourcesDir, 'image'), { recursive: true });
  fs.writeFileSync(path.join(inputDir, 'same.png'), ONE_PIXEL_PNG);
  fs.writeFileSync(path.join(resourcesDir, 'image', 'existing.png'), ONE_PIXEL_PNG);
  fs.writeFileSync(path.join(resourcesDir, 'resource_library.json'), JSON.stringify({
    schema: 't8-resource-library',
    version: 1,
    categories: [],
    items: [{
      id: 'existing',
      kind: 'image',
      categoryId: 'image_uncategorized',
      title: '旧资源',
      originalName: 'existing.png',
      fileRel: 'image/existing.png',
      mime: 'image/png',
      size: ONE_PIXEL_PNG.length,
      sha256: crypto.createHash('sha256').update(ONE_PIXEL_PNG).digest('hex'),
      tags: [],
      sourceUrl: '/files/output/old.png',
      createdAt: 1,
      updatedAt: 1,
    }],
  }));

  const config = require('../backend/src/config.js');
  const oldConfig = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    INPUT_DIR: config.INPUT_DIR,
    OUTPUT_DIR: config.OUTPUT_DIR,
  };
  t.after(() => Object.assign(config, oldConfig));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = resourcesDir;
  config.INPUT_DIR = inputDir;
  config.OUTPUT_DIR = path.join(tmpDir, 'output');

  const express = require('express');
  const resourcesRouter = require('../backend/src/routes/resources.js');
  const app = express();
  app.use('/api/resources', resourcesRouter);
  const server = await new Promise<any>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const before = await fetch(`${base}/api/resources/items?kind=image`).then((res) => res.json());
  assert.deepEqual(before.data[0].sourceUrls, ['/files/output/old.png']);

  const duplicate = await fetch(`${base}/api/resources/items/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '/files/input/same.png', kind: 'image' }),
  }).then((res) => res.json());
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.data.sourceUrls, ['/files/output/old.png', '/files/input/same.png']);

  const stored = JSON.parse(fs.readFileSync(path.join(resourcesDir, 'resource_library.json'), 'utf8'));
  assert.equal(stored.version, 2);
  assert.equal(stored.items.length, 1);
  assert.deepEqual(stored.items[0].sourceUrls, ['/files/output/old.png', '/files/input/same.png']);
});
