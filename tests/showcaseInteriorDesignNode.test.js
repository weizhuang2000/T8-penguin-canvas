import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('showcase interior design node is registered in frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'showcase-interior-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'showcase-interior-design'/);
  assert.match(read('src/components/Canvas.tsx'), /ShowcaseInteriorDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /'showcase-interior-design': ShowcaseInteriorDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /showcaseStyle/);
  assert.match(read('src/components/Canvas.tsx'), /widthMm: 1200/);
  assert.match(read('src/components/Canvas.tsx'), /baseHeightMm: 300/);
  assert.match(read('src/components/Canvas.tsx'), /glassHeightMm: 1400/);
  assert.match(read('src/components/Canvas.tsx'), /capHeightMm: 180/);
  assert.match(read('src/components/Canvas.tsx'), /hasCap: true/);
  assert.match(read('src/components/Canvas.tsx'), /perspectiveEnabled: true/);
  assert.match(read('src/components/Canvas.tsx'), /explodedViewEnabled: false/);
  assert.match(read('src/config/portTypes.ts'), /'showcase-interior-design': \{ inputs: \['image'\], outputs: \['image'\] \}/);
  assert.match(read('src/utils/nodePlacement.ts'), /'showcase-interior-design': \{ w: 520, h: 680 \}/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'showcase-interior-design'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'showcase-interior-design'/);
});

test('showcase interior design component wires shared controls and generation services', () => {
  const source = read('src/components/nodes/ShowcaseInteriorDesignNode.tsx');
  assert.match(source, /id="color-material-reference"/);
  assert.match(source, /ColorMaterialPresetSelect/);
  assert.match(source, /buildShowcaseInteriorDesignPrompt/);
  assert.match(source, /buildShowcaseInteriorScaleReferenceDataUrl/);
  assert.match(source, /buildScaledExhibitReferenceImage/);
  assert.match(source, /imageDataUrlToPngDataUrl/);
  assert.match(source, /scaleReferenceImage/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /submitImageAsync/);
  assert.match(source, /queryImageStatus/);
  assert.match(source, /queryExternalImageStatus/);
  assert.match(source, /exhibitItems/);
  assert.match(source, /heightMm/);
  assert.match(source, /高度 mm/);
  assert.match(source, /perspectiveEnabled/);
  assert.match(source, /透视效果/);
  assert.match(source, /dimensionMarksEnabled/);
  assert.match(source, /explodedViewEnabled/);
});
