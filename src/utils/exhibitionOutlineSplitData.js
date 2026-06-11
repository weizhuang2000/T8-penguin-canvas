export function normalizeOutlineSplitMode(value) {
  return value === 'auto' ? 'auto' : 'manual';
}

export function normalizeOutlineSegmentCount(value) {
  const number = Math.floor(Number(value) || 4);
  return Math.max(1, Math.min(24, number));
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
    '总结要求：每个单元输出一个可作为展陈单元标题的 title、120 到 220 字中文 summary、3 到 8 个 keywords，以及可选 sourceHint 说明主要依据的原文范围或线索。',
    '只输出严格 JSON，不要 Markdown，不要代码块，不要解释。',
    'JSON 格式：{"mode":"auto|manual","segmentCount":数字,"segments":[{"title":"...","summary":"...","keywords":["..."],"sourceHint":"..."}]}',
  ];
  if (projectTheme) lines.push(`项目主题/关键词：${projectTheme}`);
  if (extraInstruction) lines.push(`额外拆分要求：${extraInstruction}`);
  lines.push('原始资料：');
  lines.push(sourceText);
  return lines.join('\n');
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
  return source
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
        ...(sourceHint ? { sourceHint } : {}),
      };
    })
    .filter(Boolean);
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
        `单元 ${index + 1}：${segment.title}`,
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
      sourceHint: `规则分块 ${i + 1}/${target}`,
    });
  }
  return segments.length > 0 ? segments : [{
    title: '内容单元 1',
    summary: text.length > 360 ? `${text.slice(0, 360)}...` : text,
    keywords: [],
  }];
}
