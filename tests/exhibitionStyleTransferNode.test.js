import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition style transfer node is registered in exhibition tools', () => {
  assert.match(read('src/types/canvas.ts'), /'exhibition-style-transfer'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-style-transfer', label: '风格迁移', category: 'exhibition'/);
  assert.match(read('src/components/Canvas.tsx'), /ExhibitionStyleTransferNode/);
});

test('exhibition style transfer node exposes image ports and shared controls', () => {
  assert.match(read('src/config/portTypes.ts'), /'exhibition-style-transfer': \{ inputs: \['image'\], outputs: \['image'\] \}/);
  const source = read('src/components/nodes/ExhibitionStyleTransferNode.tsx');
  assert.match(source, /handleId="original-image"/);
  assert.match(source, /handleId="style-reference"/);
  assert.match(source, /ColorMaterialPresetSelect/);
  assert.match(source, /ColorMaterialPresetEditorModal/);
  assert.match(source, /UnitPanelMaterialSelect/);
  assert.match(source, /UnitPanelMaterialEditorModal/);
  assert.match(source, /outputFormat/);
  assert.match(source, /\['jpg', 'png'\]/);
});
