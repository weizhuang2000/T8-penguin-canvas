import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relative) {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
}

test('FHL image generation node uses IME-safe prompt textareas', () => {
  const node = read('src/components/nodes/FhlImageGenNode.tsx');

  assert.match(node, /import PromptTextarea from '\.\.\/PromptTextarea'/);
  assert.match(node, /title="FHL 提示词"[\s\S]*value=\{String\(d\.fhlPrompt \|\| ''\)\}[\s\S]*onValueChange=\{\(value\) => update\(\{ fhlPrompt: value \}\)\}/);
  assert.match(node, /title="FHL 批量提示词"[\s\S]*value=\{String\(d\.fhlBatchPrompts \|\| ''\)\}[\s\S]*onValueChange=\{\(value\) => update\(\{ fhlBatchPrompts: value \}\)\}/);
  assert.match(node, /title="FHL 工作流场景模板"[\s\S]*value=\{String\(d\.fhlTemplatesText \|\| ''\)\}[\s\S]*onValueChange=\{\(value\) => update\(\{ fhlTemplatesText: value \}\)\}/);
  assert.doesNotMatch(node, /<textarea\b/);
});
