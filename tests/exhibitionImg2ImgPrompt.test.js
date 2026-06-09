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
  assert.match(prompt, /优先级顺序：1\. 空间结构示意图标注 > 2\. 工艺与版式 > 3\. 输入效果图形式/);
  assert.match(prompt, /生成一张专业展陈空间图生图效果图/);
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

test('exhibition img2img prompt explains reference image roles after priority changes', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['styleImageForm', 'craftLayout', 'structureAnnotations'],
  });
  assert.match(prompt, /第 2 张参考图是空间结构示意图/);
  assert.match(prompt, /第 1 张参考图是空间表现效果图/);
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
