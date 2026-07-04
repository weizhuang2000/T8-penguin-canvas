import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWayfindingExtractPrompt,
  buildWayfindingImagePrompt,
  normalizeWayfindingScope,
  normalizeWayfindingSignTypes,
  parseWayfindingExtractJson,
  WAYFINDING_SIGN_TYPES,
} from '../src/utils/wayfindingDesignPromptData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('wayfinding extract prompt and parser support museum route fields', () => {
  const prompt = buildWayfindingExtractPrompt({ sourceText: 'museum source' });
  assert.match(prompt, /museumName/);
  assert.match(prompt, /destinations/);
  assert.match(prompt, /routeText/);

  assert.deepEqual(parseWayfindingExtractJson(JSON.stringify({
    museumName: '城市博物馆',
    projectTheme: '城市记忆',
    zones: ['一层序厅', '二层展厅'],
    destinations: ['服务台', '文创商店'],
    routeText: '入口到序厅再到基本陈列',
    signText: '基本陈列 / 服务台',
    notes: '控制反光',
  })), {
    museumName: '城市博物馆',
    projectTheme: '城市记忆',
    zones: ['一层序厅', '二层展厅'],
    destinations: ['服务台', '文创商店'],
    routeText: '入口到序厅再到基本陈列',
    signText: '基本陈列 / 服务台',
    notes: '控制反光',
  });
});

test('wayfinding scope variants enter image prompt', () => {
  assert.equal(normalizeWayfindingScope('bad'), 'mixed');

  const indoor = buildWayfindingImagePrompt({ scope: 'indoor' });
  assert.match(indoor, /空间范围：室内/);
  assert.match(indoor, /只表现博物馆室内导视/);

  const outdoor = buildWayfindingImagePrompt({ scope: 'outdoor' });
  assert.match(outdoor, /空间范围：室外/);
  assert.match(outdoor, /只表现博物馆室外导视/);

  const mixed = buildWayfindingImagePrompt({ scope: 'mixed' });
  assert.match(mixed, /空间范围：室内\+室外/);
  assert.match(mixed, /同时涉及博物馆室内与室外导视/);
});

test('all core sign types normalize and emit to prompt', () => {
  const ids = WAYFINDING_SIGN_TYPES.map((item) => item.id);
  assert.deepEqual(normalizeWayfindingSignTypes(ids), ids);
  const prompt = buildWayfindingImagePrompt({ signTypes: ids });
  for (const item of WAYFINDING_SIGN_TYPES) {
    assert.match(prompt, new RegExp(item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('wayfinding output modes produce distinct constraints', () => {
  const board = buildWayfindingImagePrompt({ outputMode: 'system-board' });
  assert.match(board, /完整导视系统规范图/);
  assert.match(board, /标牌家族/);

  const scene = buildWayfindingImagePrompt({ outputMode: 'scene-render' });
  assert.match(scene, /真实博物馆场景/);
  assert.match(scene, /尺度关系/);
});

test('wayfinding node is registered across frontend and permission surfaces', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-wayfinding-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-wayfinding-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /label: '导视系统设计'/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-wayfinding-design': \{ inputs: \['text', 'image'\], outputs: \['image', 'text'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /import WayfindingDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-wayfinding-design': WayfindingDesignNode/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'exhibition-wayfinding-design'/);
  assert.match(read('src/components/nodes/ExhibitionTextImageLoopNode.tsx'), /'exhibition-wayfinding-design'/);
  assert.match(read('src/utils/nodePlacement.ts'), /'exhibition-wayfinding-design': \{ w: 640, h: 760 \}/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-wayfinding-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /exhibition-wayfinding-design/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /exhibition-wayfinding-design/);
});
