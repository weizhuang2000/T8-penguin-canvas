import { create } from 'zustand';
import type { AdvancedProviderConfig, ApiSettings, CloudUploadTargetConfig, LlmConfig } from '../types/canvas';
import * as api from '../services/api';
import { DEFAULT_LLM_MODEL } from '../providers/models';
import { createDefaultCanvasNodeMenuPreferences, normalizeCanvasNodeMenuPreferences } from '../utils/canvasNodeMenuPreferences';

// 百达工坊固定地址，也是 LLM 独立 Key 的默认地址
export const DEFAULT_ZHENZHEN_BASE = 'https://ai.t8star.org';
export const FIXED_ZHENZHEN_BASE = DEFAULT_ZHENZHEN_BASE;
export const RH_BASE = 'https://www.runninghub.cn';

interface ApiKeysState {
  settings: ApiSettings;
  loading: boolean;
  error: string | null;
  loaded: boolean;

  load: () => Promise<void>;
  save: (patch: Partial<ApiSettings>) => Promise<void>;
}

const DEFAULT: ApiSettings = {
  zhenzhenApiKey: '',
  enableZhenzhenFallback: true,
  zhenzhenBaseUrl: FIXED_ZHENZHEN_BASE,
  rhApiKey: '',
  rhBaseUrl: RH_BASE,
  llmApiKey: '',
  llmApiKeys: [],
  llmConfigs: [],
  llmBaseUrl: FIXED_ZHENZHEN_BASE,
  llmModel: DEFAULT_LLM_MODEL,
  // 分类独立 Key（留空时 fallback 到 zhenzhenApiKey）
  gptImageApiKey: '',
  nanoBananaApiKey: '',
  mjApiKey: '',
  veoApiKey: '',
  soraApiKey: '',
  grokApiKey: '',
  seedanceApiKey: '',
  sunoApiKey: '',
  giteeMusicApiKey: '',
  // 路径默认值由后端按平台计算并通过 /api/settings 返回，前端不硬编码 D 盘。
  fileSavePath: '',
  canvasAutoSavePath: '',
  resourceLibraryPath: '',
  themeTemplatePath: '',
  eagleApiBase: '',
  advancedProviders: [],
  advancedProviderSummary: {
    enabledCount: 0,
    configuredKeyCount: 0,
    comfyuiConfigured: false,
    jimengConfigured: false,
  },
  cloudUploadTargets: [],
  cloudUploadSummary: {
    totalCount: 0,
    enabledCount: 0,
    configuredCount: 0,
    supportedUploadCount: 0,
    defaultTargetId: '',
    defaultLabel: '',
  },
  canvasNodeMenuPreferences: createDefaultCanvasNodeMenuPreferences(),
  taskCompletionSound: { mode: 'default', url: '' },
  taskFailureSound: { mode: 'default', url: '' },
  preferences: { theme: 'dark', language: 'zh-CN' },
};

function compactStringList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function plainObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
}

function normalizeLlmConfigs(value: unknown): LlmConfig[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => ({
      id: String(item.id || `llm-${index + 1}`),
      label: String(item.label || `LLM Key ${index + 1}`),
      apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
      hasApiKey: !!item.hasApiKey,
      baseUrl: typeof item.baseUrl === 'string' ? item.baseUrl : FIXED_ZHENZHEN_BASE,
      model: typeof item.model === 'string' ? item.model : DEFAULT_LLM_MODEL,
      isDefault: item.isDefault === true,
    }));
}

function normalizeAdvancedProviders(value: unknown): AdvancedProviderConfig[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((provider) => {
      const next: AdvancedProviderConfig = {
        ...(provider as AdvancedProviderConfig),
        id: String(provider.id || ''),
        label: String(provider.label || provider.name || provider.id || ''),
        protocol: provider.protocol,
        baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl : '',
        imageModels: compactStringList(provider.imageModels),
        videoModels: compactStringList(provider.videoModels),
        chatModels: compactStringList(provider.chatModels),
        defaults: plainObject(provider.defaults),
      };

      if (provider.modelscopeConfig || provider.protocol === 'modelscope') {
        const cfg = plainObject(provider.modelscopeConfig);
        next.modelscopeConfig = {
          ...cfg,
          loras: Array.isArray(cfg.loras) ? cfg.loras : [],
        };
      }
      if (provider.volcengineConfig || provider.protocol === 'volcengine') {
        next.volcengineConfig = plainObject(provider.volcengineConfig);
      }
      if (provider.comfyuiConfig || provider.protocol === 'comfyui') {
        const cfg = plainObject(provider.comfyuiConfig);
        next.comfyuiConfig = {
          ...cfg,
          instances: compactStringList(cfg.instances),
          workflows: (Array.isArray(cfg.workflows) ? cfg.workflows : []).map((workflow: any, index: number) => ({
            ...plainObject(workflow),
            id: String(workflow?.id || workflow?.name || `workflow-${index + 1}`),
            name: String(workflow?.name || workflow?.id || `Workflow ${index + 1}`),
            fields: Array.isArray(workflow?.fields) ? workflow.fields : [],
            excludeRules: compactStringList(workflow?.excludeRules),
          })),
        };
      }
      if (provider.jimengConfig || provider.protocol === 'jimeng-cli') {
        next.jimengConfig = plainObject(provider.jimengConfig);
      }
      return next;
    });
}

function normalizeCloudUploadTargets(value: unknown): CloudUploadTargetConfig[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((target) => ({
      ...(target as CloudUploadTargetConfig),
      id: String(target.id || ''),
      provider: target.provider,
      label: String(target.label || target.id || ''),
      tencentCos: plainObject(target.tencentCos),
      aliyunOss: plainObject(target.aliyunOss),
      baiduNetdisk: plainObject(target.baiduNetdisk),
      quarkNetdisk: plainObject(target.quarkNetdisk),
    }));
}

export function normalizeApiSettings(data: Partial<ApiSettings>): ApiSettings {
  const merged = { ...DEFAULT, ...(data || {}) };
  const llmConfigs = normalizeLlmConfigs(merged.llmConfigs || merged.llmApiKeys);
  return {
    ...merged,
    llmApiKeys: llmConfigs,
    llmConfigs,
    advancedProviders: normalizeAdvancedProviders(merged.advancedProviders),
    cloudUploadTargets: normalizeCloudUploadTargets(merged.cloudUploadTargets),
    advancedProviderSummary: {
      enabledCount: Number(merged.advancedProviderSummary?.enabledCount) || 0,
      configuredKeyCount: Number(merged.advancedProviderSummary?.configuredKeyCount) || 0,
      comfyuiConfigured: merged.advancedProviderSummary?.comfyuiConfigured === true,
      jimengConfigured: merged.advancedProviderSummary?.jimengConfigured === true,
    },
    cloudUploadSummary: {
      totalCount: Number(merged.cloudUploadSummary?.totalCount) || 0,
      enabledCount: Number(merged.cloudUploadSummary?.enabledCount) || 0,
      configuredCount: Number(merged.cloudUploadSummary?.configuredCount) || 0,
      supportedUploadCount: Number(merged.cloudUploadSummary?.supportedUploadCount) || 0,
      defaultTargetId: merged.cloudUploadSummary?.defaultTargetId || '',
      defaultLabel: merged.cloudUploadSummary?.defaultLabel || '',
    },
    canvasNodeMenuPreferences: normalizeCanvasNodeMenuPreferences(merged.canvasNodeMenuPreferences),
    taskCompletionSound: {
      ...DEFAULT.taskCompletionSound,
      ...(merged.taskCompletionSound || {}),
    },
    taskFailureSound: {
      ...DEFAULT.taskFailureSound,
      ...(merged.taskFailureSound || {}),
    },
    preferences: {
      ...DEFAULT.preferences,
      ...(merged.preferences || {}),
    },
  };
}

export const useApiKeysStore = create<ApiKeysState>((set) => ({
  settings: DEFAULT,
  loading: false,
  error: null,
  loaded: false,

  async load() {
    set({ loading: true, error: null });
    try {
      const data = await api.getSettings();
      set({
        settings: normalizeApiSettings(data),
        loading: false,
        loaded: true,
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '加载设置失败' });
    }
  },

  async save(patch) {
    set({ loading: true, error: null });
    try {
      await api.updateSettings(patch);
      // 重新拉取(后端会返回脱敏后的 Key)
      const data = await api.getSettings();
      set({
        settings: normalizeApiSettings(data),
        loading: false,
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '保存失败' });
    }
  },
}));
