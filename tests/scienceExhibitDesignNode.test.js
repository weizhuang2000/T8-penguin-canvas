import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('science exhibit design node is registered across frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'science-exhibit-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'science-exhibit-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /label: '科技展项设计'/);
  assert.match(read('src/components/Canvas.tsx'), /ScienceExhibitDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /'science-exhibit-design': ScienceExhibitDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /scienceDomain: 'physics'/);
  assert.match(read('src/components/Canvas.tsx'), /backgroundMode: 'white'/);
  assert.match(read('src/components/Canvas.tsx'), /colorMaterialPreset: ''/);
  assert.match(read('src/components/Canvas.tsx'), /colorMaterialPalette: ''/);
  assert.match(read('src/components/Canvas.tsx'), /colorMaterialTextures: ''/);
  assert.match(read('src/components/Canvas.tsx'), /widthMm: 2200/);
  assert.match(read('src/components/Canvas.tsx'), /estimatedPowerW: 800/);
  assert.match(read('src/components/Canvas.tsx'), /drawingSelection: \['exploded', 'principle', 'orthographic', 'parameter-table'\]/);
  assert.match(read('src/config/portTypes.ts'), /'science-exhibit-design': \{ inputs: \['text', 'image'\], outputs: \['image', 'text'\] \}/);
  assert.match(read('src/utils/nodePlacement.ts'), /'science-exhibit-design': \{ w: 660, h: 820 \}/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'science-exhibit-design'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'science-exhibit-design'/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /nodeType: 'science-exhibit-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /nodeType: 'science-exhibit-design'/);
});

test('science exhibit component exposes handles, llm extraction and generation services', () => {
  const source = read('src/components/nodes/ScienceExhibitDesignNode.tsx');
  assert.match(source, /id="text"/);
  assert.match(source, /id="space-reference"/);
  assert.match(source, /id="device-reference"/);
  assert.match(source, /id="text-output"/);
  assert.match(source, /PromptTextarea/);
  assert.match(source, /MentionPromptInput/);
  assert.match(source, /ColorMaterialPresetSelect/);
  assert.match(source, /getElevationPromptPresets/);
  assert.match(source, /colorMaterialTextFromPreset/);
  assert.match(source, /resolveMediaMentions/);
  assert.match(source, /buildScienceExhibitExtractPrompt/);
  assert.match(source, /buildScienceExhibitImagePrompt/);
  assert.match(source, /buildScienceExhibitDrawingPrompt/);
  assert.match(source, /normalizeScienceExhibitDimensions/);
  assert.match(source, /normalizeScienceExhibitBackground/);
  assert.match(source, /SCIENCE_EXHIBIT_BACKGROUNDS/);
  assert.match(source, /data-exhibition-compact-item=\{String\(key\) === 'backgroundMode' \? 'background-mode' : 'parameter-input'\}/);
  assert.match(source, /data-exhibition-compact-section="dimensions"/);
  assert.match(source, /data-exhibition-compact-section="color-material"/);
  assert.match(source, /data-exhibition-compact-item="preset-select"/);
  assert.match(source, /data-exhibition-compact-item="size-input"/);
  assert.match(source, /parseScienceExhibitExtractJson/);
  assert.match(source, /generateLlm/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /submitImageAsync/);
  assert.match(source, /useRunTrigger\(id, runGenerate, 'image'\)/);
});

test('science exhibit generation preserves fixed drawing order and output text', () => {
  const source = read('src/components/nodes/ScienceExhibitDesignNode.tsx');
  assert.match(source, /DRAWING_ORDER: ScienceExhibitDrawingType\[\] = \['render', 'exploded', 'principle', 'orthographic', 'parameter-table'\]/);
  assert.match(source, /const sequence: ScienceExhibitDrawingType\[\] = DRAWING_ORDER\.filter/);
  assert.match(source, /renderImage = generated\.imageUrl/);
  assert.match(source, /previousDrawingImage = generated\.imageUrl/);
  assert.match(source, /scienceExhibitResults: results\.slice\(\)/);
  assert.match(source, /imageUrls: generatedUrls\.slice\(\)/);
  assert.match(source, /urls: generatedUrls\.slice\(\)/);
  assert.match(source, /outputText: markdown/);
  assert.match(source, /text: markdown/);
});

test('compact form exposes science exhibit sections and references', () => {
  for (const file of ['src/config/exhibitionCompactForm.ts', 'backend/src/auth/exhibitionCompactForm.js']) {
    const source = read(file);
    assert.match(source, /nodeType: 'science-exhibit-design'/);
    assert.match(source, /id: 'science'/);
    assert.match(source, /id: 'background-mode'/);
    assert.match(source, /id: 'dimensions'/);
    assert.match(source, /id: 'color-material'/);
    assert.match(source, /id: 'preset-select'/);
    assert.match(source, /id: 'manual-input'/);
    assert.match(source, /id: 'size-input'/);
    assert.match(source, /id: 'language'/);
    assert.match(source, /id: 'drawings'/);
    assert.match(source, /id: 'references'/);
    assert.match(source, /id: 'space-reference'/);
    assert.match(source, /id: 'device-reference'/);
    assert.match(source, /id: 'parameter-table'/);
    assert.match(source, /id: 'prompt-preview'/);
  }
});
