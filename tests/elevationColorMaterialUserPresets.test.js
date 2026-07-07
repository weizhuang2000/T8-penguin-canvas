import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('frontend exposes color material user preset APIs and metadata', () => {
  const api = read('src/services/api.ts');
  assert.match(api, /source\?: 'system' \| 'user'/);
  assert.match(api, /scope\?: 'personal' \| 'team'/);
  assert.match(api, /ownerUserId\?: string/);
  assert.match(api, /canEdit\?: boolean/);
  assert.match(api, /createElevationColorMaterialUserPreset/);
  assert.match(api, /updateElevationColorMaterialUserPreset/);
  assert.match(api, /deleteElevationColorMaterialUserPreset/);
});

test('color material editor separates user presets from system presets', () => {
  const modal = read('src/components/nodes/ColorMaterialPresetEditorModal.tsx');
  assert.match(modal, /createElevationColorMaterialUserPreset/);
  assert.match(modal, /updateElevationColorMaterialUserPreset/);
  assert.match(modal, /deleteElevationColorMaterialUserPreset/);
  assert.match(modal, /canManageSystem/);
  assert.match(modal, /activeSource === 'user'/);
  assert.match(modal, /source === 'system'/);
  assert.match(modal, /value="personal"/);
  assert.match(modal, /value="team"/);
  assert.match(modal, /allCategories/);
  assert.match(modal, /用户预设只能选择当前已有分类/);
  assert.match(modal, /canEdit !== false/);
  assert.match(modal, /canDelete !== false/);
  assert.match(modal, /onRefresh/);
});

test('existing color material management entries are available to signed-in users', () => {
  for (const file of [
    'src/components/nodes/ElevationPromptNode.tsx',
    'src/components/nodes/ExhibitionSceneDesignNode.tsx',
    'src/components/nodes/ExhibitionCreativeImageNode.tsx',
    'src/components/nodes/ExhibitionImg2ImgNode.tsx',
    'src/components/nodes/ExhibitionStyleTransferNode.tsx',
    'src/components/nodes/WayfindingDesignNode.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /ColorMaterialPresetEditorModal/);
    assert.match(source, /currentUser && \(/);
    assert.match(source, /canManageSystem=\{canManageTeam\}/);
    assert.match(source, /onRefresh=\{setColorMaterialPresets\}/);
  }
});
