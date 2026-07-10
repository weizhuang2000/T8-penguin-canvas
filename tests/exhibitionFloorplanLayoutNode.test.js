import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition floorplan node is registered across canvas and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /'exhibition-floorplan-layout'/);
  assert.match(read('src/config/nodeRegistry.ts'), /label: '展陈平面布局'/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-floorplan-layout': ExhibitionFloorplanLayoutNode/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-floorplan-layout': \{ inputs: \['text', 'image'\], outputs: \['image', 'text'\] \}/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-floorplan-layout'/);
});

test('node enforces architecture lock and separates AI render action', () => {
  const source = read('src/components/nodes/ExhibitionFloorplanLayoutNode.tsx');
  assert.match(source, /请先导入、核验并锁定建筑底图/);
  assert.match(source, /useRunTrigger\(id, runLayout, 'image'\)/);
  assert.match(source, /生成 AI 表现图/);
  assert.match(source, /buildFloorplanSvg/);
  assert.match(source, /validate-layout/);
  assert.match(source, /layoutVersion/);
  assert.match(source, /advancedProvidersForNode\(advancedProviders, 'image'\)/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /await floorplanSvgToPngDataUrl\(svg\)/);
  assert.match(source, /providerModel: models\[0\] \|\| ''/);
  assert.match(source, /生图平台/);
  assert.match(source, /生图模型/);
  assert.match(read('src/components/Canvas.tsx'), /EXHIBITION_IMAGE_PROVIDER_NODE_TYPES[\s\S]*'exhibition-floorplan-layout'/);
});

test('backend exposes all floorplan endpoints', () => {
  const route = read('backend/src/routes/floorplan.js');
  for (const endpoint of ['parse-dxf', 'analyze-image', 'generate-layouts', 'validate-layout']) assert.match(route, new RegExp(endpoint));
  assert.match(read('backend/src/server.js'), /app\.use\('\/api\/floorplan', floorplanRouter\)/);
});
