import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXHIBITION_PLAN_LAYOUT_PRESETS,
  buildExhibitionPlanLayoutPrompt,
  buildExhibitionPlanOutlinePrompt,
  exhibitionPlanLayoutPresetText,
  formatExhibitionPlanOutline,
  normalizeExhibitionPlanLayoutPresetId,
  parseExhibitionPlanOutlineJson,
} from '../src/utils/exhibitionPlanLayoutPromptData.js';

test('exhibition plan layout prompt toggles route labels and descriptions', () => {
  const hidden = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '序厅：项目开篇\n产业展区：展示核心成果',
    layoutPresetId: 'one-way-loop',
    showRoute: false,
    showLabels: false,
    showDescriptions: false,
  });
  assert.match(hidden, /显示动线：关闭/);
  assert.match(hidden, /不要绘制箭头/);
  assert.match(hidden, /显示标注文字：关闭/);
  assert.match(hidden, /不要在图面上写展区名称/);
  assert.match(hidden, /显示说明文字：关闭/);
  assert.match(hidden, /不要加入说明框/);

  const visible = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '序厅：项目开篇',
    showRoute: true,
    showLabels: true,
    showDescriptions: true,
  });
  assert.match(visible, /显示动线：开启/);
  assert.match(visible, /显示标注文字：开启/);
  assert.match(visible, /显示说明文字：开启/);
});

test('exhibition plan layout prompt treats style reference as visual style only', () => {
  const prompt = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '城市记忆展区：老城历史',
    hasStyleReferenceImage: true,
  });
  assert.match(prompt, /图1是唯一建筑平面图依据/);
  assert.match(prompt, /图2只是平面布局图的视觉样式参考/);
  assert.match(prompt, /不得改变图1的建筑轮廓/);
  assert.doesNotMatch(prompt, /使用内置默认样式/);
});

test('exhibition plan layout prompt includes preset and custom requirement', () => {
  const prompt = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '核心展项：城市模型',
    layoutPresetId: 'highlight-core',
    layoutRequirement: '入口右侧设置接待台，尾厅靠近出口。',
  });
  assert.match(prompt, /围绕一个或多个核心展项组织空间/);
  assert.match(prompt, /入口右侧设置接待台/);
  assert.equal(normalizeExhibitionPlanLayoutPresetId('missing'), 'balanced');
  assert.ok(EXHIBITION_PLAN_LAYOUT_PRESETS.length >= 8);
  assert.match(exhibitionPlanLayoutPresetText('family-learning'), /研学/);
});

test('exhibition plan outline prompt and parser support json and text fallback', () => {
  const request = buildExhibitionPlanOutlinePrompt({
    sourceText: '第一章 城市源起。第二章 产业创新。',
    projectTheme: '城市发展馆',
  });
  assert.match(request, /提炼用于展陈平面自动布局/);
  assert.match(request, /城市发展馆/);

  const parsed = parseExhibitionPlanOutlineJson(JSON.stringify({
    title: '城市发展馆',
    zones: [
      { name: '城市源起', summary: '展示城市历史根脉。', priority: 1, areaHint: '入口附近', routeHint: '接序厅' },
    ],
  }));
  assert.equal(parsed.title, '城市发展馆');
  assert.equal(parsed.zones[0].name, '城市源起');
  assert.equal(parsed.zones[0].areaHint, '入口附近');

  const fallback = parseExhibitionPlanOutlineJson('序厅：建立第一印象\n产业创新：展示成果');
  assert.equal(fallback.zones.length, 2);
  assert.equal(fallback.zones[1].name, '产业创新');
  assert.match(formatExhibitionPlanOutline(parsed), /展览主题：城市发展馆/);
});
