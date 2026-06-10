import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeSpaceType,
} from '../src/utils/exhibitionCreativeImagePromptData.js';

test('exhibition creative image prompt locks the single input space image', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'highlight-space',
    projectTheme: '城市更新',
    inspiration: '用旧厂房钢结构和数字光幕形成记忆点',
    creativeBrief: '以一条悬浮时间轴串联城市记忆，中央设置可步入式光盒装置。',
    generationCount: 4,
  });
  assert.match(prompt, /重亮点展项空间/);
  assert.match(prompt, /输入图像是唯一的室内建筑空间依据/);
  assert.match(prompt, /必须保留原图的空间几何、透视角度、层高尺度/);
  assert.match(prompt, /不得把空间改成另一处建筑/);
  assert.match(prompt, /最终画面必须看得出来自同一张输入室内空间图/);
  assert.match(prompt, /城市更新/);
  assert.match(prompt, /旧厂房钢结构/);
});

test('exhibition creative brief prompt supports per-run LLM variation', () => {
  const prompt = buildExhibitionCreativeBriefPrompt({
    spaceType: 'intro-hall',
    projectTheme: '企业创新展',
    inspiration: '入口需要强仪式感',
    roundIndex: 2,
    total: 5,
    previousBriefs: ['使用环形光幕形成开场。'],
    regenerateEachTime: true,
  });
  assert.match(prompt, /第 2\/5 个序厅展陈空间生图创意描述/);
  assert.match(prompt, /项目主题\/展览关键词：企业创新展/);
  assert.match(prompt, /个人灵感补充：入口需要强仪式感/);
  assert.match(prompt, /已有创意方向/);
  assert.match(prompt, /适合多方案比选/);
});

test('exhibition creative brief prompt can reuse one creative direction', () => {
  const prompt = buildExhibitionCreativeBriefPrompt({
    spaceType: 'outro-hall',
    generationCount: 3,
    regenerateEachTime: false,
  });
  assert.match(prompt, /尾厅/);
  assert.match(prompt, /后续图片会复用同一创意描述/);
});

test('exhibition creative prompt normalizes count, space type and brief wrappers', () => {
  assert.equal(normalizeExhibitionCreativeCount(99), 12);
  assert.equal(normalizeExhibitionCreativeCount(0), 1);
  assert.equal(normalizeExhibitionCreativeSpaceType('unknown'), 'intro-hall');
  assert.equal(normalizeExhibitionCreativeBrief('```markdown\n创意描述：空间入口设置发光序章。\n```'), '空间入口设置发光序章。');
});
