import {
  REVERSE_ISOMETRIC_DIRECTIONS,
  REVERSE_ISOMETRIC_FLOOR_MATERIALS,
  normalizeReverseIsometricDirection,
} from './reverseIsometricDesignData.js';

export const FUSION_RENDER_AUTO_CEILING_CRAFT = '根据所有展项风格自动调整';
export const FUSION_RENDER_AUTO_FLOOR_MATERIAL = '根据展项来设计';

export const FUSION_RENDER_VENUE_TYPES = [
  '科技馆',
  '博物馆',
  '自然博物馆',
  '历史博物馆',
  '艺术馆',
  '美术馆',
  '文化馆',
  '规划展示馆',
  '城市展览馆',
  '企业展厅',
  '产业展馆',
  '主题体验馆',
  '科普教育馆',
  '生态环境馆',
  '航空航天馆',
  '交通博物馆',
  '海洋馆',
  '地质馆',
  '纪念馆',
  '非遗展示馆',
];

export const FUSION_RENDER_CEILING_CRAFTS = [
  '无吊顶裸顶喷涂',
  '平面石膏板吊顶',
  '双层跌级石膏板吊顶',
  '弧形石膏板吊顶',
  '异形造型石膏板吊顶',
  '铝方通吊顶',
  '木纹铝方通吊顶',
  '铝格栅吊顶',
  '金属网吊顶',
  '铝扣板吊顶',
  '矿棉吸音板吊顶',
  '穿孔石膏吸音板吊顶',
  '穿孔金属吸音板吊顶',
  '木质吸音板吊顶',
  '软膜天花',
  '透光膜发光天花',
  '模块化灯膜天花',
  '镜面不锈钢吊顶',
  '拉丝不锈钢吊顶',
  '生态木格栅吊顶',
];

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function percent(value) {
  return `${Math.round(clamp(finite(value, 0), 0, 1) * 100)}%`;
}

export function describeFusionRenderLayout(items = []) {
  const normalizedItems = Array.isArray(items) ? items : [];
  if (!normalizedItems.length) return '';
  return normalizedItems.map((item, index) => {
    const centerX = finite(item.xRatio, 0) + finite(item.widthRatio, 0) / 2;
    const centerY = finite(item.yRatio, 0) + finite(item.heightRatio, 0) / 2;
    return [
      `${index + 1}. ${String(item.label || `展项${index + 1}`)}`,
      `左上位置 x=${percent(item.xRatio)}, y=${percent(item.yRatio)}`,
      `中心位置 x=${percent(centerX)}, y=${percent(centerY)}`,
      `底面占比 宽=${percent(item.widthRatio)}, 深=${percent(item.heightRatio)}`,
      `旋转=${Math.round(finite(item.rotationDeg, 0))}°`,
      `层级=${Math.max(0, Math.round(finite(item.zIndex, index + 1)))}`,
    ].join('；');
  }).join('\n');
}

export function buildFusionRenderPrompt({
  hasPlan = false,
  venueType = FUSION_RENDER_VENUE_TYPES[0],
  hallSubject = '',
  viewDirection = 'front-left',
  hallLengthMm = 12000,
  hallWidthMm = 8000,
  hallHeightMm = 4200,
  floorMaterial = FUSION_RENDER_AUTO_FLOOR_MATERIAL,
  ceilingCraft = FUSION_RENDER_AUTO_CEILING_CRAFT,
  layoutDescription = '',
  wallPlacementText = '',
  exhibitCount = 0,
} = {}) {
  const direction = REVERSE_ISOMETRIC_DIRECTIONS.find((item) => item.value === normalizeReverseIsometricDirection(viewDirection));
  const safeVenueType = FUSION_RENDER_VENUE_TYPES.includes(venueType) ? venueType : FUSION_RENDER_VENUE_TYPES[0];
  const safeHallSubject = String(hallSubject || '').trim();
  const subjectConstraint = safeHallSubject
    ? `展厅主体：明确以“${safeHallSubject}”作为整个展厅的核心主题、空间叙事和氛围方向。所有空间设计、墙面内容、环境图形、色材、灯光与辅助展陈必须围绕该主体展开。`
    : '展厅主体：当前未填写，由模型根据全部接入展项的共同主题、内容属性、视觉风格和科技方向自动归纳一个统一、明确的展厅主体，并以此组织空间叙事、墙面内容和环境氛围。';
  const safeLength = clamp(Math.round(finite(hallLengthMm, 12000)), 1000, 100000);
  const safeWidth = clamp(Math.round(finite(hallWidthMm, 8000)), 1000, 100000);
  const safeHeight = clamp(Math.round(finite(hallHeightMm, 4200)), 2400, 12000);
  const safeFloorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS.includes(floorMaterial)
    ? floorMaterial
    : FUSION_RENDER_AUTO_FLOOR_MATERIAL;
  const floorConstraint = safeFloorMaterial === FUSION_RENDER_AUTO_FLOOR_MATERIAL
    ? '地面设计：根据全部主展项的主题、风格、色彩、材质、造型语言和灯光气质自动设计与之协调的展厅地面；地面应真实可施工，具有克制的材质分区、拼缝、反射和粗糙度，不得出现与展项无关的抢眼图案。'
    : `地面设计：统一采用“${safeFloorMaterial}”，材质尺度、反射、粗糙度和拼缝必须真实克制。`;
  const safeCeilingCraft = FUSION_RENDER_CEILING_CRAFTS.includes(ceilingCraft)
    ? ceilingCraft
    : FUSION_RENDER_AUTO_CEILING_CRAFT;
  const ceilingConstraint = safeCeilingCraft === FUSION_RENDER_AUTO_CEILING_CRAFT
    ? '顶部工艺：根据全部展项原始外观参考的设计风格、色彩、材质、造型语言和灯光气质自动选择并统一设计顶部工艺；顶部应服务整体展陈氛围，不得与任何主要展项风格冲突。'
    : `顶部工艺：明确采用“${safeCeilingCraft}”；保持该工艺真实可施工，正确表现构造尺度、收边、拼接、吊装关系及与灯光设备的整合。`;
  const firstExhibitIndex = hasPlan ? 3 : 2;
  const lastExhibitIndex = firstExhibitIndex + Math.max(0, exhibitCount) - 1;
  const referenceRoles = hasPlan
    ? `@img1 是原始平面结构基准；@img2 是俯视排版定位图；${exhibitCount > 0 ? `@img${firstExhibitIndex} 至 @img${lastExhibitIndex} 是按排版顺序对应的展项原始外观参考。` : ''}`
    : `@img1 是矩形空间内的俯视排版定位图；${exhibitCount > 0 ? `@img${firstExhibitIndex} 至 @img${lastExhibitIndex} 是按排版顺序对应的展项原始外观参考。` : ''}`;

  return [
    `核心任务：以生成一张“${safeVenueType}”类型的完整展厅效果图为主，先建立真实、自然、有明确空间设计和环境氛围的展厅，再把所有接入的展项参考图作为展陈素材，按照排版定位图指定的底面关系融入该效果图中。接入图像是展项外观与内容素材，不是要求逐张完整展示的独立画面。`,
    `展馆类型：${safeVenueType}。空间设计、环境氛围、辅助内容、专业设施和空档填充必须符合该类型展馆的功能属性与行业特征。`,
    subjectConstraint,
    `相机观察方向：从${direction?.label || '左前'}方向观察空间。相机必须保持约 1.4–1.6 米的较低正常人眼高度，使用平视或轻微仰视的自然广角透视，不得采用架高机位、俯拍、鸟瞰或接近轴侧的视角。不要为了让所有展项同时完整出现在画面中而提高相机、扩大俯角或压缩空间纵深；不得输出俯视平面图、轴侧图或高空鸟瞰图。`,
    '遮挡与构图：展项可以按照真实空间前后关系被其他展项、墙体、辅助结构或画面边缘自然局部遮挡，也可以有部分展项位于画面之外；无需强行让每个展项完整露脸。遮挡不能改变展项的真实底面位置、占地比例和层级，也不能把被遮挡展项从空间中删除。最终画面应优先呈现可信的人眼游览体验和自然空间纵深。',
    `参考图角色：${referenceRoles}`,
    '主展项排版是最高优先级硬约束：必须逐一严格复现排版定位图中每个已接入展项相对于底面的中心位置、占地宽深比例、彼此间距、前后遮挡和层级关系。禁止为了构图、透视、美观、补充环境或填充空档而移动、交换、聚拢、分散、放大、缩小、旋转或删除任何主展项。',
    layoutDescription ? `主展项排版数值清单（底面左上角为 0%,0%，右下角为 100%,100%；这些数值与排版定位图共同构成硬约束）：\n${layoutDescription}` : '',
    '尺度换算：必须结合展厅实际长宽，把每个主展项的底面占比换算成真实占地尺寸；相同百分比在长、宽方向分别对应展厅实际长度和宽度。透视投影只能改变屏幕观感，不得改变其真实底面位置和占地比例。',
    '排版定位图底面上的“展厅长/展厅宽”尺寸线表示真实空间尺寸，必须用于尺度换算，但不得作为可见文字或图线出现在最终效果图中；图片卡片不是地面纹理，也不是需要原样保留边框的广告牌。',
    hasPlan
      ? '最高优先级结构锁定：墙体中心线、墙厚关系、连接拓扑、柱网、出入口、门、窗的数量和相对位置必须与 @img1 一致。严禁补墙、拆墙、封门、开洞、移动柱体或重新规划平面。'
      : '空间边界：把 @img1 的矩形边界理解为一个简洁、完整的矩形展厅；不得擅自增加复杂隔墙、异形建筑边界、额外房间或未提供的主要展项。',
    `展厅实际尺寸：长 ${safeLength} mm、宽 ${safeWidth} mm、净高 ${safeHeight} mm。必须按该长宽高比例建立可信的空间尺度和展项尺度。`,
    floorConstraint,
    ceilingConstraint,
    '所有展项必须从各自原始外观参考恢复成可信的三维展陈装置，保持识别特征、色彩、材质和比例；底座落地、立面竖直、尺度可信，不得悬浮。',
    '环境氛围融合：综合全部展项原始外观参考的设计风格、年代气质、主题内容、色彩体系、材质语言和灯光倾向，为整个展厅补齐相符且统一的环境氛围。墙面处理、顶部造型、基础照明、重点照明、空间色温、地面细节、收口节点、踢脚、必要的护栏或参观边界、克制的导向元素及少量辅助环境陈设应形成完整设计，而不是把展项放进空白房间。',
    `墙面内容硬约束：最终画面中不得出现大面积无内容、无设计的空白墙面。所有可见墙面必须结合“${safeVenueType}”属性和全部主展项主题，采用有明确内容层级的主题图文、科普信息图形、材质肌理、灯光洗墙、嵌入式展示、异形图文墙或与展项协调的空间结构进行完整设计。墙面内容应丰富但克制、远端适度虚化，不得生成乱码或不可读的伪文字，不得遮挡、替代或抢夺主展项视觉中心。`,
    '真实自然约束：环境细节必须尺度合理、可施工、有人使用过的自然状态，光照具有真实的明暗层次、反射、接触阴影和材质响应；允许加入少量不抢主体的参观者剪影或生活化尺度参照，但不得遮挡展项、形成拥挤人群或破坏人工排版。',
    '环境只能服务并衬托已提供的主展项：不得新增未提供的主要展项、与主展项竞争的主题装置、大型雕塑或抢眼视觉中心；不得用环境装饰改变展项位置、朝向、占比、间距和层级。',
    `大空档填充规则：仅当排版底面确实存在连续的大面积空白区域时，才允许在这些空档内补充少量符合“${safeVenueType}”属性、并与全部主展项同主题、同类型、同设计语言的次要互动展项、轻量展示装置或异形图文墙体。补充物只能填补空档，必须与所有主展项保持安全间距和清晰通道，不得覆盖、穿插、遮挡或挤压主展项，不得改变原有动线和主次关系。`,
    '远端弱化规则：所有自动补充的科技展项、异形图文墙和辅助陈设优先布置在画面远端或背景空档，采用较低视觉权重、较弱对比度、较低饱和度和真实景深虚化处理；轮廓与主题可辨，但细节不能比主展项清晰，不能成为新的视觉焦点。近景和中景不得用新增物填满，必须保留自然留白和参观通道。',
    '严禁把整张展项图片水平平铺、压扁或贴在地面、矮台顶面上；不得把排版截图、选择框、控制点或白色底板直接渲染进最终空间。',
    `靠近空间边界的展项应按靠墙装置处理：背面与相邻墙面平行、底部落地、正立面朝向主要参观空间。${wallPlacementText ? `当前排版中检测到：${wallPlacementText}。` : ''}`,
    '使用真实建筑摄影级灯光、阴影、材质、景深和空间尺度，构图自然；最终画面应像已完成布展并经过专业摄影的真实展厅，而不是简单抠图拼贴、白模空间或孤立展品合集。',
    '只输出一张连续、完整的写实空间效果图；禁止拼版、分栏、对比图、平面图、轴侧图、技术图纸、文字说明、水印或尺寸表。',
  ].join('\n');
}
