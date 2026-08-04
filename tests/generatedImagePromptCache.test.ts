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
  assert.match(runner, /promptLanguage: options\.historyContext\?\.promptLanguage \|\| detectImagePromptLanguage\(prompt\)/);
  assert.match(runner, /prompt,\s*generationRunId|promptLanguage:[\s\S]*generationRunId/);
  assert.match(generation, /pendingImageHistoryContexts\.set\(result\.taskId, historyContext\)/);
  assert.match(generation, /mergePendingHistoryContext\(pendingImageHistoryContexts\.get\(taskId\), historyContext\)/);
  assert.match(externalProviders, /prompt: source\?\.prompt \?\? historyContext\.prompt/);
  assert.match(fhlImage, /prompt: task\.prompt \|\| job\.request\.prompt/);
  assert.match(webEditor, /promptLanguage: normalizePromptReverseLanguage\(language\)/);
});

test('generated images enter the shared finished category with exact extreme prompt caches', () => withTempData(async ({ outputDir, resourcesDir }) => {
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
  const db = JSON.parse(fs.readFileSync(path.join(resourcesDir, 'resource_library.json'), 'utf8'));
  assert.equal(db.items.length, 2);
  const byTitle = new Map(db.items.map((item: any) => [item.title, item]));
  const zh = byTitle.get('中文成品');
  const en = byTitle.get('English result');
  assert.equal(zh.categoryId, db.categories.find((category: any) => category.kind === 'image' && category.name === '成品').id);
  assert.deepEqual(zh.tags, ['生图', '无限画布']);
  assert.equal(zh.imageAnalysis.reversePrompts.extreme.zh, '中文最终生图提示词');
  assert.equal(zh.imageAnalysis.classifiedAt, 0);
  assert.equal(en.imageAnalysis.reversePrompts.extreme.en, 'Final English generation prompt');
}));

test('generated duplicate fills missing language while preserving curated resource metadata', () => withTempData(async ({ outputDir, resourcesDir }) => {
  await writeImage(path.join(outputDir, 'original.png'), '#224466');
  fs.copyFileSync(path.join(outputDir, 'original.png'), path.join(outputDir, 'duplicate.png'));
  await resources.upsertResourceItem({
    url: '/files/output/original.png',
    kind: 'image',
    title: '已整理资源',
    tags: ['人工标签'],
    imageAnalysis: {
      version: 1,
      secondaryTags: ['企鹅', '蓝色背景'],
      reversePrompts: { extreme: { zh: '已有中文极致缓存' } },
      classifiedAt: 123,
    },
  }, { categoryName: '角色' });

  await history.addGeneratedHistoryItems([
    { url: '/files/output/duplicate.png', kind: 'image', prompt: '不得覆盖的中文提示词', promptLanguage: 'zh' },
  ], { canvasId: 'canvas-2', sourceNodeId: 'image-node-2', sourceNodeType: 'image' }, { id: 'u1', role: 'designer' });
  await history.addGeneratedHistoryItems([
    { url: '/files/output/duplicate.png', kind: 'image', prompt: 'New English prompt', promptLanguage: 'en' },
  ], { canvasId: 'canvas-2', sourceNodeId: 'image-node-2', sourceNodeType: 'image' }, { id: 'u1', role: 'designer' });

  const db = JSON.parse(fs.readFileSync(path.join(resourcesDir, 'resource_library.json'), 'utf8'));
  assert.equal(db.items.length, 1);
  const [item] = db.items;
  assert.equal(item.categoryId, db.categories.find((category: any) => category.kind === 'image' && category.name === '角色').id);
  assert.deepEqual(item.tags, ['人工标签']);
  assert.deepEqual(item.imageAnalysis.secondaryTags, ['企鹅', '蓝色背景']);
  assert.equal(item.imageAnalysis.classifiedAt, 123);
  assert.equal(item.imageAnalysis.reversePrompts.extreme.zh, '已有中文极致缓存');
  assert.equal(item.imageAnalysis.reversePrompts.extreme.en, 'New English prompt');
  assert.deepEqual(item.sourceUrls, ['/files/output/original.png', '/files/output/duplicate.png']);
}));

test('resource cache failure does not roll back successful generation history', () => withTempData(async () => {
  const [item] = await history.addGeneratedHistoryItems([
    { url: '/files/output/missing.png', kind: 'image', prompt: '仍应保存到历史', promptLanguage: 'zh' },
  ], { canvasId: 'canvas-3', sourceNodeId: 'image-node-3', sourceNodeType: 'image' }, { id: 'u1', role: 'designer' });
  assert.equal(item.prompt, '仍应保存到历史');
  assert.equal(history.readDb().items.length, 1);
}));
