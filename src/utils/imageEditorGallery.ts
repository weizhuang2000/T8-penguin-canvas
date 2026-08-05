import type { GenerationHistoryItem, ResourceImageAnalysis, ResourceItem } from '../services/api';

export type ImageEditorGallerySource = 'all' | 'resources' | 'mine' | 'all-generated';

export interface ImageEditorGalleryAsset {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  createdAt: number;
  inResourceLibrary: boolean;
  resourceId?: string;
  historyId?: string;
  categoryId?: string;
  prompt?: string;
  width?: number;
  height?: number;
  sourceUrls: string[];
  fromMyGeneration: boolean;
  fromGeneration: boolean;
  generationViewOnly: boolean;
  createdByUserId?: string;
  createdByUserName?: string;
  imageAnalysis?: ResourceImageAnalysis | null;
}

export interface ImageEditorGalleryQuery {
  source: ImageEditorGallerySource;
  keyword?: string;
  categoryId?: string;
  page: number;
  pageSize: number;
}

export interface ImageEditorGalleryPage {
  items: ImageEditorGalleryAsset[];
  total: number;
  page: number;
  pageCount: number;
}

export function coerceImageEditorList<T>(value: unknown, keys: string[] = ['items']): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  if (record.data && typeof record.data === 'object') {
    return coerceImageEditorList<T>(record.data, keys);
  }
  return [];
}

function normalizeUrl(value: unknown): string {
  return String(value || '').trim();
}

function isDirectMediaUrl(value: string): boolean {
  return /^(?:data:|blob:|https?:\/\/|\/(?:api|files|input|output)\/)/i.test(value);
}

export function normalizeImageEditorHistoryUrl(value: unknown): string {
  const url = normalizeUrl(value);
  if (!url || isDirectMediaUrl(url)) return url;
  const clean = url.replace(/\\/g, '/').replace(/^\.?\/+/, '');
  return clean ? `/files/output/${clean.split('/').map(encodeURIComponent).join('/')}` : '';
}

export function normalizeImageEditorResourceUrl(value: unknown, resourceId: string, kind: 'file' | 'thumb' = 'file'): string {
  const url = normalizeUrl(value);
  if (url && isDirectMediaUrl(url)) return url;
  return resourceId ? `/api/resources/${kind}/${encodeURIComponent(resourceId)}` : url;
}

function resourceSourceUrls(item: ResourceItem): string[] {
  return [...new Set([
    ...(Array.isArray(item.sourceUrls) ? item.sourceUrls : []),
    item.sourceUrl || '',
  ].map(normalizeUrl).filter(Boolean))];
}

export function mergeImageEditorGallery(
  resources: ResourceItem[],
  history: GenerationHistoryItem[],
  currentUserId: string,
  includeAllGenerations = false,
): ImageEditorGalleryAsset[] {
  const safeResources = coerceImageEditorList<ResourceItem>(resources);
  const safeHistory = coerceImageEditorList<GenerationHistoryItem>(history);
  const visibleHistory = safeHistory.filter((item) => (
    item.kind === 'image'
    && (includeAllGenerations || item.createdByUserId === currentUserId)
    && normalizeUrl(item.url)
  ));
  const historyByUrl = new Map(visibleHistory.map((item) => [normalizeUrl(item.url), item]));
  const matchedHistoryIds = new Set<string>();
  const merged: ImageEditorGalleryAsset[] = [];

  for (const resource of safeResources) {
    if (resource.kind !== 'image' || !normalizeUrl(resource.fileUrl)) continue;
    const sourceUrls = resourceSourceUrls(resource);
    const matchedHistories = sourceUrls
      .map((url) => historyByUrl.get(url))
      .filter(Boolean) as GenerationHistoryItem[];
    matchedHistories.forEach((item) => matchedHistoryIds.add(item.id));
    const matchedHistory = matchedHistories.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    const fileUrl = normalizeImageEditorResourceUrl(resource.fileUrl, resource.id, 'file');
    const thumbUrl = resource.thumbUrl
      ? normalizeImageEditorResourceUrl(resource.thumbUrl, resource.id, 'thumb')
      : fileUrl;
    merged.push({
      id: `resource:${resource.id}`,
      title: resource.title || resource.originalName || '资源图片',
      url: fileUrl,
      previewUrl: thumbUrl,
      createdAt: Math.max(resource.updatedAt || 0, resource.createdAt || 0, matchedHistory?.createdAt || 0),
      inResourceLibrary: true,
      resourceId: resource.id,
      historyId: matchedHistory?.id,
      categoryId: resource.categoryId,
      prompt: matchedHistory?.prompt,
      width: resource.width || matchedHistory?.width,
      height: resource.height || matchedHistory?.height,
      sourceUrls,
      fromMyGeneration: matchedHistory?.createdByUserId === currentUserId,
      fromGeneration: !!matchedHistory,
      generationViewOnly: false,
      createdByUserId: matchedHistory?.createdByUserId,
      createdByUserName: matchedHistory?.createdByUserName,
      imageAnalysis: resource.imageAnalysis || matchedHistory?.imageAnalysis,
    });

    for (const item of matchedHistories.slice(1)) {
      const historyUrl = normalizeImageEditorHistoryUrl(item.url);
      merged.push({
        id: `history:${item.id}`,
        title: item.title || item.fileName || '我的生成',
        url: historyUrl,
        previewUrl: thumbUrl,
        createdAt: item.createdAt || 0,
        inResourceLibrary: true,
        resourceId: resource.id,
        historyId: item.id,
        categoryId: resource.categoryId,
        prompt: item.prompt,
        width: resource.width || item.width,
        height: resource.height || item.height,
        sourceUrls: [item.url],
        fromMyGeneration: item.createdByUserId === currentUserId,
        fromGeneration: true,
        generationViewOnly: true,
        createdByUserId: item.createdByUserId,
        createdByUserName: item.createdByUserName,
        imageAnalysis: resource.imageAnalysis || item.imageAnalysis,
      });
    }
  }

  for (const item of visibleHistory) {
    if (matchedHistoryIds.has(item.id)) continue;
    const historyUrl = normalizeImageEditorHistoryUrl(item.url);
    merged.push({
      id: `history:${item.id}`,
      title: item.title || item.fileName || '我的生成',
      url: historyUrl,
      previewUrl: historyUrl,
      createdAt: item.createdAt || 0,
      inResourceLibrary: false,
      historyId: item.id,
      prompt: item.prompt,
      width: item.width,
      height: item.height,
      sourceUrls: [item.url],
      fromMyGeneration: item.createdByUserId === currentUserId,
      fromGeneration: true,
      generationViewOnly: false,
      createdByUserId: item.createdByUserId,
      createdByUserName: item.createdByUserName,
      imageAnalysis: item.imageAnalysis,
    });
  }

  return merged.sort((a, b) => b.createdAt - a.createdAt);
}

export function paginateImageEditorGallery(
  assets: ImageEditorGalleryAsset[],
  query: ImageEditorGalleryQuery,
): ImageEditorGalleryPage {
  const keyword = String(query.keyword || '').trim().toLowerCase();
  const filtered = coerceImageEditorList<ImageEditorGalleryAsset>(assets).filter((asset) => {
    if ((query.source === 'all' || query.source === 'resources') && asset.generationViewOnly) return false;
    if (query.source === 'resources' && !asset.inResourceLibrary) return false;
    if (query.source === 'mine' && !asset.fromMyGeneration) return false;
    if (query.source === 'all-generated' && !asset.fromGeneration) return false;
    if (query.categoryId && query.categoryId !== 'all' && asset.categoryId !== query.categoryId) return false;
    if (keyword && !`${asset.title} ${asset.prompt || ''} ${(asset.imageAnalysis?.secondaryTags || []).join(' ')}`.toLowerCase().includes(keyword)) return false;
    return true;
  });
  const pageSize = [12, 24, 48, 96].includes(query.pageSize) ? query.pageSize : 24;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(query.page) || 1));
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageCount,
  };
}

export function toggleImageEditorSelection(ids: string[], id: string, max = 9): string[] {
  const safeIds = coerceImageEditorList<string>(ids);
  if (safeIds.includes(id)) return safeIds.filter((item) => item !== id);
  if (safeIds.length >= max) return safeIds;
  return [...safeIds, id];
}

export function replaceImageEditorSelectionId(ids: string[], previousId: string, nextId: string): string[] {
  return coerceImageEditorList<string>(ids)
    .map((id) => (id === previousId ? nextId : id))
    .filter((id, index, list) => list.indexOf(id) === index);
}

export function buildImageEditorPerAssetGenerationPlan<T>(
  assets: T[],
  prompts: string[],
  outputCount: number,
): Array<{ asset: T; prompt: string; outputCount: number }> {
  const count = Math.max(1, Math.min(4, Math.floor(Number(outputCount) || 1)));
  return assets.slice(0, 9).map((asset, index) => ({
    asset,
    prompt: String(prompts[index] || '').trim(),
    outputCount: count,
  }));
}
