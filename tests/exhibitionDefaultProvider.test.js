import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('new exhibition image generation nodes default to first advanced image provider', () => {
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(canvas, /useApiKeysStore\(\(state\) => state\.settings\.advancedProviders\)/);
  assert.match(canvas, /EXHIBITION_IMAGE_PROVIDER_NODE_TYPES/);
  for (const type of [
    'exhibition-img2img',
    'exhibition-style-transfer',
    'exhibition-recolor',
    'exhibition-lighting-heatmap',
    'exhibition-creative-image',
    'exhibition-render-to-elevation',
    'exhibition-plan-layout',
    'exhibition-ai-plan-layout',
    'unit-panel-design',
    'showcase-interior-design',
  ]) {
    assert.match(canvas, new RegExp(`'${type}'`));
  }
  assert.match(canvas, /advancedProvidersForNode\(providers, 'image'\)\[0\]/);
  assert.match(canvas, /advancedProviderModelOptions\(provider, 'image'\)/);
  assert.match(canvas, /providerSource: provider\.protocol/);
  assert.match(canvas, /providerId: provider\.id/);
  assert.match(canvas, /providerModel: models\[0\] \|\| ''/);
  assert.match(canvas, /initialDataForNodeType\(type, advancedProviders\)/);
  assert.match(canvas, /initialDataForNodeType\(meta\.type, advancedProviders\)/);
});
