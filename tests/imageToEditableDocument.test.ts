import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildImageToEditablePrompt } from '../src/services/imageToEditableDocument.ts';

const require = createRequire(import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('图片转可编辑文件节点完成类型、注册、端口和运行总线接入', () => {
  const types = read('../src/types/canvas.ts');
  const registry = read('../src/config/nodeRegistry.ts');
  const ports = read('../src/config/portTypes.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const node = read('../src/components/nodes/ImageToEditableDocumentNode.tsx');
  const codexRoute = read('../backend/src/routes/codexCli.js');
  const codexService = read('../src/services/codexCli.ts');
  const features = read('../features.json');

  assert.match(types, /'image-to-editable-document'/);
  assert.match(registry, /type:\s*'image-to-editable-document'[\s\S]*label:\s*'图片转可编辑文件'[\s\S]*category:\s*'codex'/);
  assert.match(ports, /'image-to-editable-document':\s*\{\s*inputs:\s*\['image'\],\s*outputs:\s*\[\]/);
  assert.match(canvas, /import ImageToEditableDocumentNode from '\.\/nodes\/ImageToEditableDocumentNode'/);
  assert.match(canvas, /'image-to-editable-document': ImageToEditableDocumentNode/);
  assert.match(node, /useRunTrigger\(id, handleRun, 'image-to-editable-document'\)/);
  assert.match(node, /editableOutputFormat/);
  assert.match(node, /editableCodexExecutablePath/);
  assert.match(node, /高级设置 · Codex CLI/);
  assert.match(node, /executablePath/);
  assert.match(node, /PPTX/);
  assert.match(node, /PSD/);
  assert.match(node, /editpptAvailable/);
  assert.match(codexRoute, /probeEditPptRuntime/);
  assert.match(codexRoute, /includeEditppt/);
  assert.match(codexService, /includeEditppt\?: boolean/);
  assert.match(canvas, /editableCodexExecutablePath:\s*''/);
  assert.match(features, /"nodeType": "image-to-editable-document"/);
});

test('PPT 模式保留 Skill 的逐页对象化和 finalize 校验要求', () => {
  const prompt = buildImageToEditablePrompt({ format: 'ppt', imageCount: 3 });
  assert.match(prompt, /\$image-to-editable-ppt/);
  assert.match(prompt, /prepare、逐页重建\/调度、record、finalize/);
  assert.match(prompt, /同一个演示文稿/);
  assert.match(prompt, /T8_CODEX_OUTPUT_DIR/);
  assert.match(prompt, /不得把完整源图作为唯一内容层/);
});

test('PSD 模式要求真实图层并拒绝扁平降级', () => {
  const prompt = buildImageToEditablePrompt({
    format: 'psd',
    imageCount: 2,
    extraInstructions: '图层使用中文命名',
  });
  assert.match(prompt, /覆盖该 Skill 中“输出始终为 PPTX”的限制/);
  assert.match(prompt, /真实分层 PSD/);
  assert.match(prompt, /文字分别置于命名图层或图层组/);
  assert.match(prompt, /禁止只写一个铺满画布的扁平图层/);
  assert.match(prompt, /多张输入图分别输出多个 \.psd/);
  assert.match(prompt, /图层使用中文命名/);
});

test('Codex 产物收集器识别 PPTX 和 PSD 为普通文件产物', () => {
  const runner = require('../backend/src/utils/codexCliRunner.js');
  const artifacts = runner.extractArtifactsFromText([
    '[演示文稿](C:/tmp/outputs/deck.pptx)',
    '[分层文件](C:/tmp/outputs/page_001.psd)',
  ].join('\n'));

  assert.deepEqual(artifacts.map((item: any) => item.kind), ['file', 'file']);
  assert.deepEqual(artifacts.map((item: any) => item.title), ['deck.pptx', 'page_001.psd']);
});
