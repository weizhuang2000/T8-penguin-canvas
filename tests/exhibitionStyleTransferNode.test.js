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
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-style-transfer'/);
  assert.match(read('backend/src/routes/proxy.js'), /'exhibition-style-transfer'/);
});

test('exhibition style transfer node exposes image ports and shared controls', () => {
  assert.match(read('src/config/portTypes.ts'), /'exhibition-style-transfer': \{ inputs: \['image'\], outputs: \['image'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /targetType === 'exhibition-style-transfer' && handle === 'style-reference'/);
  const source = read('src/components/nodes/ExhibitionStyleTransferNode.tsx');
  assert.match(source, /<Handle id="original-image" type="target" position=\{Position\.Left\}/);
  assert.match(source, /<Handle id="style-reference" type="target" position=\{Position\.Left\}/);
  assert.match(source, /STYLE_REFERENCE_HANDLE_COLOR = '#f472b6'/);
  assert.match(source, /id="style-reference"[\s\S]*background: STYLE_REFERENCE_HANDLE_COLOR/);
  assert.match(source, /ColorMaterialPresetSelect/);
  assert.match(source, /ColorMaterialPresetEditorModal/);
  assert.match(source, /UnitPanelMaterialSelect/);
  assert.match(source, /UnitPanelMaterialEditorModal/);
  assert.match(source, /outputFormat/);
  assert.match(source, /\['jpg', 'png'\]/);
  assert.match(source, /MentionPromptInput/);
  assert.match(source, /resolveMediaMentions/);
  assert.match(source, /mentionToken: '@图片1'/);
  assert.match(source, /mentionToken: '@图片2'/);
  assert.match(source, /promptMentions/);
  assert.match(source, /supplementMentions/);
  assert.match(source, /useRunTrigger\(id, runGenerate, 'image'\)/);
  assert.match(source, /生成风格迁移/);
  assert.match(source, /closestAspectRatio/);
  assert.match(source, /aspectRatioSource/);
  assert.doesNotMatch(source, /analyzeDominantTone/);
  assert.doesNotMatch(source, /styleReferenceTone/);
  assert.doesNotMatch(source, /参考图主色调识别/);
  assert.match(read('src/components/nodes/mediaMentions.ts'), /@\u56fe\u7247\\d\+/);
});
