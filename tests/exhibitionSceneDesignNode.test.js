import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition scene design node is registered in frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-scene-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-scene-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /label: '场景设计'/);
  assert.match(read('src/components/Canvas.tsx'), /ExhibitionSceneDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-scene-design': ExhibitionSceneDesignNode/);
  assert.match(read('src/components/Canvas.tsx'), /sceneCategory: 'historical-restoration'/);
  assert.match(read('src/components/Canvas.tsx'), /presentationForm: 'realistic-reconstruction'/);
  assert.match(read('src/components/Canvas.tsx'), /spatialScale: 'room-corner'/);
  assert.match(read('src/components/Canvas.tsx'), /peoplePropsMentions: \[\]/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-scene-design': \{ inputs: \['text', 'image'\], outputs: \['image'\] \}/);
  assert.match(read('src/utils/nodePlacement.ts'), /'exhibition-scene-design': \{ w: 640, h: 760 \}/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'exhibition-scene-design'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-scene-design'/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /nodeType: 'exhibition-scene-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /nodeType: 'exhibition-scene-design'/);
});

test('exhibition scene component exposes dedicated handles and @ mention controls', () => {
  const source = read('src/components/nodes/ExhibitionSceneDesignNode.tsx');
  assert.match(source, /id="text"/);
  assert.match(source, /id="environment-reference"/);
  assert.match(source, /id="people-props"/);
  assert.match(source, /MentionPromptInput/);
  assert.match(source, /resolveMediaMentions/);
  assert.match(source, /peoplePropsMentions/);
  assert.match(source, /peoplePropsText/);
  assert.match(source, /buildExhibitionSceneExtractPrompt/);
  assert.match(source, /buildExhibitionSceneImagePrompt/);
  assert.match(source, /parseExhibitionSceneExtractJson/);
  assert.match(source, /generateLlm/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /submitImageAsync/);
});

test('exhibition scene text fields use stable prompt textarea for IME input', () => {
  const source = read('src/components/nodes/ExhibitionSceneDesignNode.tsx');
  assert.match(source, /import PromptTextarea from '\.\.\/PromptTextarea'/);
  for (const field of ['sourceText', 'titleText', 'themeText', 'sceneText', 'interactionText']) {
    assert.match(source, new RegExp(`<PromptTextarea[\\s\\S]*value=\\{${field}\\}[\\s\\S]*onValueChange=\\{\\(value\\) => update\\(\\{ ${field}: value \\}\\)\\}`));
  }
  assert.doesNotMatch(source, /<textarea[\s\S]*value=\{(?:sourceText|sceneText|interactionText)\}/);
  assert.doesNotMatch(source, /<input className=\{FIELD\} value=\{(?:titleText|themeText)\}/);
});

test('scene image generation passes environment then people props references in order', () => {
  const source = read('src/components/nodes/ExhibitionSceneDesignNode.tsx');
  assert.match(source, /const referenceImages = \[\.\.\.environmentReferenceImages, \.\.\.peoplePropsReferenceImages\]/);
  assert.match(source, /images: referenceImages/);
  assert.match(source, /referenceImages: previewReferenceImages/);
  assert.match(source, /environmentReferenceImages/);
  assert.match(source, /peoplePropsReferenceImages/);
  assert.match(source, /@img\{environmentReferenceImages\.length \+ index \+ 1\}/);
  assert.match(source, /mentionToken: `@img\$\{environmentReferenceImages\.length \+ index \+ 1\}`/);
  assert.match(source, /\[environmentReferenceImages\.length, peoplePropsReferenceItems\]/);
  assert.doesNotMatch(source, /color-material-reference/);
  assert.doesNotMatch(source, /EXHIBITION_COLOR_MATERIAL_REFERENCE_COLOR/);
});

test('canvas connection handling keeps environment separate and allows people props multi-source', () => {
  const canvas = read('src/components/Canvas.tsx');
  assert.match(canvas, /targetType === 'exhibition-scene-design'\s*&& handle === 'environment-reference'/);
  assert.doesNotMatch(canvas, /targetType === 'exhibition-scene-design'\s*&& \(handle === 'environment-reference' \|\| handle === 'people-props'\)/);
});

test('compact form exposes scene design sections and reference items', () => {
  const frontend = read('src/config/exhibitionCompactForm.ts');
  const backend = read('backend/src/auth/exhibitionCompactForm.js');
  for (const source of [frontend, backend]) {
    assert.match(source, /nodeType: 'exhibition-scene-design'/);
    assert.match(source, /id: 'scene'/);
    assert.match(source, /id: 'language'/);
    assert.match(source, /id: 'references'/);
    assert.match(source, /id: 'environment-reference'/);
    assert.match(source, /id: 'people-props'/);
    assert.match(source, /id: 'prompt-preview'/);
  }
});
