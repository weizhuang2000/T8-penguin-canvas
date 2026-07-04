import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Canvas remembers viewport per current user and canvas in local storage', () => {
  const app = read('src/App.tsx');
  const canvas = read('src/components/Canvas.tsx');

  assert.match(app, /currentUserId=\{authUser\.id\}/);
  assert.match(canvas, /currentUserId\?:\s*string\s*\|\s*null/);
  assert.match(canvas, /USER_CANVAS_VIEWPORT_STORAGE_PREFIX\s*=\s*'t8:canvas-viewport:v1'/);
  assert.match(canvas, /encodeURIComponent\(userId\)[\s\S]*encodeURIComponent\(canvasId\)/);
  assert.match(canvas, /function readUserCanvasViewport/);
  assert.match(canvas, /function writeUserCanvasViewport/);
  assert.match(canvas, /onMoveEnd=\{handleMoveEnd\}/);
  assert.match(canvas, /writeUserCanvasViewport\(currentUserId,\s*activeId,\s*viewport\)/);
  assert.match(canvas, /readUserCanvasViewport\(currentUserId,\s*requestedCanvasId\)\s*\|\|\s*normalizeRememberedViewport\(data\.viewport\)/);
  assert.match(canvas, /pendingSendFocusRef\.current\?\.canvasId === requestedCanvasId[\s\S]*\?\s*null/);
});
