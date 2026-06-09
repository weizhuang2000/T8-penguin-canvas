import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionImg2ImgPrompt,
  normalizeExhibitionImg2ImgPriority,
} from '../src/utils/exhibitionImg2ImgPromptData.js';

test('exhibition img2img prompt defaults to structure priority', () => {
  const order = normalizeExhibitionImg2ImgPriority();
  assert.deepEqual(order, ['structureAnnotations', 'craftLayout', 'styleImageForm']);
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /展陈工艺选用的优先级顺序：1\. 空间结构示意图标注 > 2\. 工艺与版式 > 3\. 输入效果图形式/);
  assert.match(prompt, /生成一张专业展陈空间效果图，真实室内建筑摄影级渲染/);
  assert.doesNotMatch(prompt, /^优先级顺序：/m);
  assert.doesNotMatch(prompt, /面向深化设计汇报/);
});

test('exhibition img2img prompt follows custom priority order', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['styleImageForm', 'craftLayout', 'structureAnnotations'],
  });
  const styleIndex = prompt.indexOf('【输入效果图形式】');
  const craftIndex = prompt.indexOf('【工艺与版式】');
  const structureIndex = prompt.indexOf('【空间结构示意图标注】');
  assert.ok(styleIndex >= 0 && craftIndex > styleIndex && structureIndex > craftIndex);
});

test('exhibition img2img prompt forbids rendering structure labels', () => {
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /不要在最终效果图中渲染、复写、临摹或生成任何可读文字、编号、箭头说明、尺寸线和标签/);
  assert.match(prompt, /不要出现结构示意图中的标注文字、箭头编号、尺寸线、图例、说明标签或乱码文本/);
});

test('exhibition img2img prompt treats structure image as layout source', () => {
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /空间结构示意图，是空间几何、布局和动线的主约束/);
  assert.match(prompt, /空间骨架和布局蓝本/);
  assert.match(prompt, /不能只借鉴风格而改成另一套空间/);
  assert.match(prompt, /平面关系、动线、分区、展墙\/隔断、入口出口和主要体块转译为真实透视空间/);
});

test('exhibition img2img priority only affects presentation, not spatial structure', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['styleImageForm', 'craftLayout', 'structureAnnotations'],
  });
  assert.match(prompt, /优先级顺序只针对表现形式、工艺版式、视觉风格和渲染语言的取舍/);
  assert.match(prompt, /空间结构不参与该优先级排序/);
  assert.match(prompt, /即使“输入效果图形式”在优先级中排在前面，也只能优先采用它的表现形式/);
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

test('exhibition img2img prompt includes tone reference mode', () => {
  const defaultPrompt = buildExhibitionImg2ImgPrompt();
  assert.match(defaultPrompt, /色调选择：高级渲染参考图优先/);
  assert.ok(defaultPrompt.indexOf('色调选择：高级渲染参考图优先') < defaultPrompt.indexOf('【空间结构示意图标注】'));
  assert.ok(defaultPrompt.indexOf('色调选择：高级渲染参考图优先') < defaultPrompt.indexOf('【输入效果图形式】'));

  const solidPrompt = buildExhibitionImg2ImgPrompt({ toneReferenceMode: 'solidModelFirst' });
  assert.match(solidPrompt, /色调选择：纯色素模优先/);
  assert.match(solidPrompt, /基础色调、明暗大关系和空间体块层次优先参考纯色素模/);

  const balancedPrompt = buildExhibitionImg2ImgPrompt({ toneReferenceMode: 'balanced' });
  assert.match(balancedPrompt, /色调选择：二者结合/);
  assert.match(balancedPrompt, /基础色调和体块明暗关系参考纯色素模，高级渲染参考图用于补充材质/);
});

test('exhibition img2img prompt explains reference image roles after priority changes', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['styleImageForm', 'craftLayout', 'structureAnnotations'],
  });
  assert.match(prompt, /纯色素模的参考图是空间结构示意图/);
  assert.match(prompt, /高级渲染的参考图是空间表现效果图/);
  assert.doesNotMatch(prompt, /第 \d+ 张参考图是空间结构示意图/);
  assert.doesNotMatch(prompt, /第 \d+ 张参考图是空间表现效果图/);
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
