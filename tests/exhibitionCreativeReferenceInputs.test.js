import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const nodeSource = fs.readFileSync(path.join(root, 'src/components/nodes/ExhibitionCreativeImageNode.tsx'), 'utf8');
const presetModalSource = fs.readFileSync(path.join(root, 'src/components/nodes/ColorMaterialPresetEditorModal.tsx'), 'utf8');
const presetSelectSource = fs.readFileSync(path.join(root, 'src/components/nodes/ColorMaterialPresetSelect.tsx'), 'utf8');

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
  assert.match(nodeSource, /ColorMaterialPresetSelect/);
  assert.match(nodeSource, /ColorMaterialPresetEditorModal/);
  assert.match(nodeSource, /category,/);
  assert.match(presetSelectSource, /function groupPresets/);
  assert.match(presetSelectSource, /expandedCategory/);
  assert.match(presetSelectSource, /setExpandedCategory\(group\.category\)/);
  assert.match(presetSelectSource, /text-rose-300/);
  assert.match(presetSelectSource, /type="button"/);
  assert.doesNotMatch(presetSelectSource, /__category__/);
  assert.doesNotMatch(nodeSource, /presetId\.startsWith\('__category__'\)/);
});

test('color material preset editor modal supports category and batch operations', () => {
  assert.match(presetModalSource, /createPortal/);
  assert.match(presetModalSource, /addCategory/);
  assert.match(presetModalSource, /confirmRenameCategory/);
  assert.match(presetModalSource, /deleteActiveCategory/);
  assert.match(presetModalSource, /moveSelected/);
  assert.match(presetModalSource, /deleteSelected/);
  assert.match(presetModalSource, /parseRawText/);
  assert.match(presetModalSource, /sourceDrafts = editMode === 'raw' \? parseRawText\(rawText\) : drafts/);
  assert.match(presetModalSource, /选择当前列表/);
  assert.match(presetModalSource, /批量移动/);
  assert.match(presetModalSource, /批量删除/);
  assert.match(presetModalSource, /整段编辑/);
  assert.match(presetModalSource, /应用整段/);
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
