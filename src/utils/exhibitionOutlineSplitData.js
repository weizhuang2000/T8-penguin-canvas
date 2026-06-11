export function normalizeOutlineSplitMode(value) {
  return value === 'auto' ? 'auto' : 'manual';
}

export const MAX_OUTLINE_SEGMENT_COUNT = 100;

export function normalizeOutlineSegmentCount(value) {
  const number = Math.floor(Number(value) || 4);
  return Math.max(1, Math.min(MAX_OUTLINE_SEGMENT_COUNT, number));
}

export function cleanOutlineText(value, max = 60000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function buildExhibitionOutlineSplitPrompt(values = {}) {
  const mode = normalizeOutlineSplitMode(values.mode);
  const segmentCount = normalizeOutlineSegmentCount(values.segmentCount);
  const sourceText = cleanOutlineText(values.sourceText, 60000);
  const projectTheme = cleanOutlineText(values.projectTheme, 500);
  const extraInstruction = cleanOutlineText(values.extraInstruction, 1200);
  const lines = [
    '请把以下展陈项目资料拆分为适合展厅/展线/单元策划使用的大纲单元，并对每个单元提炼总结。',
    mode === 'auto'
      ? '分段模式：自动。请根据资料自身结构、叙事阶段、主题层级和内容密度，自动判断合理单元数量。建议 3 到 8 个单元，资料特别复杂时最多 12 个。'
      : `分段模式：指定数量。请严格拆分为 ${segmentCount} 个单元，不要多也不要少。`,
    '拆分原则：保留原资料的重要事实、人物/时间/事件/成果/展项线索；每个单元要有清晰主题边界，避免泛泛而谈；相邻单元之间应体现展陈叙事推进。',
    '总结要求：每个单元输出一个可作为展陈单元标题的 title、120 到 220 字中文 summary、3 到 8 个 keywords、weightPercent 权重百分比，以及可选 sourceHint 说明主要依据的原文范围或线索。',
    '权重要求：请根据内容重要性、信息密度、展陈叙事价值和观众理解关键度分配 weightPercent。所有单元的 weightPercent 必须合计 100，使用整数百分比，不要带百分号。',
    '只输出严格 JSON，不要 Markdown，不要代码块，不要解释。',
    'JSON 格式：{"mode":"auto|manual","segmentCount":数字,"segments":[{"title":"...","summary":"...","keywords":["..."],"weightPercent":数字,"sourceHint":"..."}]}',
  ];
  if (projectTheme) lines.push(`项目主题/关键词：${projectTheme}`);
  if (extraInstruction) lines.push(`额外拆分要求：${extraInstruction}`);
  lines.push('原始资料：');
  lines.push(sourceText);
  return lines.join('\n');
}

function parsePercent(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function normalizeWeightPercents(weights, count) {
  const size = Math.max(0, Math.floor(Number(count) || 0));
  if (size === 0) return [];
  const parsed = Array.from({ length: size }, (_, index) => {
    const number = parsePercent(Array.isArray(weights) ? weights[index] : 0);
    return Number.isFinite(number) && number > 0 ? number : 0;
  });
  const source = parsed.some((number) => number > 0) ? parsed : parsed.map(() => 1);
  const total = source.reduce((sum, number) => sum + number, 0) || size;
  const base = size <= 100 ? 1 : 0;
  const remaining = Math.max(0, 100 - base * size);
  const exact = source.map((number) => (number / total) * remaining);
  const normalized = exact.map((number) => base + Math.floor(number));
  let rest = 100 - normalized.reduce((sum, number) => sum + number, 0);
  const order = exact
    .map((number, index) => ({ index, fraction: number - Math.floor(number) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; rest > 0 && order.length > 0; i += 1) {
    normalized[order[i % order.length].index] += 1;
    rest -= 1;
  }
  while (rest < 0) {
    const index = normalized.indexOf(Math.max(...normalized));
    if (index < 0 || normalized[index] <= 0) break;
    normalized[index] -= 1;
    rest += 1;
  }
  return normalized;
}

function stripJsonFence(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function pickJsonObject(value) {
  const stripped = stripJsonFence(value);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}

export function normalizeOutlineSegments(value) {
  const source = Array.isArray(value) ? value : [];
  const segments = source
    .map((item, index) => {
      const title = cleanOutlineText(item?.title || item?.name || `单元 ${index + 1}`, 80);
      const summary = cleanOutlineText(item?.summary || item?.content || item?.text, 1200);
      if (!summary) return null;
      const rawKeywords = Array.isArray(item?.keywords)
        ? item.keywords
        : String(item?.keywords || '')
          .split(/[、,，\n]/)
          .map((keyword) => keyword.trim());
      const keywords = Array.from(new Set(rawKeywords.map((keyword) => cleanOutlineText(keyword, 30)).filter(Boolean))).slice(0, 8);
      const sourceHint = cleanOutlineText(item?.sourceHint || item?.source || item?.basis, 160);
      return {
        title,
        summary,
        keywords,
        weightPercent: parsePercent(item?.weightPercent ?? item?.weight ?? item?.percent ?? item?.importancePercent),
        ...(sourceHint ? { sourceHint } : {}),
      };
    })
    .filter(Boolean);
  const weights = normalizeWeightPercents(segments.map((segment) => segment.weightPercent), segments.length);
  return segments.map((segment, index) => ({
    ...segment,
    weightPercent: weights[index] || 0,
  }));
}

export function parseExhibitionOutlineSplitJson(content) {
  const parsed = JSON.parse(pickJsonObject(content));
  const segments = normalizeOutlineSegments(parsed?.segments);
  if (segments.length === 0) throw new Error('LLM 未返回有效分段');
  return {
    mode: normalizeOutlineSplitMode(parsed?.mode),
    segmentCount: Math.max(1, Math.floor(Number(parsed?.segmentCount) || segments.length)),
    segments,
  };
}

export function formatOutlineSegments(segments) {
  return normalizeOutlineSegments(segments)
    .map((segment, index) => {
      const lines = [
        `单元 ${index + 1}：${segment.title}（权重 ${segment.weightPercent}%）`,
        segment.summary,
      ];
      if (segment.keywords.length > 0) lines.push(`关键词：${segment.keywords.join('、')}`);
      if (segment.sourceHint) lines.push(`依据：${segment.sourceHint}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function fallbackOutlineSplit(sourceText, segmentCount) {
  const text = cleanOutlineText(sourceText, 60000);
  if (!text) return [];
  const target = normalizeOutlineSegmentCount(segmentCount);
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const units = paragraphs.length >= target ? paragraphs : text.match(/[^。！？!?]+[。！？!?]?/g)?.map((part) => part.trim()).filter(Boolean) || [text];
  const bucketSize = Math.ceil(units.length / target);
  const segments = [];
  for (let i = 0; i < target; i += 1) {
    const chunk = units.slice(i * bucketSize, (i + 1) * bucketSize).join('\n\n').trim();
    if (!chunk) continue;
    const summary = chunk.length > 360 ? `${chunk.slice(0, 360)}...` : chunk;
    segments.push({
      title: `内容单元 ${i + 1}`,
      summary,
      keywords: [],
      weightPercent: 0,
      sourceHint: `规则分块 ${i + 1}/${target}`,
    });
  }
  const fallback = segments.length > 0 ? segments : [{
    title: '内容单元 1',
    summary: text.length > 360 ? `${text.slice(0, 360)}...` : text,
    keywords: [],
    weightPercent: 100,
  }];
  const weights = normalizeWeightPercents(fallback.map((segment) => segment.summary.length), fallback.length);
  return fallback.map((segment, index) => ({
    ...segment,
    weightPercent: weights[index] || 0,
  }));
}
