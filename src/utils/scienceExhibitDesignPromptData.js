export const SCIENCE_EXHIBIT_DOMAINS = [
  { id: 'physics', label: '物理科学', prompt: 'force, motion, optics, electricity, magnetism, wave or energy conversion principle' },
  { id: 'life-science', label: '生命科学', prompt: 'biology, human body, ecology, genetics or microscopic life science principle' },
  { id: 'earth-space', label: '地球与宇宙', prompt: 'geology, climate, astronomy, planetary motion or earth system principle' },
  { id: 'engineering', label: '工程技术', prompt: 'mechanical, robotics, automation, materials, manufacturing or civil engineering principle' },
  { id: 'information', label: '信息科技', prompt: 'computing, AI, sensing, communication, data visualization or cyber-physical system principle' },
  { id: 'chemistry', label: '化学与材料', prompt: 'chemical reaction, molecular structure, material property or energy storage principle' },
];

export const SCIENCE_EXHIBIT_TYPES = [
  { id: 'interactive-device', label: '互动机械展项', prompt: 'hands-on mechanical or electromechanical interactive exhibit with visible operating parts' },
  { id: 'digital-installation', label: '数字互动展项', prompt: 'digital media exhibit with screens, projection, sensors and real-time feedback' },
  { id: 'demonstration-model', label: '原理演示模型', prompt: 'principle demonstration model with clear cause-effect visualization' },
  { id: 'immersive-theater', label: '沉浸式科普剧场', prompt: 'immersive science theater with spatial media, narration and audience participation' },
  { id: 'experiment-station', label: '实验操作台', prompt: 'visitor experiment station with durable controls, instruments and observation area' },
  { id: 'large-landmark', label: '大型标志展项', prompt: 'large iconic science exhibit as a gallery landmark, visible from distance' },
];

export const SCIENCE_EXHIBIT_INTERACTIONS = [
  { id: 'turn-handle', label: '手摇/转动', prompt: 'visitor turns a wheel, crank or handle and sees immediate physical feedback' },
  { id: 'touch-screen', label: '触控选择', prompt: 'visitor selects parameters on a touchscreen and observes visualized results' },
  { id: 'sensor-trigger', label: '感应触发', prompt: 'motion, proximity, light or pressure sensors trigger exhibit response' },
  { id: 'multi-user', label: '多人协作', prompt: 'several visitors cooperate or compete to change exhibit state' },
  { id: 'physical-experiment', label: '实体实验', prompt: 'visitor manipulates real objects, samples, airflow, water, light or magnetic elements' },
  { id: 'mixed-reality', label: '虚实融合', prompt: 'physical exhibit combined with AR, projection mapping or digital overlay' },
];

export const SCIENCE_EXHIBIT_AUDIENCES = [
  { id: 'children', label: '儿童启蒙', prompt: 'simple robust interaction, low height, clear safety edges, playful but scientifically accurate' },
  { id: 'family', label: '亲子家庭', prompt: 'multi-level explanation, parent-child cooperation, strong visibility and low operation difficulty' },
  { id: 'teenagers', label: '青少年探究', prompt: 'parameter exploration, measurable results, challenge and inquiry-based learning' },
  { id: 'general', label: '公众科普', prompt: 'legible science interpretation, intuitive operation and strong exhibition appeal' },
  { id: 'professional', label: '专业研学', prompt: 'more technical labels, quantitative parameters and deeper mechanism explanation' },
];

export const SCIENCE_EXHIBIT_SCALES = [
  { id: 'tabletop', label: '桌面操作', prompt: 'tabletop exhibit, close viewing distance, compact mechanism and durable controls' },
  { id: 'wall-bay', label: '墙面展项', prompt: 'wall-integrated exhibit bay with graphics, screens, devices and maintenance access' },
  { id: 'island', label: '岛台展项', prompt: 'freestanding island exhibit allowing visitors around multiple sides' },
  { id: 'room', label: '小型展厅', prompt: 'room-scale exhibit with circulation, overhead media and multiple interaction zones' },
  { id: 'hall-landmark', label: '大厅标志物', prompt: 'large hall landmark exhibit with strong silhouette, safety boundary and queue area' },
];

export const SCIENCE_EXHIBIT_DRAWING_TYPES = [
  { id: 'render', label: '效果图', prompt: 'main exhibit concept rendering' },
  { id: 'exploded', label: '爆炸分析图', prompt: 'exploded axonometric analysis drawing showing separated components and assembly relationship' },
  { id: 'principle', label: '展项原理图', prompt: 'science principle diagram showing input, mechanism, parameter change and output feedback' },
  { id: 'orthographic', label: '三视图', prompt: 'front view, side view and top view technical drawing with consistent proportions' },
  { id: 'parameter-table', label: '参数表', prompt: 'visual parameter table board with dimensions, ranges, sensors, media and safety notes' },
];

export const SCIENCE_EXHIBIT_BACKGROUNDS = [
  { id: 'white', label: '白背景', prompt: 'clean pure white studio background, no environmental decoration, clear object silhouette' },
  { id: 'black', label: '黑背景', prompt: 'clean matte black studio background, controlled highlights, no environmental decoration' },
  { id: 'environment', label: '模拟环境', prompt: 'realistic science museum gallery environment with floor, lighting, circulation and surrounding exhibition context' },
];

export const SCIENCE_EXHIBIT_DEFAULT_DRAWINGS = ['exploded', 'principle', 'orthographic', 'parameter-table'];

export const SCIENCE_EXHIBIT_DEFAULT_DIMENSIONS = {
  tabletop: {
    widthMm: 900,
    depthMm: 600,
    heightMm: 450,
    operationHeightMm: 760,
    safetyClearanceMm: 300,
    maintenanceClearanceMm: 300,
    estimatedPowerW: 150,
  },
  'wall-bay': {
    widthMm: 2400,
    depthMm: 600,
    heightMm: 2200,
    operationHeightMm: 1050,
    safetyClearanceMm: 800,
    maintenanceClearanceMm: 600,
    estimatedPowerW: 500,
  },
  island: {
    widthMm: 2200,
    depthMm: 1600,
    heightMm: 1600,
    operationHeightMm: 900,
    safetyClearanceMm: 900,
    maintenanceClearanceMm: 600,
    estimatedPowerW: 800,
  },
  room: {
    widthMm: 6000,
    depthMm: 4500,
    heightMm: 2800,
    operationHeightMm: 1000,
    safetyClearanceMm: 1200,
    maintenanceClearanceMm: 800,
    estimatedPowerW: 2500,
  },
  'hall-landmark': {
    widthMm: 8000,
    depthMm: 5000,
    heightMm: 4500,
    operationHeightMm: 1100,
    safetyClearanceMm: 1800,
    maintenanceClearanceMm: 1200,
    estimatedPowerW: 5000,
  },
};

function normalizeId(value, options, fallback) {
  const id = String(value || '').trim();
  return options.some((item) => item.id === id) ? id : fallback;
}

function normalizeOptionList(value, fallback) {
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  const out = source
    .map((item) => ({
      id: cleanScienceExhibitText(item?.id, 96).replace(/[^a-zA-Z0-9_-]/g, ''),
      label: cleanScienceExhibitText(item?.label, 120),
      prompt: cleanScienceExhibitText(item?.prompt, 1600),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : 0,
    }))
    .filter((item) => item.id && item.label && item.prompt)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  return out.length ? out.map((item, index) => ({ ...item, order: index })) : fallback;
}

export function cleanScienceExhibitText(value, limit = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function normalizeScienceExhibitDomain(value, options = SCIENCE_EXHIBIT_DOMAINS) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_DOMAINS);
  return normalizeId(value, list, list[0].id);
}

export function normalizeScienceExhibitType(value, options = SCIENCE_EXHIBIT_TYPES) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_TYPES);
  return normalizeId(value, list, list[0].id);
}

export function normalizeScienceExhibitInteraction(value, options = SCIENCE_EXHIBIT_INTERACTIONS) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_INTERACTIONS);
  return normalizeId(value, list, list[0].id);
}

export function normalizeScienceExhibitInteractions(value, options = SCIENCE_EXHIBIT_INTERACTIONS) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_INTERACTIONS);
  const source = Array.isArray(value) ? value : [value];
  const out = [];
  for (const item of source) {
    const id = String(item || '').trim();
    if (list.some((option) => option.id === id) && !out.includes(id)) out.push(id);
  }
  if (out.length) return out;
  return [normalizeScienceExhibitInteraction(Array.isArray(value) ? value[0] : value, list)];
}

export function normalizeScienceExhibitAudience(value, options = SCIENCE_EXHIBIT_AUDIENCES) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_AUDIENCES);
  return normalizeId(value, list, list.find((item) => item.id === 'general')?.id || list[0].id);
}

export function normalizeScienceExhibitScale(value, options = SCIENCE_EXHIBIT_SCALES) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_SCALES);
  return normalizeId(value, list, list.find((item) => item.id === 'island')?.id || list[0].id);
}

export function normalizeScienceExhibitDrawingType(value) {
  return normalizeId(value, SCIENCE_EXHIBIT_DRAWING_TYPES, SCIENCE_EXHIBIT_DRAWING_TYPES[0].id);
}

export function normalizeScienceExhibitBackground(value) {
  return normalizeId(value, SCIENCE_EXHIBIT_BACKGROUNDS, SCIENCE_EXHIBIT_BACKGROUNDS[0].id);
}

export function normalizeScienceExhibitDrawingSelection(value) {
  const source = Array.isArray(value) ? value : SCIENCE_EXHIBIT_DEFAULT_DRAWINGS;
  const out = [];
  for (const item of source) {
    const id = normalizeScienceExhibitDrawingType(item);
    if (id !== 'render' && !out.includes(id)) out.push(id);
  }
  return Array.isArray(value) ? out : SCIENCE_EXHIBIT_DEFAULT_DRAWINGS.slice();
}

function positiveNumber(value, fallback, min = 0, max = 999999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizeScienceExhibitDimensions(value = {}, scaleValue) {
  const scaleId = normalizeScienceExhibitScale(scaleValue || value.spatialScale);
  const fallback = SCIENCE_EXHIBIT_DEFAULT_DIMENSIONS[scaleId] || SCIENCE_EXHIBIT_DEFAULT_DIMENSIONS.island;
  const source = value && typeof value === 'object' ? value : {};
  return {
    widthMm: positiveNumber(source.widthMm, fallback.widthMm, 300),
    depthMm: positiveNumber(source.depthMm, fallback.depthMm, 300),
    heightMm: positiveNumber(source.heightMm, fallback.heightMm, 200),
    operationHeightMm: positiveNumber(source.operationHeightMm, fallback.operationHeightMm, 450),
    safetyClearanceMm: positiveNumber(source.safetyClearanceMm, fallback.safetyClearanceMm, 0),
    maintenanceClearanceMm: positiveNumber(source.maintenanceClearanceMm, fallback.maintenanceClearanceMm, 0),
    estimatedPowerW: positiveNumber(source.estimatedPowerW, fallback.estimatedPowerW, 0),
  };
}

export function scienceExhibitDomainMeta(value, options = SCIENCE_EXHIBIT_DOMAINS) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_DOMAINS);
  const id = normalizeScienceExhibitDomain(value, list);
  return list.find((item) => item.id === id) || list[0];
}

export function scienceExhibitTypeMeta(value, options = SCIENCE_EXHIBIT_TYPES) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_TYPES);
  const id = normalizeScienceExhibitType(value, list);
  return list.find((item) => item.id === id) || list[0];
}

export function scienceExhibitInteractionMeta(value, options = SCIENCE_EXHIBIT_INTERACTIONS) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_INTERACTIONS);
  const id = normalizeScienceExhibitInteraction(value, list);
  return list.find((item) => item.id === id) || list[0];
}

export function scienceExhibitInteractionMetas(value, options = SCIENCE_EXHIBIT_INTERACTIONS) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_INTERACTIONS);
  return normalizeScienceExhibitInteractions(value, list)
    .map((id) => list.find((item) => item.id === id))
    .filter(Boolean);
}

export function scienceExhibitAudienceMeta(value, options = SCIENCE_EXHIBIT_AUDIENCES) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_AUDIENCES);
  const id = normalizeScienceExhibitAudience(value, list);
  return list.find((item) => item.id === id) || list.find((item) => item.id === 'general') || list[0];
}

export function scienceExhibitScaleMeta(value, options = SCIENCE_EXHIBIT_SCALES) {
  const list = normalizeOptionList(options, SCIENCE_EXHIBIT_SCALES);
  const id = normalizeScienceExhibitScale(value, list);
  return list.find((item) => item.id === id) || list.find((item) => item.id === 'island') || list[0];
}

export function scienceExhibitDrawingMeta(value) {
  const id = normalizeScienceExhibitDrawingType(value);
  return SCIENCE_EXHIBIT_DRAWING_TYPES.find((item) => item.id === id) || SCIENCE_EXHIBIT_DRAWING_TYPES[0];
}

export function scienceExhibitBackgroundMeta(value) {
  const id = normalizeScienceExhibitBackground(value);
  return SCIENCE_EXHIBIT_BACKGROUNDS.find((item) => item.id === id) || SCIENCE_EXHIBIT_BACKGROUNDS[0];
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeParameter(item, index) {
  if (typeof item === 'string') {
    return {
      name: cleanScienceExhibitText(item, 80) || `参数 ${index + 1}`,
      range: '',
      unit: '',
      effect: '',
    };
  }
  const source = item && typeof item === 'object' ? item : {};
  return {
    name: cleanScienceExhibitText(source.name || source.label, 80) || `参数 ${index + 1}`,
    range: cleanScienceExhibitText(source.range || source.value || source.suggestedRange, 120),
    unit: cleanScienceExhibitText(source.unit, 40),
    effect: cleanScienceExhibitText(source.effect || source.impact || source.description, 300),
  };
}

export function normalizeScienceExhibitAnalysis(value = {}) {
  const parsed = value && typeof value === 'object' ? value : {};
  const rawParameters = Array.isArray(parsed.keyParameters) ? parsed.keyParameters : [];
  return {
    titleText: cleanScienceExhibitText(parsed.titleText, 500),
    sciencePrinciple: cleanScienceExhibitText(parsed.sciencePrinciple, 4000),
    keyParameters: rawParameters.map(normalizeParameter).filter((item) => item.name || item.effect).slice(0, 12),
    interactionFlow: cleanScienceExhibitText(parsed.interactionFlow, 2500),
    mechanismDesign: cleanScienceExhibitText(parsed.mechanismDesign, 3000),
    safetyMaintenance: cleanScienceExhibitText(parsed.safetyMaintenance, 2500),
    visualBrief: cleanScienceExhibitText(parsed.visualBrief, 3000),
    drawingNotes: cleanScienceExhibitText(parsed.drawingNotes, 3000),
  };
}

function dimensionsText(dimensions, scaleValue) {
  const d = normalizeScienceExhibitDimensions(dimensions, scaleValue);
  return [
    `overall footprint ${d.widthMm}mm(W) x ${d.depthMm}mm(D) x ${d.heightMm}mm(H)`,
    `visitor operation height ${d.operationHeightMm}mm`,
    `safety clearance ${d.safetyClearanceMm}mm`,
    `maintenance clearance ${d.maintenanceClearanceMm}mm`,
    `estimated electrical load ${d.estimatedPowerW}W`,
  ].join('; ');
}

function backgroundText(backgroundMode, drawingType) {
  const background = scienceExhibitBackgroundMeta(backgroundMode);
  if (drawingType === 'orthographic') {
    return background.id === 'black'
      ? '三视图背景：纯黑 CAD 图纸底，使用单色浅色线稿；禁止环境、阴影、透视、材质渲染。'
      : '三视图背景：纯白 CAD 图纸底，使用单色黑/深灰线稿；禁止环境、阴影、透视、材质渲染。';
  }
  if (background.id === 'white') return '背景：白背景，纯净白底展示展项主体，不出现真实展厅环境。';
  if (background.id === 'black') return '背景：黑背景，纯净黑底展示展项主体，不出现真实展厅环境。';
  return '背景：模拟环境，将展项放入可信的科技馆展厅环境中，包含地面、灯光、动线和周边展陈语境。';
}

function colorMaterialContext(values = {}, drawingType = '') {
  const colorMaterial = cleanScienceExhibitText(values.colorMaterial, 2000);
  const palette = cleanScienceExhibitText(values.colorMaterialPalette, 1200);
  const textures = cleanScienceExhibitText(values.colorMaterialTextures, 1200);
  if (!colorMaterial && !palette && !textures) return '';
  const lines = [
    'Color and material preset / 色彩与材质预设：必须作为展项外壳、操作台、屏幕边框、支架、防护罩、标识板和可触摸部件的统一设计约束；不得改变真实科学原理、尺寸比例、结构关系和安全边界。',
  ];
  if (values.hasColorMaterialPreset) lines.push('Preset source：来自展陈图生图色彩与材质预设，优先级高于通用视觉风格，但低于科学结构和尺寸参数。');
  if (palette) lines.push(`Color palette：${palette}`);
  if (textures) lines.push(`Materials/textures：${textures}`);
  if (colorMaterial && (!palette || !textures)) lines.push(`Visual/material brief：${colorMaterial}`);
  if (drawingType === 'orthographic') {
    lines.push('Orthographic CAD note：三视图保持单色 CAD 线稿；色彩与材质只转化为材料标注、剖面/图例文字和部件命名，不要做彩色渲染、阴影或透视质感。');
  } else if (drawingType === 'parameter-table') {
    lines.push('Parameter table note：参数表图纸只把色彩与材质写成表格字段，不要插入效果图、三视图、材质球、缩略图或装饰渲染。');
  } else if (drawingType) {
    lines.push('Drawing note：技术图纸中的部件编号、材料标注和结构层级需与该色彩材质方案一致。');
  }
  return lines.join('\n');
}

function interactionValues(values = {}) {
  return Array.isArray(values.interactionModes) && values.interactionModes.length
    ? values.interactionModes
    : values.interactionMode;
}

function interactionPromptText(interactions) {
  return interactions
    .map((item, index) => `${index + 1}. ${item.label}: ${item.prompt}`)
    .join('；');
}

export function buildScienceExhibitExtractPrompt(values = {}) {
  const sourceText = cleanScienceExhibitText(values.sourceText, 50000);
  const sizeText = dimensionsText(values.dimensions, values.spatialScale);
  const autoDimensions = values.autoDimensions === true;
  const domain = scienceExhibitDomainMeta(values.scienceDomain, values.domainOptions);
  const exhibitType = scienceExhibitTypeMeta(values.exhibitType, values.typeOptions);
  const interactions = scienceExhibitInteractionMetas(interactionValues(values), values.interactionOptions);
  const interactionText = interactionPromptText(interactions);
  const audience = scienceExhibitAudienceMeta(values.audience, values.audienceOptions);
  const scale = scienceExhibitScaleMeta(values.spatialScale, values.scaleOptions);
  const bgText = backgroundText(values.backgroundMode);
  const colorMaterial = colorMaterialContext(values);
  return [
    '请从科技馆/科学中心展项资料中提炼“科技展项设计”所需的真实科学分析。',
    '必须基于资料和可验证的科学常识，不要编造不可验证的科学结论、实验数据、品牌、专利或精密数值；不确定的参数用“建议范围/待工程校核”表达。',
    '节点设计选项用于限定互动流程、装置构成、观众尺度、视觉说明和图纸约束；不得用这些选项替代资料中的真实科学原理，也不得为了匹配风格而改写科学结论。',
    `科学领域：${domain.label}；提炼时优先寻找与 ${domain.prompt} 相关的真实原理和可控变量。`,
    `展项类型：${exhibitType.label}；请让 mechanismDesign 和 drawingNotes 贴合 ${exhibitType.prompt}。`,
    `互动方式：${interactionText}。请让 interactionFlow、传感器/执行器和关键参数同时贴合所有选中的互动方式，不要只体现其中一种。`,
    `目标观众：${audience.label}；请让操作高度、安全维护、说明深度和交互难度贴合 ${audience.prompt}。`,
    `空间尺度：${scale.label}；请让结构尺度、维护方式和图纸约束贴合 ${scale.prompt}。`,
    bgText,
    colorMaterial,
    autoDimensions
      ? '尺寸设置模式：自动。请根据展项真实科学原理、装置构成、全部互动方式、目标观众人体工学、空间尺度、安全距离、维护方式和设备功耗，计算一组可直接用于概念设计的实际尺寸与功率数值；不要照抄当前尺寸基准，不要把数值写成“待工程校核”。'
      : `尺寸设置模式：手动。必须沿用当前尺寸基准：${sizeText}，不要自行改写这些尺寸和功率。`,
    autoDimensions
      ? '自动尺寸 JSON 要求：顶层必须额外包含 "dimensions":{"widthMm":整数,"depthMm":整数,"heightMm":整数,"operationHeightMm":整数,"safetyClearanceMm":整数,"maintenanceClearanceMm":整数,"estimatedPowerW":整数}；尺寸单位为 mm，功率单位为 W，所有字段必须是大于或等于 0 的数字。'
      : '',
    '输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"titleText":"展项名称","sciencePrinciple":"真实科学原理说明","keyParameters":[{"name":"参数名称","range":"建议范围","unit":"单位","effect":"该参数如何影响演示结果"}],"interactionFlow":"观众操作流程","mechanismDesign":"机械/电子/软件/媒体构成","safetyMaintenance":"安全、耐久、维护要点","visualBrief":"效果图视觉说明","drawingNotes":"后续爆炸图、原理图、三视图、参数表必须保持一致的结构约束"}',
    autoDimensions
      ? `当前界面尺寸仅是自动计算前的占位参考：${sizeText}。不得直接照抄，必须根据本次资料与展项设计重新计算并输出完整 dimensions。`
      : `已知尺寸基准：${sizeText}。请优先给出可执行的建议数值或建议范围，不要把参数全部写成“待工程校核”；仅对确实依赖深化设计的项标注“需工程校核”。`,
    '要求：科学原理、参数、互动流程、安全维护、图纸约束都要明确；语言适合展陈方案汇报和图像生成。',
    '',
    sourceText,
  ].filter(Boolean).join('\n');
}

export function parseScienceExhibitExtractJson(text, scaleValue) {
  const parsed = extractJsonObject(text);
  if (parsed && typeof parsed === 'object') {
    const analysis = normalizeScienceExhibitAnalysis(parsed);
    const dimensionSource = parsed.dimensions || parsed.dimensionSettings || parsed.sizeSettings;
    const hasDimensionValue = dimensionSource && typeof dimensionSource === 'object' && [
      'widthMm',
      'depthMm',
      'heightMm',
      'operationHeightMm',
      'safetyClearanceMm',
      'maintenanceClearanceMm',
      'estimatedPowerW',
    ].every((key) => dimensionSource[key] !== null && dimensionSource[key] !== '' && Number.isFinite(Number(dimensionSource[key])));
    return hasDimensionValue
      ? { ...analysis, dimensions: normalizeScienceExhibitDimensions(dimensionSource, scaleValue) }
      : analysis;
  }
  const lines = String(text || '').split(/\r?\n/).map((line) => cleanScienceExhibitText(line, 4000)).filter(Boolean);
  return normalizeScienceExhibitAnalysis({
    titleText: lines[0] || '',
    sciencePrinciple: lines[1] || '',
    interactionFlow: lines[2] || '',
    mechanismDesign: lines[3] || '',
    safetyMaintenance: lines[4] || '',
    visualBrief: lines[5] || '',
    drawingNotes: lines.slice(6).join('\n') || '',
  });
}

export function buildScienceExhibitParameterMarkdown(values = {}) {
  const analysis = normalizeScienceExhibitAnalysis(values.analysis || values);
  const dimensions = normalizeScienceExhibitDimensions(values.dimensions, values.spatialScale);
  const colorMaterial = cleanScienceExhibitText(values.colorMaterial, 2000);
  const colorMaterialPalette = cleanScienceExhibitText(values.colorMaterialPalette, 1200);
  const colorMaterialTextures = cleanScienceExhibitText(values.colorMaterialTextures, 1200);
  const rows = analysis.keyParameters.length
    ? analysis.keyParameters
    : [
      { name: '设备宽度', range: String(dimensions.widthMm), unit: 'mm', effect: '决定展项正面展示尺度和三视图比例' },
      { name: '设备深度', range: String(dimensions.depthMm), unit: 'mm', effect: '决定岛台/墙面占地和维护空间' },
      { name: '设备高度', range: String(dimensions.heightMm), unit: 'mm', effect: '决定可视高度、灯光和顶部结构关系' },
      { name: '操作高度', range: String(dimensions.operationHeightMm), unit: 'mm', effect: '影响儿童、亲子或公众观众的可操作性' },
      { name: '安全净距', range: String(dimensions.safetyClearanceMm), unit: 'mm', effect: '用于观众排队、运动部件防护和安全边界' },
      { name: '估算功率', range: String(dimensions.estimatedPowerW), unit: 'W', effect: '用于屏幕、传感器、执行器和控制系统供电预估' },
    ];
  return [
    `# ${analysis.titleText || '科技展项设计参数表'}`,
    '',
    '## 科学原理',
    analysis.sciencePrinciple || '待补充真实科学原理。',
    '',
    '## 关键参数',
    '| 参数 | 建议范围 | 单位 | 影响关系 |',
    '| --- | --- | --- | --- |',
    ...rows.map((item) => `| ${item.name || '-'} | ${item.range || '建议深化校核'} | ${item.unit || '-'} | ${item.effect || '-'} |`),
    '',
    '## 尺寸基准',
    `- 外形尺寸：${dimensions.widthMm} x ${dimensions.depthMm} x ${dimensions.heightMm} mm`,
    `- 操作高度：${dimensions.operationHeightMm} mm`,
    `- 安全净距：${dimensions.safetyClearanceMm} mm`,
    `- 维护净距：${dimensions.maintenanceClearanceMm} mm`,
    `- 估算功率：${dimensions.estimatedPowerW} W`,
    '',
    '## 色彩与材质',
    colorMaterialPalette ? `- Color palette：${colorMaterialPalette}` : '',
    colorMaterialTextures ? `- Materials/textures：${colorMaterialTextures}` : '',
    colorMaterial ? `- 设计说明：${colorMaterial}` : '',
    (!colorMaterialPalette && !colorMaterialTextures && !colorMaterial) ? '- 未指定色彩与材质预设。' : '',
    '',
    '## 互动流程',
    analysis.interactionFlow || '待补充。',
    '',
    '## 构成与维护',
    analysis.mechanismDesign || '待补充。',
    '',
    '## 安全维护',
    analysis.safetyMaintenance || '待补充。',
  ].join('\n');
}

function referenceOrderText(urls, labelPrefix, offset = 0) {
  return urls.map((url, index) => `@img${offset + index + 1}: ${labelPrefix}${index + 1} = ${url}`).join('\n');
}

function analysisText(analysis, includeDrawingNotes = true) {
  const normalized = normalizeScienceExhibitAnalysis(analysis);
  return [
    normalized.titleText ? `展项名称：${normalized.titleText}` : '',
    normalized.sciencePrinciple ? `真实科学原理：${normalized.sciencePrinciple}` : '',
    normalized.keyParameters.length ? `关键参数：${normalized.keyParameters.map((item) => `${item.name}${item.range ? ` ${item.range}` : ''}${item.unit ? ` ${item.unit}` : ''}${item.effect ? ` (${item.effect})` : ''}`).join('；')}` : '',
    normalized.interactionFlow ? `互动流程：${normalized.interactionFlow}` : '',
    normalized.mechanismDesign ? `构成设计：${normalized.mechanismDesign}` : '',
    normalized.safetyMaintenance ? `安全维护：${normalized.safetyMaintenance}` : '',
    normalized.visualBrief ? `视觉说明：${normalized.visualBrief}` : '',
    includeDrawingNotes && normalized.drawingNotes ? `图纸一致性约束：${normalized.drawingNotes}` : '',
  ].filter(Boolean).join('\n');
}

export function buildScienceExhibitImagePrompt(values = {}) {
  const domain = scienceExhibitDomainMeta(values.scienceDomain, values.domainOptions);
  const exhibitType = scienceExhibitTypeMeta(values.exhibitType, values.typeOptions);
  const interactions = scienceExhibitInteractionMetas(interactionValues(values), values.interactionOptions);
  const interactionText = interactionPromptText(interactions);
  const audience = scienceExhibitAudienceMeta(values.audience, values.audienceOptions);
  const scale = scienceExhibitScaleMeta(values.spatialScale, values.scaleOptions);
  const analysis = normalizeScienceExhibitAnalysis(values.analysis || {});
  const dimensionText = dimensionsText(values.dimensions, values.spatialScale);
  const bgText = backgroundText(values.backgroundMode);
  const spaceReferences = Array.isArray(values.spaceReferenceImages) ? values.spaceReferenceImages.filter(Boolean) : [];
  const deviceReferences = Array.isArray(values.deviceReferenceImages) ? values.deviceReferenceImages.filter(Boolean) : [];
  const allReferences = [...spaceReferences, ...deviceReferences];
  const supplement = cleanScienceExhibitText(values.supplement, 3000);
  const selectedDrawings = normalizeScienceExhibitDrawingSelection(values.drawingSelection);
  const selectedDrawingLabels = selectedDrawings
    .map((id) => scienceExhibitDrawingMeta(id).label)
    .filter(Boolean);

  return [
    '核心要求：生成专业科技馆/科学中心“科技展项设计”主效果图，画面应能用于方案汇报，必须围绕真实科学原理设计，不要伪科学、不要随机炫酷装置、不要错误公式或乱码文字。',
    '输出类型强约束：只输出一张完整、连续的主效果图，只表现真实展项装置及其所在背景；禁止拼版、分栏、多面板、图纸页、方案汇报板或九宫格。严禁在主效果图中嵌入爆炸分析图、展项原理图、三视图、正投影图、参数表、流程图、尺寸图、CAD 线稿或任何技术图纸缩略图。SINGLE HERO RENDER ONLY, NO CONTACT SHEET, NO EXPLODED VIEW, NO SCHEMATIC, NO ORTHOGRAPHIC VIEWS, NO PARAMETER TABLE.',
    selectedDrawingLabels.length
      ? `后续将另行生成：${selectedDrawingLabels.join('、')}。这些内容只能作为后续独立输出，绝不能出现在主效果图画面中。`
      : '当前未选择任何其它技术图纸；主效果图中不得出现爆炸分析、原理示意、三视图、参数表或类似技术制图内容。',
    `科学领域：${domain.label}，${domain.prompt}`,
    `展项类型：${exhibitType.label}，${exhibitType.prompt}`,
    `互动方式：${interactionText}。画面中的操作台、输入部件、传感器、执行器、反馈屏幕和观众动线必须同时支持所有选中的互动方式。`,
    `目标观众：${audience.label}，${audience.prompt}`,
    `空间尺度：${scale.label}，${scale.prompt}`,
    bgText,
    `尺寸设置：${dimensionText}。画面中的展项比例、观众尺度、操作高度、安全边界和维护门位置必须与这些尺寸一致。`,
    analysisText(analysis, false),
    colorMaterialContext(values),
    spaceReferences.length ? `高优先级参考：整体空间/风格参考图必须生效，必须从 @img1 起的空间参考中提取并应用整体设计语言、色彩倾向、材质质感、灯光层次、尺度关系、展厅气质和动线秩序；即使选择白背景或黑背景，也要把这些风格特征迁移到展项本体、操作台、屏幕边框、支架、标识板和材质细节上。只排除无关展品、文字、logo 或品牌，不要忽略空间/风格参考图。HIGH PRIORITY style reference must influence the design.\n${referenceOrderText(spaceReferences, '整体空间/风格参考')}` : '未提供整体空间/风格参考图，请自行设计清晰可落地的科技馆展项环境。',
    deviceReferences.length ? `装置/结构参考图只参考机械结构、交互部件、屏幕/传感器/支架关系，不复制无关 logo 或文字。\n${referenceOrderText(deviceReferences, '装置/结构参考', spaceReferences.length)}` : '未提供装置/结构参考图，请基于科学原理设计合理的机械、电子和媒体构成。',
    allReferences.length ? `参考图总顺序：${allReferences.map((_, index) => `@img${index + 1}`).join('、')}` : '',
    supplement ? `补充要求：${supplement}` : '',
    '构图要求：展项主体完整，包含观众操作点、反馈显示、简洁说明牌、维护检修边界和安全距离；说明牌只作为展项表面的少量科普文字载体，不得画成原理图、流程图或技术图纸；材质、结构、线缆/传感器/屏幕位置要可信。',
    '质量约束：参数关系前后一致；不要把科技展项画成普通商场互动屏；不要低清模糊、随机品牌 logo、乱码文字、无法施工的悬浮结构或与科学原理无关的装饰。',
  ].filter(Boolean).join('\n');
}

export function buildScienceExhibitDrawingPrompt(values = {}) {
  const drawing = scienceExhibitDrawingMeta(values.drawingType);
  const analysis = normalizeScienceExhibitAnalysis(values.analysis || {});
  const dimensionText = dimensionsText(values.dimensions, values.spatialScale);
  const bgText = backgroundText(values.backgroundMode, drawing.id);
  const renderImage = cleanScienceExhibitText(values.renderImage, 1000);
  const previousDrawingImage = cleanScienceExhibitText(values.previousDrawingImage, 1000);
  const finishedRenderMode = values.finishedRenderMode === true;
  const sourceText = cleanScienceExhibitText(values.sourceText, 4000);
  const supplement = cleanScienceExhibitText(values.supplement, 2500);
  const userReferences = finishedRenderMode ? [] : (Array.isArray(values.userReferenceImages) ? values.userReferenceImages.filter(Boolean) : []);
  const referenceLines = [
    renderImage ? `@img1: ${finishedRenderMode ? '唯一成品展项效果图参考' : '主效果图一致性参考'} = ${renderImage}` : '',
    previousDrawingImage ? `@img2: 上一张技术图纸一致性参考 = ${previousDrawingImage}` : '',
    userReferences.length ? referenceOrderText(userReferences, '用户原始参考', (renderImage ? 1 : 0) + (previousDrawingImage ? 1 : 0)) : '',
  ].filter(Boolean).join('\n');

  const typeRequirements = {
    exploded: '生成爆炸分析图：用清晰轴测/分层方式拆开外壳、机械传动、传感器、控制器、显示/投影、支撑结构、维护门和安全防护件；用编号和短标签表现部件关系。',
    principle: '生成展项原理图：展示输入动作、科学变量、核心机制、反馈输出之间的因果链路；用箭头、流程、简洁示意图表现真实科学原理和参数影响。',
    orthographic: '生成三视图：必须是单色 CAD 技术图纸形式，只允许正投影/正交投影 orthographic projection，no perspective，不允许任何透视关系、轴测角度、摄影阴影、材质渲染或环境背景。同一张图纸内按正视图、侧视图、俯视图排列；每个视图中操作台 operating table、整机设备 device、零部件 parts、屏幕、按钮、传感器和维护门必须使用同一个视角方向：正视图全部为正视，侧视图全部为侧视，俯视图全部为俯视，禁止出现“操作台是左视图但单设备是正视图”这类混合视角。侧视图必须是真正从左侧或右侧看的投影视角 side elevation / left or right side projection：沿设备宽度 X 方向投影到深度 Y × 高度 Z 平面，侧视图横向尺寸必须对应 depth / D，不对应 width / W；侧视图只能显示侧面轮廓、前后层叠关系、侧向可见的立柱/轨道/外壳厚度/维护门位置，绝不能把正视图横向缩短、压扁或裁切成侧视图。比例和部件位置与主效果图一致，标注主要外形尺寸、操作高度、安全边界和维护空间。',
    'parameter-table': '生成参数表图：只生成表格版式的技术参数表，画面中只能有表格、分组标题、字段和值；不要嵌入主效果图、不要嵌入三视图、不要嵌入爆炸图、不要放任何设备缩略图或装饰性渲染图。表格包含尺寸、互动方式、传感器/执行器、媒体系统、结构材质、关键科学变量、安全维护和待工程校核项。TABLE ONLY, no render image, no orthographic views, no thumbnails.',
  };

  return [
    `核心要求：根据同一科技展项生成“${drawing.label}”，必须和主效果图保持同一装置、同一科学原理、同一参数体系；不要伪科学、不要乱标文字、不要改变展项主体结构。`,
    `图纸类型：${drawing.prompt}`,
    bgText,
    typeRequirements[drawing.id] || drawing.prompt,
    drawing.id === 'parameter-table' ? '参数表一致性说明：可以读取 @img1 主效果图和其它参考图来提取名称、材质和结构信息，但最终画面只允许输出纯表格，不得把任何参考图、效果图、三视图或设备图形画进参数表。' : '',
    `尺寸设置：${dimensionText}。三视图、爆炸图、原理图和参数表中的外形尺寸、操作高度、安全净距、维护净距和功率估算必须沿用这些实际值。`,
    finishedRenderMode
      ? '成品图纸模式：@img1 是唯一成品展项效果图参考，必须保持其外观、结构、部件位置、比例、色彩和材质一致；不使用其它参考图，不混入整体空间/风格参考图或装置/结构参考图；不进行 LLM 提炼，只使用当前资料输入、科学分析字段、参数 Markdown 作为文字数据支撑。'
      : '一致性参考：后续图纸必须以 @img1 主效果图为首要依据；若有 @img2，则用于保持上一张图纸中的部件命名和结构编号一致。',
    referenceLines,
    analysisText(analysis),
    colorMaterialContext(values, drawing.id),
    values.parameterMarkdown ? `参数表 Markdown 文本依据：\n${cleanScienceExhibitText(values.parameterMarkdown, 5000)}` : '',
    (sourceText || supplement) ? `资料与补充要求（仅作为数据支撑，不替代科学分析）：\n${[sourceText, supplement].filter(Boolean).join('\n')}` : '',
    '表现要求：白底或深浅清晰的技术制图风格，线条清楚，层级明确，文字只用短中文标签和可信参数，不生成长篇乱码；所有参数标注为建议范围或待工程校核，不伪造精密工程数据。',
  ].filter(Boolean).join('\n');
}
