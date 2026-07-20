import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Node } from '@xyflow/react';
import { getNodePortTypesForHandle, resolveConnectionPickerHandleId } from '../src/utils/connectionHandles.ts';
import { resolveConnectionByNodeSerialId } from '../src/utils/connectByNodeSerialId.ts';

const promptReverse = {
  id: 'prompt-reverse-a',
  type: 'prompt-reverse',
  position: { x: 0, y: 0 },
  data: { nodeSerialId: 1 },
} as Node;

const fhl = {
  id: 'fhl-b',
  type: 'fhl-image-gen',
  position: { x: 200, y: 0 },
  data: { nodeSerialId: 2 },
} as Node;

test('FHL handle ids resolve to their actual port types', () => {
  assert.deepEqual(getNodePortTypesForHandle(fhl, 'target', 'text'), ['text']);
  assert.deepEqual(getNodePortTypesForHandle(fhl, 'target', 'fixed'), ['image']);
  assert.deepEqual(getNodePortTypesForHandle(fhl, 'target', 'items'), ['image']);
  assert.deepEqual(getNodePortTypesForHandle(fhl, 'source', 'text'), ['text']);
});

test('prompt reverse keeps the legacy image handle and exposes a text-only content handle', () => {
  assert.deepEqual(getNodePortTypesForHandle(promptReverse, 'target', null), ['image']);
  assert.deepEqual(getNodePortTypesForHandle(promptReverse, 'target', 'content-text'), ['text']);
  assert.equal(resolveConnectionPickerHandleId('prompt-reverse', 'target', 'image'), null);
  assert.equal(resolveConnectionPickerHandleId('prompt-reverse', 'target', 'text'), 'content-text');
});

test('connection picker chooses concrete FHL handles', () => {
  assert.equal(resolveConnectionPickerHandleId('fhl-image-gen', 'target', 'text'), 'text');
  assert.equal(resolveConnectionPickerHandleId('fhl-image-gen', 'target', 'image'), 'fixed');
  assert.equal(resolveConnectionPickerHandleId('fhl-image-gen', 'source', 'text'), 'text');
});

test('canvas picker preserves the dragged handle and applies the matched target handle', () => {
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  assert.match(canvas, /fromHandleId:\s*from\.handleId/);
  assert.match(canvas, /sourceHandle:\s*picker\.fromHandleId/);
  assert.match(canvas, /targetHandle:\s*resolveConnectionPickerHandleId\(meta\.type, 'target', matched\)/);
});

test('NodeID connection from prompt reverse targets the FHL text handle immediately', () => {
  assert.deepEqual(resolveConnectionByNodeSerialId({
    nodes: [promptReverse, fhl],
    edges: [],
    fromNodeId: promptReverse.id,
    fromHandleType: 'source',
    fromHandleId: null,
    nodeSerialInput: '2',
  }), {
    ok: true,
    connection: {
      source: promptReverse.id,
      sourceHandle: null,
      target: fhl.id,
      targetHandle: 'text',
    },
  });
});
