import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.match(prompt, /^Use case: stylized-concept/m);
  assert.match(prompt, /Asset type: 专业展陈空间效果图 \/ 重亮点展项空间方案比选/);
  assert.match(prompt, /Primary request: 生成一张真实室内建筑摄影级渲染的重亮点展项空间效果图，第1\/4张。/);
  assert.match(prompt, /Input images: 图1=唯一空间结构示意图/);
  assert.match(prompt, /Scene\/backdrop: 重亮点展项空间、核心展品或核心叙事节点/);
  assert.match(prompt, /Subject: .*主题为“城市更新”。/);
  assert.match(prompt, /Color palette: 深色拉丝金属、暖白灯带与低反射微水泥/);
  assert.match(prompt, /Materials\/textures: 深色拉丝金属、暖白灯带与低反射微水泥/);
  assert.match(prompt, /Text \(verbatim\): 仅允许出现大型立体主题字装置“城市更新”/);
  assert.match(prompt, /Constraints: 必须保留图1的原始建筑结构/);
  assert.match(prompt, /Avoid: people, readable small text, broken typography/);
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
  assert.match(prompt, /Constraints: .*不得出现：真实品牌标识和可读错字\/乱码文字/);
  assert.match(prompt, /Avoid: .*真实品牌标识和可读错字\/乱码文字/);
  assert.ok(prompt.indexOf('Constraints:') < prompt.indexOf('Avoid:'));
});

test('exhibition creative image prompt adds selected view angles to first sentence', () => {
  const single = buildExhibitionCreativeImagePrompt({
    spaceType: 'intro-hall',
    viewControlEnabled: true,
    viewAngles: ['front'],
  });
  assert.match(single, /Primary request: .*正视角/);

  const quad = buildExhibitionCreativeImagePrompt({
    spaceType: 'intro-hall',
    viewControlEnabled: true,
    viewAngles: ['front', 'left', 'right', 'top'],
  });
  assert.match(quad, /Primary request: .*生成四视图，分别包含正视角、左视角、右视角、上视角/);

  const five = buildExhibitionCreativeImagePrompt({
    spaceType: 'intro-hall',
    viewControlEnabled: true,
    viewAngles: ['front', 'left', 'right', 'back', 'top'],
  });
  assert.match(five, /Primary request: .*生成5视图，分别包含正视角、左视角、右视角、后视角、上视角/);
});

test('exhibition creative image prompt supports manual space size without input image', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'highlight-space',
    hasSpaceImage: false,
    spaceSize: { width: 12, depth: 18, height: 4.5 },
    creativeBrief: '围绕核心展品设置自由流线和沉浸光影。',
  });
  assert.match(prompt, /Input images: 无输入图；按手动空间尺寸、项目资料和创意描述生成。/);
  assert.match(prompt, /Primary request: .*按宽度 12 米、进深 18 米、高度 4.5 米控制空间体量/);
  assert.match(prompt, /Subject: .*围绕核心展品设置自由流线和沉浸光影。/);
  assert.match(prompt, /Constraints: 必须保持真实室内空间尺度、墙体边界、开口逻辑、动线和可施工性/);
  assert.match(prompt, /Avoid: people, readable small text, broken typography/);
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
    colorMaterialPriorityMode: 'frontend',
    colorMaterialReferenceTone: '主色调：深红、铜褐、黑灰；整体偏暖，明度偏暗，饱和度适中。',
    colorMaterialReferenceMarkText: 'R',
    colorMaterialReferenceMarkPosition: 'top-left',
    hasExhibitReferenceImage: true,
    creativeBrief: '围绕核心展品组织沉浸式重点空间。',
  });
  assert.match(prompt, /Input images: 图1=唯一空间结构示意图/);
  assert.match(prompt, /图2=左上角带 R 标识的色彩与材质参考图/);
  assert.match(prompt, /图3=展品参考图/);
  assert.match(prompt, /Primary request: 生成一张真实室内建筑摄影级渲染的重亮点展项空间效果图，第1\/1张。严格遵循图1的空间几何、透视、层高、开口、墙体位置、顶面、地面边界、动线和尺度关系；色彩与材质参考图只用于提取材质语言、表面肌理、光泽、冷暖倾向和灯光氛围。/);
  assert.match(prompt, /Color palette: 主色调：深红、铜褐、黑灰；整体偏暖，明度偏暗，饱和度适中。/);
  assert.match(prompt, /Constraints: 必须保留图1的原始建筑结构/);
  assert.match(prompt, /展品参考图只影响展品外观和展示重点，不影响空间结构或色彩材质/);
  assert.doesNotMatch(prompt, /手动暖木色和黄铜材质/);
  assert.doesNotMatch(prompt, /【色彩与材质】/);
});

test('exhibition creative image prompt describes abstract color material card mode for gpt image 2', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'highlight-space',
    colorMaterial: '不应出现的手动色彩材质文本',
    hasSpaceImage: true,
    hasColorMaterialReferenceImage: true,
    colorMaterialPriorityMode: 'llm',
    colorMaterialReferenceTone: '主色调：前端识别不应进入大模型识别模式',
    colorMaterialReferenceMode: 'abstract-card',
    colorMaterialReferenceMarkText: 'R',
    colorMaterialReferenceMarkPosition: 'top-left',
    hasExhibitReferenceImage: true,
    creativeBrief: '围绕核心展品组织沉浸式重点空间。',
  });
  assert.match(prompt, /Input images: 图1=唯一空间结构示意图/);
  assert.match(prompt, /图2=色彩与材质抽象卡片/);
  assert.match(prompt, /只用于提取色彩关系、材质质感、表面肌理、光泽、冷暖倾向和灯光氛围，不作为空间结构依据/);
  assert.match(prompt, /Color palette: 从色彩与材质参考图中提取主色、辅助色、金属色、明暗关系、冷暖倾向和局部发光色/);
  assert.match(prompt, /Constraints: .*最终画面必须是高完成度、可落地的展陈空间效果图。/);
  assert.doesNotMatch(prompt, /前端识别不应进入大模型识别模式/);
  assert.doesNotMatch(prompt, /不应出现的手动色彩材质文本/);
  assert.doesNotMatch(prompt, /【色彩与材质】/);
});

test('exhibition creative image prompt lets preset override both color recognition modes', () => {
  const prompt = buildExhibitionCreativeImagePrompt({
    spaceType: 'intro-hall',
    hasSpaceImage: true,
    hasColorMaterialReferenceImage: true,
    hasColorMaterialPreset: true,
    colorMaterial: '不应作为优先输出的合并旧字段',
    colorMaterialPalette: '深红、铜褐、黑金',
    colorMaterialTextures: '微水泥、拉丝金属、低反射石材',
    colorMaterialPriorityMode: 'frontend',
    colorMaterialReferenceTone: '主色调：浅蓝、白灰',
    creativeBrief: '围绕序厅建立开场仪式感。',
  });
  assert.match(prompt, /Color palette: 深红、铜褐、黑金/);
  assert.match(prompt, /Materials\/textures: 微水泥、拉丝金属、低反射石材/);
  assert.doesNotMatch(prompt, /不应作为优先输出的合并旧字段/);
  assert.doesNotMatch(prompt, /从色彩与材质参考图中提取主色、辅助色、金属色、明暗关系、冷暖倾向和局部发光色/);
  assert.doesNotMatch(prompt, /主色调：浅蓝、白灰/);
});

test('exhibition creative image prompt lets overall lighting override color material brightness', () => {
  const disabled = buildExhibitionCreativeImagePrompt({
    spaceLightingEnabled: false,
    spaceLightingLevel: 'very-bright',
    colorMaterialPalette: '非常暗 黑色 low-key palette',
    colorMaterialTextures: '比较暗 金属 shadowy texture',
  });
  assert.doesNotMatch(disabled, /IMPORTANT overall lighting priority/);
  assert.match(disabled, /非常暗/);

  const enabled = buildExhibitionCreativeImagePrompt({
    spaceLightingEnabled: true,
    spaceLightingLevel: 'very-bright',
    colorMaterialPalette: '非常暗 黑色 low-key palette',
    colorMaterialTextures: '比较暗 金属 shadowy texture',
  });
  assert.match(enabled, /Lighting\/mood: IMPORTANT overall lighting priority: very bright overall space lighting/);
  assert.match(enabled, /overrides any brightness/);
  assert.doesNotMatch(enabled, /非常暗|比较暗|low-key|shadowy/);
});

test('exhibition creative prompt uses custom mark labels and suppresses color material in brief prompt', () => {
  const imagePrompt = buildExhibitionCreativeImagePrompt({
    hasSpaceImage: true,
    hasColorMaterialReferenceImage: true,
    colorMaterialReferenceMarkText: 'CM',
    colorMaterialReferenceMarkPosition: 'top-right',
    colorMaterial: '不应出现的手动色彩材质',
  });
  assert.match(imagePrompt, /Input images: 图1=唯一空间结构示意图/);
  assert.match(imagePrompt, /图2=右上角带 CM 标识的色彩与材质参考图/);
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

test('exhibition creative image node supports random categorized insert items', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionCreativeImageNode.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../backend/src/routes/promptLibrary.js', import.meta.url), 'utf8');
  assert.match(node, /INSERT_CATEGORIES = \['装饰', '多媒体', '艺术品', '展陈', '展柜', '展台', '顶部', '其它'\]/);
  assert.match(node, /insertRandomCounts/);
  assert.match(node, /resolveRuntimeInsertItems/);
  assert.match(node, /随机数量会在每次运行时/);
  assert.match(canvas, /insertRandomCounts: \{\}/);
  assert.match(backend, /EXHIBITION_CREATIVE_INSERT_CATEGORIES/);
});
