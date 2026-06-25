export const EXHIBITION_IMAGE_NAME_LIMIT = 6;

export function normalizeExhibitionImageName(value: unknown): string {
  const text = String(value || '')
    .replace(/["“”'‘’`]/g, '')
    .replace(/^[\s\-_.。，“”‘’：:]+|[\s\-_.。，“”‘’：:]+$/g, '')
    .trim();
  return Array.from(text).slice(0, EXHIBITION_IMAGE_NAME_LIMIT).join('');
}

export function formatExhibitionOutputImageName(baseName: unknown, index: number, total: number, fallback = '展陈图'): string {
  const base = normalizeExhibitionImageName(baseName) || normalizeExhibitionImageName(fallback) || '展陈图';
  return total > 1 ? `${base}-${Math.max(1, index)}` : base;
}

export async function generateExhibitionImageNameWithLlm({
  generateLlm,
  model,
  llmKeyId,
  material,
  fallback = '展陈图',
}: {
  generateLlm: (req: any) => Promise<{ content?: string }>;
  model: string;
  llmKeyId?: string;
  material: string;
  fallback?: string;
}): Promise<string> {
  const source = String(material || '').trim();
  if (!source) return normalizeExhibitionImageName(fallback);
  const response = await generateLlm({
    model,
    llmKeyId,
    temperature: 0.2,
    max_tokens: 30,
    messages: [
      {
        role: 'system',
        content: '你是展陈图像命名助手。只输出一个中文短名称，最多6个字，不要标点、编号、解释或引号。',
      },
      {
        role: 'user',
        content: [
          '请根据以下展陈内容，为即将生成的效果图取一个简洁图像名称。',
          '要求：中文，最多6个字，只输出名称本身。',
          '',
          source.slice(0, 4000),
        ].join('\n'),
      },
    ],
  });
  return normalizeExhibitionImageName(response.content) || normalizeExhibitionImageName(fallback);
}
