import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const runninghubVideo = require('../backend/src/utils/runninghubVideo.js');

const V15 = 'rhart-video-g/image-to-video';
const V31_FAST = 'rhart-video-v3.1-fast/image-to-video';

test('RunningHub V1.5 request keeps backward-compatible defaults and contract', () => {
  const normalized = runninghubVideo.normalizeRunningHubVideoRequest({
    prompt: 'camera move',
    aspectRatio: '9:16',
    imageUrls: ['https://example.com/a.png'],
    resolution: '720p',
    duration: 30,
  });
  assert.equal(normalized.model, V15);
  assert.equal(normalized.path, `/openapi/v2/${V15}`);
  assert.equal(normalized.maxImageBytes, 10 * 1024 * 1024);
  assert.deepEqual(normalized.body, {
    prompt: 'camera move',
    aspectRatio: '9:16',
    imageUrls: ['https://example.com/a.png'],
    duration: 30,
    resolution: '720p',
  });
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: V15, prompt: 'x', duration: 31 }),
    /6-30/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({
      model: V15,
      prompt: 'x',
      imageUrls: Array.from({ length: 8 }, (_, index) => `https://example.com/${index}.png`),
    }),
    /最多支持 7 张/,
  );
});

test('RunningHub V3.1-fast enforces its model-specific request contract', () => {
  const normalized = runninghubVideo.normalizeRunningHubVideoRequest({
    model: V31_FAST,
    prompt: '人物向前奔跑',
    aspectRatio: '16:9',
    imageUrls: ['https://example.com/a.png'],
    duration: 8,
    resolution: '4k',
  });
  assert.equal(normalized.path, `/openapi/v2/${V31_FAST}`);
  assert.equal(normalized.maxImageBytes, 30 * 1024 * 1024);
  assert.equal(normalized.body.duration, '8');
  assert.equal(normalized.body.resolution, '4k');

  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: V31_FAST, prompt: '1234', imageUrls: ['a'] }),
    /5-8000/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: V31_FAST, prompt: '12345' }),
    /至少需要 1 张/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: V31_FAST, prompt: '12345', imageUrls: ['a'], aspectRatio: '1:1' }),
    /不支持比例/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: V31_FAST, prompt: '12345', imageUrls: ['a'], duration: 10 }),
    /仅支持 8 秒/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: V31_FAST, prompt: '12345', imageUrls: ['a'], resolution: '480p' }),
    /不支持分辨率/,
  );
});

test('RunningHub video model path is allowlisted', () => {
  assert.deepEqual(Object.keys(runninghubVideo.RUNNINGHUB_VIDEO_MODELS).sort(), [V15, V31_FAST].sort());
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: '../other', prompt: '12345' }),
    /不支持的 RunningHub 视频模型/,
  );
});

test('RunningHub video result selects the video artifact and normalizes statuses', () => {
  const result = {
    results: [
      { url: 'https://example.com/preview.png', outputType: 'png' },
      { url: 'https://example.com/final.mp4', outputType: 'mp4' },
    ],
  };
  assert.equal(runninghubVideo.extractRunningHubVideoUrl(result), 'https://example.com/final.mp4');
  assert.equal(runninghubVideo.normalizeRunningHubVideoStatus('FAILED'), 'FAILURE');
  assert.equal(runninghubVideo.normalizeRunningHubVideoStatus('RUNNING'), 'RUNNING');
});

test('Running video node and API key management expose both standard models', () => {
  const models = read('src/providers/models.ts');
  const node = read('src/components/nodes/VideoNode.tsx');
  const service = read('src/services/generation.ts');
  const settings = read('src/components/ApiSettings.tsx');
  const proxy = read('backend/src/routes/proxy.js');
  const registry = read('src/config/nodeRegistry.ts');
  const ports = read('src/config/portTypes.ts');
  const canvas = read('src/components/Canvas.tsx');
  const permissions = read('backend/src/auth/toolPermissions.js');

  assert.match(models, /rhart-video-g\/image-to-video/);
  assert.match(models, /rhart-video-v3\.1-fast\/image-to-video/);
  assert.match(models, /全能视频V3\.1-fast · 图生视频低价渠道版/);
  assert.match(registry, /type: 'runninghub-video'[\s\S]*label: 'Running 视频'/);
  assert.match(ports, /'runninghub-video': \{ inputs: \['text', 'image'\], outputs: \['video'\] \}/);
  assert.match(canvas, /'runninghub-video': VideoNode/);
  assert.match(permissions, /'runninghub-video'/);
  assert.match(node, /model: apiModel/);
  assert.match(node, /runningHubVideoModelDef\(nextModel\)/);
  assert.match(service, /interface RunningHubVideoSubmitRequest \{[\s\S]*model: string/);
  assert.match(settings, /企业级-共享 API Key[\s\S]*Running 视频全部模型共用/);
  assert.match(proxy, /normalized\.path/);
  assert.match(proxy, /resolveRunningHubVideoModel/);
  assert.match(proxy, /requireNodePermission\(\['video', 'runninghub-video'\]\)/);
});
