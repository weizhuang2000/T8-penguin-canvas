import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionAiPlanInterpretationPrompt,
  buildExhibitionAiPlanLayoutPrompt,
} from '../src/utils/exhibitionPlanLayoutPromptData.js';

test('exhibition AI plan layout interpretation prompt asks LLM to read fixed building structure', () => {
  const prompt = buildExhibitionAiPlanInterpretationPrompt({
    outlineText: '序厅：城市起源\n主展区：产业创新',
    planInterpretation: '蓝色线为墙体，灰色方块为柱子',
  });

  assert.match(prompt, /读取图1原始建筑平面图/);
  assert.match(prompt, /墙体、柱子、外轮廓、门洞、入口、出口/);
  assert.match(prompt, /不可动结构/);
  assert.match(prompt, /可布局范围/);
  assert.match(prompt, /蓝色线为墙体/);
  assert.match(prompt, /产业创新/);
});

test('exhibition AI plan layout prompt includes style, special requirements, and hard lock constraints', () => {
  const prompt = buildExhibitionAiPlanLayoutPrompt({
    layoutOutlineText: '序厅：城市起源\n主展区：产业创新',
    planAiInterpretation: '不可动结构解析：外墙、柱网、入口出口都不能移动。',
    styleRequirement: '科技馆蓝白线稿汇报风',
    specialRequirement: '入口右侧设置接待区，动线单向无分叉',
    layoutPresetId: 'balanced',
    structureLock: true,
    showRoute: true,
    showLabels: true,
    showDescriptions: true,
  });

  assert.match(prompt, /AI floor plan layout mode/);
  assert.match(prompt, /图1是唯一建筑平面依据/);
  assert.match(prompt, /墙体、柱子、外轮廓、门洞、入口出口不可移动、不可删除、不可重绘/);
  assert.match(prompt, /只能在可布展区域内叠加展陈布局元素/);
  assert.match(prompt, /透明背景 overlay/);
  assert.match(prompt, /科技馆蓝白线稿汇报风/);
  assert.match(prompt, /入口右侧设置接待区/);
  assert.match(prompt, /不可动结构解析/);
});
