import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const config = require('../backend/src/config.js');
const seedvr2 = require('../backend/src/providers/seedvr2.js');

function read(relative: string) {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
}

test('SeedVR2 resolves supported Base URL forms', () => {
  assert.equal(seedvr2.normalizeSeedvr2BaseUrl('https://api2.65535.space/'), 'https://api2.65535.space');
  assert.equal(seedvr2.resolveSeedvr2EditUrl('https://api2.65535.space'), 'https://api2.65535.space/v1/images/edits');
  assert.equal(seedvr2.resolveSeedvr2EditUrl('https://proxy.example/base/v1'), 'https://proxy.example/base/v1/images/edits');
  assert.equal(seedvr2.resolveSeedvr2EditUrl('https://proxy.example/v1/images/edits/'), 'https://proxy.example/v1/images/edits');
  assert.equal(seedvr2.normalizeSeedvr2BaseUrl('ftp://api.example'), '');
  assert.equal(seedvr2.normalizeSeedvr2BaseUrl('https://user:pass@api.example'), '');
  assert.equal(seedvr2.normalizeSeedvr2BaseUrl('https://api.example?token=x'), '');
});

test('SeedVR2 validates exact aspect ratio and 34 MP limit', () => {
  assert.deepEqual(seedvr2.validateTargetSize(1200, 800, 2400, 1600), { width: 2400, height: 1600 });
  assert.throws(() => seedvr2.validateTargetSize(1200, 800, 2400, 1601), /比例必须与原图完全一致/);
  assert.throws(() => seedvr2.validateTargetSize(1000, 1000, 6000, 6000), /3400 万像素/);
  assert.throws(() => seedvr2.validateTargetSize(1000, 1000, 0, 0), /正整数/);
});

test('SeedVR2 sends one multipart image with documented defaults and saves only the output', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-seedvr2-'));
  const previousOutputDir = config.OUTPUT_DIR;
  config.OUTPUT_DIR = temp;
  t.after(() => {
    config.OUTPUT_DIR = previousOutputDir;
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const inputBuffer = await sharp({ create: { width: 2, height: 1, channels: 3, background: '#336699' } }).png().toBuffer();
  const outputBuffer = await sharp({ create: { width: 4, height: 2, channels: 3, background: '#6699cc' } }).png().toBuffer();
  let captured: any = null;
  const fetchImpl = async (url: string, init: any) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ b64_json: outputBuffer.toString('base64') }] }),
    };
  };

  const result = await seedvr2.runSeedvr2Upscale({
    imageUrl: `data:image/png;base64,${inputBuffer.toString('base64')}`,
    width: 4,
    height: 2,
  }, {
    apiKey: 'Bearer sk-seedvr2-secret',
    baseUrl: 'https://api2.65535.space/',
    savePath: path.join(temp, 'legacy-save-path'),
    fetchImpl,
  });

  assert.equal(captured.url, 'https://api2.65535.space/v1/images/edits');
  assert.equal(captured.init.headers.Authorization, 'Bearer sk-seedvr2-secret');
  assert.equal(captured.init.body.get('model'), 'seedvr2-7b');
  assert.equal(captured.init.body.get('prompt'), 'Upscale this image');
  assert.equal(captured.init.body.get('size'), '4x2');
  assert.equal(captured.init.body.get('seed'), '42');
  assert.equal(captured.init.body.get('color_correction'), 'wavelet');
  assert.equal(captured.init.body.get('resize_method'), 'lanczos');
  assert.equal(captured.init.body.get('response_format'), 'b64_json');
  assert.equal(captured.init.body.getAll('image').length, 1);
  assert.equal(result.width, 4);
  assert.equal(result.height, 2);
  assert.equal(result.outputFormat, 'jpg');
  assert.match(result.imageUrl, /^\/files\/output\/seedvr2_/);
  assert.match(result.imageUrl, /\.jpg$/);
  assert.equal(fs.existsSync(path.join(temp, path.basename(result.imageUrl))), true);
  assert.equal(fs.existsSync(path.join(temp, 'legacy-save-path', path.basename(result.imageUrl))), false);
});

test('SeedVR2 rejects invalid documented enum values before calling upstream', async () => {
  const inputBuffer = await sharp({ create: { width: 2, height: 1, channels: 3, background: '#000000' } }).png().toBuffer();
  let called = false;
  await assert.rejects(
    seedvr2.runSeedvr2Upscale({
      imageUrl: `data:image/png;base64,${inputBuffer.toString('base64')}`,
      width: 4,
      height: 2,
      colorCorrection: 'invalid',
    }, {
      apiKey: 'sk-test',
      baseUrl: 'https://api2.65535.space',
      fetchImpl: async () => { called = true; throw new Error('should not run'); },
    }),
    /wavelet 或 none/,
  );
  assert.equal(called, false);
});

test('SeedVR2 keeps custom parameters and redacts the API Key from upstream errors', async () => {
  const inputBuffer = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#112233' } }).png().toBuffer();
  const secret = 'sk-seedvr2-do-not-leak';
  let captured: any = null;
  await assert.rejects(
    seedvr2.runSeedvr2Upscale({
      imageUrl: `data:image/png;base64,${inputBuffer.toString('base64')}`,
      width: 6,
      height: 4,
      seed: 7,
      colorCorrection: 'none',
      resizeMethod: 'bicubic',
      prompt: 'Restore fine details',
    }, {
      apiKey: secret,
      baseUrl: 'https://api2.65535.space/v1',
      fetchImpl: async (_url: string, init: any) => {
        captured = init.body;
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ error: { message: `invalid bearer ${secret}` } }),
        };
      },
    }),
    (error: any) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, 'upstream_error');
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.match(error.message, /\[REDACTED\]/);
      return true;
    },
  );
  assert.equal(captured.get('seed'), '7');
  assert.equal(captured.get('color_correction'), 'none');
  assert.equal(captured.get('resize_method'), 'bicubic');
  assert.equal(captured.get('prompt'), 'Restore fine details');
});

test('SeedVR2 timeout covers reading the upstream response body', async () => {
  const inputBuffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000000' } }).png().toBuffer();
  await assert.rejects(
    seedvr2.runSeedvr2Upscale({
      imageUrl: `data:image/png;base64,${inputBuffer.toString('base64')}`,
      width: 4,
      height: 4,
    }, {
      apiKey: 'sk-test',
      baseUrl: 'https://api2.65535.space',
      timeoutMs: 10,
      fetchImpl: async (_url: string, init: any) => ({
        ok: true,
        status: 200,
        text: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error: any = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        }),
      }),
    }),
    (error: any) => error.status === 504 && error.code === 'timeout',
  );
});

test('SeedVR2 frontend, canvas and packaged backend wiring stay registered', () => {
  const registry = read('src/config/nodeRegistry.ts');
  const ports = read('src/config/portTypes.ts');
  const types = read('src/types/canvas.ts');
  const canvas = read('src/components/Canvas.tsx');
  const loop = read('src/components/nodes/LoopNode.tsx');
  const actionBar = read('src/components/NodeActionBar.tsx');
  const server = read('backend/src/server.js');
  const permissions = read('backend/src/auth/toolPermissions.js');
  const route = read('backend/src/routes/seedvr2.js');
  const node = read('src/components/nodes/Seedvr2UpscaleNode.tsx');
  const postBuild = read('electron/_post_build.cjs');
  const features = JSON.parse(read('features.json'));

  assert.match(registry, /type:\s*'seedvr2-upscale'[\s\S]*label:\s*'SeedVR2超分'/);
  assert.match(ports, /'seedvr2-upscale':\s*\{\s*inputs:\s*\['image'\],\s*outputs:\s*\['image'\]\s*\}/);
  assert.match(types, /\|\s*'seedvr2-upscale'/);
  assert.match(canvas, /'seedvr2-upscale':\s*Seedvr2UpscaleNode/);
  assert.match(loop, /'seedvr2-upscale'/);
  assert.match(actionBar, /'seedvr2-upscale'/);
  assert.match(server, /app\.use\('\/api\/seedvr2', seedvr2Router\)/);
  assert.match(permissions, /'seedvr2-upscale'/);
  assert.match(route, /requireNodePermission\('seedvr2-upscale'\)/);
  assert.match(route, /addGeneratedHistoryItems/);
  assert.match(node, /seedvr2OutputFormat/);
  assert.match(postBuild, /routes', 'seedvr2\.t8c'/);
  assert.match(postBuild, /providers', 'seedvr2\.t8c'/);
  assert.equal(features.seedvr2Upscale.nodeType, 'seedvr2-upscale');
  assert.equal(features.executableNodeTypes.includes('seedvr2-upscale'), true);
});
