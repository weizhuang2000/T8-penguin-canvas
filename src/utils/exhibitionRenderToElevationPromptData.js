function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

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
  return sections
    .filter((item) => item.content || item.title)
    .sort((a, b) => a.index - b.index);
}

export function normalizeElevationSections(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, position) => {
      const index = Math.max(1, Math.floor(Number(item?.index) || position + 1));
      const title = normalizeTitle(item?.title, index);
      const content = cleanText(item?.content || item?.description || item?.text || '', 4000);
      const styleAnchor = cleanText(item?.styleAnchor || item?.style || '', 800);
      const prompt = cleanText(item?.prompt || '', 5000);
      if (!content && !prompt && !title) return null;
      return { index, title, content, styleAnchor, prompt };
    })
    .filter(Boolean)
    .slice(0, 12);
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
    '返回格式必须是：{"elevations":[{"index":1,"title":"...","content":"...","styleAnchor":"...","prompt":"..."}]}',
    'content 写该立面的图文内容、主题、重点文案和功能分区。',
    'styleAnchor 写该立面在输入效果图中应参照的风格、材质、色彩、灯光、工艺或对应区域。',
    'prompt 写可直接给生图模型使用的简短立面生成要求。',
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
  const lines = [
    `任务：生成一张独立展陈立面图，标题为“立面${index}-${title}”。`,
    '必须参照输入效果图风格，尤其是对应立面部分的色彩体系、材质肌理、灯光氛围、工艺语言、图文层级和空间品牌气质。',
    '输出必须是正投影/平面立面表达，不要生成透视室内效果图、不要生成鸟瞰图、不要生成斜角空间渲染。',
    '立面图需要具有专业深化设计质感：清晰墙面边界、合理展板/灯箱/立体字/装置/展柜落位、图文排版层级明确、材料可施工。',
    '只生成当前立面，不要把其他立面混在同一张图里；不得改变输入效果图所体现的整体风格。',
    '',
    '当前立面内容：',
    content || title,
  ];
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
