const LOCAL_IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)(?:[?#].*)?$/i;
const LOCAL_FILE_PREFIX_RE = /^\/(?:files\/(?:input|output)|input|output)\//;

export function normalizeLocalMediaUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const value = url.trim();
  if (!value) return '';
  let localPath = value;
  let absolute = false;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      localPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      absolute = true;
    } catch {
      return value;
    }
  }
  if (absolute) return /^\/files\/(?:input|output)\//i.test(localPath) ? localPath : value;
  if (/^\/output\//i.test(localPath)) return `/files/output/${localPath.slice('/output/'.length)}`;
  if (/^\/input\//i.test(localPath)) return `/files/input/${localPath.slice('/input/'.length)}`;
  if (/^\/files\/(?:input|output)\//i.test(localPath)) return localPath;
  return value;
}

const MEDIA_FIELD_RE = /(?:url|image|video|audio|thumbnail|preview|source|reference|material)/i;

export function normalizePersistedMediaUrls<T>(value: T): T {
  const visit = (item: unknown, field = ''): unknown => {
    if (typeof item === 'string') return MEDIA_FIELD_RE.test(field) ? normalizeLocalMediaUrl(item) : item;
    if (Array.isArray(item)) return item.map((entry) => visit(entry, field));
    if (!item || typeof item !== 'object') return item;
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(item as Record<string, unknown>)) {
      normalized[key] = visit(entry, key);
    }
    return normalized;
  };
  return visit(value) as T;
}

export function canUseLocalImageThumbnail(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const clean = normalizeLocalMediaUrl(url);
  if (!clean || !LOCAL_FILE_PREFIX_RE.test(clean)) return false;
  return LOCAL_IMAGE_RE.test(clean.split('?')[0].split('#')[0]);
}

export function previewImageUrl(url: string, size = 360): string {
  const normalizedUrl = normalizeLocalMediaUrl(url);
  if (!canUseLocalImageThumbnail(normalizedUrl)) return url;
  const safeSize = Math.max(96, Math.min(1024, Math.round(size || 360)));
  return `/api/files/thumbnail?size=${safeSize}&url=${encodeURIComponent(normalizedUrl)}`;
}
