import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('render to elevation node is registered in canvas, ports, types and sidebar', () => {
  const types = readFileSync(new URL('../src/types/canvas.ts', import.meta.url), 'utf8');
  const ports = readFileSync(new URL('../src/config/portTypes.ts', import.meta.url), 'utf8');
  const registry = readFileSync(new URL('../src/config/nodeRegistry.ts', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  assert.match(types, /'exhibition-render-to-elevation'/);
  assert.match(ports, /'exhibition-render-to-elevation':\s*\{\s*inputs:\s*\['text', 'image'\],\s*outputs:\s*\['image'\]\s*\}/);
  assert.match(registry, /type: 'exhibition-render-to-elevation'/);
  assert.match(registry, /效果图转立面/);
  assert.match(canvas, /import ExhibitionRenderToElevationNode/);
  assert.match(canvas, /'exhibition-render-to-elevation': ExhibitionRenderToElevationNode/);
});

test('render to elevation node default data includes model and result fields', () => {
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  assert.match(canvas, /'exhibition-render-to-elevation': \{/);
  assert.match(canvas, /model: 'gpt-image-2'/);
  assert.match(canvas, /apiModel: 'gpt-image-2-all'/);
  assert.match(canvas, /llmKeyId: ''/);
  assert.match(canvas, /llmModel: ''/);
  assert.match(canvas, /providerSource: 'zhenzhen'/);
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
  assert.match(node, /useInputTextByHandle\(id, 'document-text'\)/);
  assert.match(node, /useInputImageByHandle\(id, 'reference-image'\)/);
  assert.match(node, /parseElevationSectionsFromText/);
  assert.match(node, /buildRenderToElevationAnalysisMessages/);
  assert.match(node, /buildRenderToElevationImagePrompt/);
  assert.match(node, /submitImageAsync/);
  assert.match(node, /generateExternalImage/);
});
