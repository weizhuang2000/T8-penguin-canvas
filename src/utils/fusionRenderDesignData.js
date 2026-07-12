import {
  REVERSE_ISOMETRIC_DIRECTIONS,
  REVERSE_ISOMETRIC_FLOOR_MATERIALS,
  normalizeReverseIsometricDirection,
} from './reverseIsometricDesignData.js';

export const FUSION_RENDER_AUTO_CEILING_CRAFT = '根据所有展项风格自动调整';

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
  viewDirection = 'front-left',
  hallLengthMm = 12000,
  hallWidthMm = 8000,
  hallHeightMm = 4200,
  floorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS[0],
  ceilingCraft = FUSION_RENDER_AUTO_CEILING_CRAFT,
  layoutDescription = '',
  wallPlacementText = '',
  exhibitCount = 0,
} = {}) {
  const direction = REVERSE_ISOMETRIC_DIRECTIONS.find((item) => item.value === normalizeReverseIsometricDirection(viewDirection));
  const safeLength = clamp(Math.round(finite(hallLengthMm, 12000)), 1000, 100000);
  const safeWidth = clamp(Math.round(finite(hallWidthMm, 8000)), 1000, 100000);
  const safeHeight = clamp(Math.round(finite(hallHeightMm, 4200)), 2400, 12000);
  const safeFloorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS.includes(floorMaterial)
    ? floorMaterial
    : REVERSE_ISOMETRIC_FLOOR_MATERIALS[0];
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
    '任务：把参考展项融合进同一个博物馆/展馆空间，生成一张写实、完整、可用于方案汇报的展陈空间透视效果图。',
    `相机观察方向：从${direction?.label || '左前'}方向观察空间。使用正常人眼高度的广角透视，画面需要同时表现空间关系与展项正立面；不得输出俯视平面图、轴侧图或高空鸟瞰图。`,
    `参考图角色：${referenceRoles}`,
    '主展项排版是最高优先级硬约束：必须逐一严格复现排版定位图中每个已接入展项相对于底面的中心位置、占地宽深比例、旋转朝向、彼此间距、前后遮挡和层级关系。禁止为了构图、透视、美观、补充环境或填充空档而移动、交换、聚拢、分散、放大、缩小、旋转或删除任何主展项。',
    layoutDescription ? `主展项排版数值清单（底面左上角为 0%,0%，右下角为 100%,100%；这些数值与排版定位图共同构成硬约束）：\n${layoutDescription}` : '',
    '尺度换算：必须结合展厅实际长宽，把每个主展项的底面占比换算成真实占地尺寸；相同百分比在长、宽方向分别对应展厅实际长度和宽度。透视投影只能改变屏幕观感，不得改变其真实底面位置和占地比例。',
    '排版定位图底面上的“展厅长/展厅宽”尺寸线表示真实空间尺寸，必须用于尺度换算，但不得作为可见文字或图线出现在最终效果图中；图片卡片不是地面纹理，也不是需要原样保留边框的广告牌。',
    hasPlan
      ? '最高优先级结构锁定：墙体中心线、墙厚关系、连接拓扑、柱网、出入口、门、窗的数量和相对位置必须与 @img1 一致。严禁补墙、拆墙、封门、开洞、移动柱体或重新规划平面。'
      : '空间边界：把 @img1 的矩形边界理解为一个简洁、完整的矩形展厅；不得擅自增加复杂隔墙、异形建筑边界、额外房间或未提供的主要展项。',
    `展厅实际尺寸：长 ${safeLength} mm、宽 ${safeWidth} mm、净高 ${safeHeight} mm。必须按该长宽高比例建立可信的空间尺度和展项尺度；地面统一采用“${safeFloorMaterial}”，材质尺度、反射、粗糙度和拼缝真实克制。`,
    ceilingConstraint,
    '所有展项必须从各自原始外观参考恢复成可信的三维展陈装置，保持识别特征、色彩、材质和比例；底座落地、立面竖直、尺度可信，不得悬浮。',
    '环境氛围融合：综合全部展项原始外观参考的设计风格、年代气质、主题内容、色彩体系、材质语言和灯光倾向，为整个展厅补齐相符且统一的环境氛围。墙面处理、顶部造型、基础照明、重点照明、空间色温、地面细节、收口节点、踢脚、必要的护栏或参观边界、克制的导向元素及少量辅助环境陈设应形成完整设计，而不是把展项放进空白房间。',
    '真实自然约束：环境细节必须尺度合理、可施工、有人使用过的自然状态，光照具有真实的明暗层次、反射、接触阴影和材质响应；允许加入少量不抢主体的参观者剪影或生活化尺度参照，但不得遮挡展项、形成拥挤人群或破坏人工排版。',
    '环境只能服务并衬托已提供的主展项：不得新增未提供的主要展项、与主展项竞争的主题装置、大型雕塑或抢眼视觉中心；不得用环境装饰改变展项位置、朝向、占比、间距和层级。',
    '大空档填充规则：仅当排版底面确实存在连续的大面积空白区域时，才允许在这些空档内补充少量与全部主展项同主题、同科技类型、同设计语言的次要科技互动展项、轻量展示装置或异形图文墙体。补充物只能填补空档，必须与所有主展项保持安全间距和清晰通道，不得覆盖、穿插、遮挡或挤压主展项，不得改变原有动线和主次关系。',
    '远端弱化规则：所有自动补充的科技展项、异形图文墙和辅助陈设优先布置在画面远端或背景空档，采用较低视觉权重、较弱对比度、较低饱和度和真实景深虚化处理；轮廓与主题可辨，但细节不能比主展项清晰，不能成为新的视觉焦点。近景和中景不得用新增物填满，必须保留自然留白和参观通道。',
    '严禁把整张展项图片水平平铺、压扁或贴在地面、矮台顶面上；不得把排版截图、选择框、控制点或白色底板直接渲染进最终空间。',
    `靠近空间边界的展项应按靠墙装置处理：背面与相邻墙面平行、底部落地、正立面朝向主要参观空间。${wallPlacementText ? `当前排版中检测到：${wallPlacementText}。` : ''}`,
    '使用真实建筑摄影级灯光、阴影、材质、景深和空间尺度，构图自然；最终画面应像已完成布展并经过专业摄影的真实展厅，而不是简单抠图拼贴、白模空间或孤立展品合集。',
    '只输出一张连续、完整的写实空间效果图；禁止拼版、分栏、对比图、平面图、轴侧图、技术图纸、文字说明、水印或尺寸表。',
  ].join('\n');
}
