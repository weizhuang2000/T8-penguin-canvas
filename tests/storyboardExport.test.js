import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';

const require = createRequire(import.meta.url);
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const JSZip = require('jszip');
const sharp = require('sharp');
const pdfParseModule = backendRequire('pdf-parse');
const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : pdfParseModule.default;
const config = require('../backend/src/config.js');
const documentsRouter = require('../backend/src/routes/documents.js');
const { builtInDocxParser } = require('../backend/src/utils/documentExtractor.js');
const {
  buildStoryboardExportModel,
  exportStoryboardDocument,
  sanitizeExportFilename,
} = require('../backend/src/utils/storyboardExporter.js');

function validShot(index, overrides = {}) {
  return {
    index,
    title: `镜头 ${index}`,
    durationSeconds: 5,
    shotSize: '中景',
    cameraAngle: '平视',
    cameraMovement: '缓慢推进',
    visual: `人物进入画面 ${index}`,
    action: `人物完成动作 ${index}`,
    dialogue: index % 2 ? '你好' : '',
    voiceOver: index % 2 ? '' : '清晨到来',
    imagePrompt: `PRIVATE_IMAGE_PROMPT_${index}`,
    ...overrides,
  };
}

function validRequest(format = 'docx', count = 2, overrides = {}) {
  return {
    format,
    layout: 'production-table',
    pptShotsPerSlide: 2,
    sourceNodeType: 'storyboard-grid',
    imageUrls: [],
    script: {
      title: '测试分镜',
      visualContinuity: '同一角色、服装和蓝灰色电影光线。',
      shots: Array.from({ length: count }, (_, index) => validShot(index + 1)),
    },
    ...overrides,
  };
}

function withTempOutput(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-storyboard-export-'));
  const previous = config.OUTPUT_DIR;
  config.OUTPUT_DIR = root;
  t.after(() => {
    config.OUTPUT_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

async function pptSlideXml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const xml = (await Promise.all(names.map((name) => zip.files[name].async('string')))).join('\n');
  return { names, xml };
}

test('storyboard export model preserves shot order, fills empty dialogue and omits image prompts', () => {
  const model = buildStoryboardExportModel(validRequest('docx', 2));
  assert.deepEqual(model.shots.map((shot) => shot.index), [1, 2]);
  assert.match(model.shots[0].dialogueVoice, /对白：你好/);
  assert.match(model.shots[0].dialogueVoice, /旁白：无/);
  assert.match(model.shots[1].dialogueVoice, /对白：无/);
  assert.doesNotMatch(JSON.stringify(model), /PRIVATE_IMAGE_PROMPT/);
  assert.equal(sanitizeExportFilename('片名:测试?', 'pptx'), '片名_测试__分镜脚本.pptx');
});

test('storyboard export validates formats, shot count and local output image urls', () => {
  assert.throws(() => buildStoryboardExportModel(validRequest('txt')), /不支持的导出格式/);
  assert.throws(() => buildStoryboardExportModel(validRequest('pdf', 37)), /不能超过 36 个/);
  assert.throws(() => buildStoryboardExportModel(validRequest('pdf', 1, {
    imageUrls: ['https://example.com/shot.png'],
  })), /不是本地输出文件/);
});

test('storyboard exporter creates DOCX, PDF and PPTX for both table layouts with missing images', async (t) => {
  const output = withTempOutput(t);
  await sharp({
    create: { width: 320, height: 180, channels: 3, background: '#4f46e5' },
  }).png().toFile(path.join(output, 'shot.png'));

  for (const layout of ['production-table', 'shot-card-table']) {
    for (const format of ['docx', 'pdf', 'pptx']) {
      const result = await exportStoryboardDocument(validRequest(format, 2, {
        layout,
        imageUrls: ['/files/output/shot.png', '/files/output/missing.png'],
      }));
      assert.ok(result.buffer.length > 5000, `${format}/${layout} should not be empty`);
      assert.equal(result.filename, `测试分镜_分镜脚本.${format}`);
      if (format === 'pdf') assert.equal(result.buffer.subarray(0, 5).toString('ascii'), '%PDF-');
      else assert.equal(result.buffer.subarray(0, 2).toString('ascii'), 'PK');

      if (format === 'docx') {
        const parsed = await builtInDocxParser(result.buffer);
        assert.match(parsed.value, /测试分镜/);
        assert.match(parsed.value, /未生成/);
        assert.doesNotMatch(parsed.value, /PRIVATE_IMAGE_PROMPT/);
      } else if (format === 'pdf') {
        const parsed = await pdfParse(result.buffer);
        assert.match(parsed.text, /测试分镜/);
        assert.match(parsed.text, /未生成/);
        assert.doesNotMatch(parsed.text, /PRIVATE_IMAGE_PROMPT/);
      } else {
        const parsed = await pptSlideXml(result.buffer);
        assert.match(parsed.xml, /测试分镜/);
        assert.match(parsed.xml, /未生成/);
        assert.doesNotMatch(parsed.xml, /PRIVATE_IMAGE_PROMPT/);
      }
    }
  }
});

test('PPTX uses 1, 2 or 4 shots as the content slide maximum', async () => {
  const expectedSlideCounts = new Map([[1, 5], [2, 3], [4, 2]]);
  for (const shotsPerSlide of [1, 2, 4]) {
    const result = await exportStoryboardDocument(validRequest('pptx', 4, { pptShotsPerSlide: shotsPerSlide }));
    const parsed = await pptSlideXml(result.buffer);
    assert.equal(parsed.names.length, expectedSlideCounts.get(shotsPerSlide));
  }
});

test('PPTX moves oversized shot text onto dedicated continuation slides without dropping content', async () => {
  const longVisual = '角色沿着走廊持续前进并观察环境。'.repeat(180);
  const request = validRequest('pptx', 4, { pptShotsPerSlide: 4 });
  request.script.shots[0] = validShot(1, { visual: longVisual });
  const result = await exportStoryboardDocument(request);
  const parsed = await pptSlideXml(result.buffer);
  assert.ok(parsed.names.length > 2);
  assert.match(parsed.xml, /角色沿着走廊持续前进并观察环境/);
});

test('storyboard export route enforces node permission and returns binary attachments', async (t) => {
  const root = withTempOutput(t);
  const previousPermissionsFile = config.TOOL_PERMISSIONS_FILE;
  config.TOOL_PERMISSIONS_FILE = path.join(root, 'tool_permissions.json');
  fs.writeFileSync(config.TOOL_PERMISSIONS_FILE, JSON.stringify({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {},
    userRules: {},
  }));
  t.after(() => { config.TOOL_PERMISSIONS_FILE = previousPermissionsFile; });

  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use((req, _res, next) => {
    req.user = req.header('x-test-role') === 'admin'
      ? { id: 'admin-1', role: 'admin' }
      : { id: 'viewer-1', role: 'viewer' };
    next();
  });
  app.use('/api/documents', documentsRouter);
  const server = await new Promise((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/documents/storyboard/export`;

  const denied = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validRequest('docx', 1)),
  });
  assert.equal(denied.status, 403);

  const invalidUrl = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
    body: JSON.stringify(validRequest('docx', 1, { imageUrls: ['https://example.com/a.png'] })),
  });
  assert.equal(invalidUrl.status, 400);

  fs.writeFileSync(path.join(root, 'broken.png'), 'not an image');
  const success = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
    body: JSON.stringify(validRequest('docx', 1, { imageUrls: ['/files/output/broken.png'] })),
  });
  assert.equal(success.status, 200);
  assert.match(success.headers.get('content-type') || '', /wordprocessingml/);
  assert.match(success.headers.get('content-disposition') || '', /filename\*=UTF-8''/);
  assert.equal(Buffer.from(await success.arrayBuffer()).subarray(0, 2).toString('ascii'), 'PK');
});
