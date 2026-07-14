import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { normalizeProfile, validateDslSpec } = require('../backend/src/tools/remotion/schema');
const { validateTsxSource } = require('../backend/src/tools/remotion/tsxValidator');
const { assertSafeRemoteUrl, isPrivateAddress } = require('../backend/src/tools/remotion/assets');
const manager = require('../backend/src/tools/remotion/jobManager');

const ROOT = path.resolve(__dirname, '..');

function validSpec() {
  return {
    version: 't8-remotion/v1',
    assets: [
      { id: 'asset-1', kind: 'image', label: 'hero' },
      { id: 'asset-2', kind: 'audio', label: 'music' },
    ],
    scenes: [{
      id: 'scene-1',
      start: 0,
      duration: 8,
      background: '#09090b',
      transition: 'fade',
      layers: [
        { id: 'hero', type: 'image', assetId: 'asset-1', start: 0, duration: 8, x: 0, y: 0, width: 1, height: 1, objectFit: 'cover' },
        { id: 'title', type: 'text', start: 0, duration: 4, text: 'Hello', x: 0, y: 0, width: 0.8, height: 0.2, enter: { type: 'typewriter', duration: 1, delay: 0 } },
        { id: 'music', type: 'audio', assetId: 'asset-2', start: 0, duration: 8, volume: 0.8, loop: true },
      ],
    }],
  };
}

test('Remotion profile presets resolve authoritative dimensions and frames', () => {
  assert.deepEqual(normalizeProfile({ ratio: '9:16', resolution: '720p', fps: 24, duration: 5 }), {
    ratio: '9:16', resolution: '720p', fps: 24, duration: 5, width: 720, height: 1280, durationInFrames: 120,
  });
  assert.equal(normalizeProfile({ duration: 999 }).duration, 60);
});

test('Remotion JSON DSL accepts valid media timeline', () => {
  const result = validateDslSpec(validSpec(), {
    profile: { ratio: '16:9', resolution: '1080p', fps: 30, duration: 8 },
    assets: [
      { id: 'asset-1', kind: 'image', url: '/files/input/hero.png' },
      { id: 'asset-2', kind: 'audio', url: '/files/input/music.mp3' },
    ],
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.profile.durationInFrames, 240);
});

test('Remotion JSON DSL rejects missing assets and out-of-range timelines', () => {
  const spec = validSpec();
  spec.scenes[0].duration = 10;
  spec.scenes[0].layers[0].assetId = 'missing';
  const result = validateDslSpec(spec, {
    profile: { duration: 8 },
    assets: [{ id: 'asset-1', kind: 'image' }, { id: 'asset-2', kind: 'audio' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /超出总时长/);
  assert.match(result.errors.join('\n'), /未声明素材 missing/);
});

test('expert TSX accepts frame-driven allowlisted Remotion component', () => {
  const source = `
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
export const GeneratedComposition: React.FC<any> = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const opacity = interpolate(frame, [0, fps], [0, 1], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity}} />;
};`;
  const result = validateTsxSource(source);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('expert TSX blocks network, arbitrary imports, URL literals and CSS animations', () => {
  const source = `
import React from 'react';
import fs from 'node:fs';
import {useCurrentFrame, useVideoConfig} from 'remotion';
export const GeneratedComposition = () => {
  useCurrentFrame(); useVideoConfig(); fetch('https://example.com/a');
  return <div style={{animation: 'spin 1s'}}>x</div>;
};`;
  const result = validateTsxSource(source);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /禁止导入模块: node:fs/);
  assert.match(result.errors.join('\n'), /禁止使用 API: fetch/);
  assert.match(result.errors.join('\n'), /外部 URL/);
  assert.match(result.errors.join('\n'), /禁止 CSS 属性: animation/);
});

test('asset SSRF guard rejects loopback and recognizes private ranges', async () => {
  assert.equal(isPrivateAddress('10.1.2.3'), true);
  assert.equal(isPrivateAddress('192.168.1.2'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  await assert.rejects(() => assertSafeRemoteUrl('http://127.0.0.1/private.mp4'), /内网|本机/);
});

test('job ownership only permits creator or administrator', () => {
  const job = { userId: 'u1' };
  assert.equal(manager.canAccess(job, { id: 'u1', role: 'member' }), true);
  assert.equal(manager.canAccess(job, { id: 'u2', role: 'member' }), false);
  assert.equal(manager.canAccess(job, { id: 'u2', role: 'admin' }), true);
});

test('Remotion validation route uses standard response envelope', async () => {
  const express = require('express');
  const router = require('../backend/src/routes/remotion');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); });
  app.use('/api/remotion', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/remotion/spec/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'json',
        source: JSON.stringify(validSpec()),
        profile: { duration: 8 },
        assets: [{ id: 'asset-1', kind: 'image' }, { id: 'asset-2', kind: 'audio' }],
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.data.valid, true);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Remotion node is registered across canvas, ports, permissions and Electron package', () => {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(read('src/types/canvas.ts'), /'remotion-animation'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type:\s*'remotion-animation'/);
  assert.match(read('src/config/portTypes.ts'), /'remotion-animation':\s*\{\s*inputs:\s*\['text', 'image', 'video', 'audio'\],\s*outputs:\s*\['video'\]/);
  assert.match(read('src/components/Canvas.tsx'), /'remotion-animation':\s*RemotionAnimationNode/);
  const nodeSource = read('src/components/nodes/RemotionAnimationNode.tsx');
  assert.match(nodeSource, /settings\.llmConfigs \|\| state\.settings\.llmApiKeys/);
  assert.match(nodeSource, /llmKeyId:\s*activeLlmConfig\?\.id/);
  assert.doesNotMatch(nodeSource, /LLM_MODELS/);
  assert.doesNotMatch(nodeSource, /generateExternalLlm/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'remotion-animation'/);
  assert.match(read('backend/src/server.js'), /app\.use\('\/api\/remotion', remotionRouter\)/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.remotion, '4.0.489');
  for (const name of ['@remotion/bundler', '@remotion/renderer', '@remotion/media', '@remotion/transitions']) {
    assert.equal(pkg.dependencies[name], pkg.dependencies.remotion);
  }
  assert.equal(pkg.build.files.includes('electron/remotion-worker.cjs'), true);
  assert.equal(pkg.build.files.includes('remotion/**/*'), true);
});

test('optional real Remotion worker renders a tiny MP4', { skip: process.env.T8_RUN_REMOTION_SMOKE !== '1', timeout: 10 * 60 * 1000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-remotion-smoke-'));
  const publicDir = path.join(dir, 'public');
  const outputLocation = path.join(dir, 'smoke.mp4');
  fs.mkdirSync(publicDir, { recursive: true });
  const requestFile = path.join(dir, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify({
    entryPoint: path.join(ROOT, 'remotion', 'index.tsx'),
    publicDir,
    outputLocation,
    nodeModulesDir: path.join(ROOT, 'node_modules'),
    browserCacheDir: path.join(dir, 'browser-cache'),
    concurrency: 1,
    inputProps: {
      profile: { width: 320, height: 180, fps: 24, duration: 1, durationInFrames: 24 },
      assets: [],
      spec: {
        version: 't8-remotion/v1',
        assets: [],
        scenes: [{ id: 'scene', start: 0, duration: 1, background: '#111827', transition: 'fade', layers: [{ id: 'title', type: 'text', start: 0, duration: 1, text: 'T8', x: 0, y: 0, width: 0.8, height: 0.5, enter: { type: 'scale', duration: 0.3, delay: 0 } }] }],
      },
    },
  }));
  try {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'electron', 'remotion-worker.cjs'), requestFile], { cwd: ROOT, windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
    assert.equal(fs.existsSync(outputLocation), true);
    assert.ok(fs.statSync(outputLocation).size > 1000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
