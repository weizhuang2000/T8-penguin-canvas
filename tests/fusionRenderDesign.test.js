import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FUSION_RENDER_AUTO_CEILING_CRAFT,
  FUSION_RENDER_AUTO_FLOOR_MATERIAL,
  FUSION_RENDER_CEILING_CRAFTS,
  FUSION_RENDER_VENUE_TYPES,
  buildFusionRenderPrompt,
} from '../src/utils/fusionRenderDesignData.js';

const root = path.resolve('.');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('fusion render node is registered across canvas, permissions and compact form', () => {
  assert.match(read('src/types/canvas.ts'), /'fusion-render-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'fusion-render-design'[^\n]*label: '融合效果图'/);
  assert.match(read('src/config/portTypes.ts'), /'fusion-render-design': \{ inputs: \['image'\], outputs: \['image'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design': FusionRenderDesignNode/);
  assert.match(read('src/utils/nodePlacement.ts'), /'fusion-render-design': \{ w: 520, h: 720 \}/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'fusion-render-design'/);
  assert.match(read('src/components/nodes/ExhibitionTextImageLoopNode.tsx'), /'fusion-render-design'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'fusion-render-design'/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /nodeType: 'fusion-render-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /nodeType: 'fusion-render-design'/);
  assert.match(read('src/config/nodeHelpDefaults.ts'), /'fusion-render-design': `# 融合效果图/);
  assert.match(read('features.json'), /"nodeType": "fusion-render-design"/);
});

test('space reference is optional and exclusive while exhibit references remain required and multi-source', () => {
  const canvas = read('src/components/Canvas.tsx');
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(canvas, /targetType === 'fusion-render-design' && handle === 'space-reference'[\s\S]*return \[handle\]/);
  assert.doesNotMatch(canvas, /targetType === 'fusion-render-design' && handle === 'exhibit-reference'/);
  assert.match(node, /id="space-reference"[^>]*type="target"/);
  assert.match(node, /id="exhibit-reference"[^>]*type="target"/);
  assert.match(node, /if \(!exhibitImages\.length\) throw new Error\('请至少连接一张展项效果图'\)/);
  assert.doesNotMatch(node, /if \(!spaceReferenceImage\) throw/);
});

test('manual layout, direction controls and hall length-width settings are removed', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.doesNotMatch(node, /打开手动排版|ReverseIsometricLayoutModal|manualLayoutItems|layoutReference|describeFusionRenderLayout/);
  assert.match(node, /展厅净高 mm/);
  assert.doesNotMatch(node, /透视相机观察方向|REVERSE_ISOMETRIC_DIRECTIONS|hallLengthMm|hallWidthMm/);
});

test('reference ordering changes with space reference availability and previous output survives failures', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /spaceReferenceImage \? \[spaceReferenceImage, \.\.\.exhibitImages\.map/);
  assert.match(node, /: exhibitImages\.map/);
  assert.match(node, /const previousOutput = \{ imageUrl:/);
  assert.match(node, /update\(\{ \.\.\.previousOutput, status: 'error'/);
  assert.match(node, /imageUrl: candidate, imageUrls: \[candidate\], urls: \[candidate\]/);
});

test('prompt describes both structural modes and always requests one realistic perspective render', () => {
  const planned = buildFusionRenderPrompt({ hasSpaceReference: true, exhibitCount: 2, hallHeightMm: 5600, floorMaterial: '深灰水磨石' });
  assert.match(planned, /@img1 是空间参考图/);
  assert.match(planned, /@img2 至 @img3/);
  for (const term of ['空间几何', '面积感', '平面长宽比例', '墙柱开口', '5600 mm', '深灰水磨石']) assert.match(planned, new RegExp(term));
  assert.match(planned, /必须完全忽略 @img1 的设计语言、装饰风格、色彩、材质、灯光、曝光、环境氛围、原有展项、人物和文字/);

  const blank = buildFusionRenderPrompt({ hasSpaceReference: false, exhibitCount: 2 });
  assert.match(blank, /@img1 至 @img2 是需要作为素材融入展厅的展项原始外观参考/);
  assert.match(blank, /没有空间参考图时/);
  for (const term of ['完整展厅效果图', '底座落地', '禁止拼版', '不得输出俯视平面图、轴侧图']) assert.match(blank, new RegExp(term));
});

test('ceiling craft offers automatic styling first plus twenty common crafts', () => {
  assert.equal(FUSION_RENDER_AUTO_CEILING_CRAFT, '根据所有展项风格自动调整');
  assert.equal(FUSION_RENDER_CEILING_CRAFTS.length, 20);
  assert.equal(new Set(FUSION_RENDER_CEILING_CRAFTS).size, 20);

  const automatic = buildFusionRenderPrompt({ ceilingCraft: FUSION_RENDER_AUTO_CEILING_CRAFT, exhibitCount: 2 });
  assert.match(automatic, /根据全部展项原始外观参考的设计风格、色彩、材质、造型语言和灯光气质自动选择/);

  const specified = buildFusionRenderPrompt({ ceilingCraft: '铝方通吊顶' });
  assert.match(specified, /明确采用“铝方通吊顶”/);
  assert.match(specified, /真实可施工/);

  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /顶部工艺/);
  assert.match(node, /FUSION_RENDER_AUTO_CEILING_CRAFT/);
  assert.match(node, /FUSION_RENDER_CEILING_CRAFTS\.map/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*ceilingCraft: '根据所有展项风格自动调整'/);
});

test('node keeps hall height and prompt uses it as the physical scale', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /value=\{hallHeightMm\}/);
  const prompt = buildFusionRenderPrompt({ hallHeightMm: 5000 });
  assert.match(prompt, /展厅净高绝对硬约束：5000 mm/);
  assert.doesNotMatch(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*hallLengthMm: 12000/);
});

test('prompt creates a coherent realistic ambience without inventing primary exhibits', () => {
  const prompt = buildFusionRenderPrompt({ exhibitCount: 3 });
  for (const term of ['环境氛围融合', '全部展项原始外观参考', '墙面处理', '基础照明', '重点照明', '空间色温', '收口节点', '真实自然约束', '接触阴影', '材质响应']) {
    assert.match(prompt, new RegExp(term));
  }
  assert.match(prompt, /不是把展项放进空白房间/);
  assert.match(prompt, /不得新增未提供的主要展项/);
  assert.match(prompt, /自动完成专业展陈布置/);
  assert.match(prompt, /已完成布展并经过专业摄影的真实展厅/);
  assert.match(prompt, /不得遮挡展项、形成拥挤人群/);
});

test('prompt automatically arranges exhibits and fills only large distant gaps', () => {
  const prompt = buildFusionRenderPrompt({ exhibitCount: 2 });
  assert.match(prompt, /根据展馆类型、展厅主体、空间参考图提供的纯空间几何及展厅净高自动完成专业展陈布置/);
  assert.match(prompt, /保证通道、观看距离、安全边界和主次层级自然可信/);
  assert.match(prompt, /仅当展厅确实存在连续的大面积空白区域时/);
  assert.match(prompt, /同主题、同类型、同设计语言/);
  assert.match(prompt, /异形图文墙体/);
  assert.match(prompt, /画面远端或背景空档/);
  assert.match(prompt, /较弱对比度、较低饱和度和真实景深虚化/);
  assert.match(prompt, /近景和中景不得用新增物填满/);

  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.doesNotMatch(node, /describeFusionRenderLayout|layoutItems|manualLayoutItems/);
});

test('venue type defaults to science museum and offers twenty common choices', () => {
  assert.equal(FUSION_RENDER_VENUE_TYPES.length, 20);
  assert.equal(new Set(FUSION_RENDER_VENUE_TYPES).size, 20);
  assert.equal(FUSION_RENDER_VENUE_TYPES[0], '科技馆');
  for (const type of ['博物馆', '自然博物馆', '艺术馆', '美术馆', '规划展示馆', '企业展厅', '纪念馆', '非遗展示馆']) {
    assert.ok(FUSION_RENDER_VENUE_TYPES.includes(type));
  }

  const prompt = buildFusionRenderPrompt({ venueType: '自然博物馆', exhibitCount: 2 });
  assert.match(prompt, /展馆类型：自然博物馆/);
  assert.match(prompt, /环境氛围、辅助内容、专业设施和空档填充/);
  assert.match(prompt, /符合“自然博物馆”属性/);
  assert.doesNotMatch(prompt, /展陈空间透视效果图/);
  assert.doesNotMatch(prompt, /展项正立面/);
  assert.match(prompt, /相机必须保持约 1\.4–1\.6 米的较低正常人眼高度/);
  assert.match(prompt, /自动完成专业展陈布置/);

  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /展馆类型/);
  assert.match(node, /FUSION_RENDER_VENUE_TYPES\.map/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*venueType: '科技馆'/);
});

test('floor design defaults to exhibit-driven styling and visible walls are never empty', () => {
  assert.equal(FUSION_RENDER_AUTO_FLOOR_MATERIAL, '根据展项来设计');
  const automatic = buildFusionRenderPrompt({ floorMaterial: FUSION_RENDER_AUTO_FLOOR_MATERIAL, venueType: '科技馆', exhibitCount: 2 });
  assert.match(automatic, /地面设计：根据全部主展项的主题、风格、色彩、材质、造型语言和灯光气质自动设计/);
  assert.match(automatic, /不得出现与展项无关的抢眼图案/);
  assert.match(automatic, /墙面内容硬约束/);
  assert.match(automatic, /不得出现大面积无内容、无设计的空白墙面/);
  assert.match(automatic, /主题图文、科普信息图形、材质肌理、灯光洗墙、嵌入式展示、异形图文墙/);
  assert.match(automatic, /不得生成乱码或不可读的伪文字/);

  const specified = buildFusionRenderPrompt({ floorMaterial: '深灰水磨石' });
  assert.match(specified, /地面设计：统一采用“深灰水磨石”/);

  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /<option value=\{FUSION_RENDER_AUTO_FLOOR_MATERIAL\}>\{FUSION_RENDER_AUTO_FLOOR_MATERIAL\}<\/option>\{REVERSE_ISOMETRIC_FLOOR_MATERIALS\.map/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*floorMaterial: '根据展项来设计'/);
});

test('hall subject can be explicit or inferred while camera stays low and allows occlusion', () => {
  const inferred = buildFusionRenderPrompt({ venueType: '科技馆', hallSubject: '', exhibitCount: 3 });
  assert.match(inferred, /当前未填写，由模型根据全部接入展项的共同主题、内容属性、视觉风格和科技方向自动归纳/);

  const explicit = buildFusionRenderPrompt({ venueType: '科技馆', hallSubject: '未来能源科技互动体验', exhibitCount: 3 });
  assert.match(explicit, /核心任务：以生成一张“科技馆”类型的完整展厅效果图为主/);
  assert.match(explicit, /把所有接入的展项参考图作为展陈素材/);
  assert.match(explicit, /接入图像是展项外观与内容素材，不是要求逐张完整展示的独立画面/);
  assert.match(explicit, /展厅主体：明确以“未来能源科技互动体验”作为整个展厅的核心主题/);
  assert.match(explicit, /1\.4–1\.6 米的较低正常人眼高度/);
  assert.match(explicit, /平视或轻微仰视/);
  assert.match(explicit, /不要为了让所有展项同时完整出现在画面中而提高相机/);
  assert.match(explicit, /展项可以按照真实空间前后关系被其他展项、墙体、辅助结构或画面边缘自然局部遮挡/);
  assert.match(explicit, /也可以有部分展项位于画面之外/);
  assert.match(explicit, /无需强行让每个展项完整露脸/);
  assert.match(explicit, /不能把被遮挡展项从空间中删除/);

  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /展厅主体（留空则根据展项定义）/);
  assert.match(node, /placeholder="例如：未来能源科技互动体验；留空自动归纳"/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*hallSubject: ''/);
});

test('color and material presets reuse exhibition img2img shared data and selector', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /getElevationPromptPresets\(\)/);
  assert.match(node, /presets\.colorMaterial \|\| \[\]/);
  assert.match(node, /ColorMaterialPresetSelect/);
  assert.match(node, /colorMaterialTextFromPreset/);
  assert.match(node, /手动色彩与材质补充/);

  const presetPrompt = buildFusionRenderPrompt({ colorMaterialPresetText: '未来科技蓝｜深灰金属｜冷白光' });
  assert.match(presetPrompt, /色彩与材质预设：严格采用共享预设/);
  assert.match(presetPrompt, /未来科技蓝｜深灰金属｜冷白光/);
  assert.match(presetPrompt, /空间参考图的设计语言、色彩、材质、灯光和环境氛围一律不参与/);
  assert.match(presetPrompt, /不要被展项自身背景色覆盖/);

  const manualPrompt = buildFusionRenderPrompt({ colorMaterial: '墙面深蓝，金属拉丝，局部青色灯带' });
  assert.match(manualPrompt, /色彩与材质补充：墙面深蓝，金属拉丝，局部青色灯带/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*colorMaterialPreset: '',[\s\S]*colorMaterial: ''/);
});

test('space reference constrains only geometry while configured height is absolute', () => {
  const prompt = buildFusionRenderPrompt({ hasSpaceReference: true, hallHeightMm: 6200, colorMaterialPresetText: '暖白石材与深色金属' });
  assert.match(prompt, /只用于约束空间几何、面积感、平面长宽比例、面积与高度比例、墙柱开口、边界和纵深/);
  assert.match(prompt, /严禁从中采用设计语言、色彩、材质、灯光或环境氛围/);
  assert.match(prompt, /严格保持 @img1 的空间边界、平面长宽比例、总体面积感、面积与高度的相对比例/);
  assert.match(prompt, /节点设置的净高 6200 mm 是唯一绝对高度基准/);
  assert.match(prompt, /将参考图的面积—高度关系按 6200 mm 等比换算/);
  assert.match(prompt, /不得擅自压低、抬高、拉长、压缩或扩大空间/);
  assert.match(prompt, /展厅净高绝对硬约束：6200 mm/);
  assert.match(prompt, /该数值优先于空间参考图中的视觉高度、透视错觉和原始建筑高度/);
  assert.match(prompt, /空间参考图的设计语言、色彩、材质、灯光和环境氛围一律不参与/);
  assert.match(prompt, /色彩与材质预设：严格采用共享预设“暖白石材与深色金属”/);
});
