export type ArtistStyleOutputMode = 'prompt' | 'image';

export interface ArtistStyleItem {
  id: string;
  name: string;
  chineseName: string;
  displayName: string;
  movement: string;
  movementZh: string;
  category: string;
  categoryZh: string;
  cue: string;
  sourceOrder: number;
  imageUrl: string;
  thumbnailUrl: string;
  tags: readonly string[];
  userCreated?: boolean;
}

export interface ArtistStyleTaxonomy {
  id: string;
  label: string;
  labelZh: string;
}

export interface ArtistStyleCategory {
  id: string;
  name: string;
}

export interface ArtistStyleUserLibrary {
  categories: ArtistStyleCategory[];
  styles: ArtistStyleItem[];
}

export interface ArtistStyleSearchOptions {
  query?: string;
  movement?: string;
  category?: string;
  limit?: number;
}

export interface ArtistStyleMaterialInput {
  imageUrl: string;
  title?: string;
  prompt: string;
  negativePrompt?: string;
  categoryZh?: string;
  tags?: string[];
  sourceNodeId?: string;
}

export interface ArtistStyleOutputPayload {
  kind: 'text' | 'image';
  data: {
    directOutputText: string;
    outputText: string;
    prompt: string;
    text: string;
    directImageUrl?: string;
    imageUrl?: string;
    directImageUrls?: string[];
    imageUrls?: string[];
    lastPrompt?: string;
    artistStyleId?: string;
    artistStyleName?: string;
    artistStyleChineseName?: string;
  };
}

export interface ArtistStyleExportPack extends ArtistStyleUserLibrary {
  schema: typeof ARTIST_STYLE_MASTER_EXPORT_SCHEMA;
  exportedAt: string;
}

export const ARTIST_STYLE_MASTER_STORAGE_KEY = 't8-artist-style-master:user-library:v1';
export const ARTIST_STYLE_MASTER_EXPORT_SCHEMA = 't8-artist-style-master@1';

const COLLATOR = new Intl.Collator('zh-Hans-CN');

export function slugifyArtistStyle(value: string): string {
  const fallback = 'artist-style';
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const item = textOf(value);
    if (!item) return;
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

function simpleHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = url.startsWith('http') ? new URL(url) : new URL(url, 'http://local');
    return decodeURIComponent(parsed.pathname.split('/').pop() || '') || 'image-style';
  } catch {
    return url.split(/[\\/]/).pop()?.split(/[?#]/)[0] || 'image-style';
  }
}

function stripExtension(value: string): string {
  return value.replace(/\.[a-z0-9]{2,8}$/i, '').trim();
}

export function createArtistStyleFromMaterial(input: ArtistStyleMaterialInput): ArtistStyleItem {
  const imageUrl = textOf(input.imageUrl);
  const prompt = textOf(input.prompt);
  const negativePrompt = textOf(input.negativePrompt);
  const rawTitle = textOf(input.title) || fileNameFromUrl(imageUrl);
  const name = stripExtension(rawTitle) || 'material-style';
  const categoryZh = textOf(input.categoryZh) || '素材收藏';
  const category = slugifyArtistStyle(categoryZh);
  const cue = [
    prompt,
    negativePrompt ? `Negative prompt: ${negativePrompt}` : '',
  ].filter(Boolean).join('\n\n');

  return normalizeArtistStyleItem({
    id: `material-${slugifyArtistStyle(name)}-${simpleHash(`${imageUrl}\n${prompt}`)}`,
    name,
    chineseName: name,
    displayName: name,
    movement: 'User',
    movementZh: '自定义风格',
    category,
    categoryZh,
    cue,
    imageUrl,
    thumbnailUrl: imageUrl,
    tags: uniqueStrings([
      ...(Array.isArray(input.tags) ? input.tags : []),
      '素材右键',
      categoryZh,
      textOf(input.sourceNodeId),
    ]),
    sourceOrder: Date.now(),
    userCreated: true,
  });
}

export function normalizeArtistStyleItem(input: Partial<ArtistStyleItem> & { name?: string }): ArtistStyleItem {
  const name = textOf(input.name) || 'Untitled Artist Style';
  const chineseName = textOf(input.chineseName) || name;
  const movement = textOf(input.movement) || 'User';
  const movementZh = textOf(input.movementZh) || '自定义风格';
  const category = textOf(input.category) || movement;
  const categoryZh = textOf(input.categoryZh) || movementZh;
  const imageUrl = textOf(input.imageUrl);
  const id = textOf(input.id) || `${slugifyArtistStyle(name)}-${Date.now().toString(36)}`;
  const tags = uniqueStrings([
    ...(Array.isArray(input.tags) ? input.tags : []),
    name,
    chineseName,
    movement,
    movementZh,
    category,
    categoryZh,
  ]);

  return {
    id,
    name,
    chineseName,
    displayName: textOf(input.displayName) || name,
    movement,
    movementZh,
    category,
    categoryZh,
    cue: textOf(input.cue) || '综合视觉风格，用同一场景观察个人化图像语言',
    sourceOrder: Number.isFinite(input.sourceOrder) ? Number(input.sourceOrder) : 9999,
    imageUrl,
    thumbnailUrl: textOf(input.thumbnailUrl) || imageUrl,
    tags,
    userCreated: input.userCreated ?? true,
  };
}

export function normalizeArtistStyleLibrary(input: Partial<ArtistStyleUserLibrary> | null | undefined): ArtistStyleUserLibrary {
  const categories = Array.isArray(input?.categories)
    ? input.categories
        .map((item) => ({
          id: textOf(item?.id) || slugifyArtistStyle(textOf(item?.name)),
          name: textOf(item?.name) || textOf(item?.id) || '未分类',
        }))
        .filter((item) => item.id && item.name)
    : [];

  const styles = Array.isArray(input?.styles)
    ? input.styles
        .map((item) => normalizeArtistStyleItem(item))
        .filter((item) => item.name && item.imageUrl)
    : [];

  return {
    categories: dedupeCategories(categories),
    styles: dedupeStyles(styles),
  };
}

function dedupeCategories(categories: ArtistStyleCategory[]): ArtistStyleCategory[] {
  const byId = new Map<string, ArtistStyleCategory>();
  categories.forEach((category) => {
    byId.set(category.id, category);
  });
  return Array.from(byId.values()).sort((a, b) => COLLATOR.compare(a.name, b.name));
}

function dedupeStyles(styles: ArtistStyleItem[]): ArtistStyleItem[] {
  const byId = new Map<string, ArtistStyleItem>();
  styles.forEach((style) => byId.set(style.id, style));
  return Array.from(byId.values()).sort((a, b) => COLLATOR.compare(a.chineseName || a.name, b.chineseName || b.name));
}

export function searchArtistStyles(items: readonly ArtistStyleItem[], options: ArtistStyleSearchOptions = {}): ArtistStyleItem[] {
  const query = textOf(options.query).toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  const movement = textOf(options.movement);
  const category = textOf(options.category);
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : undefined;

  const matches = items
    .filter((item) => {
      if (movement && movement !== 'all' && item.movement !== movement) return false;
      if (category && category !== 'all' && item.category !== category && item.categoryZh !== category) return false;
      if (!terms.length) return true;
      const haystack = [
        item.name,
        item.chineseName,
        item.displayName,
        item.movement,
        item.movementZh,
        item.category,
        item.categoryZh,
        item.cue,
        ...item.tags,
      ]
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => a.sourceOrder - b.sourceOrder || COLLATOR.compare(a.chineseName || a.name, b.chineseName || b.name));

  return typeof limit === 'number' ? matches.slice(0, limit) : matches;
}

const ARTIST_STYLE_REFERENCE_SUFFIX =
  'Use this as a visual style reference: composition language, line quality, color palette, lighting, texture, mood and design rhythm.';

export function buildArtistStylePrompt(item: ArtistStyleItem): string {
  const styleCue = textOf(item.cue) || textOf(item.displayName) || textOf(item.chineseName) || textOf(item.name);
  const styleName = textOf(item.chineseName) || textOf(item.displayName) || textOf(item.name);
  const leading = styleName && styleCue && styleCue !== styleName ? `${styleName}，${styleCue}` : (styleCue || styleName);
  return [leading, ARTIST_STYLE_REFERENCE_SUFFIX].filter(Boolean).join(', ');
}

export function buildArtistStyleRedrawPrompt(item: ArtistStyleItem, options: { beautify?: boolean } = {}): string {
  const styleName = [textOf(item.chineseName), textOf(item.name)].filter(Boolean).join(' / ');
  const movement = [textOf(item.movementZh), textOf(item.movement)].filter(Boolean).join(' / ');
  const tags = (Array.isArray(item.tags) ? item.tags : []).map(textOf).filter(Boolean).join('、');
  const beautify = options.beautify === true;
  const lines = [
    '任务：使用两张参考图进行艺术风格重绘。第一张参考图是原始图像，是构图、主体、内容、空间关系、镜头角度、透视、文字区域和主要细节的唯一依据；第二张参考图只用于提取艺术风格。',
    '',
    `目标艺术风格：${styleName || textOf(item.displayName) || '已选艺术风格'}`,
    movement && `风格流派：${movement}`,
    textOf(item.cue) && `风格特征：${textOf(item.cue)}`,
    tags && `风格标签：${tags}`,
    '',
    '必须保留：原始图像的整体构图、主体数量、主体位置、主体轮廓、人物/物体/空间关系、镜头高度、透视角度、主要内容、文字所在区域和版式层级。',
    '允许改变：笔触、线条质量、色彩倾向、明暗关系、光影氛围、纹理、材质表现、边缘处理、细节绘制方式和整体艺术质感，使结果看起来像是与第二张艺术风格参考图出自同一位作者。',
    beautify
      ? '美化模式已开启：在保持整体构图大框架、主体数量、主要内容、空间/人物/物体关系和镜头透视不变的基础上，可以对画面里各对象主体的姿态、位置、朝向、边缘轮廓和细节节奏做轻微微调，使整体画面更加美化、更贴近第二张风格参考图的审美秩序；所有调整必须克制，不得让原图一眼看上去变成不同构图。'
      : '美化模式关闭：不要移动、删除、替换或新增原始图像中的主体；不要改变主体姿态、主体位置、空间关系或构图重心。',
    '禁止改变：不要删除、替换或新增原始图像中的主体；不要复制第二张风格参考图的具体构图、人物、物体、场景或叙事内容。',
    '文字与签名限制：不要新增原始图像上没有的题字、落款、签章、署名、水印、印章、标签、可读文字或作者签名；如果原始图像没有文字，输出图也不得出现文字。',
    '最终输出：与第一张原始图像一眼可识别为同一构图和同一主要内容，只在笔触、色彩、光影、质感和细节风格上完成艺术化重绘。',
  ];
  return lines.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildArtistStyleOutputPayload(item: ArtistStyleItem, mode: ArtistStyleOutputMode): ArtistStyleOutputPayload {
  const prompt = buildArtistStylePrompt(item);
  const data: ArtistStyleOutputPayload['data'] = {
    directOutputText: prompt,
    outputText: prompt,
    prompt,
    text: prompt,
    lastPrompt: prompt,
    artistStyleId: item.id,
    artistStyleName: item.name,
    artistStyleChineseName: item.chineseName,
  };

  if (mode === 'image') {
    data.directImageUrl = item.imageUrl;
    data.imageUrl = item.imageUrl;
    data.directImageUrls = [item.imageUrl];
    data.imageUrls = [item.imageUrl];
  }

  return { kind: mode === 'image' ? 'image' : 'text', data };
}

export function createArtistStyleExport(library: ArtistStyleUserLibrary): ArtistStyleExportPack {
  const normalized = normalizeArtistStyleLibrary(library);
  return {
    schema: ARTIST_STYLE_MASTER_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    ...normalized,
  };
}

export function importArtistStyleExport(input: unknown): ArtistStyleUserLibrary {
  const candidate = input as Partial<ArtistStyleExportPack> | null | undefined;
  if (!candidate || candidate.schema !== ARTIST_STYLE_MASTER_EXPORT_SCHEMA) {
    throw new Error('不是有效的艺术风格大师导出文件');
  }
  return normalizeArtistStyleLibrary(candidate);
}

export function mergeArtistStyleLibraries(base: ArtistStyleUserLibrary, incoming: ArtistStyleUserLibrary): ArtistStyleUserLibrary {
  return normalizeArtistStyleLibrary({
    categories: [...base.categories, ...incoming.categories],
    styles: [...base.styles, ...incoming.styles],
  });
}

export function upsertArtistStyleInLibrary(
  library: ArtistStyleUserLibrary,
  style: ArtistStyleItem,
  category?: ArtistStyleCategory,
): ArtistStyleUserLibrary {
  const categories = category ? [...library.categories, category] : library.categories;
  const styles = library.styles.map((item) => (item.id === style.id ? style : item));
  if (!styles.some((item) => item.id === style.id)) {
    styles.push(style);
  }
  return normalizeArtistStyleLibrary({ categories, styles });
}
