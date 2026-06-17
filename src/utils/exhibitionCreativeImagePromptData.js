export const EXHIBITION_CREATIVE_SPACE_TYPES = [
  {
    id: 'intro-hall',
    label: '序厅',
    prompt: '序厅、入口形象区、第一视觉记忆点，强调开场仪式感、主题总览、品牌或展览核心精神的瞬间建立。',
  },
  {
    id: 'outro-hall',
    label: '尾厅',
    prompt: '尾厅、收束空间、出口前的情绪沉淀区，强调总结升华、互动留念、未来展望与完整参观体验的余韵。',
  },
  {
    id: 'highlight-space',
    label: '重亮点展项空间',
    prompt: '重亮点展项空间、核心展品或核心叙事节点，强调聚焦、沉浸、强视觉识别、戏剧化灯光与高完成度展陈体验。',
  },
];

const SPACE_TYPE_IDS = new Set(EXHIBITION_CREATIVE_SPACE_TYPES.map((item) => item.id));

export const EXHIBITION_CREATIVE_INSERT_ITEMS = [
  { id: 'large-sculpture', label: '大型雕塑' },
  { id: 'relief', label: '浮雕' },
  { id: 'group-sculpture', label: '群雕' },
  { id: 'art-installation', label: '艺术装置' },
  { id: 'multimedia-equipment', label: '多媒体设备' },
  { id: 'showcase', label: '展柜' },
  { id: 'scene', label: '场景' },
  { id: 'artwork', label: '艺术品' },
].map((item, index) => ({ ...item, order: index }));

const INSERT_ITEM_IDS = new Set(EXHIBITION_CREATIVE_INSERT_ITEMS.map((item) => item.id));

export const EXHIBITION_CREATIVE_EXCLUDE_ITEMS = [
  { id: 'readable-wrong-text', label: '可读错字/乱码文字' },
  { id: 'real-brand-logo', label: '真实品牌标识' },
  { id: 'instruction-table', label: '说明表格' },
  { id: 'crowded-people', label: '过多人群' },
  { id: 'messy-cables', label: '杂乱线缆' },
  { id: 'cartoon-style', label: '卡通低幼风格' },
  { id: 'blurry-low-quality', label: '低清晰度/模糊画面' },
  { id: 'extra-structure', label: '擅自新增或改变建筑结构' },
].map((item, index) => ({ ...item, order: index }));

export const EXHIBITION_CREATIVE_VIEW_ANGLES = [
  { id: 'front', label: '正视角' },
  { id: 'left', label: '左视角' },
  { id: 'right', label: '右视角' },
  { id: 'back', label: '后视角' },
  { id: 'top', label: '上视角' },
  { id: 'left-45', label: '左45度视角' },
  { id: 'right-45', label: '右45度视角' },
  { id: 'top-45', label: '上45度视角' },
].map((item, index) => ({ ...item, order: index }));

export function cleanExhibitionCreativeText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function normalizeExhibitionCreativeSpaceType(value) {
  const id = String(value || '').trim();
  return SPACE_TYPE_IDS.has(id) ? id : 'intro-hall';
}

export function normalizeExhibitionCreativeCount(value) {
  const number = Math.floor(Number(value) || 1);
  return Math.max(1, Math.min(12, number));
}

export function normalizeExhibitionCreativeSpaceSize(value) {
  const source = value && typeof value === 'object' ? value : {};
  const normalizeNumber = (raw) => {
    const number = Number(raw);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.round(number * 100) / 100;
  };
  return {
    width: normalizeNumber(source.width),
    depth: normalizeNumber(source.depth),
    height: normalizeNumber(source.height),
  };
}

export function exhibitionCreativeSpaceSizeText(value) {
  const size = normalizeExhibitionCreativeSpaceSize(value);
  if (!size.width || !size.depth || !size.height) return '';
  return `宽度 ${size.width} 米、进深 ${size.depth} 米、高度 ${size.height} 米`;
}

export function exhibitionCreativeSpaceTypeMeta(value) {
  const id = normalizeExhibitionCreativeSpaceType(value);
  return EXHIBITION_CREATIVE_SPACE_TYPES.find((item) => item.id === id) || EXHIBITION_CREATIVE_SPACE_TYPES[0];
}

export function normalizeExhibitionCreativeInsertItems(value, options = EXHIBITION_CREATIVE_INSERT_ITEMS) {
  const source = Array.isArray(options) && options.length > 0 ? options : EXHIBITION_CREATIVE_INSERT_ITEMS;
  const labelsById = new Map(source.map((item) => [String(item.id), String(item.label || item.id).trim()]));
  const ids = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const validIds = ids.filter((id) => labelsById.has(id));
  const fallback = source
    .filter((item) => INSERT_ITEM_IDS.has(String(item.id)))
    .map((item) => String(item.id));
  const picked = validIds.length > 0 ? validIds : fallback;
  return Array.from(new Set(picked)).map((id) => ({
    id,
    label: labelsById.get(id) || id,
  }));
}

export function exhibitionCreativeInsertItemsText(value, options = EXHIBITION_CREATIVE_INSERT_ITEMS) {
  const items = normalizeExhibitionCreativeInsertItems(value, options).map((item) => item.label).filter(Boolean);
  if (items.length === 0) return '展陈装置、展墙、展柜、灯光、图文层级、数字媒体和互动界面';
  if (items.length === 1) return items[0];
  if (items.length === 2) return items.join('和');
  return `${items.slice(0, -1).join('、')}和${items[items.length - 1]}`;
}

export function normalizeExhibitionCreativeExcludeItems(value, options = EXHIBITION_CREATIVE_EXCLUDE_ITEMS) {
  const source = Array.isArray(options) && options.length > 0 ? options : EXHIBITION_CREATIVE_EXCLUDE_ITEMS;
  const labelsById = new Map(source.map((item) => [String(item.id), String(item.label || item.id).trim()]));
  const ids = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return Array.from(new Set(ids.filter((id) => labelsById.has(id)))).map((id) => ({
    id,
    label: labelsById.get(id) || id,
  }));
}

export function exhibitionCreativeExcludeItemsText(value, options = EXHIBITION_CREATIVE_EXCLUDE_ITEMS) {
  const items = normalizeExhibitionCreativeExcludeItems(value, options).map((item) => item.label).filter(Boolean);
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return items.join('和');
  return `${items.slice(0, -1).join('、')}和${items[items.length - 1]}`;
}

export function normalizeExhibitionCreativeViewAngles(value, options = EXHIBITION_CREATIVE_VIEW_ANGLES) {
  const source = Array.isArray(options) && options.length > 0 ? options : EXHIBITION_CREATIVE_VIEW_ANGLES;
  const labelsById = new Map(source.map((item) => [String(item.id), String(item.label || item.id).trim()]));
  const ids = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return Array.from(new Set(ids.filter((id) => labelsById.has(id)))).map((id) => ({
    id,
    label: labelsById.get(id) || id,
  }));
}

export function exhibitionCreativeViewAnglesText(value, options = EXHIBITION_CREATIVE_VIEW_ANGLES) {
  const items = normalizeExhibitionCreativeViewAngles(value, options).map((item) => item.label).filter(Boolean);
  if (items.length === 0) return '';
  if (items.length === 1) return `控制生图视角为${items[0]}`;
  return `生成${items.length === 4 ? '四' : items.length}视图，分别包含${items.join('、')}`;
}

export function normalizeExhibitionCreativeBrief(value) {
  return cleanExhibitionCreativeText(value, 5000)
    .replace(/^```(?:json|markdown|md)?/i, '')
    .replace(/```$/i, '')
    .replace(/^\s*(?:创意描述|方案描述|空间创意|概念描述)\s*[:：]\s*/i, '')
    .trim();
}

function exhibitionCreativeMarkPositionText(value) {
  if (value === 'top-right') return '右上角';
  if (value === 'bottom-left') return '左下角';
  if (value === 'bottom-right') return '右下角';
  return '左上角';
}

function exhibitionCreativeReferenceMarkText(value, fallback) {
  return cleanExhibitionCreativeText(value ?? fallback, 64) || fallback;
}

export function buildExhibitionCreativeBriefPrompt(values = {}) {
  const meta = exhibitionCreativeSpaceTypeMeta(values.spaceType);
  const projectTheme = cleanExhibitionCreativeText(values.projectTheme, 500);
  const hasColorMaterialReferenceImage = values.hasColorMaterialReferenceImage === true;
  const colorMaterial = hasColorMaterialReferenceImage ? '' : cleanExhibitionCreativeText(values.colorMaterial, 1000);
  const inspiration = cleanExhibitionCreativeText(values.inspiration, 2000);
  const documentSummary = cleanExhibitionCreativeText(values.documentSummary, 3000);
  const roundIndex = Math.max(1, Number(values.roundIndex) || 1);
  const total = normalizeExhibitionCreativeCount(values.total || values.generationCount || 1);
  const insertItemsText = exhibitionCreativeInsertItemsText(values.insertItems, values.insertItemOptions);
  const excludeItemsText = exhibitionCreativeExcludeItemsText(values.excludeItems, values.excludeItemOptions);
  const previousBriefs = Array.isArray(values.previousBriefs)
    ? values.previousBriefs.map((item) => cleanExhibitionCreativeText(item, 800)).filter(Boolean)
    : [];
  const creativeInputText = hasColorMaterialReferenceImage ? '项目资料摘要、个人灵感和指定植入项' : '项目资料摘要、色彩与材质/个人灵感和指定植入项';
  const creativeRequirementText = hasColorMaterialReferenceImage ? '个人灵感要求' : '色彩与材质要求';
  const lines = [
    `请基于${creativeInputText}，创作第 ${roundIndex}/${total} 个${meta.label}展陈空间生图创意描述。`,
    `空间类型：${meta.label}。${meta.prompt}`,
    `指定植入项：${insertItemsText}`,
    '创意描述不要分析、引用或依赖输入图像；输入图像只会在后续图生图阶段作为空间结构约束。',
    `请把提炼后的创意资料文档、${creativeRequirementText}与${insertItemsText}结合，进行有艺术性的展陈空间创作，从展陈叙事、空间气质、灯光氛围、材料语言、互动方式、观众视线组织和拍摄画面完成度等角度给出可直接用于图生图的创意描述。`,
    '输出 180 到 320 字中文自然段，只输出创意描述本身，不要标题、编号、Markdown、解释、参数表或英文翻译。',
  ];
  if (excludeItemsText) {
    lines.push(`排除项：${excludeItemsText}。创意描述中不要设计、暗示或要求生成这些内容。`);
  }
  if (projectTheme) lines.push(`项目主题/展览关键词：${projectTheme}`);
  if (colorMaterial) lines.push(`色彩与材质：${colorMaterial}`);
  if (documentSummary) {
    lines.push('项目资料摘要：');
    lines.push(documentSummary);
  }
  if (inspiration) lines.push(`个人灵感补充：${inspiration}`);
  if (previousBriefs.length > 0) {
    lines.push('已有创意方向，新的描述需要明显区分，避免重复：');
    previousBriefs.slice(-5).forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }
  if (values.regenerateEachTime === false) {
    lines.push('本轮后续图片会复用同一创意描述，因此请给出稳定、完整、可反复变体的主创意方向。');
  } else {
    lines.push('请让本轮创意与同批次其他结果形成差异化，适合多方案比选。');
  }
  return lines.join('\n');
}

function exhibitionCreativeDeepeningRequirement(spaceType) {
  const id = normalizeExhibitionCreativeSpaceType(spaceType);
  if (id === 'outro-hall') {
    return '画面应服务尾厅或出口前收束空间的方案比选：突出总结升华、情绪沉淀、互动留念和未来展望，形成清晰的离场动线、柔和但有记忆点的灯光层次、可停留拍照的收束装置和完整的参观体验余韵。';
  }
  if (id === 'highlight-space') {
    return '画面应服务重点展项空间的方案比选：突出核心展品或核心叙事节点，形成强视觉焦点、沉浸式观看关系、戏剧化灯光、可信材料工艺、清晰观众围观路径和高完成度展陈体验。';
  }
  return '画面应服务序厅或入口形象区的方案比选：突出开场仪式感、第一视觉记忆点、主题总览、品牌或展览核心精神的瞬间建立，形成明确入口动线、主视觉焦点、可信材料工艺和高品质空间氛围。';
}

function exhibitionCreativeInputImagesText(values) {
  const hasSpaceImage = values.hasSpaceImage !== false;
  const hasColorMaterialReferenceImage = values.hasColorMaterialReferenceImage === true;
  const exhibitReferenceItems = Array.isArray(values.exhibitReferenceItems) ? values.exhibitReferenceItems : [];
  const hasExhibitReferenceImage = exhibitReferenceItems.length > 0 || values.hasExhibitReferenceImage === true;
  const colorMaterialReferenceMode = values.colorMaterialReferenceMode === 'abstract-card' ? 'abstract-card' : 'marked-image';
  const colorMaterialReferenceMarkText = exhibitionCreativeReferenceMarkText(values.colorMaterialReferenceMarkText, '图2');
  const colorMaterialReferenceMarkPositionText = exhibitionCreativeMarkPositionText(values.colorMaterialReferenceMarkPosition);
  const roles = [];
  let index = 1;
  if (hasSpaceImage) {
    roles.push(`图${index}=唯一空间结构示意图，唯一决定空间几何、透视、层高、主要开口、墙体位置、地面边界、顶面关系、动线和尺度关系`);
    index += 1;
  }
  if (hasColorMaterialReferenceImage) {
    const markText = colorMaterialReferenceMode === 'abstract-card'
      ? '色彩与材质抽象卡片'
      : `${colorMaterialReferenceMarkPositionText}带 ${colorMaterialReferenceMarkText} 标识的色彩与材质参考图`;
    roles.push(`图${index}=${markText}，只用于提取色彩关系、材质质感、表面肌理、光泽、冷暖倾向和灯光氛围，不作为空间结构依据`);
    index += 1;
  }
  if (hasExhibitReferenceImage) {
    if (exhibitReferenceItems.length > 0) {
      exhibitReferenceItems.forEach((item, i) => {
        const desc = typeof item.description === 'string' ? item.description.trim() : '';
        const label = desc ? `${desc}参考图做为主要展品参考素材` : '展品参考图';
        roles.push(`图${index}=${label}，只用于提取展品外观、内容主题、体量关系和展示重点，不作为空间结构或色彩材质体系依据`);
        index += 1;
      });
    } else {
      roles.push(`图${index}=展品参考图，只用于提取展品外观、内容主题、体量关系和展示重点，不作为空间结构或色彩材质体系依据`);
    }
  }
  if (roles.length > 0) return roles.join('；');
  return '无输入图；按手动空间尺寸、项目资料和创意描述生成。';
}

function exhibitionCreativeColorPaletteText({ colorMaterialPalette, colorMaterial, colorMaterialPriorityMode, colorMaterialReferenceTone, hasColorMaterialReferenceImage }) {
  const palette = cleanExhibitionCreativeText(colorMaterialPalette, 1000) || colorMaterial;
  if (palette) return palette;
  if (hasColorMaterialReferenceImage) {
    if (colorMaterialPriorityMode !== 'llm') {
      const tone = cleanExhibitionCreativeText(colorMaterialReferenceTone, 500);
      return tone || '以“主色调识别（像素采样）”文本框中的前端识别结果为准；如为空，请保持专业展陈色彩关系，避免杂乱高饱和配色。';
    }
    return '从色彩与材质参考图中提取主色、辅助色、金属色、明暗关系、冷暖倾向和局部发光色；不得借用该参考图的空间布局或构图。';
  }
  return '结合项目主题与展陈气质组织清晰、克制、可落地的专业展陈色彩体系，避免杂乱高饱和配色。';
}

function exhibitionCreativeMaterialsText({ colorMaterialTextures, colorMaterial, hasColorMaterialPreset, hasColorMaterialReferenceImage }) {
  const textures = cleanExhibitionCreativeText(colorMaterialTextures, 1000) || colorMaterial;
  if (hasColorMaterialPreset) {
    return textures || '根据色彩与材质预设组织墙面、地面、展柜、装置和灯光的材料语言，避免再从参考图提取。';
  }
  if (hasColorMaterialReferenceImage) {
    return '从色彩与材质参考图中提取可落地的墙面、地面、展柜、装置、金属字、发光亚克力、灯带、浮雕肌理和低反射表面工艺语言。';
  }
  return textures || '微水泥、哑光石材、拉丝金属、局部半透发光亚克力、深色木饰面、精细浮雕肌理、低反射地面和可施工的展陈饰面。';
}

function exhibitionCreativeAvoidText(excludeItemsText) {
  const defaults = [
    'people',
    'readable small text',
    'broken typography',
    'posters',
    'labels',
    'extra architectural openings',
    'altered structure',
    'random props',
    'graffiti',
    'ornamental clutter',
    'stone pomegranate shapes',
  ];
  if (excludeItemsText) defaults.push(excludeItemsText);
  return defaults.join(', ');
}

export function buildExhibitionCreativeImagePrompt(values = {}) {
  const meta = exhibitionCreativeSpaceTypeMeta(values.spaceType);
  const projectTheme = cleanExhibitionCreativeText(values.projectTheme, 500);
  const hasColorMaterialReferenceImage = values.hasColorMaterialReferenceImage === true;
  const hasColorMaterialPreset = values.hasColorMaterialPreset === true;
  const colorMaterial = hasColorMaterialReferenceImage ? '' : cleanExhibitionCreativeText(values.colorMaterial, 1000);
  const colorMaterialPalette = cleanExhibitionCreativeText(values.colorMaterialPalette, 1000);
  const colorMaterialTextures = cleanExhibitionCreativeText(values.colorMaterialTextures, 1000);
  const colorMaterialOverride = hasColorMaterialPreset ? cleanExhibitionCreativeText(values.colorMaterial, 1000) : '';
  const colorMaterialPriorityMode = values.colorMaterialPriorityMode === 'llm' ? 'llm' : 'frontend';
  const colorMaterialReferenceTone = cleanExhibitionCreativeText(values.colorMaterialReferenceTone, 500);
  const inspiration = cleanExhibitionCreativeText(values.inspiration, 2000);
  const documentSummary = cleanExhibitionCreativeText(values.documentSummary, 3000);
  const creativeBrief = normalizeExhibitionCreativeBrief(values.creativeBrief || values.brief);
  const roundIndex = Math.max(1, Number(values.roundIndex) || 1);
  const total = normalizeExhibitionCreativeCount(values.total || values.generationCount || 1);
  const insertItemsText = exhibitionCreativeInsertItemsText(values.insertItems, values.insertItemOptions);
  const excludeItemsText = exhibitionCreativeExcludeItemsText(values.excludeItems, values.excludeItemOptions);
  const annotationTextEffective = values.annotationTextEffective === true;
  const hasSpaceImage = values.hasSpaceImage !== false;
  const exhibitReferenceItems = Array.isArray(values.exhibitReferenceItems) ? values.exhibitReferenceItems : [];
  const hasExhibitReferenceImage = exhibitReferenceItems.length > 0 || values.hasExhibitReferenceImage === true;
  const spaceSizeText = exhibitionCreativeSpaceSizeText(values.spaceSize);
  const viewAnglesText = values.viewControlEnabled ? exhibitionCreativeViewAnglesText(values.viewAngles, values.viewAngleOptions) : '';
  const viewSentence = viewAnglesText ? `${viewAnglesText}；` : '';
  const imageTargetName = meta.label.endsWith('空间') ? `${meta.label}效果图` : `${meta.label}展陈空间效果图`;
  const subjectParts = [
    hasSpaceImage ? `在原始室内空间内植入${insertItemsText}` : `在室内空间内植入${insertItemsText}`,
    creativeBrief || '围绕该室内空间生成具有强记忆点的展陈创意：以主题叙事为核心，在入口/核心/收束视线位置组织主视觉装置、沉浸光影、展陈工艺和观众动线，形成可落地的高完成度展陈效果图。',
  ];
  if (projectTheme) subjectParts.push(`主题为“${projectTheme}”。`);
  if (documentSummary) subjectParts.push(`项目资料摘要：${documentSummary}`);
  if (inspiration) subjectParts.push(`强制要求：${inspiration}`);
  const primaryRequestParts = [
    `生成一张真实室内建筑摄影级渲染的${imageTargetName}，第${roundIndex}/${total}张。`,
    viewSentence,
  ];
  if (hasSpaceImage) {
    primaryRequestParts.push('严格遵循图1的空间几何、透视、层高、开口、墙体位置、顶面、地面边界、动线和尺度关系');
    if (annotationTextEffective) {
      primaryRequestParts.push('，按照图上标注的文字做为该文字所在部分的工艺说明来生图；');
    } else {
      primaryRequestParts.push('；');
    }
    primaryRequestParts.push(hasColorMaterialReferenceImage
      ? '色彩与材质参考图只用于提取材质语言、表面肌理、光泽、冷暖倾向和灯光氛围。'
      : '不要改变原始建筑结构，只在展陈创意、灯光、材料、装置和叙事氛围上形成新的方案。');
  } else if (spaceSizeText) {
    primaryRequestParts.push(`按${spaceSizeText}控制空间体量、人体尺度、开口关系和动线逻辑；不得生成超出尺寸边界的大跨空间、超高空间或不可信尺度。`);
  } else {
    primaryRequestParts.push('保持真实尺度关系、人体尺度和可落地的建筑室内逻辑。');
  }
  const lines = [
    'Use case: stylized-concept',
    `Asset type: 专业展陈空间效果图 / ${meta.label}方案比选`,
    `Primary request: ${primaryRequestParts.join('')}`,
    `Input images: ${exhibitionCreativeInputImagesText(values)}`,
    `Scene/backdrop: ${meta.prompt}`,
    `Subject: ${subjectParts.join(' ')}`,
    'Style/medium: photorealistic interior architectural visualization, high-end exhibition design render',
    `Composition/framing: ${hasSpaceImage ? '延续图1的原始透视、主入口视线、空间开口和尺度关系，主视觉布置在原空间合理视线焦点内，空间完整可读，画面干净，尺度可信' : '使用可信室内建筑摄影视角，完整呈现空间边界、主视觉焦点、参观动线和展陈体块关系，画面干净，尺度可信'}`,
    `Lighting/mood: ${exhibitionCreativeDeepeningRequirement(values.spaceType)} 灯光应纪念性、庄重、温暖或与项目气质一致，层次分明，局部线性灯光勾边，重点展墙、浮雕、装置或展品有洗墙光和重点光，整体像专业展陈施工落地图。`,
    `Color palette: ${exhibitionCreativeColorPaletteText({ colorMaterialPalette, colorMaterial: colorMaterialOverride || colorMaterial, colorMaterialPriorityMode, colorMaterialReferenceTone, hasColorMaterialReferenceImage })}`,
    `Materials/textures: ${exhibitionCreativeMaterialsText({ colorMaterialTextures, colorMaterial: colorMaterialOverride || colorMaterial, hasColorMaterialPreset, hasColorMaterialReferenceImage })}`,
    `Text (verbatim): ${projectTheme ? `仅允许出现大型立体主题字装置“${projectTheme}”或等价主题装置字形；` : '仅允许出现必要的大型立体主题字装置或抽象主题装置字形；'}不要出现任何小字、说明文字、乱码、展板文字、标签文字、Markdown 字段名或参数说明。`,
    `Constraints: ${hasSpaceImage ? '必须保留图1的原始建筑结构，不得改变主要开口、墙体、顶面、地面边界、透视、层高、动线和尺度关系；不把空间改造成另一处建筑；' : '必须保持真实室内空间尺度、墙体边界、开口逻辑、动线和可施工性；'}不增加人物；不出现蒙文；不出现可读错字或乱码；不出现小结构堆砌；不出现石榴造型；${hasExhibitReferenceImage ? '展品参考图只影响展品外观和展示重点，不影响空间结构或色彩材质；' : ''}${excludeItemsText ? `不得出现：${excludeItemsText}；` : ''}最终画面必须是高完成度、可落地的展陈空间效果图。`,
    `Avoid: ${exhibitionCreativeAvoidText(excludeItemsText)}`,
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
