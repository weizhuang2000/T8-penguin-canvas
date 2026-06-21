const DEFAULT_SHOWCASE_STYLE = {
  widthMm: 1200,
  baseHeightMm: 300,
  glassHeightMm: 1400,
  capHeightMm: 180,
  hasCap: true,
};

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeNumber(value, fallback = 0, min = 0, max = 999999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

export function normalizeShowcaseStyle(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    widthMm: normalizeNumber(source.widthMm ?? source.width ?? source.showcaseWidth, DEFAULT_SHOWCASE_STYLE.widthMm),
    baseHeightMm: normalizeNumber(source.baseHeightMm ?? source.baseHeight, DEFAULT_SHOWCASE_STYLE.baseHeightMm),
    glassHeightMm: normalizeNumber(source.glassHeightMm ?? source.glassHeight, DEFAULT_SHOWCASE_STYLE.glassHeightMm),
    capHeightMm: normalizeNumber(source.capHeightMm ?? source.capHeight, DEFAULT_SHOWCASE_STYLE.capHeightMm),
    hasCap: source.hasCap !== false,
  };
}

export function normalizeShowcaseExhibitItems(value = []) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const url = cleanText(item?.url || item?.imageUrl || '', 1000);
      const label = cleanText(item?.label || item?.name || `展品 ${index + 1}`, 80);
      const maxSideMm = normalizeNumber(item?.maxSideMm ?? item?.longestSideMm ?? item?.sizeMm, 300, 1, 99999);
      if (!url && !label) return null;
      return { url, label: label || `展品 ${index + 1}`, maxSideMm };
    })
    .filter(Boolean);
}

export function colorMaterialTextFromPreset(preset) {
  if (!preset) return '';
  return [preset.core, preset.features, preset.usage, preset.info]
    .map((item) => cleanText(item, 1200))
    .filter(Boolean)
    .join('；');
}

function showcaseStyleText(style) {
  const s = normalizeShowcaseStyle(style);
  const totalHeight = s.baseHeightMm + s.glassHeightMm + (s.hasCap ? s.capHeightMm : 0);
  const capText = s.hasCap
    ? `有柜帽，柜帽高度 ${s.capHeightMm} mm`
    : `无柜帽，不生成柜帽结构，柜帽高度参数 ${s.capHeightMm} mm 仅作为关闭状态记录`;
  return [
    `展柜宽度：${s.widthMm} mm`,
    `底座高度：${s.baseHeightMm} mm`,
    `玻璃区高度：${s.glassHeightMm} mm`,
    capText,
    `推导总高度：${totalHeight} mm`,
  ].join('\n');
}

function exhibitItemsText(items) {
  const normalized = normalizeShowcaseExhibitItems(items);
  if (!normalized.length) {
    return [
      '未接入展品图时，生成抽象展品占位体块，但仍要遵守真实博物馆展柜陈列尺度。',
      '展品应有托架、支撑、低反射保护、重点照明和清晰的柜内层次，不要生成可读说明文字。',
    ].join('\n');
  }
  const lines = [
    '普通 image 输入均视为展品图，只用于提取展品外观、体量、轮廓、材质和摆放重点，不作为色彩材质风格参考。',
  ];
  normalized.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.label}：最长边 ${item.maxSideMm} mm；参考图 URL：${item.url || '[上游展品图]'}`);
  });
  lines.push('所有展品必须按上述最长边形成相对比例，不能把小件展品放大成主体装置，也不能把大件展品压缩成摆件。');
  return lines.join('\n');
}

function colorMaterialText(values) {
  const presetText = cleanText(values.colorMaterialPresetText || values.colorMaterial, 1800);
  const manualText = cleanText(values.manualColorMaterial ?? values.colorMaterialManual ?? values.manualColorMaterialText, 1600);
  const referenceTone = cleanText(values.colorMaterialReferenceTone, 800);
  const hasReference = values.hasColorMaterialReferenceImage === true;
  const lines = [];
  if (hasReference) {
    lines.push('色彩与材质参考图使用独立 color-material-reference 输入，只用于提取柜内背景、底座、背板、托架、灯光、金属/亚克力/玻璃等材质语言，不得当作展品图，也不得改变展品本身外观。');
    if (referenceTone) lines.push(`参考图主色调：${referenceTone}`);
  }
  if (presetText && !hasReference) {
    lines.push(`共享色彩与材质预设：${presetText}`);
  } else if (presetText && hasReference) {
    lines.push(`共享色彩与材质预设作为次级补充：${presetText}`);
  }
  if (manualText) lines.push(`手动色彩与材质补充：${manualText}`);
  if (!lines.length) {
    lines.push('未指定色彩材质时，采用克制、低反射、博物馆级、可落地施工的柜内设计材质体系。');
  }
  return lines.join('\n');
}

function outputRequirementText(values) {
  const dimensionMarksEnabled = values.dimensionMarksEnabled === true;
  const explodedViewEnabled = values.explodedViewEnabled === true;
  return [
    dimensionMarksEnabled
      ? '尺寸标注：开启。输出中可加入清晰的工程尺寸标注、毫米单位和关键高度/宽度标注，但文字必须简洁、整洁、像方案图标注。'
      : '尺寸标注：关闭。不要绘制尺寸线、毫米数字、红色测量标注、工程尺或标注符号，但仍要按给定尺寸比例生成。',
    explodedViewEnabled
      ? '分解爆炸图：开启。输出应表现柜体、玻璃罩、底座、柜帽、托架、展品、灯光组件的分解关系，可用轻微错位或爆炸图形式展示结构层级。'
      : '分解爆炸图：关闭。输出应为完整组装后的柜内陈列效果图，不要把柜体构件拆散漂浮。',
  ].join('\n');
}

export function buildShowcaseInteriorDesignPrompt(values = {}) {
  const supplement = cleanText(values.supplement, 3000);
  const lines = [
    '用途：博物馆 / 展陈柜内设计图生成。',
    '',
    '核心任务：根据展柜尺寸、展品参考图和柜内形式设计风格，生成一张专业、真实、可落地的展柜内部陈列设计效果图。',
    '',
    '1. 展柜样式与尺寸',
    showcaseStyleText(values.showcaseStyle || values.dimensions || values),
    '',
    '比例要求：展柜宽度、底座高度、玻璃区高度、柜帽高度必须形成可信比例；玻璃区应是主要陈列空间，底座承托稳定，柜帽仅在开启时出现。',
    '',
    '2. 展品输入与尺寸',
    exhibitItemsText(values.exhibitItems),
    '',
    '3. 柜内形式设计风格',
    colorMaterialText(values),
    '',
    '柜内设计要求：结合背板、台座、托架、微型展台、层板、暗藏灯带、重点射灯、低反射玻璃、展品保护距离和视觉焦点组织展品。设计应像真实展陈深化方案，而不是普通商品橱窗。',
    '',
    '4. 输出形式要求',
    outputRequirementText(values),
    '',
    '5. 画面质量约束',
    '生成高完成度展陈设计效果图；结构清晰、玻璃通透、材质真实、灯光有层次、展品尺度可信。',
    '不要生成随机品牌 logo、无关人物、杂乱商店橱窗、低清模糊、错误文字、不可读乱码说明牌或与展品无关的装饰堆砌。',
  ];
  if (supplement) {
    lines.push('', '6. 补充要求', supplement);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

