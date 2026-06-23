export const EXHIBITION_LIGHTING_HEATMAP_MODES = [
  { id: 'overlay', label: '覆盖层图' },
  { id: 'technical', label: '独立分析图' },
];

const MODE_IDS = new Set(EXHIBITION_LIGHTING_HEATMAP_MODES.map((item) => item.id));

export const EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS = [
  { id: 'uniformity', label: '整体均匀度' },
  { id: 'accent-lighting', label: '重点照明' },
  { id: 'glare-risk', label: '眩光风险' },
  { id: 'dark-zones', label: '暗区识别' },
].map((item, index) => ({ ...item, order: index }));

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function normalizeExhibitionLightingHeatmapMode(value) {
  const text = cleanText(value, 40);
  return MODE_IDS.has(text) ? text : 'overlay';
}

export function normalizeExhibitionLightingHeatmapFocusItems(value) {
  const ids = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS.map((item) => item.id);
  const allowed = new Set(EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS.map((item) => item.id));
  const unique = Array.from(new Set(ids.filter((id) => allowed.has(id))));
  return unique.length > 0 ? unique : EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS.map((item) => item.id);
}

function focusText(value) {
  const ids = normalizeExhibitionLightingHeatmapFocusItems(value);
  return EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS
    .filter((item) => ids.includes(item.id))
    .map((item) => item.label)
    .join('、');
}

export function buildExhibitionLightingHeatmapPrompt(values = {}) {
  const mode = normalizeExhibitionLightingHeatmapMode(values.mode);
  const supplement = cleanText(values.supplement, 1200);
  const focus = focusText(values.focusItems);
  const modeLines = mode === 'technical'
    ? [
        '输出模式：独立分析图。',
        '请生成一张独立伪彩色灯光热力分析图，弱化原图材质和装饰纹理，但保留原图空间轮廓、墙面边界、展柜/展台位置、灯具位置、展品区域、动线与透视关系。',
        '画面应像专业照明分析图：使用蓝/青/绿/黄/橙/红连续热力色表达照度强弱，清楚呈现光源分布、热区、暗区、照度分区、可读的等照度关系和简洁色标图例。',
      ]
    : [
        '输出模式：覆盖层图。',
        '请保留原图的空间结构、材质可识别性、透视、构图和展陈对象，在原图上叠加半透明灯光热力覆盖层。',
        '热力覆盖应使用蓝/青/绿/黄/橙/红连续色带表达照度强弱，让高照度区、低照度区、局部过亮和阴影区域一眼可读，并加入简洁色标图例。',
      ];

  const lines = [
    '任务：根据输入的展陈空间图像，生成一张灯光热力分析图，用于判断展陈照明的强弱分布、视觉重点和潜在照明问题。',
    '',
    '输入图像是唯一空间依据。必须严格保持原图空间结构、镜头视角、透视比例、墙体/地面/顶面关系、展柜/展台/展品数量、灯具位置、文字区域、导视区域和构图关系。',
    '',
    ...modeLines,
    '',
    `分析重点：${focus}。`,
    '重点说明：整体均匀度要表现空间明暗分布是否平衡；重点照明要突出展品、展项、标题墙和视觉焦点；眩光风险要用高亮热区提示可能过曝或直射的位置；暗区识别要标出参观视线或展品附近照度不足的区域。',
    '',
    '图例与标注约束：只允许出现简洁的热力色标、箭头/圈选、少量照明分析标签，例如 High / Medium / Low、Glare risk、Dark zone。不要生成大段说明文字，不要改写原图中文字，不要把提示词字段或参数渲染到画面中。',
    '',
    '禁止改变：不要新增或删除灯具、展品、展柜、墙体、门洞、文字区、屏幕、装置或人物；不要改变建筑结构、展陈平面关系、尺寸比例、镜头高度或空间动线；不要把热力图做成抽象海报。',
    '',
    '最终效果：画面应明确呈现展陈空间的光照热力分布，既能用于视觉汇报，也能辅助判断灯光均匀度、重点照明、眩光风险和暗区问题。',
  ];

  if (supplement) {
    lines.push('', `补充要求：${supplement}`);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
