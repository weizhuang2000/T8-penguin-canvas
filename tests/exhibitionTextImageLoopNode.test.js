import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition text-image loop node is registered across frontend surfaces', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-text-image-loop'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-text-image-loop'/);
  assert.match(read('src/config/nodeRegistry.ts'), /label: '图文循环器'/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-text-image-loop': \{ inputs: \['text', 'image'\], outputs: \['text', 'image'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /import ExhibitionTextImageLoopNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-text-image-loop': ExhibitionTextImageLoopNode/);
  assert.match(read('src/components/Canvas.tsx'), /pairingMode: 'zip'/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-text-image-loop'/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'exhibition-text-image-loop'/);
  assert.match(read('src/utils/nodePlacement.ts'), /'exhibition-text-image-loop': \{ w: 330, h: 320 \}/);
});

test('exhibition text-image loop node supports paired text and image execution modes', () => {
  const source = read('src/components/nodes/ExhibitionTextImageLoopNode.tsx');
  assert.match(source, /type PairingMode = 'zip' \| 'cycle-shorter' \| 'matrix'/);
  assert.match(source, /buildPairs/);
  assert.match(source, /id="text"/);
  assert.match(source, /id="image"/);
  assert.match(source, /buildPairPatch/);
  assert.match(source, /textSegments/);
  assert.match(source, /imageUrls/);
  assert.match(source, /runSerial/);
  assert.match(source, /runParallel/);
  assert.match(source, /__loopAccumulate/);
  assert.match(source, /type: 'relay'/);
  assert.match(source, /targetHandle: \(edge as any\)\.targetHandle/);
  assert.match(source, /'exhibition-img2img'/);
  assert.match(source, /'unit-panel-design'/);
  assert.match(source, /'exhibition-creative-image'/);
});
