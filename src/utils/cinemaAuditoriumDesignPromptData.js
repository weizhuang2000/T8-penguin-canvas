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

function referenceOrderText(urls, labelPrefix, offset = 0) {
  return urls.map((url, index) => `@img${offset + index + 1}: ${labelPrefix}${index + 1} = ${url}`).join('\n');
}

function baseCinemaContext(values = {}) {
  const venue = cinemaVenueTypeMeta(values.venueType);
  const side = cinemaScreenStageSideMeta(values.screenStageSide);
  const aisle = cinemaAisleModeMeta(values.aisleMode);
  const slope = cinemaSlopeModeMeta(values.slopeMode);
  const screen = cinemaScreenTypeMeta(values.screenType);
  const audio = cinemaAudioSystemMeta(values.audioSystem);
  const effects = cinemaSpecialEffectMetas(values.specialEffects);
  const capacityMode = values.capacityMode === 'manual' ? 'manual' : 'auto';
  const seatCount = Math.max(0, Math.round(Number(values.seatCount) || 0));
  return [
    `空间类型：${venue.label}；${venue.prompt}`,
    `空间尺寸：${dimensionsText(values.dimensions)}。`,
    `银幕/舞台区方向：${side.label}；${side.prompt}。`,
    `座席容量：${capacityMode === 'manual' && seatCount > 0 ? `${seatCount} seats` : '按空间尺寸自动推导合理座席数'}。`,
    `走道模式：${aisle.label}；${aisle.prompt}。`,
    `地坪/视线：${slope.label}；${slope.prompt}。`,
    `银幕系统：${screen.label}；${screen.prompt}。`,
    `声学系统：${audio.label}；${audio.prompt}。`,
    effects.length ? `特效系统：${effects.map((item) => `${item.label}(${item.prompt})`).join('；')}。` : '特效系统：无额外特效，按常规影院/报告厅设备配置。',
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
  const allReferences = [...spaceReferences, ...colorReferences, ...equipmentReferences];
  return [
    '核心要求：生成专业影院/报告厅/特效影院空间设计主效果图，可用于方案汇报；空间尺度、银幕舞台方向、座席视线、声学材料、疏散与设备区必须可信。',
    baseCinemaContext(values),
    colorMaterialContext(values),
    spaceReferences.length ? `空间/建筑参考图只参考结构尺度、入口位置、层高、动线和空间气质，不复制无关文字或品牌。\n${referenceOrderText(spaceReferences, '空间/建筑参考')}` : '',
    colorReferences.length ? `色彩材质参考图只参考配色、饰面材质、反射/吸音/软包质感和灯光氛围。\n${referenceOrderText(colorReferences, '色彩材质参考', spaceReferences.length)}` : '',
    equipmentReferences.length ? `设备/座椅/舞台参考图只参考座椅、银幕、舞台、音响、灯光、放映/LED/特效设备的构成关系。\n${referenceOrderText(equipmentReferences, '设备参考', spaceReferences.length + colorReferences.length)}` : '',
    allReferences.length ? `参考图总顺序：${allReferences.map((_, index) => `@img${index + 1}`).join('、')}` : '',
    values.supplement ? `补充要求：${cleanCinemaAuditoriumText(values.supplement, 3000)}` : '',
    '画面要求：广角但不变形，能看清银幕/舞台区、观众席、墙顶地材质、声学扩散/吸音处理、灯光层次、控制室或设备入口暗示；避免随机logo、乱码文字、不可施工悬浮结构。',
  ].filter(Boolean).join('\n');
}

export function buildCinemaAuditoriumDrawingPrompt(values = {}) {
  const output = cinemaOutputTypeMeta(values.outputType);
  const renderImage = cleanCinemaAuditoriumText(values.renderImage, 1000);
  const previousDrawingImage = cleanCinemaAuditoriumText(values.previousDrawingImage, 1000);
  const planReferenceImage = cleanCinemaAuditoriumText(values.planReferenceImage, 1000);
  const userReferences = Array.isArray(values.userReferenceImages) ? values.userReferenceImages.filter(Boolean) : [];
  const isSystemPrinciple = output.id === 'system-principle';
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
    'color-plan': '生成彩色平面图：必须保持长宽比例和银幕舞台方向，清晰标出银幕/舞台区、座席区、排距逻辑、中心/侧走道、出入口、疏散方向、控制室/机房、设备区、无障碍席位、墙体边界和功能分区色块。以给定前端比例底图为首要结构依据。',
    'system-principle': '生成系统设备原理图：只做各系统设备之间的连线拓扑结构图，不需要主效果图，不需要彩色平面图，不表现空间透视、座席排布或房间平面。必须包含放映/LED/投影系统、银幕或舞台显示面、音响系统、灯光系统、控制机房、服务器/播放系统、功放/处理器、网络/信号链路、电源与弱电、动感座椅/风效/水雾/气味/震动等特效设备（如启用）、疏散报警/应急广播与检修维护节点；设备尽量以清晰图标、符号或小型 pictogram 表现，用箭头和不同线型表达视频信号、音频信号、控制信号、供电、特效联动和安全联动关系。',
  };

  return [
    isSystemPrinciple
      ? `核心要求：根据影院报告厅配置生成“${output.label}”，画面必须是设备系统拓扑连线图；不要参考主效果图或彩平图，不要生成室内效果图、平面布局图、座席图或空间渲染图。`
      : `核心要求：根据同一影院报告厅设计生成“${output.label}”，必须和主效果图保持同一空间、同一银幕舞台方向、同一座席与设备系统逻辑。`,
    `图纸类型：${output.prompt}`,
    typeRequirements[output.id] || output.prompt,
    baseCinemaContext(values),
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
