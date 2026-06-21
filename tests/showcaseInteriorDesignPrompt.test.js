import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShowcaseInteriorDesignPrompt,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseStyle,
} from '../src/utils/showcaseInteriorDesignPromptData.js';

test('showcase prompt includes four showcase dimensions and cap switch', () => {
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
  assert.match(withCap, /有柜帽，柜帽高度 180 mm/);
  assert.match(withCap, /推导总高度：1880 mm/);

  const withoutCap = buildShowcaseInteriorDesignPrompt({
    showcaseStyle: { widthMm: 1200, baseHeightMm: 300, glassHeightMm: 1400, capHeightMm: 180, hasCap: false },
  });
  assert.match(withoutCap, /无柜帽/);
  assert.match(withoutCap, /推导总高度：1700 mm/);

  assert.deepEqual(normalizeShowcaseStyle({}), {
    widthMm: 1200,
    baseHeightMm: 300,
    glassHeightMm: 1400,
    capHeightMm: 180,
    hasCap: true,
  });
});

test('showcase prompt keeps exhibit order and longest side in millimeters', () => {
  const items = normalizeShowcaseExhibitItems([
    { url: '/files/input/a.png', label: '青铜器', maxSideMm: 420 },
    { url: '/files/input/b.png', label: '陶俑', maxSideMm: 260 },
  ]);
  assert.deepEqual(items.map((item) => item.maxSideMm), [420, 260]);

  const prompt = buildShowcaseInteriorDesignPrompt({ exhibitItems: items });
  assert.ok(prompt.indexOf('1. 青铜器：最长边 420 mm') < prompt.indexOf('2. 陶俑：最长边 260 mm'));
  assert.match(prompt, /所有展品必须按上述最长边形成相对比例/);
});

test('showcase prompt switches dimension marks and exploded view requirements', () => {
  const marked = buildShowcaseInteriorDesignPrompt({ dimensionMarksEnabled: true, explodedViewEnabled: true });
  assert.match(marked, /尺寸标注：开启/);
  assert.match(marked, /分解爆炸图：开启/);
  assert.match(marked, /柜体、玻璃罩、底座、柜帽、托架、展品、灯光组件/);

  const unmarked = buildShowcaseInteriorDesignPrompt({ dimensionMarksEnabled: false, explodedViewEnabled: false });
  assert.match(unmarked, /尺寸标注：关闭/);
  assert.match(unmarked, /分解爆炸图：关闭/);
  assert.match(unmarked, /完整组装后的柜内陈列效果图/);
});

test('showcase prompt separates exhibit images from color material reference', () => {
  const prompt = buildShowcaseInteriorDesignPrompt({
    exhibitItems: [{ url: '/files/input/exhibit.png', label: '展品图', maxSideMm: 300 }],
    colorMaterialPresetText: '深灰金属、暖光、低反射玻璃',
    manualColorMaterial: '背板使用细腻织物肌理',
    colorMaterialReferenceTone: '主色调：深蓝、香槟金',
    hasColorMaterialReferenceImage: true,
  });
  assert.match(prompt, /普通 image 输入均视为展品图/);
  assert.match(prompt, /独立 color-material-reference 输入/);
  assert.match(prompt, /不得当作展品图/);
  assert.match(prompt, /共享色彩与材质预设作为次级补充/);
  assert.match(prompt, /手动色彩与材质补充/);
  assert.match(prompt, /展品图：最长边 300 mm/);
});

