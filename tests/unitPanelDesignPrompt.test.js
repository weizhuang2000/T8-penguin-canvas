import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnitPanelImagePrompt,
  UNIT_PANEL_LANGUAGES,
  normalizeUnitPanelLanguages,
  normalizeUnitPanelTextLayoutBounds,
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
  assert.ok(prompt.indexOf('Grassland Silk Road') < prompt.indexOf('草原丝路'));
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
    dimensions: { panelWidth: 700, panelHeight: 1600, panelCount: 3, gap: 50 },
  });
  assert.match(marked, /尺寸标注：开启/);
  assert.match(marked, /推导总宽 2200 mm/);
  assert.match(marked, /总高等于单板高 1600 mm/);
  assert.match(marked, /共 3 块单元板/);
  assert.match(marked, /板间距 50 mm/);
  assert.match(marked, /比例约束/);
  assert.match(marked, /禁止把单元板拉伸、压扁/);

  const unmarked = buildUnitPanelImagePrompt({ dimensionMarksEnabled: false });
  assert.match(unmarked, /尺寸标注：关闭/);
  assert.match(unmarked, /不要绘制尺寸线/);
});

test('unit panel prompt switches image display constraints', () => {
  const enabled = buildUnitPanelImagePrompt({ imageDisplayEnabled: true });
  assert.doesNotMatch(enabled, /图片显示：关闭/);

  const disabled = buildUnitPanelImagePrompt({ imageDisplayEnabled: false });
  assert.match(disabled, /图片显示：关闭/);
  assert.match(disabled, /禁止显示任何图像照片或具象图片/);
  assert.match(disabled, /抽象背景图、底纹、材质肌理/);
});

test('unit panel prompt includes text layout bounds', () => {
  assert.deepEqual(normalizeUnitPanelTextLayoutBounds({}), { lowerMeters: 0.8, upperMeters: 2.2 });
  assert.deepEqual(normalizeUnitPanelTextLayoutBounds({ lowerMeters: 2.5, upperMeters: 0.6 }), { lowerMeters: 0.6, upperMeters: 2.5 });

  const prompt = buildUnitPanelImagePrompt({
    textLayoutBounds: { lowerMeters: 0.9, upperMeters: 2.4 },
  });
  assert.match(prompt, /文字控制区|鏂囧瓧鎺у埗鍖?/);
  assert.match(prompt, /所有语种|鎵€鏈夎绉?/);
  assert.match(prompt, /0\.9/);
  assert.match(prompt, /2\.4/);
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

test('unit panel reference image overrides material and font controls', () => {
  const prompt = buildUnitPanelImagePrompt({
    hasColorMaterialReferenceImage: true,
    primaryMaterial: { label: 'Manual Primary Material' },
    secondaryMaterials: [{ label: 'Manual Secondary Material' }],
    colorMaterialPresetText: 'Manual preset text',
    manualColorMaterial: 'Manual color material',
    titleFont: 'song-display',
    bodyFont: 'songti',
    colorMaterialReferenceTone: 'Reference dominant tone',
  });
  assert.match(prompt, /参考图仿制优先|鍙傝€冨浘浠垮埗浼樺厛/);
  assert.match(prompt, /字号大小|瀛楀彿澶у皬/);
  assert.match(prompt, /Reference dominant tone/);
  assert.doesNotMatch(prompt, /Manual Primary Material/);
  assert.doesNotMatch(prompt, /Manual Secondary Material/);
  assert.doesNotMatch(prompt, /Manual preset text/);
  assert.doesNotMatch(prompt, /Manual color material/);
  assert.doesNotMatch(prompt, /song-display|songti/);
});

test('unit panel language normalization defaults to Chinese and English', () => {
  assert.deepEqual(normalizeUnitPanelLanguages([]), ['zh', 'en']);
  assert.deepEqual(normalizeUnitPanelLanguages(['ja', 'zh', 'ja', 'bad']), ['ja', 'zh']);
  assert.ok(UNIT_PANEL_LANGUAGES.some((item) => item.id === 'mn-trad' && /Traditional Mongolian/.test(item.promptName)));
  assert.deepEqual(normalizeUnitPanelLanguages(['mn-trad', 'zh']), ['mn-trad', 'zh']);
});
