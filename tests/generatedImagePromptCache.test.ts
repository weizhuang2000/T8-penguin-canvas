import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const config = require('../backend/src/config.js');
const history = require('../backend/src/utils/generationHistory.js');
const resources = require('../backend/src/routes/resources.js');
const historyRoute = require('../backend/src/routes/generationHistory.js');

async function withTempData(run: (paths: { outputDir: string; resourcesDir: string }) => Promise<void>) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-generated-prompt-cache-'));
  const oldConfig = {
    DATA_DIR: config.DATA_DIR,
    OUTPUT_DIR: config.OUTPUT_DIR,
    CANVAS_FILE: config.CANVAS_FILE,
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
  };
  const dataDir = path.join(tmpDir, 'data');
  const outputDir = path.join(tmpDir, 'output');
  const resourcesDir = path.join(tmpDir, 'resources');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  config.DATA_DIR = dataDir;
  config.OUTPUT_DIR = outputDir;
  config.CANVAS_FILE = path.join(dataDir, 'canvas_list.json');
  config.SETTINGS_FILE = path.join(dataDir, 'settings.json');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = resourcesDir;
  fs.writeFileSync(config.CANVAS_FILE, '[]', 'utf8');
  try {
    await run({ outputDir, resourcesDir });
  } finally {
    Object.assign(config, oldConfig);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function writeImage(file: string, color: string) {
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: color },
  }).png().toFile(file);
}

test('prompt language detection honors explicit language and detects dominant script', () => {
  assert.equal(history.detectPromptLanguage('纯中文展览空间，柔和暖光'), 'zh');
  assert.equal(history.detectPromptLanguage('A quiet gallery with warm cinematic light'), 'en');
  assert.equal(history.detectPromptLanguage('Gallery 标题', 'zh'), 'zh');
  assert.equal(history.detectPromptLanguage('12345'), 'zh');
  const runner = fs.readFileSync(new URL('../src/services/imageGenerationRunner.ts', import.meta.url), 'utf8');
  const generation = fs.readFileSync(new URL('../src/services/generation.ts', import.meta.url), 'utf8');
  const webEditor = fs.readFileSync(new URL('../src/components/ImageEditorPage.tsx', import.meta.url), 'utf8');
  const externalProviders = fs.readFileSync(new URL('../backend/src/routes/externalProviders.js', import.meta.url), 'utf8');
  const fhlImage = fs.readFileSync(new URL('../backend/src/routes/fhlImage.js', import.meta.url), 'utf8');
  const historyRoute = fs.readFileSync(new URL('../backend/src/routes/generationHistory.js', import.meta.url), 'utf8');
  assert.match(runner, /promptLanguage: options\.historyContext\?\.promptLanguage \|\| detectImagePromptLanguage\(prompt\)/);
  assert.match(runner, /prompt,\s*generationRunId|promptLanguage:[\s\S]*generationRunId/);
  assert.match(generation, /pendingImageHistoryContexts\.set\(result\.taskId, historyContext\)/);
  assert.match(generation, /mergePendingHistoryContext\(pendingImageHistoryContexts\.get\(taskId\), historyContext\)/);
  assert.match(externalProviders, /prompt: source\?\.prompt \?\? historyContext\.prompt/);
  assert.match(fhlImage, /prompt: task\.prompt \|\| job\.request\.prompt/);
  assert.match(webEditor, /promptLanguage: normalizePromptReverseLanguage\(language\)/);
  assert.doesNotMatch(fs.readFileSync(new URL('../backend/src/utils/generationHistory.js', import.meta.url), 'utf8'), /await cacheGeneratedImageResources\(added\)/);
  assert.match(historyRoute, /user\.role === 'admin'/);
  assert.match(historyRoute, /router\.delete\('\/items\/:id\/resources'/);
  assert.match(historyRoute, /categoryName: '成品'/);
});

test('only the generation owner or system admin can change generated image sharing', () => {
  const item = { createdByUserId: 'u1' };
  assert.equal(historyRoute.canManageGeneratedSharing({ id: 'u1', role: 'designer' }, item), true);
  assert.equal(historyRoute.canManageGeneratedSharing({ id: 'u2', role: 'designer' }, item), false);
  assert.equal(historyRoute.canManageGeneratedSharing({ id: 'manager', role: 'manager' }, item), false);
  assert.equal(historyRoute.canManageGeneratedSharing({ id: 'admin', role: 'admin' }, item), true);
});

test('generated images stay private while exact extreme prompt caches are stored in history', () => withTempData(async ({ outputDir, resourcesDir }) => {
  await writeImage(path.join(outputDir, 'zh.png'), '#336699');
  await writeImage(path.join(outputDir, 'en.png'), '#993366');
  const items = await history.addGeneratedHistoryItems([
    { url: '/files/output/zh.png', kind: 'image', title: '中文成品', prompt: '中文最终生图提示词', promptLanguage: 'zh' },
    { url: '/files/output/en.png', kind: 'image', title: 'English result', prompt: 'Final English generation prompt', promptLanguage: 'en' },
    { url: '/files/output/no-prompt.png', kind: 'image' },
    { url: '/files/output/movie.mp4', kind: 'video', prompt: '不应进入图片资源库' },
  ], {
    canvasId: 'canvas-1',
    sourceNodeId: 'image-node-1',
    sourceNodeType: 'image',
  }, { id: 'u1', name: '测试用户', role: 'designer' });

  assert.equal(items.length, 4);
  assert.equal(items[0].promptLanguage, 'zh');
  assert.equal(items[1].promptLanguage, 'en');
  assert.equal(items[0].imageAnalysis.reversePrompts.extreme.zh, '中文最终生图提示词');
  assert.equal(items[0].imageAnalysis.classifiedAt, 0);
  assert.equal(items[1].imageAnalysis.reversePrompts.extreme.en, 'Final English generation prompt');
  assert.equal(fs.existsSync(path.join(resourcesDir, 'resource_library.json')), false);
}));

test('generated history fills a missing language without replacing an existing extreme cache', () => withTempData(async ({ outputDir }) => {
  await writeImage(path.join(outputDir, 'original.png'), '#224466');
  await history.addGeneratedHistoryItems([
    { url: '/files/output/original.png', kind: 'image', prompt: '已有中文极致缓存', promptLanguage: 'zh' },
  ], { canvasId: 'canvas-2', sourceNodeId: 'image-node-2', sourceNodeType: 'image' }, { id: 'u1', role: 'designer' });
  await history.addGeneratedHistoryItems([
    { url: '/files/output/original.png', kind: 'image', prompt: '不得覆盖的中文提示词', promptLanguage: 'zh' },
  ], { canvasId: 'canvas-2', sourceNodeId: 'image-node-2', sourceNodeType: 'image' }, { id: 'u1', role: 'designer' });
  await history.addGeneratedHistoryItems([
    { url: '/files/output/original.png', kind: 'image', prompt: 'New English prompt', promptLanguage: 'en' },
  ], { canvasId: 'canvas-2', sourceNodeId: 'image-node-2', sourceNodeType: 'image' }, { id: 'u1', role: 'designer' });
  const [item] = history.readDb().items;
  assert.equal(item.imageAnalysis.reversePrompts.extreme.zh, '已有中文极致缓存');
  assert.equal(item.imageAnalysis.reversePrompts.extreme.en, 'New English prompt');
}));

test('missing output files still record private generation history without creating resources', () => withTempData(async ({ resourcesDir }) => {
  const [item] = await history.addGeneratedHistoryItems([
    { url: '/files/output/missing.png', kind: 'image', prompt: '仍应保存到历史', promptLanguage: 'zh' },
  ], { canvasId: 'canvas-3', sourceNodeId: 'image-node-3', sourceNodeType: 'image' }, { id: 'u1', role: 'designer' });
  assert.equal(item.prompt, '仍应保存到历史');
  assert.equal(history.readDb().items.length, 1);
  assert.equal(fs.existsSync(path.join(resourcesDir, 'resource_library.json')), false);
}));

test('manual sharing copies history analysis and can detach the generated source again', () => withTempData(async ({ outputDir, resourcesDir }) => {
  await writeImage(path.join(outputDir, 'share.png'), '#557799');
  const [item] = await history.addGeneratedHistoryItems([
    { url: '/files/output/share.png', kind: 'image', prompt: 'Shared prompt', promptLanguage: 'en' },
  ], { canvasId: 'canvas-4', sourceNodeId: 'image-node-4', sourceNodeType: 'image' }, { id: 'u1', role: 'designer' });
  const shared = await resources.upsertResourceItem({
    url: item.url,
    kind: 'image',
    title: item.title,
    imageAnalysis: item.imageAnalysis,
  }, { categoryName: '成品', preserveExistingCategory: true, fillMissingImageAnalysis: true });
  assert.equal(shared.data.imageAnalysis.reversePrompts.extreme.en, 'Shared prompt');
  assert.equal(JSON.parse(fs.readFileSync(path.join(resourcesDir, 'resource_library.json'), 'utf8')).items.length, 1);
  const detached = resources.detachResourceSourceUrl(item.url);
  assert.equal(detached.removed, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(resourcesDir, 'resource_library.json'), 'utf8')).items.length, 0);
}));
