import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
} from '../src/utils/advancedProviders.ts';
import {
  QODER_IMAGE_CONJURE_PROMPT_SCHEMA,
  exportQoderImagePromptPack,
  normalizeQoderImagePromptState,
} from '../src/utils/qoderImageConjure.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => fs.readFileSync(path.resolve(here, relative), 'utf8');

test('Qoder image workbench is registered independently across the canvas', () => {
  const types = read('../src/types/canvas.ts');
  const registry = read('../src/config/nodeRegistry.ts');
  const ports = read('../src/config/portTypes.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const node = read('../src/components/nodes/QoderImageConjureNode.tsx');
  assert.match(types, /'qoder-image-conjure'/);
  assert.match(types, /\| 'qoder'/);
  assert.match(registry, /label:\s*'Qoder 生图工作台'[\s\S]*category:\s*'qoder'/);
  assert.match(ports, /'qoder-image-conjure':\s*\{\s*inputs:\s*\['text', 'image'\],\s*outputs:\s*\['image', 'text'\]/);
  assert.match(canvas, /'qoder-image-conjure': QoderImageConjureNode/);
  assert.match(canvas, /qoderConjureMaterialOrder:\s*\[\]/);
  assert.match(node, /runtime="qoder"/);
});

test('Qoder prompt packs use an independent schema', () => {
  const state = normalizeQoderImagePromptState({ templates: [], snippets: [] });
  const pack = exportQoderImagePromptPack(state);
  assert.equal(QODER_IMAGE_CONJURE_PROMPT_SCHEMA, 't8-qoder-image-conjure-prompts');
  assert.equal(pack.schema, QODER_IMAGE_CONJURE_PROMPT_SCHEMA);
});

test('image providers preserve configured order and default to their first image model', () => {
  const providers: any[] = [
    { id: 'disabled', protocol: 'openai-compatible', enabled: false, imageModels: ['skip'] },
    { id: 'first', label: 'First', protocol: 'modelscope', enabled: true, imageModels: ['model-a', 'model-b'], defaults: {} },
    { id: 'second', label: 'Second', protocol: 'volcengine', enabled: true, imageModels: ['model-c'], defaults: {} },
  ];
  const available = advancedProvidersForNode(providers, 'image');
  assert.deepEqual(available.map((item) => item.id), ['first', 'second']);
  assert.equal(advancedProviderModelOptions(available[0], 'image')[0], 'model-a');
});

test('Qoder node forces CLI orchestration while persisting the selected provider', () => {
  const source = read('../src/components/nodes/CodexImageConjureNode.tsx');
  assert.match(source, /streamQoderImageConjure/);
  assert.match(source, /providerSource:\s*activeExternalSelection\.providerSource/);
  assert.match(source, /providerModel:\s*externalProviderModel/);
  assert.match(source, /Qoder Agent 模型/);
  assert.match(source, /生图模型/);
  assert.match(source, /data-qoder-image-conjure-root/);
});

