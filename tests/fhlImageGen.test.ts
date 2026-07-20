import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fhl = require('../backend/src/providers/fhlImages.js');

function read(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZKxkAAAAASUVORK5CYII=';

test('FHL provider fixes Images API, model and tested size matrices', () => {
  assert.equal(fhl.API_ROOT, 'https://www.fhl.mom');
  assert.equal(fhl.MODEL, 'gpt-image-2');
  assert.equal(fhl.resolveSize('2K', '16:9', 'generate'), '2048x1152');
  assert.equal(fhl.resolveSize('2K', '5:4', 'edit'), '2048x1632');
  assert.equal(fhl.resolveSize('4K', '9:16', 'generate'), '2160x3840');
  assert.throws(() => fhl.resolveSize('4K', '4:3', 'generate'), /不支持比例/);
  assert.throws(() => fhl.resolveSize('1K', '1:1', 'generate'), /仅支持 2K/);

  const body = fhl.buildGenerationBody('penguin', '2048x1152');
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.size, '2048x1152');
  assert.equal(body.output_format, 'png');
  assert.equal(body.response_format, 'b64_json');
  assert.match(body.prompt, /16:9 横版/);
});

test('FHL edit multipart preserves mixed image then image[] ordering', () => {
  const form = fhl.buildEditForm('edit', '1152x2048', [
    { buffer: Buffer.from('a'), mime: 'image/png', name: 'a.png' },
    { buffer: Buffer.from('b'), mime: 'image/jpeg', name: 'b.jpg' },
    { buffer: Buffer.from('c'), mime: 'image/webp', name: 'c.webp' },
  ]);
  assert.deepEqual(Array.from(form.keys()).slice(0, 3), ['image', 'image[]', 'image[]']);
  assert.equal(form.get('model'), 'gpt-image-2');
  assert.equal(form.get('response_format'), 'b64_json');
});

test('FHL resolves trusted canvas media URLs before rejecting absolute filesystem paths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 't8-fhl-local-ref-'));
  const config = require('../backend/src/config.js');
  const previousInputDir = config.INPUT_DIR;
  const source = Buffer.from(ONE_PIXEL_PNG, 'base64');
  try {
    config.INPUT_DIR = dir;
    writeFileSync(join(dir, 'reference.png'), source);

    assert.equal(fhl.normalizeT8LocalReference('/files/input/reference.png'), '/files/input/reference.png');
    assert.equal(
      fhl.normalizeT8LocalReference('http://127.0.0.1:11422/files/input/reference.png'),
      '/files/input/reference.png',
    );
    assert.equal(fhl.normalizeT8LocalReference('https://example.com/reference.png'), '');

    const relative = await fhl.loadReference('/files/input/reference.png');
    const loopback = await fhl.loadReference('http://localhost:18766/files/input/reference.png');
    assert.deepEqual(relative.buffer, source);
    assert.deepEqual(loopback.buffer, source);
    assert.equal(relative.mime, 'image/png');
  } finally {
    config.INPUT_DIR = previousInputDir;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FHL request writes the raw upstream PNG and never needs Responses API', async () => {
  const dir = mkdtempSync(join(tmpdir(), 't8-fhl-'));
  const outputPath = join(dir, 'raw.png');
  const calls: any[] = [];
  try {
    const result = await fhl.requestImage({ id: 'w1', name: 'one', apiKey: 'sk-test', enabled: true }, {
      operation: 'generate', prompt: 'penguin', quality: '2K', aspect: '1:1', images: [], outputPath,
    }, {
      fetchImpl: async (url: string, init: any) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return {
          ok: true,
          status: 200,
          async json() { return { data: [{ b64_json: ONE_PIXEL_PNG }] }; },
        };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0].url, 'https://www.fhl.mom/v1/images/generations');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
    assert.deepEqual(readFileSync(outputPath), Buffer.from(ONE_PIXEL_PNG, 'base64'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FHL saves highest-quality JPG by default while preserving the raw upstream PNG', async () => {
  const dir = mkdtempSync(join(tmpdir(), 't8-fhl-jpg-'));
  const outputPath = join(dir, 'result.jpg');
  const rawOutputPath = join(dir, 'result__raw.png');
  const sharp = require('sharp');
  const sourcePng = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#36cfc9' } }).png().toBuffer();
  try {
    const result = await fhl.requestImage({ id: 'w1', name: 'one', apiKey: 'sk-test', enabled: true }, {
      operation: 'generate', prompt: 'penguin', quality: '2K', aspect: '1:1', images: [], outputPath, outputFormat: 'jpg',
    }, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return { data: [{ b64_json: sourcePng.toString('base64') }] }; },
      }),
    });
    const metadata = await sharp(outputPath).metadata();
    assert.equal(result.ok, true);
    assert.equal(result.outputFormat, 'jpg');
    assert.equal(metadata.format, 'jpeg');
    assert.deepEqual(readFileSync(rawOutputPath), sourcePng);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FHL worker pool distributes independent tasks and disables an auth-failed worker for the run', async () => {
  const workers = [
    { id: 'worker-1', name: 'one', apiKey: 'sk-one', enabled: true },
    { id: 'worker-2', name: 'two', apiKey: 'sk-two', enabled: true },
  ];
  const seen: string[] = [];
  const report = await fhl.runWorkerQueue(workers, [{ id: 1 }, { id: 2 }, { id: 3 }], {
    concurrency: 2,
    retryDelayMs: 0,
    cooldownMs: 0,
    runTask: async (worker: any, task: any, state: any) => {
      seen.push(`${worker.id}:${task.id}:${state.attempts}`);
      if (worker.id === 'worker-1') return { ok: false, status: 401, error: 'Unauthorized invalid api key' };
      return { ok: true, outputPath: `out-${task.id}.png` };
    },
  });
  assert.equal(report.success, 3);
  assert.equal(report.failed, 0);
  assert.ok(seen.some((item) => item.startsWith('worker-1:')));
  assert.ok(report.results.every((item: any) => item.workerId === 'worker-2'));
});

test('FHL worker normalization preserves masked keys and enforces unique workers', () => {
  const previous = [{ id: 'worker-1', name: 'old', apiKey: 'sk-secret', enabled: true }];
  const normalized = fhl.normalizeWorkers([{ id: 'worker-1', name: 'new', apiKey: '****cret', enabled: false }], previous);
  assert.equal(normalized[0].apiKey, 'sk-secret');
  assert.equal(normalized[0].name, 'new');
  assert.equal(normalized[0].enabled, false);
  assert.equal(fhl.maskWorkers(normalized)[0].keyPreview.includes('sk-secret'), false);
});

test('FHL job manager expands workflow tasks and writes resumable artifacts', () => {
  const dir = mkdtempSync(join(tmpdir(), 't8-fhl-jobs-'));
  const backendConfig = require('../backend/src/config.js');
  const previousDataDir = backendConfig.DATA_DIR;
  const previousOutputDir = backendConfig.OUTPUT_DIR;
  try {
    backendConfig.DATA_DIR = join(dir, 'data');
    backendConfig.OUTPUT_DIR = join(dir, 'output');
    const routePath = require.resolve('../backend/src/routes/fhlImage.js');
    delete require.cache[routePath];
    const route = require(routePath);
    const request = route._test.normalizeRequest({
      mode: 'workflow-batch-edit',
      fixedImages: ['/files/input/person.png'],
      itemImages: ['/files/input/item-1.png', '/files/input/item-2.png'],
      templates: [{ key: 'catalog', label: 'Catalog', prompt: 'Make a catalog scene.' }],
      aspect: '9:16',
      quality: '2K',
      repairPasses: 2,
    });
    const job: any = {
      id: 'fhl-test-job', request, status: 'completed', error: '', tasks: [], workerStats: [], sessions: [], artifactUrls: {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    job.tasks = route._test.buildTasks(job);
    assert.equal(job.tasks.length, 2);
    assert.equal(request.outputFormat, 'jpg');
    assert.match(job.tasks[0].outputPath, /\.jpg$/);
    assert.deepEqual(job.tasks[0].images, ['/files/input/person.png', '/files/input/item-1.png']);
    assert.equal(job.tasks[0].groupKey, 'item-1');
    route._test.writeArtifacts(job);
    const root = join(dir, 'output', 'fhl', 'fhl-test-job');
    assert.equal(existsSync(join(root, 'manifest.json')), true);
    assert.equal(existsSync(join(root, 'summary.csv')), true);
    assert.equal(existsSync(join(root, 'failures.json')), true);
    assert.equal(existsSync(join(root, 'sessions.json')), true);

    const pngRequest = route._test.normalizeRequest({ mode: 'generate', prompt: 'PNG please', outputFormat: 'png' });
    const pngTasks = route._test.buildTasks({ id: 'fhl-png-job', request: pngRequest });
    assert.equal(pngRequest.outputFormat, 'png');
    assert.match(pngTasks[0].outputPath, /\.png$/);
  } finally {
    backendConfig.DATA_DIR = previousDataDir;
    backendConfig.OUTPUT_DIR = previousOutputDir;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('FHL canvas node and routes expose all planned modes and ports', () => {
  const types = read('../src/types/canvas.ts');
  const registry = read('../src/config/nodeRegistry.ts');
  const ports = read('../src/config/portTypes.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const node = read('../src/components/nodes/FhlImageGenNode.tsx');
  const route = read('../backend/src/routes/fhlImage.js');
  const helpRoute = read('../backend/src/routes/nodeHelp.js');
  const helpDefaults = read('../src/config/nodeHelpDefaults.ts');
  const settings = read('../src/components/ApiSettings.tsx');

  assert.match(types, /'fhl-image-gen'/);
  assert.match(registry, /type:\s*'fhl-image-gen'[\s\S]*label:\s*'FHL 生图'[\s\S]*category:\s*'core'/);
  assert.match(ports, /'fhl-image-gen':\s*\{\s*inputs:\s*\['text', 'image'\],\s*outputs:\s*\['image', 'text'\]/);
  assert.match(canvas, /'fhl-image-gen': FhlImageGenNode/);
  assert.match(canvas, /'fhl-image-gen':\s*\{[\s\S]*fhlQuality:\s*'2K'[\s\S]*fhlOutputFormat:\s*'jpg'/);
  assert.match(node, /id="text"/);
  assert.match(node, /id="fixed"/);
  assert.match(node, /id="items"/);
  assert.match(node, /data-fhl-job-status/);
  assert.match(node, /nail-tryon/);
  assert.match(node, /fhlOutputFormat/);
  assert.match(node, /<NodeHelpButton[\s\S]*nodeType="fhl-image-gen"/);
  assert.match(helpRoute, /HELP_NODE_TYPES = new Set\(\[[\s\S]*'fhl-image-gen'/);
  assert.match(helpDefaults, /'fhl-image-gen': `# FHL 生图[\s\S]*## 顶部四种模式[\s\S]*## 保存格式[\s\S]*## 状态与任务队列[\s\S]*## 常见问题/);
  assert.match(settings, /NODE_HELP_NODES[\s\S]*n\.type === 'fhl-image-gen'/);
  assert.match(route, /router\.post\('\/jobs'/);
  assert.match(route, /router\.post\('\/jobs\/:id\/cancel'/);
  assert.match(route, /router\.post\('\/jobs\/:id\/resume'/);
  assert.match(route, /manifest\.json/);
  assert.match(route, /summary\.csv/);
  assert.match(settings, /data-fhl-settings/);
  assert.match(settings, /从 Codex 插件导入/);
});
