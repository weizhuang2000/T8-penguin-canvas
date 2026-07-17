import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('image compare node uses exclusive upper and lower inputs', () => {
  const canvas = read('src/components/Canvas.tsx');
  const node = read('src/components/nodes/ImageCompareNode.tsx');

  assert.match(canvas, /targetType === 'image-compare'[\s\S]*handle === 'a' \|\| handle === 'b'[\s\S]*return \[handle\]/);
  assert.match(node, /if \(c\.targetHandle === 'a'\)/);
  assert.match(node, /else if \(c\.targetHandle === 'b'\)/);
  assert.doesNotMatch(node, /autoCandidates/);
  assert.doesNotMatch(node, /allCandidates/);
  assert.match(node, /labels=\{\['上接口', '下接口'\]\}/);
  assert.match(node, /请分别连接上接口和下接口图像/);
});

test('image compare slider divider is draggable and labels both sides', () => {
  const stage = read('src/components/ImageCompareStage.tsx');
  const node = read('src/components/nodes/ImageCompareNode.tsx');

  assert.match(stage, /onSplitChange\?: \(split: number\) => void/);
  assert.match(stage, /updateSplitFromPointer/);
  assert.match(stage, /onPointerDown=\{beginSplitDrag\}/);
  assert.match(stage, /role="slider"/);
  assert.match(stage, /src=\{mode === 'slider' \? after : before\}/);
  assert.match(stage, /src=\{before\}/);
  assert.match(stage, /bottom-2 left-2[\s\S]*\{labels\[0\]\}/);
  assert.match(stage, /bottom-2 right-2[\s\S]*\{labels\[1\]\}/);
  assert.match(node, /onSplitChange=\{\(nextSplit\) => update\(\{ split: nextSplit \}\)\}/);
});
