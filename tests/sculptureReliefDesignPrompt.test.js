import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSculptureReliefExtractPrompt,
  buildSculptureReliefImagePrompt,
  normalizeSculptureReliefDimensions,
  normalizeSculptureReliefViewAngles,
  parseSculptureReliefExtractJson,
} from '../src/utils/sculptureReliefDesignPromptData.js';

test('sculpture relief extract prompt and parser support title theme and body text', () => {
  const prompt = buildSculptureReliefExtractPrompt({ sourceText: 'source text' });
  assert.match(prompt, /titleText/);
  assert.match(prompt, /themeText/);
  assert.match(prompt, /bodyText/);

  assert.deepEqual(parseSculptureReliefExtractJson(JSON.stringify({
    titleText: '精神之光',
    themeText: '以向上的金属体块表现城市记忆',
    bodyText: '说明文字',
  })), {
    titleText: '精神之光',
    themeText: '以向上的金属体块表现城市记忆',
    bodyText: '说明文字',
  });

  assert.deepEqual(parseSculptureReliefExtractJson('Title\nTheme\nBody'), {
    titleText: 'Title',
    themeText: 'Theme',
    bodyText: 'Body',
  });
});

test('view angles are limited to four and emitted in image prompt', () => {
  assert.deepEqual(
    normalizeSculptureReliefViewAngles(['front', 'left-45', 'right-45', 'side', 'top']),
    ['front', 'left-45', 'right-45', 'side'],
  );

  const prompt = buildSculptureReliefImagePrompt({
    viewAngles: ['front', 'left-45', 'right-45', 'top'],
  });
  assert.match(prompt, /front elevation view/);
  assert.match(prompt, /left front 45-degree view/);
  assert.match(prompt, /right front 45-degree view/);
  assert.match(prompt, /top view/);
});

test('sculpture and relief modes emit their own design constraints', () => {
  const sculpture = buildSculptureReliefImagePrompt({ designKind: 'sculpture', sculptureType: 'figure-group' });
  assert.match(sculpture, /设计类型：雕塑/);
  assert.match(sculpture, /人物群像/);
  assert.match(sculpture, /独立三维体量/);
  assert.match(sculpture, /不要生成平面海报/);

  const relief = buildSculptureReliefImagePrompt({ designKind: 'relief', reliefType: 'high-relief' });
  assert.match(relief, /设计类型：浮雕/);
  assert.match(relief, /高浮雕/);
  assert.match(relief, /墙面基底/);
  assert.match(relief, /不要生成完全脱离墙面的圆雕/);
});

test('sculpture relief dimensions enter prompt and remain structural without marks', () => {
  assert.deepEqual(normalizeSculptureReliefDimensions({}), {
    widthMm: 1200,
    heightMm: 1800,
    depthMm: 220,
    baseHeightMm: 200,
  });

  const marked = buildSculptureReliefImagePrompt({
    dimensionMarksEnabled: true,
    dimensions: { widthMm: 1500, heightMm: 2400, depthMm: 320, baseHeightMm: 260 },
  });
  assert.match(marked, /尺寸标注：开启/);
  assert.match(marked, /宽 1500 mm/);
  assert.match(marked, /高 2400 mm/);
  assert.match(marked, /厚\/深 320 mm/);
  assert.match(marked, /底座高 260 mm/);

  const unmarked = buildSculptureReliefImagePrompt({ dimensionMarksEnabled: false });
  assert.match(unmarked, /尺寸标注：关闭/);
  assert.match(unmarked, /造型比例仍必须遵循/);
});

test('pattern reference is limited to outline silhouette and composition', () => {
  const prompt = buildSculptureReliefImagePrompt({ hasPatternReferenceImage: true });
  assert.match(prompt, /仅参考轮廓、剪影、外形节奏和大致构图/);
  assert.match(prompt, /不要复制参考图案的细节、色彩、材质、文字、logo/);
});

test('sculpture prompt accepts administrator-defined type and view prompts', () => {
  const prompt = buildSculptureReliefImagePrompt({
    designKind: 'sculpture',
    sculptureType: 'custom-sculpture',
    sculptureTypeOption: { id: 'custom-sculpture', label: '定制雕塑', prompt: 'CUSTOM_SCULPTURE_PROMPT' },
    viewAngles: ['hero-view'],
    viewAngleOptions: [{ id: 'hero-view', label: '主视觉视角', prompt: 'CUSTOM_VIEW_PROMPT' }],
  });
  assert.match(prompt, /CUSTOM_SCULPTURE_PROMPT/);
  assert.match(prompt, /CUSTOM_VIEW_PROMPT/);
});
