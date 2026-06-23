export const EXHIBITION_RECOLOR_DEFAULT_COLORS = {
  primaryColor: '#1f5f8b',
  secondaryColor: '#c7a76c',
  accentColor: '#e94b35',
};

export const EXHIBITION_RECOLOR_EXCLUDE_ITEMS = [
  { id: 'exhibit', label: '展品' },
  { id: 'sand-table', label: '沙盘' },
  { id: 'sculpture', label: '雕塑' },
  { id: 'relic', label: '文物' },
  { id: 'artwork', label: '艺术品' },
  { id: 'model', label: '模型' },
  { id: 'description-text', label: '说明文字' },
  { id: 'brand-signage', label: '品牌/标识' },
].map((item, index) => ({ ...item, order: index }));

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function normalizeExhibitionRecolorColor(value, fallback = '#000000') {
  const text = cleanText(value, 32);
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
  }
  return normalizeExhibitionRecolorColor(fallback, '#000000');
}

export function normalizeExhibitionRecolorBrightness(value) {
  const number = Math.round(Number(value) || 0);
  return Math.max(-50, Math.min(50, number));
}

export function normalizeExhibitionRecolorExcludeItems(value, options = EXHIBITION_RECOLOR_EXCLUDE_ITEMS) {
  const source = Array.isArray(options) && options.length > 0 ? options : EXHIBITION_RECOLOR_EXCLUDE_ITEMS;
  const labelsById = new Map(source.map((item) => [String(item.id), cleanText(item.label || item.id, 120)]));
  const ids = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return Array.from(new Set(ids.filter((id) => labelsById.has(id)))).map((id) => ({
    id,
    label: labelsById.get(id) || id,
  }));
}

export function exhibitionRecolorExcludeItemsText(value, options = EXHIBITION_RECOLOR_EXCLUDE_ITEMS) {
  const labels = normalizeExhibitionRecolorExcludeItems(value, options).map((item) => item.label).filter(Boolean);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return labels.join('和');
  return `${labels.slice(0, -1).join('、')}和${labels[labels.length - 1]}`;
}

function brightnessText(value) {
  const brightness = normalizeExhibitionRecolorBrightness(value);
  if (brightness === 0) return '保持原图整体明暗关系，仅随新色调做自然匹配';
  if (brightness > 0) return `整体明暗度提高 ${brightness}%，保持高光不过曝、暗部仍有细节`;
  return `整体明暗度降低 ${Math.abs(brightness)}%，保持展品和空间细节可辨识`;
}

export function buildExhibitionRecolorPrompt(values = {}) {
  const primaryColor = normalizeExhibitionRecolorColor(values.primaryColor, EXHIBITION_RECOLOR_DEFAULT_COLORS.primaryColor);
  const secondaryColor = normalizeExhibitionRecolorColor(values.secondaryColor, EXHIBITION_RECOLOR_DEFAULT_COLORS.secondaryColor);
  const accentColor = normalizeExhibitionRecolorColor(values.accentColor, EXHIBITION_RECOLOR_DEFAULT_COLORS.accentColor);
  const protectPresetText = exhibitionRecolorExcludeItemsText(values.excludeItems, values.excludeItemOptions);
  const manualExclusions = cleanText(values.manualExclusions, 1000);
  const protectionText = [protectPresetText, manualExclusions].filter(Boolean).join('、');
  const lines = [
    '任务：对一张既有展陈空间图像进行主色调更换，输出真实、可落地的展陈空间效果图。',
    '',
    '原始图像是唯一结构来源。必须保持原图的空间结构、构图、视角、镜头高度、透视关系、比例尺度、展陈动线、灯具位置、展墙、展柜、展台、导视、文字区域和所有细节关系不变。',
    '',
    `新色调：主色调 ${primaryColor}；辅助色调 ${secondaryColor}；点缀色 ${accentColor}。`,
    `明暗度调整：${brightnessText(values.brightness)}。`,
    '',
    '允许改变：展陈环境中的墙面、地面、背景板、装饰面、局部灯光氛围、导视色块、标题字背景、收边构件和非保护对象周边环境的色彩倾向与明暗关系。',
    '',
    '禁止改变：除颜色和整体明暗度之外，不改变任何形态、数量、位置、尺寸、材质纹理、文字内容、标识排版、图像内容、展陈手段、空间结构或摄影构图。',
  ];
  if (protectionText) {
    lines.push(
      '',
      `保护排除项：${protectionText}。这些对象在调色时不要改变，必须保持原有颜色、材质、形态、数量、位置、尺寸、展示重点和可识别细节。`,
    );
  }
  lines.push(
    '',
    '文字与标识约束：保留原图文字和标识所在区域、层级和排版关系；不要生成新的可读文字，不要改写原有文字，不要把提示词字段渲染到画面里。',
    '',
    '最终输出：画面必须一眼可识别为同一张原始展陈空间图，只在主色调、辅助色调、点缀色和明暗度上完成换色。',
  );
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
