import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnitPanelImagePrompt,
  normalizeUnitPanelLanguages,
} from '../src/utils/unitPanelDesignPromptData.js';

test('unit panel prompt includes two-level text and language order in Chinese template', () => {
  const prompt = buildUnitPanelImagePrompt({
    titleText: '草原丝路',
    bodyText: '呼和浩特是草原丝路的重要节点，见证多民族交流交融。',
    languages: ['en', 'zh'],
    translations: {
      en: { title: 'Grassland Silk Road', body: 'Hohhot was an important node of the grassland Silk Road.' },
      zh: { title: '草原丝路', body: '呼和浩特是草原丝路的重要节点。' },
    },
  });
  assert.match(prompt, /文字层级：标题字是第一视觉层级/);
  assert.ok(prompt.indexOf('English') < prompt.indexOf('中文'));
  assert.match(prompt, /Grassland Silk Road/);
  assert.match(prompt, /草原丝路/);
  assert.doesNotMatch(prompt, /Text hierarchy|Primary request|Asset type/);
});

test('unit panel prompt switches split design constraints', () => {
  const split = buildUnitPanelImagePrompt({ splitDesignEnabled: true });
  assert.match(split, /分体设计：开启/);
  assert.match(split, /多块独立板体/);

  const integrated = buildUnitPanelImagePrompt({ splitDesignEnabled: false });
  assert.match(integrated, /分体设计：关闭/);
  assert.match(integrated, /连续一体化版面/);
});

test('unit panel prompt switches dimension marks and panel count', () => {
  const marked = buildUnitPanelImagePrompt({
    dimensionMarksEnabled: true,
    dimensions: { totalWidth: 3600, totalHeight: 1800, panelWidth: 700, panelHeight: 1600, panelCount: 3, gap: 50 },
  });
  assert.match(marked, /尺寸标注：开启/);
  assert.match(marked, /整体宽 3600 mm x 高 1800 mm/);
  assert.match(marked, /共 3 块单元板/);
  assert.match(marked, /板间距 50 mm/);

  const unmarked = buildUnitPanelImagePrompt({ dimensionMarksEnabled: false });
  assert.match(unmarked, /尺寸标注：关闭/);
  assert.match(unmarked, /不要绘制尺寸线/);
});

test('unit panel material priority is above reference tone and color material preset', () => {
  const prompt = buildUnitPanelImagePrompt({
    primaryMaterial: { label: '深蓝哑光金属', description: '低反射金属主面' },
    secondaryMaterials: [{ label: '香槟金拉丝金属', texture: '细密拉丝' }],
    colorMaterialReferenceTone: '主色调：深蓝、金色；整体偏冷。',
    colorMaterialPresetText: '共享预设：深色石材与暖光',
    manualColorMaterial: '手写色材补充',
  });
  const materialIndex = prompt.indexOf('1. 首先严格执行已选择的主材质和辅助材质');
  const toneIndex = prompt.indexOf('2. 其次参考色彩与材质参考图读取到的主色调');
  const presetIndex = prompt.indexOf('3. 再把共享色彩与材质预设仅作为补充色彩体系和整体质感');
  const manualIndex = prompt.indexOf('4. 最后才参考手动色彩材质补充');
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
