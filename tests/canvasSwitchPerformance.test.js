import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('shared canvas boot requests are deduplicated and cached', () => {
  const api = read('src/services/api.ts');

  assert.match(api, /cachedSharedGet<AuthUser \| null>\(AUTH_ME_CACHE_KEY/);
  assert.match(api, /cachedSharedGet\(ELEVATION_PRESETS_CACHE_KEY/);
  assert.match(
    api,
    /const inFlight = pendingCanvasDataRequests\.get\(id\);[\s\S]*if \(inFlight\)[\s\S]*if \(!options\?\.force\)/,
  );
});

test('large canvas cache persistence is deferred away from the interaction path', () => {
  const api = read('src/services/api.ts');

  assert.match(api, /MAX_PERSISTED_CANVAS_CACHE_CHARS/);
  assert.match(api, /window\.requestIdleCallback\(run, \{ timeout: 2_000 \}\)/);
  assert.match(api, /serialized\.length > MAX_PERSISTED_CANVAS_CACHE_CHARS/);
});

test('restored output nodes do not replay historical save-to-disk requests', () => {
  const outputNode = read('src/components/nodes/OutputNode.tsx');

  assert.match(
    outputNode,
    /if \(savedUrls === null\) \{[\s\S]*savedUrlsRef\.current = new Set\(all\);[\s\S]*return;[\s\S]*const fresh/,
  );
});

test('canvas snapshot serialization happens after the autosave debounce', () => {
  const canvas = read('src/components/Canvas.tsx');

  assert.match(
    canvas,
    /const timer = window\.setTimeout\(async \(\) => \{[\s\S]*snapshot = JSON\.stringify\(\{ nodes: persistNodes/,
  );
  assert.match(canvas, /lastSavedNodeCountByCanvasRef/);
  assert.doesNotMatch(canvas, /JSON\.parse\(previousSnapshot/);
});
