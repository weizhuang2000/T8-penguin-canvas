import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionPrompt,
  presetTextForDimension,
} from '../src/utils/exhibitionPromptData.js';

test('exhibition prompt skips empty dimensions and outputs Chinese control text', () => {
  const prompt = buildExhibitionPrompt({
    spaceType: presetTextForDimension('spaceType', 'museum'),
    functionalZones: '',
    exhibitionCraft: presetTextForDimension('exhibitionCraft', 'showcase'),
    negativeItems: presetTextForDimension('negativeItems', 'no-bad-text'),
    supplement: '重点突出宋代瓷器',
  });

  assert.match(prompt, /生成一张专业的展陈设计效果图/);
  assert.match(prompt, /空间类型：博物馆展厅/);
  assert.match(prompt, /展陈工艺：恒温恒湿展柜/);
  assert.match(prompt, /排除项：避免乱码文字/);
  assert.match(prompt, /特别要求：重点突出宋代瓷器/);
  assert.equal(prompt.includes('用户补充：'), false);
  assert.equal(prompt.includes('功能分区：'), false);
});

test('exhibition prompt includes upstream text and reference image instruction', () => {
  const prompt = buildExhibitionPrompt({
    colorSystem: '深色背景，暖金色重点光',
    upstreamText: '上游补充：入口需要品牌 LOGO',
    hasReferenceImages: true,
  });

  assert.match(prompt, /色彩体系：深色背景，暖金色重点光/);
  assert.match(prompt, /补充需求：上游补充：入口需要品牌 LOGO/);
  assert.match(prompt, /参考图说明：参考上游或本地参考图/);
});
