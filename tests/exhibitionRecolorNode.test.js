import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition recolor node is registered across frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-recolor'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-recolor'/);
  assert.match(read('src/config/nodeRegistry.ts'), /主色调更换/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-recolor': \{ inputs: \['image'\], outputs: \['image'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /ExhibitionRecolorNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-recolor': ExhibitionRecolorNode/);
  assert.match(read('src/components/Canvas.tsx'), /primaryColor: '#1f5f8b'/);
  assert.match(read('src/components/Canvas.tsx'), /excludeItems: \['exhibit', 'sand-table', 'sculpture'\]/);
  assert.match(read('src/components/Canvas.tsx'), /floorPresetId: ''/);
  assert.match(read('src/components/Canvas.tsx'), /ceilingPresetId: ''/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-recolor'/);
});

test('exhibition recolor node wires presets, color controls and image generation', () => {
  const source = read('src/components/nodes/ExhibitionRecolorNode.tsx');
  assert.match(source, /getExhibitionRecolorPromptPresets/);
  assert.match(source, /updateExhibitionRecolorPalettePresets/);
  assert.match(source, /updateExhibitionRecolorExcludePresets/);
  assert.match(source, /updateExhibitionRecolorFloorPresets/);
  assert.match(source, /updateExhibitionRecolorCeilingPresets/);
  assert.match(source, /地面与天花板/);
  assert.match(source, /type="color"/);
  assert.match(source, /type="range"/);
  assert.match(source, /manualExclusions/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /queryExternalImageStatus/);
  assert.match(source, /submitImageAsync/);
  assert.match(source, /queryImageStatus/);
  assert.match(source, /id="original-image"/);
  assert.match(source, /sourceNodeType: 'exhibition-recolor'/);
  assert.match(source, /NODE_RUN_BUTTON/);
  assert.match(source, /absolute -right-2 -top-3/);
  assert.match(source, /bg-emerald-400\/90/);

  const api = read('src/services/api.ts');
  assert.match(api, /ExhibitionRecolorPalettePresetItem/);
  assert.match(api, /ExhibitionRecolorSurfacePresetItem/);
  assert.match(api, /getExhibitionRecolorPromptPresets/);
  assert.match(api, /\/prompt-library\/exhibition-recolor\/presets/);

  const backend = read('backend/src/routes/promptLibrary.js');
  assert.match(backend, /RECOLOR_DB_FILE/);
  assert.match(backend, /prompt_library_exhibition_recolor\.json/);
  assert.match(backend, /router\.get\('\/exhibition-recolor\/presets'/);
  assert.match(backend, /router\.put\('\/exhibition-recolor\/presets\/palettes'/);
  assert.match(backend, /router\.put\('\/exhibition-recolor\/presets\/exclusions'/);
  assert.match(backend, /router\.put\('\/exhibition-recolor\/presets\/floors'/);
  assert.match(backend, /router\.put\('\/exhibition-recolor\/presets\/ceilings'/);
});
