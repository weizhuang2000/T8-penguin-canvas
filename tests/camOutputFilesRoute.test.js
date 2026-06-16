import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

test('cam-output file routes list importable projects and their images safely', async () => {
  const express = require('express');
  const config = require('../backend/src/config.js');
  const filesRouter = require('../backend/src/routes/files.js');

  const oldCamOutputRoot = config.CAM_OUTPUT_ROOT;
  const root = mkdtempSync(join(tmpdir(), 't8-cam-output-'));
  config.CAM_OUTPUT_ROOT = root;

  mkdirSync(join(root, 'Project A', 'camoutput'), { recursive: true });
  mkdirSync(join(root, 'Empty Project', 'camoutput'), { recursive: true });
  writeFileSync(join(root, 'Project A', 'camoutput', '02.png'), Buffer.from('PNG'));
  writeFileSync(join(root, 'Project A', 'camoutput', '01.jpg'), Buffer.from('JPG'));
  writeFileSync(join(root, 'Project A', 'camoutput', 'notes.txt'), Buffer.from('ignore'));

  const app = express();
  app.use('/api/files', filesRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const projectsRes = await fetch(`${base}/api/files/cam-output/projects`);
    const projectsJson = await projectsRes.json();
    assert.equal(projectsRes.ok, true);
    assert.equal(projectsJson.success, true);
    assert.equal(projectsJson.data.root, root);
    assert.deepEqual(projectsJson.data.projects.map((project) => project.name), ['Project A']);
    assert.equal(projectsJson.data.projects[0].imageCount, 2);

    const imagesRes = await fetch(`${base}/api/files/cam-output/projects/${encodeURIComponent('Project A')}/images`);
    const imagesJson = await imagesRes.json();
    assert.equal(imagesRes.ok, true);
    assert.equal(imagesJson.success, true);
    assert.equal(imagesJson.data.project, 'Project A');
    assert.deepEqual(imagesJson.data.images.map((image) => image.filename), ['01.jpg', '02.png']);
    assert.deepEqual(imagesJson.data.images.map((image) => image.url), [
      '/files/cam-output/Project%20A/01.jpg',
      '/files/cam-output/Project%20A/02.png',
    ]);

    const badRes = await fetch(`${base}/api/files/cam-output/projects/${encodeURIComponent('bad\\name')}/images`);
    const badJson = await badRes.json();
    assert.equal(badRes.status, 400);
    assert.equal(badJson.success, false);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    config.CAM_OUTPUT_ROOT = oldCamOutputRoot;
    rmSync(root, { recursive: true, force: true });
  }
});

test('server exposes a guarded cam-output image endpoint before generic static mounts', () => {
  const server = readFileSync(new URL('../backend/src/server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/files\/cam-output\/:project\/:filename',\s*requireAuth/);
  assert.match(server, /CAM_OUTPUT_IMAGE_RE/);
  assert.match(server, /isPathInside\(folder, file\)/);
});

test('frontend reports missing cam-output backend route with deployment guidance', () => {
  const api = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
  assert.match(api, /CAM_OUTPUT_ROUTE_MISSING_MESSAGE/);
  assert.match(api, /后端接口未加载/);
  assert.match(api, /重启 PM2\/后端服务/);
  assert.match(api, /res\.status === 404/);
  assert.match(api, /requestCamOutput/);
});
