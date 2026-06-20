export const UNIT_PANEL_LANGUAGES = [
  { id: 'zh', label: '中文', promptName: 'Chinese' },
  { id: 'en', label: 'English', promptName: 'English' },
  { id: 'mn-trad', label: '内蒙文（传统蒙古语）', promptName: 'Traditional Mongolian used in Inner Mongolia' },
  { id: 'mn', label: '蒙古文', promptName: 'Mongolian' },
  { id: 'ja', label: '日本語', promptName: 'Japanese' },
  { id: 'ko', label: '한국어', promptName: 'Korean' },
  { id: 'fr', label: 'Français', promptName: 'French' },
  { id: 'de', label: 'Deutsch', promptName: 'German' },
  { id: 'es', label: 'Español', promptName: 'Spanish' },
  { id: 'ru', label: 'Русский', promptName: 'Russian' },
  { id: 'ar', label: 'العربية', promptName: 'Arabic' },
];

export const UNIT_PANEL_TITLE_FONTS = [
  { id: 'heavy-heiti', label: '厚重黑体', prompt: 'bold heavyweight Chinese sans-serif, monumental exhibition title lettering' },
  { id: 'metal-black', label: '金属黑体', prompt: 'metallic bold blackletter-inspired Chinese display type, precise beveled edges' },
  { id: 'song-display', label: '宋体标题', prompt: 'elegant Songti-style display typography, cultural and refined' },
  { id: 'calligraphy', label: '书法标题', prompt: 'restrained calligraphic title lettering, carved or raised material finish' },
  { id: 'modern-sans', label: '现代无衬线', prompt: 'modern geometric sans-serif title typography, clean museum visual identity' },
];

export const UNIT_PANEL_BODY_FONTS = [
  { id: 'fangzheng-dahei', label: '方正大黑简体', prompt: 'clear FangZheng DaHei style simplified Chinese body text, highly legible' },
  { id: 'heiti', label: '黑体', prompt: 'standard Chinese Heiti sans-serif body text, clean and readable' },
  { id: 'songti', label: '宋体', prompt: 'Songti serif body text, cultural editorial tone' },
  { id: 'noto-sans', label: 'Noto Sans', prompt: 'Noto Sans multilingual body typography, consistent cross-language hierarchy' },
  { id: 'system-sans', label: '系统无衬线', prompt: 'neutral system sans-serif body typography, compact and legible' },
];

const LANGUAGE_IDS = new Set(UNIT_PANEL_LANGUAGES.map((item) => item.id));
const TITLE_FONT_IDS = new Set(UNIT_PANEL_TITLE_FONTS.map((item) => item.id));
const BODY_FONT_IDS = new Set(UNIT_PANEL_BODY_FONTS.map((item) => item.id));

export function cleanUnitPanelText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function normalizeUnitPanelOutputMode(value) {
  return value === 'single' ? 'single' : 'set';
}

export function normalizeUnitPanelLanguages(value) {
  const source = Array.isArray(value) ? value : ['zh', 'en'];
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    const id = typeof raw === 'string' ? raw : raw?.id;
    const text = String(id || '').trim();
    if (!LANGUAGE_IDS.has(text) || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.length ? out : ['zh', 'en'];
}

export function languageMeta(id) {
  const key = String(id || '').trim();
  return UNIT_PANEL_LANGUAGES.find((item) => item.id === key) || UNIT_PANEL_LANGUAGES[0];
}

export function normalizeUnitPanelTitleFont(value) {
  const id = String(value || '').trim();
  return TITLE_FONT_IDS.has(id) ? id : 'heavy-heiti';
}

export function normalizeUnitPanelBodyFont(value) {
  const id = String(value || '').trim();
  return BODY_FONT_IDS.has(id) ? id : 'fangzheng-dahei';
}

export function unitPanelTitleFontMeta(value) {
  const id = normalizeUnitPanelTitleFont(value);
  return UNIT_PANEL_TITLE_FONTS.find((item) => item.id === id) || UNIT_PANEL_TITLE_FONTS[0];
}

export function unitPanelBodyFontMeta(value) {
  const id = normalizeUnitPanelBodyFont(value);
  return UNIT_PANEL_BODY_FONTS.find((item) => item.id === id) || UNIT_PANEL_BODY_FONTS[0];
}

export function normalizeUnitPanelDimensions(value) {
  const source = value && typeof value === 'object' ? value : {};
  const num = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  };
  const count = Math.floor(Number(source.panelCount) || 0);
  return {
    panelWidth: num(source.panelWidth),
    panelHeight: num(source.panelHeight),
    panelCount: Math.max(0, Math.min(99, count)),
    gap: num(source.gap),
    thickness: num(source.thickness),
  };
}

export function normalizeUnitPanelTextLayoutBounds(value) {
  const source = value && typeof value === 'object' ? value : {};
  const num = (raw, fallback) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.round(Math.min(10, n) * 100) / 100;
  };
  const a = num(source.upperMeters ?? source.upper ?? source.maxMeters, 2.2);
  const b = num(source.lowerMeters ?? source.lower ?? source.minMeters, 0.8);
  return {
    lowerMeters: Math.min(a, b),
    upperMeters: Math.max(a, b),
  };
}

export function unitPanelDimensionsText(value) {
  const d = normalizeUnitPanelDimensions(value);
  const parts = [];
  if (d.panelWidth || d.panelHeight) parts.push(`单块板宽 ${d.panelWidth || '?'} mm x 高 ${d.panelHeight || '?'} mm`);
  if (d.panelCount) parts.push(`共 ${d.panelCount} 块单元板`);
  if (d.gap) parts.push(`板间距 ${d.gap} mm`);
  if (d.panelWidth && d.panelCount) {
    const gapTotal = d.gap && d.panelCount > 1 ? d.gap * (d.panelCount - 1) : 0;
    const totalWidth = (d.panelWidth * d.panelCount) + gapTotal;
    parts.push(`推导总宽 ${totalWidth} mm（单板宽 x 板数 + 板间距总和）`);
  }
  if (d.panelHeight) parts.push(`总高等于单板高 ${d.panelHeight} mm`);
  if (d.thickness) parts.push(`厚度 ${d.thickness} mm`);
  return parts.join('; ');
}

function materialText(item) {
  if (!item) return '';
  const label = cleanUnitPanelText(item.label, 120);
  const description = cleanUnitPanelText(item.description, 500);
  const texture = cleanUnitPanelText(item.texture, 500);
  const usage = cleanUnitPanelText(item.usage, 500);
  return [
    label,
    description && `说明：${description}`,
    texture && `肌理：${texture}`,
    usage && `用途：${usage}`,
  ].filter(Boolean).join(' / ');
}

export function unitPanelMaterialsText(primaryMaterial, secondaryMaterials = []) {
  const primary = materialText(primaryMaterial);
  const secondary = (Array.isArray(secondaryMaterials) ? secondaryMaterials : [])
    .map(materialText)
    .filter(Boolean);
  const lines = [];
  if (primary) lines.push(`主材质：${primary}`);
  if (secondary.length) lines.push(`辅助材质：${secondary.join(' | ')}`);
  return lines.join('\n');
}

function translationLine(id, translations = {}, titleText = '', bodyText = '') {
  const meta = languageMeta(id);
  const t = translations && typeof translations === 'object' ? translations[id] : null;
  const title = cleanUnitPanelText(t?.title || (id === 'zh' ? titleText : ''), 500);
  const body = cleanUnitPanelText(t?.body || (id === 'zh' ? bodyText : ''), 2000);
  return `${meta.label}（${meta.promptName}）：标题字="${title || '[待翻译标题]'}"；说明文字="${body || '[待翻译说明]'}"`;
}

export function buildUnitPanelExtractPrompt(values = {}) {
  const sourceText = cleanUnitPanelText(values.sourceText, 50000);
  const projectTheme = cleanUnitPanelText(values.projectTheme, 500);
  return [
    '请从展陈资料中提炼“单元板设计”所需的两级文字。',
    '输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"titleText":"不超过18个中文字的标题字","bodyText":"120-260个中文字的说明文字"}。',
    'titleText 要适合作为单元板主标题；bodyText 要准确、凝练、适合展板说明，不要编造资料中没有的事实。',
    projectTheme ? `项目主题：${projectTheme}` : '',
    '',
    sourceText,
  ].filter(Boolean).join('\n');
}

export function buildUnitPanelTranslatePrompt(values = {}) {
  const languages = normalizeUnitPanelLanguages(values.languages);
  const titleText = cleanUnitPanelText(values.titleText, 500);
  const bodyText = cleanUnitPanelText(values.bodyText, 4000);
  const languageText = languages.map((id, index) => `${index + 1}. ${languageMeta(id).label} (${languageMeta(id).promptName})`).join('\n');
  return [
    '请把单元板标题字和说明文字翻译成指定语言，并保持展陈说明语气准确、庄重、适合上墙。',
    '输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"translations":{"zh":{"title":"...","body":"..."},"en":{"title":"...","body":"..."}}}，key 必须使用给定语言 id。',
    '中文可润色但不要改变事实；英文和其他语言要简洁，不要逐字生硬翻译。',
    '语言顺序：',
    languageText,
    '',
    `标题字：${titleText}`,
    `说明文字：${bodyText}`,
  ].join('\n');
}

export function parseUnitPanelExtractJson(text) {
  const raw = cleanUnitPanelText(text, 12000).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    return {
      titleText: cleanUnitPanelText(parsed?.titleText || parsed?.title || '', 500),
      bodyText: cleanUnitPanelText(parsed?.bodyText || parsed?.body || parsed?.description || '', 4000),
    };
  } catch {
    const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return {
      titleText: cleanUnitPanelText(lines[0] || '', 500),
      bodyText: cleanUnitPanelText(lines.slice(1).join('\n') || raw, 4000),
    };
  }
}

export function parseUnitPanelTranslateJson(text, languages = ['zh', 'en']) {
  const ids = normalizeUnitPanelLanguages(languages);
  const raw = cleanUnitPanelText(text, 20000).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    const source = parsed?.translations && typeof parsed.translations === 'object' ? parsed.translations : parsed;
    const out = {};
    for (const id of ids) {
      const item = source?.[id] || {};
      out[id] = {
        title: cleanUnitPanelText(item.title || item.titleText || '', 500),
        body: cleanUnitPanelText(item.body || item.bodyText || '', 4000),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function buildUnitPanelImagePrompt(values = {}) {
  const outputMode = normalizeUnitPanelOutputMode(values.outputMode);
  const languages = normalizeUnitPanelLanguages(values.languages);
  const titleText = cleanUnitPanelText(values.titleText, 500);
  const bodyText = cleanUnitPanelText(values.bodyText, 4000);
  const projectTheme = cleanUnitPanelText(values.projectTheme, 500);
  const colorMaterialPresetText = cleanUnitPanelText(values.colorMaterialPresetText || values.colorMaterial, 1600);
  const colorMaterialReferenceTone = cleanUnitPanelText(values.colorMaterialReferenceTone, 800);
  const manualColorMaterial = cleanUnitPanelText(values.manualColorMaterial, 1200);
  const materials = unitPanelMaterialsText(values.primaryMaterial, values.secondaryMaterials);
  const dimensions = unitPanelDimensionsText(values.dimensions);
  const textLayoutBounds = normalizeUnitPanelTextLayoutBounds(values.textLayoutBounds);
  const referenceOverridesStyle = values.hasColorMaterialReferenceImage === true;
  const splitDesignEnabled = values.splitDesignEnabled !== false;
  const dimensionMarksEnabled = values.dimensionMarksEnabled === true;
  const imageDisplayEnabled = values.imageDisplayEnabled !== false;
  const specialShapeEnabled = values.specialShapeEnabled === true;
  const titleFont = unitPanelTitleFontMeta(values.titleFont);
  const bodyFont = unitPanelBodyFontMeta(values.bodyFont);
  const translations = values.translations && typeof values.translations === 'object' ? values.translations : {};
  const languageLines = languages.map((id) => translationLine(id, translations, titleText, bodyText));
  const materialPriority = [
    !referenceOverridesStyle && materials && `1. 首先严格执行已选择的主材质和辅助材质：\n${materials}`,
    colorMaterialReferenceTone && `2. 其次参考色彩与材质参考图读取到的主色调：${colorMaterialReferenceTone}`,
    !referenceOverridesStyle && colorMaterialPresetText && `3. 再把共享色彩与材质预设仅作为补充色彩体系和整体质感：${colorMaterialPresetText}`,
    !referenceOverridesStyle && manualColorMaterial && `4. 最后才参考手动色彩材质补充：${manualColorMaterial}`,
  ].filter(Boolean).join('\n');
  const layoutMode = outputMode === 'single'
    ? '单块单元板设计，一张完整的单元板立面图'
    : '整套单元板板式图，多块协调的单元板立面以设计板形式共同呈现';
  const splitText = splitDesignEnabled
    ? '分体设计：开启。画面必须清楚表现多块独立板体/模块，板与板之间有明确缝隙、独立边界、可分离施工逻辑和模块化对齐关系。'
    : '分体设计：关闭。画面应形成连续一体化版面，背景统一，不出现不必要的分割缝，整体是一面连贯的展墙式单元板组合。';
  const dimensionText = dimensionMarksEnabled
    ? `尺寸标注：开启。加入清晰的红色工程尺寸线和 mm 标注。${dimensions || '使用可信的 mm 尺寸，并标注关键宽度、高度、间距关系。'}`
    : `尺寸标注：关闭。不要绘制尺寸线、红色测量数字、尺子或工程标注符号。${dimensions ? `但仍需在画面结构中默默遵循这些尺寸：${dimensions}。` : ''}`;
  const imageDisplayText = imageDisplayEnabled
    ? ''
    : '图片显示：关闭。除抽象背景图、底纹、材质肌理、纹样和非具象装饰以外，禁止显示任何图像照片或具象图片；不要出现人物照片、文物照片、历史场景照片、风景照片、实物插图、摄影图框或照片墙。';
  const textLayoutText = `文字控制区：所有语种的标题字和说明文字主要排版区域都必须位于距离地面 ${textLayoutBounds.lowerMeters} 米到 ${textLayoutBounds.upperMeters} 米之间；中文、英文、内蒙文（传统蒙古语）及其他语种都不要把主要文字放到低于下限或高于上限的位置，辅助纹样、背景和非文字装饰可在控制区外延展。`;
  const proportionText = '比例约束：必须严格按单板宽、单板高、板数和板间距推导真实宽高比绘制；总宽只由单板宽度之和加板间距之和决定，总高等于单板高。禁止把单元板拉伸、压扁、压缩或透视变形，所有板块轮廓、文字区和装饰区都要服从真实尺寸比例。';
  const specialShapeText = specialShapeEnabled
    ? '特殊造型：开启。生成的单元板不能是标准长方形外观，必须在真实尺寸比例的外接框内设计异形轮廓、镂空图案、剪影造型，或将多种方式结合；可使用文化纹样轮廓、城市/历史主题剪影、局部穿孔镂空、阶梯边、弧形边、错落模块边界等。特殊造型不是拉伸变形，不能破坏单板真实宽高比和文字控制区。'
    : '';
  const referenceStyleText = referenceOverridesStyle
    ? '参考图仿制优先：已接入色彩与材质参考图时，材质与字体板块的选择全部不生效。必须以参考图为最高优先级，仿制其材质、色彩、肌理、表面反光、收边方式、字体风格、字重、字号大小、文字比例、文字间距、排版密度和整体视觉气质；不要被节点中选择的主材质、辅助材质、共享色材预设、手动色材、标题字体或说明字体覆盖。'
    : '';
  return [
    '用途：博物馆/展陈单元板设计图生成。',
    `出图类型：${layoutMode}。`,
    '核心要求：生成专业展陈单元板设计图，效果接近完成度高的立面展示方案；画面可使用深色或中性背景，板块精致，文字层级清晰，整体具有高端文化展陈的材质质感。',
    projectTheme ? `项目主题：${projectTheme}` : '',
    `板式模式：${outputMode === 'single' ? '单块单元板' : '整套板式图'}。`,
    splitText,
    dimensionText,
    proportionText,
    specialShapeText,
    imageDisplayText,
    referenceStyleText,
    !referenceOverridesStyle ? `标题字字体：${titleFont.label}；字体风格要求：${titleFont.prompt}。` : '',
    !referenceOverridesStyle ? `说明文字字体：${bodyFont.label}；字体风格要求：${bodyFont.prompt}。` : '',
    '文字层级：标题字是第一视觉层级；说明文字是第二视觉层级；说明文字要组织成清晰文本块，避免随机乱码或不可读填充文字。',
    textLayoutText,
    '多语言顺序与最终文字内容如下，必须按此顺序排版：',
    languageLines.join('\n'),
    materialPriority ? `材质与色彩优先级（从高到低）：\n${materialPriority}` : (referenceOverridesStyle ? '' : '材质与色彩要求：使用克制、博物馆级的展板材料，低反射表面、金属收边、肌理背板和温暖聚焦照明。'),
    referenceOverridesStyle ? '输入参考图作用：色彩与材质参考图用于完整仿制色彩、材质、字体与字号大小；仍需保留单元板设计结构，不要直接复制参考图中的具体文案或无关图像内容。' : '',
    '构图要求：以正立面或轻微展示透视呈现单元板；保持完整板体轮廓可见；包含标题区、文字区、图像/肌理区、底部条带，可加入适度文化纹样装饰。',
    '质量约束：不要人物，不要杂乱房间场景，不要扭曲字体，不要随机品牌 logo，不要破碎不可读文字，不要堆砌无关道具；最终结果必须像专业展陈施工/方案汇报渲染图。',
    '避免内容：人物、不可读文字、错误字符、破碎字体、多余 logo、混乱海报拼贴、低清模糊、过度饱和。',
  ].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
