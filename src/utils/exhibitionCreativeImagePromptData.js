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

export function buildExhibitionCreativeImagePrompt(values = {}) {
  const meta = exhibitionCreativeSpaceTypeMeta(values.spaceType);
  const projectTheme = cleanExhibitionCreativeText(values.projectTheme, 500);
  const hasColorMaterialReferenceImage = values.hasColorMaterialReferenceImage === true;
  const colorMaterial = hasColorMaterialReferenceImage ? '' : cleanExhibitionCreativeText(values.colorMaterial, 1000);
  const inspiration = cleanExhibitionCreativeText(values.inspiration, 2000);
  const documentSummary = cleanExhibitionCreativeText(values.documentSummary, 3000);
  const creativeBrief = normalizeExhibitionCreativeBrief(values.creativeBrief || values.brief);
  const roundIndex = Math.max(1, Number(values.roundIndex) || 1);
  const total = normalizeExhibitionCreativeCount(values.total || values.generationCount || 1);
  const insertItemsText = exhibitionCreativeInsertItemsText(values.insertItems, values.insertItemOptions);
  const excludeItemsText = exhibitionCreativeExcludeItemsText(values.excludeItems, values.excludeItemOptions);
  const hasSpaceImage = values.hasSpaceImage !== false;
  const hasExhibitReferenceImage = values.hasExhibitReferenceImage === true;
  const colorMaterialReferenceMarkText = exhibitionCreativeReferenceMarkText(values.colorMaterialReferenceMarkText, 'R');
  const colorMaterialReferenceMarkPositionText = exhibitionCreativeMarkPositionText(values.colorMaterialReferenceMarkPosition);
  const spaceSizeText = exhibitionCreativeSpaceSizeText(values.spaceSize);
  const viewAnglesText = values.viewControlEnabled ? exhibitionCreativeViewAnglesText(values.viewAngles, values.viewAngleOptions) : '';
  const viewPrefix = viewAnglesText ? `${viewAnglesText}，` : '';
  const lines = [
    `生成一张专业${meta.label}展陈空间效果图，第 ${roundIndex}/${total} 张。${viewPrefix}真实室内建筑摄影级渲染，空间尺度可信，材质细节清晰，灯光层次准确，画面干净完整。`,
    `空间类型：${meta.label}。${meta.prompt}`,
    '',
  ];
  if (hasSpaceImage || hasColorMaterialReferenceImage || hasExhibitReferenceImage) {
    lines.push('【参考图读取总规则】');
    lines.push('参考图按输入顺序读取：第 1 类为空间结构示意图，第 2 类为色彩与材质参考图，第 3 类为展品参考图；三类参考图职责互斥，不能互相替代、混用或推断对方职责。');
    lines.push('如果不同参考图之间出现冲突：空间几何、布局、透视、层高、墙柱、吊顶、地面边界和动线只服从空间结构示意图；色彩关系、材质质感、肌理、光泽和冷暖倾向只服从色彩与材质参考图；展品外观、内容主题、体量关系和展示重点只服从展品参考图。');
    lines.push('');
  }
  if (hasSpaceImage) {
    lines.push('【空间结构示意图】');
    lines.push('纯色素模的参考图是空间结构示意图，是空间几何、布局和动线的主约束；也是空间骨架和布局蓝本。');
    lines.push('必须把图中的平面关系、动线、分区、展墙/隔断、入口出口、主要体块、墙柱、吊顶、地面边界和开口关系转译为真实透视空间，不能只借鉴风格而改成另一套空间。');
    lines.push('空间结构不参与表现形式或色彩材质的优先级排序；无论其他参考图如何，最终空间结构必须完全遵循空间结构示意图。');
    lines.push('该图不作为展品参考图起任何作用，不从该图提取展品造型、展品内容、展品主题或展示重点。');
    lines.push('该图也不作为色彩与材质参考图起任何作用，不从该图提取色彩风格、材料质感、表面肌理、灯光色温、软装装饰或展陈饰面。');
    lines.push('不要在最终效果图中渲染、复写、临摹或生成空间结构示意图中的标注文字、箭头编号、尺寸线、图例、说明标签或乱码文本。');
    lines.push(`需要在该空间内植入${insertItemsText}；不得把空间改成另一处建筑，不得改变主要开口、承重结构和真实尺度关系。`);
  } else {
    lines.push('【手动空间尺寸约束】');
    lines.push(spaceSizeText
      ? `请在${spaceSizeText}的室内空间体量内生成方案，空间结构、开口位置、墙体组织、吊顶形式和参观动线可以自由发挥，但必须保持真实尺度关系、人体尺度和可落地的建筑室内逻辑。`
      : '请自由设计室内建筑空间结构，但必须保持真实尺度关系、人体尺度和可落地的建筑室内逻辑。');
    lines.push(`需要在该空间内植入${insertItemsText}；展陈内容、建筑空间和动线都应控制在上述空间体量内，不要生成明显超出尺寸边界的大跨空间、超高空间或不可信尺度。`);
  }
  if (excludeItemsText) {
    lines.push('');
    lines.push('【排除项优先约束】');
    lines.push(`以下内容优先级高于创意描述，不得出现在画面中：${excludeItemsText}。即使创意描述、项目资料或个人灵感提到这些内容，也必须忽略并避免生成。`);
  }
  if (hasColorMaterialReferenceImage) {
    lines.push('');
    lines.push('【色彩与材质参考图】');
    lines.push(`${colorMaterialReferenceMarkPositionText}带 ${colorMaterialReferenceMarkText} 标识的图片为色彩与材质参考图，只用于参考色彩关系、材质质感、表面肌理、光泽和冷暖倾向。`);
    lines.push('该图不作为展品参考图起任何作用，不从该图提取展品造型、展品内容、展品主题或展示重点。');
    lines.push('该图不作为空间结构依据，不改变空间图或手动空间尺寸给出的几何、透视、层高、开口和动线关系。');
    lines.push('不要从该图学习或复制空间布局、房间形状、墙柱位置、吊顶形式、地面边界、门洞开口、镜头角度、构图比例、展示道具或展品形态；只把它翻译成可用于当前空间的颜色与材质语言。');
  }
  if (hasExhibitReferenceImage) {
    lines.push('');
    lines.push('【展品参考图】');
    lines.push('展品参考图是唯一展品参考来源，只用于展品外观、内容主题、体量关系和展示重点，不作为空间结构或色彩材质体系依据。');
  }
  if (colorMaterial) {
    lines.push('');
    lines.push('【色彩与材质】');
    lines.push(colorMaterial);
    lines.push('上述色彩与材质体系优先于自由创意描述，必须转化为可落地的墙面、地面、展柜、装置、灯光和表面工艺表达。');
  }
  if (inspiration) {
    lines.push('');
    lines.push('【强制要求】');
    lines.push(inspiration);
  }
  lines.push('');
  lines.push('【创意描述】');
  lines.push(creativeBrief || '围绕该室内空间生成具有强记忆点的展陈创意：以主题叙事为核心，在入口/核心/收束视线位置组织主视觉装置、沉浸光影、展陈工艺和观众动线，形成可落地的高完成度展陈效果图。');
  if (projectTheme) lines.push(`项目主题：${projectTheme}`);
  if (documentSummary) {
    lines.push('项目资料摘要：');
    lines.push(documentSummary);
  }
  lines.push('');
  lines.push('【设计深化要求】');
  lines.push(exhibitionCreativeDeepeningRequirement(values.spaceType));
  lines.push('不要出现“创意描述”“个人灵感”“空间类型”“输入空间图约束”等字段名，也不要把上述设计说明作为上墙文字。');
  lines.push(hasSpaceImage
    ? '最终画面必须看得出来自同一张输入室内空间图，只是在展陈创意、灯光、材料、装置和叙事氛围上形成新的方案。'
    : '最终画面不受既有输入图限制，空间结构可以自由发挥，但所有墙体、开口、展陈装置、展柜、媒体设备、观众尺度和拍摄视角都必须落在手动输入的空间尺寸范围内。');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
