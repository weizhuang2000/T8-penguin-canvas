import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition lighting heatmap node is registered across canvas and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-lighting-heatmap'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-lighting-heatmap', label: '灯光热力图', category: 'exhibition'/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-lighting-heatmap': \{ inputs: \['image'\], outputs: \['image'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /import ExhibitionLightingHeatmapNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-lighting-heatmap': ExhibitionLightingHeatmapNode/);
  assert.match(read('src/components/Canvas.tsx'), /heatmapMode: 'overlay'/);
  assert.match(read('src/components/Canvas.tsx'), /focusItems: \['uniformity', 'accent-lighting', 'glare-risk', 'dark-zones'\]/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-lighting-heatmap'/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'exhibition-lighting-heatmap'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-lighting-heatmap'/);
  assert.match(read('backend/src/routes/proxy.js'), /'exhibition-lighting-heatmap'/);
});

test('exhibition lighting heatmap node wires controls and image generation', () => {
  const source = read('src/components/nodes/ExhibitionLightingHeatmapNode.tsx');

  assert.match(source, /id="source-image"/);
  assert.match(source, /覆盖层图/);
  assert.match(source, /独立分析图/);
  assert.match(source, /EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS/);
  assert.match(source, /\['jpg', 'png'\]/);
  assert.match(source, /advancedProvidersForNode/);
  assert.match(source, /resolveAdvancedProviderSelection/);
  assert.match(source, /externalImageSizeFor/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /queryExternalImageStatus/);
  assert.match(source, /submitImageAsync/);
  assert.match(source, /queryImageStatus/);
  assert.match(source, /closestAspectRatio/);
  assert.match(source, /sourceNodeType: 'exhibition-lighting-heatmap'/);
  assert.match(source, /useRunTrigger\(id, runGenerate, 'image'\)/);
  assert.match(source, /NODE_RUN_BUTTON/);
});
