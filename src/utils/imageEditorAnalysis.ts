import type { ResourceCategory, ResourceImageAnalysis } from '../services/api';
import type { LlmMessage } from '../services/generation';
import type { PromptReverseLanguage, PromptReverseStrength } from './promptReverse';

const ANALYSIS_STRENGTHS: Record<PromptReverseStrength, { label: string; description: string; lengthGuide: string }> = {
  concise: { label: '简洁', description: '只保留决定画面的核心信息', lengthGuide: '约 80–160 个中文字或 60–100 个英文词' },
  standard: { label: '标准', description: '主体、构图、环境、光色与风格均衡', lengthGuide: '约 220–420 个中文字或 140–240 个英文词' },
  detailed: { label: '详细', description: '补充材质、空间层次、镜头与微观细节', lengthGuide: '约 500–800 个中文字或 300–480 个英文词' },
  extreme: { label: '极致', description: '最大程度复现可见元素和视觉关系', lengthGuide: '约 900–1400 个中文字或 550–850 个英文词' },
};

function normalizeStrength(value: PromptReverseStrength): PromptReverseStrength {
  return Object.prototype.hasOwnProperty.call(ANALYSIS_STRENGTHS, value) ? value : 'standard';
}

function normalizeLanguage(value: PromptReverseLanguage): PromptReverseLanguage {
  return value === 'en' ? 'en' : 'zh';
}

export interface ImageEditorAnalysisResult {
  prompt: string;
  categoryId: string;
  secondaryTags: string[];
}

function stripJsonFence(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function buildImageEditorAnalysisMessages(options: {
  imageUrl: string;
  strength: PromptReverseStrength;
  language: PromptReverseLanguage;
  categories: ResourceCategory[];
  includeClassification: boolean;
}): LlmMessage[] {
  const strength = normalizeStrength(options.strength);
  const language = normalizeLanguage(options.language);
  const detail = ANALYSIS_STRENGTHS[strength];
  const categories = options.categories
    .filter((item) => item.kind === 'image')
    .map((item) => ({ id: item.id, name: item.name }));
  const languageRule = language === 'en'
    ? 'The prompt field must be entirely in English, except visible text that must retain its original language.'
    : 'prompt 字段必须使用自然、准确的简体中文；必须保留的外文可使用原文并加引号。';
  const classificationRule = options.includeClassification
    ? [
        `categoryId 必须从以下分类中选择且只能选择一个：${JSON.stringify(categories)}。`,
        'secondaryTags 提取图像中其它最重要且适合搜索的内容标签，去重后最多 3 个；不要重复分类名称。',
      ].join('\n')
    : '本次只补充缺失强度的 prompt；categoryId 输出空字符串，secondaryTags 输出空数组。';

  return [
    {
      role: 'system',
      content: [
        '你是网页版改图的单图视觉分析器。准确反推这一张图，并返回严格 JSON。',
        'prompt 要可直接送入 GPT Image 2，完整描述主体关系、构图、景别、视角、空间层次、光线、色彩、材质、媒介与成像质感。',
        '只描述可见或可合理确定的信息，不臆造身份、品牌、地点或不可见细节。',
        `细节强度：${detail.label}（${detail.description}；${detail.lengthGuide}）。`,
        languageRule,
        classificationRule,
        '只输出一个 JSON 对象，结构必须是 {"prompt":"...","categoryId":"...","secondaryTags":["..."]}；不要输出 Markdown、解释或其它字段。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: '分析这张图片并直接返回规定 JSON。' },
        { type: 'image_url', image_url: { url: String(options.imageUrl || '').trim() } },
      ],
    },
  ];
}

export function parseImageEditorAnalysisOutput(
  value: unknown,
  categories: ResourceCategory[],
  fallbackCategoryId: string,
): ImageEditorAnalysisResult | null {
  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFence(value));
  } catch {
    return null;
  }
  const prompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : '';
  if (!prompt) return null;
  const allowedIds = new Set(categories.filter((item) => item.kind === 'image').map((item) => item.id));
  const requestedCategoryId = String(parsed?.categoryId || '').trim();
  const categoryId = allowedIds.has(requestedCategoryId) ? requestedCategoryId : fallbackCategoryId;
  const secondaryTags: string[] = Array.isArray(parsed?.secondaryTags)
    ? [...new Set<string>(parsed.secondaryTags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean))].slice(0, 3)
    : [];
  return { prompt, categoryId, secondaryTags };
}

export function getImageEditorCachedPrompt(
  analysis: ResourceImageAnalysis | null | undefined,
  strength: PromptReverseStrength,
  language: PromptReverseLanguage,
): string {
  return String(analysis?.reversePrompts?.[strength]?.[language] || '').trim();
}

export function mergeImageEditorAnalysis(
  current: ResourceImageAnalysis | null | undefined,
  options: {
    strength: PromptReverseStrength;
    language: PromptReverseLanguage;
    prompt: string;
    secondaryTags?: string[];
    classifiedAt?: number;
  },
): ResourceImageAnalysis {
  return {
    version: 1,
    secondaryTags: options.secondaryTags
      ? [...new Set(options.secondaryTags.map((tag) => String(tag || '').trim()).filter(Boolean))].slice(0, 3)
      : [...(current?.secondaryTags || [])],
    reversePrompts: {
      ...(current?.reversePrompts || {}),
      [options.strength]: {
        ...(current?.reversePrompts?.[options.strength] || {}),
        [options.language]: String(options.prompt || '').trim(),
      },
    },
    classifiedAt: options.classifiedAt || current?.classifiedAt || 0,
  };
}

export function buildImageEditorCachedPromptMergeMessages(options: {
  prompts: string[];
  contentText?: string;
  language: PromptReverseLanguage;
}): LlmMessage[] {
  const prompts = options.prompts.map((prompt) => String(prompt || '').trim()).filter(Boolean);
  const contentText = String(options.contentText || '').trim();
  const language = normalizeLanguage(options.language);
  const languageRule = language === 'en'
    ? 'Write the final prompt in English, except explicitly required visible text in another language.'
    : '最终提示词使用自然、准确的简体中文；明确要求的外文可见文字必须保留原文。';
  return [
    {
      role: 'system',
      content: [
        '你是面向 GPT Image 2 的多参考图提示词合成器。输入内容是已经逐图提炼并缓存的提示词，不需要再次看图。',
        '图 1 是主体画面；其余提示词只补充风格、材质、造型或构图信息。合成一条连贯、无冲突、可直接生图的自然语言提示词。',
        contentText
          ? '严格保留缓存提示词的视觉形式，同时用用户内容文本替换主体、场景、叙事、符号和可见文字等语义内容。'
          : '没有新的内容文本时，保留图 1 的主体语义，并吸收其它图片的互补视觉信息。',
        languageRule,
        '不要输出 JSON、Markdown、标题、解释、负面提示词列表或参数；只输出最终提示词。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `按选择顺序排列的逐图缓存提示词：${JSON.stringify(prompts)}`,
        contentText ? `用户内容文本：${JSON.stringify(contentText)}` : '用户内容文本：空',
        '直接输出合成后的最终提示词。',
      ].join('\n'),
    },
  ];
}

export function buildPromptReverseCachedCompositionMessages(options: {
  prompts: string[];
  instruction?: string;
  language: PromptReverseLanguage;
}): LlmMessage[] {
  const prompts = options.prompts.map((prompt) => String(prompt || '').trim()).filter(Boolean);
  const instruction = String(options.instruction || '').trim();
  const language = normalizeLanguage(options.language);
  const languageRule = language === 'en'
    ? 'Write the final prompt in English, except visible text that must retain another language.'
    : '最终提示词使用自然、准确的简体中文；必须保留的外文可见文字使用原文并加引号。';
  return [
    {
      role: 'system',
      content: [
        '你是面向 GPT Image 2 的缓存提示词合成器。输入是按图片顺序排列的纯图像反推提示词，不需要再次查看图片。',
        '图 1 是主体画面；其余图片只补充风格、材质、造型或构图信息。输出一条连贯、无冲突、可直接生图的自然语言提示词。',
        instruction
          ? '用户补充要求只用于调整本次最终提示词，不得把它描述成分析过程，也不得削弱没有要求修改的视觉信息。'
          : '没有补充要求时，保持图 1 的主体语义，并吸收其它图片的互补视觉信息。',
        languageRule,
        '不要输出 JSON、Markdown、标题、解释、负面提示词列表或参数；只输出最终提示词。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `按图片顺序排列的缓存提示词：${JSON.stringify(prompts)}`,
        instruction ? `本次反推补充要求：${JSON.stringify(instruction)}` : '本次反推补充要求：无',
        '直接输出合成后的最终 GPT Image 2 提示词。',
      ].join('\n'),
    },
  ];
}
