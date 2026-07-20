import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptReverseContentSwapMessages } from '../src/utils/promptReverse.ts';

test('content swap prompt keeps visual form while replacing semantic and visible text content', () => {
  const messages = buildPromptReverseContentSwapMessages({
    prompt: '低机位广角摄影，一名厨师站在红色餐车前，霓虹招牌写着“OLD”。',
    contentText: '月球温室里的植物学家，标题文字为“LUNAR GARDEN”。',
    language: 'zh',
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(String(messages[0].content), /严格保留原提示词的视觉形式/);
  assert.match(String(messages[0].content), /彻底替换原提示词的语义内容/);
  assert.match(String(messages[0].content), /招牌文案和其它可见文字/);
  assert.match(String(messages[1].content), /低机位广角摄影/);
  assert.match(String(messages[1].content), /LUNAR GARDEN/);
});
