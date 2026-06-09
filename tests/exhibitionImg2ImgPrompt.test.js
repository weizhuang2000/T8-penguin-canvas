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
