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
  resolveWayfindingOutputPages,
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

test('wayfinding prompt uses shared color material preset and manual supplement', () => {
  const prompt = buildWayfindingImagePrompt({
    colorMaterialPresetText: '深灰铝板；暖铜色边框；低反射亚克力；浅色石材基座',
    colorMaterial: '局部导视箭头使用雾面白色丝印',
  });
  assert.match(prompt, /色彩与材质体系/);
  assert.match(prompt, /共享色彩与材质预设/);
  assert.match(prompt, /深灰铝板/);
  assert.match(prompt, /手动色彩与材质补充/);
  assert.match(prompt, /雾面白色丝印/);
});

test('wayfinding output page rules resolve stable counts', () => {
  assert.equal(resolveWayfindingOutputPages({ outputMode: 'system-board', scope: 'indoor', signTypes: ['floor-directory'] }).length, 3);
  assert.equal(resolveWayfindingOutputPages({ outputMode: 'scene-render', scope: 'indoor', signTypes: ['floor-directory'] }).length, 2);
  assert.equal(resolveWayfindingOutputPages({ outputMode: 'single-sign', scope: 'mixed', signTypes: WAYFINDING_SIGN_TYPES.map((item) => item.id) }).length, 1);
  assert.equal(resolveWayfindingOutputPages({ outputMode: 'signage-set', scope: 'indoor', signTypes: ['floor-directory'] }).length, 3);
  assert.equal(resolveWayfindingOutputPages({ outputMode: 'system-board', scope: 'mixed', signTypes: WAYFINDING_SIGN_TYPES.map((item) => item.id) }).length, 4);
  assert.equal(resolveWayfindingOutputPages({ outputPageMode: 'fixed', outputPageCount: 6 }).length, 6);
  const mixedPages = resolveWayfindingOutputPages({ outputMode: 'scene-render', scope: 'mixed', signTypes: WAYFINDING_SIGN_TYPES.map((item) => item.id) });
  assert.notEqual(mixedPages[0].focus, mixedPages[1].focus);
  assert.notDeepEqual(mixedPages[0].signTypeIds, mixedPages[1].signTypeIds);
});

test('wayfinding page prompt includes mode, page number and title', () => {
  const fixed = buildWayfindingImagePrompt({
    outputMode: 'system-board',
    outputPageMode: 'fixed',
    outputPageCount: 5,
    pageIndex: 2,
    pageTitle: '标牌家族与版式规范',
    totalPages: 5,
  });
  assert.match(fixed, /输出页面控制：指定页数，共 5 页/);
  assert.match(fixed, /当前页面：第 2 页 \/ 共 5 页：标牌家族与版式规范/);
  assert.match(fixed, /本页内容边界/);
  assert.match(fixed, /本页重点标牌类型/);
  assert.match(fixed, /不要重复生成完整导视系统/);
  assert.match(fixed, /本次只生成当前页面/);

  const auto = buildWayfindingImagePrompt({ outputMode: 'scene-render', outputPageMode: 'auto', scope: 'indoor' });
  assert.match(auto, /输出页面控制：自动分页，共 2 页/);
  assert.match(auto, /当前页面：第 1 页 \/ 共 2 页：入口与到达场景/);
});

test('wayfinding node includes migrated color material preset module', () => {
  const source = read('src/components/nodes/WayfindingDesignNode.tsx');
  assert.match(source, /getElevationPromptPresets/);
  assert.match(source, /updateElevationColorMaterialPresets/);
  assert.match(source, /ColorMaterialPresetSelect/);
  assert.match(source, /ColorMaterialPresetEditorModal/);
  assert.match(source, /data-exhibition-compact-item="preset-options"[\s\S]*色彩与材质预设/);
  assert.match(source, /data-exhibition-compact-item="manual-color-material"/);
  assert.match(source, /data-exhibition-compact-item="page-control"/);
  assert.match(source, /WAYFINDING_OUTPUT_PAGE_OPTIONS/);
  assert.match(source, /resolvedOutputPageCount/);
  assert.match(source, /colorMaterialPresetText/);
});

test('wayfinding node is registered across frontend and permission surfaces', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-wayfinding-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-wayfinding-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /label: '导视系统设计'/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-wayfinding-design': \{ inputs: \['text', 'image'\], outputs: \['image', 'text'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /import WayfindingDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-wayfinding-design': WayfindingDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /outputPageMode: 'auto'[\s\S]*outputPageCount: 3[\s\S]*resolvedOutputPageCount: 0/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'exhibition-wayfinding-design'/);
  assert.match(read('src/components/nodes/ExhibitionTextImageLoopNode.tsx'), /'exhibition-wayfinding-design'/);
  assert.match(read('src/utils/nodePlacement.ts'), /'exhibition-wayfinding-design': \{ w: 640, h: 760 \}/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-wayfinding-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /exhibition-wayfinding-design/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /exhibition-wayfinding-design/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /exhibition-wayfinding-design[\s\S]*preset-options[\s\S]*manual-color-material/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /exhibition-wayfinding-design[\s\S]*preset-options[\s\S]*manual-color-material/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /exhibition-wayfinding-design[\s\S]*page-control/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /exhibition-wayfinding-design[\s\S]*page-control/);
});
