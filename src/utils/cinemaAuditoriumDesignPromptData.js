export const CINEMA_AUDITORIUM_VENUE_TYPES = [
  { id: 'standard-cinema', label: '标准影厅', prompt: 'standard cinema auditorium with clear screen focus, raked seating and acoustic wall treatment' },
  { id: 'imax-giant-screen', label: 'IMAX/巨幕厅', prompt: 'giant screen cinema auditorium, large-format immersive screen, premium acoustic and projection requirements' },
  { id: 'vip-cinema', label: 'VIP影院', prompt: 'VIP cinema with lounge seats, wider row spacing, premium finishes and controlled intimate lighting' },
  { id: 'multi-purpose-auditorium', label: '多功能报告厅', prompt: 'multi-purpose auditorium for lectures, conferences, screenings and small performances' },
  { id: 'academic-report-hall', label: '学术报告厅', prompt: 'academic report hall with lectern, projection, audience seating, simultaneous conference and recording systems' },
  { id: 'theater-report-hall', label: '剧场式报告厅', prompt: 'theater-style report hall with stage, curtains, lighting bars and formal auditorium seating' },
  { id: 'black-box-hall', label: '黑盒厅', prompt: 'black box hall with flexible seating, dark acoustic shell, adjustable lighting and modular screen/stage layout' },
  { id: 'immersive-cinema', label: '沉浸式影院', prompt: 'immersive cinema with wraparound media surfaces, spatial audio, controlled visitor circulation and projection mapping' },
  { id: 'dome-cinema', label: '穹幕影院', prompt: 'dome cinema with hemispherical screen, reclined seating, centralized projection and planetarium-style media system' },
  { id: 'flying-theater', label: '飞行影院', prompt: 'flying theater with suspended or motion seats, giant curved screen, wind, scent and synchronized motion effects' },
  { id: 'motion-cinema', label: '动感影院', prompt: 'motion cinema with dynamic seats, synchronized effects, screen, audio, safety restraints and equipment maintenance zones' },
  { id: '4d-5d-cinema', label: '4D/5D影院', prompt: '4D or 5D cinema with motion seats, wind, water mist, scent, vibration, lighting and show-control systems' },
  { id: '9d-cinema', label: '9D影院', prompt: '9D cinema with VR or stereoscopic display, motion platform seats, wind, mist, scent, leg ticklers, back push, vibration and show-control equipment' },
];

export const CINEMA_AUDITORIUM_OUTPUT_TYPES = [
  { id: 'render', label: '主效果图', prompt: 'main auditorium interior concept rendering' },
  { id: 'color-plan', label: '彩色平面图', prompt: 'scaled colored floor plan diagram with screen/stage direction, seating, aisles and equipment zones' },
  { id: 'system-principle', label: '系统设备原理图', prompt: 'system equipment principle diagram showing projection or LED, audio, lighting, control room, servers, special effects and maintenance relationships' },
];

export const CINEMA_AUDITORIUM_DEFAULT_OUTPUTS = ['render', 'color-plan', 'system-principle'];

export const CINEMA_SCREEN_STAGE_SIDES = [
  { id: 'north', label: '北侧/上方', prompt: 'screen and stage zone is on the north/top side of the plan' },
  { id: 'south', label: '南侧/下方', prompt: 'screen and stage zone is on the south/bottom side of the plan' },
  { id: 'east', label: '东侧/右方', prompt: 'screen and stage zone is on the east/right side of the plan' },
  { id: 'west', label: '西侧/左方', prompt: 'screen and stage zone is on the west/left side of the plan' },
];

export const CINEMA_AISLE_MODES = [
  { id: 'center-and-side', label: '中走道+边走道', prompt: 'center aisle plus side aisles with clear evacuation logic' },
  { id: 'side-only', label: '双侧走道', prompt: 'side aisles only, compact central seating block' },
  { id: 'center-only', label: '中走道', prompt: 'single center aisle dividing two seating banks' },
  { id: 'cross-aisle', label: '横纵复合走道', prompt: 'center, side and cross aisles for larger auditorium evacuation' },
];

export const CINEMA_SLOPE_MODES = [
  { id: 'raked-floor', label: '阶梯升起', prompt: 'raked floor with stepped seating sightlines' },
  { id: 'flat-floor', label: '平地报告厅', prompt: 'flat floor auditorium with conference seating and accessible circulation' },
  { id: 'stadium-seating', label: '高阶梯座席', prompt: 'stadium seating with strong vertical sightline gradient' },
  { id: 'reclined-dome', label: '穹幕仰躺座席', prompt: 'reclined seating optimized for dome or overhead screen viewing' },
];

export const CINEMA_SCREEN_TYPES = [
  { id: 'cinema-screen', label: '影院银幕', prompt: 'cinema projection screen with acoustic transparent screen option' },
  { id: 'stage-screen', label: '舞台+屏幕', prompt: 'stage and screen combination for reports, performances and projection' },
  { id: 'led-wall', label: 'LED大屏', prompt: 'large LED wall with control system, heat dissipation and maintenance access' },
  { id: 'wraparound-screen', label: '环绕屏', prompt: 'wraparound curved screen or multi-wall immersive projection surface' },
  { id: 'dome-screen', label: '穹幕', prompt: 'hemispherical dome screen with central or multi-projector system' },
];

export const CINEMA_MAIN_SCREEN_KINDS = [
  { id: 'unspecified', label: '不指定', prompt: 'main screen type is not specified, keep projection or LED chain selectable in the system topology' },
  { id: 'led', label: 'LED大屏', prompt: 'LED main screen with sending box, receiving cards, video processor, power distribution, cooling and maintenance modules' },
  { id: 'projection', label: '投影', prompt: 'projection main screen with projector, lens, media server, projection screen, signal extender and projection control chain' },
];

export const CINEMA_AUDIO_SYSTEMS = [
  { id: 'surround-7-1', label: '7.1环绕声', prompt: '7.1 surround sound with front, side, rear speakers and subwoofers' },
  { id: 'dolby-atmos', label: '全景声', prompt: 'immersive spatial audio with overhead speakers, surround arrays and tuned acoustic panels' },
  { id: 'conference-audio', label: '会议扩声', prompt: 'conference sound reinforcement with microphones, lectern audio, ceiling speakers and recording' },
  { id: 'show-control-audio', label: '特效联动音频', prompt: 'show-control synchronized audio system for motion, wind, water mist and lighting effects' },
];

export const CINEMA_SPECIAL_EFFECTS = [
  { id: 'motion-seats', label: '动感座椅', prompt: 'motion seats or motion platform with safety restraints and control wiring' },
  { id: 'wind', label: '风效', prompt: 'wind effect machines integrated into seat rows or side walls' },
  { id: 'water-mist', label: '水雾', prompt: 'water mist effect with drainage and maintenance access' },
  { id: 'scent', label: '气味', prompt: 'scent effect system with controlled release and ventilation coordination' },
  { id: 'vibration', label: '震动', prompt: 'vibration effect synchronized to media timeline' },
  { id: 'leg-tickler', label: '扫腿/触感', prompt: 'leg tickler or tactile effect devices integrated under seats' },
  { id: 'vr', label: 'VR/立体显示', prompt: 'VR or stereoscopic viewing devices with storage, cleaning and charging workflow' },
];

function normalizeId(value, options, fallback) {
  const id = String(value || '').trim();
  return options.some((item) => item.id === id) ? id : fallback;
}

export function cleanCinemaAuditoriumText(value, limit = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function normalizeCinemaVenueType(value) {
  return normalizeId(value, CINEMA_AUDITORIUM_VENUE_TYPES, 'standard-cinema');
}

export function normalizeCinemaOutputType(value) {
  return normalizeId(value, CINEMA_AUDITORIUM_OUTPUT_TYPES, 'render');
}

export function normalizeCinemaOutputSelection(value) {
  const source = Array.isArray(value) ? value : CINEMA_AUDITORIUM_DEFAULT_OUTPUTS;
  const out = [];
  for (const item of source) {
    const id = normalizeCinemaOutputType(item);
    if (!out.includes(id)) out.push(id);
  }
  return out.length ? out : CINEMA_AUDITORIUM_DEFAULT_OUTPUTS.slice();
}

export function normalizeCinemaScreenStageSide(value) {
  return normalizeId(value, CINEMA_SCREEN_STAGE_SIDES, 'north');
}

export function normalizeCinemaAisleMode(value) {
  return normalizeId(value, CINEMA_AISLE_MODES, 'center-and-side');
}

export function normalizeCinemaSlopeMode(value) {
  return normalizeId(value, CINEMA_SLOPE_MODES, 'raked-floor');
}

export function normalizeCinemaScreenType(value) {
  return normalizeId(value, CINEMA_SCREEN_TYPES, 'cinema-screen');
}

export function normalizeCinemaMainScreenKind(value) {
  return normalizeId(value, CINEMA_MAIN_SCREEN_KINDS, 'unspecified');
}

export function normalizeCinemaAudioSystem(value) {
  return normalizeId(value, CINEMA_AUDIO_SYSTEMS, 'surround-7-1');
}

export function normalizeCinemaSpecialEffects(value) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  for (const raw of source) {
    const id = String(raw || '').trim();
    if (CINEMA_SPECIAL_EFFECTS.some((item) => item.id === id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function positiveNumber(value, fallback, min = 1000, max = 200000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizeCinemaDimensions(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    lengthMm: positiveNumber(source.lengthMm, 24000, 3000),
    widthMm: positiveNumber(source.widthMm, 16000, 3000),
    heightMm: positiveNumber(source.heightMm, 7500, 2500),
  };
}

function meta(options, value, fallback) {
  const id = normalizeId(value, options, fallback);
  return options.find((item) => item.id === id) || options[0];
}

export function cinemaVenueTypeMeta(value) {
  return meta(CINEMA_AUDITORIUM_VENUE_TYPES, value, 'standard-cinema');
}

export function cinemaOutputTypeMeta(value) {
  return meta(CINEMA_AUDITORIUM_OUTPUT_TYPES, value, 'render');
}

export function cinemaScreenStageSideMeta(value) {
  return meta(CINEMA_SCREEN_STAGE_SIDES, value, 'north');
}

export function cinemaAisleModeMeta(value) {
  return meta(CINEMA_AISLE_MODES, value, 'center-and-side');
}

export function cinemaSlopeModeMeta(value) {
  return meta(CINEMA_SLOPE_MODES, value, 'raked-floor');
}

export function cinemaScreenTypeMeta(value) {
  return meta(CINEMA_SCREEN_TYPES, value, 'cinema-screen');
}

export function cinemaMainScreenKindMeta(value) {
  return meta(CINEMA_MAIN_SCREEN_KINDS, value, 'unspecified');
}

export function cinemaAudioSystemMeta(value) {
  return meta(CINEMA_AUDIO_SYSTEMS, value, 'surround-7-1');
}

export function cinemaSpecialEffectMetas(value) {
  const ids = normalizeCinemaSpecialEffects(value);
  return ids.map((id) => CINEMA_SPECIAL_EFFECTS.find((item) => item.id === id)).filter(Boolean);
}

export function colorMaterialTextFromCinemaPreset(preset) {
  if (!preset) return '';
  return [
    preset.label ? `色彩材质预设：${preset.label}` : '',
    preset.info ? `预设说明：${preset.info}` : '',
    preset.prompt ? `色彩材质提示：${preset.prompt}` : '',
  ].filter(Boolean).join('\n');
}

function dimensionsText(values = {}) {
  const d = normalizeCinemaDimensions(values);
  return `${d.lengthMm}mm(L) x ${d.widthMm}mm(W) x ${d.heightMm}mm(H)`;
}

export function estimateCinemaSystemPower(values = {}) {
  const dimensions = normalizeCinemaDimensions(values.dimensions);
  const mainScreenKind = normalizeCinemaMainScreenKind(values.mainScreenKind);
  const audioSystem = normalizeCinemaAudioSystem(values.audioSystem);
  const effects = normalizeCinemaSpecialEffects(values.specialEffects);
  const areaSqm = Math.max(1, (dimensions.lengthMm * dimensions.widthMm) / 1000000);
  const seatCount = Math.max(0, Math.round(Number(values.seatCount) || 0));
  const effectiveSeats = seatCount || Math.max(40, Math.round(areaSqm / 2.8));
  const displayPowerKw = mainScreenKind === 'led'
    ? Math.max(12, Math.round(areaSqm * 0.55))
    : mainScreenKind === 'projection'
      ? Math.max(3, Math.round(areaSqm * 0.08))
      : Math.max(6, Math.round(areaSqm * 0.18));
  const audioPowerKw = audioSystem === 'dolby-atmos'
    ? Math.max(6, Math.round(effectiveSeats * 0.08))
    : audioSystem === 'conference-audio'
      ? Math.max(2, Math.round(effectiveSeats * 0.03))
      : Math.max(4, Math.round(effectiveSeats * 0.05));
  const lightingPowerKw = Math.max(3, Math.round(areaSqm * 0.04));
  const controlPowerKw = mainScreenKind === 'led' ? 6 : 4;
  const effectPowerKw = effects.reduce((sum, id) => {
    if (id === 'motion-seats') return sum + Math.max(6, Math.round(effectiveSeats * 0.05));
    if (id === 'wind') return sum + 4;
    if (id === 'water-mist') return sum + 3;
    if (id === 'scent') return sum + 1;
    if (id === 'vibration') return sum + 4;
    if (id === 'leg-tickler') return sum + 2;
    if (id === 'vr') return sum + Math.max(2, Math.round(effectiveSeats * 0.02));
    return sum;
  }, 0);
  const totalKw = Math.max(1, Math.round((displayPowerKw + audioPowerKw + lightingPowerKw + controlPowerKw + effectPowerKw) * 1.2));
  return {
    totalKw,
    displayPowerKw,
    audioPowerKw,
    lightingPowerKw,
    controlPowerKw,
    effectPowerKw,
    effectiveSeats,
  };
}

function referenceOrderText(urls, labelPrefix, offset = 0) {
  return urls.map((url, index) => `@img${offset + index + 1}: ${labelPrefix}${index + 1} = ${url}`).join('\n');
}

function baseCinemaContext(values = {}) {
  const venue = cinemaVenueTypeMeta(values.venueType);
  const side = cinemaScreenStageSideMeta(values.screenStageSide);
  const aisle = cinemaAisleModeMeta(values.aisleMode);
  const slope = cinemaSlopeModeMeta(values.slopeMode);
  const screen = cinemaScreenTypeMeta(values.screenType);
  const mainScreen = cinemaMainScreenKindMeta(values.mainScreenKind);
  const audio = cinemaAudioSystemMeta(values.audioSystem);
  const effects = cinemaSpecialEffectMetas(values.specialEffects);
  const capacityMode = values.capacityMode === 'manual' ? 'manual' : 'auto';
  const seatCount = Math.max(0, Math.round(Number(values.seatCount) || 0));
  const seatWidthMm = Math.max(250, Math.round(Number(values.seatWidthMm) || 550));
  const seatDepthMm = Math.max(250, Math.round(Number(values.seatDepthMm) || 600));
  const seatGapMm = Math.max(0, Math.round(Number(values.seatGapMm) || 80));
  const rowSpacingMm = Math.max(seatDepthMm, Math.round(Number(values.rowSpacingMm) || 900));
  const frontClearanceMm = Math.max(0, Math.round(Number(values.frontClearanceMm) || 1600));
  const sideAisleWidthMm = Math.max(0, Math.round(Number(values.sideAisleWidthMm) || 1200));
  const centerAisleWidthMm = Math.max(0, Math.round(Number(values.centerAisleWidthMm) || 1200));
  const isDomeCinema = venue.id === 'dome-cinema' || screen.id === 'dome-screen' || slope.id === 'reclined-dome';
  const isFlyingCinema = venue.id === 'flying-theater';
  return [
    `空间类型：${venue.label}；${venue.prompt}`,
    `空间尺寸：${dimensionsText(values.dimensions)}。`,
    `银幕/舞台区方向：${side.label}；${side.prompt}。`,
    `座席容量：${capacityMode === 'manual' && seatCount > 0 ? `${seatCount} seats` : '按空间尺寸自动推导合理座席数'}。`,
    `走道模式：${aisle.label}；${aisle.prompt}。`,
    `平面布局参数：座椅占地 ${seatWidthMm} x ${seatDepthMm} mm，座椅间隙 ${seatGapMm} mm，行间距 ${rowSpacingMm} mm，前区净距 ${frontClearanceMm} mm，侧走道宽 ${sideAisleWidthMm} mm，中走道宽 ${centerAisleWidthMm} mm；这些参数必须作为座位排布和通道尺度硬约束。`,
    `地坪/视线：${slope.label}；${slope.prompt}。`,
    `银幕系统：${screen.label}；${screen.prompt}。`,
    `主屏幕种类：${mainScreen.label}；${mainScreen.prompt}。`,
    `声学系统：${audio.label}；${audio.prompt}。`,
    effects.length ? `特效系统：${effects.map((item) => `${item.label}(${item.prompt})`).join('；')}。` : '特效系统：无额外特效，按常规影院/报告厅设备配置。',
    isDomeCinema ? '穹幕影院专用约束：顶部必须是倒扣的半圆形/半球形穹幕屏，不是普通竖向银幕；地面场地按圆形或近圆形组织，观众席沿圆弧排布，中间几行座椅数量最多，向前排和后排逐渐减少，座椅宜为仰躺或半躺观看穹顶。' : '',
    isFlyingCinema ? '飞行影院专用约束：空间必须表现为飞越式悬挂飞行影院，不是普通地面座椅影院；前方为超大凹弧形/半包裹飞行视景屏，后方为装载平台，多层长排吊挂座椅由上方钢结构大臂、升降臂或连杆机构整体推送到观影位置，观众脚下悬空面向弧幕；下方保留安全束缚、检修和特效设备区，长排座椅与风、雾、气味、震动等特效联动。' : '',
  ].join('\n');
}

function colorMaterialContext(values = {}) {
  const presetText = cleanCinemaAuditoriumText(values.colorMaterialPresetText, 3000);
  const manual = cleanCinemaAuditoriumText(values.colorMaterial, 3000);
  const tone = cleanCinemaAuditoriumText(values.colorMaterialReferenceTone, 2000);
  return [
    presetText,
    manual ? `手动色彩材质要求：${manual}` : '',
    tone ? `色彩材质参考图分析/倾向：${tone}` : '',
  ].filter(Boolean).join('\n');
}

export function buildCinemaAuditoriumSummary(values = {}) {
  return [
    '# 影院报告厅设计',
    '',
    baseCinemaContext(values),
    '',
    colorMaterialContext(values),
    values.supplement ? `补充要求：${cleanCinemaAuditoriumText(values.supplement, 3000)}` : '',
  ].filter(Boolean).join('\n');
}

export function buildCinemaAuditoriumImagePrompt(values = {}) {
  const spaceReferences = Array.isArray(values.spaceReferenceImages) ? values.spaceReferenceImages.filter(Boolean) : [];
  const colorReferences = Array.isArray(values.colorMaterialReferenceImages) ? values.colorMaterialReferenceImages.filter(Boolean) : [];
  const equipmentReferences = Array.isArray(values.equipmentReferenceImages) ? values.equipmentReferenceImages.filter(Boolean) : [];
  const colorPlanReferences = Array.isArray(values.colorPlanReferenceImages) ? values.colorPlanReferenceImages.filter(Boolean) : [];
  const allReferences = [...colorPlanReferences, ...spaceReferences, ...colorReferences, ...equipmentReferences];
  const capacityMode = values.capacityMode === 'manual' ? 'manual' : 'auto';
  const seatCount = Math.max(0, Math.round(Number(values.seatCount) || 0));
  const isDomeCinema = values.venueType === 'dome-cinema' || values.screenType === 'dome-screen' || values.slopeMode === 'reclined-dome';
  const isFlyingCinema = values.venueType === 'flying-theater';
  const layoutSeatSpec = cleanCinemaAuditoriumText(values.layoutSeatSpec, 2000);
  return [
    '核心要求：生成专业影院/报告厅/特效影院空间设计主效果图，可用于方案汇报；空间尺度、银幕舞台方向、座席视线、声学材料、疏散与设备区必须可信。',
    isDomeCinema ? '穹幕影院主效果图专用要求：画面顶部必须表现倒扣半圆形/半球形穹幕屏，观众仰视穹顶内容；不要生成一面普通墙面银幕或矩形影厅。地面和坐席按圆形场地组织，座椅沿圆弧成排，中间几排座椅数量最多，前后排逐渐减少，整体类似天文馆/穹幕影院。' : '',
    isFlyingCinema ? '飞行影院主效果图专用要求：必须表现飞越式多层吊挂飞行影院，不要画成普通固定座椅影厅，也不要画成零散独立小舱。画面应包含前方巨大凹弧形飞行视景屏或半包裹弧幕、后方装载平台、上方钢结构大臂/升降臂/吊挂连杆、多层长排悬挂座椅梁；观众坐在连续长排座椅上，开场后整排座椅被推送/抬升到弧幕前，脚下悬空，配合风雾气味等特效设备。' : '',
    colorPlanReferences.length ? `平面布局参考图是硬约束：必须严格依据该布局图推理座椅总数量、座椅占地、行间距、左右/前后分区、中心走道、侧走道、银幕舞台方向和控制/设备区位置；不要把单侧座位数误当成总座位数，也不要让效果图座椅数量与平面布局或彩平图不符。\n${referenceOrderText(colorPlanReferences, '平面布局硬约束')}` : '',
    layoutSeatSpec ? `逐排座位数硬约束：${layoutSeatSpec} 必须逐排逐列严格一致；透视角度不能新增座椅，不能把每排 6 座画成 7 座，不能在左右边缘额外补座。` : '',
    capacityMode === 'manual' && seatCount > 0 ? `座椅数量硬约束：画面中的观众座椅总数必须约为 ${seatCount} 座；如彩平图分为左右两区，则左右两区合计才是 ${seatCount} 座，不是每侧 ${seatCount} 座。` : '',
    baseCinemaContext(values),
    colorMaterialContext(values),
    spaceReferences.length ? `空间/建筑参考图只参考结构尺度、入口位置、层高、动线和空间气质，不复制无关文字或品牌。\n${referenceOrderText(spaceReferences, '空间/建筑参考', colorPlanReferences.length)}` : '',
    colorReferences.length ? `色彩材质参考图只参考配色、饰面材质、反射/吸音/软包质感和灯光氛围。\n${referenceOrderText(colorReferences, '色彩材质参考', colorPlanReferences.length + spaceReferences.length)}` : '',
    equipmentReferences.length ? `设备/座椅/舞台参考图只参考座椅、银幕、舞台、音响、灯光、放映/LED/特效设备的构成关系。\n${referenceOrderText(equipmentReferences, '设备参考', colorPlanReferences.length + spaceReferences.length + colorReferences.length)}` : '',
    allReferences.length ? `参考图总顺序：${allReferences.map((_, index) => `@img${index + 1}`).join('、')}` : '',
    values.supplement ? `补充要求：${cleanCinemaAuditoriumText(values.supplement, 3000)}` : '',
    '画面要求：广角但不变形，能看清银幕/舞台区、观众席、墙顶地材质、声学扩散/吸音处理、灯光层次、控制室或设备入口暗示；座椅排数、左右分区、走道位置、座椅占地和行间距必须与平面布局参考图一致；避免随机logo、乱码文字、不可施工悬浮结构。',
  ].filter(Boolean).join('\n');
}

export function buildCinemaAuditoriumDrawingPrompt(values = {}) {
  const output = cinemaOutputTypeMeta(values.outputType);
  const renderImage = cleanCinemaAuditoriumText(values.renderImage, 1000);
  const previousDrawingImage = cleanCinemaAuditoriumText(values.previousDrawingImage, 1000);
  const planReferenceImage = cleanCinemaAuditoriumText(values.planReferenceImage, 1000);
  const userReferences = Array.isArray(values.userReferenceImages) ? values.userReferenceImages.filter(Boolean) : [];
  const isSystemPrinciple = output.id === 'system-principle';
  const mainScreen = cinemaMainScreenKindMeta(values.mainScreenKind);
  const isDomeCinema = values.venueType === 'dome-cinema' || values.screenType === 'dome-screen' || values.slopeMode === 'reclined-dome';
  const isFlyingCinema = values.venueType === 'flying-theater';
  const layoutSeatSpec = cleanCinemaAuditoriumText(values.layoutSeatSpec, 2000);
  const power = estimateCinemaSystemPower(values);
  const referenceLines = [
    !isSystemPrinciple && renderImage ? `@img1: 主效果图一致性参考 = ${renderImage}` : '',
    !isSystemPrinciple && previousDrawingImage ? `@img2: 上一张图纸一致性参考 = ${previousDrawingImage}` : '',
    !isSystemPrinciple && planReferenceImage ? `@img${(renderImage ? 1 : 0) + (previousDrawingImage ? 1 : 0) + 1}: 严格比例彩平底图 = ${planReferenceImage}` : '',
    userReferences.length ? referenceOrderText(
      userReferences,
      isSystemPrinciple ? '设备图标/系统参考图' : '用户参考图',
      isSystemPrinciple ? 0 : (renderImage ? 1 : 0) + (previousDrawingImage ? 1 : 0) + (planReferenceImage ? 1 : 0),
    ) : '',
  ].filter(Boolean).join('\n');

  const typeRequirements = {
    'color-plan': isDomeCinema
      ? '生成穹幕影院彩色平面图：必须保持圆形或近圆形场地，清晰标出上方半圆穹幕/倒扣半球屏、圆形观众区、弧形座椅排、中心/环形走道、出入口、疏散方向、控制室/机房和投影设备区；座椅排布必须中间几行数量最多，向前后逐渐减少。以给定前端圆形平面布局底图为首要结构依据，不得改成矩形影厅或普通银幕厅。'
      : isFlyingCinema
        ? '生成飞行影院彩色平面图：必须表现前方超大凹弧幕/半包裹飞行视景屏、多层长排吊挂飞行座椅梁、上方钢结构大臂或升降臂轨道投影、后方装载平台、等候区、安全束缚区、检修通道、控制机房、风雾气味等特效设备区和疏散方向。座椅按多层长排布置，不得画成普通地面座椅排布、报告厅平面或零散独立座舱盒子。'
        : '生成彩色平面图：必须保持长宽比例和银幕舞台方向，清晰标出银幕/舞台区、座席区、座椅占地、行间距、排距逻辑、中心/侧走道、出入口、疏散方向、控制室/机房、设备区、无障碍席位、墙体边界和功能分区色块。以给定前端平面布局底图为首要结构依据，不得增减座位总数或改变走道宽度逻辑。',
    'system-principle': '生成系统设备原理图：只做各系统设备之间的连线拓扑结构图，不需要主效果图，不需要彩色平面图，不表现空间透视、座席排布或房间平面。必须包含放映/LED/投影系统、银幕或舞台显示面、音响系统、灯光系统、控制机房、服务器/播放系统、功放/处理器、网络/信号链路、电源与弱电、动感座椅/风效/水雾/气味/震动等特效设备（如启用）、疏散报警/应急广播与检修维护节点；设备尽量以清晰图标、符号或小型 pictogram 表现，用箭头和不同线型表达视频信号、音频信号、控制信号、供电、特效联动和安全联动关系。',
  };
  const screenTopologyText = isSystemPrinciple && mainScreen.id === 'led'
    ? '主屏幕链路必须按 LED 大屏细化：播放服务器/媒体服务器 -> 拼接/视频处理器 -> LED发送盒 -> 接收卡/箱体模组 -> LED显示屏；同时标出配电柜、开关电源、散热/检修、备份信号和控制网络。'
    : isSystemPrinciple && mainScreen.id === 'projection'
      ? '主屏幕链路必须按投影系统细化：播放服务器/媒体服务器 -> 视频处理/矩阵 -> 光纤/HDBaseT延长 -> 投影机 -> 镜头 -> 投影银幕；同时标出投影机供电、吊架/放映窗、散热、校正控制和备份输入。'
      : isSystemPrinciple
        ? '主屏幕链路未指定时，图中保留“主显示系统”模块，并用可替换分支表示 LED 大屏或投影均可接入视频处理/播放服务器。'
        : '';
  const flyingTopologyText = isSystemPrinciple && isFlyingCinema
    ? '飞行影院设备拓扑必须额外细化：中央 show-control/PLC 安全控制 -> 钢结构大臂/升降臂/吊挂连杆控制柜 -> 多层长排吊挂座椅梁执行器与安全锁扣 -> 座椅急停/限位/安全带检测；同时连接风机、雾化、气味、震动、音频、灯光和影片时间码同步系统，并标出后方装载平台、检修区和应急下降/疏散联动。'
    : '';
  const powerText = isSystemPrinciple
    ? `功率标注要求：系统原理图必须显示估算总功率约 ${power.totalKw} kW，并列出分项功率：主屏显示约 ${power.displayPowerKw} kW、音响约 ${power.audioPowerKw} kW、灯光约 ${power.lightingPowerKw} kW、控制/服务器约 ${power.controlPowerKw} kW、特效约 ${power.effectPowerKw} kW；标注“估算值，需深化校核”。`
    : '';

  return [
    isSystemPrinciple
      ? `核心要求：根据影院报告厅配置生成“${output.label}”，画面必须是设备系统拓扑连线图；不要参考主效果图或彩平图，不要生成室内效果图、平面布局图、座席图或空间渲染图。`
      : `核心要求：根据同一影院报告厅设计生成“${output.label}”，必须和主效果图保持同一空间、同一银幕舞台方向、同一座席与设备系统逻辑。`,
    `图纸类型：${output.prompt}`,
    typeRequirements[output.id] || output.prompt,
    screenTopologyText,
    flyingTopologyText,
    powerText,
    baseCinemaContext(values),
    !isSystemPrinciple && layoutSeatSpec ? `逐排座位数硬约束：${layoutSeatSpec} 彩平图和效果图都必须保持每排数量完全一致，不得每排多画一个座位。` : '',
    colorMaterialContext(values),
    isSystemPrinciple
      ? '拓扑表达要求：以控制机房/播放服务器/中央控制为核心，向显示、音频、灯光、特效、安全与电源系统分组连线；每个设备用图标化符号表达，配短中文标签和图例，线缆关系要清楚。'
      : '一致性参考：后续图纸必须优先继承 @img1 主效果图的空间语言；彩平图必须优先继承严格比例彩平底图。',
    referenceLines,
    values.supplement ? `补充要求：${cleanCinemaAuditoriumText(values.supplement, 3000)}` : '',
    isSystemPrinciple
      ? '表现要求：白底或浅底的专业系统拓扑图风格，图标、节点、箭头、线型图例和短中文标签清晰可信；不要画成效果图、彩平图、剖面图或复杂施工图，不要长段乱码文字，不要伪造品牌。'
      : '表现要求：白底或浅底专业汇报图风格，色块、箭头、图例和短中文标签清晰可信；不要长段乱码文字，不要伪造品牌，不要改变已给定长宽高和银幕舞台方向。',
  ].filter(Boolean).join('\n');
}
