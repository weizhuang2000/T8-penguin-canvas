const DEFAULT_SHOWCASE_STYLE = {
  widthMm: 1200,
  baseHeightMm: 300,
  glassHeightMm: 1400,
  capHeightMm: 180,
  hasCap: false,
};
const EXHIBIT_RENDER_HEIGHT_SCALE = 0.7;

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeNumber(value, fallback = 0, min = 0, max = 999999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 10) / 10);
}

function textSegments(value) {
  return cleanText(value, 1200)
    .split(/[；;。.\n\r，,、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeShowcaseStyle(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    widthMm: normalizeNumber(source.widthMm ?? source.width ?? source.showcaseWidth, DEFAULT_SHOWCASE_STYLE.widthMm),
    baseHeightMm: normalizeNumber(source.baseHeightMm ?? source.baseHeight, DEFAULT_SHOWCASE_STYLE.baseHeightMm),
    glassHeightMm: normalizeNumber(source.glassHeightMm ?? source.glassHeight, DEFAULT_SHOWCASE_STYLE.glassHeightMm),
    capHeightMm: normalizeNumber(source.capHeightMm ?? source.capHeight, DEFAULT_SHOWCASE_STYLE.capHeightMm),
    hasCap: source.hasCap === true,
  };
}

export function normalizeShowcaseExhibitItems(value = []) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const url = cleanText(item?.url || item?.imageUrl || '', 1000);
      const label = cleanText(item?.label || item?.name || `展品 ${index + 1}`, 80);
      const heightMm = normalizeNumber(item?.heightMm ?? item?.displayHeightMm ?? item?.maxSideMm ?? item?.longestSideMm ?? item?.sizeMm, 300, 1, 99999);
      if (!url && !label) return null;
      return { url, label: label || `展品 ${index + 1}`, heightMm };
    })
    .filter(Boolean);
}

export function normalizeShowcaseManualLayoutItems(value = []) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const url = cleanText(item?.url || item?.imageUrl || '', 1000);
      const label = cleanText(item?.label || item?.name || `展品 ${index + 1}`, 80);
      if (!url && !label) return null;
      return {
        url,
        label: label || `展品 ${index + 1}`,
        xMm: normalizeNumber(item?.xMm ?? item?.x ?? item?.leftMm, 0, 0, 999999),
        yMm: normalizeNumber(item?.yMm ?? item?.y ?? item?.topMm, 0, 0, 999999),
        widthMm: normalizeNumber(item?.widthMm ?? item?.wMm ?? item?.width, 120, 1, 999999),
        heightMm: normalizeNumber(item?.heightMm ?? item?.hMm ?? item?.height, 120, 1, 999999),
        zIndex: Math.round(normalizeNumber(item?.zIndex, index + 1, 0, 999999)),
      };
    })
    .filter(Boolean);
}

export function colorMaterialTextFromPreset(preset) {
  if (!preset) return '';
  const materialKeywords = /(色|颜色|色彩|色调|主色|配色|冷色|暖色|灰|白|黑|金|银|铜|红|蓝|绿|黄|紫|橙|棕|米|材质|材料|质感|肌理|纹理|金属|玻璃|亚克力|木|石|布|织物|皮革|漆|哑光|亮光|磨砂|透明|反射|color|colour|palette|tone|hue|material|texture|metal|glass|acrylic|wood|stone|fabric|leather|matte|gloss|transparent|reflective)/i;
  const forbiddenKeywords = /(图案|纹样|纹饰|花纹|图形|图标|文字|字体|字形|标识|标志|徽标|logo|符号|书法|标题|排版|pattern|motif|ornament|graphic|icon|text|typography|letter|word|signage|symbol|logo|calligraphy)/i;
  return [preset.core, preset.features, preset.usage, preset.info]
    .flatMap(textSegments)
    .filter((item) => materialKeywords.test(item) && !forbiddenKeywords.test(item))
    .join('；');
}

function showcaseStyleText(style) {
  const s = normalizeShowcaseStyle(style);
  const totalHeight = s.baseHeightMm + s.glassHeightMm + (s.hasCap ? s.capHeightMm : 0);
  return [
    `展柜宽度：${s.widthMm} mm`,
    `底座高度：${s.baseHeightMm} mm`,
    `玻璃区高度：${s.glassHeightMm} mm`,
    s.hasCap
      ? `柜帽：开启，柜帽高度 ${s.capHeightMm} mm`
      : `柜帽：关闭。不要生成柜帽结构；柜帽高度 ${s.capHeightMm} mm 仅作为关闭状态记录。`,
    `推导总高度：${totalHeight} mm`,
  ].join('\n');
}

function exhibitItemsText(items, style, values = {}) {
  const normalized = normalizeShowcaseExhibitItems(items);
  const s = normalizeShowcaseStyle(style);
  const layoutMode = values.layoutMode === 'manual' ? 'manual' : 'auto';
  if (!normalized.length) {
    return [
      '未接入展品图。可以生成抽象展品占位体块，但必须遵守真实博物馆展柜陈列尺度。',
      '需要配置托架、支撑、低反射保护、重点照明和清晰的柜内层次，不要生成可读说明文字。',
    ].join('\n');
  }

  if (layoutMode === 'manual') {
    const lines = [
      '手动排版模式：已将所有展品原图按排版窗口中的位置、大小和层级合成为一张“手动排版合成图”。',
      '参考图顺序：第 1 张参考图 = 手动排版合成图，包含全部展品的最终排版、相对大小、位置和层级。',
      '不要再把展品原图逐张当作独立参考图理解，也不要根据文字坐标重新排版；展品外观、显示大小、位置和层级全部以第 1 张手动排版合成图为准。',
      '第 1 张手动排版合成图就是玻璃区正投影模板：合成图的左边界对应玻璃区左边界，右边界对应玻璃区右边界，上边界对应玻璃区顶部，下边界对应玻璃区底部。',
      '必须保持合成图中每个展品的像素占比、外接矩形大小、相互间距和留白比例；不得重新居中、不得自动适配画面、不得填满玻璃区、不得为了视觉平衡改变大小。',
      '不要套用自动尺寸模式中的“高度 mm”或“设定高度 70%”规则；不要为了画面美观擅自重新放大、缩小或改动展品位置。',
      `手动排版合成图对应玻璃区内部：宽 ${s.widthMm} mm，高 ${s.glassHeightMm} mm；展柜宽度、玻璃区高度、底座和柜帽仍保持设定尺寸。`,
    ];
    if (values.hasColorMaterialReferenceImage === true) {
      lines.push('参考图顺序：第 2 张参考图 = 色彩材质参考图，仅用于柜内背景、底座、背板、托架、灯光和材料气质；它不是展品图，不得改变第 1 张合成图中的展品排版。');
    }
    lines.push('渲染前最终检查：只对齐第 1 张手动排版合成图中的展品位置、大小、间距、留白和层级；不要使用文字坐标推导另一套布局。');
    return lines.join('\n');
  }

  const lines = [
    '普通 image 输入均视为展品图，只用于提取展品外观、体量、轮廓、材质和摆放重点，不作为色彩材质风格参考。',
    '参考图顺序：第 1 张参考图 = 展品 1，第 2 张参考图 = 展品 2，以此类推。必须按这个顺序匹配展品图片和尺寸。',
    '严格比例规则：每件展品只能按“高度 mm”缩放，不能按原图像素、裁切大小、主体在参考图里看起来的大小或视觉重要性缩放。',
    '生成缩放规则：生图时展品本体显示高度按设定高度的 70% 生成；展柜宽度、底座高度、玻璃区高度、柜帽高度和柜体总高度保持设定尺寸不变。',
    '标注规则：如果开启尺寸标注，展品、展柜和构件的标注文字仍必须标注用户设定尺寸，不标注 70% 后的显示高度；70% 只影响画面里展品本体的视觉占比。',
    '高度定义：高度只指展品本体的可见垂直高度，不包含托台、托盘、标签牌、底座、支架、阴影、留白或说明文字。',
    '最终展品本体必须严格按设定高度的 70% 形成真实显示比例范围，不得为了构图、焦点或视觉美观而随意放大或缩小。',
    '柜内设计宁可多留空，也不要把展品撑满画面；应保留充足柜内空白，为以后继续放置其它展品预留空间。',
  ];

  normalized.forEach((item, index) => {
    const renderHeightMm = normalizeNumber(item.heightMm * EXHIBIT_RENDER_HEIGHT_SCALE, item.heightMm, 1, 99999);
    const glassPercent = s.glassHeightMm > 0 ? (renderHeightMm / s.glassHeightMm) * 100 : 0;
    lines.push(`${index + 1}. ${item.label}：设定高度 ${item.heightMm} mm，生图显示高度 ${renderHeightMm} mm（设定高度的 70%）；参考图 URL：${item.url || '[上游展品图]'}`);
    lines.push(`   比例校验：展品 ${index + 1} 的生图显示高度约为玻璃区高度 ${s.glassHeightMm} mm 的 ${formatPercent(glassPercent)}%。`);
    lines.push(`   标注校验：如输出尺寸标注，展品 ${index + 1} 仍标注为 ${item.heightMm} mm，不标注为 ${renderHeightMm} mm。`);
    lines.push(`   上限约束：展品 ${index + 1} 的本体可见高度不得超过玻璃区高度的 ${formatPercent(glassPercent * 1.1)}%；如果不确定，宁可略小，不要放大。`);
  });

  if (values.hasColorMaterialReferenceImage === true) {
    lines.push('色彩材质参考图使用独立 color-material-reference 输入，并且排在所有展品图之后；它不是展品图，不得套用任何展品高度尺寸。');
  }
  lines.push('相对尺寸审计：如果两张展品参考图看起来差不多大，但高度数值不同，最终必须按毫米数显示出明显的物理高度差异。');
  lines.push('渲染前最终检查：逐一比较每件展品与展柜宽度、玻璃区高度。小尺寸展品必须保持小件感，大尺寸展品只有在数值足够大时才可以成为视觉主体。');
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
    if (referenceTone) lines.push(`参考图主色调 / 材质说明：${referenceTone}`);
  }
  if (presetText && !hasReference) lines.push(`共享色彩与材质预设（仅采用色彩和材质信息，忽略其中所有图案、纹样、文字、符号、logo、排版约定）：${presetText}`);
  if (presetText && hasReference) lines.push(`共享色彩与材质预设作为次级补充（仅采用色彩和材质信息，忽略其中所有图案、纹样、文字、符号、logo、排版约定）：${presetText}`);
  if (manualText) lines.push(`手动色彩与材质补充：${manualText}`);
  if (!lines.length) {
    lines.push('未指定色彩材质时，采用克制、低反射、博物馆级、可落地施工的柜内设计材质体系。');
  }
  return lines.join('\n');
}

function outputRequirementText(values) {
  const isManualLayout = values.layoutMode === 'manual';
  return [
    values.perspectiveEnabled === false
      ? '透视效果：关闭。必须输出完全平面的正立面/二维方案效果，不要任何 3D 透视、斜视角、消失点、近大远小、景深、透视玻璃边或空间纵深；所有水平线和垂直线必须保持平行，像正投影立面图。'
      : isManualLayout
        ? '透视效果：开启。可以使用轻微、克制的 3D 透视表现展柜深度，但必须把第 1 张手动排版合成图当作正投影模板，不能因为透视、景深或构图改变展品在玻璃区中的显示大小、相对间距和留白比例。'
        : '透视效果：开启。可以使用轻微、克制的 3D 透视来表现展柜深度、玻璃厚度和柜内层次，但不得破坏展品高度的物理比例。',
    values.dimensionMarksEnabled === true
      ? isManualLayout
        ? '尺寸标注：开启。输出中可加入清晰的工程尺寸标注、毫米单位和展柜关键高度/宽度标注；展品显示大小按手动排版合成图，不额外标注自动高度或 70% 显示高度。'
        : '尺寸标注：开启。输出中可加入清晰的工程尺寸标注、毫米单位和关键高度/宽度标注，但文字必须简洁、整洁，像方案图标注。所有标注必须使用用户设定尺寸：展柜尺寸不变，展品标注为设定高度，不标注 70% 后的显示高度。'
      : isManualLayout
        ? '尺寸标注：关闭。不要绘制尺寸线、毫米数字、红色测量标注、工程尺或标注符号；展品位置和显示大小仍必须严格按第 1 张手动排版合成图。'
        : '尺寸标注：关闭。不要绘制尺寸线、毫米数字、红色测量标注、工程尺或标注符号，但仍要按给定尺寸比例生成；展品视觉高度按设定高度的 70%，展柜尺寸不变。',
    values.explodedViewEnabled === true
      ? '分解爆炸图：开启。输出应表现柜体、玻璃罩、底座、柜帽、托架、展品、灯光组件的分解关系，可用轻微错位或爆炸图形式展示结构层级。'
      : '分解爆炸图：关闭。输出应为完整组装后的柜内陈列效果图，不要把柜体构件拆散漂浮。',
  ].join('\n');
}

export function buildShowcaseInteriorDesignPrompt(values = {}) {
  const style = values.showcaseStyle || values.dimensions || values;
  const supplement = cleanText(values.supplement, 3000);
  const lines = [
    '用途：博物馆 / 展陈柜内设计图生成。',
    '',
    '核心任务：根据展柜尺寸、展品参考图和柜内形式设计风格，生成一张专业、真实、可落地的展柜内部陈列设计效果图。',
    '',
    '1. 展柜样式与尺寸',
    showcaseStyleText(style),
    '',
    '比例要求：展柜宽度、底座高度、玻璃区高度、柜帽高度必须形成可信比例；玻璃区应是主要陈列空间，底座承托稳定，柜帽仅在开启时出现。',
    '',
    '2. 展品输入与物理尺寸约束',
    exhibitItemsText(values.exhibitItems, style, values),
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
  if (supplement) lines.push('', '6. 补充要求', supplement);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
