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

test('output nodes do not automatically save duplicate local copies', () => {
  const outputNode = read('src/components/nodes/OutputNode.tsx');

  assert.doesNotMatch(outputNode, /saveAssetToDisk/);
  assert.doesNotMatch(outputNode, /自动保存到本地路径/);
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

test('ReactFlow runtime measurements do not count as canvas changes', () => {
  const canvas = read('src/components/Canvas.tsx');

  assert.match(canvas, /function canvasNodeForPersistence/);
  assert.match(canvas, /delete persisted\.measured/);
  assert.match(canvas, /delete persisted\.positionAbsolute/);
  assert.match(canvas, /lastSavedByCanvasRef\.current\.set\(requestedCanvasId, JSON\.stringify/);
});

test('canvas saves are serialized and retry a transient proxy failure once', () => {
  const api = read('src/services/api.ts');

  assert.match(api, /const canvasSaveQueues = new Map/);
  assert.match(api, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(api, /error\?\.name === 'ApiNetworkError'/);
  assert.match(api, /服务器或反向代理暂时不可用/);
});

test('refresh restores the active canvas per user instead of picking the newest canvas', () => {
  const store = read('src/stores/canvas.ts');
  const sidebar = read('src/components/Sidebar.tsx');

  assert.match(store, /ACTIVE_CANVAS_STORAGE_PREFIX/);
  assert.match(store, /readStoredActiveCanvas\(userId\)/);
  assert.match(store, /writeStoredActiveCanvas\(get\(\)\.userId, id\)/);
  assert.match(sidebar, /loadCanvases\(\{ userId: currentUserId \}\)/);
});

test('switching canvas immediately detaches the previous canvas nodes', () => {
  const canvas = read('src/components/Canvas.tsx');

  assert.match(canvas, /const flowNodes = canvasContentMatchesActive \? nodes : \[\]/);
  assert.match(canvas, /nodes=\{flowNodes\}/);
  assert.match(canvas, /setNodes\(\[\]\);[\s\S]*setEdges\(\[\]\);[\s\S]*histReset\(\)/);
  assert.match(canvas, /finishHydration/);
  assert.doesNotMatch(canvas, /setLoadedCanvasId\(requestedCanvasId\);\s*setLoaded\(true\);\s*\}\);/);
});

test('backend health probes are deduplicated under React StrictMode', () => {
  const api = read('src/services/api.ts');

  assert.match(api, /let pendingBackendStatusRequest: Promise<boolean> \| null = null/);
  assert.match(api, /if \(pendingBackendStatusRequest\) return pendingBackendStatusRequest/);
});
