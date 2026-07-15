'use strict';

const {RULE_CATALOG, SKILL_SOURCE} = require('./skillCatalog');

const SKILL_VERSION = 't8-remotion-skill/v2';
const MAX_TEXT_CONTEXT = 80_000;
const MAX_SKILL_CONTEXT = 24_000;
const BASE_RULE_IDS = Object.freeze(['animations', 'timing', 'sequencing', 'assets', 'compositions', 'parameters']);
const MEDIA_RULES = Object.freeze({
  image: ['images'],
  video: ['videos', 'trimming', 'can-decode', 'get-video-duration', 'get-video-dimensions', 'extract-frames'],
  audio: ['audio', 'get-audio-duration'],
});
const INTERNAL_SECURITY_RULE = '【T8 安全契约】只允许 react、remotion、@remotion/media、@remotion/transitions 及其白名单子路径、@t8/remotion-kit。禁止 require、动态 import、fetch、WebSocket、文件系统、进程、存储、eval/Function、Worker、外部 URL 和原生媒体标签。';

const STYLE_GUIDES = Object.freeze({
  auto: '根据主题和素材选择统一、克制、具有明确视觉层级的风格。',
  cinematic: '电影感：深色或受控高光、慢速运镜、大字少字、强构图与留白。',
  editorial: '编辑设计：网格排版、杂志式字体层级、切片与对齐线、节奏清晰。',
  tech: '科技感：深色背景、冷色渐变、细线网格、数据卡片与精准缓动，避免廉价霓虹堆叠。',
  minimal: '极简：有限色板、大留白、少量高质量运动和清晰信息层级。',
  playful: '活泼：明快配色、弹性但克制的节奏、圆角图形与有层次的错峰入场。',
});

function safeText(value, max = 20_000) {
  return String(value || '').trim().slice(0, max);
}

function combinedInputText(input = {}) {
  return `${input.subject || ''}\n${(input.texts || []).map((item) => item?.text || '').join('\n')}`.toLowerCase();
}

function addMatches(ids, text) {
  for (const rule of Object.values(RULE_CATALOG)) {
    if (!rule.triggers.length || ids.includes(rule.id)) continue;
    if (rule.triggers.some((trigger) => text.includes(String(trigger).toLowerCase()))) ids.push(rule.id);
  }
}

function selectSkillRules(input = {}) {
  const ids = [...BASE_RULE_IDS];
  const kinds = new Set((input.assets || []).map((asset) => String(asset?.kind || '')));
  for (const kind of kinds) ids.push(...(MEDIA_RULES[kind] || []));
  const text = combinedInputText(input);
  if (text.trim()) ids.push('text-animations', 'measuring-text', 'fonts');
  if (Number(input.profile?.duration) >= 4 || /场景|分镜|转场|scene|transition/.test(text)) ids.push('transitions');
  if (/图表|数据|趋势|增长|占比|柱状|折线|饼图|chart|graph|data/.test(text)) ids.push('charts');
  if (/字幕|台词|caption|subtitle|srt/.test(text)) ids.push('subtitles', 'display-captions');
  if (/-->\s*\d{2}:\d{2}:\d{2}/.test(text) || /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) ids.push('import-srt-captions');
  if (/静音|去停顿|remove silence|silence/.test(text)) ids.push('silence-detection', 'ffmpeg');
  if (/音效|sound effect|sfx/.test(text)) ids.push('sfx');
  addMatches(ids, text);
  return [...new Set(ids)].filter((id) => RULE_CATALOG[id]);
}

function ruleDetails(input = {}) {
  return selectSkillRules(input).map((id) => {
    const rule = RULE_CATALOG[id];
    return {
      id,
      support: rule.support,
      phases: [...rule.phases],
      ...(rule.reason ? {reason: rule.reason} : {}),
    };
  });
}

function buildSkillContext(input = {}, phase = 'code') {
  const details = ruleDetails(input);
  const style = STYLE_GUIDES[input.stylePreset] || STYLE_GUIDES.auto;
  const mode = input.mode === 'json' ? 'json' : 'tsx';
  const selected = details.filter((detail) => detail.support !== 'disabled' && detail.phases.includes(phase));
  const lines = [
    `内置规则版本：${SKILL_VERSION}`,
    `上游来源：${SKILL_SOURCE.name}@${SKILL_SOURCE.pluginVersion} (${SKILL_SOURCE.snapshot})`,
    `视觉风格：${style}`,
    INTERNAL_SECURITY_RULE,
  ];
  for (const detail of selected) {
    const rule = RULE_CATALOG[detail.id];
    const line = `【${detail.support === 'adapted' ? '安全适配' : '规则'} · ${detail.id}】${rule.prompt}`;
    if (lines.join('\n').length + line.length + 1 > MAX_SKILL_CONTEXT) break;
    lines.push(line);
  }
  if (mode === 'tsx' && ['plan', 'code'].includes(phase)) {
    lines.push('可优先复用 @t8/remotion-kit：SafeArea、KineticText、WordReveal、TypewriterText、WordHighlight、NumberCounter、KenBurnsMedia、GlassCard、GradientBackdrop、NoiseOverlay、Vignette、SplitReveal、FitText、CaptionTrack、BarChart、LineChart、AnimatedPieChart、AnimatedPath。');
  }
  if (mode === 'json') lines.push('当前为 JSON DSL：不得输出 TSX、import、组件名或 DSL 未定义的能力。');
  const disabled = details.filter((detail) => detail.support === 'disabled');
  const warnings = disabled.map((detail) => `${detail.id}：${detail.reason}`);
  return {
    version: SKILL_VERSION,
    source: SKILL_SOURCE,
    phase,
    ruleIds: selected.map((detail) => detail.id),
    details,
    warnings,
    text: lines.join('\n').slice(0, MAX_SKILL_CONTEXT),
  };
}

function skillStatus() {
  const groups = {enabled: [], adapted: [], disabled: []};
  for (const rule of Object.values(RULE_CATALOG)) groups[rule.support].push(rule.id);
  return {version: SKILL_VERSION, source: SKILL_SOURCE, capabilities: groups, ruleCount: Object.keys(RULE_CATALOG).length};
}

function normalizeGenerationInput(raw = {}) {
  const quality = raw.quality === 'professional' ? 'professional' : 'standard';
  const mode = raw.mode === 'tsx' ? 'tsx' : 'json';
  const stylePreset = Object.prototype.hasOwnProperty.call(STYLE_GUIDES, raw.stylePreset) ? raw.stylePreset : 'auto';
  const assets = Array.isArray(raw.assets) ? raw.assets.slice(0, 32).map((asset, index) => ({
    id: safeText(asset?.id || `asset-${index + 1}`, 80),
    kind: ['image', 'video', 'audio'].includes(asset?.kind) ? asset.kind : 'image',
    url: safeText(asset?.url, 10_000),
    label: safeText(asset?.label, 200),
  })) : [];
  let remaining = MAX_TEXT_CONTEXT;
  const texts = [];
  for (const item of Array.isArray(raw.texts) ? raw.texts.slice(0, 32) : []) {
    if (remaining <= 0) break;
    const text = safeText(item?.text, remaining);
    remaining -= text.length;
    texts.push({id: safeText(item?.id, 120), label: safeText(item?.label, 200), text});
  }
  return {
    mode,
    quality,
    stylePreset,
    llmKeyId: safeText(raw.llmKeyId, 120),
    reviewLlmKeyId: safeText(raw.reviewLlmKeyId, 120),
    subject: safeText(raw.subject, 20_000),
    texts,
    assets,
    profile: raw.profile && typeof raw.profile === 'object' ? raw.profile : {},
    historyContext: raw.historyContext && typeof raw.historyContext === 'object' ? raw.historyContext : {},
  };
}

const RULES = Object.freeze(Object.fromEntries(Object.values(RULE_CATALOG).map((rule) => [rule.id, rule.prompt])));

module.exports = {
  BASE_RULE_IDS,
  MAX_SKILL_CONTEXT,
  MAX_TEXT_CONTEXT,
  RULES,
  RULE_CATALOG,
  SKILL_SOURCE,
  SKILL_VERSION,
  STYLE_GUIDES,
  buildSkillContext,
  normalizeGenerationInput,
  ruleDetails,
  selectSkillRules,
  skillStatus,
};
