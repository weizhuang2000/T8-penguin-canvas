import { create } from 'zustand';
import type { ApiSettings } from '../types/canvas';
import * as api from '../services/api';
import { DEFAULT_LLM_MODEL } from '../providers/models';

// 百达工坊固定地址，也是 LLM 独立 Key 的默认地址
export const FIXED_ZHENZHEN_BASE = 'https://ai.t8star.org';
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
  llmBaseUrl: FIXED_ZHENZHEN_BASE,
  llmModel: DEFAULT_LLM_MODEL,
  // 分类独立 Key（留空时 fallback 到 zhenzhenApiKey）
  gptImageApiKey: '',
  nanoBananaApiKey: '',
  mjApiKey: '',
  veoApiKey: '',
  grokApiKey: '',
  seedanceApiKey: '',
  sunoApiKey: '',
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
  preferences: { theme: 'dark', language: 'zh-CN' },
};

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
        settings: { ...DEFAULT, ...data, zhenzhenBaseUrl: FIXED_ZHENZHEN_BASE },
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
        settings: { ...DEFAULT, ...data, zhenzhenBaseUrl: FIXED_ZHENZHEN_BASE },
        loading: false,
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '保存失败' });
    }
  },
}));
