const DEFAULT_SHOWCASE_STYLE = {
  widthMm: 1200,
  baseHeightMm: 300,
  glassHeightMm: 1400,
  capHeightMm: 180,
  hasCap: false,
  hasBodyPattern: false,
};
const DEFAULT_SUPPORT_HEIGHT_MM = 150;
const HERITAGE_LEVEL_LABELS = {
  first: '一级',
  second: '二级',
  third: '三级',
  unrated: '未评级',
};

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

function formatRatio(value) {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

function normalizeHeritageLevel(value) {
  return ['first', 'second', 'third', 'unrated'].includes(value) ? value : 'unrated';
}

function normalizeSupportHeightMode(value) {
  return ['input', 'model-value', 'heritage-level'].includes(value) ? value : 'input';
}

function normalizeArrangementRows(value) {
  return Math.round(normalizeNumber(value, 1, 1, 6));
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
    hasBodyPattern: source.hasBodyPattern === true,
  };
}

export function normalizeShowcaseExhibitItems(value = []) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const url = cleanText(item?.url || item?.imageUrl || '', 1000);
      const label = cleanText(item?.label || item?.name || `展品 ${index + 1}`, 80);
      const heightMm = normalizeNumber(item?.heightMm ?? item?.displayHeightMm ?? item?.maxSideMm ?? item?.longestSideMm ?? item?.sizeMm, 300, 1, 99999);
      const supportHeightMm = normalizeNumber(item?.supportHeightMm ?? item?.plinthHeightMm ?? item?.standHeightMm, DEFAULT_SUPPORT_HEIGHT_MM, 0, 99999);
      const heritageLevel = normalizeHeritageLevel(item?.heritageLevel);
      if (!url && !label) return null;
      return { url, label: label || `展品 ${index + 1}`, heightMm, supportHeightMm, heritageLevel };
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
  const lines = [
    `展柜宽度：${s.widthMm} mm`,
    `底座高度：${s.baseHeightMm} mm`,
    `玻璃区高度：${s.glassHeightMm} mm`,
  ];
  if (s.hasCap) {
    lines.push(`柜帽：有柜帽，柜帽高度 ${s.capHeightMm} mm`);
  } else {
    lines.push('柜帽：没有柜帽，顶部是玻璃');
  }
  lines.push(`推导总高度：${totalHeight} mm`);
  return lines.join('\n');
}

function showcaseScaleRuleText(style, mode) {
  const s = normalizeShowcaseStyle(style);
  if (normalizeSupportHeightMode(mode) === 'heritage-level') {
    return s.hasCap
      ? '生成缩放规则：按文物级别、展品价值和柜内视觉秩序判断展品本体显示高度；展柜宽度、底座高度、玻璃区高度、柜帽高度和柜体总高度保持设定尺寸不变。'
      : '生成缩放规则：按文物级别、展品价值和柜内视觉秩序判断展品本体显示高度；展柜宽度、底座高度、玻璃区高度和柜体总高度保持设定尺寸不变；顶部保持透明玻璃顶，不安装任何灯具、灯带或射灯。';
  }
  return s.hasCap
    ? '生成缩放规则：生图时展品本体显示高度必须按用户设定的展品主体目标高度生成；展柜宽度、底座高度、玻璃区高度、柜帽高度和柜体总高度保持设定尺寸不变。'
    : '生成缩放规则：生图时展品本体显示高度必须按用户设定的展品主体目标高度生成；展柜宽度、底座高度、玻璃区高度和柜体总高度保持设定尺寸不变；顶部保持透明玻璃顶，不安装任何灯具、灯带或射灯。';
}

function showcaseRatioRequirementText(style) {
  const s = normalizeShowcaseStyle(style);
  const totalHeight = s.baseHeightMm + s.glassHeightMm + (s.hasCap ? s.capHeightMm : 0);
  const cabinetRatio = totalHeight > 0 ? s.widthMm / totalHeight : 0;
  const basePercent = totalHeight > 0 ? (s.baseHeightMm / totalHeight) * 100 : 0;
  const glassPercent = totalHeight > 0 ? (s.glassHeightMm / totalHeight) * 100 : 0;
  const capText = s.hasCap
    ? `，柜帽高度约占总高度 ${formatPercent((s.capHeightMm / totalHeight) * 100)}%`
    : '';
  const topBoundaryText = s.hasCap ? '顶部柜帽' : '顶部玻璃顶';
  const prefix = s.hasCap
    ? '比例要求：展柜宽度、底座高度、玻璃区高度、柜帽高度必须形成可信比例；玻璃区应是主要陈列空间，底座承托稳定。'
    : '比例要求：展柜宽度、底座高度、玻璃区高度必须形成可信比例；玻璃区应是主要陈列空间，底座承托稳定；顶部必须是通透玻璃顶。';
  return `${prefix}\n画面比例硬约束：展柜整体外框宽高比必须接近 ${s.widthMm}:${totalHeight}（宽/高≈${formatRatio(cabinetRatio)}），不要把展柜画成过宽横幅或过矮长条；完整展柜外框必须全部落在画面内，${topBoundaryText}、底部底座和左右边框都不能被裁切或超出画布；底座高度约占总高度 ${formatPercent(basePercent)}%，玻璃区高度约占总高度 ${formatPercent(glassPercent)}%${capText}。`;
}

function showcaseDesignRequirementText(style) {
  const s = normalizeShowcaseStyle(style);
  return s.hasCap
    ? '柜内设计要求：结合背板、台座、托架、微型展台、层板、暗藏灯带、重点射灯、低反射玻璃、展品保护距离和视觉焦点组织展品。设计应像真实展陈深化方案，而不是普通商品橱窗。'
    : '柜内设计要求：结合背板、台座、托架、微型展台、层板、低反射玻璃、展品保护距离和视觉焦点组织展品。顶部必须保持透明玻璃顶，不添加封板、设备层或任何灯具；照明表现只使用外部环境光、侧向隐藏光或背板反射光，不在顶部出现灯带、射灯或发光结构。设计应像真实展陈深化方案，而不是普通商品橱窗。';
}

function bodyPatternRequirementText(style) {
  const s = normalizeShowcaseStyle(style);
  if (s.hasBodyPattern) return '';
  return s.hasCap
    ? '柜体图案：关闭。柜体外观保持纯色、低反射材质或材料本身细微质感；柜体、底座、边框、柜帽都不要出现图案、纹样、花纹、符号、徽标、装饰纹理或可读文字。'
    : '柜体图案：关闭。柜体外观保持纯色、低反射材质或材料本身细微质感；柜体、底座、边框和顶部玻璃连接构件都不要出现图案、纹样、花纹、符号、徽标、装饰纹理或可读文字。';
}

function showcaseQualityRequirementText(style) {
  const s = normalizeShowcaseStyle(style);
  return s.hasCap
    ? '生成高完成度展陈设计效果图；结构清晰、玻璃通透、材质真实、灯光有层次、展品尺度可信。'
    : '生成高完成度展陈设计效果图；结构清晰、顶部玻璃通透、材质真实、外部或侧向光线有层次、展品尺度可信；顶部不能出现任何灯具、灯带、射灯或发光结构。';
}

function supportHeightModeText(mode) {
  const supportHeightMode = normalizeSupportHeightMode(mode);
  if (supportHeightMode === 'model-value') {
    return '展托高度策略：模型按展品价值自动判断。请根据每件展品的珍贵程度、视觉主次、材质和形态判断展托高度；价值高的展品展托更高一点，位置更靠中间或视觉核心区，但不得改变展品主体目标高度。';
  }
  if (supportHeightMode === 'heritage-level') {
    return '高度策略：根据文物级别组织。展品主体高度和展托高度都由模型按文物级别、展品价值和柜内视觉秩序判断；一级文物优先放在中间或视觉核心区，展品更突出，展托更高、更稳重；二级文物次之；三级文物和未评级展品可更低或偏侧，但仍必须有清晰可见支撑。';
  }
  return '展托高度策略：按照输入尺寸。每件展品必须按其输入的展托高度生成可见展托、托座或支架，展托从底座或层板连续托举到展品底部。';
}

function supportHeightItemText(item, mode) {
  const level = HERITAGE_LEVEL_LABELS[item.heritageLevel] || HERITAGE_LEVEL_LABELS.unrated;
  const supportHeightMode = normalizeSupportHeightMode(mode);
  if (supportHeightMode === 'model-value') {
    return `文物级别：${level}；展托高度：由模型根据展品价值自动判断，价值高时展托更高一点、位置更靠中间，仍保持展品主体目标高度不变。`;
  }
  if (supportHeightMode === 'heritage-level') {
    return `文物级别：${level}；展品主体高度和展托高度均由模型按该级别判断，不使用输入高度数值。`;
  }
  return `文物级别：${level}；展托高度：${item.supportHeightMm} mm，必须绘制可见展托/托座/支架，不要让展品悬浮。`;
}

function supportHeightAuditText(items, mode) {
  const supportHeightMode = normalizeSupportHeightMode(mode);
  if (supportHeightMode === 'heritage-level') {
    return '尺寸复核：当前为按文物级别模式，不输出也不使用每件展品的输入主体高度和输入展托高度；生成前必须按文物级别复核高低关系、中心位置、展托稳定性和柜内留白，一级文物应更突出且展托更高，二级次之，三级/未评级更克制。';
  }
  const heightList = items.map((item, index) => `展品 ${index + 1} 主体高度 ${item.heightMm} mm`).join('；');
  if (supportHeightMode === 'input') {
    const supportList = items.map((item, index) => `展品 ${index + 1} 展托高度 ${item.supportHeightMm} mm`).join('；');
    return `尺寸复核：生成前必须逐项核对 ${heightList}；${supportList}。展品主体高度和展托高度都必须与上述设置一致，不得按构图、画面留白、文件尺寸、图片宽高比、像素分辨率、主体在参考图中的占图比例或模型偏好擅自改大改小。`;
  }
  return `尺寸复核：生成前必须逐项核对 ${heightList}。展品主体高度必须与上述设置一致，不得按构图、画面留白、文件尺寸、图片宽高比、像素分辨率、主体在参考图中的占图比例或模型偏好擅自改大改小；展托高度按当前策略判断，但不能反向改变展品主体高度。`;
}

function arrangementRowsText(value) {
  const rows = normalizeArrangementRows(value);
  if (rows <= 1) {
    return '陈列行数：1 行。所有展品默认按单排横向陈列，展托落在同一前后深度基准内；不要做前后错排、多排纵深、上下分层或阶梯式多层展架。';
  }
  return `陈列行数：${rows} 行。必须按前后纵深排列，不是上下分层、不是多层层板、不是把展品叠成垂直楼层；第 1 行为前排，后续行依次位于更靠后的深度位置。后排展托必须逐排升高以越过前排遮挡，后排展品本体高度仍按各自高度策略执行，不能因为后排展托更高就放大展品本体。展柜进深必须明显加大，形成真实深柜空间、前后保护距离和可落地的维护通道；即使输出正立面，也要通过展托高度、遮挡关系和底台进深表现前后行关系。`;
}

function arrangementRowsAuditText(value) {
  const rows = normalizeArrangementRows(value);
  if (rows <= 1) {
    return '排列复核：当前为 1 行陈列，只做横向单排；不要添加后排展品，不要为了丰富画面擅自增加展柜进深。';
  }
  return `排列复核：当前为 ${rows} 行陈列，生成前必须检查前后行关系。所有后排必须在空间深度上位于前排之后，后排展托高度必须高于前排展托，越靠后的行展托越高；展柜进深必须比单排明显更深，不能把多行误画成同一条直线、上下叠放或普通多层架。`;
}

function equalHeightAuditText(items) {
  const groups = new Map();
  items.forEach((item, index) => {
    const key = String(item.heightMm);
    const list = groups.get(key) || [];
    list.push(index + 1);
    groups.set(key, list);
  });
  const lines = [];
  groups.forEach((indexes, height) => {
    if (indexes.length > 1) {
      lines.push(`展品 ${indexes.join('、')} 的主体高度同为 ${height} mm，最终画面中的展品本体可见高度必须完全一致；不得因为参考图构图、器型细长、留白、位置靠边或视觉焦点不同而把其中某一件画得更高。`);
    }
  });
  return lines.join('\n');
}

function exhibitItemsText(items, style, values = {}) {
  const normalized = normalizeShowcaseExhibitItems(items);
  const s = normalizeShowcaseStyle(style);
  const layoutMode = values.layoutMode === 'manual' ? 'manual' : 'auto';
  if (!normalized.length) {
    const emptyMode = values.emptyExhibitMode === 'search' ? 'search' : 'empty';
    const query = cleanText(values.emptyExhibitQuery, 600);
    if (emptyMode === 'search') {
      return [
        '未接入展品图。当前选择：自动搜索相关展品。',
        query
          ? `展品搜索/生成关键词：${query}。请根据该主题自动寻找或生成可信的相关展品外观，用于柜内陈列设计。`
          : '展品搜索/生成关键词未填写。请生成与展陈主题相符的少量通用博物馆展品，但不要生成杂乱商品或无关装饰。',
        '展品视角要求：自动生成的展品尽量采用侧视图或正侧视图，保持平视，不要俯拍、仰拍、斜拍、倾斜摆放或明显透视变形。',
        '自动生成的展品应保持博物馆级真实感、数量克制、尺度可信，并预留充足柜内空白；不要把展品撑满玻璃区。',
        '需要配置托架、支撑、低反射保护、重点照明和清晰的柜内层次，不要生成可读说明文字。',
      ].join('\n');
    }
    return [
      '未接入展品图。当前选择：空展柜。',
      '请生成没有展品的空展柜内部设计效果，只表现展柜结构、玻璃区、底座、背板、托架预留位、灯光和材料关系。',
      '不要自动添加展品、占位体块、商品、雕塑、器物或说明牌；柜内可以保留干净空白，为后续放置展品预留空间。',
    ].join('\n');
  }

  if (layoutMode === 'manual') {
    const manualItems = normalizeShowcaseManualLayoutItems(values.manualLayoutItems);
    const lines = [
      '手动排版模式：已将所有展品原图按排版窗口中的位置、大小和层级合成为一张“手动排版合成图”。',
      '参考图顺序：第 1 张参考图 = 手动排版合成图，包含全部展品的最终排版、相对大小、位置和层级。',
      '不要再把展品原图逐张当作独立参考图理解，也不要根据文字坐标重新排版；展品外观、显示大小、位置和层级全部以第 1 张手动排版合成图为准。',
      '展品视角要求：在保持第 1 张手动排版合成图的位置、大小和识别特征前提下，展品自身尽量以侧视图或正侧视图、平视角度呈现，不要倾斜摆放或使用强透视改变轮廓。',
      '第 1 张手动排版合成图就是玻璃区正投影模板：合成图的左边界对应玻璃区左边界，右边界对应玻璃区右边界，上边界对应玻璃区顶部，下边界对应玻璃区底部。',
      '必须保持合成图中每个展品的像素占比、外接矩形大小、相互间距和留白比例；不得重新居中、不得自动适配画面、不得填满玻璃区、不得为了视觉平衡改变大小。',
      '排版高度规则：排版窗口中每个展品的垂直位置直接对应它在玻璃区内的实际展示高度；展品底边离玻璃区底部越高，下方展托就必须越高。',
      '展托规则：每件展品下面使用独立展托、托座或支架托举到排版窗口指定高度。',
      '展托可见性强制要求：必须把展托画成清晰可见的实体构件，可以是细柱、透明亚克力支架、金属托架、阶梯台座或定制托座；展托必须从底座或层板连续连接到展品底部，不能让展品悬浮，不能只用阴影、反光或暗部暗示支撑。',
      '禁止省略展托：不要隐藏展托、不要把展托做成完全透明不可见、不要让展托被展品或背景遮挡、不要裁掉展托；每件不贴近玻璃区底部的展品下方都必须能看见对应高度的支撑结构。',
      '不要套用自动尺寸模式中的“展品主体目标高度 mm”规则；不要为了画面美观擅自重新放大、缩小或改动展品位置。',
      s.hasCap
        ? `手动排版合成图对应玻璃区内部：宽 ${s.widthMm} mm，高 ${s.glassHeightMm} mm；展柜宽度、玻璃区高度、底座和柜帽仍保持设定尺寸。`
        : `手动排版合成图对应玻璃区内部：宽 ${s.widthMm} mm，高 ${s.glassHeightMm} mm；展柜宽度、玻璃区高度和底座仍保持设定尺寸；顶部保持透明玻璃顶，不安装任何灯具、灯带或射灯。`,
    ];
    if (manualItems.length) {
      lines.push('手动排版高度明细（坐标原点在玻璃区左上角，y 越大越靠近玻璃区底部）：');
      manualItems.forEach((item, index) => {
        const topMm = normalizeNumber(item.yMm, 0, 0, 999999);
        const bottomFromTopMm = normalizeNumber(item.yMm + item.heightMm, 0, 0, 999999);
        const plinthHeightMm = normalizeNumber(Math.max(0, s.glassHeightMm - bottomFromTopMm), 0, 0, 999999);
        lines.push(`${index + 1}. ${item.label}：顶部距玻璃区顶部 ${topMm} mm，展品显示高度 ${item.heightMm} mm，展品底边距玻璃区底部 ${plinthHeightMm} mm；下方必须绘制可见展托，展托高度约 ${plinthHeightMm} mm，用该高度从底座或层板托举到展品底部。`);
      });
    }
    if (values.hasColorMaterialReferenceImage === true) {
      lines.push('参考图顺序：第 2 张参考图 = 色彩材质参考图，仅用于柜内背景、底座、背板、托架、灯光和材料气质；它不是展品图，不得改变第 1 张合成图中的展品排版。');
    }
    lines.push('渲染前最终检查：只对齐第 1 张手动排版合成图中的展品位置、大小、间距、留白和层级；必须用不同高度的可见展托承接各展品底边，不要出现悬浮展品，不要使用文字坐标推导另一套布局。');
    return lines.join('\n');
  }

  const supportHeightMode = normalizeSupportHeightMode(values.supportHeightMode);
  const lines = [
    '普通 image 输入均视为展品图，只用于提取展品外观、体量、轮廓、材质和摆放重点，不作为色彩材质风格参考。',
    '参考图顺序：@img1 = 展品 1，@img2 = 展品 2，以此类推。必须按这个顺序匹配展品参考图、展托高度和文物级别。',
    arrangementRowsText(values.arrangementRows),
    '展品视角要求：展品尽量采用侧视图或正侧视图，保持平视、端正摆放；不要俯拍、仰拍、斜拍、倾斜旋转或明显透视变形。',
    supportHeightMode === 'heritage-level'
      ? '严格比例规则：每件展品按文物级别、展品价值和柜内视觉秩序判断本体显示高度；不要读取或套用输入的展品主体高度、展托高度数值，也不要按参考图片文件的画幅高度、像素高度、裁切框高度或留白高度缩放。'
      : '严格比例规则：每件展品只能按“展品主体目标高度 mm”缩放；这里的高度指参考图中主要物体/展品本体在最终画面中的真实高度，不是参考图片文件的画幅高度、像素高度、裁切框高度或留白高度。',
    supportHeightMode === 'heritage-level'
      ? '参考图抗干扰规则：参考图只用于识别展品外观、轮廓、材质、纹样和细节；图片宽高比、像素多少、分辨率高低、主体在图中占比、边缘留白、裁切范围和背景面积都不得直接决定最终展品大小或展托高度。'
      : '参考图抗干扰规则：参考图只用于识别展品外观、轮廓、材质、纹样和细节；展品主体高度和展托高度只能按毫米设定值换算，绝不能受输入展品图的宽高比、像素多少、分辨率高低、主体在图中占比、边缘留白、裁切范围或背景面积影响。',
    showcaseScaleRuleText(style, supportHeightMode),
    '标注规则：不要给任何展品本体标注尺寸数字、尺寸线或高度文字；如果开启尺寸标注，只标注展柜、底座、玻璃区、柜帽、层板、托架等柜体/构件尺寸。',
    supportHeightMode === 'heritage-level'
      ? '高度定义：按级别判断的展品高度只指参考图中主要物体/展品本体的可见垂直高度，不包含整张图片画幅、透明边距、背景、托台、托盘、标签牌、底座、支架、阴影、留白或说明文字。'
      : '高度定义：展品主体目标高度只指参考图中主要物体/展品本体的可见垂直高度，不包含整张图片画幅、透明边距、背景、托台、托盘、标签牌、底座、支架、阴影、留白或说明文字。',
    supportHeightMode === 'heritage-level'
      ? '最终展品本体必须形成符合文物级别的真实显示比例范围，不得为了构图、焦点或视觉美观而破坏一级、二级、三级、未评级之间的主次关系。'
      : '最终展品本体必须严格按展品主体目标高度形成真实显示比例范围，不得为了构图、焦点或视觉美观而随意放大或缩小。',
    '柜内设计宁可多留空，也不要把展品撑满画面；应保留充足柜内空白，为以后继续放置其它展品预留空间。',
    supportHeightModeText(supportHeightMode),
  ];

  normalized.forEach((item, index) => {
    const mentionToken = `@img${index + 1}`;
    lines.push(supportHeightMode === 'heritage-level'
      ? `${index + 1}. ${mentionToken}`
      : `${index + 1}. ${mentionToken}：展品主体目标高度 ${item.heightMm} mm`);
    lines.push(`   图像输入：${mentionToken} 对应参考图顺序中的展品 ${index + 1}，必须按该图提取外观、轮廓、材质与细节。`);
    lines.push(`   ${supportHeightItemText(item, supportHeightMode)}`);
    if (supportHeightMode !== 'heritage-level') {
      const exhibitPercent = s.glassHeightMm > 0 ? (item.heightMm / s.glassHeightMm) * 100 : 0;
      const supportPercent = s.glassHeightMm > 0 ? (item.supportHeightMm / s.glassHeightMm) * 100 : 0;
      lines.push(`   尺度换算：展品 ${index + 1} 的主体高度 ${item.heightMm} mm 约占玻璃区高度 ${s.glassHeightMm} mm 的 ${formatPercent(exhibitPercent)}%；展托高度 ${item.supportHeightMm} mm 约占玻璃区高度的 ${formatPercent(supportPercent)}%。`);
    }
    lines.push(supportHeightMode === 'heritage-level'
      ? `   标注限制：不要给展品 ${index + 1} 标注任何展品高度、展托高度、尺寸线或高度数字。`
      : `   标注限制：不要给展品 ${index + 1} 标注 ${item.heightMm} mm，也不要在展品旁绘制尺寸线或高度数字。`);
  });

  if (values.hasColorMaterialReferenceImage === true) {
    lines.push('色彩材质参考图使用独立 color-material-reference 输入，并且排在所有展品图之后；它不是展品图，不得套用任何展品高度尺寸。');
  }
  lines.push(supportHeightMode === 'heritage-level'
    ? '相对尺寸审计：如果两张展品参考图看起来差不多大，最终仍应按文物级别和展品价值形成明确主次，不要按输入高度数值排序。'
    : '相对尺寸审计：如果两张展品参考图看起来差不多大，但高度数值不同，最终必须按毫米数显示出明显的物理高度差异；如果高度数值相同，最终展品本体必须显示为相同高度。');
  const equalHeightAudit = supportHeightMode === 'heritage-level' ? '' : equalHeightAuditText(normalized);
  if (equalHeightAudit) lines.push(equalHeightAudit);
  lines.push(supportHeightAuditText(normalized, supportHeightMode));
  lines.push(arrangementRowsAuditText(values.arrangementRows));
  lines.push('渲染前最终检查：先锁定展柜整体外框宽高比和底座/玻璃区/柜帽分段比例，再逐一比较每件展品与玻璃区高度；小尺寸展品必须保持小件感，同高度展品必须等高，大尺寸展品只有在数值足够大时才可以成为视觉主体。');
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
    lines.push('色彩与材质参考图不得作为画幅比例、构图比例、展柜宽高比例或输出尺寸依据；生图比例只服从节点的“比例”参数和展柜尺寸设定。');
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
  const isHeritageLevelMode = normalizeSupportHeightMode(values.supportHeightMode) === 'heritage-level';
  const s = normalizeShowcaseStyle(values.showcaseStyle || values.dimensions || values);
  const topCropText = s.hasCap ? '柜帽' : '顶部玻璃顶';
  const explodedViewText = values.explodedViewEnabled === true
    ? s.hasCap
      ? '分解爆炸图：开启。输出应表现柜体、玻璃罩、底座、柜帽、托架、展品、灯光组件的分解关系，可用轻微错位或爆炸图形式展示结构层级。'
      : '分解爆炸图：开启。输出应表现柜体、玻璃罩、底座、透明玻璃顶、托架和展品的分解关系，可用轻微错位或爆炸图形式展示结构层级；顶部仍为玻璃且不安装任何灯具、灯带或射灯。'
    : '分解爆炸图：关闭。输出应为完整组装后的柜内陈列效果图，不要把柜体构件拆散漂浮。';
  return [
    `画面框定：完整展柜必须居中完整入画，顶部、底部、左右外边界和尺寸标注都要保留安全边距；不得裁掉${topCropText}、底座、总高度标注箭头或底部边线；可以缩小整柜在画面中的占比，但不能改变展柜宽高比和各分段高度比例。`,
    values.perspectiveEnabled === false
      ? '透视效果：关闭。必须输出完全平面的正立面/二维方案效果，不要任何 3D 透视、斜视角、消失点、近大远小、景深、透视玻璃边或空间纵深；所有水平线和垂直线必须保持平行，像正投影立面图。'
      : isManualLayout
        ? '透视效果：开启。可以使用轻微、克制的 3D 透视表现展柜深度，但必须把第 1 张手动排版合成图当作正投影模板，不能因为透视、景深或构图改变展品在玻璃区中的显示大小、相对间距和留白比例。'
        : '透视效果：开启。可以使用轻微、克制的 3D 透视来表现展柜深度、玻璃厚度和柜内层次，但不得破坏展品高度的物理比例。',
    values.dimensionMarksEnabled === true
      ? isManualLayout
        ? '尺寸标注：开启。输出中可加入清晰的工程尺寸标注、毫米单位和展柜关键高度/宽度标注；展品显示大小按手动排版合成图，不额外标注自动高度。'
        : '尺寸标注：开启。输出中可加入清晰的工程尺寸标注、毫米单位和关键高度/宽度标注，但文字必须简洁、整洁，像方案图标注。所有标注必须使用用户设定尺寸；只标注展柜、底座、玻璃区、柜帽、层板、托架等柜体/构件尺寸，不标注展品本体尺寸。'
      : isManualLayout
        ? '尺寸标注：关闭。不要绘制尺寸线、毫米数字、红色测量标注、工程尺或标注符号；展品位置和显示大小仍必须严格按第 1 张手动排版合成图。'
        : isHeritageLevelMode
          ? '尺寸标注：关闭。不要绘制尺寸线、毫米数字、红色测量标注、工程尺或标注符号，但仍要按展柜尺寸比例生成；展品视觉高度按文物级别、展品价值和柜内视觉秩序判断，展柜尺寸不变。'
          : '尺寸标注：关闭。不要绘制尺寸线、毫米数字、红色测量标注、工程尺或标注符号，但仍要按给定尺寸比例生成；展品视觉高度按展品主体目标高度，展柜尺寸不变。',
    explodedViewText,
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
    showcaseRatioRequirementText(style),
    '',
    '2. 展品输入与物理尺寸约束',
    exhibitItemsText(values.exhibitItems, style, values),
    '',
    '3. 柜内形式设计风格',
    colorMaterialText(values),
    bodyPatternRequirementText(style),
    '',
    showcaseDesignRequirementText(style),
    '',
    '4. 输出形式要求',
    outputRequirementText({ ...values, showcaseStyle: style }),
    '',
    '5. 画面质量约束',
    showcaseQualityRequirementText(style),
    '不要生成随机品牌 logo、无关人物、杂乱商店橱窗、低清模糊、错误文字、不可读乱码说明牌或与展品无关的装饰堆砌。',
  ];
  if (supplement) lines.push('', '6. 补充要求', supplement);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
