import type { SeedanceSubmitRequest, RunningHubVideoCatalogModel } from '../services/generation';
import {
  RUNNINGHUB_CATALOG_NAME_BY_STATIC_MODEL,
  RUNNINGHUB_FULL_VIDEO_CATALOG_FALLBACK,
} from './runninghubFullVideoCatalog.ts';

export type DirectorStoryboardModelProvider = 'seedance' | 'runninghub-static' | 'runninghub-catalog';

export interface DirectorStoryboardModelOption {
  value: string;
  label: string;
  provider: DirectorStoryboardModelProvider;
  priceLabel?: string;
  catalogModelId?: string;
  staticModelId?: string;
  category?: string;
}

export const DIRECTOR_STORYBOARD_SEEDANCE_MODELS: DirectorStoryboardModelOption[] = [
  { value: 'doubao-seedance-2-0-fast-260128', label: 'seedance-2-0-fast', provider: 'seedance' },
  { value: 'doubao-seedance-2-0-260128', label: 'seedance-2-0', provider: 'seedance' },
];

const staticModelByCatalogName = new Map(
  Object.entries(RUNNINGHUB_CATALOG_NAME_BY_STATIC_MODEL).map(([model, name]) => [name, model]),
);
const staticModelByCatalogId = new Map(
  RUNNINGHUB_FULL_VIDEO_CATALOG_FALLBACK.flatMap((item) => {
    const model = staticModelByCatalogName.get(item.name);
    return model ? [[item.id, model] as const] : [];
  }),
);

export function isRunningHubPerSecondPrice(priceLabel: unknown): boolean {
  return typeof priceLabel === 'string' && /\/\s*秒/.test(priceLabel.trim());
}

export function buildDirectorStoryboardModelOptions(
  catalog: RunningHubVideoCatalogModel[] = RUNNINGHUB_FULL_VIDEO_CATALOG_FALLBACK,
): DirectorStoryboardModelOption[] {
  const runningHubOptions = catalog
    .filter((item) => isRunningHubPerSecondPrice(item.priceLabel))
    .map((item): DirectorStoryboardModelOption => {
      const staticModelId = staticModelByCatalogId.get(item.id) || staticModelByCatalogName.get(item.name);
      return {
        value: staticModelId || `catalog:${item.id}`,
        label: `${item.name} · ${item.priceLabel}`,
        provider: staticModelId ? 'runninghub-static' : 'runninghub-catalog',
        priceLabel: item.priceLabel,
        catalogModelId: item.id,
        staticModelId,
        category: item.category,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));

  const unique = new Map<string, DirectorStoryboardModelOption>();
  [...DIRECTOR_STORYBOARD_SEEDANCE_MODELS, ...runningHubOptions].forEach((item) => unique.set(item.value, item));
  return Array.from(unique.values());
}

export function resolveDirectorStoryboardModel(
  value: string,
  options: DirectorStoryboardModelOption[],
): DirectorStoryboardModelOption {
  const selected = options.find((item) => item.value === value);
  if (selected) return selected;
  if (value.startsWith('catalog:')) {
    return {
      value,
      label: value,
      provider: 'runninghub-catalog',
      catalogModelId: value.slice('catalog:'.length),
    };
  }
  if (RUNNINGHUB_CATALOG_NAME_BY_STATIC_MODEL[value]) {
    return {
      value,
      label: RUNNINGHUB_CATALOG_NAME_BY_STATIC_MODEL[value],
      provider: 'runninghub-static',
      staticModelId: value,
    };
  }
  return DIRECTOR_STORYBOARD_SEEDANCE_MODELS[0];
}

export function directorStoryboardPayloadMedia(payload: SeedanceSubmitRequest) {
  const images = [payload.firstFrame, payload.lastFrame, ...(payload.refImages || [])]
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  return {
    images: Array.from(new Set(images)),
    videos: Array.from(new Set((payload.videos || []).filter(Boolean))),
    audios: Array.from(new Set((payload.audios || []).filter(Boolean))),
  };
}

export function buildDirectorRunningHubCatalogParams(payload: SeedanceSubmitRequest): Record<string, unknown> {
  const { images, videos, audios } = directorStoryboardPayloadMedia(payload);
  const params: Record<string, unknown> = {
    prompt: payload.prompt,
    duration: payload.duration,
    aspectRatio: payload.ratio,
    resolution: payload.resolution,
  };
  if (images.length === 1) params.imageUrl = images[0];
  else if (images.length > 1) params.imageUrls = images;
  if (videos.length === 1) params.videoUrl = videos[0];
  else if (videos.length > 1) params.videoUrls = videos;
  if (audios.length === 1) params.audioUrl = audios[0];
  else if (audios.length > 1) params.audioUrls = audios;
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));
}
