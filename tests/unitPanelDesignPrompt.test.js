import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnitPanelImagePrompt,
  normalizeUnitPanelLanguages,
} from '../src/utils/unitPanelDesignPromptData.js';

test('unit panel prompt includes two-level text and language order', () => {
  const prompt = buildUnitPanelImagePrompt({
    titleText: '屏藩朔漠',
    bodyText: '呼和浩特是草原丝路的重要节点，见证多民族交往交流交融。',
    languages: ['en', 'zh'],
    translations: {
      en: { title: 'Silk Road Hub', body: 'Hohhot was an important node of the grassland Silk Road.' },
      zh: { title: '屏藩朔漠', body: '呼和浩特是草原丝路的重要节点。' },
    },
  });
  assert.match(prompt, /Text hierarchy: title text is the first visual level/);
  assert.ok(prompt.indexOf('English') < prompt.indexOf('中文'));
  assert.match(prompt, /Silk Road Hub/);
  assert.match(prompt, /屏藩朔漠/);
});

test('unit panel prompt switches split design constraints', () => {
  const split = buildUnitPanelImagePrompt({ splitDesignEnabled: true });
  assert.match(split, /Split-panel design is ON/);
  assert.match(split, /independent boards\/modules/);

  const integrated = buildUnitPanelImagePrompt({ splitDesignEnabled: false });
  assert.match(integrated, /Split-panel design is OFF/);
  assert.match(integrated, /continuous integrated panel surface/);
});

test('unit panel prompt switches dimension marks', () => {
  const marked = buildUnitPanelImagePrompt({
    dimensionMarksEnabled: true,
    dimensions: { totalWidth: 3600, totalHeight: 1800, panelWidth: 700, panelHeight: 1600, panelCount: 3, gap: 50 },
  });
  assert.match(marked, /Dimension marks ON/);
  assert.match(marked, /3600 mm W x 1800 mm H/);
  assert.match(marked, /50 mm gaps/);

  const unmarked = buildUnitPanelImagePrompt({ dimensionMarksEnabled: false });
  assert.match(unmarked, /Dimension marks OFF/);
  assert.match(unmarked, /do not draw dimension lines/);
});

test('unit panel material priority is above reference tone and color material preset', () => {
  const prompt = buildUnitPanelImagePrompt({
    primaryMaterial: { label: '深蓝哑光金属', description: '低反射金属主面' },
    secondaryMaterials: [{ label: '香槟金拉丝金属', texture: '细密拉丝' }],
    colorMaterialReferenceTone: '主色调：深蓝、金色；整体偏冷。',
    colorMaterialPresetText: '共享预设：深色石材与暖光',
    manualColorMaterial: '手写色材补充',
  });
  const materialIndex = prompt.indexOf('1. Follow selected materials first');
  const toneIndex = prompt.indexOf('2. Then follow dominant tone');
  const presetIndex = prompt.indexOf('3. Then use shared color/material preset');
  const manualIndex = prompt.indexOf('4. Last fallback manual');
  assert.ok(materialIndex >= 0);
  assert.ok(toneIndex > materialIndex);
  assert.ok(presetIndex > toneIndex);
  assert.ok(manualIndex > presetIndex);
  assert.match(prompt, /深蓝哑光金属/);
  assert.match(prompt, /香槟金拉丝金属/);
});

test('unit panel language normalization defaults to Chinese and English', () => {
  assert.deepEqual(normalizeUnitPanelLanguages([]), ['zh', 'en']);
  assert.deepEqual(normalizeUnitPanelLanguages(['ja', 'zh', 'ja', 'bad']), ['ja', 'zh']);
});
