import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const nodeSource = fs.readFileSync(path.join(root, 'src/components/nodes/ExhibitionCreativeImageNode.tsx'), 'utf8');

test('exhibition creative node exposes color/material and exhibit reference handles', () => {
  assert.match(nodeSource, /id="space"/);
  assert.match(nodeSource, /id="color-material-reference"/);
  assert.match(nodeSource, /id="exhibit-reference"/);
  assert.match(nodeSource, /useInputImageByHandle\(id, 'color-material-reference'\)/);
  assert.match(nodeSource, /useInputImageByHandle\(id, 'exhibit-reference'\)/);
});

test('exhibition creative node disables manual color material inputs when reference image is connected', () => {
  assert.match(nodeSource, /已由接入的色彩与材质参考图接管/);
  assert.match(nodeSource, /disabled=\{isReadonly \|\| busy \|\| hasColorMaterialReference\}/);
  assert.match(nodeSource, /colorMaterial: effectiveColorMaterial/);
  assert.match(nodeSource, /hasColorMaterialReferenceImage: hasColorMaterialReference/);
});

test('exhibition creative node creates transient marked data urls without save APIs', () => {
  assert.match(nodeSource, /canvas\.toDataURL\('image\/png'\)/);
  assert.match(nodeSource, /const runtimeReferenceImages = \[spaceImage, markedColorMaterialImage, exhibitReferenceImage\]\.filter\(Boolean\)/);
  assert.match(nodeSource, /images: referenceImages/);
  assert.doesNotMatch(nodeSource, /markedSpaceImage/);
  assert.doesNotMatch(nodeSource, /空间图标识/);
  assert.doesNotMatch(nodeSource, /opMark/);
  assert.doesNotMatch(nodeSource, /\/api\/image\/mark/);
  assert.doesNotMatch(nodeSource, /upload-base64/);
});
