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
  describeFusionRenderLayout,
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

test('plan is optional and exclusive while exhibit references remain required and multi-source', () => {
  const canvas = read('src/components/Canvas.tsx');
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(canvas, /targetType === 'fusion-render-design' && handle === 'plan-layout'[\s\S]*return \[handle\]/);
  assert.doesNotMatch(canvas, /targetType === 'fusion-render-design' && handle === 'exhibit-reference'/);
  assert.match(node, /id="plan-layout"[^>]*type="target"/);
  assert.match(node, /id="exhibit-reference"[^>]*type="target"/);
  assert.match(node, /if \(!exhibitImages\.length\) throw new Error\('请至少连接一张展项效果图'\)/);
  assert.doesNotMatch(node, /if \(!planImage\) throw/);
});

test('blank rectangle follows hall dimensions and layout transforms use the shared editor/exporter', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  const editor = read('src/components/nodes/ReverseIsometricDesignNode.tsx');
  assert.match(node, /createBlankStage\(hallLengthMm, hallWidthMm\)/);
  assert.match(node, /aspectRatio=\{`\$\{hallLengthMm\} \/ \$\{hallWidthMm\}`\}/);
  assert.match(node, /空白矩形空间/);
  assert.match(node, /createDimensionedStage\(planUrl, hallLengthMm, hallWidthMm\)/);
  assert.match(node, /buildReverseIsometricLayoutReference\(dimensionedStage, items\)/);
  for (const term of ['stretch-x', 'stretch-y', 'scale', 'rotate', '源图裁剪', 'zIndex']) assert.match(editor, new RegExp(term));
});

test('reference ordering changes with plan availability and previous output survives failures', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /planImage \? \[planImage, layoutReference, \.\.\.layoutItems\.map/);
  assert.match(node, /: \[layoutReference, \.\.\.layoutItems\.map/);
  assert.match(node, /const previousOutput = \{ imageUrl:/);
  assert.match(node, /update\(\{ \.\.\.previousOutput, status: 'error'/);
  assert.match(node, /imageUrl: candidate, imageUrls: \[candidate\], urls: \[candidate\]/);
});

test('prompt describes both structural modes and always requests one realistic perspective render', () => {
  const planned = buildFusionRenderPrompt({ hasPlan: true, exhibitCount: 2, hallHeightMm: 5600, floorMaterial: '深灰水磨石' });
  assert.match(planned, /@img1 是原始平面结构基准/);
  assert.match(planned, /@img2 是俯视排版定位图/);
  assert.match(planned, /@img3 至 @img4/);
  for (const term of ['墙体中心线', '柱网', '出入口', '门', '窗', '5600 mm', '深灰水磨石']) assert.match(planned, new RegExp(term));

  const blank = buildFusionRenderPrompt({ hasPlan: false, exhibitCount: 2 });
  assert.match(blank, /@img1 是矩形空间内的俯视排版定位图/);
  assert.match(blank, /@img2 至 @img3/);
  assert.match(blank, /简洁、完整的矩形展厅/);
  for (const term of ['写实', '展陈空间效果图', '底座落地', '禁止拼版', '不得输出俯视平面图、轴侧图']) assert.match(blank, new RegExp(term));
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

test('layout editor configures hall length and width and prompt uses physical dimensions', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  const editor = read('src/components/nodes/ReverseIsometricDesignNode.tsx');
  assert.match(node, /hallLengthMm=\{hallLengthMm\}/);
  assert.match(node, /hallWidthMm=\{hallWidthMm\}/);
  assert.match(node, /onDimensionsChange=\{\(dimensions\) => update\(dimensions\)\}/);
  assert.match(editor, /展厅尺寸/);
  assert.match(editor, />长 mm<input/);
  assert.match(editor, />宽 mm<input/);
  assert.match(editor, /展厅长 \{hallLengthMm \|\| 12000\} mm/);
  assert.match(editor, /展厅宽 \{hallWidthMm \|\| 8000\} mm/);
  assert.match(node, /drawHallDimensions\(context, canvas\.width, canvas\.height, hallLengthMm, hallWidthMm\)/);

  const prompt = buildFusionRenderPrompt({ hallLengthMm: 18000, hallWidthMm: 9000, hallHeightMm: 5000 });
  assert.match(prompt, /长 18000 mm、宽 9000 mm、净高 5000 mm/);
  assert.match(prompt, /长宽高比例/);
  assert.match(prompt, /底面上的“展厅长\/展厅宽”尺寸线/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*hallLengthMm: 12000,[\s\S]*hallWidthMm: 8000/);
});

test('prompt creates a coherent realistic ambience without inventing primary exhibits', () => {
  const prompt = buildFusionRenderPrompt({ exhibitCount: 3 });
  for (const term of ['环境氛围融合', '全部展项原始外观参考', '墙面处理', '基础照明', '重点照明', '空间色温', '收口节点', '真实自然约束', '接触阴影', '材质响应']) {
    assert.match(prompt, new RegExp(term));
  }
  assert.match(prompt, /不是把展项放进空白房间/);
  assert.match(prompt, /不得新增未提供的主要展项/);
  assert.match(prompt, /不得用环境装饰改变展项位置、朝向、占比、间距和层级/);
  assert.match(prompt, /已完成布展并经过专业摄影的真实展厅/);
  assert.match(prompt, /不得遮挡展项、形成拥挤人群/);
});

test('prompt hard-locks layout relations and fills only large distant gaps', () => {
  const layoutDescription = describeFusionRenderLayout([
    { label: '互动展项A', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.25, heightRatio: 0.3, rotationDeg: 45, zIndex: 3 },
    { label: '科技展项B', xRatio: 0.6, yRatio: 0.55, widthRatio: 0.2, heightRatio: 0.15, rotationDeg: -30, zIndex: 5 },
  ]);
  assert.match(layoutDescription, /互动展项A/);
  assert.match(layoutDescription, /左上位置 x=10%, y=20%/);
  assert.match(layoutDescription, /中心位置 x=23%, y=35%/);
  assert.match(layoutDescription, /底面占比 宽=25%, 深=30%/);
  assert.match(layoutDescription, /旋转=45°/);
  assert.match(layoutDescription, /层级=3/);

  const prompt = buildFusionRenderPrompt({ hallLengthMm: 20000, hallWidthMm: 10000, layoutDescription, exhibitCount: 2 });
  assert.match(prompt, /主展项排版是最高优先级硬约束/);
  assert.match(prompt, /禁止为了构图、透视、美观、补充环境或填充空档而移动/);
  assert.match(prompt, /主展项排版数值清单/);
  assert.match(prompt, /相同百分比在长、宽方向分别对应展厅实际长度和宽度/);
  assert.match(prompt, /仅当排版底面确实存在连续的大面积空白区域时/);
  assert.match(prompt, /同主题、同类型、同设计语言/);
  assert.match(prompt, /异形图文墙体/);
  assert.match(prompt, /画面远端或背景空档/);
  assert.match(prompt, /较弱对比度、较低饱和度和真实景深虚化/);
  assert.match(prompt, /近景和中景不得用新增物填满/);

  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /describeFusionRenderLayout\(layoutItems\)/);
  assert.match(node, /layoutDescription/);
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
  assert.match(prompt, /画面需要同时表现空间关系与展项；/);
  assert.match(prompt, /中心位置、占地宽深比例、彼此间距、前后遮挡和层级关系/);
  assert.doesNotMatch(prompt, /占地宽深比例、旋转朝向、彼此间距/);
  assert.match(prompt, /禁止为了构图、透视、美观、补充环境或填充空档而移动、交换、聚拢、分散、放大、缩小、旋转或删除任何主展项/);

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
