import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = require('sharp');
const JSZip = backendRequire('jszip');
const pdfParseModule = backendRequire('pdf-parse');
const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;
const config = require('../backend/src/config.js');
const { builtInDocxParser } = require('../backend/src/utils/documentExtractor.js');
const { buildGameUiExportModel, exportGameUiDocument } = require('../backend/src/utils/gameUiExporter.js');

function request(format = 'pptx', overrides = {}) {
  const screens = Array.from({ length: 4 }, (_, index) => ({
    id: `screen-${index + 1}`,
    index: index + 1,
    title: `界面 ${index + 1}`,
    purpose: `演示用途 ${index + 1}`,
    layout: '16:9 大屏布局，中央主视觉，底部大型触控按钮。',
    stateSummary: index === 0 ? 'score大于等于1且quiz-solved为true时，矿物和按钮显示高亮状态。' : `当前为状态 ${index + 1}`,
    imagePrompt: '蓝紫色科技大屏 UI，玻璃拟态面板、高对比真实中文按钮、中央主视觉与充足触控安全区，统一品牌设计语言。',
    elements: [{ id: `button-${index + 1}`, type: 'button', label: '继续', description: '底部中央的大型触控按钮' }],
    interactions: index === 3 ? [] : [{
      id: `go-${index + 1}`,
      label: '继续',
      trigger: 'tap',
      elementId: `button-${index + 1}`,
      hotspot: { x: 40, y: 80, width: 20, height: 10 },
      conditions: index === 0 ? [{ variableId: 'score', operator: 'gte', value: 1 }, { variableId: 'quiz-solved', operator: 'truthy' }] : [],
      effects: index === 0 ? [{ variableId: 'score', operation: 'increment', value: 1 }] : [],
      targetScreenId: `screen-${index + 2}`,
      feedback: { type: 'toast', message: '操作成功' },
    }],
  }));
  return {
    format,
    sourceNodeType: 'interactive-game-script',
    imageUrls: screens.map(() => '/files/output/screen.png'),
    script: {
      schemaVersion: 1,
      title: '星海寻宝',
      concept: '观众通过大屏触控寻找线索并完成挑战。',
      flowMode: 'linear',
      initialScreenId: 'screen-1',
      globalVisual: '蓝紫色科技展陈风，玻璃拟态面板与高对比大按钮。',
      variables: [
        { id: 'score', label: '得分', type: 'number', initialValue: 0 },
        { id: 'quiz-solved', label: '答题完成', type: 'boolean', initialValue: false },
      ],
      screens,
    },
    ...overrides,
  };
}

function tempOutput(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-game-ui-export-'));
  const previous = config.OUTPUT_DIR;
  config.OUTPUT_DIR = root;
  t.after(() => { config.OUTPUT_DIR = previous; fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}

test('game UI export validates source, screen count and local image URLs', () => {
  assert.throws(() => buildGameUiExportModel(request('txt')), /不支持的导出格式/);
  assert.throws(() => buildGameUiExportModel(request('pptx', { sourceNodeType: 'storyboard-grid' })), /来源节点无效/);
  assert.throws(() => buildGameUiExportModel(request('pptx', { imageUrls: ['https://example.com/ui.png', '', '', ''] })), /本地输出文件/);
  assert.throws(() => buildGameUiExportModel(request('pptx', { imageUrls: ['/files/output/../secret.png', '/files/output/a.png', '/files/output/a.png', '/files/output/a.png'] })), /安全的本地输出文件/);
  const invalidCondition = request();
  invalidCondition.script.screens[0].interactions[0].conditions = [{ variableId: 'missing', operator: 'exec', value: 'code' }];
  assert.throws(() => buildGameUiExportModel(invalidCondition), /条件 1 无效/);
  const tooMany = request();
  tooMany.script.screens = Array.from({ length: 9 }, (_, index) => ({ ...tooMany.script.screens[0], id: `screen-${index + 1}` }));
  tooMany.imageUrls = Array.from({ length: 9 }, () => '/files/output/screen.png');
  assert.throws(() => buildGameUiExportModel(tooMany), /4–8/);
});

test('game UI exporter creates client documents and a safe offline prototype', async (t) => {
  const root = tempOutput(t);
  await sharp({ create: { width: 640, height: 360, channels: 3, background: '#155e75' } }).png().toFile(path.join(root, 'screen.png'));
  for (const format of ['docx', 'pdf', 'pptx', 'prototype-zip']) {
    const result = await exportGameUiDocument(request(format));
    assert.ok(result.buffer.length > 3000, `${format} should not be empty`);
    if (format === 'pdf') {
      assert.equal(result.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
      const parsed = await pdfParse(result.buffer);
      assert.match(parsed.text, /星海寻宝/);
      assert.match(parsed.text, /得分达到或超过/);
      assert.doesNotMatch(parsed.text, /variableId|operator|targetScreenId/);
    } else if (format === 'docx') {
      assert.equal(result.buffer.subarray(0, 2).toString('ascii'), 'PK');
      const parsed = await builtInDocxParser(result.buffer);
      assert.match(parsed.value, /星海寻宝/);
      assert.match(parsed.value, /得分达到或超过/);
      assert.doesNotMatch(parsed.value, /variableId|operator|targetScreenId/);
    } else if (format === 'pptx') {
      const zip = await JSZip.loadAsync(result.buffer);
      const xmlNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
      const xml = (await Promise.all(xmlNames.map((name) => zip.files[name].async('string')))).join('\n');
      assert.match(xml, /星海寻宝/);
      assert.match(xml, /得分达到或超过/);
      assert.doesNotMatch(xml, /variableId|operator|targetScreenId/);
      assert.equal(xmlNames.length, 6);
    } else {
      const zip = await JSZip.loadAsync(result.buffer);
      const names = Object.keys(zip.files);
      assert.ok(names.includes('index.html'));
      assert.ok(names.includes('runtime.js'));
      assert.ok(names.includes('prototype.json'));
      assert.ok(names.includes('assets/screen-01.png'));
      const html = await zip.file('index.html').async('string');
      const runtime = await zip.file('runtime.js').async('string');
      assert.match(html, /Content-Security-Policy/);
      assert.match(html, /connect-src 'none'/);
      assert.doesNotMatch(`${html}\n${runtime}`, /\beval\s*\(/);
      assert.doesNotMatch(runtime, /\bfetch\s*\(/);
      assert.match(runtime, /swipe-left/);
    }
  }
});
