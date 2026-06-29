import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildExhibitionImg2ImgPrompt,
  normalizeExhibitionImg2ImgPriority,
} from '../src/utils/exhibitionImg2ImgPromptData.js';

test('exhibition img2img node accepts document text input', () => {
  const ports = readFileSync(new URL('../src/config/portTypes.ts', import.meta.url), 'utf8');
  assert.match(ports, /'exhibition-img2img':\s*\{\s*inputs:\s*\['text', 'image'\],\s*outputs:\s*\['image', 'text'\]\s*\}/);
});

test('exhibition img2img node exposes final prompt as text output', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionImg2ImgNode.tsx', import.meta.url), 'utf8');
  const upstream = readFileSync(new URL('../src/components/nodes/useUpstreamMaterials.ts', import.meta.url), 'utf8');
  const output = readFileSync(new URL('../src/components/nodes/OutputNode.tsx', import.meta.url), 'utf8');
  assert.match(node, /id="prompt"[\s\S]*type="source"[\s\S]*PORT_COLOR\.text/);
  assert.match(node, /title="输出：最终提示词文本"/);
  assert.match(node, /prompt:\s*promptForRun[\s\S]*outputText:\s*promptForRun[\s\S]*text:\s*promptForRun/);
  assert.match(upstream, /n\.type === 'exhibition-img2img'/);
  assert.match(upstream, /handles\.has\('prompt'\) \|\| handles\.has\(null\)/);
  assert.match(output, /\(n as any\)\?\.type === 'exhibition-img2img'/);
  assert.match(output, /handles\.has\('prompt'\) \|\| handles\.has\(null\)/);
});

test('exhibition img2img content planning can limit final prompt to a wall range', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionImg2ImgNode.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  assert.match(canvas, /contentWallStart:\s*1/);
  assert.match(canvas, /contentWallEnd:\s*3/);
  assert.match(node, /function normalizeContentWallRange/);
  assert.match(node, /const contentWallRange = normalizeContentWallRange\(d\.contentWallStart, d\.contentWallEnd, wallMode, wallCount\)/);
  assert.match(node, /const promptContentOutputs = useMemo/);
  assert.match(node, /contentOutputs\.walls\.slice\(contentWallRange\.start - 1, contentWallRange\.end\)/);
  assert.match(node, /const wallContentPrompt = hasContentPlanning \? promptContentOutputs\.mainOutput : ''/);
  assert.match(node, /walls: plan\.walls\.slice\(contentWallRange\.start - 1, contentWallRange\.end\)/);
  assert.match(node, /contentWallEnd: Math\.max\(nextStart, contentWallRange\.end\)/);
  assert.match(node, /clampWallIndex\(event\.target\.value, contentWallRange\.start, contentWallRange\.total, contentWallRange\.total\)/);
  assert.match(node, /wasFullRange \? nextCount : contentWallRange\.end/);
  assert.match(node, /title="起始立面"/);
  assert.match(node, /title="截止立面"/);
});

test('exhibition img2img content planning exposes wall length mode and totals', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionImg2ImgNode.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  assert.match(canvas, /wallLengthMode:\s*'estimate'/);
  assert.match(node, /estimateElevationWallLength/);
  assert.match(node, /const wallLengthMode: 'estimate' \| 'llm'/);
  assert.match(node, /wallLengthMode,\s*wallRangeStart: contentWallRange\.start,\s*wallRangeEnd: contentWallRange\.end/s);
  assert.match(node, /value=\{wallLengthMode\}/);
  assert.match(node, /<option value="estimate">按内容估算长度<\/option>/);
  assert.match(node, /<option value="llm">AI 生成长度<\/option>/);
  assert.match(node, /范围合计约 \{Number\(promptContentOutputs\.wallLengthTotalM \|\| 0\)\.toFixed\(1\)\}m/);
  assert.match(node, /大致长度：\{Number\(wall\.approxLengthM \|\| estimateElevationWallLength\(wall\)\)\.toFixed\(1\)\}m/);
});

test('exhibition img2img node exposes mutually exclusive plan layout input', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionImg2ImgNode.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  assert.match(node, /handleId="plan-layout"/);
  assert.match(node, /PlanCameraModalEditor/);
  assert.match(node, /createPortal/);
  assert.match(node, /text-red-300/);
  assert.match(canvas, /params\.targetHandle === 'structure' \|\| params\.targetHandle === 'plan-layout'/);
  assert.match(canvas, /exclusiveExhibitionImg2ImgHandle/);
});

test('exhibition img2img node supports @ image mentions for prompt image references', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionImg2ImgNode.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  assert.match(node, /import MentionPromptInput from '\.\/MentionPromptInput'/);
  assert.match(node, /resolveMediaMentions/);
  assert.match(node, /type MediaMention/);
  assert.match(node, /import type \{ Material \} from '\.\/useUpstreamMaterials'/);
  assert.match(node, /const orderedReferenceMaterials = useMemo/);
  assert.match(node, /const orderedReferenceImages = useMemo\(\(\) => orderedReferenceMaterials\.map\(\(item\) => item\.url\)/);
  assert.match(node, /const mentionMaterials: Material\[\] = useMemo\(\(\) => orderedReferenceMaterials\.map/);
  assert.match(node, /referenceRoleHints/);
  assert.match(node, /spatialRole === 'plan-layout'/);
  assert.match(node, /role: 'color-material-reference'/);
  assert.match(node, /role: 'exhibit-reference'/);
  assert.match(node, /for \(const item of orderedReferenceMaterials\)[\s\S]*item\.role === 'color-material-reference'/);
  assert.match(node, /<MentionPromptInput[\s\S]*mentions=\{customCraftMentions\}[\s\S]*materials=\{mentionMaterials\}[\s\S]*customCraftMentions: mentions/);
  assert.match(node, /<MentionPromptInput[\s\S]*mentions=\{visualStyleMentions\}[\s\S]*materials=\{mentionMaterials\}[\s\S]*visualStyleMentions: mentions/);
  assert.match(node, /<MentionPromptInput[\s\S]*mentions=\{supplementMentions\}[\s\S]*materials=\{mentionMaterials\}[\s\S]*supplementMentions: mentions/);
  assert.match(node, /mentions=\{colorMaterialPaletteMentions\}/);
  assert.match(node, /mentions=\{colorMaterialTexturesMentions\}/);
  assert.match(node, /mentions=\{colorMaterialReferenceToneMentions\}/);
  assert.match(node, /descriptionMentions: mentions/);
  assert.match(node, /resolveText\(d\.customCraft, customCraftMentions\)/);
  assert.match(node, /resolveText\(d\.visualStyle, visualStyleMentions\)/);
  assert.match(node, /resolveText\(d\.supplement, supplementMentions\)/);
  assert.match(node, /resolveText\(promptColorMaterialPalette, colorMaterialPaletteMentions\)/);
  assert.match(node, /resolveText\(promptColorMaterialTextures, colorMaterialTexturesMentions\)/);
  assert.match(node, /resolveText\(colorMaterialReferenceTone, colorMaterialReferenceToneMentions\)/);
  assert.match(node, /description: resolveText\(item\.description, mediaMentions\(item\.descriptionMentions\)\)/);
  assert.match(canvas, /customCraftMentions: \[\]/);
  assert.match(canvas, /colorMaterialReferenceToneMentions: \[\]/);
});

test('exhibition img2img craft presets are grouped by category', () => {
  const node = readFileSync(new URL('../src/components/nodes/ExhibitionImg2ImgNode.tsx', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../backend/src/routes/promptLibrary.js', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');
  const proxy = readFileSync(new URL('../backend/src/routes/proxy.js', import.meta.url), 'utf8');
  assert.match(node, /CRAFT_CATEGORIES = \['装饰', '多媒体', '艺术品', '展陈', '展柜', '展台', '顶部', '其它'\]/);
  assert.match(node, /分类｜名称｜提示词/);
  assert.match(node, /craftGroups\.map/);
  assert.match(node, /craftRandomCounts/);
  assert.match(node, /resolveRuntimeCrafts/);
  assert.match(node, /-1 表示补入全部未选项/);
  assert.match(node, /min=\{-1\}/);
  assert.match(canvas, /craftRandomCounts: \{\}/);
  assert.match(canvas, /generationCount: 1/);
  assert.match(canvas, /imageName: ''/);
  assert.match(canvas, /imageNames: \[\]/);
  assert.match(node, /const generationCount = clampNumber\(d\.generationCount, MIN_IMAGE_COUNT, MAX_IMAGE_COUNT, 1\)/);
  assert.match(node, /for \(let roundIndex = 1; roundIndex <= generationCount; roundIndex \+= 1\)/);
  assert.match(node, /completeRound\(roundIndex/);
  assert.match(node, /n: 1/);
  assert.match(node, /图像名称/);
  assert.match(node, /normalizeExhibitionImageName\((event\.target\.value|value)\)/);
  assert.match(node, /formatExhibitionOutputImageName\(baseImageName, roundIndex, generationCount, '展陈图'\)/);
  assert.match(node, /outputTitle: formatExhibitionOutputImageName/);
  assert.match(node, /generateExhibitionImageNameWithLlm/);
  assert.match(node, /const outputImageUrls = Array\.isArray\(d\.imageUrls\)/);
  assert.match(node, /const outputImageNames = Array\.isArray\(d\.imageNames\)/);
  assert.match(node, /outputImageUrls\.map/);
  assert.match(proxy, /const imageCount = Math\.max\(1, Math\.min\(4, parseInt\(n \?\? 1, 10\) \|\| 1\)\)/);
  assert.match(proxy, /form\.append\('n', String\(imageCount\)\)/);
  assert.match(proxy, /const body = \{ prompt, model: finalApiModel, aspect_ratio: isAuto \? '1:1' : ar, n: imageCount \}/);
  assert.match(backend, /ELEVATION_CRAFT_CATEGORIES/);
  assert.match(backend, /category: ELEVATION_CRAFT_CATEGORIES\.has\(category\) \? category : '其它'/);
});

test('exhibition img2img prompt can use plan layout camera mode', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    spatialInputMode: 'plan-camera',
    planCameraDescription: '相机位置：平面图归一化坐标 x=0.500, y=0.820；相机朝向：-90°；取景角：60°；画面选区比例：16:9；平面图在选区内缩放：5.00x，偏移 x=-0.289, y=-0.172；请按该视角渲染展陈空间图像。',
  });
  assert.match(prompt, /平面布局图与相机视角约束/);
  assert.match(prompt, /平面布局图/);
  assert.match(prompt, /按该视角渲染/);
  assert.doesNotMatch(prompt, /相机位置/);
  assert.doesNotMatch(prompt, /归一化坐标/);
  assert.doesNotMatch(prompt, /画面选区比例/);
  assert.doesNotMatch(prompt, /偏移 x=/);
  assert.doesNotMatch(prompt, /空间结构示意图是最终画面的唯一空间骨架和布局蓝本/);
});

test('exhibition img2img prompt documents @img reference roles in runtime order', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    referenceRoleHints: [
      { token: '@img1', role: 'plan-layout' },
      { token: '@img2', role: 'color-material-reference' },
      { token: '@img3', role: 'exhibit-reference', index: 1 },
      { token: '@img4', role: 'exhibit-reference', index: 2 },
    ],
  });
  assert.match(prompt, /图像输入引用顺序/);
  assert.match(prompt, /@imgN 必须与实际传入生图模型的第 N 张参考图一致/);
  assert.match(prompt, /@img1 = 平面布局相机视角图/);
  assert.match(prompt, /@img2 = 色彩与材质参考图/);
  assert.match(prompt, /@img3 = 展品参考图 1/);
  assert.match(prompt, /@img4 = 展品参考图 2/);
});

test('exhibition img2img prompt defaults to structure priority', () => {
  const order = normalizeExhibitionImg2ImgPriority();
  assert.deepEqual(order, ['structureAnnotations', 'craftLayout', 'colorMaterialReference']);
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /^1\. 核心任务与最高约束/);
  assert.match(prompt, /2\. 执行优先级（除空间结构外）/);
  assert.match(prompt, /3\. 工艺与版式深化/);
  assert.match(prompt, /4\. 展墙内容与设计（分立面执行）/);
  assert.match(prompt, /5\. 色彩与材质体系/);
  assert.match(prompt, /6\. 展品呈现/);
  assert.match(prompt, /7\. 最终输出约束（必读）/);
  assert.match(prompt, /任务：生成一张专业展陈空间效果图，要求真实室内建筑摄影级渲染/);
  assert.match(prompt, /第一优先级：工艺与版式/);
  assert.doesNotMatch(prompt, /^优先级顺序：/m);
  assert.doesNotMatch(prompt, /面向深化设计汇报/);
  assert.doesNotMatch(prompt, /空间表现效果图|高级渲染参考图|输入效果图形式/);
  assert.doesNotMatch(prompt, /色彩与材质参考图/);
});

test('exhibition img2img prompt follows custom priority order', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['colorMaterialReference', 'craftLayout', 'structureAnnotations'],
  });
  const colorMaterialIndex = prompt.indexOf('第一优先级：色彩与材质体系');
  const craftIndex = prompt.indexOf('第二优先级：工艺与版式');
  assert.ok(colorMaterialIndex >= 0 && craftIndex > colorMaterialIndex);
  assert.match(prompt, /最高优先级（不可违反）：空间结构示意图是最终画面的唯一空间骨架和布局蓝本/);
});

test('exhibition img2img prompt maps legacy style priority to color material reference', () => {
  const order = normalizeExhibitionImg2ImgPriority(['styleImageForm', 'craftLayout', 'structureAnnotations']);
  assert.deepEqual(order, ['colorMaterialReference', 'craftLayout', 'structureAnnotations']);
});

test('exhibition img2img prompt forbids rendering structure labels', () => {
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /效果图中不得出现示意图上的任何文字、箭头、编号、尺寸线或图例标签/);
  assert.match(prompt, /画面中不得出现结构示意图上的标注文字、箭头、尺寸线或任何乱码文本/);
});

test('exhibition img2img prompt includes img2img exclusions', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    excludeItems: ['real-brand-logo', 'instruction-table'],
  });
  assert.match(prompt, /排除项：不得出现：真实品牌标识和说明表格。/);
});

test('exhibition img2img prompt treats structure image as layout source', () => {
  const prompt = buildExhibitionImg2ImgPrompt();
  assert.match(prompt, /空间结构示意图是最终画面的唯一空间骨架和布局蓝本/);
  assert.match(prompt, /必须精确提取并遵循示意图中的平面\/轴测结构、墙体位置、展陈体块比例/);
  assert.match(prompt, /输出画面必须与示意图具有可被一眼识别的相同空间关系/);
  assert.match(prompt, /任何部分都不能被改变或重新设计/);
});

test('exhibition img2img priority only affects presentation, not spatial structure', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['colorMaterialReference', 'craftLayout', 'structureAnnotations'],
  });
  assert.match(prompt, /此优先级仅用于决定工艺、材质、色彩和风格的取舍/);
  assert.match(prompt, /不得为了迁就色彩或材质而改变第一条中定义的空间结构/);
  assert.match(prompt, /第一优先级：色彩与材质体系/);
  assert.match(prompt, /最高优先级（不可违反）/);
});

test('exhibition img2img prompt can include wall content planning', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    wallContentPrompt: '立面 1｜序厅\n内容摘要：品牌发展脉络\n准确文案：初心 / 创新',
  });
  assert.match(prompt, /4\. 展墙内容与设计（分立面执行）/);
  assert.match(prompt, /（1）立面 1：序厅/);
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
  assert.match(prompt, /重点文案占位：初心 \/ 创新/);
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
  assert.match(prompt, /空间氛围：品牌起源/);
  assert.match(prompt, /重点文案占位：初心 \/ 创新/);
  assert.doesNotMatch(prompt, /尺寸\s*\/\s*比例\s*[:：]/);
});

test('exhibition img2img prompt forbids rendering design instruction fields as wall text', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    selectedCrafts: ['custom-craft'],
    craftPresets: [{ id: 'custom-craft', label: '定制工艺', prompt: '金属立体字与软膜灯箱' }],
    density: '信息丰富，采用严谨网格',
    wallContentPrompt: '工艺配置：展板、立体字\n版式备注：适中，沿用整体视觉体系',
  });
  assert.match(prompt, /不得出现“展陈工艺”、“版式密度”等字段名或任何具体的设计说明文字/);
  assert.match(prompt, /不得将“展陈工艺”、“版式密度”、“工艺配置”、“版式备注”等字段或其后跟随的具体要求，作为画面中的文字呈现/);
  assert.match(prompt, /工艺落位：展板、立体字/);
  assert.doesNotMatch(prompt, /^工艺配置：/m);
});

test('exhibition img2img prompt uses color material reference image as material source', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    hasColorMaterialReferenceImage: true,
    colorMaterialPriorityMode: 'frontend',
    colorMaterialReferenceTone: '主色调：深红、铜褐、黑灰；整体偏暖，明度偏暗，饱和度适中。',
  });
  assert.match(prompt, /色彩与材质来源：使用前端识别的色彩与材质参考图主色调结果/);
  assert.match(prompt, /Color palette：主色调：深红、铜褐、黑灰；整体偏暖，明度偏暗，饱和度适中。/);
  assert.match(prompt, /色彩与材质参考输入：左上角带 图2 标识的色彩与材质参考图/);
  assert.match(prompt, /不得作为空间布局、墙体位置、展台位置、通道组织或透视角度依据/);
});

test('exhibition img2img prompt uses llm color material recognition like creative node', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    hasColorMaterialReferenceImage: true,
    colorMaterialPriorityMode: 'llm',
    colorMaterialReferenceMode: 'abstract-card',
    colorMaterialReferenceTone: '主色调：前端识别不应进入大模型识别模式',
  });
  assert.match(prompt, /色彩与材质来源：使用大模型识别接入的色彩与材质参考图/);
  assert.match(prompt, /色彩与材质参考输入：色彩与材质抽象卡片/);
  assert.match(prompt, /Color palette：从色彩与材质参考图中提取主色、辅助色、金属色、明暗关系、冷暖倾向和局部发光色/);
  assert.doesNotMatch(prompt, /前端识别不应进入大模型识别模式/);
});

test('exhibition img2img prompt ignores preset text when color material reference is connected', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    hasColorMaterialPreset: true,
    hasColorMaterialReferenceImage: true,
    colorMaterialPriorityMode: 'frontend',
    colorMaterialReferenceTone: '主色调：青绿、暖白；冷暖较均衡。',
    colorMaterial: '不应出现的预设材质描述',
    colorMaterialPalette: '不应出现的预设色盘',
    colorMaterialTextures: '不应出现的预设肌理',
  });

  assert.match(prompt, /色彩与材质来源：使用前端识别的色彩与材质参考图主色调结果/);
  assert.match(prompt, /主色调：青绿、暖白；冷暖较均衡。/);
  assert.doesNotMatch(prompt, /使用已选择的共享色彩与材质预设/);
  assert.doesNotMatch(prompt, /不应出现的预设/);
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

test('exhibition img2img prompt lets overall lighting override color material brightness', () => {
  const disabled = buildExhibitionImg2ImgPrompt({
    spaceLightingEnabled: false,
    spaceLightingLevel: 'very-dark',
    colorMaterialPalette: '非常亮 白色 明亮 high-key palette',
    colorMaterialTextures: '比较亮 发光亚克力 bright metal',
  });
  assert.doesNotMatch(disabled, /IMPORTANT overall lighting priority/);
  assert.match(disabled, /非常亮/);

  const enabled = buildExhibitionImg2ImgPrompt({
    spaceLightingEnabled: true,
    spaceLightingLevel: 'very-dark',
    colorMaterialPalette: '非常亮 白色 明亮 high-key palette',
    colorMaterialTextures: '比较亮 发光亚克力 bright metal',
  });
  assert.match(enabled, /IMPORTANT overall lighting priority: very dark overall space lighting/);
  assert.match(enabled, /overrides any brightness/);
  assert.doesNotMatch(enabled, /非常亮|比较亮|high-key|bright metal/);
});

test('exhibition img2img prompt uses manual color material text', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    colorMaterial: '深色金属与暖光',
  });
  assert.match(prompt, /色彩与材质来源：使用手动填写的色彩与材质要求/);
  assert.match(prompt, /色彩与材质：深色金属与暖光/);
  assert.doesNotMatch(prompt, /色彩与材质参考图/);
});

test('exhibition img2img prompt explains reference image roles after priority changes', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    priorityOrder: ['colorMaterialReference', 'craftLayout', 'structureAnnotations'],
    hasColorMaterialReferenceImage: true,
  });
  assert.match(prompt, /空间结构示意图是最终画面的唯一空间骨架和布局蓝本/);
  assert.match(prompt, /色彩与材质来源：使用前端识别的色彩与材质参考图主色调结果/);
  assert.doesNotMatch(prompt, /第 \d+ 张参考图是空间结构示意图/);
  assert.doesNotMatch(prompt, /第 \d+ 张参考图是色彩与材质参考图/);
});

test('exhibition img2img prompt includes craft and layout values when present', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    selectedCrafts: ['custom-craft'],
    craftPresets: [{ id: 'custom-craft', label: '定制工艺', prompt: '定制工艺提示词' }],
    customCraft: '补充工艺',
    density: '信息丰富',
    dimensions: '3.6',
    colorMaterial: '深色金属与暖光',
    visualStyle: '未来科技',
    supplement: '入口处保持开阔',
  });
  assert.match(prompt, /定制工艺提示词/);
  assert.match(prompt, /补充工艺/);
  assert.match(prompt, /信息丰富/);
  assert.match(prompt, /空间高度：3\.6米/);
  assert.doesNotMatch(prompt, /空间\/画面尺寸/);
  assert.match(prompt, /深色金属与暖光/);
  assert.match(prompt, /未来科技/);
  assert.match(prompt, /入口处保持开阔/);
});

test('exhibition img2img prompt describes exhibit reference images', () => {
  const prompt = buildExhibitionImg2ImgPrompt({
    exhibitReferenceItems: [
      { url: '/files/input/red-pot.png', description: '红色陶器' },
      { url: '/files/input/bronze.png', description: '青铜鼎' },
    ],
  });
  assert.match(prompt, /展品参考图/);
  const first = prompt.indexOf('图中红色陶器参考图作为主要展品参考素材。');
  const second = prompt.indexOf('图中青铜鼎参考图作为主要展品参考素材。');
  assert.ok(first >= 0 && second > first);
  assert.match(prompt, /展品参考图只用于提取展品外观、内容主题、体量关系、材质细节和展示重点/);
  assert.match(prompt, /不作为空间结构、布局比例或整体色彩材质体系依据/);
});
