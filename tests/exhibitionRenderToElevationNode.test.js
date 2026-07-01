import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('render to elevation node is registered in canvas, ports, types and sidebar', () => {
  const types = readFileSync(new URL('../src/types/canvas.ts', import.meta.url), 'utf8');
  const ports = readFileSync(new URL('../src/config/portTypes.ts', import.meta.url), 'utf8');
  const registry = readFileSync(new URL('../src/config/nodeRegistry.ts', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  const permissions = readFileSync(new URL('../backend/src/auth/toolPermissions.js', import.meta.url), 'utf8');
  const proxy = readFileSync(new URL('../backend/src/routes/proxy.js', import.meta.url), 'utf8');
  assert.match(types, /'exhibition-render-to-elevation'/);
  assert.match(ports, /'exhibition-render-to-elevation':\s*\{\s*inputs:\s*\['text', 'image'\],\s*outputs:\s*\['image'\]\s*\}/);
  assert.match(registry, /type: 'exhibition-render-to-elevation'/);
  assert.match(registry, /效果图转立面/);
  assert.match(canvas, /import ExhibitionRenderToElevationNode/);
  assert.match(canvas, /'exhibition-render-to-elevation': ExhibitionRenderToElevationNode/);
  assert.match(permissions, /'exhibition-render-to-elevation'/);
  assert.match(proxy, /\/image\/submit[\s\S]*'exhibition-render-to-elevation'/);
  assert.match(proxy, /\/image\/status\/:tid[\s\S]*'exhibition-render-to-elevation'/);
});

test('render to elevation node default data includes model and result fields', () => {
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  assert.match(canvas, /'exhibition-render-to-elevation': \{/);
  assert.match(canvas, /model: 'gpt-image-2'/);
  assert.match(canvas, /apiModel: 'gpt-image-2-all'/);
  assert.match(canvas, /llmKeyId: ''/);
  assert.match(canvas, /llmModel: ''/);
  assert.match(canvas, /providerSource: 'zhenzhen'/);
  assert.match(canvas, /img2imgModeEnabled: true/);
  assert.match(canvas, /aspectRatio: '16:9'/);
  assert.match(canvas, /sizeLevel: '2K'/);
  assert.match(canvas, /seed: 0/);
  assert.match(canvas, /parsedElevations: \[\]/);
  assert.match(canvas, /elevationResults: \[\]/);
  assert.match(canvas, /imageNames: \[\]/);
});

test('render to elevation component exposes text and image handles', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionRenderToElevationNode.tsx', import.meta.url), 'utf8');
  assert.match(node, /id="document-text"/);
  assert.match(node, /id="reference-image"/);
  assert.match(node, /id="elevation-form-reference"/);
  assert.match(node, /useInputTextByHandle\(id, 'document-text'\)/);
  assert.match(node, /useInputImageByHandle\(id, 'reference-image'\)/);
  assert.match(node, /useInputImageByHandle\(id, 'elevation-form-reference'\)/);
  assert.match(node, /parseElevationSectionsFromText/);
  assert.match(node, /buildRenderToElevationAnalysisMessages/);
  assert.match(node, /buildRenderToElevationImagePrompt/);
  assert.match(node, /img2imgModeEnabled = d\.img2imgModeEnabled !== false/);
  assert.match(node, /img2imgModeEnabled,/);
  assert.match(node, /referenceToken: '@img1'/);
  assert.match(node, /formReferenceToken: formReferenceImage \? '@img2' : ''/);
  assert.match(node, /generationImages = \[referenceImage, formReferenceImage\]\.filter\(Boolean\)/);
  assert.match(node, /images: generationImages/);
  assert.match(node, /立面形式参考图/);
  assert.match(node, /图生图模式/);
  assert.match(node, /submitImageAsync/);
  assert.match(node, /generateExternalImage/);
});

test('render to elevation supplement uses stable prompt textarea for IME input', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionRenderToElevationNode.tsx', import.meta.url), 'utf8');
  assert.match(node, /import PromptTextarea from '\.\.\/PromptTextarea'/);
  assert.match(node, /<PromptTextarea[\s\S]*value=\{String\(d\.supplement \|\| ''\)\}[\s\S]*onValueChange=\{\(value\) => update\(\{ supplement: value \}\)\}/);
});

test('render to elevation node supports action bar, compact form and canvas dragging', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionRenderToElevationNode.tsx', import.meta.url), 'utf8');
  const actionBar = readFileSync(new URL('../src/components/NodeActionBar.tsx', import.meta.url), 'utf8');
  const compact = readFileSync(new URL('../src/config/exhibitionCompactForm.ts', import.meta.url), 'utf8');
  const backendCompact = readFileSync(new URL('../backend/src/auth/exhibitionCompactForm.js', import.meta.url), 'utf8');
  assert.match(actionBar, /'exhibition-render-to-elevation'/);
  assert.match(compact, /nodeType: 'exhibition-render-to-elevation'/);
  assert.match(backendCompact, /nodeType: 'exhibition-render-to-elevation'/);
  assert.match(node, /data-exhibition-compact-section="input"/);
  assert.match(node, /data-exhibition-compact-section="model"/);
  assert.match(node, /data-exhibition-compact-section="result"/);
  assert.doesNotMatch(node, /<div className="nodrag nopan space-y-3 p-3 text-white">/);
});
