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

test('RunningHub video request follows the standard model API contract', () => {
  assert.equal(runninghubVideo.RUNNINGHUB_VIDEO_PATH, '/openapi/v2/rhart-video-g/image-to-video');
  assert.deepEqual(
    runninghubVideo.normalizeRunningHubVideoRequest({
      prompt: 'camera move',
      aspectRatio: '9:16',
      imageUrls: ['https://example.com/a.png'],
      resolution: '720p',
      duration: 30,
    }),
    {
      prompt: 'camera move',
      aspectRatio: '9:16',
      imageUrls: ['https://example.com/a.png'],
      resolution: '720p',
      duration: 30,
    },
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ prompt: 'x', duration: 31 }),
    /6-30/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({
      prompt: 'x',
      imageUrls: Array.from({ length: 8 }, (_, index) => `https://example.com/${index}.png`),
    }),
    /最多支持 7 张/,
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

test('video node and API key management expose the RunningHub model', () => {
  const models = read('src/providers/models.ts');
  const node = read('src/components/nodes/VideoNode.tsx');
  const service = read('src/services/generation.ts');
  const settings = read('src/components/ApiSettings.tsx');
  const proxy = read('backend/src/routes/proxy.js');

  assert.match(models, /id: 'runninghub-video'[\s\S]*rhart-video-g\/image-to-video/);
  assert.match(node, /submitRunningHubVideo/);
  assert.match(node, /queryRunningHubVideo/);
  assert.match(service, /\/api\/proxy\/runninghub\/video\/submit/);
  assert.match(service, /\/api\/proxy\/runninghub\/video\/query/);
  assert.match(settings, /RunningHub \/ RH 钱包应用 \/ Running 视频共用/);
  assert.match(proxy, /\/openapi\/v2\/query/);
  assert.match(proxy, /requireNodePermission\('video'\)/);
});
