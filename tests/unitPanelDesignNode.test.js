import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('unit panel design node exposes reference handle and shared controls', () => {
  const source = read('src/components/nodes/UnitPanelDesignNode.tsx');
  assert.match(source, /id="color-material-reference"/);
  assert.match(source, /EXHIBITION_COLOR_MATERIAL_REFERENCE_COLOR/);
  assert.match(source, /UnitPanelMaterialSelect/);
  assert.match(source, /UnitPanelMaterialEditorModal/);
  assert.match(source, /ColorMaterialPresetSelect/);
  assert.match(source, /buildUnitPanelExtractPrompt/);
  assert.match(source, /buildUnitPanelTranslatePrompt/);
  assert.match(source, /buildUnitPanelImagePrompt/);
  assert.match(source, /生图平台/);
  assert.match(source, /生图模型/);
  assert.match(source, /分辨率/);
  assert.match(source, /value="1K"/);
  assert.match(source, /value="2K"/);
  assert.match(source, /value="4K"/);
  assert.match(source, /单元板数量/);
  assert.match(source, /图片显示/);
  assert.match(source, /特殊造型/);
  assert.match(source, /黑背景/);
  assert.match(source, /白背景/);
  assert.match(source, /文字控制区/);
  assert.match(source, /imageDisplayEnabled/);
  assert.match(source, /specialShapeEnabled/);
  assert.match(source, /backgroundMode/);
  assert.match(source, /subtitleText/);
  assert.match(source, /subtitleText: parsed\.subtitleText/);
  assert.match(source, /projectTheme: parsed\.subtitleText/);
  assert.match(source, /subtitleEnabled/);
  assert.match(source, /mixedLanguageLayoutEnabled/);
  assert.match(source, /textLayoutBounds/);
  assert.match(source, /referenceOverridesMaterialAndFont/);
  assert.match(source, /材质与字体板块暂不生效/);
  assert.match(source, /updatePanelCount/);
  assert.match(source, /updateTextLayoutBound/);
  assert.match(source, /advancedProvidersForNode\(advancedProviders, 'image'\)/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /queryExternalImageStatus/);
});

test('unit panel design is registered in frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'unit-panel-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'unit-panel-design'/);
  assert.match(read('src/components/Canvas.tsx'), /UnitPanelDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /'unit-panel-design': UnitPanelDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /primaryMaterialId/);
  assert.match(read('src/components/Canvas.tsx'), /imageDisplayEnabled: true/);
  assert.match(read('src/components/Canvas.tsx'), /specialShapeEnabled: false/);
  assert.match(read('src/components/Canvas.tsx'), /backgroundMode: 'black'/);
  assert.match(read('src/components/Canvas.tsx'), /subtitleText: ''/);
  assert.match(read('src/components/Canvas.tsx'), /subtitleEnabled: false/);
  assert.match(read('src/components/Canvas.tsx'), /mixedLanguageLayoutEnabled: false/);
  assert.match(read('src/components/Canvas.tsx'), /textLayoutBounds/);
  assert.match(read('src/components/Canvas.tsx'), /lowerMeters: 0\.8/);
  assert.match(read('src/components/Canvas.tsx'), /upperMeters: 2\.2/);
  assert.doesNotMatch(read('src/components/Canvas.tsx'), /totalWidth: 3600/);
  assert.doesNotMatch(read('src/components/Canvas.tsx'), /totalHeight: 1800/);
  assert.doesNotMatch(read('src/components/nodes/UnitPanelDesignNode.tsx'), /\['totalWidth'/);
  assert.doesNotMatch(read('src/components/nodes/UnitPanelDesignNode.tsx'), /\['totalHeight'/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'unit-panel-design'/);
  assert.match(read('src/config/portTypes.ts'), /'unit-panel-design': \{ inputs: \['text', 'image'\], outputs: \['image'\] \}/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'unit-panel-design'/);
});

test('unit panel material API is wired', () => {
  assert.match(read('src/services/api.ts'), /interface UnitPanelMaterialItem/);
  assert.match(read('src/services/api.ts'), /getUnitPanelMaterials/);
  assert.match(read('src/services/api.ts'), /updateUnitPanelMaterials/);
  assert.match(read('backend/src/routes/promptLibrary.js'), /unit-panel\/materials/);
  assert.match(read('backend/src/routes/promptLibrary.js'), /normalizeUnitPanelMaterialList/);
});

test('unit panel material editor supports ai generated shared materials', () => {
  const source = read('src/components/nodes/UnitPanelMaterialEditorModal.tsx');
  assert.match(source, /generateLlm/);
  assert.match(source, /AI 自动添加材质/);
  assert.match(source, /AI 生成 10 个/);
  assert.match(source, /保存选中材质/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /onSave\(\[\.{3}cleaned, \.{3}additions\]\)/);
  assert.match(read('src/components/nodes/UnitPanelDesignNode.tsx'), /llmModel=\{llmModel\}/);
  assert.match(read('src/components/nodes/UnitPanelDesignNode.tsx'), /llmKeyId=\{activeLlmConfig\?\.id \|\| ''\}/);
});
