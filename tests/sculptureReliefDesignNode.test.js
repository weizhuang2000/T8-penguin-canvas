import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('sculpture relief design node is registered in frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'sculpture-relief-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'sculpture-relief-design'/);
  assert.match(read('src/components/Canvas.tsx'), /SculptureReliefDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /'sculpture-relief-design': SculptureReliefDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /widthMm: 1200/);
  assert.match(read('src/components/Canvas.tsx'), /heightMm: 1800/);
  assert.match(read('src/components/Canvas.tsx'), /depthMm: 220/);
  assert.match(read('src/components/Canvas.tsx'), /baseHeightMm: 200/);
  assert.match(read('src/components/Canvas.tsx'), /'sculpture-relief-design'/);
  assert.match(read('src/config/portTypes.ts'), /'sculpture-relief-design': \{ inputs: \['text', 'image'\], outputs: \['image'\] \}/);
  assert.match(read('src/utils/nodePlacement.ts'), /'sculpture-relief-design': \{ w: 620, h: 740 \}/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'sculpture-relief-design'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'sculpture-relief-design'/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /nodeType: 'sculpture-relief-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /nodeType: 'sculpture-relief-design'/);
});

test('sculpture relief component exposes pattern reference and generation services', () => {
  const source = read('src/components/nodes/SculptureReliefDesignNode.tsx');
  assert.match(source, /id="pattern-reference"/);
  assert.match(source, /buildSculptureReliefExtractPrompt/);
  assert.match(source, /buildSculptureReliefImagePrompt/);
  assert.match(source, /parseSculptureReliefExtractJson/);
  assert.match(source, /generateLlm/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /queryExternalImageStatus/);
  assert.match(source, /submitImageAsync/);
  assert.match(source, /queryImageStatus/);
  assert.match(source, /images: referenceImages/);
  assert.match(source, /referenceImages = patternReferenceImage \? \[patternReferenceImage\] : \[\]/);
  assert.doesNotMatch(source, /color-material-reference/);
  assert.doesNotMatch(source, /EXHIBITION_COLOR_MATERIAL_REFERENCE_COLOR/);
});
