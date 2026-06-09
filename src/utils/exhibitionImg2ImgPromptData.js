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

function sectionText(id, values) {
  if (id === 'structureAnnotations') {
    return [
      '优先理解空间结构示意图：保留平面/轴测结构关系、主要体块、展墙位置、动线、分区、入口出口、重点节点和尺度逻辑。',
      '结构图上的文字、箭头编号、尺寸标注、说明标签仅作为理解空间关系的参考，不要在最终效果图中渲染、复写、临摹或生成任何可读文字、编号、箭头说明、尺寸线和标签。',
    ].join('\n');
  }
  if (id === 'styleImageForm') {
    return [
      '参考输入效果图的空间表现形式：借鉴整体视觉气质、透视角度、光影氛围、材质表达、画面完成度和展陈空间摄影感。',
      '效果图只提供表现语言，不覆盖结构示意图中的空间关系和动线约束。',
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
  lines.push('保持空间结构逻辑清楚，融合效果图的表现气质与工艺版式，输出干净完整的高品质展陈空间效果图。');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
