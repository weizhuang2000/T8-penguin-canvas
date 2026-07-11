export const SCULPTURE_RELIEF_DESIGN_KINDS = [
  { id: 'sculpture', label: '雕塑', prompt: 'three-dimensional exhibition sculpture, freestanding volume, visible massing and plinth relationship' },
  { id: 'relief', label: '浮雕', prompt: 'exhibition relief wall artwork, raised depth layers on a backing plane, tactile carved surface' },
];

export const SCULPTURE_DESIGN_TYPES = [
  { id: 'thematic-round', label: '主题圆雕', prompt: '主题圆雕，完整三维体量，适合作为展厅核心精神形象' },
  { id: 'figure-group', label: '人物群像', prompt: '人物群像雕塑，群体叙事关系清晰，人物姿态庄重有纪念性' },
  { id: 'abstract-monument', label: '抽象精神堡垒', prompt: '抽象精神堡垒雕塑，几何体块、向上动势和强烈标识性' },
  { id: 'entrance-sign', label: '入口标识雕塑', prompt: '入口标识雕塑，适合展览入口或序厅，具备导视与主题识别功能' },
  { id: 'atrium-installation', label: '中庭装置雕塑', prompt: '中庭装置雕塑，空间尺度大，适合悬挑、阵列或沉浸式布置' },
  { id: 'regional-symbol', label: '地域文化符号雕塑', prompt: '地域文化符号雕塑，提取地方纹样、历史符号和文化意象' },
  { id: 'narrative-scene', label: '场景叙事雕塑', prompt: '场景叙事雕塑，包含人物、器物或事件片段，形成可读的展陈故事' },
];

export const RELIEF_DESIGN_TYPES = [
  { id: 'low-relief', label: '浅浮雕', prompt: '浅浮雕，低起伏层次，轮廓精致，适合展墙背景' },
  { id: 'high-relief', label: '高浮雕', prompt: '高浮雕，主体凸起明显，前后层次强，局部接近圆雕效果' },
  { id: 'line-carved', label: '线刻浮雕', prompt: '线刻浮雕，以阴刻线、浅刻线和图案线条组织画面' },
  { id: 'narrative-scroll', label: '叙事长卷浮雕', prompt: '叙事长卷浮雕，横向连续故事画面，适合文化长廊或主题墙' },
  { id: 'metal-layered', label: '金属分层浮雕', prompt: '金属分层浮雕，多层金属片错落叠加，边缘精细，现代工艺感' },
  { id: 'pattern-wall', label: '文化纹样墙面浮雕', prompt: '文化纹样墙面浮雕，重复纹样、符号阵列和主题图案结合' },
  { id: 'map-terrain', label: '地图/地貌浮雕', prompt: '地图或地貌浮雕，地形层次、区域边界和路径脉络清晰' },
  { id: 'text-theme', label: '文字主题浮雕', prompt: '文字主题浮雕，把标题字、关键词和图形纹样融合为墙面艺术' },
];

export const SCULPTURE_RELIEF_MATERIALS = [
  { id: 'bronze', label: '铜', prompt: '青铜或黄铜质感，温润金属高光，适合纪念性展陈' },
  { id: 'stainless-steel', label: '不锈钢', prompt: '拉丝或镜面不锈钢，现代、坚固、反射克制' },
  { id: 'aluminum-panel', label: '铝板', prompt: '铝板切割、折弯和烤漆工艺，轻量化、边缘干净' },
  { id: 'stone', label: '石材', prompt: '天然石材或仿石材雕刻，沉稳厚重，有细腻纹理' },
  { id: 'fiberglass', label: '玻璃钢', prompt: '玻璃钢成型，表面可做哑光喷涂，适合复杂造型' },
  { id: 'wood', label: '木质', prompt: '木质雕刻或木纹复合材质，温暖、自然、适合人文主题' },
  { id: 'acrylic', label: '亚克力', prompt: '亚克力与透光材料，边缘清透，可结合内发光' },
  { id: 'composite', label: '复合材料', prompt: '金属、亚克力、石材或涂装复合材料组合，工艺层次丰富' },
  { id: 'ceramic-brick', label: '陶土/砖', prompt: '陶土、陶板或砖材肌理，质朴、地域性强' },
  { id: 'mixed', label: '混合材质', prompt: '多种材质混合，主次明确，避免杂乱' },
];

export const SCULPTURE_RELIEF_VIEW_ANGLES = [
  { id: 'front', label: '正立面', prompt: 'front elevation view, orthographic front composition' },
  { id: 'front-perspective', label: '正面透视', prompt: 'front three-quarter perspective, slight depth and realistic volume' },
  { id: 'left-45', label: '左前45度', prompt: 'left front 45-degree view, showing side depth and front silhouette' },
  { id: 'right-45', label: '右前45度', prompt: 'right front 45-degree view, showing side depth and front silhouette' },
  { id: 'side', label: '侧立面', prompt: 'side elevation view, showing thickness, depth, and installation profile' },
  { id: 'top', label: '俯视', prompt: 'top view, plan-like view showing footprint and spatial layout' },
  { id: 'low-angle', label: '仰视', prompt: 'low angle view, monumental upward perspective' },
  { id: 'detail', label: '局部细节', prompt: 'close-up detail view, material texture, carving edge, and craft detail' },
  { id: 'exploded', label: '分解示意', prompt: 'exploded construction view, showing layers, backing, plinth, and assembly logic' },
  { id: 'in-space', label: '空间关系', prompt: 'in-situ exhibition space view, showing scale relationship with wall, floor, and lighting' },
];

const DEFAULT_DIMENSIONS = {
  widthMm: 1200,
  heightMm: 1800,
  depthMm: 220,
  baseHeightMm: 200,
};

export function cleanSculptureReliefText(value, limit = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeId(value, options, fallback) {
  const id = String(value || '').trim();
  return options.some((item) => item.id === id) ? id : fallback;
}

export function normalizeSculptureReliefDesignKind(value) {
  return value === 'relief' ? 'relief' : 'sculpture';
}

export function sculptureReliefDesignKindMeta(value) {
  const id = normalizeSculptureReliefDesignKind(value);
  return SCULPTURE_RELIEF_DESIGN_KINDS.find((item) => item.id === id) || SCULPTURE_RELIEF_DESIGN_KINDS[0];
}

export function normalizeSculptureDesignType(value) {
  return normalizeId(value, SCULPTURE_DESIGN_TYPES, SCULPTURE_DESIGN_TYPES[0].id);
}

export function normalizeReliefDesignType(value) {
  return normalizeId(value, RELIEF_DESIGN_TYPES, RELIEF_DESIGN_TYPES[0].id);
}

export function normalizeSculptureReliefMaterial(value) {
  return normalizeId(value, SCULPTURE_RELIEF_MATERIALS, SCULPTURE_RELIEF_MATERIALS[0].id);
}

export function normalizeSculptureReliefViewAngles(value) {
  const source = Array.isArray(value) ? value : [];
  const allowed = new Set(SCULPTURE_RELIEF_VIEW_ANGLES.map((item) => item.id));
  const out = [];
  for (const raw of source) {
    const id = String(raw || '').trim();
    if (allowed.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= 4) break;
  }
  return out.length ? out : ['front'];
}

export function sculptureDesignTypeMeta(value) {
  const id = normalizeSculptureDesignType(value);
  return SCULPTURE_DESIGN_TYPES.find((item) => item.id === id) || SCULPTURE_DESIGN_TYPES[0];
}

export function reliefDesignTypeMeta(value) {
  const id = normalizeReliefDesignType(value);
  return RELIEF_DESIGN_TYPES.find((item) => item.id === id) || RELIEF_DESIGN_TYPES[0];
}

export function sculptureReliefMaterialMeta(value) {
  const id = normalizeSculptureReliefMaterial(value);
  return SCULPTURE_RELIEF_MATERIALS.find((item) => item.id === id) || SCULPTURE_RELIEF_MATERIALS[0];
}

export function sculptureReliefViewAngleMeta(value) {
  const id = normalizeId(value, SCULPTURE_RELIEF_VIEW_ANGLES, SCULPTURE_RELIEF_VIEW_ANGLES[0].id);
  return SCULPTURE_RELIEF_VIEW_ANGLES.find((item) => item.id === id) || SCULPTURE_RELIEF_VIEW_ANGLES[0];
}

export function normalizeSculptureReliefDimensions(value) {
  const source = value && typeof value === 'object' ? value : {};
  const num = (raw, fallback) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.round(n * 100) / 100;
  };
  return {
    widthMm: num(source.widthMm, DEFAULT_DIMENSIONS.widthMm),
    heightMm: num(source.heightMm, DEFAULT_DIMENSIONS.heightMm),
    depthMm: num(source.depthMm, DEFAULT_DIMENSIONS.depthMm),
    baseHeightMm: num(source.baseHeightMm, DEFAULT_DIMENSIONS.baseHeightMm),
  };
}

export function sculptureReliefDimensionsText(value) {
  const d = normalizeSculptureReliefDimensions(value);
  return [
    `宽 ${d.widthMm} mm`,
    `高 ${d.heightMm} mm`,
    `厚/深 ${d.depthMm} mm`,
    `底座高 ${d.baseHeightMm} mm`,
  ].join('; ');
}

export function buildSculptureReliefExtractPrompt(values = {}) {
  const sourceText = cleanSculptureReliefText(values.sourceText, 50000);
  return [
    '请从展陈资料中提炼“雕塑/浮雕设计”所需的三段文字。',
    '输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"titleText":"适合雕塑或浮雕展示的短标题，不超过18个中文字","themeText":"一句话主题概念，说明核心精神或造型方向","bodyText":"100-220个中文字的设计说明"}。',
    'titleText 要凝练、有展陈标题气质；themeText 要能指导造型；bodyText 要准确、庄重，适合用于方案说明，不要编造资料中没有的事实。',
    '',
    sourceText,
  ].filter(Boolean).join('\n');
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

export function parseSculptureReliefExtractJson(text) {
  const parsed = extractJsonObject(text);
  if (parsed && typeof parsed === 'object') {
    return {
      titleText: cleanSculptureReliefText(parsed.titleText, 500),
      themeText: cleanSculptureReliefText(parsed.themeText, 1000),
      bodyText: cleanSculptureReliefText(parsed.bodyText, 4000),
    };
  }
  const lines = String(text || '').split(/\r?\n/).map((line) => cleanSculptureReliefText(line, 4000)).filter(Boolean);
  return {
    titleText: lines[0] || '',
    themeText: lines[1] || '',
    bodyText: lines.slice(2).join('\n') || '',
  };
}

export function buildSculptureReliefImagePrompt(values = {}) {
  const designKind = normalizeSculptureReliefDesignKind(values.designKind);
  const kindMeta = sculptureReliefDesignKindMeta(designKind);
  const fallbackTypeMeta = designKind === 'relief'
    ? reliefDesignTypeMeta(values.reliefType)
    : sculptureDesignTypeMeta(values.sculptureType);
  const suppliedTypeMeta = designKind === 'relief' ? values.reliefTypeOption : values.sculptureTypeOption;
  const typeMeta = suppliedTypeMeta && typeof suppliedTypeMeta === 'object'
    ? {
      id: cleanSculptureReliefText(suppliedTypeMeta.id, 96) || fallbackTypeMeta.id,
      label: cleanSculptureReliefText(suppliedTypeMeta.label, 120) || fallbackTypeMeta.label,
      prompt: cleanSculptureReliefText(suppliedTypeMeta.prompt, 1600) || fallbackTypeMeta.prompt,
    }
    : fallbackTypeMeta;
  const material = values.material && typeof values.material === 'object'
    ? {
      label: cleanSculptureReliefText(values.material.label, 120) || sculptureReliefMaterialMeta(values.materialId).label,
      prompt: [
        cleanSculptureReliefText(values.material.prompt, 1000),
        cleanSculptureReliefText(values.material.description, 1000),
        cleanSculptureReliefText(values.material.texture, 1000),
        cleanSculptureReliefText(values.material.usage, 1000),
      ].filter(Boolean).join('；') || sculptureReliefMaterialMeta(values.materialId).prompt,
    }
    : sculptureReliefMaterialMeta(values.materialId);
  const manualMaterial = cleanSculptureReliefText(values.manualMaterial, 1200);
  const titleText = cleanSculptureReliefText(values.titleText, 500);
  const themeText = cleanSculptureReliefText(values.themeText, 1200);
  const bodyText = cleanSculptureReliefText(values.bodyText, 4000);
  const dimensions = sculptureReliefDimensionsText(values.dimensions);
  const dimensionMarksEnabled = values.dimensionMarksEnabled === true;
  const backgroundMode = values.backgroundMode === 'white' ? 'white' : 'black';
  const hasPatternReferenceImage = values.hasPatternReferenceImage === true;
  const peoplePropsText = cleanSculptureReliefText(values.peoplePropsText, 3000);
  const peoplePropsImages = Array.isArray(values.peoplePropsReferenceImages) ? values.peoplePropsReferenceImages.filter(Boolean) : [];
  const hasPeoplePropsReference = peoplePropsImages.length > 0 || values.hasPeoplePropsReferenceImage === true;
  const peoplePropsOffset = hasPatternReferenceImage ? 1 : 0;
  const peoplePropsOrderText = peoplePropsImages
    .map((url, index) => `@img${peoplePropsOffset + index + 1}: 人物/道具参考${index + 1} = ${url}`)
    .join('\n');
  const suppliedViewAngles = Array.isArray(values.viewAngleOptions) ? values.viewAngleOptions : [];
  const allowedViewAngles = new Set(suppliedViewAngles.map((item) => item?.id).filter(Boolean));
  const customViewAngles = Array.isArray(values.viewAngles)
    ? values.viewAngles.filter((id, index, source) => allowedViewAngles.has(id) && source.indexOf(id) === index).slice(0, 4)
    : [];
  const viewAngles = customViewAngles.length ? customViewAngles : normalizeSculptureReliefViewAngles(values.viewAngles);
  const viewAngleText = viewAngles
    .map((id, index) => {
      const supplied = suppliedViewAngles.find((item) => item?.id === id);
      const meta = supplied || sculptureReliefViewAngleMeta(id);
      return `${index + 1}. ${cleanSculptureReliefText(meta.label, 120)}: ${cleanSculptureReliefText(meta.prompt, 1600)}`;
    })
    .join('\n');
  const dimensionText = dimensionMarksEnabled
    ? `尺寸标注：开启。画面中加入清晰的工程尺寸线和 mm 标注，标注这些关键尺寸：${dimensions}。`
    : `尺寸标注：关闭。不要绘制尺寸线、测量数字、尺子或工程标注符号；但造型比例仍必须遵循这些尺寸：${dimensions}。`;
  const patternReferenceText = hasPatternReferenceImage
    ? '输入参考图案作用：参考图总顺序中的 @img1 为参考图案，仅参考轮廓、剪影、外形节奏和大致构图；不要复制参考图案的细节、色彩、材质、文字、logo 或具体画面内容。'
    : '未提供参考图案：请根据主题自行设计清晰、完整、有展陈识别度的轮廓。';
  const peoplePropsReferenceText = hasPeoplePropsReference
    ? [
      '人物及道具参考图作用：仅参考人物姿态、服饰轮廓、道具类型、展项形态和情节元素；不要复制原图色彩、商标、文字、摄影背景或无关画面内容。',
      '人物/道具参考图顺序如下，文案中的 @img 标记必须按此顺序理解：',
      peoplePropsOrderText,
      peoplePropsText ? `人物/道具补充说明：${peoplePropsText}` : '',
    ].filter(Boolean).join('\n')
    : (peoplePropsText ? `人物/道具补充说明：${peoplePropsText}` : '未提供人物及道具参考图：如方案需要人物、道具或情节元素，请根据主题自行设计，避免喧宾夺主。');
  const backgroundText = backgroundMode === 'white'
    ? '背景模式：白背景。使用白色、浅灰白或近白方案展示背景，便于观察轮廓和材质。'
    : '背景模式：黑背景。使用黑色、深灰黑或近黑方案展示背景，突出体量、高光和边缘层次。';
  const kindConstraint = designKind === 'relief'
    ? '浮雕约束：作品必须依附于背板或墙面基底，表现清楚的凸起层次、雕刻深浅和墙面安装关系，不要生成完全脱离墙面的圆雕。'
    : '雕塑约束：作品必须是独立三维体量，表现完整正面和适度侧向厚度，包含落地、底座或安装方式，不要生成平面海报。';

  return [
    '核心要求：生成专业展陈雕塑/浮雕设计效果图，像可用于方案汇报的完成度较高的艺术装置设计图。',
    `设计类型：${kindMeta.label}；${kindMeta.prompt}。`,
    `细分类型：${typeMeta.label}；${typeMeta.prompt}。`,
    kindConstraint,
    dimensionText,
    backgroundText,
    patternReferenceText,
    peoplePropsReferenceText,
    (hasPatternReferenceImage || peoplePropsImages.length) ? `参考图总顺序：${[
      ...(hasPatternReferenceImage ? ['@img1=参考图案'] : []),
      ...peoplePropsImages.map((_, index) => `@img${peoplePropsOffset + index + 1}=人物/道具参考${index + 1}`),
    ].join('、')}。` : '',
    `多视角要求：在同一张方案图中呈现 ${viewAngles.length} 个视角，最多四宫格或横向分栏排布；每个视角标注清楚但不要出现乱码。视角如下：\n${viewAngleText}`,
    `材质与工艺：主材质为${material.label}；${material.prompt}。${manualMaterial ? ` 手动补充：${manualMaterial}。` : ''}`,
    titleText ? `标题文字：可将“${titleText}”作为方案标题或局部标识，但不要生成乱码。` : '标题文字：无明确标题时，不要强行生成大段文字。',
    themeText ? `主题概念：${themeText}` : '',
    bodyText ? `设计说明依据：${bodyText}` : '',
    '构图要求：主体完整居中或略偏构图，外轮廓清楚，展示尺度关系、材质细节、边缘收口、安装/底座逻辑和适度展陈灯光。',
    '质量约束：不要人物游客，不要杂乱展厅，不要随机品牌 logo，不要错误文字，不要低清模糊，不要把浮雕画成普通墙绘，不要把雕塑画成平面图案。',
  ].filter(Boolean).join('\n');
}
