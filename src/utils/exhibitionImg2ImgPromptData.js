import { ELEVATION_CRAFTS } from './elevationPromptData.js';

export const EXHIBITION_IMG2IMG_PRIORITY = [
  { id: 'structureAnnotations', label: '空间结构示意图标注' },
  { id: 'craftLayout', label: '工艺与版式' },
  { id: 'styleImageForm', label: '输入效果图形式' },
];

export const DEFAULT_EXHIBITION_IMG2IMG_PRIORITY = [
  'structureAnnotations',
  'craftLayout',
  'styleImageForm',
];

const PRIORITY_IDS = new Set(EXHIBITION_IMG2IMG_PRIORITY.map((item) => item.id));

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function normalizeExhibitionImg2ImgPriority(value) {
  const out = [];
  const list = Array.isArray(value) ? value : [];
  for (const item of list) {
    const id = String(item || '').trim();
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

function referenceRoleText(priorityOrder) {
  const imageRoles = priorityOrder.filter((id) => id === 'structureAnnotations' || id === 'styleImageForm');
  const structureIndex = imageRoles.indexOf('structureAnnotations') + 1;
  const styleIndex = imageRoles.indexOf('styleImageForm') + 1;
  return [
    `参考图角色说明：第 ${structureIndex || 1} 张参考图是空间结构示意图，是空间几何、布局和动线的主约束；第 ${styleIndex || 2} 张参考图是空间表现效果图，只用于提取表现形式、氛围、材质和渲染完成度。`,
    '生成时必须先从空间结构示意图提取干净的空间骨架，再把效果图的表现语言套用到该骨架上；不要直接沿用效果图原本的平面布局、墙体位置或动线来替代结构图。',
  ].join('\n');
}

function sectionText(id, values) {
  if (id === 'structureAnnotations') {
    return [
      '优先理解空间结构示意图：它不是普通参考图，而是最终画面的空间骨架和布局蓝本。必须保留平面/轴测结构关系、主要体块比例、展墙/隔断位置、通道宽窄、动线走向、分区边界、入口出口、重点节点、开敞/封闭关系和尺度逻辑。',
      '输出画面应能一眼看出与结构示意图具有相同的空间关系：主要墙体和展陈体块的位置相对一致，通行动线和视线组织一致，分区数量与前后左右关系一致，不能只借鉴风格而改成另一套空间。',
      '结构图上的文字、箭头编号、尺寸标注、说明标签仅作为理解空间关系的参考，不要在最终效果图中渲染、复写、临摹或生成任何可读文字、编号、箭头说明、尺寸线和标签。',
    ].join('\n');
  }
  if (id === 'styleImageForm') {
    return [
      '参考输入效果图的空间表现形式：借鉴整体视觉气质、透视角度、光影氛围、材质表达、画面完成度和展陈空间摄影感。',
      '效果图只提供表现语言，不覆盖结构示意图中的空间关系和动线约束；如果效果图的墙体、展台、入口、分区与结构图冲突，以结构图为准。',
    ].join('\n');
  }
  const crafts = craftText(values.selectedCrafts, values.customCraft, values.craftPresets);
  const lines = ['根据工艺与版式要求深化展陈设计。'];
  if (crafts) lines.push(`展陈工艺：${crafts}`);
  lines.push(`版式密度：${cleanText(values.density || '适中，图文层级均衡，主次分明')}`);
  if (cleanText(values.dimensions)) lines.push(`空间/画面尺寸：${cleanText(values.dimensions)}`);
  if (cleanText(values.colorMaterial)) lines.push(`色彩与材质：${cleanText(values.colorMaterial)}`);
  if (cleanText(values.visualStyle)) lines.push(`视觉风格：${cleanText(values.visualStyle)}`);
  return lines.join('\n');
}

export function buildExhibitionImg2ImgPrompt(values = {}) {
  const priorityOrder = normalizeExhibitionImg2ImgPriority(values.priorityOrder);
  const lines = [
    '生成一张专业展陈空间图生图效果图，面向深化设计汇报，真实室内建筑摄影级渲染，空间尺度可信，材质细节清晰，灯光层次准确。',
    `优先级顺序：${priorityOrder.map((id, index) => {
      const meta = EXHIBITION_IMG2IMG_PRIORITY.find((item) => item.id === id);
      return `${index + 1}. ${meta?.label || id}`;
    }).join(' > ')}`,
    referenceRoleText(priorityOrder),
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

  lines.push('【统一输出约束】');
  lines.push('最终画面不要出现结构示意图中的标注文字、箭头编号、尺寸线、图例、说明标签或乱码文本；如需图文信息，仅以不可读的抽象占位块和清晰版式层级表达。');
  lines.push('保持空间结构逻辑清楚，并把结构示意图的平面关系、动线、分区、展墙/隔断、入口出口和主要体块转译为真实透视空间；融合效果图的表现气质与工艺版式，输出干净完整的高品质展陈空间效果图。');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
