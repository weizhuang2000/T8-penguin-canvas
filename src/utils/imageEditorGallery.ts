import type { GenerationHistoryItem, ResourceItem } from '../services/api';

export type ImageEditorGallerySource = 'all' | 'resources' | 'mine';

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
): ImageEditorGalleryAsset[] {
  const safeResources = coerceImageEditorList<ResourceItem>(resources);
  const safeHistory = coerceImageEditorList<GenerationHistoryItem>(history);
  const myHistory = safeHistory.filter((item) => (
    item.kind === 'image'
    && item.createdByUserId === currentUserId
    && normalizeUrl(item.url)
  ));
  const historyByUrl = new Map(myHistory.map((item) => [normalizeUrl(item.url), item]));
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
    merged.push({
      id: `resource:${resource.id}`,
      title: resource.title || resource.originalName || '资源图片',
      url: resource.fileUrl,
      previewUrl: resource.thumbUrl || resource.fileUrl,
      createdAt: Math.max(resource.updatedAt || 0, resource.createdAt || 0, matchedHistory?.createdAt || 0),
      inResourceLibrary: true,
      resourceId: resource.id,
      historyId: matchedHistory?.id,
      categoryId: resource.categoryId,
      prompt: matchedHistory?.prompt,
      width: resource.width || matchedHistory?.width,
      height: resource.height || matchedHistory?.height,
      sourceUrls,
      fromMyGeneration: !!matchedHistory,
    });
  }

  for (const item of myHistory) {
    if (matchedHistoryIds.has(item.id)) continue;
    merged.push({
      id: `history:${item.id}`,
      title: item.title || item.fileName || '我的生成',
      url: item.url,
      previewUrl: item.url,
      createdAt: item.createdAt || 0,
      inResourceLibrary: false,
      historyId: item.id,
      prompt: item.prompt,
      width: item.width,
      height: item.height,
      sourceUrls: [item.url],
      fromMyGeneration: true,
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
    if (query.source === 'resources' && !asset.inResourceLibrary) return false;
    if (query.source === 'mine' && !asset.fromMyGeneration) return false;
    if (query.categoryId && query.categoryId !== 'all' && asset.categoryId !== query.categoryId) return false;
    if (keyword && !`${asset.title} ${asset.prompt || ''}`.toLowerCase().includes(keyword)) return false;
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
