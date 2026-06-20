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
  assert.match(source, /UnitPanelMaterialSelect/);
  assert.match(source, /UnitPanelMaterialEditorModal/);
  assert.match(source, /ColorMaterialPresetSelect/);
  assert.match(source, /buildUnitPanelExtractPrompt/);
  assert.match(source, /buildUnitPanelTranslatePrompt/);
  assert.match(source, /buildUnitPanelImagePrompt/);
  assert.match(source, /生图平台/);
  assert.match(source, /生图模型/);
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
