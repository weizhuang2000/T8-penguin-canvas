import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeSpaceType,
} from '../src/utils/exhibitionCreativeImagePromptData.js';

test('exhibition creative image prompt locks the single input space image', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'highlight-space',
    projectTheme: '城市更新',
    colorMaterial: '深色拉丝金属、暖白灯带与低反射微水泥',
    inspiration: '用旧厂房钢结构和数字光幕形成记忆点',
    creativeBrief: '以一条悬浮时间轴串联城市记忆，中央设置可步入式光盒装置。',
    generationCount: 4,
  });
  assert.match(prompt, /重亮点展项空间/);
  assert.match(prompt, /【空间结构示意图】/);
  assert.match(prompt, /纯色素模的参考图是空间结构示意图/);
  assert.match(prompt, /空间几何、布局和动线的主约束/);
  assert.match(prompt, /不得把空间改成另一处建筑/);
  assert.match(prompt, /最终画面必须看得出来自同一张输入室内空间图/);
  assert.match(prompt, /城市更新/);
  assert.match(prompt, /【色彩与材质】/);
  assert.match(prompt, /深色拉丝金属、暖白灯带与低反射微水泥/);
  assert.match(prompt, /优先于自由创意描述/);
  assert.match(prompt, /【强制要求】/);
  assert.match(prompt, /旧厂房钢结构/);
  assert.ok(prompt.indexOf('【色彩与材质】') < prompt.indexOf('【创意描述】'));
  assert.ok(prompt.indexOf('【强制要求】') < prompt.indexOf('【创意描述】'));
});

test('exhibition creative brief prompt supports per-run LLM variation', () => {
  const prompt = buildExhibitionCreativeBriefPrompt({
    spaceType: 'intro-hall',
    projectTheme: '企业创新展',
    colorMaterial: '白色烤漆、半透明亚克力与冷蓝数字光',
    inspiration: '入口需要强仪式感',
    documentSummary: '核心资料：企业以智能制造为主线，关键展项包括数字产线、绿色工厂和未来实验室。',
    insertItems: ['large-sculpture', 'multimedia-equipment'],
    excludeItems: ['real-brand-logo', 'instruction-table'],
    roundIndex: 2,
    total: 5,
    previousBriefs: ['使用环形光幕形成开场。'],
    regenerateEachTime: true,
  });
  assert.match(prompt, /基于项目资料摘要、色彩与材质\/个人灵感和指定植入项/);
  assert.match(prompt, /第 2\/5 个序厅展陈空间生图创意描述/);
  assert.match(prompt, /指定植入项：大型雕塑和多媒体设备/);
  assert.match(prompt, /不要分析、引用或依赖输入图像/);
  assert.match(prompt, /排除项：真实品牌标识和说明表格/);
  assert.match(prompt, /不要设计、暗示或要求生成这些内容/);
  assert.doesNotMatch(prompt, /基于输入图片中的室内建筑空间/);
  assert.match(prompt, /项目主题\/展览关键词：企业创新展/);
  assert.match(prompt, /色彩与材质：白色烤漆、半透明亚克力与冷蓝数字光/);
  assert.match(prompt, /项目资料摘要/);
  assert.match(prompt, /数字产线、绿色工厂和未来实验室/);
  assert.match(prompt, /个人灵感补充：入口需要强仪式感/);
  assert.match(prompt, /已有创意方向/);
  assert.match(prompt, /适合多方案比选/);
});

test('exhibition creative image prompt places exclusions before LLM brief', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'intro-hall',
    creativeBrief: 'LLM 创意描述里可能提到真实品牌标识，但最终不应生成。',
    excludeItems: ['real-brand-logo', 'readable-wrong-text'],
  });
  assert.match(prompt, /【排除项优先约束】/);
  assert.match(prompt, /真实品牌标识和可读错字\/乱码文字/);
  assert.match(prompt, /优先级高于创意描述/);
  assert.ok(prompt.indexOf('【排除项优先约束】') < prompt.indexOf('【创意描述】'));
});

test('exhibition creative image prompt adds selected view angles to first sentence', () => {
  const single = buildExhibitionCreativeImagePrompt({
    spaceType: 'intro-hall',
    viewControlEnabled: true,
    viewAngles: ['front'],
  });
  assert.match(single.split('\n')[0], /控制生图视角为正视角/);

  const quad = buildExhibitionCreativeImagePrompt({
    spaceType: 'intro-hall',
    viewControlEnabled: true,
    viewAngles: ['front', 'left', 'right', 'top'],
  });
  assert.match(quad.split('\n')[0], /生成四视图，分别包含正视角、左视角、右视角、上视角/);

  const five = buildExhibitionCreativeImagePrompt({
    spaceType: 'intro-hall',
    viewControlEnabled: true,
    viewAngles: ['front', 'left', 'right', 'back', 'top'],
  });
  assert.match(five.split('\n')[0], /生成5视图，分别包含正视角、左视角、右视角、后视角、上视角/);
});

test('exhibition creative image prompt supports manual space size without input image', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'highlight-space',
    hasSpaceImage: false,
    spaceSize: { width: 12, depth: 18, height: 4.5 },
    creativeBrief: '围绕核心展品设置自由流线和沉浸光影。',
  });
  assert.match(prompt, /【手动空间尺寸约束】/);
  assert.match(prompt, /宽度 12 米、进深 18 米、高度 4.5 米/);
  assert.match(prompt, /空间结构、开口位置、墙体组织、吊顶形式和参观动线可以自由发挥/);
  assert.match(prompt, /控制在上述空间体量内/);
  assert.doesNotMatch(prompt, /没有输入空间图/);
  assert.doesNotMatch(prompt, /输入图像是唯一的室内建筑空间依据/);
  assert.doesNotMatch(prompt, /最终画面必须看得出来自同一张输入室内空间图/);
});

test('exhibition creative image prompt includes document summary as creative material', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'outro-hall',
    documentSummary: '资料摘要：结尾需要突出开放合作、产业生态和面向未来的行动倡议。',
    creativeBrief: '以一面逐渐展开的光幕作为出口前的情绪收束。',
  });
  assert.match(prompt, /项目资料摘要/);
  assert.match(prompt, /开放合作、产业生态/);
  assert.match(prompt, /逐渐展开的光幕/);
});

test('exhibition creative image prompt describes marked reference roles', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'highlight-space',
    colorMaterial: '手动暖木色和黄铜材质',
    hasSpaceImage: true,
    hasColorMaterialReferenceImage: true,
    colorMaterialReferenceMarkText: 'R',
    colorMaterialReferenceMarkPosition: 'top-left',
    hasExhibitReferenceImage: true,
    creativeBrief: '围绕核心展品组织沉浸式重点空间。',
  });
  assert.match(prompt, /参考图角色说明：纯色素模的参考图是空间结构示意图/);
  assert.match(prompt, /必须先从空间结构示意图提取干净的空间骨架/);
  assert.match(prompt, /不要直接沿用色彩与材质参考图原本的平面布局/);
  assert.match(prompt, /纯色素模的参考图是空间结构示意图/);
  assert.match(prompt, /空间几何、布局和动线的主约束/);
  assert.match(prompt, /最终空间结构必须完全遵循空间结构示意图/);
  assert.match(prompt, /该图不作为展品参考图起任何作用/);
  assert.match(prompt, /该图也不作为色彩与材质参考图起任何作用/);
  assert.match(prompt, /不要在最终效果图中渲染、复写、临摹或生成空间结构示意图中的标注文字/);
  assert.match(prompt, /左上角带 R 标识的图片为色彩与材质参考图/);
  assert.match(prompt, /色彩关系、材质质感、表面肌理、光泽和冷暖倾向/);
  assert.match(prompt, /三类参考图职责互斥/);
  assert.match(prompt, /不要从该图学习或复制空间布局/);
  assert.match(prompt, /即使该图看起来像完整室内效果图/);
  assert.match(prompt, /色彩与材质参考图只决定表面语言，不决定空间结构/);
  assert.match(prompt, /展品参考图是唯一展品参考来源/);
  assert.match(prompt, /不作为空间结构或色彩材质体系依据/);
  assert.doesNotMatch(prompt, /手动暖木色和黄铜材质/);
  assert.doesNotMatch(prompt, /【色彩与材质】/);
});

test('exhibition creative prompt uses custom mark labels and suppresses color material in brief prompt', () => {
  const imagePrompt = buildExhibitionCreativeImagePrompt({
    hasSpaceImage: true,
    hasColorMaterialReferenceImage: true,
    colorMaterialReferenceMarkText: 'CM',
    colorMaterialReferenceMarkPosition: 'top-right',
    colorMaterial: '不应出现的手动色彩材质',
  });
  assert.match(imagePrompt, /空间结构示意图/);
  assert.doesNotMatch(imagePrompt, /SPACE 标识的图片为空间约束参考图/);
  assert.match(imagePrompt, /右上角带 CM 标识的图片为色彩与材质参考图/);
  assert.doesNotMatch(imagePrompt, /不应出现的手动色彩材质/);

  const briefPrompt = buildExhibitionCreativeBriefPrompt({
    hasColorMaterialReferenceImage: true,
    colorMaterial: '不应进入 LLM 创意描述',
    inspiration: '可以保留的个人灵感',
  });
  assert.doesNotMatch(briefPrompt, /不应进入 LLM 创意描述/);
  assert.match(briefPrompt, /可以保留的个人灵感/);
});

test('exhibition creative brief prompt can reuse one creative direction', () => {
  const prompt = buildExhibitionCreativeBriefPrompt({
    spaceType: 'outro-hall',
    generationCount: 3,
    regenerateEachTime: false,
  });
  assert.match(prompt, /尾厅/);
  assert.match(prompt, /后续图片会复用同一创意描述/);
});

test('exhibition creative prompt normalizes count, space type and brief wrappers', () => {
  assert.equal(normalizeExhibitionCreativeCount(99), 12);
  assert.equal(normalizeExhibitionCreativeCount(0), 1);
  assert.equal(normalizeExhibitionCreativeSpaceType('unknown'), 'intro-hall');
  assert.equal(normalizeExhibitionCreativeBrief('```markdown\n创意描述：空间入口设置发光序章。\n```'), '空间入口设置发光序章。');
});
