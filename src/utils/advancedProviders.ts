import type { AdvancedProviderConfig, AdvancedProviderSummary, CanvasProviderSource } from '../types/canvas';

const MASKED_RE = /^\*{2,}/;

export function parseAdvancedProviderModelText(value: string): string[] {
  const out: string[] = [];
  for (const raw of String(value || '').split(/[\n,]/)) {
    const item = raw.trim();
    if (!item || out.includes(item)) continue;
    out.push(item);
  }
  return out;
}

export function stringifyAdvancedProviderModels(values?: string[]): string {
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n');
}

export function hasAdvancedProviderSecret(value?: string): boolean {
  const text = String(value || '').trim();
  return !!text && (MASKED_RE.test(text) || text.length > 0);
}

export function advancedProviderSummary(providers?: AdvancedProviderConfig[]): AdvancedProviderSummary {
  const list = Array.isArray(providers) ? providers : [];
  return list.reduce<AdvancedProviderSummary>((summary, provider) => {
    if (provider?.enabled) summary.enabledCount += 1;
    if (hasAdvancedProviderSecret(provider?.apiKey)) summary.configuredKeyCount += 1;
    if (hasAdvancedProviderSecret(provider?.volcengineConfig?.accessKeyId)) summary.configuredKeyCount += 1;
    if (hasAdvancedProviderSecret(provider?.volcengineConfig?.secretAccessKey)) summary.configuredKeyCount += 1;
    if (provider?.protocol === 'comfyui' && (provider.baseUrl || provider.comfyuiConfig?.instances?.length)) {
      summary.comfyuiConfigured = true;
    }
    if (provider?.protocol === 'jimeng-cli' && provider.jimengConfig?.executablePath) {
      summary.jimengConfigured = true;
    }
    return summary;
  }, {
    enabledCount: 0,
    configuredKeyCount: 0,
    comfyuiConfigured: false,
    jimengConfigured: false,
  });
}

export type AdvancedProviderNodeKind = 'image' | 'video' | 'llm';
export type AdvancedImageSizeLevel = '1K' | '2K' | '4K';

export interface AdvancedProviderImageSizeRow {
  providerId: string;
  providerLabel: string;
  protocol: AdvancedProviderConfig['protocol'];
  enabled: boolean;
  model: string;
  source: 'configured' | 'fallback' | 'workflow' | 'missing';
  supportedSizes: AdvancedImageSizeLevel[];
  note: string;
}

export interface AdvancedProviderSelection {
  providerSource: CanvasProviderSource;
  providerId: string;
  providerModel: string;
  provider: AdvancedProviderConfig | null;
  available: boolean;
}

const IMAGE_PROTOCOLS = new Set(['openai-compatible', 'gemini-compatible', 'modelscope', 'volcengine', 'comfyui', 'jimeng-cli']);
const VIDEO_PROTOCOLS = new Set(['openai-compatible', 'volcengine', 'jimeng-cli']);
const LLM_PROTOCOLS = new Set(['openai-compatible', 'gemini-compatible', 'modelscope', 'volcengine']);

const FALLBACK_MODELS: Record<AdvancedProviderNodeKind, Partial<Record<string, string[]>>> = {
  image: {
    'openai-compatible': ['gpt-image-1'],
    'gemini-compatible': ['nano-banana-2'],
    modelscope: ['MusePublic/489_ckpt_FLUX_1'],
    volcengine: ['doubao-seedream-4-0-250828'],
    'jimeng-cli': ['jimeng-image-2k'],
  },
  video: {
    'openai-compatible': [],
    volcengine: ['doubao-seedance-2-0-pro-250528'],
    'jimeng-cli': ['seedance2.0fast_vip'],
  },
  llm: {
    'openai-compatible': ['gpt-4o-mini'],
    'gemini-compatible': ['gemini-2.5-flash'],
    modelscope: ['Qwen/Qwen3-Coder-480B-A35B-Instruct'],
    volcengine: ['doubao-seed-1-6-250615'],
  },
};

export const ADVANCED_IMAGE_SIZE_LEVELS: AdvancedImageSizeLevel[] = ['1K', '2K', '4K'];

function uniqueCompact(values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const item = String(value || '').trim();
    if (!item || out.includes(item)) continue;
    out.push(item);
  }
  return out;
}

function listForKind(provider: AdvancedProviderConfig, kind: AdvancedProviderNodeKind): string[] {
  if (kind === 'image') return Array.isArray(provider.imageModels) ? provider.imageModels : [];
  if (kind === 'video') return Array.isArray(provider.videoModels) ? provider.videoModels : [];
  return Array.isArray(provider.chatModels) ? provider.chatModels : [];
}

function defaultModelForKind(provider: AdvancedProviderConfig, kind: AdvancedProviderNodeKind): string {
  const defaults = provider.defaults || {};
  const key = kind === 'llm' ? 'chatModel' : `${kind}Model`;
  return String(defaults[key] || defaults.model || '').trim();
}

function supportsNodeKind(provider: AdvancedProviderConfig, kind: AdvancedProviderNodeKind): boolean {
  if (!provider?.enabled) return false;
  const protocol = String(provider.protocol || '');
  if (kind === 'image' && !IMAGE_PROTOCOLS.has(protocol)) return false;
  if (kind === 'video' && !VIDEO_PROTOCOLS.has(protocol)) return false;
  if (kind === 'llm' && !LLM_PROTOCOLS.has(protocol)) return false;
  if (protocol === 'comfyui') {
    return kind === 'image' && !!provider.comfyuiConfig?.workflows?.length;
  }
  return advancedProviderModelOptions(provider, kind).length > 0;
}

export function advancedProviderModelOptions(
  provider: AdvancedProviderConfig,
  kind: AdvancedProviderNodeKind,
): string[] {
  if (!provider) return [];
  if (provider.protocol === 'comfyui' && kind === 'image') {
    return uniqueCompact((provider.comfyuiConfig?.workflows || []).map((workflow) => workflow.id || workflow.name));
  }
  const explicit = uniqueCompact(listForKind(provider, kind));
  if (explicit.length) return explicit;
  return uniqueCompact([
    defaultModelForKind(provider, kind),
    ...(FALLBACK_MODELS[kind][provider.protocol] || []),
  ]);
}

function explicitModelListForKind(provider: AdvancedProviderConfig, kind: AdvancedProviderNodeKind): string[] {
  return uniqueCompact(listForKind(provider, kind));
}

function fallbackModelsForKind(provider: AdvancedProviderConfig, kind: AdvancedProviderNodeKind): string[] {
  return uniqueCompact([
    defaultModelForKind(provider, kind),
    ...(FALLBACK_MODELS[kind][provider.protocol] || []),
  ]);
}

function sizeOnlyFromModelName(model: string): AdvancedImageSizeLevel[] {
  const text = model.toLowerCase();
  if (/(^|[^a-z0-9])4k([^a-z0-9]|$)/i.test(text)) return ['4K'];
  if (/(^|[^a-z0-9])2k([^a-z0-9]|$)/i.test(text)) return ['2K'];
  if (/(^|[^a-z0-9])1k([^a-z0-9]|$)/i.test(text)) return ['1K'];
  return [];
}

function inferImageSizeSupport(
  provider: AdvancedProviderConfig,
  model: string,
): { supportedSizes: AdvancedImageSizeLevel[]; note: string } {
  const modelName = String(model || '').trim();
  const lower = modelName.toLowerCase();
  const explicitSize = sizeOnlyFromModelName(modelName);

  if (provider.protocol === 'comfyui') {
    return {
      supportedSizes: modelName ? [...ADVANCED_IMAGE_SIZE_LEVELS] : [],
      note: modelName
        ? '按工作流 width/height 写入, 需要工作流本身支持对应显存和尺寸。'
        : '未配置工作流, 暂无可用生图尺寸。',
    };
  }

  if (provider.protocol === 'jimeng-cli') {
    return {
      supportedSizes: explicitSize.length ? explicitSize : ['2K', '4K'],
      note: explicitSize.length
        ? '按即梦 CLI 模型名中的分辨率档位识别。'
        : '即梦 CLI 未标明档位时按常用 2K/4K 模式展示。',
    };
  }

  if (lower.includes('gpt-image-1') || lower.includes('dall-e')) {
    return {
      supportedSizes: ['1K'],
      note: 'OpenAI 旧式 size 兼容模型通常只按 1K 像素尺寸安全透传。',
    };
  }

  if (
    lower.includes('gpt-image-2')
    || lower.includes('nano-banana')
    || lower.includes('banana')
    || lower.includes('seedream-4')
  ) {
    return {
      supportedSizes: [...ADVANCED_IMAGE_SIZE_LEVELS],
      note: provider.protocol === 'gemini-compatible'
        ? '按 aspect_ratio + image_size 传入。'
        : '当前适配器可透传 1K/2K/4K 档位。',
    };
  }

  if (lower.includes('seedream-3')) {
    return {
      supportedSizes: ['1K', '2K'],
      note: '按 Seedream 3 常用档位展示, 4K 建议切换 Seedream 4 系列。',
    };
  }

  if (explicitSize.length) {
    return {
      supportedSizes: explicitSize,
      note: '按模型名中的分辨率档位识别。',
    };
  }

  if (provider.protocol === 'modelscope') {
    return {
      supportedSizes: ['1K', '2K'],
      note: 'ModelScope 适配器传 width/height/size, 具体上限取决于模型卡。',
    };
  }

  if (provider.protocol === 'volcengine') {
    return {
      supportedSizes: [...ADVANCED_IMAGE_SIZE_LEVELS],
      note: '火山适配器按 size 像素串透传, 具体以接入点能力为准。',
    };
  }

  return {
    supportedSizes: [...ADVANCED_IMAGE_SIZE_LEVELS],
    note: '兼容适配器按 size 像素串透传, 具体以第三方服务能力为准。',
  };
}

export function buildAdvancedImageSizeMatrix(
  providers?: AdvancedProviderConfig[],
): AdvancedProviderImageSizeRow[] {
  const rows: AdvancedProviderImageSizeRow[] = [];
  for (const provider of Array.isArray(providers) ? providers : []) {
    if (!provider) continue;
    const providerId = String(provider.id || '').trim();
    const providerLabel = String(provider.label || provider.id || provider.protocol || '').trim();
    if (!providerId && !providerLabel) continue;

    if (provider.protocol === 'comfyui') {
      const workflows = Array.isArray(provider.comfyuiConfig?.workflows) ? provider.comfyuiConfig?.workflows || [] : [];
      if (!workflows.length) {
        rows.push({
          providerId,
          providerLabel,
          protocol: provider.protocol,
          enabled: provider.enabled === true,
          model: '未配置工作流',
          source: 'missing',
          supportedSizes: [],
          note: '请先在 ComfyUI 平台配置至少一个工作流。',
        });
        continue;
      }
      for (const workflow of workflows) {
        const model = String(workflow.id || workflow.name || 'workflow').trim();
        const inferred = inferImageSizeSupport(provider, model);
        rows.push({
          providerId,
          providerLabel,
          protocol: provider.protocol,
          enabled: provider.enabled === true,
          model,
          source: 'workflow',
          ...inferred,
        });
      }
      continue;
    }

    const explicit = explicitModelListForKind(provider, 'image');
    const models = explicit.length ? explicit : fallbackModelsForKind(provider, 'image');
    if (!models.length) {
      rows.push({
        providerId,
        providerLabel,
        protocol: provider.protocol,
        enabled: provider.enabled === true,
        model: '未配置图像模型',
        source: 'missing',
        supportedSizes: [],
        note: '请先填写图像模型列表。',
      });
      continue;
    }
    for (const model of models) {
      const inferred = inferImageSizeSupport(provider, model);
      rows.push({
        providerId,
        providerLabel,
        protocol: provider.protocol,
        enabled: provider.enabled === true,
        model,
        source: explicit.length ? 'configured' : 'fallback',
        ...inferred,
      });
    }
  }
  return rows;
}

export function advancedProvidersForNode(
  providers: AdvancedProviderConfig[] | undefined,
  kind: AdvancedProviderNodeKind,
): AdvancedProviderConfig[] {
  return (Array.isArray(providers) ? providers : []).filter((provider) => supportsNodeKind(provider, kind));
}

export function resolveAdvancedProviderSelection(
  providers: AdvancedProviderConfig[] | undefined,
  kind: AdvancedProviderNodeKind,
  current?: {
    providerSource?: CanvasProviderSource;
    providerId?: string;
    providerModel?: string;
  },
): AdvancedProviderSelection {
  const available = advancedProvidersForNode(providers, kind);
  const currentSource = current?.providerSource || 'zhenzhen';
  const currentId = String(current?.providerId || '').trim();
  if (currentSource !== 'zhenzhen' && currentId) {
    const provider = available.find((item) => item.id === currentId && item.protocol === currentSource);
    if (provider) {
      const models = advancedProviderModelOptions(provider, kind);
      const requested = String(current?.providerModel || '').trim();
      return {
        providerSource: provider.protocol,
        providerId: provider.id,
        providerModel: requested && models.includes(requested) ? requested : (models[0] || ''),
        provider,
        available: true,
      };
    }
  }
  return {
    providerSource: 'zhenzhen',
    providerId: '',
    providerModel: '',
    provider: null,
    available: false,
  };
}

const EXTERNAL_SIZE_BASE: Record<string, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

const EXTERNAL_RATIO_DIMS: Record<string, [number, number]> = {
  '1:1': [1024, 1024],
  '4:3': [1152, 864],
  '3:4': [864, 1152],
  '16:9': [1344, 768],
  '9:16': [768, 1344],
  '3:2': [1216, 832],
  '2:3': [832, 1216],
  '21:9': [1536, 640],
};

export function externalImageSizeFor(aspectRatio?: string, sizeLevel?: string): string {
  const ratio = String(aspectRatio || '').trim();
  const dims = EXTERNAL_RATIO_DIMS[ratio] || EXTERNAL_RATIO_DIMS['1:1'];
  const base = EXTERNAL_SIZE_BASE[String(sizeLevel || '').trim()] || 1024;
  const scale = base / 1024;
  const w = Math.max(256, Math.round((dims[0] * scale) / 64) * 64);
  const h = Math.max(256, Math.round((dims[1] * scale) / 64) * 64);
  return `${w}x${h}`;
}
