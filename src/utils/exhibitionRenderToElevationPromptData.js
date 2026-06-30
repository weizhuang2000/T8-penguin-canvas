function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

const MAX_ELEVATION_SECTIONS = 48;
const MAX_ELEVATION_SEGMENT_METERS = 8;

function parseChineseNumber(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;
  if (/^\d+$/.test(text)) return Number(text);
  const digits = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (Object.prototype.hasOwnProperty.call(digits, text)) return digits[text];
  if (text === '十') return 10;
  const match = text.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/u);
  if (match) {
    const tens = match[1] ? digits[match[1]] : 1;
    const ones = match[2] ? digits[match[2]] : 0;
    return tens * 10 + ones;
  }
  return NaN;
}

function normalizeTitle(value, index) {
  const text = cleanText(value, 80)
    .replace(/^[：:\-\s]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || `立面${index}`;
}

function splitHeadingAndBody(text, index) {
  const raw = cleanText(text, 4000);
  const firstLineEnd = raw.search(/\n/);
  const firstLine = firstLineEnd >= 0 ? raw.slice(0, firstLineEnd).trim() : raw.trim();
  const bodyRest = firstLineEnd >= 0 ? raw.slice(firstLineEnd + 1).trim() : '';
  const headingMatch = firstLine.match(/^(.{1,36}?)[：:；;，,。\s-]+(.+)$/u);
  if (headingMatch) {
    return {
      title: normalizeTitle(headingMatch[1], index),
      content: cleanText([headingMatch[2], bodyRest].filter(Boolean).join('\n'), 4000),
    };
  }
  if (firstLine.length <= 28 && bodyRest) {
    return { title: normalizeTitle(firstLine, index), content: bodyRest };
  }
  return { title: `立面${index}`, content: raw };
}

function roundMeters(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10) / 10;
}

export function parseElevationLengthMeters(value) {
  const text = cleanText(value, 8000);
  if (!text) return 0;
  const values = [];
  const labeled = /(?:立面长度|墙面长度|墙长|总长度|总长|长度|面宽|宽度|长)\s*(?:约|为|是)?\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(?:m(?!m)|米)/giu;
  for (const match of text.matchAll(labeled)) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) values.push(n);
  }
  if (values.length) return roundMeters(Math.max(...values));
  const generic = /(\d+(?:\.\d+)?)\s*(?:m(?!m)|米)/giu;
  for (const match of text.matchAll(generic)) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) values.push(n);
  }
  return values.length ? roundMeters(Math.max(...values)) : 0;
}

export function splitLongElevationSections(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  let nextIndex = 1;
  for (const raw of list) {
    if (!raw) continue;
    const lengthMeters = roundMeters(
      Number(raw.lengthMeters) ||
      parseElevationLengthMeters([raw.title, raw.content, raw.styleAnchor, raw.prompt].filter(Boolean).join('\n')),
    );
    const existingSplitCount = Math.max(1, Math.floor(Number(raw.splitCount) || 1));
    const existingSplitIndex = Math.max(1, Math.min(existingSplitCount, Math.floor(Number(raw.splitIndex) || 1)));
    const isAlreadySplitByLlm = existingSplitCount > 1;
    const recommendedSplitCount = lengthMeters > MAX_ELEVATION_SEGMENT_METERS
      ? Math.max(2, Math.ceil(lengthMeters / MAX_ELEVATION_SEGMENT_METERS))
      : 1;
    out.push({
      ...raw,
      index: nextIndex,
      lengthMeters: lengthMeters || undefined,
      splitIndex: isAlreadySplitByLlm ? existingSplitIndex : raw.splitIndex,
      splitCount: isAlreadySplitByLlm ? existingSplitCount : raw.splitCount,
      splitLengthMeters: roundMeters(Number(raw.splitLengthMeters) || 0) || undefined,
      needsIntelligentSplit: !isAlreadySplitByLlm && recommendedSplitCount > 1 ? true : raw.needsIntelligentSplit === true || undefined,
      recommendedSplitCount: !isAlreadySplitByLlm && recommendedSplitCount > 1 ? recommendedSplitCount : raw.recommendedSplitCount,
      craftBoundaryNotes: !isAlreadySplitByLlm && recommendedSplitCount > 1
        ? cleanText(raw.craftBoundaryNotes || `该立面长度 ${lengthMeters} 米，超过 ${MAX_ELEVATION_SEGMENT_METERS} 米，需要由 LLM 按工艺落位、展项模块和版式块合理拆分；不要将同一工艺拆到两段立面图里。`, 800)
        : cleanText(raw.craftBoundaryNotes || '', 800) || undefined,
    });
    nextIndex += 1;
  }
  return out.slice(0, MAX_ELEVATION_SECTIONS);
}

export function parseElevationSectionsFromText(value) {
  const text = cleanText(value, 50000);
  if (!text) return [];
  const marker = /(?:^|\n)\s*(?:[#*\-\d.、\s]*)?立面\s*([0-9]+|[一二两三四五六七八九十]{1,3})\s*[：:]\s*/gu;
  const matches = Array.from(text.matchAll(marker));
  if (!matches.length) return [];
  const sections = [];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const rawIndex = match[1];
    const parsedIndex = parseChineseNumber(rawIndex);
    const index = Number.isFinite(parsedIndex) && parsedIndex > 0 ? parsedIndex : i + 1;
    const start = (match.index || 0) + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index || text.length : text.length;
    const block = text.slice(start, end).trim();
    if (!block) continue;
    const { title, content } = splitHeadingAndBody(block, index);
    sections.push({
      index,
      title,
      content,
      styleAnchor: '',
      prompt: '',
    });
  }
  return splitLongElevationSections(sections
    .filter((item) => item.content || item.title)
    .sort((a, b) => a.index - b.index));
}

export function normalizeElevationSections(value) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
    .map((item, position) => {
      const index = Math.max(1, Math.floor(Number(item?.index) || position + 1));
      const title = normalizeTitle(item?.title, index);
      const content = cleanText(item?.content || item?.description || item?.text || '', 4000);
      const styleAnchor = cleanText(item?.styleAnchor || item?.style || '', 800);
      const prompt = cleanText(item?.prompt || '', 5000);
      if (!content && !prompt && !title) return null;
      const lengthMeters = roundMeters(Number(item?.lengthMeters) || parseElevationLengthMeters([title, content, styleAnchor, prompt].join('\n')));
      const splitCount = Math.max(1, Math.floor(Number(item?.splitCount) || 1));
      const splitIndex = Math.max(1, Math.min(splitCount, Math.floor(Number(item?.splitIndex) || 1)));
      const recommendedSplitCount = Math.max(0, Math.floor(Number(item?.recommendedSplitCount) || 0));
      return {
        index,
        title,
        content,
        styleAnchor,
        prompt,
        lengthMeters: lengthMeters || undefined,
        originalIndex: item?.originalIndex,
        splitLengthMeters: roundMeters(Number(item?.splitLengthMeters) || 0) || undefined,
        splitIndex: splitCount > 1 ? splitIndex : undefined,
        splitCount: splitCount > 1 ? splitCount : undefined,
        needsIntelligentSplit: item?.needsIntelligentSplit === true || undefined,
        recommendedSplitCount: recommendedSplitCount || undefined,
        craftBoundaryNotes: cleanText(item?.craftBoundaryNotes || item?.boundaryNotes || '', 800) || undefined,
      };
    })
    .filter(Boolean);
  return splitLongElevationSections(normalized);
}

export function parseElevationSectionsFromLlmResponse(value) {
  const text = cleanText(value, 50000);
  if (!text) return [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    fenced ? fenced[1] : '',
    text,
    (text.match(/\{[\s\S]*\}/) || [])[0] || '',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const list = Array.isArray(parsed) ? parsed : parsed?.elevations;
      const sections = normalizeElevationSections(list);
      if (sections.length) return sections;
    } catch {
      /* try next */
    }
  }
  return [];
}

export function buildRenderToElevationAnalysisMessages(values = {}) {
  const sourceText = cleanText(values.sourceText, 50000);
  const referenceImage = cleanText(values.referenceImage, 2000);
  const system = [
    '你是展陈深化设计立面拆分助手。',
    '请同时阅读输入文本和效果图，识别需要生成的展陈立面。',
    '只输出严格 JSON，不要 Markdown，不要解释。',
  ].join('\n');
  const userText = [
    '从文本中提取“立面1、立面2、立面3...”等独立立面。如果文本没有显式编号，请结合语义自动判断可拆分的立面。',
    '如果某个立面文本中出现长度、总长、面宽等信息，且长度超过 8 米，必须根据工艺落位、展项模块、版式块、视觉单元和内容段落合理拆分为多个 elevations；不要简单均分。',
    '拆分时不要将一个工艺拆到两段立面图里；同一组展柜、灯箱、标题墙、时间轴模块、多媒体区域、装置造型、互动设备或连续图文版块必须保持在同一段内。',
    '每个拆分段尽量控制在 8 米以内；如果为了保持同一工艺/展项完整而略超过 8 米，优先保证工艺完整，并在 craftBoundaryNotes 说明原因。',
    '超长立面拆分后的标题请使用“原标题 1/3、原标题 2/3”这样的命名，index 按最终输出顺序连续排列，splitIndex 和 splitCount 写明当前段序号。',
    '返回格式必须是：{"elevations":[{"index":1,"title":"...","content":"...","styleAnchor":"...","prompt":"...","lengthMeters":6,"splitIndex":1,"splitCount":2,"craftBoundaryNotes":"..."}]}',
    'content 写该立面的图文内容、主题、重点文案和功能分区。',
    'styleAnchor 写该立面在输入效果图中应参照的风格、材质、色彩、灯光、工艺或对应区域。',
    'prompt 写可直接给生图模型使用的简短立面生成要求，并说明本段保留哪些完整工艺/展项模块。',
    '如果完全无法判断立面，返回 {"elevations":[] }。',
    '',
    '输入文本：',
    sourceText || '（未提供文本）',
  ].join('\n');
  if (!referenceImage) {
    return [
      { role: 'system', content: system },
      { role: 'user', content: userText },
    ];
  }
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: referenceImage } },
      ],
    },
  ];
}

export function buildRenderToElevationImagePrompt(values = {}) {
  const index = Math.max(1, Math.floor(Number(values.index) || 1));
  const title = normalizeTitle(values.title, index);
  const content = cleanText(values.content, 5000);
  const styleAnchor = cleanText(values.styleAnchor, 1200);
  const llmPrompt = cleanText(values.prompt, 5000);
  const supplement = cleanText(values.supplement, 2000);
  const img2imgModeEnabled = values.img2imgModeEnabled !== false;
  const referenceToken = cleanText(values.referenceToken || '@img1', 32) || '@img1';
  const splitCount = Math.max(1, Math.floor(Number(values.splitCount) || 1));
  const splitIndex = Math.max(1, Math.min(splitCount, Math.floor(Number(values.splitIndex) || 1)));
  const splitLengthMeters = roundMeters(Number(values.splitLengthMeters) || 0);
  const lengthMeters = roundMeters(Number(values.lengthMeters) || 0);
  const recommendedSplitCount = Math.max(0, Math.floor(Number(values.recommendedSplitCount) || 0));
  const needsIntelligentSplit = values.needsIntelligentSplit === true;
  const craftBoundaryNotes = cleanText(values.craftBoundaryNotes || '', 800);
  const lines = [
    `任务：生成一张独立展陈立面图，标题为“立面${index}-${title}”。`,
    '必须参照输入效果图风格，尤其是对应立面部分的色彩体系、材质肌理、灯光氛围、工艺语言、图文层级和空间品牌气质。',
    '输出必须是正投影/平面立面表达，不要生成透视室内效果图、不要生成鸟瞰图、不要生成斜角空间渲染。',
    '立面图需要具有专业深化设计质感：清晰墙面边界、合理展板/灯箱/立体字/装置/展柜落位、图文排版层级明确、材料可施工。',
    '只生成当前立面，不要把其他立面混在同一张图里；不得改变输入效果图所体现的整体风格。',
    '统一包装形式：本节点输出的所有立面图必须采用浅灰色背景、顶部左侧用24号浅黄色黑体字显示标题，不要尺寸标注和工艺材质解读，立面图下面用地面做延伸。',
    '不得使用白底留白画布；立面图背景、墙面、材质和包装视觉必须铺满画面，边界干净但不要留下空白底。',
    '宽度适配：完整立面主体、顶部标题、墙面边界、展板、灯箱、展柜、时间轴和装置模块都必须位于画幅左右安全边距内；请按画面宽度自适应缩放和压缩排版密度，不要让任何内容在宽度方向超出画面、被裁切或贴边。',
    '',
    '当前立面内容：',
    content || title,
  ];
  if (splitCount > 1) {
    lines.push(
      '',
      '【工艺落位智能拆分】',
      `当前立面来自超长立面的工艺边界拆分：第 ${splitIndex}/${splitCount} 段${splitLengthMeters ? `，本段约 ${splitLengthMeters} 米` : ''}。`,
      '本段必须是按展项模块、灯箱/展柜/标题墙/时间轴/多媒体区等完整工艺落位切出的独立立面，不是机械均分切片。',
      '不得把同一工艺模块拆到两个立面图里；请保持本段内的完整工艺、展项和版式块边界清楚。',
      '请保持所有拆分段的包装形式、标题字、色彩材质、灯光和版式语言完全统一，同时让本段像连续长立面中的一个独立片段。',
    );
  }
  if (needsIntelligentSplit) {
    lines.push(
      '',
      '【超长立面拆分提醒】',
      `该立面检测到长度 ${lengthMeters || '超过 8'} 米，建议由 LLM 按工艺落位拆分为 ${recommendedSplitCount || '多'} 段后再分别生成。`,
      '如果当前仍是未拆分整段，请优先按工艺边界、展项模块和视觉单元组织画面，不要压缩成一张拥挤长图，不要将一个工艺拆到两段立面图里。',
    );
  }
  if (craftBoundaryNotes) {
    lines.push('', '工艺边界说明：', craftBoundaryNotes);
  }
  if (img2imgModeEnabled) {
    lines.push(
      '',
      '【图生图形式参考】',
      `${referenceToken} = 输入效果图参考图。请把 ${referenceToken} 中与当前立面标题、内容和风格锚点对应的透视墙面区域，转译为独立正投影展陈立面图。`,
      `保留 ${referenceToken} 对应区域的形式语言：色彩、材质、灯光、工艺、图文层级、造型比例和展陈气质。`,
      '去除室内透视、地面纵深、天花透视、斜角空间关系和镜头畸变，只输出当前立面的平面展开表达。',
      '形式参考只用于当前立面的视觉语言和构成关系，不要直接复制效果图的透视角度，不要生成完整室内空间效果图。',
    );
  }
  if (styleAnchor) {
    lines.push('', '对应效果图风格锚点：', styleAnchor);
  }
  if (llmPrompt) {
    lines.push('', 'LLM 整理后的立面提示：', llmPrompt);
  }
  if (supplement) {
    lines.push('', '用户补充要求：', supplement);
  }
  lines.push(
    '',
    '画面约束：无乱码文字、无错误品牌 Logo、无人物拥挤、无说明表格字段名；如需文字，仅以清晰标题块和短文案占位表达。',
    '最终输出：一张可用于展陈深化汇报的高质量独立立面图。',
  );
  return lines.join('\n');
}
