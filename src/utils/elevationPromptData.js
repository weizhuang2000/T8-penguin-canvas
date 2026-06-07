export const ELEVATION_CRAFTS = [
  { id: 'panel', label: '展板', prompt: '模块化高清展板，边缘与分缝收口精细' },
  { id: 'dimensional-letters', label: '立体字', prompt: '精工立体字标题，层级明确，厚度与投影真实' },
  { id: 'luminous-letters', label: '发光字', prompt: '隐藏光源发光字，亮度克制且轮廓清晰' },
  { id: 'soft-film-lightbox', label: '软膜灯箱', prompt: '无边软膜灯箱，画面均匀透亮' },
  { id: 'fabric-lightbox', label: '卡布灯箱', prompt: '卡布灯箱图文模块，画面平整且便于更换' },
  { id: 'uv-print', label: 'UV 喷绘', prompt: '高精度 UV 喷绘图文，色彩稳定，文字边缘锐利' },
  { id: 'acrylic', label: '亚克力', prompt: '透明或半透明亚克力叠层，形成轻盈的信息层次' },
  { id: 'metal-panel', label: '金属板', prompt: '哑光金属板与精细折边，体现耐久和高级质感' },
  { id: 'relief', label: '浮雕造型', prompt: '浅浮雕主题造型，体块与墙面自然衔接' },
  { id: 'led-screen', label: 'LED 屏', prompt: '嵌入式 LED 屏，与图文版式形成完整构图' },
  { id: 'interactive-screen', label: '互动屏', prompt: '嵌入式互动触控屏，设备边框和走线隐藏' },
  { id: 'showcase-niche', label: '展柜/壁龛', prompt: '嵌墙展柜或壁龛，重点照明准确，尺度可信' },
  { id: 'wayfinding', label: '导视标识', prompt: '统一的导视标识系统，编号与方向信息清晰' },
];

function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function cleanList(value, maxItems = 12, maxChars = 1200) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxChars)).filter(Boolean).slice(0, maxItems);
}

export function normalizeElevationAnalysis(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  const sections = rawSections
    .map((section, index) => {
      const item = section && typeof section === 'object' ? section : {};
      const title = cleanText(item.title || item.shortTitle || `第 ${index + 1} 部分`, 120);
      const shortTitle = cleanText(item.shortTitle || title, 40);
      const keyQuotes = cleanList(item.keyQuotes || item.exactText, 8, 500);
      const displayFocus = cleanText(item.displayFocus || item.summary || item.content, 1800);
      const suggestedCrafts = cleanList(item.suggestedCrafts, 8, 80);
      if (!title && !displayFocus && keyQuotes.length === 0) return null;
      return { title, shortTitle, keyQuotes, displayFocus, suggestedCrafts };
    })
    .filter(Boolean)
    .slice(0, 24);
  return {
    projectTheme: cleanText(source.projectTheme || source.theme, 200),
    coreMessage: cleanText(source.coreMessage || source.summary, 1600),
    sections,
  };
}

export function parseElevationAnalysisResponse(content) {
  const raw = cleanText(content, 200000);
  if (!raw) throw new Error('AI 未返回分析内容');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  if (!candidate || !candidate.trim().startsWith('{')) throw new Error('AI 返回内容不是有效 JSON');
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error('AI 返回的 JSON 无法解析');
  }
  const analysis = normalizeElevationAnalysis(parsed);
  if (!analysis.projectTheme && !analysis.coreMessage && analysis.sections.length === 0) {
    throw new Error('AI 返回的分析结果缺少有效内容');
  }
  return analysis;
}

function distributeSections(sections, count) {
  const total = Math.max(1, Math.min(12, Number(count) || 1));
  const buckets = Array.from({ length: total }, () => []);
  sections.forEach((section, index) => {
    const bucketIndex = Math.min(total - 1, Math.floor((index * total) / Math.max(1, sections.length)));
    buckets[bucketIndex].push(section);
  });
  return buckets;
}

export function wallsFromAnalysis(analysisValue, mode = 'multi', count = 3) {
  const analysis = normalizeElevationAnalysis(analysisValue);
  const sections = analysis.sections;
  const wallCount = mode === 'single' ? 1 : Math.max(1, Math.min(12, Number(count) || sections.length || 3));
  const buckets = distributeSections(sections, wallCount);
  return buckets.map((bucket, index) => {
    const titles = bucket.map((item) => item.shortTitle || item.title).filter(Boolean);
    const exactText = bucket.flatMap((item) => item.keyQuotes || []);
    const focus = bucket.map((item) => item.displayFocus).filter(Boolean).join('\n');
    return {
      id: `wall-${index + 1}`,
      title: titles.join(' · ') || (wallCount === 1 ? analysis.projectTheme || '主题立面' : `立面 ${index + 1}`),
      content: focus || analysis.coreMessage,
      exactText,
    };
  });
}

function craftText(selectedIds, customCraft) {
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const values = ELEVATION_CRAFTS.filter((craft) => selected.has(craft.id)).map((craft) => craft.prompt);
  const custom = cleanText(customCraft, 800);
  if (custom) values.push(custom);
  return values.join('；');
}

function exactTextInstruction(wall) {
  const quotes = cleanList(wall?.exactText, 10, 300);
  if (!quotes.length) return '文字仅作为短标题与关键词的视觉占位，不生成大段不可读正文';
  return `画面中只需清晰表现短标题“${cleanText(wall.title, 80)}”与关键词层级，以下原文由排版清单保留、概念图不要求逐字生成：${quotes.join('；')}`;
}

function buildWallPrompt(values, wall, index, total) {
  const crafts = craftText(values.selectedCrafts, values.customCraft);
  const lines = [
    `生成一张专业展陈彩立面平面设计概念图，第 ${index + 1}/${total} 面，正立面、无透视、完整展示墙面边界。`,
    `项目主题：${cleanText(values.analysis?.projectTheme || wall.title || '展陈主题')}`,
    `本面标题：${cleanText(wall.title || `立面 ${index + 1}`)}`,
    `展示内容：${cleanText(wall.content || values.analysis?.coreMessage || '围绕项目主题进行图文信息设计')}`,
    `立面比例/尺寸：${cleanText(values.dimensions || values.aspectRatio || '横向展墙，比例协调')}`,
    `内容密度：${cleanText(values.density || '适中，主次分明，保留呼吸感')}`,
    `色彩与材质：${cleanText(values.colorMaterial || '依据主题建立统一色彩与材质体系')}`,
    `视觉风格：${cleanText(values.visualStyle || '现代专业展陈平面设计')}`,
  ];
  if (crafts) lines.push(`展陈工艺：${crafts}`);
  lines.push(`文字策略：${exactTextInstruction(wall)}`);
  if (cleanText(values.supplement)) lines.push(`特别要求：${cleanText(values.supplement)}`);
  lines.push('版式要求：建立明确的标题、导语、正文、图片与重点数据层级，网格严谨，图文留白合理，工艺落位清楚，可作为深化设计依据。');
  lines.push('表现要求：彩色正立面设计稿，二维平面排版视图，材质和发光效果真实，边缘清晰，高分辨率，不要室内透视、不要人物、不要倾斜墙面、不要乱码长文。');
  return lines.join('\n');
}

function buildWallSchedule(values, wall, index) {
  const craftLabels = ELEVATION_CRAFTS
    .filter((craft) => (values.selectedCrafts || []).includes(craft.id))
    .map((craft) => craft.label);
  if (cleanText(values.customCraft)) craftLabels.push(cleanText(values.customCraft, 200));
  const exact = cleanList(wall.exactText, 20, 800);
  return [
    `立面 ${index + 1}｜${cleanText(wall.title || `立面 ${index + 1}`)}`,
    `内容摘要：${cleanText(wall.content || values.analysis?.coreMessage || '待补充')}`,
    `准确文案：${exact.length ? exact.join(' / ') : '未提取关键原文，请人工补充最终上墙文案'}`,
    `工艺配置：${craftLabels.length ? craftLabels.join('、') : '常规展板与图文喷绘'}`,
    `尺寸/比例：${cleanText(values.dimensions || values.aspectRatio || '待现场复核')}`,
    `版式备注：${cleanText(values.density || '适中')}；${cleanText(values.colorMaterial || '沿用整体视觉体系')}`,
  ].join('\n');
}

function stripWallSegmentHeading(text) {
  return cleanText(text, 50000)
    .replace(/^【立面\s*\d+】\s*\n*/u, '')
    .replace(/^立面\s*\d+\s*[｜|]\s*/u, '');
}

export function buildElevationOutputs(values = {}) {
  const mode = values.wallMode === 'single' ? 'single' : 'multi';
  const analysis = normalizeElevationAnalysis(values.analysis);
  let walls = Array.isArray(values.walls) ? values.walls.filter(Boolean) : [];
  if (mode === 'single' && walls.length > 1) {
    walls = [{
      id: 'wall-1',
      title: walls.map((wall) => cleanText(wall.title, 80)).filter(Boolean).join(' · '),
      content: walls.map((wall) => cleanText(wall.content, 1600)).filter(Boolean).join('\n'),
      exactText: walls.flatMap((wall) => cleanList(wall.exactText, 20, 500)),
    }];
  }
  if (walls.length === 0) walls = wallsFromAnalysis(analysis, mode, values.wallCount);
  const conceptPrompts = walls.map((wall, index) => buildWallPrompt({ ...values, analysis }, wall, index, walls.length));
  const scheduleSegments = walls.map((wall, index) => buildWallSchedule({ ...values, analysis }, wall, index));
  const overviewPrompt = [
    `整套展陈彩立面设计，共 ${walls.length} 面，保持统一的视觉识别、网格、色彩、材质和工艺语言。`,
    ...conceptPrompts.map((prompt) => `\n${prompt}`),
  ].join('\n');
  const generatedLayoutSchedule = [
    `项目：${analysis.projectTheme || '未命名展陈项目'}`,
    `核心信息：${analysis.coreMessage || '待补充'}`,
    '',
    ...scheduleSegments,
  ].join('\n\n');
  const layoutSchedule = cleanText(values.layoutScheduleOverride, 50000) || generatedLayoutSchedule;
  const contentMode = values.downstreamContent === 'schedule'
    ? 'schedule'
    : values.downstreamContent === 'combined'
      ? 'combined'
      : 'concept';
  const segmentOutputs = conceptPrompts.map((prompt, index) => {
    const scheduleForSegment = stripWallSegmentHeading(scheduleSegments[index]);
    if (contentMode === 'schedule') return scheduleForSegment;
    if (contentMode === 'combined') return `${prompt}\n\n--- 准确排版清单 ---\n${scheduleForSegment}`;
    return prompt;
  });
  const mainOutput = contentMode === 'schedule'
    ? layoutSchedule
    : contentMode === 'combined'
      ? `${overviewPrompt}\n\n===== 准确图文工艺排版清单 =====\n${layoutSchedule}`
      : overviewPrompt;
  const useSegments = mode === 'multi' && values.outputMode === 'segments';
  return {
    walls,
    conceptPrompts,
    scheduleSegments,
    overviewPrompt,
    layoutSchedule,
    generatedLayoutSchedule,
    mainOutput,
    textSegments: useSegments ? segmentOutputs : [],
  };
}

export function buildElevationAnalysisMessages(sourceText, wallMode = 'multi', wallCount = 3, wordCount = 1200) {
  const targetWordCount = Math.max(200, Math.min(3000, Number(wordCount) || 1200));
  const countInstruction = wallMode === 'single'
    ? '按一个主题立面组织内容'
    : `建议拆分为约 ${Math.max(1, Math.min(12, Number(wallCount) || 3))} 个连续立面章节`;
  const wordInstruction = `提炼总字数控制在约 ${targetWordCount} 字，允许上下浮动 20%；projectTheme 简短，coreMessage 和各章节 displayFocus 只保留关键设计信息，keyQuotes 为原文摘录且不计入改写字数。`;
  return [
    {
      role: 'system',
      content: [
        '你是专业展陈策划与平面设计师。请从用户文档中提炼可用于展陈彩立面的内容结构。',
        '只输出 JSON，不要 Markdown，不要解释。',
        '结构必须为：{"projectTheme":"项目主题","coreMessage":"核心信息","sections":[{"title":"章节原题","shortTitle":"适合上墙的短标题","keyQuotes":["必须准确保留的原文"],"displayFocus":"本章展示重点","suggestedCrafts":["建议工艺"]}]}。',
        'keyQuotes 只摘录原文，不得改写；shortTitle 控制在 12 个汉字以内；不要虚构文档没有的信息。',
        countInstruction,
        wordInstruction,
      ].join('\n'),
    },
    {
      role: 'user',
      content: cleanText(sourceText, 100000),
    },
  ];
}
