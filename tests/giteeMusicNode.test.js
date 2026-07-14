import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relative) {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
}

test('ACE-Step music node is registered with text input and audio output', () => {
  const types = read('src/types/canvas.ts');
  const registry = read('src/config/nodeRegistry.ts');
  const ports = read('src/config/portTypes.ts');
  const canvas = read('src/components/Canvas.tsx');

  assert.match(types, /\| 'gitee-music'/);
  assert.match(registry, /type: 'gitee-music'[\s\S]*ACE-Step-v1-3\.5B/);
  assert.match(ports, /'gitee-music':\s*\{\s*inputs:\s*\['text'\],\s*outputs:\s*\['audio'\]\s*\}/);
  assert.match(canvas, /'gitee-music': GiteeMusicNode/);
});

test('ACE-Step node calls backend proxy with official async music parameters', () => {
  const node = read('src/components/nodes/GiteeMusicNode.tsx');
  const service = read('src/services/generation.ts');
  const route = read('backend/src/routes/externalProviders.js');
  const provider = read('backend/src/providers/giteeFlux.js');

  assert.match(node, /generateExternalMusic\(\{/);
  assert.match(node, /providerModel: MODEL/);
  assert.match(node, /lyrics: lyrics\.trim\(\)/);
  assert.match(service, /fetch\('\/api\/proxy\/external\/music'/);
  assert.match(route, /router\.post\('\/music'/);
  assert.match(provider, /\/async\/music\/generations/);
  assert.match(provider, /task:\s*'text2music'/);
  assert.match(provider, /\/task\/\$\{encodeURIComponent\(id\)\}/);
});
