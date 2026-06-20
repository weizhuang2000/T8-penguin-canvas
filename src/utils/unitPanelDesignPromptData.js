export const UNIT_PANEL_LANGUAGES = [
  { id: 'zh', label: '中文', promptName: 'Chinese' },
  { id: 'en', label: 'English', promptName: 'English' },
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
    totalWidth: num(source.totalWidth),
    totalHeight: num(source.totalHeight),
    panelWidth: num(source.panelWidth),
    panelHeight: num(source.panelHeight),
    panelCount: Math.max(0, Math.min(99, count)),
    gap: num(source.gap),
    thickness: num(source.thickness),
  };
}

export function unitPanelDimensionsText(value) {
  const d = normalizeUnitPanelDimensions(value);
  const parts = [];
  if (d.totalWidth || d.totalHeight) parts.push(`overall ${d.totalWidth || '?'} mm W x ${d.totalHeight || '?'} mm H`);
  if (d.panelWidth || d.panelHeight) parts.push(`single panel ${d.panelWidth || '?'} mm W x ${d.panelHeight || '?'} mm H`);
  if (d.panelCount) parts.push(`${d.panelCount} panels`);
  if (d.gap) parts.push(`${d.gap} mm gaps`);
  if (d.thickness) parts.push(`${d.thickness} mm thickness`);
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
    description && `description: ${description}`,
    texture && `texture: ${texture}`,
    usage && `usage: ${usage}`,
  ].filter(Boolean).join(' / ');
}

export function unitPanelMaterialsText(primaryMaterial, secondaryMaterials = []) {
  const primary = materialText(primaryMaterial);
  const secondary = (Array.isArray(secondaryMaterials) ? secondaryMaterials : [])
    .map(materialText)
    .filter(Boolean);
  const lines = [];
  if (primary) lines.push(`Primary material: ${primary}`);
  if (secondary.length) lines.push(`Secondary materials: ${secondary.join(' | ')}`);
  return lines.join('\n');
}

function translationLine(id, translations = {}, titleText = '', bodyText = '') {
  const meta = languageMeta(id);
  const t = translations && typeof translations === 'object' ? translations[id] : null;
  const title = cleanUnitPanelText(t?.title || (id === 'zh' ? titleText : ''), 500);
  const body = cleanUnitPanelText(t?.body || (id === 'zh' ? bodyText : ''), 2000);
  return `${meta.label} (${meta.promptName}): title="${title || '[translate title]'}"; body="${body || '[translate body]'}"`;
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
  const splitDesignEnabled = values.splitDesignEnabled !== false;
  const dimensionMarksEnabled = values.dimensionMarksEnabled === true;
  const titleFont = unitPanelTitleFontMeta(values.titleFont);
  const bodyFont = unitPanelBodyFontMeta(values.bodyFont);
  const translations = values.translations && typeof values.translations === 'object' ? values.translations : {};
  const languageLines = languages.map((id) => translationLine(id, translations, titleText, bodyText));
  const materialPriority = [
    materials && `1. Follow selected materials first:\n${materials}`,
    colorMaterialReferenceTone && `2. Then follow dominant tone from color/material reference image: ${colorMaterialReferenceTone}`,
    colorMaterialPresetText && `3. Then use shared color/material preset only as supporting color system and atmosphere: ${colorMaterialPresetText}`,
    manualColorMaterial && `4. Last fallback manual color/material note: ${manualColorMaterial}`,
  ].filter(Boolean).join('\n');
  const layoutMode = outputMode === 'single'
    ? 'single unit panel design, one complete panel elevation'
    : 'complete set of unit panels, multiple coordinated panel elevations shown together like a design board';
  const splitText = splitDesignEnabled
    ? 'Split-panel design is ON: panels must be visibly separated into independent boards/modules with clear gaps, individual edges, separable construction logic, and modular alignment.'
    : 'Split-panel design is OFF: create a continuous integrated panel surface with unified background, no unnecessary separation seams, and one coherent wall-board composition.';
  const dimensionText = dimensionMarksEnabled
    ? `Dimension marks ON: include clean red engineering dimension lines and mm labels. ${dimensions || 'Use believable mm dimensions and mark key width/height/gap relationships.'}`
    : `Dimension marks OFF: do not draw dimension lines, red measuring labels, rulers, or engineering annotation marks. ${dimensions ? `Still respect these dimensions silently: ${dimensions}.` : ''}`;
  return [
    'Use case: museum-exhibition-unit-panel-design',
    `Asset type: ${layoutMode}`,
    `Primary request: Generate a professional exhibition unit panel design similar to a finished elevation presentation, with dark/neutral background, refined panel blocks, readable hierarchy, and high-end cultural display materiality.`,
    projectTheme ? `Project theme: ${projectTheme}` : '',
    `Panel mode: ${outputMode === 'single' ? 'single panel' : 'full panel set'}`,
    splitText,
    dimensionText,
    `Title typography: ${titleFont.label}; ${titleFont.prompt}.`,
    `Body typography: ${bodyFont.label}; ${bodyFont.prompt}.`,
    `Text hierarchy: title text is the first visual level; explanatory body text is the second visual level; keep body text in organized blocks, avoid random illegible filler.`,
    'Multilingual order and exact content:',
    languageLines.join('\n'),
    materialPriority ? `Material priority, highest to lowest:\n${materialPriority}` : 'Material priority: use restrained museum-grade panel materials, low-reflection surfaces, metal trims, textured backing, and warm focused lighting.',
    values.hasColorMaterialReferenceImage ? 'Input image role: the color/material reference image is only for palette, texture, finish, light reflection and mood; do not copy its layout as panel structure.' : '',
    'Composition: show panel elevations frontally or with slight presentation perspective; keep complete panel outlines visible; include title zones, text zones, image/texture zones, base strips and optional decorative cultural motifs.',
    'Quality constraints: no people, no messy room scene, no warped typography, no random brand logos, no broken unreadable text, no cluttered unrelated props; final result must look like a professional exhibition construction presentation rendering.',
    'Avoid: people, unreadable text, wrong characters, broken typography, extra logos, chaotic poster collage, low-resolution blur, excessive saturation.',
  ].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
