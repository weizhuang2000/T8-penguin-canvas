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

function craftText(selectedIds, customCraft, craftPresets) {
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const source = Array.isArray(craftPresets) && craftPresets.length > 0 ? craftPresets : ELEVATION_CRAFTS;
  const values = source
    .filter((craft) => selected.has(craft.id))
    .map((craft) => cleanText(craft.prompt, 800))
    .filter(Boolean);
  const custom = cleanText(customCraft, 800);
  if (custom) values.push(custom);
  return values.join('；');
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

function referenceRoleText(priorityOrderText, values) {
  const lines = [
    '参考图角色说明：空间结构示意图是空间几何、布局、墙体、展陈体块、分区和动线的主约束。',
  ];
  if (values.hasColorMaterialReferenceImage) {
    lines.push('色彩与材质参考图只用于提取色彩关系、材质质感、表面肌理、光泽、冷暖倾向和灯光氛围。');
    lines.push('生成时必须先从空间结构示意图提取干净的空间骨架，再把色彩与材质参考图的材料语言应用到该骨架上；不要直接沿用色彩材质参考图中的空间布局、墙体位置、透视角度或动线。');
  } else {
    lines.push('生成时必须先从空间结构示意图提取干净的空间骨架，再把色彩材质要求和工艺版式应用到该骨架上。');
  }
  lines.push(`展陈工艺选用的优先级顺序：${priorityOrderText}，该优先级顺序只针对工艺版式、色彩材质语言、视觉风格和渲染语言的取舍；空间结构不参与该优先级排序，空间几何、布局、墙体、展陈体块、分区和动线必须完全按照空间结构示意图执行。`);
  return lines.join('\n');
}

function sectionText(id, values) {
  if (id === 'structureAnnotations') {
    return [
      '优先理解空间结构示意图：它不是普通参考图，而是最终画面的空间骨架和布局蓝本。必须保留平面/轴测结构关系、主要体块比例、展墙/隔断位置、通道宽窄、动线走向、分区边界、入口出口、重点节点、开敞/封闭关系和尺度逻辑。',
      '输出画面应能一眼看出与结构示意图具有相同的空间关系：主要墙体和展陈体块的位置相对一致，通行动线和视线组织一致，分区数量与前后左右关系一致，不能只借鉴风格而改成另一套空间。',
      '结构图上的文字、箭头编号、尺寸标注、说明标签仅作为理解空间关系的参考，不要在最终效果图中渲染、复写、临摹或生成任何可读文字、编号、箭头说明、尺寸线和标签。',
    ].join('\n');
  }
  if (id === 'colorMaterialReference') {
    return [
      colorMaterialSourceText(values),
      '将色彩与材质语言落到墙面、地面、展柜、装置、金属字、发光亚克力、灯带、浮雕肌理和低反射表面上，保持真实施工逻辑和摄影级完成度。',
      values.hasColorMaterialReferenceImage
        ? '即使“色彩与材质参考/预设”在优先级中排在前面，也只能优先采用参考图的色彩、材质、肌理、光泽、冷暖和灯光氛围，不能优先采用它的空间结构、布局比例、墙体位置、通道组织或分区关系。'
        : '即使“色彩与材质参考/预设”在优先级中排在前面，也只能优先采用色彩材质要求中的色彩、材质、肌理、光泽、冷暖和灯光氛围，不能改变空间结构、布局比例、墙体位置、通道组织或分区关系。',
    ].join('\n');
  }
  const crafts = craftText(values.selectedCrafts, values.customCraft, values.craftPresets);
  const lines = ['根据工艺与版式要求深化展陈设计。'];
  if (crafts) lines.push(`展陈工艺：${crafts}`);
  lines.push(`版式密度：${cleanText(values.density || '适中，图文层级均衡，主次分明')}`);
  lines.push('“展陈工艺”“版式密度”“工艺配置”“版式备注”等字段及其具体要求只作为设计执行说明，用于指导材料、工法、图文层级和版式组织，不得作为可读上墙文字、标题、标签或说明直接出现在效果图中。');
  const wallContentPrompt = cleanWallContentPrompt(values.wallContentPrompt);
  if (wallContentPrompt) {
    lines.push('展墙具体内容设计提示：');
    lines.push(wallContentPrompt);
    lines.push('以上立面组织结果仅用于设计效果图中各展墙的主题、图文层级、内容分区、重点文案占位和工艺落位；必须贴合结构示意图中的展墙/隔断位置，不得改变空间结构。');
  }
  if (cleanText(values.dimensions)) lines.push(`空间/画面尺寸：${cleanText(values.dimensions)}`);
  if (cleanText(values.colorMaterial)) lines.push(`色彩与材质：${cleanText(values.colorMaterial)}`);
  if (cleanText(values.visualStyle)) lines.push(`视觉风格：${cleanText(values.visualStyle)}`);
  return lines.join('\n');
}

export function buildExhibitionImg2ImgPrompt(values = {}) {
  const priorityOrder = normalizeExhibitionImg2ImgPriority(values.priorityOrder);
  const priorityOrderText = priorityOrder.map((id, index) => {
    const meta = EXHIBITION_IMG2IMG_PRIORITY.find((item) => item.id === id);
    return `${index + 1}. ${meta?.label || id}`;
  }).join(' > ');
  const lines = [
    '生成一张专业展陈空间效果图，真实室内建筑摄影级渲染，空间尺度可信，材质细节清晰，灯光层次准确。',
    referenceRoleText(priorityOrderText, values),
    '',
  ];

  for (const id of priorityOrder) {
    const meta = EXHIBITION_IMG2IMG_PRIORITY.find((item) => item.id === id);
    lines.push(`【${meta?.label || id}】`);
    lines.push(sectionText(id, values));
    lines.push('');
  }

  const supplement = cleanText(values.supplement);
  if (supplement) {
    lines.push('【补充要求】');
    lines.push(supplement);
    lines.push('');
  }

  const exhibitReference = exhibitReferenceText(values.exhibitReferenceItems);
  if (exhibitReference) {
    lines.push(exhibitReference);
    lines.push('');
  }

  lines.push('【统一输出约束】');
  lines.push('最终画面不要出现结构示意图中的标注文字、箭头编号、尺寸线、图例、说明标签或乱码文本；如需图文信息，仅以不可读的抽象占位块和清晰版式层级表达。');
  lines.push('不要把提示词中的字段名或设计说明渲染为上墙文字，尤其不要出现“展陈工艺”“版式密度”“工艺配置”“版式备注”等字样，也不要把这些字段后的具体工艺、密度、配置、备注要求当作文案排到墙面上。');
  lines.push('再次强调：优先级顺序只决定工艺版式、色彩材质语言和表现完成度上的偏向，不决定空间结构；无论优先级如何调整，最终空间结构必须完全遵循空间结构示意图。');
  lines.push('保持空间结构逻辑清楚，并把结构示意图的平面关系、动线、分区、展墙/隔断、入口出口和主要体块转译为真实透视空间；融合色彩与材质参考/预设的材料语言与工艺版式，输出干净完整的高品质展陈空间效果图。');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
