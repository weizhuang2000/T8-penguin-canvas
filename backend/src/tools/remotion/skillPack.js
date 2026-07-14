'use strict';

const SKILL_VERSION = 't8-remotion-skill/v1';
const MAX_TEXT_CONTEXT = 80_000;

const RULES = Object.freeze({
  animations: `【按帧动画】所有运动必须由 useCurrentFrame() 驱动，并用 useVideoConfig() 的 fps 将秒换算为帧。禁止 CSS animation、CSS transition 和 Tailwind 动画类。`,
  timing: `【时间曲线】优先使用 interpolate() 配合左右 clamp 与 Easing.bezier；入场使用自然减速，退场使用加速。先生成 0..1 的统一进度，再映射透明度、位移和缩放。`,
  sequencing: `【时间线】用 Sequence/Series 管理出现时间和时长；每个 Sequence 必须设置 premountFor={fps}。Sequence 内 useCurrentFrame() 从局部 0 开始。`,
  assets: `【素材安全】只能使用 props.assets 中给定的 ID。通过 assets.find() 查找并使用 staticFile('assets/'+asset.src)。不得写入远程 URL、绝对路径或 data URL。`,
  text: `【文字】建立清晰的标题/副标题/正文层级和安全边距；中文使用系统字体栈。打字机效果必须使用字符串 slice，不要逐字设置透明度。避免文字溢出和整屏堆字。`,
  images: `【图片】只能使用 remotion 的 Img，禁止原生 img 和 CSS background-image。图片运动应克制，可用 Ken Burns、遮罩或分屏揭示，并保留主体。`,
  videos: `【视频】使用 @remotion/media 的 Video，并用 Sequence 控制时间；按需设置 trimBefore、loop、muted、volume、objectFit，禁止反向播放。`,
  audio: `【音频】使用 @remotion/media 的 Audio；用 Sequence 控制起点，音量回调用帧插值实现淡入淡出，避免突兀截断。`,
  transitions: `【转场】多场景优先使用 @remotion/transitions 的 TransitionSeries，转场会重叠并缩短总时间，必须据此计算各场景帧数。转场服务于叙事，避免每场使用不同花哨效果。`,
  charts: `【图表】使用内部 BarChart/LineChart 或原生 SVG；所有图表动画仍由当前帧驱动，不依赖第三方动画。数值必须可读，坐标和颜色保持一致。`,
  security: `【输出安全】只允许 react、remotion、@remotion/media、@remotion/transitions 及其白名单子路径、@t8/remotion-kit。禁止 require、动态 import、fetch、WebSocket、文件系统、进程、存储、eval/Function、Worker、外部 URL 和原生媒体标签。`,
});

const BASE_RULE_IDS = Object.freeze(['animations', 'timing', 'sequencing', 'assets', 'security']);
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

function selectSkillRules(input = {}) {
  const ids = [...BASE_RULE_IDS];
  const kinds = new Set((input.assets || []).map((asset) => String(asset?.kind || '')));
  const combinedText = `${input.subject || ''}\n${(input.texts || []).map((item) => item?.text || '').join('\n')}`;
  if (combinedText.trim()) ids.push('text');
  if (kinds.has('image')) ids.push('images');
  if (kinds.has('video')) ids.push('videos');
  if (kinds.has('audio')) ids.push('audio');
  if (Number(input.profile?.duration) >= 4 || /场景|分镜|转场|scene|transition/i.test(combinedText)) ids.push('transitions');
  if (/图表|数据|趋势|增长|占比|柱状|折线|chart|graph|data/i.test(combinedText)) ids.push('charts');
  return [...new Set(ids)];
}

function buildSkillContext(input = {}) {
  const ruleIds = selectSkillRules(input);
  const style = STYLE_GUIDES[input.stylePreset] || STYLE_GUIDES.auto;
  return {
    version: SKILL_VERSION,
    ruleIds,
    text: [
      `内置规则版本：${SKILL_VERSION}`,
      `视觉风格：${style}`,
      ...ruleIds.map((id) => RULES[id]),
      `可优先复用 @t8/remotion-kit：SafeArea、KineticText、WordReveal、NumberCounter、KenBurnsMedia、GlassCard、GradientBackdrop、NoiseOverlay、Vignette、SplitReveal、BarChart、LineChart。`,
    ].join('\n'),
  };
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
    texts.push({ id: safeText(item?.id, 120), label: safeText(item?.label, 200), text });
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

module.exports = {
  BASE_RULE_IDS,
  MAX_TEXT_CONTEXT,
  RULES,
  SKILL_VERSION,
  STYLE_GUIDES,
  buildSkillContext,
  normalizeGenerationInput,
  selectSkillRules,
};
