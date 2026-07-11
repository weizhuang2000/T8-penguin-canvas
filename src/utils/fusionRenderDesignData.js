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

export function buildFusionRenderPrompt({
  hasPlan = false,
  viewDirection = 'front-left',
  hallLengthMm = 12000,
  hallWidthMm = 8000,
  hallHeightMm = 4200,
  floorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS[0],
  ceilingCraft = FUSION_RENDER_AUTO_CEILING_CRAFT,
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
    '排版定位图只约束展项的位置、朝向、显示占比、相对间距和前后层级；底面上的“展厅长/展厅宽”尺寸线表示真实空间尺寸，必须用于尺度换算，但不得作为可见文字或图线出现在最终效果图中；图片卡片不是地面纹理，也不是需要原样保留边框的广告牌。',
    hasPlan
      ? '最高优先级结构锁定：墙体中心线、墙厚关系、连接拓扑、柱网、出入口、门、窗的数量和相对位置必须与 @img1 一致。严禁补墙、拆墙、封门、开洞、移动柱体或重新规划平面。'
      : '空间边界：把 @img1 的矩形边界理解为一个简洁、完整的矩形展厅；不得擅自增加复杂隔墙、异形建筑边界、额外房间或未提供的主要展项。',
    `展厅实际尺寸：长 ${safeLength} mm、宽 ${safeWidth} mm、净高 ${safeHeight} mm。必须按该长宽高比例建立可信的空间尺度和展项尺度；地面统一采用“${safeFloorMaterial}”，材质尺度、反射、粗糙度和拼缝真实克制。`,
    ceilingConstraint,
    '所有展项必须从各自原始外观参考恢复成可信的三维展陈装置，保持识别特征、色彩、材质和比例；底座落地、立面竖直、尺度可信，不得悬浮。',
    '严禁把整张展项图片水平平铺、压扁或贴在地面、矮台顶面上；不得把排版截图、选择框、控制点或白色底板直接渲染进最终空间。',
    `靠近空间边界的展项应按靠墙装置处理：背面与相邻墙面平行、底部落地、正立面朝向主要参观空间。${wallPlacementText ? `当前排版中检测到：${wallPlacementText}。` : ''}`,
    '使用真实建筑摄影级灯光、阴影、材质、景深和空间尺度，构图自然，不新增未提供的主要展项。',
    '只输出一张连续、完整的写实空间效果图；禁止拼版、分栏、对比图、平面图、轴侧图、技术图纸、文字说明、水印或尺寸表。',
  ].join('\n');
}
