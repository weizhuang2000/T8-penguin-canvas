import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition plan layout node is registered across frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-plan-layout'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-plan-layout'/);
  assert.match(read('src/config/nodeRegistry.ts'), /平面自动布局/);
  assert.match(read('src/components/Canvas.tsx'), /ExhibitionPlanLayoutNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-plan-layout': ExhibitionPlanLayoutNode/);
  assert.match(read('src/components/Canvas.tsx'), /layoutPresetId: 'balanced'/);
  assert.match(read('src/components/Canvas.tsx'), /insertItems: \['large-sculpture'/);
  assert.match(read('src/components/Canvas.tsx'), /excludeItems: \['readable-wrong-text'/);
  assert.match(read('src/components/Canvas.tsx'), /showRoute: true/);
  assert.match(read('src/components/Canvas.tsx'), /showLabels: true/);
  assert.match(read('src/components/Canvas.tsx'), /showDescriptions: true/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'exhibition-plan-layout'/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-plan-layout': \{ inputs: \['text', 'image'\], outputs: \['image', 'text'\] \}/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-plan-layout'/);
});

test('exhibition plan layout node wires llm and image generation providers', () => {
  const source = read('src/components/nodes/ExhibitionPlanLayoutNode.tsx');
  assert.match(source, /generateLlm/);
  assert.match(source, /advancedProvidersForNode\(advancedProviders, 'image'\)/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /queryExternalImageStatus/);
  assert.match(source, /submitImageAsync/);
  assert.match(source, /queryImageStatus/);
  assert.match(source, /EXHIBITION_PLAN_LAYOUT_PRESETS/);
  assert.match(source, /EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS/);
  assert.match(source, /EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS/);
  assert.match(source, /植入项/);
  assert.match(source, /排除项/);
  assert.match(source, /显示动线/);
  assert.match(source, /显示标注文字/);
  assert.match(source, /显示说明文字/);
  assert.match(source, /id="plan-image"/);
  assert.match(source, /id="outline-text"/);
  assert.match(source, /id="style-reference"/);
});
