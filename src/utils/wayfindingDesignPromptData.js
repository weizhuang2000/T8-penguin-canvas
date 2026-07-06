export const WAYFINDING_OUTPUT_MODES = [
  { id: 'system-board', label: '系统规范图', prompt: 'a complete museum wayfinding design system board, showing sign family, typography, iconography, arrows, colors, materials, sizes, mounting logic, and application rules' },
  { id: 'scene-render', label: '方案效果图', prompt: 'a high-quality museum wayfinding signage application rendering in a real interior or exterior environment' },
  { id: 'single-sign', label: '单牌深化图', prompt: 'a detailed design rendering of one museum wayfinding sign, front view plus subtle perspective, with material and construction details' },
  { id: 'signage-set', label: '整套导视板式', prompt: 'a coordinated set of museum wayfinding signs presented as a family, including indoor and outdoor sign types' },
];

export const WAYFINDING_OUTPUT_PAGE_OPTIONS = [
  { id: 'auto', label: '自动分页', mode: 'auto', count: 0 },
  { id: '1', label: '1页', mode: 'fixed', count: 1 },
  { id: '2', label: '2页', mode: 'fixed', count: 2 },
  { id: '3', label: '3页', mode: 'fixed', count: 3 },
  { id: '4', label: '4页', mode: 'fixed', count: 4 },
  { id: '5', label: '5页', mode: 'fixed', count: 5 },
  { id: '6', label: '6页', mode: 'fixed', count: 6 },
];

export const MAX_WAYFINDING_OUTPUT_PAGES = 6;

export const WAYFINDING_SCOPE_OPTIONS = [
  { id: 'mixed', label: '室内+室外', prompt: 'cover both indoor and outdoor museum wayfinding scenarios, with consistent visual identity across exterior arrival, lobby, galleries, corridors, and service areas' },
  { id: 'indoor', label: '室内', prompt: 'focus on indoor museum wayfinding: lobby, atrium, gallery entries, corridors, elevators, stairs, service facilities, emergency and accessible routes' },
  { id: 'outdoor', label: '室外', prompt: 'focus on outdoor museum wayfinding: city interface, entrance plaza, parking, drop-off, garden path, facade arrival, and public service signs' },
];

export const WAYFINDING_SIGN_TYPES = [
  { id: 'outdoor-pylon', label: '室外精神堡垒', scope: 'outdoor', prompt: 'outdoor landmark pylon sign, tall freestanding museum identity and direction sign, durable weather-resistant structure' },
  { id: 'entrance-identity', label: '入口标识', scope: 'outdoor', prompt: 'museum entrance identity sign integrated with facade or entrance canopy, clear arrival recognition' },
  { id: 'outdoor-map', label: '室外总平导览', scope: 'outdoor', prompt: 'outdoor site map directory sign with campus map, visitor routes, entrances, parking, services, and accessible paths' },
  { id: 'parking-service', label: '停车与服务标识', scope: 'outdoor', prompt: 'parking, drop-off, ticketing, restroom, cafe, shop and visitor service signs for museum exterior circulation' },
  { id: 'floor-directory', label: '楼层索引', scope: 'indoor', prompt: 'indoor floor directory sign, clear level-by-level museum gallery index with pictograms and arrows' },
  { id: 'hanging-directional', label: '吊挂牌', scope: 'indoor', prompt: 'ceiling-hung directional signage for museum lobby or corridor, readable from distance, bilingual arrows and destinations' },
  { id: 'wall-directional', label: '墙面方向牌', scope: 'indoor', prompt: 'wall-mounted directional sign with arrows, gallery names, service destinations, and accessible route guidance' },
  { id: 'gallery-room-id', label: '展厅门牌', scope: 'indoor', prompt: 'gallery room identification sign beside museum exhibition entrance, title, number, bilingual text and subtle cultural detail' },
  { id: 'gallery-map', label: '展区地图', scope: 'indoor', prompt: 'gallery zone map sign, visitor path, exhibition rooms, key highlights, emergency exits and service points' },
  { id: 'object-label-aid', label: '展品辅助牌', scope: 'indoor', prompt: 'small supporting interpretive and wayfinding aid sign near exhibits, restrained museum label scale' },
  { id: 'accessible-safety', label: '无障碍与安全疏散', scope: 'mixed', prompt: 'accessible route, elevator, ramp, restroom, emergency exit and evacuation signage, compliant visual clarity' },
];

export const WAYFINDING_MATERIALS = [
  { id: 'brushed-metal', label: '拉丝金属', prompt: 'brushed stainless steel or anodized aluminum, low-glare satin finish, precise folded edges' },
  { id: 'bronze-stone', label: '铜色金属+石材', prompt: 'warm bronze metal combined with honed stone base, dignified museum exterior material system' },
  { id: 'painted-aluminum', label: '烤漆铝板', prompt: 'powder-coated aluminum panels, crisp color blocks, durable museum-grade finish' },
  { id: 'acrylic-lightbox', label: '亚克力发光', prompt: 'translucent acrylic and concealed LED lightbox, soft even illumination, controlled glare' },
  { id: 'wood-metal', label: '木饰面+金属', prompt: 'warm wood veneer combined with fine metal trim, calm cultural interior tone' },
  { id: 'glass-film', label: '玻璃贴膜', prompt: 'glass-mounted frosted film graphics and vinyl lettering, transparent but legible' },
  { id: 'stone-engraved', label: '石材雕刻', prompt: 'engraved stone or terrazzo signage, permanent outdoor museum craft, precise inset lettering' },
];

export const WAYFINDING_MOUNTING_OPTIONS = [
  { id: 'freestanding', label: '落地式', prompt: 'freestanding sign with stable base, visible structural thickness and safe public-space placement' },
  { id: 'wall-mounted', label: '墙面安装', prompt: 'wall-mounted sign with concealed fixings, aligned to architectural grid and visitor eye height' },
  { id: 'ceiling-hung', label: '吊挂安装', prompt: 'ceiling-hung sign with slender rods or cables, readable across corridor sightlines' },
  { id: 'projecting', label: '侧挑安装', prompt: 'projecting blade sign perpendicular to wall, readable along circulation path' },
  { id: 'floor-graphic', label: '地贴/地面导向', prompt: 'floor graphic wayfinding marks, durable anti-slip material, used sparingly for route reinforcement' },
  { id: 'integrated', label: '建筑一体化', prompt: 'signage integrated with wall, facade, landscape edge, or display architecture' },
];

export const WAYFINDING_ARROW_STYLES = [
  { id: 'standard', label: '标准箭头', prompt: 'standard geometric wayfinding arrows, highly legible and universal' },
  { id: 'soft-rounded', label: '圆角友好', prompt: 'soft rounded arrow and pictogram style, friendly public museum tone' },
  { id: 'cultural-symbolic', label: '文化符号化', prompt: 'arrows and pictograms subtly derived from local cultural motifs while remaining clear' },
  { id: 'technical-minimal', label: '理性极简', prompt: 'technical minimal arrows, strict grid, precise stroke weight and spacing' },
];

export const WAYFINDING_LANGUAGES = [
  { id: 'zh-en', label: '中英双语', prompt: 'Chinese and English bilingual hierarchy' },
  { id: 'zh', label: '中文', prompt: 'Chinese-only hierarchy' },
  { id: 'multi', label: '多语种', prompt: 'multilingual hierarchy with Chinese, English and additional visitor languages' },
];

const OUTPUT_MODE_IDS = new Set(WAYFINDING_OUTPUT_MODES.map((item) => item.id));
const SCOPE_IDS = new Set(WAYFINDING_SCOPE_OPTIONS.map((item) => item.id));
const SIGN_TYPE_IDS = new Set(WAYFINDING_SIGN_TYPES.map((item) => item.id));
const MATERIAL_IDS = new Set(WAYFINDING_MATERIALS.map((item) => item.id));
const MOUNTING_IDS = new Set(WAYFINDING_MOUNTING_OPTIONS.map((item) => item.id));
const ARROW_IDS = new Set(WAYFINDING_ARROW_STYLES.map((item) => item.id));
const LANGUAGE_IDS = new Set(WAYFINDING_LANGUAGES.map((item) => item.id));

const PAGE_TITLES = {
  'system-board': ['导视系统总览规范图', '标牌家族与版式规范', '室内外应用与安装关系', '无障碍与安全导视补充', '材质工艺与节点细节', '动线信息层级校验'],
  'scene-render': ['入口与到达场景', '室内动线与展厅导视', '服务与无障碍导视', '综合节点场景', '材质灯光与安装细节', '连续导览体验场景'],
  'single-sign': ['单个标牌深化设计图', '单牌材质与安装细节', '单牌版式与信息层级', '单牌场景应用', '单牌工艺节点', '单牌规范校验'],
  'signage-set': ['导视标牌家族总览', '室内导视组合', '室外与服务导视组合', '无障碍与安全导视组合', '材质与安装组合', '完整系统应用汇总'],
};

export function cleanWayfindingText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeId(value, options, fallback) {
  const id = String(value || '').trim();
  return options.has(id) ? id : fallback;
}

export function normalizeWayfindingOutputMode(value) {
  return normalizeId(value, OUTPUT_MODE_IDS, 'system-board');
}

export function normalizeWayfindingOutputPageMode(value) {
  return String(value || '').trim() === 'fixed' ? 'fixed' : 'auto';
}

export function normalizeWayfindingOutputPageCount(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 3;
  return Math.min(MAX_WAYFINDING_OUTPUT_PAGES, Math.max(1, n));
}

export function normalizeWayfindingScope(value) {
  return normalizeId(value, SCOPE_IDS, 'mixed');
}

export function normalizeWayfindingSignTypes(value) {
  const source = Array.isArray(value) ? value : ['floor-directory', 'hanging-directional', 'wall-directional', 'gallery-room-id', 'outdoor-pylon', 'outdoor-map'];
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    const id = String(typeof raw === 'string' ? raw : raw?.id || '').trim();
    if (!SIGN_TYPE_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length ? out : ['floor-directory', 'wall-directional'];
}

export function normalizeWayfindingMaterial(value) {
  return normalizeId(value, MATERIAL_IDS, 'brushed-metal');
}

export function normalizeWayfindingMounting(value) {
  return normalizeId(value, MOUNTING_IDS, 'wall-mounted');
}

export function normalizeWayfindingArrowStyle(value) {
  return normalizeId(value, ARROW_IDS, 'standard');
}

export function normalizeWayfindingLanguage(value) {
  return normalizeId(value, LANGUAGE_IDS, 'zh-en');
}

export function normalizeWayfindingDimensions(value) {
  const source = value && typeof value === 'object' ? value : {};
  const num = (raw, fallback) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.round(n);
  };
  return {
    widthMm: num(source.widthMm, 900),
    heightMm: num(source.heightMm, 1800),
    depthMm: num(source.depthMm, 80),
    installHeightMm: num(source.installHeightMm, 1500),
  };
}

function meta(list, id, fallbackIndex = 0) {
  return list.find((item) => item.id === id) || list[fallbackIndex];
}

export function wayfindingOutputModeMeta(value) {
  return meta(WAYFINDING_OUTPUT_MODES, normalizeWayfindingOutputMode(value));
}

export function wayfindingScopeMeta(value) {
  return meta(WAYFINDING_SCOPE_OPTIONS, normalizeWayfindingScope(value));
}

export function wayfindingSignTypeMeta(value) {
  return meta(WAYFINDING_SIGN_TYPES, String(value || ''), 0);
}

export function wayfindingMaterialMeta(value) {
  return meta(WAYFINDING_MATERIALS, normalizeWayfindingMaterial(value));
}

export function wayfindingMountingMeta(value) {
  return meta(WAYFINDING_MOUNTING_OPTIONS, normalizeWayfindingMounting(value));
}

export function wayfindingArrowStyleMeta(value) {
  return meta(WAYFINDING_ARROW_STYLES, normalizeWayfindingArrowStyle(value));
}

export function wayfindingLanguageMeta(value) {
  return meta(WAYFINDING_LANGUAGES, normalizeWayfindingLanguage(value));
}

export function wayfindingDimensionsText(value) {
  const d = normalizeWayfindingDimensions(value);
  return `宽 ${d.widthMm} mm x 高 ${d.heightMm} mm x 厚/深 ${d.depthMm} mm，建议安装中心高度 ${d.installHeightMm} mm`;
}

export function resolveWayfindingOutputPages(values = {}) {
  const outputMode = normalizeWayfindingOutputMode(values.outputMode);
  const scope = normalizeWayfindingScope(values.scope);
  const signTypes = normalizeWayfindingSignTypes(values.signTypes);
  const pageMode = normalizeWayfindingOutputPageMode(values.outputPageMode);
  const fixedCount = normalizeWayfindingOutputPageCount(values.outputPageCount);
  let total = fixedCount;
  if (pageMode === 'auto') {
    total = outputMode === 'scene-render' ? 2 : outputMode === 'single-sign' ? 1 : 3;
    const needsExpandedCoverage = signTypes.length >= 7 || scope === 'mixed';
    if (needsExpandedCoverage && outputMode !== 'single-sign') total = Math.min(4, Math.max(total, total + 1));
  }
  total = Math.min(MAX_WAYFINDING_OUTPUT_PAGES, Math.max(1, total));
  const titles = PAGE_TITLES[outputMode] || PAGE_TITLES['system-board'];
  return Array.from({ length: total }, (_, index) => ({
    index: index + 1,
    total,
    title: titles[index] || `Wayfinding page ${index + 1}`,
  }));
}

export function buildWayfindingExtractPrompt(values = {}) {
  const sourceText = cleanWayfindingText(values.sourceText, 50000);
  return [
    '请从博物馆/展陈资料中提炼“导视系统设计”所需的信息。',
    '输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"museumName":"场馆名称","projectTheme":"项目主题","zones":["展区或楼层"],"destinations":["目的地名称"],"routeText":"动线和导览逻辑","signText":"适合上牌的短文字","notes":"设计注意事项"}。',
    '要求：只基于资料提炼，不要编造不存在的展区或功能；导视文字要短、清晰、适合博物馆公共导览。',
    '',
    sourceText,
  ].join('\n');
}

export function parseWayfindingExtractJson(text) {
  const raw = cleanWayfindingText(text, 20000).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const asList = (value) => Array.isArray(value)
    ? value.map((item) => cleanWayfindingText(item, 200)).filter(Boolean)
    : cleanWayfindingText(value, 2000).split(/[;\n,，、]+/).map((item) => cleanWayfindingText(item, 200)).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    return {
      museumName: cleanWayfindingText(parsed?.museumName || parsed?.name || '', 300),
      projectTheme: cleanWayfindingText(parsed?.projectTheme || parsed?.theme || '', 800),
      zones: asList(parsed?.zones),
      destinations: asList(parsed?.destinations),
      routeText: cleanWayfindingText(parsed?.routeText || parsed?.route || '', 2000),
      signText: cleanWayfindingText(parsed?.signText || parsed?.copy || '', 2000),
      notes: cleanWayfindingText(parsed?.notes || parsed?.designNotes || '', 2000),
    };
  } catch {
    const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return {
      museumName: cleanWayfindingText(lines[0] || '', 300),
      projectTheme: cleanWayfindingText(lines[1] || '', 800),
      zones: [],
      destinations: [],
      routeText: cleanWayfindingText(lines.slice(2).join('\n'), 2000),
      signText: '',
      notes: '',
    };
  }
}

export function buildWayfindingImagePrompt(values = {}) {
  const outputMode = wayfindingOutputModeMeta(values.outputMode);
  const scope = wayfindingScopeMeta(values.scope);
  const signTypes = normalizeWayfindingSignTypes(values.signTypes).map(wayfindingSignTypeMeta);
  const material = wayfindingMaterialMeta(values.materialId);
  const mounting = wayfindingMountingMeta(values.mountingId);
  const arrow = wayfindingArrowStyleMeta(values.arrowStyle);
  const language = wayfindingLanguageMeta(values.language);
  const dimensions = wayfindingDimensionsText(values.dimensions);
  const museumName = cleanWayfindingText(values.museumName, 300);
  const projectTheme = cleanWayfindingText(values.projectTheme, 1000);
  const zones = Array.isArray(values.zones) ? values.zones.map((item) => cleanWayfindingText(item, 120)).filter(Boolean) : [];
  const destinations = Array.isArray(values.destinations) ? values.destinations.map((item) => cleanWayfindingText(item, 120)).filter(Boolean) : [];
  const routeText = cleanWayfindingText(values.routeText, 2000);
  const signText = cleanWayfindingText(values.signText, 2000);
  const notes = cleanWayfindingText(values.notes, 2000);
  const colorMaterial = cleanWayfindingText(values.colorMaterial, 2000);
  const colorMaterialPresetText = cleanWayfindingText(values.colorMaterialPresetText, 2000);
  const manual = cleanWayfindingText(values.supplement || values.manualRequirement, 2000);
  const outputPageMode = normalizeWayfindingOutputPageMode(values.outputPageMode);
  const outputPageCount = normalizeWayfindingOutputPageCount(values.outputPageCount);
  const pages = resolveWayfindingOutputPages({ ...values, outputMode: outputMode.id, scope: scope.id, signTypes: signTypes.map((item) => item.id), outputPageMode, outputPageCount });
  const totalPages = Math.min(MAX_WAYFINDING_OUTPUT_PAGES, Math.max(1, Math.round(Number(values.totalPages) || pages.length)));
  const pageIndex = Math.min(totalPages, Math.max(1, Math.round(Number(values.pageIndex) || 1)));
  const pageTitle = cleanWayfindingText(values.pageTitle, 120) || pages.find((page) => page.index === pageIndex)?.title || `导视系统第${pageIndex}页`;
  const pageModeText = outputPageMode === 'fixed'
    ? `输出页面控制：指定页数，共 ${totalPages} 页。`
    : `输出页面控制：自动分页，共 ${totalPages} 页，必须覆盖完整导视系统。`;
  const pageConstraint = [
    pageModeText,
    `当前页面：第 ${pageIndex} 页 / 共 ${totalPages} 页：${pageTitle}`,
    '分页要求：本次只生成当前页面，不要把其它页面压缩到同一张图；各页保持同一套导视视觉系统、色彩材质和图标语言。',
  ].join('\n');
  const colorMaterialLines = [
    colorMaterialPresetText ? `共享色彩与材质预设：${colorMaterialPresetText}` : '',
    colorMaterial ? `手动色彩与材质补充：${colorMaterial}` : '',
  ].filter(Boolean).join('\n');
  const referenceText = [
    values.hasSpaceReferenceImage ? '空间/材质参考图：用于参考建筑环境、色彩、材质气质和安装场景，不直接复制无关内容。' : '',
    values.hasGraphicReferenceImage ? '标识图形参考图：仅用于参考图标线性、箭头风格、符号节奏或品牌气质，不复制具体商标或版权图形。' : '',
  ].filter(Boolean).join('\n');
  const outputConstraint = outputMode.id === 'system-board'
    ? '输出模式要求：生成一张完整导视系统规范图，必须包含标牌家族、图标/箭头、字体层级、色彩材料、尺寸标注、安装方式、室内外应用示意；画面像专业方案汇报板，不是单一场景照片。'
    : outputMode.id === 'scene-render'
      ? '输出模式要求：生成真实博物馆场景中的导视方案效果图，标牌需要和建筑、展厅、广场或走廊环境真实结合，有尺度关系和可落地安装细节。'
      : outputMode.id === 'single-sign'
        ? '输出模式要求：生成单个标牌的深化设计图，展示正立面、轻微透视、厚度、材料、安装节点和必要尺寸。'
        : '输出模式要求：生成一整套协调的导视板式图，多个标牌并列展示，形成统一视觉系统。';
  const scopeConstraint = scope.id === 'indoor'
    ? '范围约束：只表现博物馆室内导视，不出现室外城市道路或停车场主导画面。'
    : scope.id === 'outdoor'
      ? '范围约束：只表现博物馆室外导视，不把画面做成室内展厅或商场导视。'
      : '范围约束：必须同时涉及博物馆室内与室外导视，使入口到展厅的连续导览关系清楚。';

  return [
    '用途：博物馆 / 展陈导视系统设计图生成。',
    `出图类型：${outputMode.label}；${outputMode.prompt}。`,
    `空间范围：${scope.label}；${scope.prompt}。`,
    scopeConstraint,
    outputConstraint,
    pageConstraint,
    '核心要求：生成专业、克制、可落地的博物馆导视设计系统；信息层级清晰，方向箭头准确，图标统一，材料真实，尺度可信。',
    museumName ? `场馆名称：${museumName}` : '场馆名称：未指定，请使用中性的博物馆导视占位名称，避免随机品牌 logo。',
    projectTheme ? `项目主题：${projectTheme}` : '',
    zones.length ? `展区/楼层：${zones.join('、')}` : '',
    destinations.length ? `目的地：${destinations.join('、')}` : '',
    routeText ? `导览动线：${routeText}` : '',
    signText ? `上牌文字：${signText}` : '',
    notes ? `设计注意事项：${notes}` : '',
    `标牌类型：${signTypes.map((item) => `${item.label}（${item.prompt}）`).join('；')}。`,
    `语言系统：${language.label}；${language.prompt}。`,
    `箭头/图标风格：${arrow.label}；${arrow.prompt}。`,
    colorMaterialLines ? `色彩与材质体系：\n${colorMaterialLines}` : '',
    `材质工艺：${material.label}；${material.prompt}。`,
    `安装方式：${mounting.label}；${mounting.prompt}。`,
    `尺寸与安装高度：${dimensions}。`,
    manual ? `手动补充要求：${manual}` : '',
    referenceText,
    '可读性约束：导视文字必须短、清楚、有层级；避免乱码、错误字、随机英文、随机 logo、广告感和商场促销风。',
    '博物馆约束：整体应适合历史文化展、艺术馆、科技馆、纪念馆等公共文化空间；保持庄重、友好、低反射、耐久、易维护。',
    '安全与无障碍：涉及公共导览时应体现无障碍路线、卫生间、电梯、出口、应急疏散等必要信息，但不要把画面变成消防图纸。',
  ].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
