import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionImg2ImgPrompt,
  normalizeExhibitionImg2ImgPriority,
} from '../src/utils/exhibitionImg2ImgPromptData.js';

test('exhibition img2img prompt defaults to structure priority', () => {
  const order = normalizeExhibitionImg2ImgPriority();
  assert.deepEqual(order, ['structureAnnotations', 'craftLayout', 'colorMaterialReference']);
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /展陈工艺选用的优先级顺序：1\. 空间结构示意图标注 > 2\. 工艺与版式 > 3\. 色彩与材质参考\/预设/);
  assert.match(prompt, /生成一张专业展陈空间效果图，真实室内建筑摄影级渲染/);
  assert.doesNotMatch(prompt, /^优先级顺序：/m);
  assert.doesNotMatch(prompt, /面向深化设计汇报/);
  assert.doesNotMatch(prompt, /空间表现效果图|高级渲染参考图|输入效果图形式/);
});

test('exhibition img2img prompt follows custom priority order', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['colorMaterialReference', 'craftLayout', 'structureAnnotations'],
  });
  const colorMaterialIndex = prompt.indexOf('【色彩与材质参考/预设】');
  const craftIndex = prompt.indexOf('【工艺与版式】');
  const structureIndex = prompt.indexOf('【空间结构示意图标注】');
  assert.ok(colorMaterialIndex >= 0 && craftIndex > colorMaterialIndex && structureIndex > craftIndex);
});

test('exhibition img2img prompt maps legacy style priority to color material reference', () => {
  const order = normalizeExhibitionImg2ImgPriority(['styleImageForm', 'craftLayout', 'structureAnnotations']);
  assert.deepEqual(order, ['colorMaterialReference', 'craftLayout', 'structureAnnotations']);
});

test('exhibition img2img prompt forbids rendering structure labels', () => {
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /不要在最终效果图中渲染、复写、临摹或生成任何可读文字、编号、箭头说明、尺寸线和标签/);
  assert.match(prompt, /不要出现结构示意图中的标注文字、箭头编号、尺寸线、图例、说明标签或乱码文本/);
});

test('exhibition img2img prompt treats structure image as layout source', () => {
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /空间结构示意图是空间几何、布局、墙体、展陈体块、分区和动线的主约束/);
  assert.match(prompt, /空间骨架和布局蓝本/);
  assert.match(prompt, /不能只借鉴风格而改成另一套空间/);
  assert.match(prompt, /平面关系、动线、分区、展墙\/隔断、入口出口和主要体块转译为真实透视空间/);
});

test('exhibition img2img priority only affects presentation, not spatial structure', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['colorMaterialReference', 'craftLayout', 'structureAnnotations'],
  });
  assert.match(prompt, /优先级顺序只针对工艺版式、色彩材质语言、视觉风格和渲染语言的取舍/);
  assert.match(prompt, /空间结构不参与该优先级排序/);
  assert.match(prompt, /即使“色彩与材质参考\/预设”在优先级中排在前面，也只能优先采用它的色彩、材质、肌理、光泽、冷暖和灯光氛围/);
  assert.match(prompt, /最终空间结构必须完全遵循空间结构示意图/);
});

test('exhibition img2img prompt can include wall content planning', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    wallContentPrompt: '立面 1｜序厅\n内容摘要：品牌发展脉络\n准确文案：初心 / 创新',
  });
  assert.match(prompt, /展墙具体内容设计提示/);
  assert.match(prompt, /立面 1｜序厅/);
  assert.match(prompt, /品牌发展脉络/);
  assert.match(prompt, /仅用于设计效果图中各展墙的主题、图文层级、内容分区、重点文案占位和工艺落位/);
  assert.match(prompt, /不得改变空间结构/);
});

test('exhibition img2img wall content planning should use schedule instead of concept prompt', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    wallContentPrompt: [
      '项目：品牌馆',
      '核心信息：品牌发展脉络',
      '',
      '立面 1｜序厅',
      '内容摘要：品牌起源',
      '准确文案：初心 / 创新',
      '工艺配置：展板、立体字',
    ].join('\n'),
  });
  assert.match(prompt, /准确文案：初心 \/ 创新/);
  assert.doesNotMatch(prompt, /生成一张专业展陈彩立面平面设计概念图/);
  assert.doesNotMatch(prompt, /整套展陈彩立面设计/);
});

test('exhibition img2img wall content planning strips size ratio lines', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    wallContentPrompt: [
      '立面 1｜序厅',
      '内容摘要：品牌起源',
      '尺寸/比例：16:9',
      '尺寸 / 比例：3:1',
      '准确文案：初心 / 创新',
    ].join('\n'),
  });
  assert.match(prompt, /内容摘要：品牌起源/);
  assert.match(prompt, /准确文案：初心 \/ 创新/);
  assert.doesNotMatch(prompt, /尺寸\s*\/\s*比例\s*[:：]/);
});

test('exhibition img2img prompt forbids rendering design instruction fields as wall text', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    selectedCrafts: ['custom-craft'],
    craftPresets: [{ id: 'custom-craft', label: '定制工艺', prompt: '金属立体字与软膜灯箱' }],
    density: '信息丰富，采用严谨网格',
    wallContentPrompt: '工艺配置：展板、立体字\n版式备注：适中，沿用整体视觉体系',
  });
  assert.match(prompt, /只作为设计执行说明/);
  assert.match(prompt, /不得作为可读上墙文字、标题、标签或说明直接出现在效果图中/);
  assert.match(prompt, /不要出现“展陈工艺”“版式密度”“工艺配置”“版式备注”等字样/);
  assert.match(prompt, /不要把这些字段后的具体工艺、密度、配置、备注要求当作文案排到墙面上/);
});

test('exhibition img2img prompt uses color material reference image as material source', () => {
  const prompt = buildExhibitionImg2ImgPrompt({ hasColorMaterialReferenceImage: true });
  assert.match(prompt, /色彩与材质来源：使用接入的色彩与材质参考图/);
  assert.match(prompt, /仅提取主色、辅助色、冷暖关系、材质肌理、表面光泽、灯光氛围和可落地工艺语言/);
  assert.match(prompt, /不得作为空间布局、墙体位置、展台位置、通道组织或透视角度依据/);
});

test('exhibition img2img prompt uses shared color material preset', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    hasColorMaterialPreset: true,
    colorMaterialPalette: '深红、铜褐、黑金',
    colorMaterialTextures: '微水泥、拉丝金属、低反射石材',
  });
  assert.match(prompt, /色彩与材质来源：使用已选择的共享色彩与材质预设/);
  assert.match(prompt, /Color palette：深红、铜褐、黑金/);
  assert.match(prompt, /Materials\/textures：微水泥、拉丝金属、低反射石材/);
  assert.doesNotMatch(prompt, /高级渲染参考图/);
});

test('exhibition img2img prompt uses manual color material text', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    colorMaterial: '深色金属与暖光',
  });
  assert.match(prompt, /色彩与材质来源：使用手动填写的色彩与材质要求/);
  assert.match(prompt, /色彩与材质：深色金属与暖光/);
});

test('exhibition img2img prompt explains reference image roles after priority changes', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['colorMaterialReference', 'craftLayout', 'structureAnnotations'],
  });
  assert.match(prompt, /空间结构示意图是空间几何、布局、墙体、展陈体块、分区和动线的主约束/);
  assert.match(prompt, /色彩与材质参考图只用于提取色彩关系、材质质感、表面肌理、光泽、冷暖倾向和灯光氛围/);
  assert.doesNotMatch(prompt, /第 \d+ 张参考图是空间结构示意图/);
  assert.doesNotMatch(prompt, /第 \d+ 张参考图是色彩与材质参考图/);
});

test('exhibition img2img prompt includes craft and layout values when present', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    selectedCrafts: ['custom-craft'],
    craftPresets: [{ id: 'custom-craft', label: '定制工艺', prompt: '定制工艺提示词' }],
    customCraft: '补充工艺',
    density: '信息丰富',
    colorMaterial: '深色金属与暖光',
    visualStyle: '未来科技',
    supplement: '入口处保持开阔',
  });
  assert.match(prompt, /定制工艺提示词/);
  assert.match(prompt, /补充工艺/);
  assert.match(prompt, /信息丰富/);
  assert.match(prompt, /深色金属与暖光/);
  assert.match(prompt, /未来科技/);
  assert.match(prompt, /入口处保持开阔/);
});

test('exhibition img2img prompt places recognized exhibits by showcase groups', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    exhibitGroups: [
      { groupIndex: 2, items: ['青铜鼎'] },
      { groupIndex: 1, items: ['红色陶器', '圆形铜镜'] },
    ],
  });
  assert.match(prompt, /展柜展品布置/);
  const first = prompt.indexOf('将红色陶器、圆形铜镜放入左边第 1 个展柜内。');
  const second = prompt.indexOf('将青铜鼎放入左边第 2 个展柜内。');
  assert.ok(first >= 0 && second > first);
  assert.match(prompt, /展品图像只作为展品主体、轮廓、局部材质与展品自身色彩参考/);
});
