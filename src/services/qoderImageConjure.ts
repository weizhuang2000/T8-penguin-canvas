import {
  streamQoderImage,
  type QoderArtifact,
  type QoderImagePayload,
  type QoderImageResult,
  type QoderStreamEvent,
} from './qoderCli';

function unique(values: unknown[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function artifactUrls(artifact: QoderArtifact): string[] {
  if (artifact.kind !== 'image') return [];
  return Array.isArray(artifact.urls) ? artifact.urls.filter(Boolean) : (artifact.url ? [artifact.url] : []);
}

export function collectQoderImageUrls(result: QoderImageResult): string[] {
  return unique([
    ...(result.imageUrls || []),
    result.imageUrl || '',
    ...(result.artifacts || []).flatMap(artifactUrls),
  ]);
}

export function publishQoderImageResult(
  result: QoderImageResult,
  options: { maxImages?: number; includeText?: boolean } = {},
) {
  const maxImages = Number.isFinite(options.maxImages)
    ? Math.max(1, Math.floor(Number(options.maxImages)))
    : Infinity;
  const imageUrls = collectQoderImageUrls(result).slice(0, maxImages);
  return {
    ...result,
    imageUrl: imageUrls[0] || '',
    imageUrls,
    outputText: options.includeText === false ? '' : String(result.text || result.reply || '').trim(),
  };
}

export async function streamQoderImageConjure(
  payload: QoderImagePayload,
  options: {
    signal?: AbortSignal;
    onDelta?: (delta: string, event?: QoderStreamEvent) => void;
    onEvent?: (event: QoderStreamEvent) => void;
  } = {},
) {
  const result = await streamQoderImage(payload, options);
  const published = publishQoderImageResult(result, { maxImages: payload.count });
  if (!published.imageUrls.length) throw new Error('Qoder 没有返回扩展平台生成的图片。');
  return published;
}

export type { QoderImagePayload, QoderImageResult, QoderStreamEvent };
