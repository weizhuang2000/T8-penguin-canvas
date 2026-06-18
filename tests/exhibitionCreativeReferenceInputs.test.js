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
  assert.match(nodeSource, /useInputImagesByHandle\(id, 'exhibit-reference'\)/);
});

test('exhibition creative node disables manual color material inputs when reference image is connected', () => {
  assert.match(nodeSource, /已由接入的色彩与材质参考图接管/);
  assert.match(nodeSource, /disabled=\{isReadonly \|\| busy \|\| hasColorMaterialReference/);
  assert.match(nodeSource, /colorMaterial: effectiveColorMaterial/);
  assert.match(nodeSource, /hasColorMaterialReferenceImage: hasColorMaterialReference/);
});

test('exhibition creative color material preset and reference input stay mutually exclusive', () => {
  assert.match(nodeSource, /useReactFlow/);
  assert.match(nodeSource, /disconnectColorMaterialReferenceInput/);
  assert.match(nodeSource, /edge\.target !== id \|\| \(edge\.targetHandle \|\| ''\) !== 'color-material-reference'/);
  assert.match(nodeSource, /if \(hasColorMaterialPreset && !colorMaterialPresetDisconnectRef\.current\) \{\s*update\(\{ colorMaterialPreset: '' \}\);/);
  assert.match(nodeSource, /if \(presetId\) disconnectColorMaterialReferenceInput\(\);/);
});

test('exhibition creative color material presets support editable categories', () => {
  assert.match(nodeSource, /category = String\(preset\.category \|\| '默认'\)/);
  assert.match(nodeSource, /function groupColorMaterialPresets/);
  assert.match(nodeSource, /<optgroup key=\{group\.category\} label=\{group\.category\}>/);
  assert.match(nodeSource, /分类｜名称｜Color palette｜Materials\/textures｜适用/);
  assert.match(nodeSource, /category,/);
});

test('exhibition creative node creates transient marked data urls without save APIs', () => {
  assert.match(nodeSource, /canvas\.toDataURL\('image\/png'\)/);
  assert.match(nodeSource, /createColorMaterialAbstractCardDataUrl/);
  assert.match(nodeSource, /isExternalSelected\s*\?\s*isGptImage2Model\(externalProviderModel\)\s*:\s*\(isGptImage2Model\(apiModel\) \|\| isGptImage2Model\(modelDef\.id\)\)/);
  assert.match(nodeSource, /const colorMaterialReferenceForModel = colorMaterialReferenceImage/);
  assert.match(nodeSource, /await createColorMaterialAbstractCardDataUrl\(colorMaterialReferenceImage, colorMaterialMarkSettings\)/);
  assert.match(nodeSource, /await markImageDataUrl\(colorMaterialReferenceImage, colorMaterialMarkSettings\)/);
  assert.match(nodeSource, /const runtimeReferenceImages = \[spaceImage, colorMaterialReferenceForModel, \.\.\.exhibitReferenceImageUrls\]\.filter\(Boolean\)/);
  assert.match(nodeSource, /colorMaterialReferenceMode: ColorMaterialReferenceMode = useColorMaterialAbstractCard \? 'abstract-card' : 'marked-image'/);
  assert.match(nodeSource, /images: referenceImages/);
  assert.doesNotMatch(nodeSource, /markedSpaceImage/);
  assert.doesNotMatch(nodeSource, /空间图标识/);
  assert.doesNotMatch(nodeSource, /opMark/);
  assert.doesNotMatch(nodeSource, /\/api\/image\/mark/);
  assert.doesNotMatch(nodeSource, /upload-base64/);
});
