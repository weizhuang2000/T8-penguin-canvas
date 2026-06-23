import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionLightingHeatmapPrompt,
  normalizeExhibitionLightingHeatmapMode,
} from '../src/utils/exhibitionLightingHeatmapPromptData.js';

test('exhibition lighting heatmap overlay prompt keeps source structure and asks for heat overlay', () => {
  const prompt = buildExhibitionLightingHeatmapPrompt({
    mode: 'overlay',
    focusItems: ['uniformity', 'accent-lighting', 'glare-risk', 'dark-zones'],
    supplement: '重点分析展柜区域',
  });

  assert.match(prompt, /输出模式：覆盖层图/);
  assert.match(prompt, /保留原图的空间结构/);
  assert.match(prompt, /叠加半透明灯光热力覆盖层/);
  assert.match(prompt, /蓝\/青\/绿\/黄\/橙\/红连续色带/);
  assert.match(prompt, /照度强弱/);
  assert.match(prompt, /简洁色标图例/);
  assert.match(prompt, /整体均匀度、重点照明、眩光风险、暗区识别/);
  assert.match(prompt, /补充要求：重点分析展柜区域/);
});

test('exhibition lighting heatmap technical prompt asks for standalone pseudo-color analysis', () => {
  const prompt = buildExhibitionLightingHeatmapPrompt({
    mode: 'technical',
    focusItems: ['accent-lighting', 'dark-zones'],
  });

  assert.match(prompt, /输出模式：独立分析图/);
  assert.match(prompt, /独立伪彩色灯光热力分析图/);
  assert.match(prompt, /弱化原图材质/);
  assert.match(prompt, /空间轮廓/);
  assert.match(prompt, /光源分布/);
  assert.match(prompt, /热区、暗区、照度分区/);
  assert.match(prompt, /等照度关系/);
});

test('exhibition lighting heatmap mode falls back to overlay', () => {
  assert.equal(normalizeExhibitionLightingHeatmapMode('bad-mode'), 'overlay');
  const prompt = buildExhibitionLightingHeatmapPrompt({ mode: 'bad-mode' });
  assert.match(prompt, /输出模式：覆盖层图/);
});
