import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeScienceExhibitOptionBatchItems,
  parseScienceExhibitOptionBatchText,
} from '../src/utils/scienceExhibitOptionBatchImport.js';

test('science exhibit option batch parser accepts supported separators and markdown bold fields', () => {
  const parsed = parseScienceExhibitOptionBatchText([
    '**slider-control**　**滑杆调节**　visitor moves physical sliders to adjust variables and observes immediate changes',
    'knob-control\t旋钮调节\tvisitor rotates knobs to fine-tune frequency and intensity',
    'lever-control 拉杆控制 visitor pulls or pushes levers  to initiate mechanical actions',
  ].join('\n'));
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.items.map(({ id, label }) => ({ id, label })), [
    { id: 'slider-control', label: '滑杆调节' },
    { id: 'knob-control', label: '旋钮调节' },
    { id: 'lever-control', label: '拉杆控制' },
  ]);
  assert.equal(parsed.items[2].prompt, 'visitor pulls or pushes levers  to initiate mechanical actions');
});

test('science exhibit option batch parser skips invalid rows and reports physical line numbers', () => {
  const parsed = parseScienceExhibitOptionBatchText([
    'bad.id 中文名称 valid english prompt',
    'valid-id EnglishName valid english prompt',
    '',
    'no-english 中文名称 12345',
    'valid-row 有效名称 visitor observes immediate feedback',
  ].join('\n'));
  assert.deepEqual(parsed.items.map((item) => item.id), ['valid-row']);
  assert.deepEqual(parsed.errors.map((item) => item.line), [1, 2, 4]);
  assert.match(parsed.errors[0].message, /ID/);
  assert.match(parsed.errors[1].message, /中文/);
  assert.match(parsed.errors[2].message, /Prompt/);
});

test('science exhibit option batch parser keeps the last row for duplicate ids', () => {
  const parsed = parseScienceExhibitOptionBatchText([
    'slider-control 滑杆调节 visitor moves a slider',
    'slider-control 推拉滑杆 visitor moves a physical slider and observes live feedback',
  ].join('\n'));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].label, '推拉滑杆');
  assert.match(parsed.items[0].prompt, /live feedback/);
});

test('science exhibit option batch merge appends new ids and updates existing ids in place', () => {
  const existing = [
    { id: 'slider-control', label: '旧名称', prompt: 'old prompt', order: 0, draftId: 'keep-draft' },
    { id: 'touch-screen', label: '触控选择', prompt: 'touch prompt', order: 1, draftId: 'touch-draft' },
  ];
  const imported = [
    { id: 'slider-control', label: '滑杆调节', prompt: 'new slider prompt', order: 0, draftId: 'import-slider' },
    { id: 'lever-control', label: '拉杆控制', prompt: 'new lever prompt', order: 1, draftId: 'import-lever' },
  ];
  const merged = mergeScienceExhibitOptionBatchItems(existing, imported);
  assert.equal(merged.added, 1);
  assert.equal(merged.updated, 1);
  assert.deepEqual(merged.items.map((item) => item.id), ['slider-control', 'touch-screen', 'lever-control']);
  assert.equal(merged.items[0].draftId, 'keep-draft');
  assert.equal(merged.items[0].label, '滑杆调节');
  assert.equal(merged.items[2].order, 2);
});
