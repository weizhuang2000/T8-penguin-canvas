import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShowcaseInteriorDesignPrompt,
  colorMaterialTextFromPreset,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseStyle,
} from '../src/utils/showcaseInteriorDesignPromptData.js';

test('showcase prompt includes four showcase dimensions and cap switch in Chinese', () => {
  const withCap = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: {
      widthMm: 1200,
      baseHeightMm: 300,
      glassHeightMm: 1400,
      capHeightMm: 180,
      hasCap: true,
    },
  });
  assert.match(withCap, /展柜宽度：1200 mm/);
  assert.match(withCap, /底座高度：300 mm/);
  assert.match(withCap, /玻璃区高度：1400 mm/);
  assert.match(withCap, /柜帽：开启，柜帽高度 180 mm/);
  assert.match(withCap, /推导总高度：1880 mm/);

  const withoutCap = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: { widthMm: 1200, baseHeightMm: 300, glassHeightMm: 1400, capHeightMm: 180, hasCap: false },
  });
  assert.match(withoutCap, /柜帽：关闭/);
  assert.match(withoutCap, /推导总高度：1700 mm/);

  assert.deepEqual(normalizeShowcaseStyle({}), {
    widthMm: 1200,
    baseHeightMm: 300,
    glassHeightMm: 1400,
    capHeightMm: 180,
    hasCap: true,
  });
});

test('showcase prompt keeps exhibit order and display height in millimeters', () => {
  const items = normalizeShowcaseExhibitItems([
    { url: '/files/input/a.png', label: '青铜器', heightMm: 420 },
    { url: '/files/input/b.png', label: '陶俑', heightMm: 260 },
  ]);
  assert.deepEqual(items.map((item) => item.heightMm), [420, 260]);

  const prompt = buildShowcaseInteriorDesignPrompt({ exhibitItems: items, showcaseStyle: { widthMm: 1200, glassHeightMm: 1400 } });
  assert.ok(prompt.indexOf('1. 青铜器：设定高度 420 mm，生图显示高度 294 mm') < prompt.indexOf('2. 陶俑：设定高度 260 mm，生图显示高度 182 mm'));
  assert.match(prompt, /参考图顺序：第 1 张参考图 = 展品 1，第 2 张参考图 = 展品 2/);
  assert.doesNotMatch(prompt, /尺寸合成参考图/);
  assert.doesNotMatch(prompt, /第 2 张参考图 = 展品 1/);
  assert.match(prompt, /严格比例规则/);
  assert.match(prompt, /生图时展品本体显示高度按设定高度的 70% 生成/);
  assert.match(prompt, /展柜宽度、底座高度、玻璃区高度、柜帽高度和柜体总高度保持设定尺寸不变/);
  assert.match(prompt, /展品、展柜和构件的标注文字仍必须标注用户设定尺寸/);
  assert.match(prompt, /高度只指展品本体的可见垂直高度，不包含托台、托盘、标签牌、底座、支架、阴影、留白或说明文字/);
  assert.match(prompt, /不得为了构图、焦点或视觉美观而随意放大或缩小/);
  assert.match(prompt, /保留充足柜内空白，为以后继续放置其它展品预留空间/);
  assert.match(prompt, /玻璃区高度 1400 mm 的 21%/);
  assert.match(prompt, /仍标注为 420 mm，不标注为 294 mm/);
  assert.match(prompt, /本体可见高度不得超过玻璃区高度的 23\.1%/);
  assert.doesNotMatch(prompt, /显示高度约为展柜宽度/);
  assert.match(prompt, /相对尺寸审计/);

  const legacy = normalizeShowcaseExhibitItems([{ url: '/files/input/legacy.png', maxSideMm: 188 }]);
  assert.equal(legacy[0].heightMm, 188);
});

test('showcase prompt switches dimension marks and exploded view requirements', () => {
  const marked = buildShowcaseInteriorDesignPrompt({ perspectiveEnabled: true, dimensionMarksEnabled: true, explodedViewEnabled: true });
  assert.match(marked, /透视效果：开启/);
  assert.match(marked, /尺寸标注：开启/);
  assert.match(marked, /所有标注必须使用用户设定尺寸/);
  assert.match(marked, /展品标注为设定高度，不标注 70% 后的显示高度/);
  assert.match(marked, /分解爆炸图：开启/);
  assert.match(marked, /柜体、玻璃罩、底座、柜帽、托架、展品、灯光组件/);

  const unmarked = buildShowcaseInteriorDesignPrompt({ perspectiveEnabled: false, dimensionMarksEnabled: false, explodedViewEnabled: false });
  assert.match(unmarked, /透视效果：关闭/);
  assert.match(unmarked, /完全平面的正立面\/二维方案效果/);
  assert.match(unmarked, /不要任何 3D 透视/);
  assert.match(unmarked, /所有水平线和垂直线必须保持平行/);
  assert.match(unmarked, /尺寸标注：关闭/);
  assert.match(unmarked, /展品视觉高度按设定高度的 70%，展柜尺寸不变/);
  assert.match(unmarked, /分解爆炸图：关闭/);
  assert.match(unmarked, /完整组装后的柜内陈列效果图/);
});

test('showcase prompt supports manual layout mode without auto height scaling', () => {
  const prompt = buildShowcaseInteriorDesignPrompt({
    layoutMode: 'manual',
    showcaseStyle: { widthMm: 1500, glassHeightMm: 1400 },
    exhibitItems: [
      { url: '/files/input/a.png', label: '青铜器', heightMm: 420 },
      { url: '/files/input/b.png', label: '陶俑', heightMm: 260 },
    ],
    manualLayoutItems: [
      { url: '/files/input/a.png', label: '青铜器', xMm: 120, yMm: 300, widthMm: 180, heightMm: 240, zIndex: 2 },
      { url: '/files/input/b.png', label: '陶俑', xMm: 520, yMm: 360, widthMm: 150, heightMm: 210, zIndex: 1 },
    ],
    hasColorMaterialReferenceImage: true,
  });
  assert.match(prompt, /手动排版模式/);
  assert.match(prompt, /手动布局参考图/);
  assert.match(prompt, /不要套用自动尺寸模式中的“高度 mm”或“设定高度 70%”规则/);
  assert.match(prompt, /宽 1500 mm，高 1400 mm，只对应玻璃区内部/);
  assert.match(prompt, /陶俑：左上角 x=520 mm，y=360 mm，显示宽度 150 mm，显示高度 210 mm，层级 1/);
  assert.match(prompt, /青铜器：左上角 x=120 mm，y=300 mm，显示宽度 180 mm，显示高度 240 mm，层级 2/);
  assert.match(prompt, /排在手动布局参考图之后/);
  assert.doesNotMatch(prompt, /生图显示高度 294 mm/);
  assert.doesNotMatch(prompt, /本体显示高度按设定高度的 70% 生成/);
});

test('showcase prompt separates exhibit images from color material reference', () => {
  const prompt = buildShowcaseInteriorDesignPrompt({
    exhibitItems: [{ url: '/files/input/exhibit.png', label: '展品图', heightMm: 300 }],
    colorMaterialPresetText: '深灰金属、暖光、低反射玻璃',
    manualColorMaterial: '背板使用细腻织物肌理',
    colorMaterialReferenceTone: '主色调：深蓝、香槟金',
    hasColorMaterialReferenceImage: true,
  });
  assert.match(prompt, /普通 image 输入均视为展品图/);
  assert.match(prompt, /独立 color-material-reference 输入/);
  assert.match(prompt, /排在所有展品图之后/);
  assert.match(prompt, /它不是展品图/);
  assert.match(prompt, /不得套用任何展品高度尺寸/);
  assert.match(prompt, /共享色彩与材质预设作为次级补充/);
  assert.match(prompt, /手动色彩与材质补充/);
  assert.match(prompt, /展品图：设定高度 300 mm，生图显示高度 210 mm/);
});

test('showcase color material preset keeps only color and material constraints', () => {
  const presetText = colorMaterialTextFromPreset({
    core: '主色为深灰金属，香槟金收边，禁止使用龙纹图案',
    features: '材质为低反射玻璃、磨砂亚克力；需要金色文字标题和 logo',
    usage: '背板使用织物肌理；加入云纹符号',
    info: 'warm light, matte metal, pattern of waves, typography system',
  });
  assert.match(presetText, /深灰金属/);
  assert.match(presetText, /低反射玻璃/);
  assert.match(presetText, /磨砂亚克力/);
  assert.match(presetText, /织物肌理/);
  assert.match(presetText, /matte metal/);
  assert.doesNotMatch(presetText, /龙纹/);
  assert.doesNotMatch(presetText, /文字/);
  assert.doesNotMatch(presetText, /logo/i);
  assert.doesNotMatch(presetText, /云纹/);
  assert.doesNotMatch(presetText, /pattern/i);

  const prompt = buildShowcaseInteriorDesignPrompt({ colorMaterialPresetText: presetText });
  assert.match(prompt, /仅采用色彩和材质信息/);
  assert.match(prompt, /忽略其中所有图案、纹样、文字、符号、logo、排版约定/);
});
