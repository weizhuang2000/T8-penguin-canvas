import { ELEVATION_CRAFTS } from './elevationPromptData.js';

export const EXHIBITION_IMG2IMG_PRIORITY = [
  { id: 'structureAnnotations', label: '空间结构示意图标注' },
  { id: 'craftLayout', label: '工艺与版式' },
  { id: 'colorMaterialReference', label: '色彩与材质参考/预设' },
];

export const DEFAULT_EXHIBITION_IMG2IMG_PRIORITY = [
  'structureAnnotations',
  'craftLayout',
  'colorMaterialReference',
];

export const EXHIBITION_IMG2IMG_EXCLUDE_ITEMS = [
  { id: 'readable-wrong-text', label: '可读错字/乱码文字' },
  { id: 'real-brand-logo', label: '真实品牌标识' },
  { id: 'instruction-table', label: '说明表格' },
  { id: 'crowded-people', label: '过多人群' },
  { id: 'messy-cables', label: '杂乱线缆' },
  { id: 'cartoon-style', label: '卡通低幼风格' },
  { id: 'blurry-low-quality', label: '低清晰度/模糊画面' },
  { id: 'extra-structure', label: '擅自新增或改变建筑结构' },
].map((item, index) => ({ ...item, order: index }));

const PRIORITY_IDS = new Set(EXHIBITION_IMG2IMG_PRIORITY.map((item) => item.id));
const LEGACY_PRIORITY_ID_MAP = {
  styleImageForm: 'colorMaterialReference',
};
const SPACE_LIGHTING_LEVELS = {
  'very-dark': 'very dark overall space lighting, deliberately low-key exhibition atmosphere, deep ambient shadows, only necessary accent lights and guide lights remain visible',
  dark: 'relatively dark overall space lighting, restrained ambient brightness, clear but subdued wall-wash and accent lighting, controlled shadows',
  bright: 'relatively bright overall space lighting, clear ambient illumination, readable exhibition surfaces, balanced highlights without overexposure',
  'very-bright': 'very bright overall space lighting, high overall illumination, clean luminous exhibition atmosphere, crisp visibility while preserving material detail',
};
const SPACE_DECORATION_CRAFT_CATEGORIES = new Set(['装饰', '顶部']);
const BRIGHTNESS_PATTERN = /(?:非常暗|比较暗|较暗|偏暗|昏暗|暗色|深色|低亮度|明暗关系|明暗|比较亮|较亮|偏亮|非常亮|明亮|高亮度|亮色|dark|bright|brightness|low-key|high-key|shadowy|dim|moody)/gi;

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeSpaceLightingLevel(value) {
  const id = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(SPACE_LIGHTING_LEVELS, id) ? id : 'bright';
}

function spaceLightingText(values) {
  if (values.spaceLightingEnabled !== true) return '';
  const level = normalizeSpaceLightingLevel(values.spaceLightingLevel);
  return SPACE_LIGHTING_LEVELS[level];
}

function stripBrightnessText(value) {
  return cleanText(value)
    .replace(BRIGHTNESS_PATTERN, '')
    .replace(/[，、,;；]\s*[，、,;；]+/g, '，')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function removeColorMaterialBrightness(values) {
  if (!spaceLightingText(values)) return values;
  return {
    ...values,
    colorMaterialPalette: stripBrightnessText(values.colorMaterialPalette),
    colorMaterialTextures: stripBrightnessText(values.colorMaterialTextures),
    colorMaterial: stripBrightnessText(values.colorMaterial),
    colorMaterialReferenceTone: stripBrightnessText(values.colorMaterialReferenceTone),
  };
}

function cleanWallContentPrompt(value) {
  return cleanText(value, 50000)
    .split('\n')
    .filter((line) => !/^\s*尺寸\s*\/\s*比例\s*[:：]/u.test(line))
    .join('\n')
    .trim();
}

function normalizeExhibitReferenceItems(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const url = cleanText(item?.url || '', 1000);
      if (!url) return null;
      return {
        index: index + 1,
      };
    })
    .filter(Boolean);
}

function exhibitReferenceText(value) {
  const items = normalizeExhibitReferenceItems(value);
  if (!items.length) return '';
  const lines = [
    '【展品参考图】',
    '展品参考图只用于提取展品外观、内容主题、体量关系、材质细节和展示重点，不作为空间结构、布局比例或整体色彩材质体系依据。',
  ];
  lines.push(`已接入 ${items.length} 张展品参考图，按输入顺序作为展品外观、主题和展示重点参考。`);
  lines.push('如画面中需要呈现展品，应让展品符合真实博物馆陈列尺度，带必要托座、低反射保护和重点照明；不要生成可读展品标签文字。');
  return lines.join('\n');
}

function referenceRoleHintText(value) {
  const hints = Array.isArray(value) ? value : [];
  const lines = hints
    .map((item) => {
      const token = cleanText(item?.token || '', 32);
      if (!/^@img\d+\b/.test(token)) return '';
      if (item?.role === 'structure') return `${token} = 空间结构示意图。`;
      if (item?.role === 'plan-layout') return `${token} = 平面布局相机视角图。`;
      if (item?.role === 'color-material-reference') return `${token} = 色彩与材质参考图。`;
      if (item?.role === 'exhibit-reference') {
        const index = Number(item?.index);
        return `${token} = 展品参考图 ${Number.isFinite(index) && index > 0 ? index : ''}。`.replace(/\s+。$/, '。');
      }
      return '';
    })
    .filter(Boolean);
  if (!lines.length) return '';
  return [
    '【图像输入引用顺序】',
    '以下 @imgN 必须与实际传入生图模型的第 N 张参考图一致；提示词中引用图像时必须按此顺序理解，不得按接口名称自行重排。',
    ...lines,
  ].join('\n');
}


export function normalizeExhibitionImg2ImgPriority(value) {
  const out = [];
  const list = Array.isArray(value) ? value : [];
  for (const item of list) {
    const rawId = String(item || '').trim();
    const id = LEGACY_PRIORITY_ID_MAP[rawId] || rawId;
    if (!PRIORITY_IDS.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  for (const id of DEFAULT_EXHIBITION_IMG2IMG_PRIORITY) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function normalizeExhibitionImg2ImgExcludeItems(value, options = EXHIBITION_IMG2IMG_EXCLUDE_ITEMS) {
  const source = Array.isArray(options) && options.length > 0 ? options : EXHIBITION_IMG2IMG_EXCLUDE_ITEMS;
  const labelsById = new Map(source.map((item) => [String(item.id), String(item.label || item.id).trim()]));
  const ids = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return Array.from(new Set(ids.filter((id) => labelsById.has(id)))).map((id) => ({
    id,
    label: labelsById.get(id) || id,
  }));
}

export function exhibitionImg2ImgExcludeItemsText(value, options = EXHIBITION_IMG2IMG_EXCLUDE_ITEMS) {
  const items = normalizeExhibitionImg2ImgExcludeItems(value, options).map((item) => item.label).filter(Boolean);
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return items.join('和');
  return `${items.slice(0, -1).join('、')}和${items[items.length - 1]}`;
}

function craftItems(selectedIds, customCraft, craftPresets) {
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const source = Array.isArray(craftPresets) && craftPresets.length > 0 ? craftPresets : ELEVATION_CRAFTS;
  const values = source
    .filter((craft) => selected.has(craft.id))
    .map((craft) => ({
      category: cleanText(craft.category, 40),
      label: cleanText(craft.label, 80),
      prompt: cleanText(craft.prompt, 800),
    }))
    .filter((craft) => craft.label || craft.prompt);
  const custom = cleanText(customCraft, 800);
  if (custom) values.push({ category: '其它', label: '自定义工艺', prompt: custom });
  return values;
}

function craftText(selectedIds, customCraft, craftPresets) {
  return craftItems(selectedIds, customCraft, craftPresets)
    .map((craft) => craft.prompt || craft.label)
    .filter(Boolean);
}

function craftItemText(craft) {
  const prompt = craft.prompt || craft.label;
  return craft.label && prompt && !prompt.includes(craft.label)
    ? `${craft.label}：${prompt}`
    : prompt;
}

function craftBulletText(values, options = {}) {
  const excludeCategories = options.excludeCategories instanceof Set ? options.excludeCategories : new Set();
  const allCrafts = craftItems(values.selectedCrafts, values.customCraft, values.craftPresets);
  const crafts = allCrafts
    .filter((craft) => !excludeCategories.has(craft.category));
  if (!crafts.length) {
    return excludeCategories.size > 0 && allCrafts.length > 0
      ? '其余展陈工艺按专业展陈常规工艺执行，图文展板、标题字、灯光与展柜均需符合真实施工逻辑。'
      : '按专业展陈常规工艺执行，图文展板、标题字、灯光、展柜与装饰面均需符合真实施工逻辑。';
  }
  return crafts.map((craft) => {
    const text = craftItemText(craft);
    return `${text}。`;
  }).join('\n');
}

function spaceDecorationCraftText(values) {
  const crafts = craftItems(values.selectedCrafts, values.customCraft, values.craftPresets)
    .filter((craft) => SPACE_DECORATION_CRAFT_CATEGORIES.has(craft.category))
    .map((craft) => craftItemText(craft))
    .filter(Boolean);
  if (!crafts.length) return '按专业展陈空间装修常规工艺执行，墙面、地面、顶面、收边与隐藏灯槽均需符合真实施工逻辑。';
  return `整体空间装修采用工艺：${crafts.map((craft) => `${craft}。`).join('')}`;
}

function colorMaterialSourceText(values) {
  const hasReference = values.hasColorMaterialReferenceImage === true;
  const hasPreset = values.hasColorMaterialPreset === true && !hasReference;
  const palette = hasReference ? '' : cleanText(values.colorMaterialPalette || '', 1200);
  const textures = hasReference ? '' : cleanText(values.colorMaterialTextures || '', 1200);
  const colorMaterial = hasReference ? '' : cleanText(values.colorMaterial || '', 1600);
  const colorMaterialPriorityMode = values.colorMaterialPriorityMode === 'llm' ? 'llm' : 'frontend';
  const colorMaterialReferenceTone = cleanText(values.colorMaterialReferenceTone || '', 500);
  const lines = [];
  if (hasPreset) {
    lines.push('色彩与材质来源：使用已选择的共享色彩与材质预设；不要再从参考图推断空间结构或覆盖预设。');
  } else if (hasReference) {
    lines.push(colorMaterialPriorityMode === 'llm'
      ? '色彩与材质来源：使用大模型识别接入的色彩与材质参考图，仅提取主色、辅助色、冷暖关系、材质肌理、表面光泽、灯光氛围和可落地工艺语言。'
      : '色彩与材质来源：使用前端识别的色彩与材质参考图主色调结果，参考图仅用于辅助提取色彩关系、材质肌理、表面光泽和灯光氛围。');
  } else if (colorMaterial || palette || textures) {
    lines.push('色彩与材质来源：使用手动填写的色彩与材质要求。');
  } else {
    lines.push('色彩与材质来源：未提供参考图或预设时，建立清晰、克制、可落地的专业展陈色彩材质体系。');
  }
  if (palette && !hasReference) lines.push(`Color palette：${palette}`);
  if (hasReference && colorMaterialPriorityMode !== 'llm') {
    lines.push(`Color palette：${colorMaterialReferenceTone || '以“主色调识别（像素采样）”文本框中的前端识别结果为准；如为空，请保持专业展陈色彩关系，避免杂乱高饱和配色。'}`);
  }
  if (hasReference && colorMaterialPriorityMode === 'llm') {
    lines.push('Color palette：从色彩与材质参考图中提取主色、辅助色、金属色、明暗关系、冷暖倾向和局部发光色；不得借用该参考图的空间布局或构图。');
  }
  if (textures) lines.push(`Materials/textures：${textures}`);
  if (colorMaterial && (!palette || !textures)) lines.push(`色彩与材质：${colorMaterial}`);
  if (hasReference) {
    lines.push('色彩与材质参考图不得作为空间布局、墙体位置、展台位置、通道组织或透视角度依据；这些内容必须完全遵循空间结构示意图。');
  } else {
    lines.push('色彩与材质要求不得作为空间布局、墙体位置、展台位置、通道组织或透视角度依据；这些内容必须完全遵循空间结构示意图。');
  }
  return lines.join('\n');
}

function priorityLabel(id, values) {
  if (id === 'craftLayout') return '工艺与版式';
  if (id === 'colorMaterialReference') {
    if (values.hasColorMaterialReferenceImage) return '色彩与材质参考图';
    if (values.hasColorMaterialPreset) return '色彩与材质预设';
    return '色彩与材质体系';
  }
  return '';
}

function colorMaterialReferenceRoleText(values) {
  if (values.hasColorMaterialReferenceImage !== true) return '';
  const mode = values.colorMaterialReferenceMode === 'abstract-card' ? 'abstract-card' : 'marked-image';
  const markText = cleanText(values.colorMaterialReferenceMarkText || '图2', 64);
  const positionMap = {
    'top-left': '左上角',
    'top-right': '右上角',
    'bottom-left': '左下角',
    'bottom-right': '右下角',
  };
  const position = positionMap[values.colorMaterialReferenceMarkPosition] || '左上角';
  return mode === 'abstract-card'
    ? '色彩与材质参考输入：色彩与材质抽象卡片，只用于提取色彩关系、材质质感、表面肌理、光泽、冷暖倾向和灯光氛围，不作为空间结构依据。'
    : `色彩与材质参考输入：${position}带 ${markText} 标识的色彩与材质参考图，只用于提取色彩关系、材质质感、表面肌理、光泽、冷暖倾向和灯光氛围，不作为空间结构依据。`;
}

function executionPriorityText(priorityOrder, values) {
  const ordered = priorityOrder
    .filter((id) => id !== 'structureAnnotations')
    .map((id) => priorityLabel(id, values))
    .filter(Boolean);
  const fallback = ['工艺与版式', '色彩与材质体系'];
  const labels = ordered.length ? ordered : fallback;
  const names = ['第一优先级', '第二优先级', '第三优先级'];
  const lines = labels.map((label, index) => `${names[index] || `第 ${index + 1} 优先级`}：${label}。${label === '工艺与版式' ? '严格按照下方“工艺与版式深化”中的具体工法、材料和版式密度要求执行。' : '采用下方“色彩与材质体系”中定义的色彩、肌理和灯光氛围。'}`);
  lines.push('注意：此优先级仅用于决定工艺、材质、色彩和风格的取舍。在任何情况下，都不得为了迁就色彩或材质而改变第一条中定义的空间结构。');
  return lines.join('\n\n');
}

function lineValue(lines, label) {
  const pattern = new RegExp(`^\\s*${label}\\s*[:：]\\s*(.*)$`, 'u');
  const found = lines.find((line) => pattern.test(line));
  return found ? cleanText(found.replace(pattern, '$1'), 6000) : '';
}

function splitSentences(text) {
  return cleanText(text, 8000)
    .split(/[。；;]\s*/u)
    .map((item) => cleanText(item, 800))
    .filter(Boolean);
}

function spaceHeightText(value) {
  const text = cleanText(value, 80);
  const match = text.match(/\d+(?:\.\d+)?/u);
  return match ? match[0] : '';
}

function spatialMode(values) {
  return values.spatialInputMode === 'plan-camera' ? 'plan-camera' : 'structure';
}

function planCameraPromptBlock(values) {
  if (spatialMode(values) !== 'plan-camera') return '';
  return [
    '【平面布局图与相机视角约束】',
    '最高优先级（不可违反）：接入的平面布局图以及已确认合成在图上的相机图标、朝向线和取景锥，是最终画面的唯一空间布局、观看方向、透视组织和画面范围依据。',
    '相机视角以输入平面布局图上已确认合成的相机标注为准，不在提示词中展开坐标、角度、缩放或偏移数值。',
    '必须按该视角渲染展陈空间图像：从相机所在位置看向取景锥方向，将平面布局中的墙体、展区、展台、通道、入口出口和动线转换为真实室内建筑摄影级透视。',
    '不得把平面布局图渲染成俯视平面图；不得忽略、移动或重新设计相机视角；不得让色彩、材质、工艺或展品参考覆盖平面布局和相机视角依据。',
  ].join('\n');
}

function applyPlanCameraPromptMode(prompt, values) {
  if (spatialMode(values) !== 'plan-camera') return prompt;
  const block = planCameraPromptBlock(values);
  let next = prompt
    .replace(/空间结构示意图是最终画面的唯一空间骨架和布局蓝本/g, '平面布局图与相机视角是最终画面的唯一空间布局和透视蓝本')
    .replace(/空间结构示意图/g, '平面布局图与相机视角')
    .replace(/结构示意图/g, '平面布局图')
    .replace(/示意图/g, '平面布局图')
    .replace(/按空间结构/g, '按平面布局图与相机视角')
    .replace(/从“平面布局图与相机视角”提取的骨架/g, '从平面布局图和相机取景锥确定的空间骨架')
    .replace(/从平面布局图中提取/g, '从平面布局图和相机取景锥中提取')
    .replace(/除空间结构外/g, '除平面布局与相机视角外')
    .replace(/不得改变空间结构/g, '不得改变平面布局与相机视角')
    .replace(/空间结构/g, '平面布局与相机视角');
  next = next.replace(
    /(1\.[^\n]*\n\n[^\n]*\n\n)/,
    `$1${block}\n\n`,
  );
  next = next.replace(
    /(7\.[^\n]*\n\n)/,
    `$1${block}\n\n`,
  );
  return next;
}

function formatWallContentPrompt(value) {
  const prompt = cleanWallContentPrompt(value);
  if (!prompt) return '未启用展墙内容设计时，按空间结构示意图中的展墙/隔断关系进行抽象图文层级与展品陈列组织，不生成可读长文。';
  const lines = prompt.split('\n').map((line) => cleanText(line, 6000)).filter(Boolean);
  const project = lineValue(lines, '项目');
  const core = lineValue(lines, '核心信息');
  const wallStartIndexes = [];
  lines.forEach((line, index) => {
    if (/^立面\s*\d+\s*[｜|:：]/u.test(line)) wallStartIndexes.push(index);
  });
  const out = [
    '将以下各立面的内容、文案和特定工艺，分别落实到从示意图中提取的对应展墙/隔断位置上。',
  ];
  if (project) out.push(`项目：${project}`);
  if (core) out.push(`核心叙事：${core}`);
  if (!wallStartIndexes.length) {
    const genericCraft = lineValue(lines, '工艺配置');
    const rest = lines.filter((line) => !/^\s*(工艺配置|版式备注)\s*[:：]/u.test(line));
    if (rest.length) out.push(rest.join('\n'));
    if (genericCraft) out.push(`工艺落位：${genericCraft}`);
    out.push('重要说明：以上内容仅用于设计效果图中各展墙的主题、图文层级、内容分区、重点文案占位和工艺落位；必须贴合结构示意图中的展墙/隔断位置，不得改变空间结构。');
    return out.join('\n\n');
  }
  wallStartIndexes.forEach((start, wallIndex) => {
    const end = wallStartIndexes[wallIndex + 1] ?? lines.length;
    const block = lines.slice(start, end);
    const heading = block[0];
    const titleMatch = heading.match(/^立面\s*(\d+)\s*[｜|:：]\s*(.*)$/u);
    const number = titleMatch?.[1] || String(wallIndex + 1);
    const title = cleanText(titleMatch?.[2] || heading, 120);
    const summary = lineValue(block, '内容摘要');
    const exactText = lineValue(block, '准确文案');
    const craftConfig = lineValue(block, '工艺配置');
    const wallLength = lineValue(block, '立面长度');
    const elements = splitSentences(summary).slice(0, 8);
    const crafts = splitSentences(craftConfig).slice(0, 10);
    const wallLines = [
      `（${wallIndex + 1}）立面 ${number}：${title || `立面 ${number}`}`,
      '',
      `主题：${title || summary || '根据本立面内容形成主题'}。`,
    ];
    if (summary) wallLines.push(`空间氛围：${summary}`);
    if (elements.length || exactText) {
      wallLines.push('', '核心元素：');
      elements.forEach((item) => wallLines.push(`${item}。`));
      if (exactText) wallLines.push(`重点文案占位：${exactText}。`);
    }
    if (crafts.length) {
      wallLines.push('', '工艺落位：');
      crafts.forEach((item) => wallLines.push(`${item}。`));
    }
    if (wallLength) wallLines.push('', `立面长度：${wallLength}`);
    out.push(wallLines.join('\n'));
  });
  out.push('✧ 重要说明：以上立面组织结果仅用于设计效果图中各展墙的主题、图文层级、内容分区、重点文案占位和工艺落位；必须贴合结构示意图中的展墙/隔断位置，不得改变空间结构。');
  return out.join('\n\n');
}

function colorMaterialSystemText(values) {
  values = removeColorMaterialBrightness(values);
  const hasReference = values.hasColorMaterialReferenceImage === true;
  const palette = hasReference ? '' : cleanText(values.colorMaterialPalette || '', 1200);
  const textures = hasReference ? '' : cleanText(values.colorMaterialTextures || '', 1200);
  const priorityMode = values.colorMaterialPriorityMode === 'llm' ? 'llm' : 'frontend';
  const referenceTone = cleanText(values.colorMaterialReferenceTone || '', 500);
  const colorMaterial = hasReference ? '' : cleanText(values.colorMaterial || '', 1600);
  const source = colorMaterialSourceText(values);
  const lines = [];
  if (palette) lines.push(`主色调：${palette}`);
  if (hasReference && priorityMode !== 'llm' && referenceTone) lines.push(referenceTone.startsWith('主色调') ? referenceTone : `主色调：${referenceTone}`);
  if (hasReference && priorityMode === 'llm') lines.push('主色调：从色彩与材质参考图中提取主色、辅助色、金属色、明暗关系、冷暖倾向和局部发光色。');
  if (textures) lines.push(`材质与肌理：${textures}`);
  if (hasReference) lines.push('材质与肌理：从色彩与材质参考图中提取可落地的墙面、地面、展柜、装置、金属字、发光亚克力、灯带、浮雕肌理和低反射表面工艺语言。');
  if (colorMaterial) lines.push(`视觉特征：${colorMaterial}`);
  if (!palette && !textures && !colorMaterial) {
    lines.push('视觉特征：建立清晰、克制、可落地的专业展陈色彩材质体系。');
    lines.push('主色调：根据项目主题选择统一、耐看的主辅色关系。');
    lines.push('材质与肌理：墙面、地面、展台、展柜和装置均采用真实可施工的低反射材料。');
  }
  lines.push('灯光氛围：重点区域使用精准的重点照明，整体灯光层次丰富、自然。');
  lines.push('应用原则：将以上色彩、材质和灯光要求，真实、有逻辑地“包裹”在由示意图决定的空间骨架上（如墙面、地面、展柜、立体字、灯带、浮雕等表面），确保最终效果图具有摄影级的材质真实感和完成度。');
  const lighting = spaceLightingText(values);
  if (lighting) {
    lines.push(`IMPORTANT overall lighting priority: ${lighting}. This overrides any brightness, darkness, lightness, shadow density, or illumination level implied by Color palette or Materials/textures.`);
  }
  lines.push(source);
  return lines.join('\n');
}

export function buildExhibitionImg2ImgPrompt(values = {}) {
  const priorityOrder = normalizeExhibitionImg2ImgPriority(values.priorityOrder);
  const supplement = cleanText(values.supplement);
  const exhibitReference = exhibitReferenceText(values.exhibitReferenceItems);
  const referenceRoleHints = referenceRoleHintText(values.referenceRoleHints);
  const excludeItemsText = exhibitionImg2ImgExcludeItemsText(
    values.excludeItems,
    values.excludeItemOptions || EXHIBITION_IMG2IMG_EXCLUDE_ITEMS,
  );
  const spaceDecorationCraft = spaceDecorationCraftText(values);
  const lines = [
    '1. 核心任务与最高约束',
    '',
    '任务：生成一张专业展陈空间效果图，要求真实室内建筑摄影级渲染，空间尺度可信，材质细节清晰，灯光层次准确。',
    '',
    '最高优先级（不可违反）：空间结构示意图是最终画面的唯一空间骨架和布局蓝本。',
    '',
    '硬性要求：必须精确提取并遵循示意图中的平面/轴测结构、墙体位置、展陈体块比例、通道宽度、动线走向、分区边界、入口/出口、重点节点以及开敞/封闭关系。必须按照整体空间装修采用工艺的要求来生成基础墙顶地的色彩与材质。',
    '',
    '最终检验标准：输出画面必须与示意图具有可被一眼识别的相同空间关系，任何部分都不能被改变或重新设计。',
    '',
    '绝对禁止：效果图中不得出现示意图上的任何文字、箭头、编号、尺寸线或图例标签。',
    '',
    '2. 执行优先级（除空间结构外）',
    '',
    referenceRoleHints,
    referenceRoleHints ? '' : '',
    executionPriorityText(priorityOrder, values),
    '',
    '3. 整体空间装修采用工艺',
    '',
    spaceDecorationCraft,
    '',
    '4. 工艺与版式深化',
    '',
    '将以下展陈工艺和版式要求，应用到从“空间结构示意图”提取的骨架上。',
    '',
    '通用展陈工艺：',
    '',
    craftBulletText(values, { excludeCategories: SPACE_DECORATION_CRAFT_CATEGORIES }),
    '',
    `版式密度：${cleanText(values.density || '适中，图文层级均衡') }。`,
    '',
    '绝对禁止：效果图中不得出现“展陈工艺”、“版式密度”等字段名或任何具体的设计说明文字。',
    '',
    '5. 展墙内容与设计（分立面执行）',
    '',
    formatWallContentPrompt(values.wallContentPrompt),
    '',
    '6. 色彩与材质体系',
    '',
    colorMaterialSystemText(values),
    '',
    '7. 展品呈现',
    '',
    exhibitReference || [
      '参考素材：未接入展品参考图时，按展墙内容需要生成抽象展品占位或真实尺度的通用陈列体块。',
      '呈现标准：展品需符合真实博物馆陈列尺度，配有必要的托座、低反射保护玻璃和精准的重点照明。',
      '绝对禁止：效果图中不得生成任何可读的展品说明标签或文字。',
    ].join('\n'),
    '',
  ];
  const colorMaterialReferenceRole = colorMaterialReferenceRoleText(values);
  if (colorMaterialReferenceRole) {
    lines.push(colorMaterialReferenceRole);
    lines.push('');
  }
  const spaceHeight = spaceHeightText(values.dimensions);
  if (spaceHeight || cleanText(values.visualStyle) || supplement) {
    lines.push('补充要求：');
    if (spaceHeight) lines.push(`空间高度：${spaceHeight}米。`);
    if (cleanText(values.visualStyle)) lines.push(`视觉风格：${cleanText(values.visualStyle)}。`);
    if (supplement) lines.push(supplement);
    lines.push('');
  }
  lines.push(
    '8. 最终输出约束（必读）',
    '',
    '画面干净：画面中不得出现结构示意图上的标注文字、箭头、尺寸线或任何乱码文本。',
    '',
    excludeItemsText ? `排除项：不得出现：${excludeItemsText}。` : '',
    excludeItemsText ? '' : '',
    '禁止出现字段名：尤其不得将“展陈工艺”、“版式密度”、“工艺配置”、“版式备注”等字段或其后跟随的具体要求，作为画面中的文字呈现。',
    '',
    '最终目标：在严格遵循空间结构示意图的前提下，融合指定的工艺版式与色彩材质，输出一张结构逻辑清晰、材质细节丰富、灯光氛围真实的高品质展陈空间效果图。'
  );

  return applyPlanCameraPromptMode(
    lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    values,
  );
}
