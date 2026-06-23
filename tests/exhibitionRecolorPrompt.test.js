import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionRecolorPrompt,
  normalizeExhibitionRecolorBrightness,
  normalizeExhibitionRecolorColor,
} from '../src/utils/exhibitionRecolorPromptData.js';

test('exhibition recolor prompt includes colors brightness and protected exclusions', () => {
  const prompt = buildExhibitionRecolorPrompt({
    primaryColor: '#123456',
    secondaryColor: '#abc',
    accentColor: '#fedcba',
    brightness: 28,
    excludeItems: ['exhibit', 'sand-table', 'sculpture'],
    manualExclusions: '核心展柜、青铜器',
    floorPrompt: '地面调整为深色哑光石材',
    ceilingPrompt: '天花板调整为线性灯带顶',
  });

  assert.match(prompt, /主色调 #123456/);
  assert.match(prompt, /辅助色调 #aabbcc/);
  assert.match(prompt, /点缀色 #fedcba/);
  assert.match(prompt, /整体明暗度提高 28%/);
  assert.match(prompt, /保护排除项：展品、沙盘和雕塑、核心展柜、青铜器/);
  assert.match(prompt, /地面：地面调整为深色哑光石材/);
  assert.match(prompt, /天花板：天花板调整为线性灯带顶/);
  assert.match(prompt, /不改变天花结构、层高、灯具\/喷淋\/风口设备位置/);
  assert.match(prompt, /保持原有颜色、材质、形态、数量、位置、尺寸/);
  assert.match(prompt, /除颜色和整体明暗度之外，不改变任何形态、数量、位置、尺寸、材质纹理/);
});

test('exhibition recolor prompt clamps brightness and normalizes invalid colors', () => {
  assert.equal(normalizeExhibitionRecolorBrightness(90), 50);
  assert.equal(normalizeExhibitionRecolorBrightness(-90), -50);
  assert.equal(normalizeExhibitionRecolorColor('#abc', '#000000'), '#aabbcc');
  assert.equal(normalizeExhibitionRecolorColor('bad', '#123456'), '#123456');

  const prompt = buildExhibitionRecolorPrompt({
    primaryColor: 'bad',
    brightness: -88,
  });
  assert.match(prompt, /主色调 #1f5f8b/);
  assert.match(prompt, /整体明暗度降低 50%/);
});

test('exhibition recolor prompt can disable tone recoloring', () => {
  const prompt = buildExhibitionRecolorPrompt({
    toneEnabled: false,
    primaryColor: '#123456',
    secondaryColor: '#abcdef',
    accentColor: '#fedcba',
    brightness: 30,
    floorPrompt: '地面改为浅灰石材',
  });

  assert.match(prompt, /色调模块：已关闭/);
  assert.match(prompt, /不要执行主色调、辅助色调或点缀色调整/);
  assert.doesNotMatch(prompt, /主色调 #123456/);
  assert.doesNotMatch(prompt, /辅助色调 #abcdef/);
  assert.doesNotMatch(prompt, /点缀色 #fedcba/);
  assert.match(prompt, /整体明暗度提高 30%/);
  assert.match(prompt, /地面：地面改为浅灰石材/);
});
