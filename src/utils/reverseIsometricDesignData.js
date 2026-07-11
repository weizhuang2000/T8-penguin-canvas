const DIRECTIONS = new Set(['front-left', 'front-right', 'back-left', 'back-right']);

export const REVERSE_ISOMETRIC_DIRECTIONS = [
  { value: 'front-left', label: '左前' },
  { value: 'front-right', label: '右前' },
  { value: 'back-left', label: '左后' },
  { value: 'back-right', label: '右后' },
];

export const REVERSE_ISOMETRIC_FLOOR_MATERIALS = [
  '浅灰哑光环氧地坪', '中灰哑光环氧地坪', '深灰哑光环氧地坪', '水泥自流平',
  '清水混凝土地面', '浅灰水磨石', '深灰水磨石', '白色细颗粒水磨石',
  '米白色石英砖', '浅灰色石英砖', '深灰色石英砖', '仿水泥瓷砖',
  '浅色天然石材', '深色天然石材', '浅色橡木地板', '深色胡桃木地板',
  '灰色商用地毯', '深蓝色商用地毯', '黑色橡胶地板', '浅灰色PVC地板',
];

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanAngle(value) {
  const n = finite(value, 0) % 360;
  return Math.round((n < -180 ? n + 360 : n > 180 ? n - 360 : n) * 100) / 100;
}

export function normalizeReverseIsometricDirection(value) {
  return DIRECTIONS.has(value) ? value : 'front-left';
}

export function normalizeReverseIsometricLayoutItems(value, exhibits = []) {
  const saved = Array.isArray(value) ? value : [];
  const byUrl = new Map(saved.filter((item) => item && typeof item.url === 'string').map((item) => [item.url, item]));
  const count = Math.max(1, exhibits.length);
  return exhibits.map((exhibit, index) => {
    const old = byUrl.get(exhibit.url) || {};
    const defaultWidth = Math.min(0.24, 0.8 / count);
    const widthRatio = clamp(finite(old.widthRatio, defaultWidth), 0.02, 1);
    const heightRatio = clamp(finite(old.heightRatio, 0.18), 0.02, 1);
    const xRatio = clamp(finite(old.xRatio, 0.1 + (index % 4) * 0.21), 0, Math.max(0, 1 - widthRatio));
    const yRatio = clamp(finite(old.yRatio, 0.18 + Math.floor(index / 4) * 0.22), 0, Math.max(0, 1 - heightRatio));
    const cropX = clamp(finite(old.cropX, 0), 0, 0.98);
    const cropY = clamp(finite(old.cropY, 0), 0, 0.98);
    return {
      id: String(old.id || exhibit.id || `exhibit-${index + 1}`),
      url: exhibit.url,
      label: String(exhibit.label || old.label || `展项 ${index + 1}`),
      xRatio: Math.round(xRatio * 10000) / 10000,
      yRatio: Math.round(yRatio * 10000) / 10000,
      widthRatio: Math.round(widthRatio * 10000) / 10000,
      heightRatio: Math.round(heightRatio * 10000) / 10000,
      rotationDeg: cleanAngle(old.rotationDeg),
      zIndex: Math.max(0, Math.round(finite(old.zIndex, index + 1))),
      cropX,
      cropY,
      cropWidth: clamp(finite(old.cropWidth, 1), 0.02, 1 - cropX),
      cropHeight: clamp(finite(old.cropHeight, 1), 0.02, 1 - cropY),
    };
  });
}

export function patchReverseIsometricLayoutItem(item, patch = {}) {
  const widthRatio = clamp(finite(patch.widthRatio, item.widthRatio), 0.02, 1);
  const heightRatio = clamp(finite(patch.heightRatio, item.heightRatio), 0.02, 1);
  const cropX = clamp(finite(patch.cropX, item.cropX ?? 0), 0, 0.98);
  const cropY = clamp(finite(patch.cropY, item.cropY ?? 0), 0, 0.98);
  const cropWidth = clamp(finite(patch.cropWidth, item.cropWidth ?? 1), 0.02, 1 - cropX);
  const cropHeight = clamp(finite(patch.cropHeight, item.cropHeight ?? 1), 0.02, 1 - cropY);
  return {
    ...item,
    ...patch,
    widthRatio,
    heightRatio,
    xRatio: clamp(finite(patch.xRatio, item.xRatio), 0, Math.max(0, 1 - widthRatio)),
    yRatio: clamp(finite(patch.yRatio, item.yRatio), 0, Math.max(0, 1 - heightRatio)),
    rotationDeg: cleanAngle(patch.rotationDeg ?? item.rotationDeg),
    cropX,
    cropY,
    cropWidth,
    cropHeight,
  };
}

export function describeWallAdjacentExhibits(items = [], threshold = 0.08) {
  const directions = ['左侧墙', '顶部墙', '右侧墙', '底部墙'];
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const distances = [item.xRatio, item.yRatio, 1 - item.xRatio - item.widthRatio, 1 - item.yRatio - item.heightRatio];
    const nearest = distances.reduce((best, value, directionIndex) => value < best.value ? { value, directionIndex } : best, { value: Infinity, directionIndex: 0 });
    if (nearest.value > threshold) return null;
    return `${item.label || `展项${index + 1}`}靠近${directions[nearest.directionIndex]}`;
  }).filter(Boolean).join('；');
}

export function buildReverseIsometricPrompt({ viewDirection = 'front-left', hallHeightMm = 4200, floorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS[0], wallPlacementText = '', exhibitCount = 0, correction = '' } = {}) {
  const direction = REVERSE_ISOMETRIC_DIRECTIONS.find((item) => item.value === normalizeReverseIsometricDirection(viewDirection));
  const safeHeight = clamp(Math.round(finite(hallHeightMm, 4200)), 2400, 12000);
  const safeFloorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS.includes(floorMaterial) ? floorMaterial : REVERSE_ISOMETRIC_FLOOR_MATERIALS[0];
  return [
    '任务：依据参考图生成一张博物馆/展馆的无顶整体展陈轴侧图。',
    `观察方向：${direction?.label || '左前'}。采用低视点轴侧视角：相机俯角约 25°–30°，明显低于常规 45° 鸟瞰；需要同时看清展项正立面和地面布局，不得生成接近顶视图的高空俯拍。`,
    `参考图角色：@img1 是唯一的原始平面结构基准；@img2 是俯视排版定位图，其中展项图片卡片只表示平面占位、朝向和尺度，绝不是要平铺到地面的纹理；${exhibitCount > 0 ? `@img3 至 @img${exhibitCount + 2} 是各展项原始外观参考，按排版顺序一一对应。` : ''}`,
    '最高优先级结构锁定：墙体中心线、墙厚关系、墙体连接拓扑、柱网、出入口、门、窗的数量、尺寸关系和相对位置必须与 @img1 完全一致。',
    '严禁补墙、拆墙、移动墙体、改变墙厚关系、移动或缩放柱体、封门、开洞、增删或移动门窗、增删或移动入口与出口、合并空间或重新规划平面。',
    '轴侧投影只允许视角投影变化，不允许任何建筑平面几何变化。即使为了美观、对称、构图或展项摆放，也不得改动建筑结构。',
    '移除屋顶和遮挡视线的整体顶棚，但不得借此删除墙、柱、门窗或出入口；保留真实可施工的墙体高度与开口表达。',
    `展厅净高按 ${safeHeight} mm 表现；地面统一采用“${safeFloorMaterial}”，材质尺度、拼缝、反射与粗糙度应真实克制。`,
    '展项只可在人工排版指定区域内深化为真实展陈装置，不得移动建筑构件来迁就展项，不得自行新增未提供的主要展项。',
    '所有展项外观参考都必须理解为真实三维展陈装置的正面或斜前方照片，保持正常重力方向：底座落地、立面竖直。严禁把整张展项图片水平平铺、压扁或贴在地面/矮台顶面上，严禁生成“图片躺在台子上”的状态。',
    `靠墙布置的展项必须竖立：展项背板或背面必须与对应墙面平行并紧贴对应墙面，底部落地，正立面朝向主要参观空间；不得平躺、仰面、悬浮或把正面朝墙。${wallPlacementText ? `当前排版中检测到的靠墙展项：${wallPlacementText}。` : ''}`,
    '输出单张高完成度展陈轴侧效果图，不输出平面图、对比图、拼图、文字说明、水印或尺寸表。',
    correction ? `上一次结构校验发现以下问题，本次必须逐项修正且不得引入新变化：${correction}` : '',
  ].filter(Boolean).join('\n');
}

export function parseReverseIsometricValidationReport(content) {
  const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { pass: false, confidence: 0, violations: [{ kind: 'invalid-report', message: '结构校验模型未返回有效 JSON' }] };
  }
  const violations = Array.isArray(parsed?.violations)
    ? parsed.violations.map((item) => typeof item === 'string'
      ? { kind: 'structure', message: item }
      : { kind: String(item?.kind || 'structure'), message: String(item?.message || item?.evidence || '未说明的结构差异') })
    : [];
  const pass = parsed?.pass === true && violations.length === 0;
  return {
    pass,
    confidence: clamp(finite(parsed?.confidence, 0), 0, 1),
    violations: pass ? [] : (violations.length ? violations : [{ kind: 'structure', message: '校验未通过，但模型未提供差异说明' }]),
  };
}

export function validationCorrectionText(report) {
  return (report?.violations || []).map((item, index) => `${index + 1}. [${item.kind}] ${item.message}`).join('；');
}

export async function runReverseIsometricValidationLoop({ initialPrompt, viewDirection, hallHeightMm, floorMaterial, wallPlacementText, exhibitCount, generateCandidate, validateCandidate, onPhase }) {
  let prompt = String(initialPrompt || '');
  let candidate = '';
  let report = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    onPhase?.({ phase: 'generate', attempt });
    candidate = await generateCandidate(prompt, attempt);
    onPhase?.({ phase: 'validate', attempt, candidate });
    report = await validateCandidate(candidate, attempt);
    if (report?.pass === true) return { passed: true, candidate, report, prompt, attempts: attempt + 1 };
    prompt = buildReverseIsometricPrompt({
      viewDirection,
      hallHeightMm,
      floorMaterial,
      wallPlacementText,
      exhibitCount,
      correction: validationCorrectionText(report || { violations: [] }),
    });
  }
  return { passed: false, candidate, report, prompt, attempts: 2 };
}
