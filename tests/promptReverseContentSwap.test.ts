import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptReverseContentSwapMessages, cleanPromptReverseContentSwapOutput } from '../src/utils/promptReverse.ts';

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
  assert.match(String(messages[0].content), /准确解析文字层级/);
  assert.match(String(messages[0].content), /主标题最大最醒目/);
  assert.match(String(messages[0].content), /严禁在最终提示词中出现或保留/);
  assert.match(String(messages[1].content), /明确列出应显示的实际文字/);
  assert.match(String(messages[1].content), /低机位广角摄影/);
  assert.match(String(messages[1].content), /LUNAR GARDEN/);
});

test('content swap output rewrites weak or unreadable text instructions', () => {
  const output = cleanPromptReverseContentSwapOutput('海报顶部放置主标题“月球花园”，但不必清晰可读；副标题无需清晰可读；下方使用占位文字，文字不可辨识。Do not generate readable text. No legible text.');

  assert.doesNotMatch(output, /但不必清晰可读|无需清晰可读|占位文字|文字不可辨识|do not generate readable text|no legible text/i);
  assert.match(output, /主标题“月球花园”/);
  assert.match(output, /确保清晰可读/);
  assert.match(output, /文字必须清晰可读/);
  assert.match(output, /明确且清晰可读的实际文字/);
  assert.match(output, /文字清晰可辨/);
  assert.match(output, /generate clear, legible text/i);
});
