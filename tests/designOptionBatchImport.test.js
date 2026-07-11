import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDesignOptionBatchItems, parseDesignOptionBatchText } from '../src/utils/designOptionBatchImport.js';

test('design option batch import accepts multilingual labels and prompt definitions', () => {
  const parsed = parseDesignOptionBatchText([
    '**historical-restoration**  **历史复原场景**  restore a historically accurate exhibition scene',
    'ritual-space\t仪式空间\t庄重的轴线构图与聚焦灯光',
  ].join('\n'));
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.items.map((item) => item.id), ['historical-restoration', 'ritual-space']);
});

test('design option batch import reports invalid rows and updates matching ids', () => {
  const parsed = parseDesignOptionBatchText('bad.id 无效 ID\nvalid-id 有效选项 useful prompt');
  assert.deepEqual(parsed.errors.map((item) => item.line), [1]);
  const merged = mergeDesignOptionBatchItems([{ id: 'valid-id', label: '旧名称', prompt: 'old', order: 0 }], parsed.items);
  assert.equal(merged.updated, 1);
  assert.equal(merged.items[0].label, '有效选项');
});
