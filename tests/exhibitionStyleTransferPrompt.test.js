import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionStyleTransferPrompt,
  normalizeExhibitionStyleTransferMode,
} from '../src/utils/exhibitionStyleTransferPromptData.js';

test('style transfer prompt uses original image as the only structure source', () => {
  const prompt = buildExhibitionStyleTransferPrompt({
    mode: 'style-reference',
  });

  assert.match(prompt, /@图片1 是原始图像，@图片2 是设计风格参考图/);
  assert.match(prompt, /必须以 @图片1 作为空间结构、展品、文字、展示手段、构图、透视、比例、动线和具体内容的唯一依据/);
  assert.match(prompt, /仅从 @图片2 提取展陈设计风格、色彩体系、材质语言/);
  assert.match(prompt, /原始图像是空间结构、展品、文字、展示手段、构图、视角、比例和动线/);
  assert.match(prompt, /不得从 @图片2 复制空间架构、展品、文字、展示手段/);
  assert.match(prompt, /禁止：改造空间、替换展品、改写文字、增加新展示方式/);
  assert.doesNotMatch(prompt, /参考图主色调识别/);
});

test('style transfer prompt uses shared color material preset without reference role', () => {
  const prompt = buildExhibitionStyleTransferPrompt({
    mode: 'color-material-preset',
    colorMaterialPalette: '白色、银灰、冷蓝',
    colorMaterialTextures: '低反射金属、半透明亚克力',
    colorMaterial: '清洁科技色彩体系',
  });

  assert.match(prompt, /风格来源：已选择的共享色彩与材质预设/);
  assert.match(prompt, /Color palette：白色、银灰、冷蓝/);
  assert.match(prompt, /Materials\/textures：低反射金属、半透明亚克力/);
  assert.doesNotMatch(prompt, /@图片2/);
});

test('style transfer prompt uses unit panel materials as replacement source', () => {
  const prompt = buildExhibitionStyleTransferPrompt({
    mode: 'material-replacement',
    primaryMaterial: {
      label: '微水泥',
      description: '连续墙地面',
      texture: '细腻低反射',
      usage: '主材质',
    },
    secondaryMaterials: [
      { label: '拉丝黄铜', texture: '金属收边', usage: '辅助材质' },
    ],
  });

  assert.match(prompt, /风格来源：主材质和辅助材质替换/);
  assert.match(prompt, /主材质：材质名称：微水泥/);
  assert.match(prompt, /辅助材质 1：材质名称：拉丝黄铜/);
  assert.match(prompt, /替换原图中对应的墙面、地面、展台、展柜、装置/);
  assert.match(prompt, /不移动、不增删、不重构任何核心元素/);
});

test('style transfer mode normalizes invalid values', () => {
  assert.equal(normalizeExhibitionStyleTransferMode('material-replacement'), 'material-replacement');
  assert.equal(normalizeExhibitionStyleTransferMode('unknown'), 'style-reference');
});
