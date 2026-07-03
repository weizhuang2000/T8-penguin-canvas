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
  assert.match(read('src/components/Canvas.tsx'), /viewAngles: \['front'\]/);
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
  assert.match(source, /SculptureReliefMaterialEditorModal/);
  assert.match(source, /getCurrentUser/);
  assert.match(source, /getSculptureReliefMaterials/);
  assert.match(source, /updateSculptureReliefMaterials/);
  assert.match(source, /canManageMaterials/);
  assert.match(source, /SCULPTURE_RELIEF_VIEW_ANGLES/);
  assert.match(source, /normalizeSculptureReliefViewAngles/);
  assert.match(source, /data-exhibition-compact-item="view-angles"/);
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

test('sculpture relief materials api and compact form hooks are wired', () => {
  const nodeSource = read('src/components/nodes/SculptureReliefDesignNode.tsx');
  const backendSource = read('backend/src/routes/promptLibrary.js');
  assert.match(read('src/services/api.ts'), /getSculptureReliefMaterials/);
  assert.match(read('src/services/api.ts'), /updateSculptureReliefMaterials/);
  assert.match(backendSource, /\/sculpture-relief\/materials/);
  assert.match(backendSource, /isAdminRole\(user\?\.role\)/);
  assert.match(backendSource, /function mergeSculptureReliefMaterialsWithDefaults/);
  assert.match(backendSource, /const defaults = normalizeSculptureReliefMaterialList\(DEFAULT_SCULPTURE_RELIEF_MATERIALS\)/);
  assert.match(backendSource, /const materials = mergeSculptureReliefMaterialsWithDefaults\(req\.body\?\.materials\)/);
  assert.match(nodeSource, /function mergeMaterialOptions/);
  assert.match(nodeSource, /SCULPTURE_RELIEF_MATERIALS\.map/);
  assert.match(nodeSource, /const materialOptions = useMemo\(\(\) => mergeMaterialOptions\(materials\), \[materials\]\)/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /id: 'view-angles'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /id: 'view-angles'/);
});
