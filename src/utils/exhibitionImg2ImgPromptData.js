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

const PRIORITY_IDS = new Set(EXHIBITION_IMG2IMG_PRIORITY.map((item) => item.id));
const LEGACY_PRIORITY_ID_MAP = {
  styleImageForm: 'colorMaterialReference',
};

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
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
      const description = cleanText(item?.description || item?.label || '', 120);
      if (!url && !description) return null;
      return {
        index: index + 1,
        description,
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
  for (const item of items) {
    if (item.description) {
      lines.push(`图中${item.description}参考图作为主要展品参考素材。`);
    }
  }
  lines.push('如画面中需要呈现展品，应让展品符合真实博物馆陈列尺度，带必要托座、低反射保护和重点照明；不要生成可读展品标签文字。');
  return lines.join('\n');
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

function craftItems(selectedIds, customCraft, craftPresets) {
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const source = Array.isArray(craftPresets) && craftPresets.length > 0 ? craftPresets : ELEVATION_CRAFTS;
  const values = source
    .filter((craft) => selected.has(craft.id))
    .map((craft) => ({
      label: cleanText(craft.label, 80),
      prompt: cleanText(craft.prompt, 800),
    }))
    .filter((craft) => craft.label || craft.prompt);
  const custom = cleanText(customCraft, 800);
  if (custom) values.push({ label: '自定义工艺', prompt: custom });
  return values;
}

function craftText(selectedIds, customCraft, craftPresets) {
  return craftItems(selectedIds, customCraft, craftPresets)
    .map((craft) => craft.prompt || craft.label)
    .filter(Boolean);
}

function craftBulletText(values) {
  const crafts = craftItems(values.selectedCrafts, values.customCraft, values.craftPresets);
  if (!crafts.length) return '按专业展陈常规工艺执行，图文展板、标题字、灯光、展柜与装饰面均需符合真实施工逻辑。';
  return crafts.map((craft) => {
    const prompt = craft.prompt || craft.label;
    const text = craft.label && prompt && !prompt.includes(craft.label)
      ? `${craft.label}：${prompt}`
      : prompt;
    return `${text}。`;
  }).join('\n');
}

function colorMaterialSourceText(values) {
  const palette = cleanText(values.colorMaterialPalette || '', 1200);
  const textures = cleanText(values.colorMaterialTextures || '', 1200);
  const colorMaterial = cleanText(values.colorMaterial || '', 1600);
  const lines = [];
  if (values.hasColorMaterialPreset) {
    lines.push('色彩与材质来源：使用已选择的共享色彩与材质预设；不要再从参考图推断空间结构或覆盖预设。');
  } else if (values.hasColorMaterialReferenceImage) {
    lines.push('色彩与材质来源：使用接入的色彩与材质参考图，仅提取主色、辅助色、冷暖关系、材质肌理、表面光泽、灯光氛围和可落地工艺语言。');
  } else if (colorMaterial || palette || textures) {
    lines.push('色彩与材质来源：使用手动填写的色彩与材质要求。');
  } else {
    lines.push('色彩与材质来源：未提供参考图或预设时，建立清晰、克制、可落地的专业展陈色彩材质体系。');
  }
  if (palette) lines.push(`Color palette：${palette}`);
  if (textures) lines.push(`Materials/textures：${textures}`);
  if (colorMaterial && (!palette || !textures)) lines.push(`色彩与材质：${colorMaterial}`);
  if (values.hasColorMaterialReferenceImage) {
    lines.push('色彩与材质参考图不得作为空间布局、墙体位置、展台位置、通道组织或透视角度依据；这些内容必须完全遵循空间结构示意图。');
  } else {
    lines.push('色彩与材质要求不得作为空间布局、墙体位置、展台位置、通道组织或透视角度依据；这些内容必须完全遵循空间结构示意图。');
  }
  return lines.join('\n');
}

function priorityLabel(id, values) {
  if (id === 'craftLayout') return '工艺与版式';
  if (id === 'colorMaterialReference') {
    if (values.hasColorMaterialPreset) return '色彩与材质预设';
    if (values.hasColorMaterialReferenceImage) return '色彩与材质参考图';
    return '色彩与材质体系';
  }
  return '';
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
    const genericLayout = lineValue(lines, '版式备注');
    const rest = lines.filter((line) => !/^\s*(工艺配置|版式备注)\s*[:：]/u.test(line));
    if (rest.length) out.push(rest.join('\n'));
    if (genericCraft) out.push(`工艺落位：${genericCraft}`);
    if (genericLayout) out.push(`备注：${genericLayout}`);
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
    const layoutNote = lineValue(block, '版式备注');
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
    if (layoutNote) wallLines.push('', `备注：${layoutNote}`);
    out.push(wallLines.join('\n'));
  });
  out.push('✧ 重要说明：以上立面组织结果仅用于设计效果图中各展墙的主题、图文层级、内容分区、重点文案占位和工艺落位；必须贴合结构示意图中的展墙/隔断位置，不得改变空间结构。');
  return out.join('\n\n');
}

function colorMaterialSystemText(values) {
  const palette = cleanText(values.colorMaterialPalette || '', 1200);
  const textures = cleanText(values.colorMaterialTextures || '', 1200);
  const colorMaterial = cleanText(values.colorMaterial || '', 1600);
  const source = colorMaterialSourceText(values);
  const lines = [];
  if (palette) lines.push(`主色调：${palette}`);
  if (textures) lines.push(`材质与肌理：${textures}`);
  if (colorMaterial) lines.push(`视觉特征：${colorMaterial}`);
  if (!palette && !textures && !colorMaterial) {
    lines.push('视觉特征：建立清晰、克制、可落地的专业展陈色彩材质体系。');
    lines.push('主色调：根据项目主题选择统一、耐看的主辅色关系。');
    lines.push('材质与肌理：墙面、地面、展台、展柜和装置均采用真实可施工的低反射材料。');
  }
  lines.push('灯光氛围：重点区域使用精准的重点照明，整体灯光层次丰富、自然。');
  lines.push('应用原则：将以上色彩、材质和灯光要求，真实、有逻辑地“包裹”在由示意图决定的空间骨架上（如墙面、地面、展柜、立体字、灯带、浮雕等表面），确保最终效果图具有摄影级的材质真实感和完成度。');
  lines.push(source);
  return lines.join('\n');
}

export function buildExhibitionImg2ImgPrompt(values = {}) {
  const priorityOrder = normalizeExhibitionImg2ImgPriority(values.priorityOrder);
  const supplement = cleanText(values.supplement);
  const exhibitReference = exhibitReferenceText(values.exhibitReferenceItems);
  const lines = [
    '1. 核心任务与最高约束',
    '',
    '任务：生成一张专业展陈空间效果图，要求真实室内建筑摄影级渲染，空间尺度可信，材质细节清晰，灯光层次准确。',
    '',
    '最高优先级（不可违反）：空间结构示意图是最终画面的唯一空间骨架和布局蓝本。',
    '',
    '硬性要求：必须精确提取并遵循示意图中的平面/轴测结构、墙体位置、展陈体块比例、通道宽度、动线走向、分区边界、入口/出口、重点节点以及开敞/封闭关系。',
    '',
    '最终检验标准：输出画面必须与示意图具有可被一眼识别的相同空间关系，任何部分都不能被改变或重新设计。',
    '',
    '绝对禁止：效果图中不得出现示意图上的任何文字、箭头、编号、尺寸线或图例标签。',
    '',
    '2. 执行优先级（除空间结构外）',
    '',
    executionPriorityText(priorityOrder, values),
    '',
    '3. 工艺与版式深化',
    '',
    '将以下展陈工艺和版式要求，应用到从“空间结构示意图”提取的骨架上。',
    '',
    '通用展陈工艺：',
    '',
    craftBulletText(values),
    '',
    `版式密度：${cleanText(values.density || '适中，图文层级均衡') }。`,
    '',
    '绝对禁止：效果图中不得出现“展陈工艺”、“版式密度”等字段名或任何具体的设计说明文字。',
    '',
    '4. 展墙内容与设计（分立面执行）',
    '',
    formatWallContentPrompt(values.wallContentPrompt),
    '',
    '5. 色彩与材质体系',
    '',
    colorMaterialSystemText(values),
    '',
    '6. 展品呈现',
    '',
    exhibitReference || [
      '参考素材：未接入展品参考图时，按展墙内容需要生成抽象展品占位或真实尺度的通用陈列体块。',
      '呈现标准：展品需符合真实博物馆陈列尺度，配有必要的托座、低反射保护玻璃和精准的重点照明。',
      '绝对禁止：效果图中不得生成任何可读的展品说明标签或文字。',
    ].join('\n'),
    '',
  ];
  const spaceHeight = spaceHeightText(values.dimensions);
  if (spaceHeight || cleanText(values.visualStyle) || supplement) {
    lines.push('补充要求：');
    if (spaceHeight) lines.push(`空间高度：${spaceHeight}米。`);
    if (cleanText(values.visualStyle)) lines.push(`视觉风格：${cleanText(values.visualStyle)}。`);
    if (supplement) lines.push(supplement);
    lines.push('');
  }
  lines.push(
    '7. 最终输出约束（必读）',
    '',
    '画面干净：画面中不得出现结构示意图上的标注文字、箭头、尺寸线或任何乱码文本。',
    '',
    '版式抽象：如需体现图文信息，仅以不可读的抽象色块/占位符和清晰的版式层级示意，不得渲染具体文字内容。',
    '',
    '禁止出现字段名：尤其不得将“展陈工艺”、“版式密度”、“工艺配置”、“版式备注”等字段或其后跟随的具体要求，作为画面中的文字呈现。',
    '',
    '最终目标：在严格遵循空间结构示意图的前提下，融合指定的工艺版式与色彩材质，输出一张结构逻辑清晰、材质细节丰富、灯光氛围真实的高品质展陈空间效果图。'
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
