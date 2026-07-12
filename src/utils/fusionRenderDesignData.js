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

export function buildFusionRenderPrompt({
  hasSpaceReference = false,
  venueType = FUSION_RENDER_VENUE_TYPES[0],
  hallSubject = '',
  viewDirection = 'front-left',
  hallLengthMm = 12000,
  hallWidthMm = 8000,
  hallHeightMm = 4200,
  floorMaterial = FUSION_RENDER_AUTO_FLOOR_MATERIAL,
  ceilingCraft = FUSION_RENDER_AUTO_CEILING_CRAFT,
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
  const firstExhibitIndex = hasSpaceReference ? 2 : 1;
  const lastExhibitIndex = firstExhibitIndex + Math.max(0, exhibitCount) - 1;
  const referenceRoles = hasSpaceReference
    ? `@img1 是空间参考图，用于参考空间形态、设计语言、材质、灯光和环境氛围；${exhibitCount > 0 ? `@img${firstExhibitIndex} 至 @img${lastExhibitIndex} 是需要作为素材融入展厅的展项原始外观参考。` : ''}`
    : `${exhibitCount > 0 ? `@img${firstExhibitIndex} 至 @img${lastExhibitIndex} 是需要作为素材融入展厅的展项原始外观参考。` : '当前没有展项参考图。'}`;

  return [
    `核心任务：以生成一张“${safeVenueType}”类型的完整展厅效果图为主，先建立真实、自然、有明确空间设计和环境氛围的展厅，再把所有接入的展项参考图作为展陈素材，自然、合理地布置并融入该效果图中。接入图像是展项外观与内容素材，不是要求逐张完整展示的独立画面。`,
    `展馆类型：${safeVenueType}。空间设计、环境氛围、辅助内容、专业设施和空档填充必须符合该类型展馆的功能属性与行业特征。`,
    subjectConstraint,
    `相机观察方向：从${direction?.label || '左前'}方向观察空间。相机必须保持约 1.4–1.6 米的较低正常人眼高度，使用平视或轻微仰视的自然广角透视，不得采用架高机位、俯拍、鸟瞰或接近轴侧的视角。不要为了让所有展项同时完整出现在画面中而提高相机、扩大俯角或压缩空间纵深；不得输出俯视平面图、轴侧图或高空鸟瞰图。`,
    '遮挡与构图：展项可以按照真实空间前后关系被其他展项、墙体、辅助结构或画面边缘自然局部遮挡，也可以有部分展项位于画面之外；无需强行让每个展项完整露脸。不能把被遮挡展项从空间中删除。最终画面应优先呈现可信的人眼游览体验和自然空间纵深。',
    `参考图角色：${referenceRoles}`,
    '展项布置：识别各展项的真实形态、用途、观看面和尺度，根据展馆类型、展厅主体、空间参考图及设定长宽高自动完成专业展陈布置。保持各展项的核心识别特征、色彩、材质和合理相对尺度，保证通道、观看距离、安全边界和主次层级自然可信。',
    hasSpaceReference
      ? '空间参考图使用规则：借鉴 @img1 的空间形态、墙顶地关系、材质语言、灯光层次、构造细节和环境气质，并结合当前展馆类型、展厅主体及设定长宽高进行适配；不得复制其中原有展项、人物、文字或与当前主题无关的内容。'
      : '空间构建：没有空间参考图时，根据展馆类型、展厅主体及设定长宽高创建一个完整、自然、可施工的展厅空间。',
    `展厅实际尺寸：长 ${safeLength} mm、宽 ${safeWidth} mm、净高 ${safeHeight} mm。必须按该长宽高比例建立可信的空间尺度和展项尺度。`,
    floorConstraint,
    ceilingConstraint,
    '所有展项必须从各自原始外观参考恢复成可信的三维展陈装置，保持识别特征、色彩、材质和比例；底座落地、立面竖直、尺度可信，不得悬浮。',
    '环境氛围融合：综合全部展项原始外观参考的设计风格、年代气质、主题内容、色彩体系、材质语言和灯光倾向，为整个展厅补齐相符且统一的环境氛围。墙面处理、顶部造型、基础照明、重点照明、空间色温、地面细节、收口节点、踢脚、必要的护栏或参观边界、克制的导向元素及少量辅助环境陈设应形成完整设计，而不是把展项放进空白房间。',
    `墙面内容硬约束：最终画面中不得出现大面积无内容、无设计的空白墙面。所有可见墙面必须结合“${safeVenueType}”属性和全部主展项主题，采用有明确内容层级的主题图文、科普信息图形、材质肌理、灯光洗墙、嵌入式展示、异形图文墙或与展项协调的空间结构进行完整设计。墙面内容应丰富但克制、远端适度虚化，不得生成乱码或不可读的伪文字，不得遮挡、替代或抢夺主展项视觉中心。`,
    '真实自然约束：环境细节必须尺度合理、可施工、有人使用过的自然状态，光照具有真实的明暗层次、反射、接触阴影和材质响应；允许加入少量不抢主体的参观者剪影或生活化尺度参照，但不得遮挡展项、形成拥挤人群或破坏人工排版。',
    '环境只能服务并衬托已提供的主展项：不得新增未提供的主要展项、与主展项竞争的主题装置、大型雕塑或抢眼视觉中心。',
    `大空档填充规则：仅当展厅确实存在连续的大面积空白区域时，才允许补充少量符合“${safeVenueType}”属性、并与全部主展项同主题、同类型、同设计语言的次要互动展项、轻量展示装置或异形图文墙体。补充物必须与所有主展项保持安全间距和清晰通道，不得覆盖、穿插、遮挡或挤压主展项，不得破坏原有主次关系。`,
    '远端弱化规则：所有自动补充的科技展项、异形图文墙和辅助陈设优先布置在画面远端或背景空档，采用较低视觉权重、较弱对比度、较低饱和度和真实景深虚化处理；轮廓与主题可辨，但细节不能比主展项清晰，不能成为新的视觉焦点。近景和中景不得用新增物填满，必须保留自然留白和参观通道。',
    '严禁把整张展项图片水平平铺、压扁或贴在地面、矮台顶面上；展项必须转化为真实三维展陈装置。',
    '使用真实建筑摄影级灯光、阴影、材质、景深和空间尺度，构图自然；最终画面应像已完成布展并经过专业摄影的真实展厅，而不是简单抠图拼贴、白模空间或孤立展品合集。',
    '只输出一张连续、完整的写实空间效果图；禁止拼版、分栏、对比图、平面图、轴侧图、技术图纸、文字说明、水印或尺寸表。',
  ].join('\n');
}
