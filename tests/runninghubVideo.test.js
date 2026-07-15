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
const runninghubVideoCatalog = require('../backend/src/utils/runninghubVideoCatalog.js');

const V15 = 'rhart-video-g/image-to-video';
const X_TEXT = 'rhart-video-g/text-to-video';
const X_OFFICIAL_IMAGE = 'rhart-video-g-official/image-to-video';
const X_OFFICIAL_IMAGE_V15 = 'rhart-video-g-official/image-to-video-v1.5';
const X_OFFICIAL_REFERENCE = 'rhart-video-g-official/reference-to-video';
const X_OFFICIAL_EDIT = 'rhart-video-g-official/edit-video';
const X_OFFICIAL_TEXT = 'rhart-video-g-official/text-to-video';
const X_OFFICIAL_EXTEND = 'rhart-video-g-official/video-extend';
const S_IMAGE = 'rhart-video-s/image-to-video';
const S_TEXT = 'rhart-video-s/text-to-video';
const V31_FAST = 'rhart-video-v3.1-fast/image-to-video';
const V31_FAST_TEXT = 'rhart-video-v3.1-fast/text-to-video';
const S_OFFICIAL_IMAGE = 'rhart-video-s-official/image-to-video';
const S_OFFICIAL_TEXT = 'rhart-video-s-official/text-to-video';

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
  assert.equal(normalized.imageField, 'imageUrls');
  assert.deepEqual(normalized.imageUrls, ['https://example.com/a.png']);
  assert.deepEqual(normalized.body, {
    prompt: 'camera move',
    aspectRatio: '9:16',
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

test('RunningHub S low-cost image-to-video uses one imageUrl and optional storyboard', () => {
  const normalized = runninghubVideo.normalizeRunningHubVideoRequest({
    model: S_IMAGE,
    prompt: 'camera moves slowly',
    aspectRatio: '16:9',
    imageUrls: ['https://example.com/a.png'],
    duration: 15,
    storyboard: true,
  });
  assert.equal(normalized.path, `/openapi/v2/${S_IMAGE}`);
  assert.equal(normalized.imageField, 'imageUrl');
  assert.equal(normalized.maxImageBytes, 50 * 1024 * 1024);
  assert.deepEqual(normalized.imageUrls, ['https://example.com/a.png']);
  assert.deepEqual(normalized.body, {
    prompt: 'camera moves slowly',
    duration: '15',
    aspectRatio: '16:9',
    storyboard: true,
  });
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: S_IMAGE, prompt: '12345' }),
    /1 张参考图/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: S_IMAGE, prompt: '12345', imageUrls: ['a', 'b'] }),
    /最多支持 1 张参考图/,
  );
});

test('RunningHub X models normalize their distinct text, image, reference and video contracts', () => {
  const text = runninghubVideo.normalizeRunningHubVideoRequest({
    model: X_TEXT,
    prompt: 'city at night',
    aspectRatio: '1:1',
    resolution: '720p',
    duration: 30,
  });
  assert.deepEqual(text.body, {
    prompt: 'city at night',
    duration: 30,
    aspectRatio: '1:1',
    resolution: '720p',
  });

  const image = runninghubVideo.normalizeRunningHubVideoRequest({
    model: X_OFFICIAL_IMAGE,
    prompt: 'camera moves slowly',
    imageUrls: ['image-a'],
    resolution: '480p',
    duration: 10,
  });
  assert.equal(image.imageField, 'imageUrl');
  assert.deepEqual(image.body, { prompt: 'camera moves slowly', duration: '10', resolution: '480p' });

  const imageV15 = runninghubVideo.normalizeRunningHubVideoRequest({
    model: X_OFFICIAL_IMAGE_V15,
    prompt: 'camera moves slowly',
    imageUrls: ['image-a'],
    duration: 15,
  });
  assert.equal(imageV15.maxImageBytes, 100 * 1024 * 1024);
  assert.equal(imageV15.body.duration, 15);

  const reference = runninghubVideo.normalizeRunningHubVideoRequest({
    model: X_OFFICIAL_REFERENCE,
    prompt: 'combine the characters',
    imageUrls: ['image-a', 'image-b'],
    duration: 6,
  });
  assert.equal(reference.imageField, 'imageUrls');
  assert.deepEqual(reference.imageUrls, ['image-a', 'image-b']);
  assert.equal(reference.body.duration, '6');

  const edit = runninghubVideo.normalizeRunningHubVideoRequest({
    model: X_OFFICIAL_EDIT,
    prompt: 'convert to watercolor',
    videoUrls: ['video-a'],
    resolution: '720p',
  });
  assert.equal(edit.videoField, 'videoUrl');
  assert.equal(edit.maxVideoBytes, 50 * 1024 * 1024);
  assert.deepEqual(edit.videoUrls, ['video-a']);
  assert.deepEqual(edit.body, { prompt: 'convert to watercolor', resolution: '720p' });

  const officialText = runninghubVideo.normalizeRunningHubVideoRequest({
    model: X_OFFICIAL_TEXT,
    prompt: 'cinematic city skyline',
    aspectRatio: '9:16',
    duration: 10,
  });
  assert.equal(officialText.body.aspectRatio, '9:16');
  assert.equal(officialText.body.duration, '10');

  const extend = runninghubVideo.normalizeRunningHubVideoRequest({
    model: X_OFFICIAL_EXTEND,
    prompt: 'continue walking forward',
    videoUrls: ['video-a'],
    duration: 6,
  });
  assert.equal(extend.videoField, 'videoUrl');
  assert.equal(extend.maxVideoBytes, 100 * 1024 * 1024);
  assert.deepEqual(extend.body, { prompt: 'continue walking forward', duration: '6' });

  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: X_OFFICIAL_EDIT, prompt: '12345' }),
    /1 个参考视频/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: X_OFFICIAL_EXTEND, prompt: 'x', videoUrls: ['a', 'b'] }),
    /最多支持 1 个参考视频/,
  );
});

test('RunningHub S low-cost text-to-video rejects images and omits image fields', () => {
  const normalized = runninghubVideo.normalizeRunningHubVideoRequest({
    model: S_TEXT,
    prompt: 'camera moves slowly',
    aspectRatio: '9:16',
    duration: 10,
  });
  assert.equal(normalized.imageField, null);
  assert.deepEqual(normalized.imageUrls, []);
  assert.deepEqual(normalized.body, {
    prompt: 'camera moves slowly',
    duration: '10',
    aspectRatio: '9:16',
    storyboard: false,
  });
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: S_TEXT, prompt: '12345', imageUrls: ['a'] }),
    /最多支持 0 张参考图/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: S_TEXT, prompt: '1234' }),
    /5-4000/,
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
  assert.equal(normalized.imageField, 'imageUrls');
  assert.deepEqual(normalized.imageUrls, ['https://example.com/a.png']);
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

test('RunningHub V3.1-fast text-to-video uses the documented fixed endpoint without catalog scraping', () => {
  const normalized = runninghubVideo.normalizeRunningHubVideoRequest({
    model: V31_FAST_TEXT,
    prompt: '春日午后少女骑车经过稻田',
    aspectRatio: '9:16',
    duration: 8,
    resolution: '1080p',
  });
  assert.equal(normalized.path, '/openapi/v2/rhart-video-v3.1-fast/text-to-video');
  assert.equal(normalized.imageField, null);
  assert.deepEqual(normalized.imageUrls, []);
  assert.deepEqual(normalized.body, {
    prompt: '春日午后少女骑车经过稻田',
    duration: '8',
    aspectRatio: '9:16',
    resolution: '1080p',
  });
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: V31_FAST_TEXT, prompt: '1234' }),
    /5-8000/,
  );
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: V31_FAST_TEXT, prompt: '12345', duration: 10 }),
    /仅支持 8 秒/,
  );
});

test('RunningHub S official image-to-video omits ratio and resolution fields', () => {
  const normalized = runninghubVideo.normalizeRunningHubVideoRequest({
    model: S_OFFICIAL_IMAGE,
    prompt: '人物向前奔跑',
    aspectRatio: '9:16',
    imageUrls: ['https://example.com/720x1280.png'],
    duration: 12,
  });
  assert.equal(normalized.imageField, 'imageUrl');
  assert.deepEqual(normalized.body, {
    prompt: '人物向前奔跑',
    duration: '12',
  });
  assert.equal('aspectRatio' in normalized.body, false);
  assert.equal('resolution' in normalized.body, false);
  assert.throws(
    () => runninghubVideo.normalizeRunningHubVideoRequest({ model: S_OFFICIAL_IMAGE, prompt: 'x', imageUrls: ['a'], duration: 10 }),
    /仅支持 4\/8\/12 秒/,
  );
});

test('RunningHub S official text-to-video maps ratio to API size', () => {
  const landscape = runninghubVideo.normalizeRunningHubVideoRequest({
    model: S_OFFICIAL_TEXT,
    prompt: '海边日落',
    aspectRatio: '16:9',
    duration: 8,
  });
  assert.equal(landscape.imageField, null);
  assert.deepEqual(landscape.body, {
    prompt: '海边日落',
    duration: '8',
    size: '1280x720',
  });
  const portrait = runninghubVideo.normalizeRunningHubVideoRequest({
    model: S_OFFICIAL_TEXT,
    prompt: '海边日落',
    aspectRatio: '9:16',
  });
  assert.equal(portrait.body.size, '720x1280');
});

test('RunningHub video model path is allowlisted', () => {
  assert.deepEqual(Object.keys(runninghubVideo.RUNNINGHUB_VIDEO_MODELS).sort(), [
    V15,
    X_TEXT,
    X_OFFICIAL_IMAGE,
    X_OFFICIAL_IMAGE_V15,
    X_OFFICIAL_REFERENCE,
    X_OFFICIAL_EDIT,
    X_OFFICIAL_TEXT,
    X_OFFICIAL_EXTEND,
    S_IMAGE,
    S_TEXT,
    V31_FAST,
    V31_FAST_TEXT,
    S_OFFICIAL_IMAGE,
    S_OFFICIAL_TEXT,
  ].sort());
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

test('RunningHub full-video catalog keeps only video categories and formats pricing', () => {
  const catalogSource = read('backend/src/utils/runninghubVideoCatalog.js');
  const frontendFallback = read('src/data/runninghubFullVideoCatalog.ts');
  assert.equal(runninghubVideoCatalog.VIDEO_CATEGORIES.has('text-to-video'), true);
  assert.equal(runninghubVideoCatalog.VIDEO_CATEGORIES.has('text-to-image'), false);
  assert.equal(runninghubVideoCatalog.priceLabel({ price: 0.04, unitName: '秒', priceMode: 'UNIT' }), '¥0.04/秒');
  assert.equal(runninghubVideoCatalog.priceLabel({ price: 0.04, priceText: '仅需', unitName: '秒', priceMode: 'UNIT' }), '¥0.04/秒');
  assert.equal(runninghubVideoCatalog.priceLabel({ price: 1.5, priceMode: 'FIXED' }), '¥1.5');
  assert.equal(runninghubVideoCatalog.FALLBACK_RUNNINGHUB_VIDEO_CATALOG.length, 35);
  assert.equal((frontendFallback.match(/\bitem\('/g) || []).length, 35);
  assert.match(catalogSource, /encodeURIComponent\('全能视频'\)/);
  assert.equal(
    runninghubVideoCatalog.DEFAULT_RUNNINGHUB_CALL_API_BASE_URL,
    'https://www.runninghub.ai/zh-cn/call-api',
  );
  assert.equal(
    runninghubVideoCatalog.runningHubCallApiUrl('api-detail/2005884653783007234'),
    'https://www.runninghub.ai/zh-cn/call-api/api-detail/2005884653783007234',
  );
  assert.match(catalogSource, /runningHubCallApiUrl\([\s\S]*?search-api\/standard-model/);
  assert.match(catalogSource, /runningHubCallApiUrl\(`api-detail\/\$\{id\}`/);
  assert.doesNotMatch(catalogSource, /runninghub\.cn.*call-api/);
});

test('Running video node and API key management expose all standard models', () => {
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
  assert.match(models, /rhart-video-g\/text-to-video/);
  assert.match(models, /rhart-video-g-official\/image-to-video-v1\.5/);
  assert.match(models, /rhart-video-g-official\/reference-to-video/);
  assert.match(models, /rhart-video-g-official\/edit-video/);
  assert.match(models, /rhart-video-g-official\/text-to-video/);
  assert.match(models, /rhart-video-g-official\/video-extend/);
  assert.match(models, /rhart-video-s\/image-to-video/);
  assert.match(models, /rhart-video-s\/text-to-video/);
  assert.match(models, /rhart-video-v3\.1-fast\/image-to-video/);
  assert.match(models, /rhart-video-v3\.1-fast\/text-to-video/);
  assert.match(models, /rhart-video-s-official\/image-to-video/);
  assert.match(models, /rhart-video-s-official\/text-to-video/);
  assert.match(models, /全能视频V3\.1-fast · 图生视频低价渠道版/);
  assert.match(models, /全能视频V3\.1-fast · 文生视频低价渠道版/);
  assert.match(node, /staticModelForCatalog/);
  assert.match(registry, /type: 'runninghub-video'[\s\S]*label: 'Running 视频'/);
  assert.match(ports, /'runninghub-video': \{ inputs: \['text', 'image', 'video', 'audio'\], outputs: \['video'\] \}/);
  assert.match(canvas, /'runninghub-video': VideoNode/);
  assert.match(permissions, /'runninghub-video'/);
  assert.match(node, /model: apiModel/);
  assert.match(node, /runningHubVideoModelDef\(nextModel\)/);
  assert.match(service, /interface RunningHubVideoSubmitRequest \{[\s\S]*model: string/);
  assert.match(service, /videoUrls\?: string\[\]/);
  assert.match(settings, /企业级-共享 API Key[\s\S]*Running 视频全部模型共用/);
  assert.match(proxy, /normalized\.path/);
  assert.match(proxy, /runninghub\/video\/catalog/);
  assert.match(proxy, /config\.RH_CALL_API_BASE_URL/);
  assert.match(proxy, /resolveRunningHubVideoModel/);
  assert.match(proxy, /requireNodePermission\(\['video', 'runninghub-video', 'director-storyboard'\]\)/);
  assert.doesNotMatch(node, /<optgroup/);
  assert.match(node, /item\.name} · \{item\.priceLabel/);
  assert.match(node, /当前计费/);
});

test('all asynchronous video nodes attach canvas context when recording generation history', () => {
  const videoNode = read('src/components/nodes/VideoNode.tsx');
  const seedanceNode = read('src/components/nodes/SeedanceNode.tsx');
  const directorNode = read('src/components/nodes/DirectorStoryboardNode.tsx');
  const service = read('src/services/generation.ts');

  assert.match(videoNode, /const \{ loadedCanvasId \} = useCanvasRuntime\(\)/);
  assert.match(videoNode, /sourceNodeType: isRunningHubNodeType \? 'runninghub-video' : 'video'/);
  assert.match(videoNode, /queryRunningHubVideo\([\s\S]*?historyContext\)/);
  assert.match(videoNode, /queryVideo\(tid, apiModel, historyContext\)/);
  assert.match(videoNode, /queryVideoFal\(\{ \.\.\.falPollRef\.current!, historyContext \}\)/);
  assert.match(videoNode, /const falReq: VideoFalSubmitRequest = \{ apiModel, prompt: finalPrompt, providerParams, historyContext \}/);

  assert.match(seedanceNode, /const \{ loadedCanvasId \} = useCanvasRuntime\(\)/);
  assert.match(seedanceNode, /sourceNodeType: 'seedance'/);
  assert.match(seedanceNode, /querySeedance\(tid, historyContext\)/);
  assert.match(seedanceNode, /historyContext,\s*\n\s*\}\);/);

  assert.match(directorNode, /sourceNodeType: 'director-storyboard'/);
  assert.match(directorNode, /outputTitle: job\.title/);
  assert.match(directorNode, /querySeedance\(submitted\.taskId, historyContext\)/);
  assert.match(directorNode, /queryRunningHubVideo\(submitted\.taskId, runningHubQueryModel, historyContext\)/);
  assert.match(service, /submitRunningHubCatalogVideo\(req: \{[\s\S]*?historyContext\?: GenerationHistoryContext/);
});
