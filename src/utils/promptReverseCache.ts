import type { ResourceItem } from '../services/api';

function comparableResourceUrl(value: unknown, appOrigin = ''): string {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw || /^(?:data:|blob:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (appOrigin && parsed.origin === appOrigin) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return parsed.toString();
    } catch {
      return raw;
    }
  }
  return raw.startsWith('/') ? raw : `/${raw.replace(/^\.?\/+/, '')}`;
}

export function findPromptReverseResourceByUrl(
  resources: ResourceItem[],
  imageUrl: string,
  appOrigin = '',
): ResourceItem | undefined {
  const target = comparableResourceUrl(imageUrl, appOrigin);
  if (!target || /^(?:data:|blob:)/i.test(target)) return undefined;
  return resources.find((resource) => {
    const candidates = [
      resource.fileUrl,
      resource.sourceUrl,
      ...(Array.isArray(resource.sourceUrls) ? resource.sourceUrls : []),
    ];
    return candidates.some((candidate) => comparableResourceUrl(candidate, appOrigin) === target);
  });
}

export async function mapPromptReverseWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let firstError: unknown;
  let failed = false;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, items.length)) }, async () => {
    while (cursor < items.length && !failed) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
  });
  await Promise.all(runners);
  if (failed) throw firstError;
  return results;
}
