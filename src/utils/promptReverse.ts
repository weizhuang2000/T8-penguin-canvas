import type { LlmMessage } from '../services/generation';

export type PromptReverseStrength = 'concise' | 'standard' | 'detailed' | 'extreme';
export type PromptReverseLanguage = 'zh' | 'en';

export const PROMPT_REVERSE_STRENGTHS: ReadonlyArray<{
  value: PromptReverseStrength;
  label: string;
  description: string;
  lengthGuide: string;
  maxTokens: number;
}> = [
  { value: 'concise', label: '简洁', description: '只保留决定画面的核心信息', lengthGuide: '约 80–160 个中文字或 60–100 个英文词', maxTokens: 1200 },
  { value: 'standard', label: '标准', description: '主体、构图、环境、光色与风格均衡', lengthGuide: '约 220–420 个中文字或 140–240 个英文词', maxTokens: 2200 },
  { value: 'detailed', label: '详细', description: '补充材质、空间层次、镜头与微观细节', lengthGuide: '约 500–800 个中文字或 300–480 个英文词', maxTokens: 3600 },
  { value: 'extreme', label: '极致', description: '最大程度复现可见元素和视觉关系', lengthGuide: '约 900–1400 个中文字或 550–850 个英文词', maxTokens: 5600 },
];

export function normalizePromptReverseStrength(value: unknown): PromptReverseStrength {
  return PROMPT_REVERSE_STRENGTHS.some((item) => item.value === value)
    ? value as PromptReverseStrength
    : 'standard';
}

export function normalizePromptReverseLanguage(value: unknown): PromptReverseLanguage {
  return value === 'en' ? 'en' : 'zh';
}

export function buildPromptReverseMessages(options: {
  imageUrls: string[];
  strength?: PromptReverseStrength;
  language?: PromptReverseLanguage;
  instruction?: string;
}): LlmMessage[] {
  const strength = normalizePromptReverseStrength(options.strength);
  const language = normalizePromptReverseLanguage(options.language);
  const detail = PROMPT_REVERSE_STRENGTHS.find((item) => item.value === strength)!;
  const images = options.imageUrls.map((url) => String(url || '').trim()).filter(Boolean);
  const languageRule = language === 'en'
    ? 'Write the final prompt entirely in English.'
    : '最终提示词使用自然、准确的简体中文；画面中必须保留的外文可使用原文并加引号。';
  const multiImageRule = images.length > 1
    ? `共有 ${images.length} 张输入图。将图 1 作为主体画面，其余图片作为补充参考；明确各参考图提供的主体、风格、材质或构图作用，最终合成一条可直接用于多参考图生成的提示词。`
    : '只有一张输入图，反推一条尽可能复现该画面的提示词。';

  return [
    {
      role: 'system',
      content: [
        '你是面向 OpenAI GPT Image 2 的专业图像提示词反推器。观察输入图像，把可见画面转换成一条可直接送入 GPT Image 2 的自然语言生成提示词。',
        '按以下优先顺序组织信息：创作意图与主体；主体外观、姿态和关系；构图、景别、视角与镜头感；场景、前中后景和空间关系；光线、色彩、材质与氛围；媒介、成像或渲染质感；最后补充关键细节与稳定性约束。',
        '只描述图像中可见或可合理确定的信息，不臆造品牌、人物身份、地点、艺术家姓名或不可见细节。画面文字只有清晰可辨时才逐字引用；无法辨认时描述其排版位置和视觉作用，不要编造文字。',
        '使用 GPT Image 2 易理解的完整自然语言。不要使用 Midjourney 参数、Stable Diffusion 权重、质量标签堆砌、负面提示词列表、JSON、Markdown、标题、项目符号、代码块、前后解释或“提示词：”前缀。',
        '最终只输出一条提示词。即使内容很长，也必须是可直接复制到生图节点的成品提示词。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            `细节强度：${detail.label}（${detail.description}；${detail.lengthGuide}）。`,
            languageRule,
            multiImageRule,
            options.instruction?.trim() ? `用户补充要求：${options.instruction.trim()}` : '',
            '请直接输出最终 GPT Image 2 提示词。',
          ].filter(Boolean).join('\n'),
        },
        ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ],
    },
  ];
}

export function cleanPromptReverseOutput(value: unknown): string {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/^```(?:text|markdown|md|json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (/^\{[\s\S]*\}$/.test(text)) {
    try {
      const parsed = JSON.parse(text);
      const prompt = parsed?.prompt || parsed?.content || parsed?.text;
      if (typeof prompt === 'string' && prompt.trim()) text = prompt.trim();
    } catch {
      // 保留非 JSON 的原始回答。
    }
  }
  return text.replace(/^\s*(?:最终)?(?:生图)?提示词\s*[:：]\s*/i, '').trim();
}
