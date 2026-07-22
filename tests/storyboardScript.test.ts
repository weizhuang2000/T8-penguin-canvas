import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildStoryboardImagePrompt,
  buildStoryboardScriptMessages,
  derivedStoryboardCellRatio,
  legacyFramesToStoryboard,
  parseStoryboardScript,
  storyboardTextSegments,
} from '../src/utils/storyboardScript.ts';
import { getNodePortTypesForHandle, resolveConnectionPickerHandleId } from '../src/utils/connectionHandles.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function validScriptJson(count = 4) {
  return JSON.stringify({
    title: '雨夜信号',
    visualContinuity: '同一位年轻摄影师，蓝灰雨夜，电影写实光影。',
    shots: Array.from({ length: count }, (_, index) => ({
      index: index + 1,
      title: `镜头 ${index + 1}`,
      durationSeconds: 5,
      shotSize: '中景',
      cameraAngle: '平视',
      cameraMovement: '缓慢推进',
      visual: `画面 ${index + 1}`,
      action: `动作 ${index + 1}`,
      dialogue: '',
      voiceOver: '',
      imagePrompt: `cinematic shot ${index + 1}`,
    })),
  });
}

test('storyboard parser accepts fenced JSON and enforces exact shot count', () => {
  const parsed = parseStoryboardScript(`说明文字\n\`\`\`json\n${validScriptJson(4)}\n\`\`\``, 4);
  assert.equal(parsed.shots.length, 4);
  assert.deepEqual(parsed.shots.map((shot) => shot.index), [1, 2, 3, 4]);
  assert.equal(storyboardTextSegments(parsed).length, 4);
  assert.throws(() => parseStoryboardScript(validScriptJson(3), 4), /必须严格为 4 个/);
});

test('storyboard parser rejects incomplete cards instead of padding fields', () => {
  const raw = JSON.parse(validScriptJson(1));
  delete raw.shots[0].cameraMovement;
  assert.throws(() => parseStoryboardScript(JSON.stringify(raw), 1), /缺少字段 cameraMovement/);
});

test('storyboard prompts specify row-major layout and prohibit visible text', () => {
  const messages = buildStoryboardScriptMessages('测试大纲', 2, 3);
  assert.match(String(messages[0].content), /严格拆分为 6 个/);
  assert.match(String(messages[0].content), /从左到右、从上到下/);

  const script = parseStoryboardScript(validScriptJson(4), 4);
  const prompt = buildStoryboardImagePrompt(script, 2, 2, {
    sheetAspectRatio: '3:2',
    cellAspectRatio: '3:4',
    referenceImageCount: 3,
  });
  assert.match(prompt, /2 行 × 2 列/);
  assert.match(prompt, /不要生成镜头编号、标题、字幕、对白/);
  assert.match(prompt, /每一行必须严格占整图高度的 50%/);
  assert.match(prompt, /禁止不等高行/);
  assert.match(prompt, /主要人物身份与面部、体型、服饰、道具、建筑、场景/);
  assert.match(prompt, /最终复核/);
  assert.ok(prompt.indexOf('cinematic shot 1') < prompt.indexOf('cinematic shot 4'));
});

test('storyboard derives cell aspect ratio from the whole sheet', () => {
  assert.equal(derivedStoryboardCellRatio('3:2', 2, 3), '1:1');
  assert.equal(derivedStoryboardCellRatio('16:9', 2, 3), '32:27');
  assert.equal(derivedStoryboardCellRatio('auto', 2, 3), '自动');
});

test('legacy storyboard frames remain readable as complete cards', () => {
  const script = legacyFramesToStoryboard([
    { title: '开场', desc: '摄影师走入雨夜。' },
    { title: '发现', desc: '远处出现神秘信号。' },
  ]);
  assert.equal(script?.shots.length, 2);
  assert.equal(script?.shots[0].imagePrompt, '摄影师走入雨夜。');
});

test('storyboard handles expose strict text and image port types', () => {
  const node = { id: 'storyboard-1', type: 'storyboard-grid', data: {} } as any;
  assert.deepEqual(getNodePortTypesForHandle(node, 'target', 'outline'), ['text']);
  assert.deepEqual(getNodePortTypesForHandle(node, 'target', 'references'), ['image']);
  assert.deepEqual(getNodePortTypesForHandle(node, 'source', 'script'), ['text']);
  assert.deepEqual(getNodePortTypesForHandle(node, 'source', 'shots'), ['image']);
  assert.equal(resolveConnectionPickerHandleId('storyboard-grid', 'source', 'image'), 'shots');
  assert.equal(resolveConnectionPickerHandleId('storyboard-grid', 'source', 'text'), 'script');
  assert.equal(resolveConnectionPickerHandleId('storyboard-grid', 'target', 'image'), 'references');
});

test('storyboard node is visible, executable, permissioned and uses shared generation runner', () => {
  const registry = read('src/config/nodeRegistry.ts');
  const canvas = read('src/components/Canvas.tsx');
  const node = read('src/components/nodes/StoryboardGridNode.tsx');
  const imageNode = read('src/components/nodes/ImageNode.tsx');
  const permissions = read('backend/src/auth/toolPermissions.js');
  const proxy = read('backend/src/routes/proxy.js');
  const features = JSON.parse(read('features.json'));

  assert.match(registry, /type:\s*'storyboard-grid'[\s\S]*label:\s*'分镜脚本'[\s\S]*category:\s*'core'/);
  assert.doesNotMatch(registry, /type:\s*'storyboard-grid'[^\n]*hidden:\s*true/);
  assert.match(canvas, /EXECUTABLE_NODE_TYPES[\s\S]*'storyboard-grid'/);
  assert.match(node, /sourceNodeType:\s*'storyboard-grid'/);
  assert.match(node, /runConfiguredImageGeneration/);
  assert.match(node, /Handle id="references"/);
  assert.match(node, /images:\s*referenceImages/);
  assert.match(node, /uniformTiles:\s*true/);
  assert.match(node, /mode:\s*referenceImages\.length > 0 \? 'edit' : 'gen'/);
  assert.match(node, /storyboardSheetUrl/);
  assert.match(node, /storyboardExportFormat/);
  assert.match(node, /storyboardExportLayout/);
  assert.match(node, /storyboardPptShotsPerSlide/);
  assert.match(node, /exportStoryboardDocument/);
  assert.match(canvas, /storyboardExportFormat:\s*'docx'/);
  assert.match(canvas, /storyboardExportLayout:\s*'production-table'/);
  assert.match(canvas, /storyboardPptShotsPerSlide:\s*2/);
  assert.match(canvas, /referenceImages:\s*\[\]/);
  assert.match(imageNode, /runConfiguredImageGeneration/);
  assert.match(permissions, /DEFAULT_VISIBLE_NODE_TYPES[\s\S]*'storyboard-grid'/);
  assert.match(proxy, /requireNodePermission\(\['llm', 'prompt-reverse', 'storyboard-grid'\]\)/);
  assert.ok(features.executableNodeTypes.includes('storyboard-grid'));
  assert.ok(!features.nonExecutableNodeTypes.nodes.includes('storyboard-grid'));
});

test('shared runner contains all configured image generation modes', () => {
  const runner = read('src/services/imageGenerationRunner.ts');
  assert.match(runner, /'standard' \| 'fal' \| 'mj' \| 'external'/);
  assert.match(runner, /submitImageAsync/);
  assert.match(runner, /submitImageFal/);
  assert.match(runner, /submitMjImagine/);
  assert.match(runner, /generateExternalImage/);
  assert.match(runner, /AbortSignal/);
});
