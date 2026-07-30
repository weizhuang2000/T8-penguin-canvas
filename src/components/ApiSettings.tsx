import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Brain, ChevronDown, ChevronRight, CloudUpload, Download, ExternalLink, Eye, EyeOff, FileUp, GripVertical, Info, KeyRound, Loader2, Lock, MousePointer2, Plus, Save, Settings2, TestTube2, Trash2, X, FolderOpen, ServerCog, Volume2, HelpCircle, RotateCcw, Edit3, Eye as EyeIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useApiKeysStore, FIXED_ZHENZHEN_BASE, RH_BASE, normalizeApiSettings } from '../stores/apiKeys';
import { taskCompletionSound as taskCompletionSoundController } from '../stores/taskCompletionSound';
import { useThemeStore } from '../stores/theme';
import type { AdvancedProviderConfig, AdvancedProviderProtocol, ApiSettings, CloudUploadProvider, CloudUploadTargetConfig, FhlConfigSummary, LlmConfig, OutputStorageSpaceConfig } from '../types/canvas';
import { getRawSettings, resetTaskCompletionSound, resetTaskFailureSound, testAdvancedProvider, testCloudUploadTarget, testOutputStorageSpace, reconcileOutputStorageSpace, uploadTaskCompletionSound, uploadTaskFailureSound, getNodeHelps, saveNodeHelp, deleteNodeHelp, exportNodeHelps, importNodeHelps, bulkReplaceNodeHelps, type NodeHelpMap } from '../services/api';
import { playTaskCompletionSound, playTaskFailureSound } from '../utils/taskCompletionSound';
import { DEFAULT_LLM_MODEL } from '../providers/models';
import { DEFAULT_NODE_HELPS } from '../config/nodeHelpDefaults';
import { renderSimpleMarkdown } from '../utils/simpleMarkdown';
import { clearNodeHelpCache } from './nodes/NodeHelpModal';
import {
  advancedProviderSummary as summarizeAdvancedProviderForm,
  normalizeModelscopeLoraStrength,
  normalizeModelscopeLoras,
  parseAdvancedProviderModelText,
  reorderAdvancedProviders,
  stringifyAdvancedProviderModels,
} from '../utils/advancedProviders';
import {
  COMFY_FIELD_SOURCE_OPTIONS,
  BASIC_COMFY_TEXT_TO_IMAGE_SAMPLE_ID,
  analyzeComfyWorkflow,
  buildComfyWorkflowImportChecklist,
  canonicalizeComfyFieldsByWorkflow,
  createComfyFieldExcludeRulesBackup,
  filterComfyFieldsByExcludeRules,
  parseComfyFieldExcludeRules,
  parseComfyFieldExcludeRulesBackup,
  stringifyBasicComfyTextToImageWorkflow,
  type ComfyFieldMapping,
} from '../utils/comfyuiWorkflow';
import { NODE_REGISTRY } from '../config/nodeRegistry';
import {
  CANVAS_NODE_MENU_SCENE_LABELS,
  CANVAS_NODE_MENU_SCENES,
  normalizeCanvasNodeMenuPreferences,
  type CanvasNodeMenuPreferences,
  type CanvasNodeMenuScene,
} from '../utils/canvasNodeMenuPreferences';
import PromptTextarea from './PromptTextarea';
import { LocalSettingsAddonSlot } from 'virtual:t8-local-extensions';
import { addFhlWorker, deleteFhlWorker, getFhlConfig, importCodexFhlWorkers, updateFhlWorker } from '../services/fhlImage';

interface ApiSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// 主 Key 字段名类型
type KeyField =
  | 'zhenzhenApiKey'
  | 'rhApiKey'
  | 'llmApiKey'
  | 'gptImageApiKey'
  | 'nanoBananaApiKey'
  | 'mjApiKey'
  | 'veoApiKey'
  | 'soraApiKey'
  | 'grokApiKey'
  | 'seedanceApiKey'
  | 'sunoApiKey'
  | 'giteeMusicApiKey';

interface KeySpec {
  field: KeyField;
  label: string;
  desc: string;
  bullet: string; // tailwind bg color class
}

const COMMON_KEYS: KeySpec[] = [
  { field: 'zhenzhenApiKey', label: '贞贞工坊 API Key', desc: '· 通用后备 · 用于图像/视频/音频生成', bullet: 'bg-amber-400' },
  { field: 'rhApiKey', label: 'RunningHub API Key', desc: '· 企业级-共享 API Key · RunningHub / RH 钱包应用 / Running 视频全部模型共用', bullet: 'bg-cyan-400' },
  { field: 'llmApiKey', label: 'LLM 独立 API Key', desc: '· 额度隔离 · 用于 LLM/Vision', bullet: 'bg-emerald-400' },
];

const CLASSIFIED_KEYS: KeySpec[] = [
  { field: 'gptImageApiKey', label: 'gpt-image 系列', desc: 'GPT2 / gpt-image-1 等图像任务专用', bullet: 'bg-pink-400' },
  { field: 'nanoBananaApiKey', label: 'nano-banana 系列', desc: 'nano-banana / nano-banana-pro 专用', bullet: 'bg-yellow-400' },
  { field: 'mjApiKey', label: 'mj 系列', desc: 'Midjourney (turbo/fast/relax) 专用', bullet: 'bg-purple-400' },
  { field: 'veoApiKey', label: 'veo 系列', desc: 'Veo 系列视频专用', bullet: 'bg-blue-400' },
  { field: 'soraApiKey', label: 'sora2 系列', desc: 'Sora2 FAL / Zhenzhen API 视频专用', bullet: 'bg-sky-400' },
  { field: 'grokApiKey', label: 'grok 系列', desc: 'Grok Image / Grok Imagine Video 专用', bullet: 'bg-orange-400' },
  { field: 'seedanceApiKey', label: 'seedance 系列', desc: 'Seedance 视频专用', bullet: 'bg-teal-400' },
  { field: 'sunoApiKey', label: 'suno 系列', desc: 'Suno 音乐专用', bullet: 'bg-rose-400' },
  { field: 'giteeMusicApiKey', label: 'Gitee ACE-Step 音乐', desc: 'Gitee AI ACE-Step 音乐生成专用 Token', bullet: 'bg-violet-400' },
];

const ALL_FIELDS: KeyField[] = [
  ...COMMON_KEYS.map((k) => k.field),
  ...CLASSIFIED_KEYS.map((k) => k.field),
];

const PATH_FIELDS = [
  'fileSavePath',
  'canvasAutoSavePath',
  'resourceLibraryPath',
  'themeTemplatePath',
  'eagleApiBase',
] as const;

const SETTINGS_BACKUP_SCHEMA = 't8-penguin-canvas-settings';
const SETTINGS_BACKUP_VERSION = 1;

// 节点帮助文档管理列表：展陈节点加其它已接入 NodeHelpButton 的节点。
const NODE_HELP_NODES = NODE_REGISTRY.filter((n) => (n.category === 'exhibition' || n.type === 'fhl-image-gen') && !n.hidden);
const NODE_HELP_STORAGE_KEY = 't8-node-helps';

const ADVANCED_PROVIDER_LABELS: Record<AdvancedProviderProtocol, string> = {
  'openai-compatible': 'OpenAI',
  'gemini-compatible': 'Gemini',
  modelscope: 'ModelScope',
  volcengine: '火山引擎',
  comfyui: 'ComfyUI',
  'jimeng-cli': '即梦 CLI',
};

function displayAdvancedProviderLabel(provider: AdvancedProviderConfig): string {
  const label = String(provider.label || '').trim();
  if (provider.id === 'openai-compatible' && label === 'OpenAI 兼容') return 'OpenAI';
  if (provider.id === 'gemini-compatible' && label === 'Gemini Compatible') return 'Gemini';
  return label || ADVANCED_PROVIDER_LABELS[provider.protocol] || provider.id;
}

const ADVANCED_PROVIDER_GUIDES: Record<AdvancedProviderProtocol, {
  subtitle: string;
  description: string;
  nodeScopes: string[];
  connectionHint: string;
  modelHint: string;
  baseUrlPlaceholder?: string;
  keyLabel?: string;
}> = {
  'openai-compatible': {
    subtitle: '接入兼容 OpenAI 格式的图像 / 视频 / LLM 服务',
    description: '适合接入你自己的中转站、One API、New API 或其他兼容 /v1/chat/completions、/v1/images/generations、/v1/videos/generations 的服务。',
    nodeScopes: ['图像节点', '视频节点', 'LLM 节点'],
    connectionHint: 'Base URL 填到 /v1 这一层，例如 https://api.example.com/v1；Key 留空会保留后端已保存的密钥。',
    modelHint: '每行一个模型名。只填你确实要在节点里选择的模型，空白时会使用内置兜底示例。',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    keyLabel: 'API Key / Token',
  },
  'gemini-compatible': {
    subtitle: 'Gemini compatible image / video / LLM service',
    description: 'Use Gemini API or a Gemini-compatible gateway with the configured API key and model list.',
    nodeScopes: ['Image nodes', 'Video nodes', 'LLM nodes'],
    connectionHint: 'Set Base URL to the Gemini API prefix, for example https://generativelanguage.googleapis.com/v1beta. Leave Key empty to preserve the saved secret.',
    modelHint: 'Enter Gemini-compatible model names, one per line.',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta',
    keyLabel: 'API Key / Token',
  },
  modelscope: {
    subtitle: '接入 ModelScope 的异步图像任务与兼容聊天接口',
    description: '适合把 ModelScope 上的图像模型加入图像节点，也可以给 LLM 节点填入可用的聊天模型。',
    nodeScopes: ['图像节点', 'LLM 节点'],
    connectionHint: 'Base URL 通常使用 ModelScope API 地址；Token 填 ModelScope 访问令牌。',
    modelHint: '图像模型建议填写 ModelScope 模型 ID，例如 owner/model-name；聊天模型按平台实际模型名填写。',
    baseUrlPlaceholder: 'https://api-inference.modelscope.cn/v1',
    keyLabel: 'ModelScope Token',
  },
  volcengine: {
    subtitle: '接入火山方舟 / Seedream / Seedance',
    description: '适合用火山引擎做 Seedream 图像、Seedance 视频或方舟聊天模型。生成调用使用方舟 Ark API Key，不使用 Access Key ID / Secret Access Key；使用 Seedance2.0 前需要先在火山方舟控制台开通对应模型服务。',
    nodeScopes: ['图像节点', '视频节点', 'LLM 节点'],
    connectionHint: 'Base URL 填火山方舟 API 地址；Seedream / Seedance / LLM 生成必须填方舟 Ark API Key。Access Key ID / Secret Access Key 是另一类凭证，请放到下方火山 AK/SK 高级项。',
    modelHint: '图像、视频、聊天模型分别按火山控制台里的模型接入点填写，每行一个。Seedance2.0 / Seedance2.0 Fast 如果未在方舟控制台开通，提交会返回 ModelNotOpen / HTTP 404。',
    baseUrlPlaceholder: 'https://ark.cn-beijing.volces.com/api/v3',
    keyLabel: '方舟 Ark API Key（生成用，不是 AK/SK）',
  },
  comfyui: {
    subtitle: '接入 ComfyUI 工作流',
    description: '默认适合把本机 ComfyUI 的 API Workflow 接到图像节点；开启高危远端开关或由后端环境启用后，也可接入其他可信 ComfyUI 地址。',
    nodeScopes: ['图像节点'],
    connectionHint: '默认填写本机 ComfyUI，例如 http://127.0.0.1:8188；如需其他地址，可开启下方高危开关，或由后端设置 T8_COMFYUI_ALLOW_REMOTE=1。多个实例可一行一个。',
    modelHint: '图像节点里选择的是工作流 ID/名称，不需要填写模型列表。',
    baseUrlPlaceholder: 'http://127.0.0.1:8188',
  },
  'jimeng-cli': {
    subtitle: '通过本地 dreamina / 即梦 CLI 调用图像和视频',
    description: '适合已经在本机配置好即梦 CLI 的用户。它不走 API Key，而是调用本地命令并轮询任务结果。',
    nodeScopes: ['图像节点', '视频节点', 'SD2.0 节点'],
    connectionHint: '填写 dreamina 可执行文件路径；如果 CLI 装在 WSL 里，再打开 WSL 并填写发行版名称。',
    modelHint: '模型名按 CLI 支持的命令参数填写；图像可填 seedream-4.7，视频可填 seedance2.0fast_vip、seedance2.0_vip、seedance2.0fast、seedance2.0。每行一个。',
  },
};

const MODELSCOPE_TOKEN_URLS = {
  cn: 'https://www.modelscope.cn/my/access/token',
  intl: 'https://www.modelscope.ai/my/access/token',
} as const;

const BUILT_IN_ADVANCED_PROVIDER_IDS = new Set([
  'openai-compatible',
  'gemini-compatible',
  'modelscope',
  'volcengine',
  'comfyui',
  'jimeng-cli',
]);

const JIMENG_CLI_INSTALL_COMMAND = 'curl -s https://jimeng.jianying.com/cli | bash';

const CLOUD_UPLOAD_LABELS: Record<CloudUploadProvider, string> = {
  'tencent-cos': '腾讯云 COS',
  'aliyun-oss': '阿里云 OSS',
  'baidu-netdisk': '百度网盘',
  'quark-netdisk': '夸克网盘',
};

const CLOUD_UPLOAD_GUIDES: Record<CloudUploadProvider, {
  subtitle: string;
  description: string;
  status: string;
}> = {
  'tencent-cos': {
    subtitle: '适合把生成素材归档到腾讯云对象存储，支持真实上传。',
    description: '填写 Bucket、Region、SecretId 和 SecretKey；公共域名可选，留空时返回 COS 默认对象 URL。',
    status: '已支持上传',
  },
  'aliyun-oss': {
    subtitle: '适合把生成素材归档到阿里云对象存储，支持真实上传。',
    description: '填写 Bucket、Endpoint、AccessKeyId 和 AccessKeySecret；公共域名可选，留空时返回 OSS 默认对象 URL。',
    status: '已支持上传',
  },
  'baidu-netdisk': {
    subtitle: '通过 WebDAV 网关上传到百度网盘，适合 Alist / CloudDrive2 / rclone 等挂载方案。',
    description: '填写 WebDAV 地址、用户名和密码/令牌；配置检查会创建临时目录并上传小文件，确认账号和写入权限真实可用。',
    status: '已支持上传',
  },
  'quark-netdisk': {
    subtitle: '通过 WebDAV 网关上传到夸克网盘，避免依赖不稳定 Cookie 抓包接口。',
    description: '填写 WebDAV 地址、用户名和密码/令牌；推荐先在 WebDAV 客户端确认可写，再在这里点配置检查。',
    status: '已支持上传',
  },
};

function summarizeCloudUploadForm(targets: CloudUploadTargetConfig[]) {
  const normalized = Array.isArray(targets) ? targets : [];
  const configuredCount = normalized.filter((target) => {
    if (target.provider === 'tencent-cos') {
      return !!(target.tencentCos?.bucket && target.tencentCos?.region && (target.tencentCos?.secretId || target.tencentCos?.hasSecretId) && (target.tencentCos?.secretKey || target.tencentCos?.hasSecretKey));
    }
    if (target.provider === 'aliyun-oss') {
      return !!(target.aliyunOss?.bucket && target.aliyunOss?.endpoint && (target.aliyunOss?.accessKeyId || target.aliyunOss?.hasAccessKeyId) && (target.aliyunOss?.accessKeySecret || target.aliyunOss?.hasAccessKeySecret));
    }
    if (target.provider === 'baidu-netdisk') {
      return !!target.baiduNetdisk?.webdavUrl;
    }
    if (target.provider === 'quark-netdisk') {
      return !!target.quarkNetdisk?.webdavUrl;
    }
    return false;
  }).length;
  const defaultTarget = normalized.find((target) => target.isDefault) || normalized.find((target) => target.enabled) || null;
  return {
    totalCount: normalized.length,
    enabledCount: normalized.filter((target) => target.enabled).length,
    configuredCount,
    defaultLabel: defaultTarget?.label || '',
  };
}

function tryParseJsonObject(raw: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

interface AdvancedProviderFormBlockProps {
  title: string;
  note?: string;
  className: string;
  labelClassName: string;
  hintClassName: string;
  children: ReactNode;
}

function AdvancedProviderFormBlock({
  title,
  note,
  className,
  labelClassName,
  hintClassName,
  children,
}: AdvancedProviderFormBlockProps) {
  return (
    <section className={className}>
      <div className="space-y-1">
        <div className={`text-xs font-black ${labelClassName}`}>{title}</div>
        {note && <p className={`text-[11px] leading-relaxed ${hintClassName}`}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

const emptyMap = (): Record<KeyField, string> => ({
  zhenzhenApiKey: '', rhApiKey: '', llmApiKey: '',
  gptImageApiKey: '', nanoBananaApiKey: '', mjApiKey: '', veoApiKey: '',
  soraApiKey: '', grokApiKey: '', seedanceApiKey: '', sunoApiKey: '', giteeMusicApiKey: '',
});
const emptyShow = (): Record<KeyField, boolean> => ({
  zhenzhenApiKey: false, rhApiKey: false, llmApiKey: false,
  gptImageApiKey: false, nanoBananaApiKey: false, mjApiKey: false, veoApiKey: false,
  soraApiKey: false, grokApiKey: false, seedanceApiKey: false, sunoApiKey: false, giteeMusicApiKey: false,
});

function formatCloudError(error: string, data?: any) {
  const parts = [
    error,
    data?.hint,
    data?.providerCode ? `Code: ${data.providerCode}` : '',
    data?.requestId ? `RequestId: ${data.requestId}` : '',
  ].filter(Boolean);
  return parts.join('；');
}

function normalizeAdvancedProviderForms(value: unknown): AdvancedProviderConfig[] {
  return normalizeApiSettings({ advancedProviders: value as AdvancedProviderConfig[] }).advancedProviders || [];
}

function normalizeCloudUploadTargetForms(value: unknown): CloudUploadTargetConfig[] {
  return normalizeApiSettings({ cloudUploadTargets: value as CloudUploadTargetConfig[] }).cloudUploadTargets || [];
}

function normalizeOutputStorageSpaceForms(value: unknown): OutputStorageSpaceConfig[] {
  return normalizeApiSettings({ outputStorageSpaces: value as OutputStorageSpaceConfig[] }).outputStorageSpaces || [];
}

function formatStorageBytes(value?: number): string {
  const bytes = Number(value) || 0;
  if (!bytes) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function normalizeCanvasNodeMenuPreferenceForms(value: unknown): CanvasNodeMenuPreferences {
  return normalizeCanvasNodeMenuPreferences(value);
}

function normalizeLlmConfigForms(value: unknown, settings?: Partial<ApiSettings>): LlmConfig[] {
  const source = Array.isArray(value) ? value : [];
  const normalized = normalizeApiSettings({ ...(settings || {}), llmConfigs: source as LlmConfig[] }).llmConfigs || [];
  if (normalized.length > 0) return normalized;
  const legacyKey = typeof settings?.llmApiKey === 'string' ? settings.llmApiKey : '';
  const legacyBaseUrl = typeof settings?.llmBaseUrl === 'string' && settings.llmBaseUrl.trim()
    ? settings.llmBaseUrl
    : FIXED_ZHENZHEN_BASE;
  const legacyModel = typeof settings?.llmModel === 'string' && settings.llmModel.trim()
    ? settings.llmModel
    : DEFAULT_LLM_MODEL;
  return [{
    id: 'default',
    label: '默认 LLM',
    apiKey: legacyKey,
    hasApiKey: !!legacyKey,
    baseUrl: legacyBaseUrl,
    model: legacyModel,
    isDefault: true,
  }];
}

function getLlmConfigSource(settings?: Partial<ApiSettings>): unknown {
  if (Array.isArray(settings?.llmConfigs) && settings.llmConfigs.length > 0) return settings.llmConfigs;
  if (Array.isArray(settings?.llmApiKeys) && settings.llmApiKeys.length > 0) return settings.llmApiKeys;
  return settings?.llmConfigs || settings?.llmApiKeys;
}

function uniqueLlmConfigId(configs: LlmConfig[]): string {
  const used = new Set(configs.map((item) => String(item.id || '')));
  for (let index = configs.length + 1; index < configs.length + 200; index += 1) {
    const id = `llm-${index}`;
    if (!used.has(id)) return id;
  }
  return `llm-${Date.now().toString(36)}`;
}

function uniqueAdvancedProviderId(providers: AdvancedProviderConfig[], prefix: string): string {
  const used = new Set(providers.map((provider) => String(provider.id || '')));
  for (let index = providers.length + 1; index < providers.length + 200; index += 1) {
    const id = `${prefix}-${index}`;
    if (!used.has(id)) return id;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

export default function ApiSettingsModal({ open, onClose }: ApiSettingsModalProps) {
  const { theme, style } = useThemeStore();
  const { settings, loading, error, load, save, loaded } = useApiKeysStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';

  const [inputs, setInputs] = useState<Record<KeyField, string>>(emptyMap());
  const [shows, setShows] = useState<Record<KeyField, boolean>>(emptyShow());
  const [clearedFields, setClearedFields] = useState<Partial<Record<KeyField, boolean>>>({});
  const [saved, setSaved] = useState(false);
  // v1.2.10.2: 文件自动保存路径输入
  const [fileSavePathInput, setFileSavePathInput] = useState<string>('');
  // v1.3.1: 画布自动保存路径输入
  const [canvasAutoSavePathInput, setCanvasAutoSavePathInput] = useState<string>('');
  // v1.3.4: 资源库路径输入
  const [resourceLibraryPathInput, setResourceLibraryPathInput] = useState<string>('');
  // v1.3.6: 主题模板路径输入
  const [themeTemplatePathInput, setThemeTemplatePathInput] = useState<string>('');
  // 本地 Eagle API 地址
  const [eagleApiBaseInput, setEagleApiBaseInput] = useState<string>('');
  // 分类独立 Key 区块折叠状态（新手友好：默认折叠，点击展开）
  const [classifiedOpen, setClassifiedOpen] = useState(false);
  const [llmConfigsOpen, setLlmConfigsOpen] = useState(false);
  const [llmConfigsInput, setLlmConfigsInput] = useState<LlmConfig[]>([]);
  const [llmConfigsDirty, setLlmConfigsDirty] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedProvidersInput, setAdvancedProvidersInput] = useState<AdvancedProviderConfig[]>([]);
  const [activeAdvancedProviderId, setActiveAdvancedProviderId] = useState<string>('');
  const [advancedDirty, setAdvancedDirty] = useState(false);
  const [draggedAdvancedProviderId, setDraggedAdvancedProviderId] = useState<string | null>(null);
  const [dragOverAdvancedProviderId, setDragOverAdvancedProviderId] = useState<string | null>(null);
  const [advancedTestStatus, setAdvancedTestStatus] = useState<Record<string, { loading?: boolean; ok?: boolean; message?: string }>>({});
  const [advancedComfyDrafts, setAdvancedComfyDrafts] = useState<Record<string, { workflowJson?: string; fields?: string; excludeRules?: string }>>({});
  const [cloudUploadOpen, setCloudUploadOpen] = useState(false);
  const [cloudUploadTargetsInput, setCloudUploadTargetsInput] = useState<CloudUploadTargetConfig[]>([]);
  const [activeCloudTargetId, setActiveCloudTargetId] = useState<string>('');
  const [cloudUploadDirty, setCloudUploadDirty] = useState(false);
  const [cloudTestStatus, setCloudTestStatus] = useState<Record<string, { loading?: boolean; ok?: boolean; message?: string }>>({});
  const [outputStorageSpacesInput, setOutputStorageSpacesInput] = useState<OutputStorageSpaceConfig[]>([]);
  const [activeOutputStorageSpaceIdInput, setActiveOutputStorageSpaceIdInput] = useState('primary');
  const [outputStorageDirty, setOutputStorageDirty] = useState(false);
  const [outputStorageTestStatus, setOutputStorageTestStatus] = useState<Record<string, { loading?: boolean; ok?: boolean; message?: string }>>({});
  const [nodeMenuOpen, setNodeMenuOpen] = useState(false);
  const [nodeMenuPreferencesInput, setNodeMenuPreferencesInput] = useState<CanvasNodeMenuPreferences>(
    () => normalizeCanvasNodeMenuPreferenceForms(undefined),
  );
  const [nodeMenuDirty, setNodeMenuDirty] = useState(false);
  // 节点帮助文档管理
  const [nodeHelpOpen, setNodeHelpOpen] = useState(false);
  const [nodeHelpMap, setNodeHelpMap] = useState<NodeHelpMap>({});
  const [activeNodeHelpType, setActiveNodeHelpType] = useState<string>('');
  const [nodeHelpDraft, setNodeHelpDraft] = useState<string>('');
  const [nodeHelpDirty, setNodeHelpDirty] = useState(false);
  const [nodeHelpView, setNodeHelpView] = useState<'edit' | 'preview'>('edit');
  const [nodeHelpBusy, setNodeHelpBusy] = useState(false);
  const [nodeHelpMessage, setNodeHelpMessage] = useState<string>('');
  const nodeHelpImportFileRef = useRef<HTMLInputElement | null>(null);
  const [backupMessage, setBackupMessage] = useState<string>('');
  const [taskSoundMessage, setTaskSoundMessage] = useState<string>('');
  const [taskSoundBusy, setTaskSoundBusy] = useState(false);
  const [taskSoundTesting, setTaskSoundTesting] = useState(false);
  const [taskFailureSoundMessage, setTaskFailureSoundMessage] = useState<string>('');
  const [taskFailureSoundBusy, setTaskFailureSoundBusy] = useState(false);
  const [taskFailureSoundTesting, setTaskFailureSoundTesting] = useState(false);
  const [fhlOpen, setFhlOpen] = useState(false);
  const [fhlConfig, setFhlConfig] = useState<FhlConfigSummary | null>(null);
  const [fhlBusy, setFhlBusy] = useState(false);
  const [fhlMessage, setFhlMessage] = useState('');
  const [fhlWorkerName, setFhlWorkerName] = useState('');
  const [fhlWorkerKey, setFhlWorkerKey] = useState('');
  // 贞贞工坊启用开关（对应 enableZhenzhenFallback）
  const [zhenzhenEnabled, setZhenzhenEnabled] = useState(true);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const taskCompletionSoundFileInputRef = useRef<HTMLInputElement | null>(null);
  const taskFailureSoundFileInputRef = useRef<HTMLInputElement | null>(null);
  // 眼睛预览拉取的明文（仅缓存，不提交）
  const revealedRef = useRef<Partial<Record<KeyField, string>>>({});

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  // 重置表单(脱敏 Key 不直接填充,留空则保持后端原值)
  useEffect(() => {
    if (open) {
      setInputs(emptyMap());
      setShows(emptyShow());
      setClearedFields({});
      revealedRef.current = {};
      setSaved(false);
      setBackupMessage('');
      setClassifiedOpen(false);
      setLlmConfigsOpen(false);
      setLlmConfigsInput(normalizeLlmConfigForms(getLlmConfigSource(settings), settings));
      setLlmConfigsDirty(false);
      setAdvancedOpen(false);
      const providers = normalizeAdvancedProviderForms((settings as any)?.advancedProviders);
      setAdvancedProvidersInput(providers);
      setActiveAdvancedProviderId(providers[0]?.id || '');
      setAdvancedDirty(false);
      setDraggedAdvancedProviderId(null);
      setDragOverAdvancedProviderId(null);
      setAdvancedTestStatus({});
      setAdvancedComfyDrafts({});
      setCloudUploadOpen(false);
      const cloudTargets = normalizeCloudUploadTargetForms((settings as any)?.cloudUploadTargets);
      setCloudUploadTargetsInput(cloudTargets);
      setActiveCloudTargetId(cloudTargets[0]?.id || '');
      setCloudUploadDirty(false);
      setCloudTestStatus({});
      setOutputStorageSpacesInput(normalizeOutputStorageSpaceForms((settings as any)?.outputStorageSpaces));
      setActiveOutputStorageSpaceIdInput((settings as any)?.activeOutputStorageSpaceId || 'primary');
      setOutputStorageDirty(false);
      setOutputStorageTestStatus({});
      setNodeMenuOpen(false);
      setNodeMenuPreferencesInput(normalizeCanvasNodeMenuPreferenceForms((settings as any)?.canvasNodeMenuPreferences));
      setNodeMenuDirty(false);
      setTaskSoundMessage('');
      setTaskSoundBusy(false);
      setTaskSoundTesting(false);
      setTaskFailureSoundMessage('');
      setTaskFailureSoundBusy(false);
      setTaskFailureSoundTesting(false);
      // 回填文件自动保存路径(明文字段，不脱敏)
      setFileSavePathInput((settings as any)?.fileSavePath || '');
      setCanvasAutoSavePathInput((settings as any)?.canvasAutoSavePath || '');
      setResourceLibraryPathInput((settings as any)?.resourceLibraryPath || '');
      setThemeTemplatePathInput((settings as any)?.themeTemplatePath || '');
      setEagleApiBaseInput((settings as any)?.eagleApiBase || '');
      setZhenzhenEnabled((settings as any)?.enableZhenzhenFallback !== false);
    }
  }, [open, settings]);

  // 节点帮助文档：modal 打开时加载全部节点帮助（合并后端覆盖 + 内置默认）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setNodeHelpBusy(true);
    setNodeHelpMessage('');
    getNodeHelps()
      .then((map) => {
        if (cancelled) return;
        const merged: NodeHelpMap = {};
        for (const node of NODE_HELP_NODES) {
          const custom = map[node.type];
          merged[node.type] = custom && custom.trim() ? custom : (DEFAULT_NODE_HELPS[node.type] || '');
        }
        setNodeHelpMap(merged);
        if (!activeNodeHelpType && NODE_HELP_NODES.length > 0) {
          setActiveNodeHelpType(NODE_HELP_NODES[0].type);
        }
      })
      .catch((e: any) => {
        if (!cancelled) setNodeHelpMessage(e?.message || '加载节点帮助失败');
      })
      .finally(() => {
        if (!cancelled) setNodeHelpBusy(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFhlMessage('');
    getFhlConfig()
      .then((value) => { if (!cancelled) setFhlConfig(value); })
      .catch((error: any) => { if (!cancelled) setFhlMessage(error?.message || 'FHL 配置加载失败'); });
    return () => { cancelled = true; };
  }, [open]);

  // 节点帮助文档：切换选中节点时同步草稿
  useEffect(() => {
    if (!activeNodeHelpType) return;
    const current = nodeHelpMap[activeNodeHelpType] ?? '';
    setNodeHelpDraft(current);
    setNodeHelpDirty(false);
    setNodeHelpView('edit');
    setNodeHelpMessage('');
  }, [activeNodeHelpType, nodeHelpMap]);

  if (!open) return null;

  const runFhlAction = async (action: () => Promise<FhlConfigSummary>, successMessage: string) => {
    setFhlBusy(true);
    setFhlMessage('');
    try {
      const value = await action();
      setFhlConfig(value);
      window.dispatchEvent(new CustomEvent('t8:fhl-config-updated', { detail: value }));
      setFhlMessage(successMessage);
      setFhlWorkerKey('');
    } catch (error: any) {
      setFhlMessage(error?.message || 'FHL 设置操作失败');
    } finally {
      setFhlBusy(false);
    }
  };

  const setInputAt = (f: KeyField, v: string) => {
    setInputs((prev) => ({ ...prev, [f]: v }));
    if (v.trim()) {
      setClearedFields((prev) => {
        if (!prev[f]) return prev;
        const next = { ...prev };
        delete next[f];
        return next;
      });
    }
  };

  const getCurrentEditableSettings = (): Partial<ApiSettings> => ({
    zhenzhenApiKey: inputs.zhenzhenApiKey.trim(),
    rhApiKey: inputs.rhApiKey.trim(),
    llmApiKey: inputs.llmApiKey.trim(),
    gptImageApiKey: inputs.gptImageApiKey.trim(),
    nanoBananaApiKey: inputs.nanoBananaApiKey.trim(),
    mjApiKey: inputs.mjApiKey.trim(),
    veoApiKey: inputs.veoApiKey.trim(),
    soraApiKey: inputs.soraApiKey.trim(),
    grokApiKey: inputs.grokApiKey.trim(),
    seedanceApiKey: inputs.seedanceApiKey.trim(),
    sunoApiKey: inputs.sunoApiKey.trim(),
    giteeMusicApiKey: inputs.giteeMusicApiKey.trim(),
    fileSavePath: fileSavePathInput.trim(),
    canvasAutoSavePath: canvasAutoSavePathInput.trim(),
    resourceLibraryPath: resourceLibraryPathInput.trim(),
    themeTemplatePath: themeTemplatePathInput.trim(),
    eagleApiBase: eagleApiBaseInput.trim(),
    ...(llmConfigsDirty ? { llmConfigs: llmConfigsInput } : {}),
    ...(advancedDirty ? { advancedProviders: advancedProvidersInput } : {}),
    ...(cloudUploadDirty ? { cloudUploadTargets: cloudUploadTargetsInput } : {}),
    ...(outputStorageDirty ? {
      outputStorageSpaces: outputStorageSpacesInput,
      activeOutputStorageSpaceId: activeOutputStorageSpaceIdInput,
    } : {}),
    ...(nodeMenuDirty ? { canvasNodeMenuPreferences: nodeMenuPreferencesInput } : {}),
  });

  const isMaskedKeyValue = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    return /^\*{2,}/.test(value.trim());
  };

  const normalizeImportedSettings = (raw: unknown): Partial<ApiSettings> => {
    const source = raw && typeof raw === 'object' && 'settings' in raw
      ? (raw as any).settings
      : raw;
    if (!source || typeof source !== 'object') {
      throw new Error('设置备份格式不正确');
    }
    const next: Partial<ApiSettings> = {};
    for (const field of ALL_FIELDS) {
      const value = (source as any)[field];
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed || isMaskedKeyValue(trimmed)) continue;
      (next as any)[field] = trimmed;
    }
    for (const field of PATH_FIELDS) {
      const value = (source as any)[field];
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      (next as any)[field] = trimmed;
    }
    if ((source as any).preferences && typeof (source as any).preferences === 'object') {
      next.preferences = { ...(source as any).preferences };
    }
    if (Array.isArray((source as any).llmConfigs) || Array.isArray((source as any).llmApiKeys)) {
      next.llmConfigs = normalizeLlmConfigForms(getLlmConfigSource(source as Partial<ApiSettings>), source as Partial<ApiSettings>);
    }
    if (Array.isArray((source as any).advancedProviders)) {
      next.advancedProviders = normalizeAdvancedProviderForms((source as any).advancedProviders);
    }
    if (Array.isArray((source as any).cloudUploadTargets)) {
      next.cloudUploadTargets = normalizeCloudUploadTargetForms((source as any).cloudUploadTargets);
    }
    if (Array.isArray((source as any).outputStorageSpaces)) {
      next.outputStorageSpaces = normalizeOutputStorageSpaceForms((source as any).outputStorageSpaces);
      next.activeOutputStorageSpaceId = String((source as any).activeOutputStorageSpaceId || 'primary');
    }
    if ((source as any).canvasNodeMenuPreferences && typeof (source as any).canvasNodeMenuPreferences === 'object') {
      next.canvasNodeMenuPreferences = normalizeCanvasNodeMenuPreferenceForms((source as any).canvasNodeMenuPreferences);
    }
    return next;
  };

  const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportSettings = async () => {
    try {
      let raw: ApiSettings | null = null;
      try {
        raw = await getRawSettings();
      } catch {
        raw = null;
      }
      const editable = getCurrentEditableSettings();
      const exportSettings = {
        ...(raw || {}),
        ...Object.fromEntries(
          Object.entries(editable).filter(([, value]) => typeof value === 'string' && value.trim())
        ),
        zhenzhenBaseUrl: FIXED_ZHENZHEN_BASE,
        llmBaseUrl: FIXED_ZHENZHEN_BASE,
        rhBaseUrl: RH_BASE,
      };
      const payload = {
        schema: SETTINGS_BACKUP_SCHEMA,
        version: SETTINGS_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        containsSecrets: true,
        note: '此文件包含明文 API Key，请勿上传到 GitHub 或公开分享。',
        settings: exportSettings,
      };
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      downloadJson(`t8-settings-backup-${date}.json`, payload);
      setBackupMessage('已导出设置备份。注意：文件包含明文 API Key，请妥善保管。');
    } catch (e: any) {
      setBackupMessage(e?.message || '导出设置失败');
    }
  };

  const applyImportedSettings = (patch: Partial<ApiSettings>) => {
    setInputs((prev) => {
      const nextInputs = { ...prev };
      for (const field of ALL_FIELDS) {
        const value = (patch as any)[field];
        if (typeof value === 'string' && value.trim()) nextInputs[field] = value.trim();
      }
      return nextInputs;
    });
    setShows(emptyShow());
    setClearedFields({});
    revealedRef.current = {};
    if (typeof patch.fileSavePath === 'string') setFileSavePathInput(patch.fileSavePath);
    if (typeof patch.canvasAutoSavePath === 'string') setCanvasAutoSavePathInput(patch.canvasAutoSavePath);
    if (typeof patch.resourceLibraryPath === 'string') setResourceLibraryPathInput(patch.resourceLibraryPath);
    if (typeof patch.themeTemplatePath === 'string') setThemeTemplatePathInput(patch.themeTemplatePath);
    if (typeof patch.eagleApiBase === 'string') setEagleApiBaseInput(patch.eagleApiBase);
    if (Array.isArray(patch.llmConfigs)) {
      setLlmConfigsInput(normalizeLlmConfigForms(patch.llmConfigs, patch));
      setLlmConfigsDirty(true);
      setLlmConfigsOpen(true);
    }
    if (Array.isArray(patch.advancedProviders)) {
      const providers = normalizeAdvancedProviderForms(patch.advancedProviders);
      setAdvancedProvidersInput(providers);
      setActiveAdvancedProviderId(providers[0]?.id || '');
      setAdvancedDirty(true);
      setAdvancedOpen(true);
    }
    if (Array.isArray((patch as any).cloudUploadTargets)) {
      const targets = normalizeCloudUploadTargetForms((patch as any).cloudUploadTargets);
      setCloudUploadTargetsInput(targets);
      setActiveCloudTargetId(targets[0]?.id || '');
      setCloudUploadDirty(true);
      setCloudUploadOpen(true);
    }
    if (Array.isArray((patch as any).outputStorageSpaces)) {
      setOutputStorageSpacesInput(normalizeOutputStorageSpaceForms((patch as any).outputStorageSpaces));
      setActiveOutputStorageSpaceIdInput((patch as any).activeOutputStorageSpaceId || 'primary');
      setOutputStorageDirty(true);
    }
    if ((patch as any).canvasNodeMenuPreferences) {
      setNodeMenuPreferencesInput(normalizeCanvasNodeMenuPreferenceForms((patch as any).canvasNodeMenuPreferences));
      setNodeMenuDirty(true);
      setNodeMenuOpen(true);
    }
    setClassifiedOpen(true);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const patch = normalizeImportedSettings(parsed);
      if (Object.keys(patch).length === 0) {
        setBackupMessage('未读取到可导入的设置，已跳过空值和脱敏 Key。');
        return;
      }
      applyImportedSettings(patch);
      setBackupMessage('已导入到表单，请检查后点击“保存”生效。');
    } catch (e: any) {
      setBackupMessage(e?.message || '导入设置失败，请确认 JSON 文件格式。');
    } finally {
      if (backupFileInputRef.current) backupFileInputRef.current.value = '';
    }
  };

  // 眼睛点击: 如果要切为“显示”且当前 input 为空但后端已存在 key,
  // 调 /api/settings/raw 拿明文填充。
  const handleToggleShow = async (f: KeyField) => {
    if (clearedFields[f]) {
      setClearedFields((prev) => {
        const next = { ...prev };
        delete next[f];
        return next;
      });
    }
    const newShow = !shows[f];
    if (newShow && !inputs[f].trim() && (settings as any)[f]) {
      try {
        if (!revealedRef.current || Object.keys(revealedRef.current).length === 0) {
          const raw = await getRawSettings();
          revealedRef.current = raw as any;
        }
      } catch {
        // 忽略拉取失败
      }
      const plain = (revealedRef.current as any)?.[f];
      if (plain) setInputAt(f, String(plain));
    }
    setShows((prev) => ({ ...prev, [f]: newShow }));
  };

  const handleClearClassifiedKey = (f: KeyField) => {
    if (clearedFields[f]) {
      setClearedFields((prev) => {
        const next = { ...prev };
        delete next[f];
        return next;
      });
      return;
    }
    setInputs((prev) => ({ ...prev, [f]: '' }));
    setShows((prev) => ({ ...prev, [f]: false }));
    if (revealedRef.current) {
      delete (revealedRef.current as any)[f];
    }
    const hasSaved = !!String((settings as any)?.[f] || '').trim();
    if (hasSaved) {
      setClearedFields((prev) => ({ ...prev, [f]: true }));
    }
  };

  const handleSave = async () => {
    const patch: Partial<ApiSettings> = {};
    for (const f of ALL_FIELDS) {
      if (clearedFields[f]) {
        (patch as any)[f] = '';
        continue;
      }
      const v = inputs[f].trim();
      if (!v) continue;
      // 眼睛拉出明文未修改 → 跳过，不走一道上行请求
      const revealed = (revealedRef.current as any)?.[f];
      if (revealed && v === String(revealed)) continue;
      (patch as any)[f] = v;
    }
    // v1.2.10.2: 文件自动保存路径变动才上行
    const newPath = (fileSavePathInput || '').trim();
    const oldPath = (settings as any)?.fileSavePath || '';
    if (newPath && newPath !== oldPath) {
      (patch as any).fileSavePath = newPath;
    }
    const newCanvasPath = (canvasAutoSavePathInput || '').trim();
    const oldCanvasPath = (settings as any)?.canvasAutoSavePath || '';
    if (newCanvasPath && newCanvasPath !== oldCanvasPath) {
      (patch as any).canvasAutoSavePath = newCanvasPath;
    }
    const newResourcePath = (resourceLibraryPathInput || '').trim();
    const oldResourcePath = (settings as any)?.resourceLibraryPath || '';
    if (newResourcePath && newResourcePath !== oldResourcePath) {
      (patch as any).resourceLibraryPath = newResourcePath;
    }
    const newThemeTemplatePath = (themeTemplatePathInput || '').trim();
    const oldThemeTemplatePath = (settings as any)?.themeTemplatePath || '';
    if (newThemeTemplatePath && newThemeTemplatePath !== oldThemeTemplatePath) {
      (patch as any).themeTemplatePath = newThemeTemplatePath;
    }
    const newEagleApiBase = (eagleApiBaseInput || '').trim();
    const oldEagleApiBase = (settings as any)?.eagleApiBase || '';
    if (newEagleApiBase && newEagleApiBase !== oldEagleApiBase) {
      (patch as any).eagleApiBase = newEagleApiBase;
    }
    if (llmConfigsDirty) {
      (patch as any).llmConfigs = llmConfigsInput;
    }
    if (advancedDirty) {
      (patch as any).advancedProviders = advancedProvidersInput;
    }
    if (cloudUploadDirty) {
      (patch as any).cloudUploadTargets = cloudUploadTargetsInput;
    }
    if (outputStorageDirty) {
      (patch as any).outputStorageSpaces = outputStorageSpacesInput;
      (patch as any).activeOutputStorageSpaceId = activeOutputStorageSpaceIdInput;
    }
    if (nodeMenuDirty) {
      (patch as any).canvasNodeMenuPreferences = nodeMenuPreferencesInput;
    }
    // 贞贞工坊启用开关
    if (zhenzhenEnabled !== ((settings as any)?.enableZhenzhenFallback !== false)) {
      (patch as any).enableZhenzhenFallback = zhenzhenEnabled;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    await save(patch);
    setClearedFields({});
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const inputCls = isPixel
    ? 't8-api-settings-input flex-1 px-3 py-2 rounded-[10px] text-sm outline-none px-input'
    : 't8-api-settings-input flex-1 px-3 py-2 rounded-md text-sm outline-none border';

  const labelCls = 't8-api-settings-label';
  const hintCls = 't8-api-settings-hint';
  const eyeBtnCls = isPixel
    ? 't8-api-settings-icon-btn px-btn px-btn--icon px-btn--ghost'
    : 't8-api-settings-icon-btn p-2 rounded-md';

  // 防御性脱敏：始终只显示尾4位（与之前 `****9zVR` 一致），
  // 即使后端意外返回明文也不会暴露完整 Key
  const toMaskedDisplay = (v?: string): string => {
    if (!v) return '';
    const s = String(v);
    // 后端已脱敏（****xxxx 形式）直接原样
    if (/^\*{2,}/.test(s)) return s;
    if (s.length <= 4) return '****';
    return '****' + s.slice(-4);
  };

  // 获取 APIKey 外部链接按钮样式（双主题）
  const linkBtnCls = isPixel
    ? 't8-api-settings-action-btn px-btn px-btn--mint flex items-center gap-1 text-[11px] px-2 py-1'
    : 't8-api-settings-action-btn flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition border';
  const linkBtnAltCls = isPixel
    ? 't8-api-settings-action-btn px-btn flex items-center gap-1 text-[11px] px-2 py-1'
    : 't8-api-settings-action-btn flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition border';

  const openExternal = (url: string) => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // 志忘
    }
  };

  const isTaskCompletionSoundFile = (file: File): boolean => {
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
    return file.type.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'].includes(ext);
  };

  const formatTaskCompletionSoundSize = (size?: number): string => {
    const n = Number(size || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  };

  const refreshTaskCompletionSoundSettings = async () => {
    await load();
    await taskCompletionSoundController.refreshSettings();
  };

  const handleTaskCompletionSoundUpload = async (file: File | null) => {
    if (!file) return;
    if (!isTaskCompletionSoundFile(file)) {
      setTaskSoundMessage('请选择音频文件：mp3 / wav / ogg / m4a / aac / flac / webm。');
      if (taskCompletionSoundFileInputRef.current) taskCompletionSoundFileInputRef.current.value = '';
      return;
    }
    setTaskSoundBusy(true);
    setTaskSoundMessage('');
    try {
      const result = await uploadTaskCompletionSound(file);
      await refreshTaskCompletionSoundSettings();
      const sizeLabel = formatTaskCompletionSoundSize(result.size || file.size);
      setTaskSoundMessage(`已使用自定义提示音：${result.name || file.name}${sizeLabel ? ` · ${sizeLabel}` : ''}`);
    } catch (e: any) {
      setTaskSoundMessage(e?.message || '上传提示音失败');
    } finally {
      setTaskSoundBusy(false);
      if (taskCompletionSoundFileInputRef.current) taskCompletionSoundFileInputRef.current.value = '';
    }
  };

  const handleResetTaskCompletionSound = async () => {
    setTaskSoundBusy(true);
    setTaskSoundMessage('');
    try {
      await resetTaskCompletionSound();
      await refreshTaskCompletionSoundSettings();
      setTaskSoundMessage('已恢复默认任务完成提示音。');
    } catch (e: any) {
      setTaskSoundMessage(e?.message || '恢复默认提示音失败');
    } finally {
      setTaskSoundBusy(false);
    }
  };

  const handlePreviewTaskCompletionSound = async () => {
    setTaskSoundTesting(true);
    setTaskSoundMessage('');
    try {
      await playTaskCompletionSound((settings as any)?.taskCompletionSound);
    } catch (e: any) {
      setTaskSoundMessage(e?.message || '试听提示音失败，请先与页面交互后重试。');
    } finally {
      setTaskSoundTesting(false);
    }
  };

  // 每个字段费应的「获取 APIKey」按钮配置
  const handleTaskFailureSoundUpload = async (file: File | null) => {
    if (!file) return;
    if (!isTaskCompletionSoundFile(file)) {
      setTaskFailureSoundMessage('Please choose an audio file: mp3 / wav / ogg / m4a / aac / flac / webm.');
      if (taskFailureSoundFileInputRef.current) taskFailureSoundFileInputRef.current.value = '';
      return;
    }
    setTaskFailureSoundBusy(true);
    setTaskFailureSoundMessage('');
    try {
      const result = await uploadTaskFailureSound(file);
      await refreshTaskCompletionSoundSettings();
      const sizeLabel = formatTaskCompletionSoundSize(result.size || file.size);
      setTaskFailureSoundMessage(`Custom failure sound saved: ${result.name || file.name}${sizeLabel ? ` · ${sizeLabel}` : ''}`);
    } catch (e: any) {
      setTaskFailureSoundMessage(e?.message || 'Failed to upload sound.');
    } finally {
      setTaskFailureSoundBusy(false);
      if (taskFailureSoundFileInputRef.current) taskFailureSoundFileInputRef.current.value = '';
    }
  };

  const handleResetTaskFailureSound = async () => {
    setTaskFailureSoundBusy(true);
    setTaskFailureSoundMessage('');
    try {
      await resetTaskFailureSound();
      await refreshTaskCompletionSoundSettings();
      setTaskFailureSoundMessage('Default failure sound restored.');
    } catch (e: any) {
      setTaskFailureSoundMessage(e?.message || 'Failed to restore default sound.');
    } finally {
      setTaskFailureSoundBusy(false);
    }
  };

  const handlePreviewTaskFailureSound = async () => {
    setTaskFailureSoundTesting(true);
    setTaskFailureSoundMessage('');
    try {
      await playTaskFailureSound((settings as any)?.taskFailureSound);
    } catch (e: any) {
      setTaskFailureSoundMessage(e?.message || 'Failed to preview sound. Interact with the page and try again.');
    } finally {
      setTaskFailureSoundTesting(false);
    }
  };

  // 节点帮助文档：保存当前编辑到后端
  const handleSaveNodeHelp = async () => {
    if (!activeNodeHelpType) return;
    setNodeHelpBusy(true);
    setNodeHelpMessage('');
    try {
      const content = nodeHelpDraft;
      await saveNodeHelp(activeNodeHelpType, content);
      setNodeHelpMap((prev) => ({ ...prev, [activeNodeHelpType]: content }));
      setNodeHelpDirty(false);
      clearNodeHelpCache(activeNodeHelpType);
      setNodeHelpMessage('已保存');
    } catch (e: any) {
      setNodeHelpMessage(e?.message || '保存失败');
    } finally {
      setNodeHelpBusy(false);
    }
  };

  // 节点帮助文档：重置为默认（删除后端覆盖）
  const handleResetNodeHelp = async () => {
    if (!activeNodeHelpType) return;
    setNodeHelpBusy(true);
    setNodeHelpMessage('');
    try {
      await deleteNodeHelp(activeNodeHelpType);
      const fallback = DEFAULT_NODE_HELPS[activeNodeHelpType] || '';
      setNodeHelpMap((prev) => ({ ...prev, [activeNodeHelpType]: fallback }));
      setNodeHelpDraft(fallback);
      setNodeHelpDirty(false);
      clearNodeHelpCache(activeNodeHelpType);
      setNodeHelpMessage('已恢复为默认');
    } catch (e: any) {
      setNodeHelpMessage(e?.message || '重置失败');
    } finally {
      setNodeHelpBusy(false);
    }
  };

  // 节点帮助文档：清空当前编辑内容（不保存）
  const handleClearNodeHelp = () => {
    setNodeHelpDraft('');
    setNodeHelpDirty(true);
    setNodeHelpMessage('');
  };

  // 节点帮助文档：导出 JSON 备份
  const handleExportNodeHelps = async () => {
    setNodeHelpBusy(true);
    setNodeHelpMessage('');
    try {
      const result = await exportNodeHelps();
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'node-helps-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      setNodeHelpMessage('已导出备份');
    } catch (e: any) {
      setNodeHelpMessage(e?.message || '导出失败');
    } finally {
      setNodeHelpBusy(false);
    }
  };

  // 节点帮助文档：导入 JSON 备份（merge 模式）
  const handleImportNodeHelps = async (file: File | null) => {
    if (!file) return;
    setNodeHelpBusy(true);
    setNodeHelpMessage('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const helps: NodeHelpMap = parsed?.helps && typeof parsed.helps === 'object' ? parsed.helps : parsed;
      await importNodeHelps(helps, 'merge');
      const map = await getNodeHelps();
      const merged: NodeHelpMap = {};
      for (const node of NODE_HELP_NODES) {
        const custom = map[node.type];
        merged[node.type] = custom && custom.trim() ? custom : (DEFAULT_NODE_HELPS[node.type] || '');
      }
      setNodeHelpMap(merged);
      clearNodeHelpCache();
      setNodeHelpMessage('已导入备份');
    } catch (e: any) {
      setNodeHelpMessage(e?.message || '导入失败，请检查 JSON 格式');
    } finally {
      setNodeHelpBusy(false);
      if (nodeHelpImportFileRef.current) nodeHelpImportFileRef.current.value = '';
    }
  };

  // 节点帮助文档：恢复全部默认（清空后端所有覆盖）
  const handleResetAllNodeHelps = async () => {
    if (!window.confirm('确定恢复全部节点帮助为默认内容？这将清空所有自定义帮助。')) return;
    setNodeHelpBusy(true);
    setNodeHelpMessage('');
    try {
      await bulkReplaceNodeHelps({});
      const merged: NodeHelpMap = {};
      for (const node of NODE_HELP_NODES) {
        merged[node.type] = DEFAULT_NODE_HELPS[node.type] || '';
      }
      setNodeHelpMap(merged);
      clearNodeHelpCache();
      setNodeHelpMessage('已恢复全部默认');
    } catch (e: any) {
      setNodeHelpMessage(e?.message || '恢复失败');
    } finally {
      setNodeHelpBusy(false);
    }
  };

  const renderGetKeyButtons = (field: KeyField) => {
    if (field === 'zhenzhenApiKey') {
      return (
        <button
          type="button"
          onClick={() => openExternal('https://ai.t8star.org/register?aff=dP7j')}
          className={linkBtnCls}
          title="前往贞贞工坊注册获取 APIKEY"
        >
          <ExternalLink size={11} /> 获取 APIKey
        </button>
      );
    }
    if (field === 'rhApiKey') {
      return (
        <>
          <button
            type="button"
            onClick={() => openExternal('https://www.runninghub.cn/user-center/1819214514410942465/webapp?inviteCode=rh-v1121')}
            className={linkBtnCls}
            title="国内用户·前往 runninghub.cn 获取 APIKEY"
          >
            <ExternalLink size={11} /> 获取 APIKey：国内用户
          </button>
          <button
            type="button"
            onClick={() => openExternal('https://www.runninghub.ai/user-center/1819214514410942465/webapp?inviteCode=rh-v1121')}
            className={linkBtnAltCls}
            title="国外用户·前往 runninghub.ai 获取 APIKEY"
          >
            <ExternalLink size={11} /> 国外用户
          </button>
        </>
      );
    }
    return null;
  };

  const advancedSummary = summarizeAdvancedProviderForm(advancedProvidersInput);
  const activeAdvancedProvider = advancedProvidersInput.find((provider) => provider.id === activeAdvancedProviderId)
    || advancedProvidersInput[0]
    || null;
  const cloudSummary = summarizeCloudUploadForm(cloudUploadTargetsInput);
  const activeCloudTarget = cloudUploadTargetsInput.find((target) => target.id === activeCloudTargetId)
    || cloudUploadTargetsInput[0]
    || null;
  const taskCompletionSoundSettings = (settings as any)?.taskCompletionSound || { mode: 'default', url: '' };
  const hasCustomTaskCompletionSound = taskCompletionSoundSettings.mode === 'custom' && !!taskCompletionSoundSettings.url;
  const taskCompletionSoundSizeLabel = formatTaskCompletionSoundSize(taskCompletionSoundSettings.size);
  const taskFailureSoundSettings = (settings as any)?.taskFailureSound || { mode: 'default', url: '' };
  const hasCustomTaskFailureSound = taskFailureSoundSettings.mode === 'custom' && !!taskFailureSoundSettings.url;
  const taskFailureSoundSizeLabel = formatTaskCompletionSoundSize(taskFailureSoundSettings.size);

  const updateAdvancedProvider = (id: string, patch: Partial<AdvancedProviderConfig>) => {
    setAdvancedProvidersInput((prev) => prev.map((provider) => (
      provider.id === id ? { ...provider, ...patch } : provider
    )));
    setAdvancedDirty(true);
  };

  const handleAdvancedProviderDragStart = (event: ReactDragEvent<HTMLButtonElement>, providerId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', providerId);
    setDraggedAdvancedProviderId(providerId);
    setDragOverAdvancedProviderId(providerId);
  };

  const handleAdvancedProviderDrop = (event: ReactDragEvent<HTMLButtonElement>, targetProviderId: string) => {
    event.preventDefault();
    const sourceProviderId = draggedAdvancedProviderId || event.dataTransfer.getData('text/plain');
    if (
      sourceProviderId
      && sourceProviderId !== targetProviderId
      && advancedProvidersInput.some((provider) => provider.id === sourceProviderId)
      && advancedProvidersInput.some((provider) => provider.id === targetProviderId)
    ) {
      setAdvancedProvidersInput((providers) => reorderAdvancedProviders(providers, sourceProviderId, targetProviderId));
      setAdvancedDirty(true);
    }
    setDraggedAdvancedProviderId(null);
    setDragOverAdvancedProviderId(null);
  };

  const addAdvancedProvider = (protocol: 'openai-compatible' | 'gemini-compatible') => {
    setAdvancedProvidersInput((prev) => {
      const id = uniqueAdvancedProviderId(prev, protocol === 'gemini-compatible' ? 'gemini-compatible' : 'openai-compatible');
      const provider: AdvancedProviderConfig = protocol === 'gemini-compatible'
        ? {
            id,
            label: 'Gemini',
            protocol,
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            enabled: true,
            imageModels: ['gemini-2.5-flash-image-preview', 'nano-banana-2'],
            videoModels: ['veo-3.1-generate-preview'],
            chatModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
            defaults: {
              imageModel: 'gemini-2.5-flash-image-preview',
              videoModel: 'veo-3.1-generate-preview',
              chatModel: 'gemini-2.5-flash',
            },
          }
        : {
            id,
            label: 'OpenAI',
            protocol,
            baseUrl: '',
            enabled: true,
            imageModels: ['gpt-image-1'],
            videoModels: [],
            chatModels: ['gpt-4o-mini'],
            defaults: {},
          };
      setActiveAdvancedProviderId(id);
      return [...prev, provider];
    });
    setAdvancedDirty(true);
    setAdvancedOpen(true);
  };

  const removeAdvancedProvider = (id: string) => {
    if (BUILT_IN_ADVANCED_PROVIDER_IDS.has(id)) return;
    setAdvancedProvidersInput((prev) => {
      const next = prev.filter((provider) => provider.id !== id);
      if (activeAdvancedProviderId === id) {
        setActiveAdvancedProviderId(next[0]?.id || '');
      }
      return next;
    });
    setAdvancedDirty(true);
    setAdvancedTestStatus((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateAdvancedProviderNested = (
    id: string,
    key: 'modelscopeConfig' | 'volcengineConfig' | 'comfyuiConfig' | 'jimengConfig',
    patch: Record<string, any>,
  ) => {
    setAdvancedProvidersInput((prev) => prev.map((provider) => (
      provider.id === id
        ? { ...provider, [key]: { ...(provider as any)[key], ...patch } }
        : provider
    )));
    setAdvancedDirty(true);
  };

  const handleTestAdvancedProvider = async (provider: AdvancedProviderConfig) => {
    setAdvancedTestStatus((prev) => ({ ...prev, [provider.id]: { loading: true } }));
    try {
      const result = await testAdvancedProvider({ provider, dryRun: false });
      setAdvancedTestStatus((prev) => ({
        ...prev,
        [provider.id]: {
          ok: result.ok,
          message: result.ok ? (result.message || '连接可用') : (result.error || '测试失败'),
        },
      }));
    } catch (e: any) {
      setAdvancedTestStatus((prev) => ({
        ...prev,
        [provider.id]: { ok: false, message: e?.message || '测试失败' },
      }));
    }
  };

  const updateCloudTarget = (id: string, patch: Partial<CloudUploadTargetConfig>) => {
    setCloudUploadTargetsInput((prev) => prev.map((target) => (
      target.id === id ? { ...target, ...patch } : target
    )));
    setCloudUploadDirty(true);
  };

  const updateCloudTargetNested = (
    id: string,
    key: 'tencentCos' | 'aliyunOss' | 'baiduNetdisk' | 'quarkNetdisk',
    patch: Record<string, any>,
  ) => {
    setCloudUploadTargetsInput((prev) => prev.map((target) => (
      target.id === id
        ? { ...target, [key]: { ...(target as any)[key], ...patch } }
        : target
    )));
    setCloudUploadDirty(true);
  };

  const markCloudDefault = (id: string) => {
    setCloudUploadTargetsInput((prev) => prev.map((target) => ({ ...target, isDefault: target.id === id })));
    setCloudUploadDirty(true);
  };

  const updateNodeMenuPreferences = (updater: (current: CanvasNodeMenuPreferences) => CanvasNodeMenuPreferences) => {
    setNodeMenuPreferencesInput((prev) => normalizeCanvasNodeMenuPreferenceForms(updater(prev)));
    setNodeMenuDirty(true);
  };

  const updateNodeMenuScene = (scene: CanvasNodeMenuScene, patch: Partial<CanvasNodeMenuPreferences[CanvasNodeMenuScene]>) => {
    updateNodeMenuPreferences((current) => ({
      ...current,
      [scene]: {
        ...current[scene],
        ...patch,
        items: patch.items || current[scene].items,
      },
    }));
  };

  const updateNodeMenuItemVisible = (scene: CanvasNodeMenuScene, type: string, visible: boolean) => {
    updateNodeMenuPreferences((current) => ({
      ...current,
      [scene]: {
        ...current[scene],
        items: current[scene].items.map((item) => (
          item.type === type ? { ...item, visible } : item
        )),
      },
    }));
  };

  const moveNodeMenuItem = (scene: CanvasNodeMenuScene, type: string, direction: -1 | 1) => {
    updateNodeMenuPreferences((current) => {
      const items = [...current[scene].items].sort((a, b) => a.order - b.order);
      const index = items.findIndex((item) => item.type === type);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return current;
      const [item] = items.splice(index, 1);
      items.splice(nextIndex, 0, item);
      return {
        ...current,
        [scene]: {
          ...current[scene],
          items: items.map((entry, order) => ({ ...entry, order })),
        },
      };
    });
  };

  const resetNodeMenuPreferences = () => {
    setNodeMenuPreferencesInput(normalizeCanvasNodeMenuPreferenceForms(undefined));
    setNodeMenuDirty(true);
  };

  const handleTestCloudTarget = async (target: CloudUploadTargetConfig) => {
    setCloudTestStatus((prev) => ({ ...prev, [target.id]: { loading: true } }));
    try {
      const result = await testCloudUploadTarget({ target });
      setCloudTestStatus((prev) => ({
        ...prev,
        [target.id]: {
          ok: result.success ? result.data.ok : false,
          message: result.success
            ? (result.data.message || '配置可用')
            : formatCloudError(result.error || '配置检查失败', (result as any).data),
        },
      }));
    } catch (e: any) {
      setCloudTestStatus((prev) => ({
        ...prev,
        [target.id]: { ok: false, message: e?.message || '配置检查失败' },
      }));
    }
  };

  const handleTestOutputStorage = async (space: OutputStorageSpaceConfig) => {
    setOutputStorageTestStatus((prev) => ({ ...prev, [space.id]: { loading: true } }));
    try {
      const result = await testOutputStorageSpace({ space });
      if (!result.success) throw new Error(result.error);
      const data = result.data;
      const available = formatStorageBytes(data.availableBytes || data.freeBytes);
      setOutputStorageTestStatus((prev) => ({
        ...prev,
        [space.id]: { ok: true, message: available ? `连接成功，可用 ${available}` : (data.capacityManagedExternally ? '连接成功，容量由网盘管理' : '连接成功') },
      }));
    } catch (e: any) {
      setOutputStorageTestStatus((prev) => ({
        ...prev,
        [space.id]: { ok: false, message: e?.message || '连接失败' },
      }));
    }
  };

  const handleReconcileOutputStorage = async (space: OutputStorageSpaceConfig) => {
    setOutputStorageTestStatus((prev) => ({ ...prev, [space.id]: { loading: true } }));
    try {
      const result = await reconcileOutputStorageSpace(space.id);
      if (!result.success) throw new Error(result.error);
      setOutputStorageTestStatus((prev) => ({
        ...prev,
        [space.id]: { ok: true, message: `对账完成，新增 ${result.data.added || 0} 个文件` },
      }));
    } catch (e: any) {
      setOutputStorageTestStatus((prev) => ({
        ...prev,
        [space.id]: { ok: false, message: e?.message || '对账失败' },
      }));
    }
  };

  const renderNodeMenuSceneSettings = (scene: CanvasNodeMenuScene) => {
    const scenePreference = nodeMenuPreferencesInput[scene];
    const metaByType = new Map(NODE_REGISTRY.map((meta) => [meta.type, meta]));
    const items = scenePreference.items
      .map((item) => ({ item, meta: metaByType.get(item.type) }))
      .filter((entry) => entry.meta && !entry.meta.hidden);
    const visibleCount = items.filter((entry) => entry.item.visible).length;
    return (
      <AdvancedProviderFormBlock
        key={scene}
        className={
          isPixel
            ? 't8-api-settings-section border p-3 space-y-3'
            : 't8-api-settings-section rounded-lg border p-3 space-y-3'
        }
        labelClassName={labelCls}
        hintClassName={hintCls}
        title={CANVAS_NODE_MENU_SCENE_LABELS[scene].title}
        note={CANVAS_NODE_MENU_SCENE_LABELS[scene].hint}
      >
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <label className={`flex items-center gap-2 text-xs font-bold ${labelCls}`}>
            <input
              type="checkbox"
              checked={scenePreference.enabled}
              onChange={(e) => updateNodeMenuScene(scene, { enabled: e.target.checked })}
            />
            显示这个菜单
          </label>
          <span className={`text-[11px] ${hintCls}`}>已显示 {visibleCount}/{items.length}</span>
        </div>
        <div className="max-h-72 overflow-y-auto pr-1 space-y-1">
          {items.map(({ item, meta }, index) => {
            const Icon = (LucideIcons as any)[meta?.icon || 'Box'] || LucideIcons.Box;
            return (
              <div
                key={item.type}
                className={
                  isPixel
                    ? 't8-api-settings-provider-card flex items-center gap-2 px-2 py-2 px-btn'
                    : 't8-api-settings-provider-card flex items-center gap-2 px-2 py-2 rounded-md border'
                }
              >
                <label className="flex items-center gap-2 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={item.visible}
                    onChange={(e) => updateNodeMenuItemVisible(scene, item.type, e.target.checked)}
                  />
                  <Icon size={14} className="shrink-0 t8-api-settings-icon" />
                  <span className={`text-xs font-bold truncate ${labelCls}`}>{meta?.label || item.type}</span>
                </label>
                <span className={`hidden sm:inline text-[10px] truncate max-w-[140px] ${hintCls}`}>{meta?.category}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveNodeMenuItem(scene, item.type, -1)}
                    disabled={index === 0}
                    className={
                      isPixel
                        ? 't8-api-settings-icon-btn px-btn px-btn--icon px-btn--ghost disabled:opacity-40'
                        : 't8-api-settings-icon-btn p-1 rounded-md disabled:opacity-40'
                    }
                    title="上移"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveNodeMenuItem(scene, item.type, 1)}
                    disabled={index === items.length - 1}
                    className={
                      isPixel
                        ? 't8-api-settings-icon-btn px-btn px-btn--icon px-btn--ghost disabled:opacity-40'
                        : 't8-api-settings-icon-btn p-1 rounded-md disabled:opacity-40'
                    }
                    title="下移"
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </AdvancedProviderFormBlock>
    );
  };

  const renderCloudTargetForm = (target: CloudUploadTargetConfig) => {
    const providerLabel = CLOUD_UPLOAD_LABELS[target.provider] || target.provider;
    const guide = CLOUD_UPLOAD_GUIDES[target.provider];
    const sectionCls = isPixel
      ? 't8-api-settings-provider-panel border p-3 space-y-4 min-w-0'
      : 't8-api-settings-provider-panel border rounded-xl p-3 sm:p-4 space-y-4 min-w-0';
    const formBlockCls = isPixel
      ? 't8-api-settings-section border p-3 space-y-3'
      : 't8-api-settings-section rounded-lg border p-3 space-y-3';
    const fieldInputCls = `${inputCls.replace('flex-1 ', '')} w-full min-w-0`;
    const guideBoxCls = isPixel
      ? 't8-api-settings-guide border p-3 text-[11px] leading-relaxed'
      : 't8-api-settings-guide rounded-lg border p-3 text-[11px] leading-relaxed';
    const smallPillCls = isPixel
      ? 't8-api-settings-pill inline-flex items-center px-1.5 py-0.5 border text-[10px] font-bold'
      : 't8-api-settings-pill inline-flex items-center rounded px-1.5 py-0.5 border text-[10px] font-semibold';
    const supported = true;
    const test = cloudTestStatus[target.id];
    return (
      <div className={sectionCls}>
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-black ${labelCls}`}>{target.label || providerLabel}</span>
              <span className={smallPillCls}>{providerLabel}</span>
              <span className={target.enabled ? 'text-[11px] font-bold text-emerald-500' : `text-[11px] font-bold ${hintCls}`}>
                {target.enabled ? '已启用' : '未启用'}
              </span>
              <span className={supported ? 'text-[11px] font-bold text-emerald-500' : `text-[11px] font-bold ${hintCls}`}>
                {guide?.status}
              </span>
            </div>
            <p className={`mt-1 text-[11px] leading-relaxed ${hintCls}`}>{guide?.subtitle}</p>
          </div>
          <label className={`flex items-center gap-2 text-xs font-bold shrink-0 ${labelCls}`}>
            <input
              type="checkbox"
              checked={!!target.enabled}
              onChange={(e) => updateCloudTarget(target.id, { enabled: e.target.checked })}
            />
            右键菜单显示
          </label>
          <label className={`flex items-center gap-2 text-xs font-bold shrink-0 ${labelCls}`}>
            <input
              type="radio"
              checked={!!target.isDefault}
              onChange={() => markCloudDefault(target.id)}
            />
            默认目标
          </label>
          <button
            type="button"
            onClick={() => handleTestCloudTarget(target)}
            disabled={!!test?.loading}
            className={
              isPixel
                ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 shrink-0'
                : 't8-api-settings-secondary-btn px-2 py-1 text-[11px] rounded border shrink-0 inline-flex items-center gap-1'
            }
          >
            <TestTube2 size={12} />
            {test?.loading ? '检查中...' : '配置检查'}
          </button>
        </div>

        {test?.message && (
          <div className={test.ok ? 'text-[11px] text-emerald-500' : 'text-[11px] text-red-400'}>
            {test.message}
          </div>
        )}

        <div className={guideBoxCls}>
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold">这是什么？</div>
              <p>{guide?.description}</p>
              <p className={`mt-2 ${hintCls}`}>
                右键上传只复制一份外部副本，不会改动画布节点、资源库文件或本地自动保存结果。
              </p>
            </div>
          </div>
        </div>

        <AdvancedProviderFormBlock
          className={formBlockCls}
          labelClassName={labelCls}
          hintClassName={hintCls}
          title="1. 基础信息"
          note="显示名称会出现在素材右键菜单中；路径前缀支持 {kind}、{yyyy-mm}、{date}，例如 t8-canvas/{kind}/{yyyy-mm}。"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className={`text-[11px] ${labelCls}`}>显示名称</span>
              <input
                value={target.label || ''}
                onChange={(e) => updateCloudTarget(target.id, { label: e.target.value })}
                className={fieldInputCls}
                placeholder={providerLabel}
              />
            </label>
            <label className="space-y-1">
              <span className={`text-[11px] ${labelCls}`}>路径前缀</span>
              <input
                value={target.prefix || ''}
                onChange={(e) => updateCloudTarget(target.id, { prefix: e.target.value })}
                className={fieldInputCls}
                placeholder="t8-canvas/{kind}/{yyyy-mm}"
              />
            </label>
            <label className="space-y-1 lg:col-span-2">
              <span className={`text-[11px] ${labelCls}`}>公共域名（可选）</span>
              <input
                value={target.publicBaseUrl || ''}
                onChange={(e) => updateCloudTarget(target.id, { publicBaseUrl: e.target.value })}
                className={fieldInputCls}
                placeholder={
                  target.provider === 'tencent-cos' || target.provider === 'aliyun-oss'
                    ? 'https://cdn.example.com/path · 留空返回默认对象 URL'
                    : 'https://cdn.example.com/path · 留空返回 WebDAV 文件地址'
                }
              />
            </label>
          </div>
        </AdvancedProviderFormBlock>

        {target.provider === 'tencent-cos' && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="2. 腾讯云 COS"
            note="SecretId / SecretKey 留空或保留 **** 表示不覆盖后端已保存密钥；SecretKey 只在创建密钥时显示一次。"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>Bucket</span>
                <input
                  value={target.tencentCos?.bucket || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'tencentCos', { bucket: e.target.value })}
                  className={fieldInputCls}
                  placeholder="example-1250000000"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>Region</span>
                <input
                  value={target.tencentCos?.region || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'tencentCos', { region: e.target.value })}
                  className={fieldInputCls}
                  placeholder="ap-guangzhou"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>SecretId</span>
                <input
                  type="password"
                  value={target.tencentCos?.secretId || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'tencentCos', { secretId: e.target.value })}
                  className={fieldInputCls}
                  placeholder={target.tencentCos?.hasSecretId ? '留空保持不变' : '请输入 SecretId'}
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>SecretKey</span>
                <input
                  type="password"
                  value={target.tencentCos?.secretKey || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'tencentCos', { secretKey: e.target.value })}
                  className={fieldInputCls}
                  placeholder={target.tencentCos?.hasSecretKey ? '留空保持不变' : '请输入 SecretKey'}
                />
              </label>
            </div>
            <div className={`text-[11px] leading-relaxed ${hintCls}`}>
              <div className="font-bold">控制台入口</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <a
                  href="https://console.cloud.tencent.com/cam/capi"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  腾讯云 API 控制台 <ExternalLink size={11} />
                </a>
                <a
                  href="https://console.cloud.tencent.com/lighthouse/cos/index?rid=5"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  腾讯云对象存储 <ExternalLink size={11} />
                </a>
              </div>
              <div>提醒：腾讯云 SecretKey 只会在新建密钥时显示一次，后续列表只能看到 SecretId，找不到就需要新建一组密钥。</div>
            </div>
          </AdvancedProviderFormBlock>
        )}

        {target.provider === 'aliyun-oss' && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="2. 阿里云 OSS"
            note="Endpoint 可以填 oss-cn-hangzhou.aliyuncs.com 或完整 https 地址；保存时会统一清洗。"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>Bucket</span>
                <input
                  value={target.aliyunOss?.bucket || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'aliyunOss', { bucket: e.target.value })}
                  className={fieldInputCls}
                  placeholder="example-bucket"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>Endpoint</span>
                <input
                  value={target.aliyunOss?.endpoint || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'aliyunOss', { endpoint: e.target.value })}
                  className={fieldInputCls}
                  placeholder="oss-cn-hangzhou.aliyuncs.com"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>AccessKeyId</span>
                <input
                  type="password"
                  value={target.aliyunOss?.accessKeyId || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'aliyunOss', { accessKeyId: e.target.value })}
                  className={fieldInputCls}
                  placeholder={target.aliyunOss?.hasAccessKeyId ? '留空保持不变' : '请输入 AccessKeyId'}
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>AccessKeySecret</span>
                <input
                  type="password"
                  value={target.aliyunOss?.accessKeySecret || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'aliyunOss', { accessKeySecret: e.target.value })}
                  className={fieldInputCls}
                  placeholder={target.aliyunOss?.hasAccessKeySecret ? '留空保持不变' : '请输入 AccessKeySecret'}
                />
              </label>
            </div>
            <div className={`text-[11px] leading-relaxed ${hintCls}`}>
              <div className="font-bold">控制台入口</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <a
                  href="https://ram.console.aliyun.com/manage/ak"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  阿里云 AccessKey 控制台 <ExternalLink size={11} />
                </a>
                <a
                  href="https://oss.console.aliyun.com/bucket"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  阿里云对象存储 OSS <ExternalLink size={11} />
                </a>
              </div>
              <div>提醒：阿里云 AccessKey Secret 只会在创建时显示一次，后续找不到明文时需要新建或改用已保存的密钥。</div>
            </div>
          </AdvancedProviderFormBlock>
        )}

        {target.provider === 'baidu-netdisk' && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="2. 百度网盘 WebDAV"
            note="百度网盘官方直传需要开放平台授权；当前推荐用 Alist / CloudDrive2 / rclone 把百度网盘挂成 WebDAV 后上传。"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="space-y-1 lg:col-span-2">
                <span className={`text-[11px] ${labelCls}`}>WebDAV 地址</span>
                <input
                  value={target.baiduNetdisk?.webdavUrl || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'baiduNetdisk', { webdavUrl: e.target.value })}
                  className={fieldInputCls}
                  placeholder="http://127.0.0.1:5244/dav/百度网盘"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>用户名</span>
                <input
                  value={target.baiduNetdisk?.username || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'baiduNetdisk', { username: e.target.value })}
                  className={fieldInputCls}
                  placeholder="WebDAV 用户名，可留空"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>密码 / 令牌</span>
                <input
                  type="password"
                  value={target.baiduNetdisk?.password || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'baiduNetdisk', { password: e.target.value })}
                  className={fieldInputCls}
                  placeholder={target.baiduNetdisk?.hasPassword ? '留空保持不变' : 'WebDAV 密码或访问令牌'}
                />
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className={`text-[11px] ${labelCls}`}>网盘目录</span>
                <input
                  value={target.baiduNetdisk?.folder || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'baiduNetdisk', { folder: e.target.value })}
                  className={fieldInputCls}
                  placeholder="/T8PenguinCanvas"
                />
              </label>
            </div>
            <div className={`text-[11px] leading-relaxed ${hintCls}`}>
              使用说明：Endpoint 填 WebDAV 根地址，网盘目录填要保存素材的目录。配置检查会创建一个 .t8-upload-check 临时目录，上传 connection.txt 后删除，用来确认真实写入权限。
            </div>
          </AdvancedProviderFormBlock>
        )}

        {target.provider === 'quark-netdisk' && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="2. 夸克网盘 WebDAV"
            note="夸克网盘没有稳定公开直传接口；当前推荐用 Alist / CloudDrive2 / rclone 把夸克挂成 WebDAV 后上传。"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="space-y-1 lg:col-span-2">
                <span className={`text-[11px] ${labelCls}`}>WebDAV 地址</span>
                <input
                  value={target.quarkNetdisk?.webdavUrl || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'quarkNetdisk', { webdavUrl: e.target.value })}
                  className={fieldInputCls}
                  placeholder="http://127.0.0.1:5244/dav/夸克网盘"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>用户名</span>
                <input
                  value={target.quarkNetdisk?.username || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'quarkNetdisk', { username: e.target.value })}
                  className={fieldInputCls}
                  placeholder="WebDAV 用户名，可留空"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>密码 / 令牌</span>
                <input
                  type="password"
                  value={target.quarkNetdisk?.password || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'quarkNetdisk', { password: e.target.value })}
                  className={fieldInputCls}
                  placeholder={target.quarkNetdisk?.hasPassword ? '留空保持不变' : 'WebDAV 密码或访问令牌'}
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>网盘目录</span>
                <input
                  value={target.quarkNetdisk?.folder || ''}
                  onChange={(e) => updateCloudTargetNested(target.id, 'quarkNetdisk', { folder: e.target.value })}
                  className={fieldInputCls}
                  placeholder="/T8PenguinCanvas"
                />
              </label>
            </div>
            <div className={`text-[11px] leading-relaxed ${hintCls}`}>
              使用说明：不要在这里粘贴浏览器 Cookie。请先用 WebDAV 网关完成夸克登录，再把网关提供的 WebDAV 地址和账号填到这里。
            </div>
          </AdvancedProviderFormBlock>
        )}
      </div>
    );
  };

  const renderAdvancedProviderForm = (provider: AdvancedProviderConfig) => {
    const protocolLabel = ADVANCED_PROVIDER_LABELS[provider.protocol] || provider.protocol;
    const guide = ADVANCED_PROVIDER_GUIDES[provider.protocol];
    const isComfy = provider.protocol === 'comfyui';
    const isJimeng = provider.protocol === 'jimeng-cli';
    const isVolc = provider.protocol === 'volcengine';
    const isModelScope = provider.protocol === 'modelscope';
    const canDelete = !BUILT_IN_ADVANCED_PROVIDER_IDS.has(provider.id);
    const sectionCls = isPixel
      ? 't8-api-settings-provider-panel border p-3 space-y-4 min-w-0'
      : 't8-api-settings-provider-panel border rounded-xl p-3 sm:p-4 space-y-4 min-w-0';
    const formBlockCls = isPixel
      ? 't8-api-settings-section border p-3 space-y-3'
      : 't8-api-settings-section rounded-lg border p-3 space-y-3';
    const fieldInputCls = `${inputCls.replace('flex-1 ', '')} w-full min-w-0`;
    const textareaCls = `${fieldInputCls} min-h-[76px] resize-y font-mono text-xs leading-relaxed`;
    const guideBoxCls = isPixel
      ? 't8-api-settings-guide border p-3 text-[11px] leading-relaxed'
      : 't8-api-settings-guide rounded-lg border p-3 text-[11px] leading-relaxed';
    const smallPillCls = isPixel
      ? 't8-api-settings-pill inline-flex items-center px-1.5 py-0.5 border text-[10px] font-bold'
      : 't8-api-settings-pill inline-flex items-center rounded px-1.5 py-0.5 border text-[10px] font-semibold';
    const comfyWorkflow = (provider.comfyuiConfig?.workflows?.[0] || { id: 'workflow-1', name: '默认工作流' }) as NonNullable<NonNullable<AdvancedProviderConfig['comfyuiConfig']>['workflows']>[number];
    const comfyDraft = advancedComfyDrafts[provider.id] || {};
    const comfyWorkflowRaw = comfyDraft.workflowJson ?? (comfyWorkflow.workflowJson ? JSON.stringify(comfyWorkflow.workflowJson, null, 2) : '');
    const comfyWorkflowObject = tryParseJsonObject(comfyWorkflowRaw);
    const comfyWorkflowSource = comfyWorkflowObject || comfyWorkflow.workflowJson || null;
    const comfyAnalysis = analyzeComfyWorkflow(comfyWorkflowSource);
    const comfyImportChecklist = buildComfyWorkflowImportChecklist(comfyWorkflowSource, comfyAnalysis);
    const comfyExcludeRulesRaw = comfyDraft.excludeRules ?? parseComfyFieldExcludeRules((comfyWorkflow as any).excludeRules).join('\n');
    const comfyExcludeRules = parseComfyFieldExcludeRules(comfyExcludeRulesRaw);
    const comfyFilteredAnalysisFields = filterComfyFieldsByExcludeRules(comfyWorkflowSource, comfyAnalysis.fields, comfyExcludeRules);
    const comfyExcludedFieldCount = Math.max(0, comfyAnalysis.fields.length - comfyFilteredAnalysisFields.length);
    const comfyBaseMappedFields = (Array.isArray(comfyWorkflow.fields) && comfyWorkflow.fields.length
      ? comfyWorkflow.fields
      : comfyFilteredAnalysisFields) as ComfyFieldMapping[];
    const comfyMappedFields = canonicalizeComfyFieldsByWorkflow(
      comfyWorkflowSource,
      filterComfyFieldsByExcludeRules(comfyWorkflowSource, comfyBaseMappedFields, comfyExcludeRules),
    );
    const setComfyDraft = (patch: { workflowJson?: string; fields?: string; excludeRules?: string }) => {
      setAdvancedComfyDrafts((prev) => ({ ...prev, [provider.id]: { ...(prev[provider.id] || {}), ...patch } }));
    };
    const updateComfyWorkflow = (patch: Record<string, any>) => {
      updateAdvancedProviderNested(provider.id, 'comfyuiConfig', {
        workflows: [{ ...comfyWorkflow, ...patch }],
      });
    };
    const updateComfyWorkflowJson = (raw: string) => {
      setComfyDraft({ workflowJson: raw });
      try {
        const workflowJson = JSON.parse(raw);
        const analysis = analyzeComfyWorkflow(workflowJson);
        const nextFields = canonicalizeComfyFieldsByWorkflow(
          workflowJson,
          filterComfyFieldsByExcludeRules(workflowJson, analysis.fields, comfyExcludeRules),
        );
        updateComfyWorkflow({
          workflowJson,
          ...(nextFields.length ? { fields: nextFields } : {}),
        });
        if (nextFields.length) setComfyDraft({ fields: JSON.stringify(nextFields, null, 2) });
        setAdvancedTestStatus((prev) => ({
          ...prev,
          [provider.id]: {
            ok: true,
            message: nextFields.length
              ? `工作流已解析，自动识别 ${nextFields.length} 个输入字段`
              : '工作流 JSON 已解析，但未自动识别到常用输入字段',
          },
        }));
      } catch {
        setAdvancedTestStatus((prev) => ({ ...prev, [provider.id]: { ok: false, message: '工作流 JSON 格式不正确，修正后会自动保存' } }));
      }
    };
    const updateComfyExcludeRules = (raw: string) => {
      setComfyDraft({ excludeRules: raw });
      const excludeRules = parseComfyFieldExcludeRules(raw);
      const workflowJson = comfyWorkflowSource;
      const currentFields = comfyAnalysis.fields.length
        ? comfyAnalysis.fields
        : (Array.isArray(comfyWorkflow.fields) ? comfyWorkflow.fields : []);
      const fields = canonicalizeComfyFieldsByWorkflow(
        workflowJson,
        filterComfyFieldsByExcludeRules(workflowJson, currentFields as ComfyFieldMapping[], excludeRules),
      );
      updateComfyWorkflow({ excludeRules, fields });
      setComfyDraft({ fields: JSON.stringify(fields, null, 2) });
      setAdvancedTestStatus((prev) => ({
        ...prev,
        [provider.id]: {
          ok: true,
          message: excludeRules.length
            ? `已设置 ${excludeRules.length} 条排除规则，当前映射保留 ${fields.length} 个字段`
            : `已清空排除规则，当前映射保留 ${fields.length} 个字段`,
        },
      }));
    };
    const appendComfyExcludeRules = (items: string[]) => {
      updateComfyExcludeRules([...parseComfyFieldExcludeRules(comfyExcludeRulesRaw), ...items].join('\n'));
    };
    const exportComfyExcludeRules = () => {
      const payload = createComfyFieldExcludeRulesBackup(comfyExcludeRulesRaw, `api-settings:${provider.id}`);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      downloadJson(`t8-comfyui-exclude-rules-${provider.id || 'provider'}-${date}.json`, payload);
      setAdvancedTestStatus((prev) => ({
        ...prev,
        [provider.id]: { ok: true, message: `已导出 ${payload.rules.length} 条 ComfyUI 排除规则` },
      }));
    };
    const handleComfyExcludeRulesFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const rules = parseComfyFieldExcludeRulesBackup(String(reader.result || ''));
        updateComfyExcludeRules(rules.join('\n'));
        setAdvancedTestStatus((prev) => ({
          ...prev,
          [provider.id]: { ok: true, message: `已导入 ${rules.length} 条 ComfyUI 排除规则` },
        }));
      };
      reader.onerror = () => setAdvancedTestStatus((prev) => ({
        ...prev,
        [provider.id]: { ok: false, message: '读取排除规则 JSON 文件失败' },
      }));
      reader.readAsText(file, 'utf-8');
    };
    const handleComfyWorkflowFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = () => updateComfyWorkflowJson(String(reader.result || ''));
      reader.onerror = () => setAdvancedTestStatus((prev) => ({
        ...prev,
        [provider.id]: { ok: false, message: '读取 workflow JSON 文件失败' },
      }));
      reader.readAsText(file, 'utf-8');
    };
    const updateComfyFields = (raw: string) => {
      setComfyDraft({ fields: raw });
      try {
        const parsed = JSON.parse(raw || '[]');
        if (!Array.isArray(parsed)) throw new Error('fields must be array');
        const workflowJson = comfyWorkflowSource;
        const fields = canonicalizeComfyFieldsByWorkflow(
          workflowJson,
          filterComfyFieldsByExcludeRules(workflowJson, parsed as ComfyFieldMapping[], comfyExcludeRules),
        );
        updateComfyWorkflow({ fields });
        setAdvancedTestStatus((prev) => ({ ...prev, [provider.id]: { ok: true, message: '参数映射已解析' } }));
      } catch {
        setAdvancedTestStatus((prev) => ({ ...prev, [provider.id]: { ok: false, message: '参数映射 JSON 需要是数组' } }));
      }
    };
    const applyComfyAutoMapping = () => {
      const workflowJson = comfyWorkflowSource;
      const analysis = analyzeComfyWorkflow(workflowJson || null);
      const fields = canonicalizeComfyFieldsByWorkflow(
        workflowJson || null,
        filterComfyFieldsByExcludeRules(workflowJson || null, analysis.fields, comfyExcludeRules),
      );
      updateComfyWorkflow({ fields });
      setComfyDraft({ fields: JSON.stringify(fields, null, 2) });
      setAdvancedTestStatus((prev) => ({
        ...prev,
        [provider.id]: {
          ok: fields.length > 0,
          message: fields.length
            ? `已应用自动映射：${fields.length} 个字段${comfyExcludeRules.length ? `，已按规则排除 ${analysis.fields.length - fields.length} 个` : ''}`
            : '没有识别到可自动映射的字段',
        },
      }));
    };
    const applyComfySampleWorkflow = () => {
      const workflowJson = JSON.parse(stringifyBasicComfyTextToImageWorkflow());
      const analysis = analyzeComfyWorkflow(workflowJson);
      const fields = canonicalizeComfyFieldsByWorkflow(workflowJson, analysis.fields);
      updateComfyWorkflow({
        id: BASIC_COMFY_TEXT_TO_IMAGE_SAMPLE_ID,
        name: '基础文生图样例',
        workflowJson,
        fields,
        excludeRules: [],
      });
      setComfyDraft({
        workflowJson: JSON.stringify(workflowJson, null, 2),
        fields: JSON.stringify(fields, null, 2),
        excludeRules: '',
      });
      setAdvancedTestStatus((prev) => ({
        ...prev,
        [provider.id]: {
          ok: true,
          message: '已载入基础文生图样例。运行前请把 Checkpoint 改成本机已安装的模型文件名。',
        },
      }));
    };
    const updateComfyField = (index: number, patch: Partial<ComfyFieldMapping>) => {
      const nextFields = canonicalizeComfyFieldsByWorkflow(
        comfyWorkflowSource,
        filterComfyFieldsByExcludeRules(
          comfyWorkflowSource,
          comfyMappedFields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
          comfyExcludeRules,
        ),
      );
      updateComfyWorkflow({ fields: nextFields });
      setComfyDraft({ fields: JSON.stringify(nextFields, null, 2) });
    };
    const removeComfyField = (index: number) => {
      const nextFields = comfyMappedFields.filter((_, i) => i !== index);
      updateComfyWorkflow({ fields: nextFields });
      setComfyDraft({ fields: JSON.stringify(nextFields, null, 2) });
    };
    const modelscopeLoras = Array.isArray(provider.modelscopeConfig?.loras) ? provider.modelscopeConfig.loras : [];
    const setModelscopeLoras = (loras: any[]) => {
      updateAdvancedProviderNested(provider.id, 'modelscopeConfig', {
        defaultsVersion: provider.modelscopeConfig?.defaultsVersion,
        loras,
      });
    };
    const modelscopeTargetOptions = (selected?: string) => {
      const out: string[] = [];
      for (const value of [
        selected,
        ...(Array.isArray(provider.imageModels) ? provider.imageModels : []),
        'Tongyi-MAI/Z-Image-Turbo',
        'Qwen/Qwen-Image-2512',
        'Qwen/Qwen-Image-Edit-2511',
        'black-forest-labs/FLUX.2-klein-9B',
      ]) {
        const item = String(value || '').trim();
        if (item && !out.includes(item)) out.push(item);
      }
      return out;
    };
    const addModelscopeLora = () => {
      setModelscopeLoras([
        ...modelscopeLoras,
        {
          id: '',
          name: '',
          targetModel: modelscopeTargetOptions()[0] || 'Tongyi-MAI/Z-Image-Turbo',
          strength: 0.8,
          enabled: true,
          note: '',
        },
      ]);
    };
    const updateModelscopeLora = (index: number, patch: Record<string, any>) => {
      setModelscopeLoras(modelscopeLoras.map((lora, i) => (
        i === index
          ? {
            ...lora,
            ...patch,
            ...(Object.prototype.hasOwnProperty.call(patch, 'strength')
              ? { strength: normalizeModelscopeLoraStrength(patch.strength, 0.8) }
              : {}),
          }
          : lora
      )));
    };
    const removeModelscopeLora = (index: number) => {
      setModelscopeLoras(modelscopeLoras.filter((_, i) => i !== index));
    };
    const enabledModelscopeLoraCount = normalizeModelscopeLoras(modelscopeLoras).filter((lora) => lora.enabled !== false).length;
    return (
      <div className={sectionCls}>
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-black ${labelCls}`}>{provider.label || protocolLabel}</span>
              <span className={smallPillCls}>{protocolLabel}</span>
              <span className={provider.enabled ? 'text-[11px] font-bold text-emerald-500' : `text-[11px] font-bold ${hintCls}`}>
                {provider.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <p className={`mt-1 text-[11px] leading-relaxed ${hintCls}`}>{guide?.subtitle}</p>
          </div>
          <label className={`flex items-center gap-2 text-xs font-bold shrink-0 ${labelCls}`}>
            <input
              type="checkbox"
              checked={!!provider.enabled}
              onChange={(e) => updateAdvancedProvider(provider.id, { enabled: e.target.checked })}
            />
            在节点中显示
          </label>
          <button
            type="button"
            onClick={() => handleTestAdvancedProvider(provider)}
            disabled={!!advancedTestStatus[provider.id]?.loading}
            className={
              isPixel
                ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 shrink-0'
                : 't8-api-settings-secondary-btn px-2 py-1 text-[11px] rounded border shrink-0 inline-flex items-center gap-1'
            }
          >
            <TestTube2 size={12} />
            {advancedTestStatus[provider.id]?.loading ? '测试中...' : '测试连接'}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => removeAdvancedProvider(provider.id)}
              className={
                isPixel
                  ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 shrink-0'
                  : 't8-api-settings-secondary-btn px-2 py-1 text-[11px] rounded border shrink-0 inline-flex items-center gap-1'
              }
              title="删除这个自定义扩展平台"
            >
              <Trash2 size={12} />
              删除
            </button>
          )}
        </div>

        {advancedTestStatus[provider.id]?.message && (
          <div
            className={
              advancedTestStatus[provider.id]?.ok
                ? 'text-[11px] text-emerald-500'
                : 'text-[11px] text-red-400'
            }
          >
            {advancedTestStatus[provider.id]?.message}
          </div>
        )}

        <div className={guideBoxCls}>
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold">这是什么？</div>
              <p>{guide?.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(guide?.nodeScopes || []).map((scope) => (
                  <span key={scope} className={smallPillCls}>{scope}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <AdvancedProviderFormBlock
          className={formBlockCls}
          labelClassName={labelCls}
          hintClassName={hintCls}
          title="1. 基础信息"
          note="显示名称只影响下拉菜单里的名字；关闭“在节点中显示”后，这个平台不会出现在图像 / 视频 / LLM 节点的高级来源里。"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className={`text-[11px] ${labelCls}`}>显示名称</span>
              <input
                value={provider.label || ''}
                onChange={(e) => updateAdvancedProvider(provider.id, { label: e.target.value })}
                className={fieldInputCls}
                placeholder={protocolLabel}
              />
            </label>
            {!isJimeng && (
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>{isComfy ? '默认实例地址' : 'Base URL'}</span>
                <input
                  value={provider.baseUrl || ''}
                  onChange={(e) => updateAdvancedProvider(provider.id, { baseUrl: e.target.value })}
                  className={fieldInputCls}
                  placeholder={guide?.baseUrlPlaceholder || 'https://api.example.com/v1'}
                />
              </label>
            )}
          </div>
        </AdvancedProviderFormBlock>

        {!isComfy && !isJimeng && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title={isVolc ? '2. 生成连接密钥' : '2. 连接密钥'}
            note={guide?.connectionHint}
          >
            <label className="space-y-1 block">
              <span className={`text-[11px] ${labelCls}`}>{guide?.keyLabel || 'API Key / Token'}</span>
              <input
                type="password"
                value={provider.apiKey || ''}
                onChange={(e) => updateAdvancedProvider(provider.id, { apiKey: e.target.value })}
                className={fieldInputCls}
                placeholder={
                  provider.hasApiKey || provider.apiKey
                    ? '留空或保留 **** 表示不覆盖后端密钥'
                    : isVolc
                      ? '请输入方舟 Ark API Key，不要填 Access Key ID / Secret'
                      : '请输入 API Key'
                }
              />
            </label>
            {isVolc && (
              <div className={guideBoxCls}>
                <div className="font-bold">该填哪个 Key？</div>
                <p>
                  图像 Seedream、视频 Seedance 和方舟 LLM 生成使用「方舟 Ark API Key」。
                  你在火山账号里看到的 Access Key ID / Secret Access Key 不能填在这里，
                  需要放到下方「火山 AK/SK」高级项；目前它只作为素材签名类能力的预留凭证。
                </p>
                <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-400/15 px-3 py-2">
                  <div className="font-bold">Seedance2.0 开通提醒</div>
                  <p>
                    使用 doubao-seedance-2-0-260128 或 doubao-seedance-2-0-fast-260128 前，
                    需要先在火山方舟控制台开通对应模型服务；未开通时上游会返回 ModelNotOpen / HTTP 404。
                  </p>
                </div>
              </div>
            )}
            {provider.protocol === 'modelscope' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openExternal(MODELSCOPE_TOKEN_URLS.cn)}
                  className={linkBtnCls}
                  title="打开 ModelScope 国内站 Token 页面"
                >
                  <ExternalLink size={11} /> 获取 Token · 国内
                </button>
                <button
                  type="button"
                  onClick={() => openExternal(MODELSCOPE_TOKEN_URLS.intl)}
                  className={linkBtnAltCls}
                  title="打开 ModelScope 国际站 Token 页面"
                >
                  <ExternalLink size={11} /> 获取 Token · 国外
                </button>
              </div>
            )}
          </AdvancedProviderFormBlock>
        )}

        {isVolc && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="3. 火山 AK/SK（可选，素材签名）"
            note="这里不是生成 Key。普通 Ark / Seedream / Seedance 调用只需要上方的方舟 Ark API Key；AK/SK 仅用于素材上传、私域资产或签名类 OpenAPI。"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>Project</span>
                <input
                  value={provider.volcengineConfig?.project || ''}
                  onChange={(e) => updateAdvancedProviderNested(provider.id, 'volcengineConfig', { project: e.target.value })}
                  className={fieldInputCls}
                  placeholder="可选，例如 default"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>Region</span>
                <input
                  value={provider.volcengineConfig?.region || ''}
                  onChange={(e) => updateAdvancedProviderNested(provider.id, 'volcengineConfig', { region: e.target.value })}
                  className={fieldInputCls}
                  placeholder="cn-beijing"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>Access Key ID（AK，素材签名）</span>
                <input
                  type="password"
                  value={provider.volcengineConfig?.accessKeyId || ''}
                  onChange={(e) => updateAdvancedProviderNested(provider.id, 'volcengineConfig', { accessKeyId: e.target.value })}
                  className={fieldInputCls}
                  placeholder={provider.volcengineConfig?.hasAccessKeyId ? '留空保持不变' : '可选，不是方舟 API Key'}
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>Secret Access Key（SK，素材签名）</span>
                <input
                  type="password"
                  value={provider.volcengineConfig?.secretAccessKey || ''}
                  onChange={(e) => updateAdvancedProviderNested(provider.id, 'volcengineConfig', { secretAccessKey: e.target.value })}
                  className={fieldInputCls}
                  placeholder={provider.volcengineConfig?.hasSecretAccessKey ? '留空保持不变' : '可选，不是方舟 API Key'}
                />
              </label>
            </div>
          </AdvancedProviderFormBlock>
        )}

        {isComfy && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="2. ComfyUI 工作流"
            note={guide?.connectionHint}
          >
            <label className="space-y-1 block">
              <span className={`text-[11px] ${labelCls}`}>实例地址列表（一行一个）</span>
              <PromptTextarea
                title="ComfyUI 实例地址列表"
                value={(provider.comfyuiConfig?.instances || [provider.baseUrl || '']).filter(Boolean).join('\n')}
                onValueChange={(value) => updateAdvancedProviderNested(provider.id, 'comfyuiConfig', {
                  instances: parseAdvancedProviderModelText(value),
                })}
                editorKind="lines"
                mono
                className={textareaCls}
                placeholder={guide?.baseUrlPlaceholder || 'http://127.0.0.1:8188'}
              />
            </label>
            <label
              className={
                isPixel
                  ? `t8-api-settings-guide border p-3 flex items-start gap-2 text-[11px] leading-relaxed ${labelCls}`
                  : `t8-api-settings-guide rounded-lg border p-3 flex items-start gap-2 text-[11px] leading-relaxed ${labelCls}`
              }
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!provider.allowRemote}
                onChange={(e) => updateAdvancedProvider(provider.id, { allowRemote: e.target.checked })}
              />
              <span className="min-w-0">
                <span className="font-black inline-flex items-center gap-1">
                  <Lock size={11} /> 高危：允许此 ComfyUI 配置访问远端地址
                </span>
                <span className={`block mt-1 ${hintCls}`}>
                  默认关闭，仅允许 127.0.0.1 / localhost。开启后后端会按这里填写的 URL 访问局域网或公网 ComfyUI，请只连接你信任和有权限使用的服务；Docker 也可通过环境变量 T8_COMFYUI_ALLOW_REMOTE=1 统一开启。
                </span>
              </span>
            </label>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>工作流 ID</span>
                <input
                  value={comfyWorkflow.id || ''}
                  onChange={(e) => updateComfyWorkflow({ id: e.target.value || 'workflow-1' })}
                  className={fieldInputCls}
                  placeholder="workflow-1"
                />
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>工作流名称</span>
                <input
                  value={comfyWorkflow.name || ''}
                  onChange={(e) => updateComfyWorkflow({ name: e.target.value || '默认工作流' })}
                  className={fieldInputCls}
                  placeholder="默认工作流"
                />
              </label>
            </div>
            <label className="space-y-1 block">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] ${labelCls}`}>工作流 JSON（从 ComfyUI 导出的 API 格式）</span>
                <label
                  className={
                    isPixel
                      ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 shrink-0 cursor-pointer inline-flex items-center gap-1'
                      : 't8-api-settings-secondary-btn px-2 py-1 text-[11px] rounded border shrink-0 cursor-pointer inline-flex items-center gap-1'
                  }
                  title="上传 ComfyUI API Workflow JSON 并自动映射"
                >
                  <FileUp size={12} /> 上传 JSON
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleComfyWorkflowFile(file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={applyComfySampleWorkflow}
                  className={
                    isPixel
                      ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 shrink-0'
                      : 't8-api-settings-secondary-btn px-2 py-1 text-[11px] rounded border shrink-0 inline-flex items-center gap-1'
                  }
                  title="填入一个可学习的基础文生图 API Workflow 样例"
                >
                  <Plus size={12} /> 载入样例
                </button>
              </div>
              <PromptTextarea
                title="ComfyUI Workflow JSON"
                value={comfyWorkflowRaw}
                onValueChange={updateComfyWorkflowJson}
                editorKind="json"
                mono
                className={`${textareaCls} min-h-[140px]`}
                placeholder='粘贴 ComfyUI API workflow JSON，例如 {"1":{"class_type":"CLIPTextEncode","inputs":{"text":""}}}'
              />
              <p className={`text-[11px] ${hintCls}`}>不是普通前端 workflow 文件，需要在 ComfyUI 开启 dev mode 后导出的 API workflow。</p>
            </label>
            <div className="space-y-1 block">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-[11px] ${labelCls}`}>自动映射排除规则（可选）</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={exportComfyExcludeRules}
                    className={isPixel ? 'px-btn text-[11px] px-2 py-1 inline-flex items-center gap-1' : 'rounded border px-2 py-1 text-[11px] inline-flex items-center gap-1'}
                    title="导出当前 ComfyUI 自动映射排除规则"
                  >
                    <Download size={12} /> 导出规则
                  </button>
                  <label
                    className={isPixel ? 'px-btn text-[11px] px-2 py-1 inline-flex cursor-pointer items-center gap-1' : 'rounded border px-2 py-1 text-[11px] inline-flex cursor-pointer items-center gap-1'}
                    title="导入 ComfyUI 自动映射排除规则 JSON"
                  >
                    <FileUp size={12} /> 导入规则
                    <input
                      type="file"
                      accept="application/json,.json,.txt"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) handleComfyExcludeRulesFile(file);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
              <PromptTextarea
                title="ComfyUI 自动映射排除规则"
                value={comfyExcludeRulesRaw}
                onValueChange={updateComfyExcludeRules}
                editorKind="lines"
                mono
                className={`${textareaCls} min-h-[72px]`}
                placeholder={'每行一个：seed、steps、class:KSampler、CLIPTextEncode.text、#86.batch_size'}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => appendComfyExcludeRules(['seed', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'])}
                  className={isPixel ? 'px-btn text-[11px] px-2 py-1' : 'rounded border px-2 py-1 text-[11px]'}
                >
                  排除采样器参数
                </button>
                <button
                  type="button"
                  onClick={() => appendComfyExcludeRules(['model_name', 'ckpt_name', 'clip_name', 'vae_name', 'lora_name'])}
                  className={isPixel ? 'px-btn text-[11px] px-2 py-1' : 'rounded border px-2 py-1 text-[11px]'}
                >
                  排除模型加载
                </button>
                <button
                  type="button"
                  onClick={() => appendComfyExcludeRules(['width', 'height', 'batch_size'])}
                  className={isPixel ? 'px-btn text-[11px] px-2 py-1' : 'rounded border px-2 py-1 text-[11px]'}
                >
                  排除尺寸批量
                </button>
                <span className={`text-[10px] ${hintCls}`}>
                  当前 {comfyExcludeRules.length} 条规则，已排除 {comfyExcludedFieldCount} 个自动识别字段。
                </span>
              </div>
              <p className={`text-[11px] ${hintCls}`}>
                支持 source/字段名/节点类名/节点编号，例如 source:cfg、field:width、class:KSampler、node:86、#86.width。
              </p>
            </div>
            <div className={guideBoxCls}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-xs font-black ${labelCls}`}>自动识别结果</div>
                  <p className={`mt-1 ${hintCls}`}>
                    已识别 {comfyAnalysis.fields.length} 个可映射字段，排除后保留 {comfyFilteredAnalysisFields.length} 个，图片输入 {comfyAnalysis.imageInputCount} 个，输出节点 {comfyAnalysis.outputCount} 个。
                  </p>
                  {comfyAnalysis.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {comfyAnalysis.warnings.slice(0, 3).map((warning, index) => (
                        <p key={`${provider.id}-comfy-warning-${index}`} className="text-[10px] text-amber-400">{warning}</p>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-1 gap-1">
                    {comfyImportChecklist.map((item) => (
                      <div
                        key={`${provider.id}-comfy-check-${item.id}`}
                        className="rounded border px-2 py-1 text-[10px]"
                        style={{
                          borderColor: item.level === 'ok' ? 'rgba(34,197,94,0.38)' : item.level === 'warn' ? 'rgba(245,158,11,0.42)' : 'var(--t8-border)',
                          color: item.level === 'ok' ? '#22c55e' : item.level === 'warn' ? '#f59e0b' : undefined,
                        }}
                      >
                        <b>{item.label}</b> · {item.detail}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyComfyAutoMapping}
                  className={
                    isPixel
                      ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 shrink-0'
                      : 't8-api-settings-secondary-btn px-2 py-1 text-[11px] rounded border shrink-0'
                  }
                >
                  自动映射
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className={`text-xs font-black ${labelCls}`}>参数映射</div>
              {comfyMappedFields.length > 0 ? (
                <div className="space-y-1.5">
                  {comfyMappedFields.map((field, index) => {
                    const detected = comfyAnalysis.fields.find((item) => item.nodeId === field.nodeId && item.fieldName === field.fieldName);
                    const isFixed = String(field.source || '') === 'fixed';
                    return (
                      <div
                        key={`${field.nodeId}-${field.fieldName}-${index}`}
                        className={isPixel ? 't8-api-settings-section border p-2 space-y-2' : 't8-api-settings-section rounded border p-2 space-y-2'}
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_32px] gap-2 items-end">
                          <div className="min-w-0">
                            <div className={`text-[11px] font-bold truncate ${labelCls}`} title={detected?.label || `${field.nodeId}.${field.fieldName}`}>
                              {detected?.label || `节点 #${field.nodeId} · ${field.fieldName}`}
                            </div>
                            <div className={`text-[10px] truncate ${hintCls}`}>
                              {detected?.classType || 'Custom'} / {field.nodeId}.{field.fieldName}
                            </div>
                          </div>
                          <label className="space-y-1">
                            <span className={`text-[10px] ${hintCls}`}>来源</span>
                            <select
                              value={(field.source || field.fieldName || 'fixed') as string}
                              onChange={(e) => updateComfyField(index, { source: e.target.value })}
                              className={fieldInputCls}
                            >
                              {COMFY_FIELD_SOURCE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeComfyField(index)}
                            className={isPixel ? 'px-btn text-[11px] px-2 py-1' : 'rounded border px-2 py-1 text-[11px]'}
                            title="移除此映射"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        {isFixed && (
                          <input
                            value={String(field.value ?? '')}
                            onChange={(e) => updateComfyField(index, { value: e.target.value })}
                            className={fieldInputCls}
                            placeholder="固定写入这个 ComfyUI 字段的值"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-[11px] ${hintCls}`}>粘贴 API Workflow 后会自动生成映射；也可以在下面高级 JSON 中手动填写。</p>
              )}
            </div>
            <details className="space-y-2">
              <summary className={`cursor-pointer text-[11px] font-bold ${labelCls}`}>高级：直接编辑 fields JSON</summary>
              <PromptTextarea
                title="ComfyUI fields JSON"
                value={comfyDraft.fields ?? JSON.stringify(comfyMappedFields, null, 2)}
                onValueChange={updateComfyFields}
                editorKind="json"
                mono
                className={textareaCls}
                placeholder='[{"nodeId":"1","fieldName":"text","source":"prompt"}]'
              />
              <p className={`text-[11px] ${hintCls}`}>用于兼容复杂工作流。普通用户建议使用上方映射表。</p>
            </details>
          </AdvancedProviderFormBlock>
        )}

        {isJimeng && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="2. 本地 CLI"
            note={guide?.connectionHint}
          >
            <div className={guideBoxCls}>
              <div className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0 space-y-2">
                  <div className={`font-bold ${labelCls}`}>如何安装即梦 CLI？</div>
                  <p className={hintCls}>
                    在 PowerShell 7、Git Bash 或 WSL 终端执行安装命令；安装完成后运行 <code className="font-mono">dreamina login</code> 登录，再回到这里点击“测试连接”。
                  </p>
                  <code className="block w-full overflow-x-auto rounded border px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                    {JIMENG_CLI_INSTALL_COMMAND}
                  </code>
                  <p className={hintCls}>
                    Windows 常见路径是 <code className="font-mono">C:\Users\&lt;用户名&gt;\bin\dreamina.exe</code>；如果命令已加入 PATH，可直接填写 <code className="font-mono">dreamina</code>。装在 WSL 里时，勾选下面的 WSL 选项并填写发行版名称。
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="space-y-1 lg:col-span-2">
                <span className={`text-[11px] ${labelCls}`}>dreamina 可执行路径</span>
                <input
                  value={provider.jimengConfig?.executablePath || ''}
                  onChange={(e) => updateAdvancedProviderNested(provider.id, 'jimengConfig', { executablePath: e.target.value })}
                  className={fieldInputCls}
                  placeholder="dreamina 或 C:\\path\\dreamina.exe"
                />
              </label>
              <label className={`flex items-center gap-2 text-[11px] ${labelCls}`}>
                <input
                  type="checkbox"
                  checked={!!provider.jimengConfig?.useWsl}
                  onChange={(e) => updateAdvancedProviderNested(provider.id, 'jimengConfig', { useWsl: e.target.checked })}
                />
                CLI 装在 WSL 中
              </label>
              <label className="space-y-1">
                <span className={`text-[11px] ${labelCls}`}>WSL 发行版</span>
                <input
                  value={provider.jimengConfig?.wslDistro || ''}
                  onChange={(e) => updateAdvancedProviderNested(provider.id, 'jimengConfig', { wslDistro: e.target.value })}
                  className={fieldInputCls}
                  placeholder="例如 Ubuntu"
                />
              </label>
            </div>
          </AdvancedProviderFormBlock>
        )}

        {!isComfy && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="3. 节点里可选的模型"
            note={guide?.modelHint}
          >
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <label className="space-y-1 min-w-0">
                <span className={`text-[11px] ${labelCls}`}>图像模型（一行一个）</span>
                <PromptTextarea
                  title={`${provider.label || protocolLabel} 图像模型`}
                  value={stringifyAdvancedProviderModels(provider.imageModels)}
                  onValueChange={(value) => updateAdvancedProvider(provider.id, { imageModels: parseAdvancedProviderModelText(value) })}
                  editorKind="lines"
                  mono
                  className={textareaCls}
                  placeholder={isJimeng ? '例如 seedream-4.7' : '例如 gpt-image-1'}
                />
              </label>
              <label className="space-y-1 min-w-0">
                <span className={`text-[11px] ${labelCls}`}>视频模型（一行一个）</span>
                <PromptTextarea
                  title={`${provider.label || protocolLabel} 视频模型`}
                  value={stringifyAdvancedProviderModels(provider.videoModels)}
                  onValueChange={(value) => updateAdvancedProvider(provider.id, { videoModels: parseAdvancedProviderModelText(value) })}
                  editorKind="lines"
                  mono
                  className={textareaCls}
                  placeholder={isJimeng ? '例如 seedance2.0fast_vip / seedance2.0' : '例如 video-model-name'}
                />
              </label>
              <label className="space-y-1 min-w-0">
                <span className={`text-[11px] ${labelCls}`}>聊天模型（一行一个）</span>
                <PromptTextarea
                  title={`${provider.label || protocolLabel} 聊天模型`}
                  value={stringifyAdvancedProviderModels(provider.chatModels)}
                  onValueChange={(value) => updateAdvancedProvider(provider.id, { chatModels: parseAdvancedProviderModelText(value) })}
                  editorKind="lines"
                  mono
                  className={textareaCls}
                  placeholder={isJimeng ? '即梦 CLI 通常不用填写' : '例如 gpt-4o-mini'}
                />
              </label>
            </div>
          </AdvancedProviderFormBlock>
        )}

        {isModelScope && (
          <AdvancedProviderFormBlock
            className={formBlockCls}
            labelClassName={labelCls}
            hintClassName={hintCls}
            title="4. ModelScope LoRA（可选）"
            note={`为 ModelScope 图像模型绑定 LoRA。图像节点会按当前外部模型自动筛选；多个 LoRA 的官方权重总和必须为 1.00，节点内会显示总权重并限制超额；当前启用 ${enabledModelscopeLoraCount}/${modelscopeLoras.length}。`}
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openExternal('https://www.modelscope.cn/aigc/models')}
                className={linkBtnCls}
                title="打开 ModelScope 国内模型库"
              >
                <ExternalLink size={11} /> 中文模型库
              </button>
              <button
                type="button"
                onClick={() => openExternal('https://www.modelscope.ai/civision/models')}
                className={linkBtnAltCls}
                title="打开 ModelScope 国际模型库"
              >
                <ExternalLink size={11} /> 英文模型库
              </button>
              <button
                type="button"
                onClick={addModelscopeLora}
                className={
                  isPixel
                    ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 inline-flex items-center gap-1'
                    : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] inline-flex items-center gap-1'
                }
              >
                <Plus size={12} /> 添加 LoRA
              </button>
            </div>

            {!modelscopeLoras.length ? (
              <div className={`border border-dashed p-3 text-center text-[11px] ${hintCls} ${isPixel ? '' : 'rounded-lg'}`}>
                暂无 LoRA。点击“添加 LoRA”后填写 LoRA 模型 ID，并绑定到一个 ModelScope 图像模型。
              </div>
            ) : (
              <div className="space-y-2">
                {modelscopeLoras.map((lora, index) => {
                  const target = String((lora as any).targetModel || (lora as any).target_model || (lora as any).model || '').trim();
                  const strength = normalizeModelscopeLoraStrength((lora as any).strength ?? (lora as any).default_strength, 0.8);
                  return (
                    <div
                      key={index}
                      className={isPixel ? 't8-api-settings-section border p-2 space-y-2' : 't8-api-settings-section rounded-lg border p-2 space-y-2'}
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_92px_36px] gap-2 items-end">
                        <label className="space-y-1 min-w-0">
                          <span className={`text-[11px] ${labelCls}`}>LoRA ID</span>
                          <input
                            value={(lora as any).id || ''}
                            onChange={(e) => updateModelscopeLora(index, { id: e.target.value })}
                            className={fieldInputCls}
                            placeholder="例如 Daniel8152/film"
                          />
                        </label>
                        <label className="space-y-1 min-w-0">
                          <span className={`text-[11px] ${labelCls}`}>绑定图像模型</span>
                          <select
                            value={target || modelscopeTargetOptions()[0] || ''}
                            onChange={(e) => updateModelscopeLora(index, { targetModel: e.target.value })}
                            className={fieldInputCls}
                          >
                            {modelscopeTargetOptions(target).map((modelName) => (
                              <option key={modelName} value={modelName}>{modelName}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 min-w-0">
                          <span className={`text-[11px] ${labelCls}`} title="作为图像节点选中该 LoRA 时的默认权重；节点内会按官方总和 1.00 限制多 LoRA 权重。">默认权重</span>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={strength}
                            onChange={(e) => updateModelscopeLora(index, { strength: e.target.value })}
                            className={fieldInputCls}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeModelscopeLora(index)}
                          className={
                            isPixel
                              ? 't8-mini-icon-button h-9 w-9 inline-flex items-center justify-center'
                              : 't8-mini-icon-button h-9 w-9 rounded border inline-flex items-center justify-center'
                          }
                          title="删除 LoRA"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                        <label className="space-y-1 min-w-0">
                          <span className={`text-[11px] ${labelCls}`}>显示名</span>
                          <input
                            value={(lora as any).name || ''}
                            onChange={(e) => updateModelscopeLora(index, { name: e.target.value })}
                            className={fieldInputCls}
                            placeholder="可选，用于节点下拉显示"
                          />
                        </label>
                        <label className="space-y-1 min-w-0">
                          <span className={`text-[11px] ${labelCls}`}>备注</span>
                          <input
                            value={(lora as any).note || ''}
                            onChange={(e) => updateModelscopeLora(index, { note: e.target.value })}
                            className={fieldInputCls}
                            placeholder="可选，例如触发词或用途"
                          />
                        </label>
                      </div>
                      <label className={`inline-flex items-center gap-2 text-[11px] font-bold ${labelCls}`}>
                        <input
                          type="checkbox"
                          checked={(lora as any).enabled !== false}
                          onChange={(e) => updateModelscopeLora(index, { enabled: e.target.checked })}
                        />
                        在图像节点中可用
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </AdvancedProviderFormBlock>
        )}
      </div>
    );
  };

  // 渲染单个 Key 表项
  const updateLlmConfig = (id: string, patch: Partial<LlmConfig>) => {
    setLlmConfigsInput((prev) => prev.map((item) => (
      item.id === id ? { ...item, ...patch } : item
    )));
    setLlmConfigsDirty(true);
  };

  const markDefaultLlmConfig = (id: string) => {
    setLlmConfigsInput((prev) => prev.map((item) => ({ ...item, isDefault: item.id === id })));
    setLlmConfigsDirty(true);
  };

  const addLlmConfig = () => {
    setLlmConfigsInput((prev) => {
      const id = uniqueLlmConfigId(prev);
      return [
        ...prev,
        {
          id,
          label: `LLM Key ${prev.length + 1}`,
          apiKey: '',
          hasApiKey: false,
          baseUrl: FIXED_ZHENZHEN_BASE,
          model: DEFAULT_LLM_MODEL,
          isDefault: prev.length === 0,
        },
      ];
    });
    setLlmConfigsDirty(true);
    setLlmConfigsOpen(true);
  };

  const removeLlmConfig = (id: string) => {
    setLlmConfigsInput((prev) => {
      if (prev.length <= 1) return prev;
      const removed = prev.find((item) => item.id === id);
      const next = prev.filter((item) => item.id !== id);
      if (removed?.isDefault || !next.some((item) => item.isDefault)) {
        return next.map((item, index) => ({ ...item, isDefault: index === 0 }));
      }
      return next;
    });
    setLlmConfigsDirty(true);
  };

  const renderLlmConfigs = () => {
    const items = llmConfigsInput.length > 0
      ? llmConfigsInput
      : normalizeLlmConfigForms(getLlmConfigSource(settings), settings);
    const configuredCount = items.filter((item) => item.hasApiKey || item.apiKey).length;
    const panelCls = isPixel
      ? 't8-api-settings-provider-panel border p-3 space-y-3 min-w-0'
      : 't8-api-settings-provider-panel border rounded-xl p-3 sm:p-4 space-y-3 min-w-0';
    const fieldInputCls = `${inputCls.replace('flex-1 ', '')} w-full min-w-0`;
    return (
      <div className="t8-api-settings-divider pt-3 border-t">
        <button
          type="button"
          onClick={() => setLlmConfigsOpen((v) => !v)}
          aria-expanded={llmConfigsOpen}
          data-open={llmConfigsOpen}
          className={
            isPixel
              ? 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 px-btn'
              : 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition'
          }
        >
          <Brain size={14} className="t8-api-settings-icon" />
          <span className="text-xs font-bold shrink-0">LLM 独立配置</span>
          <span
            className="t8-api-settings-badge ml-1 px-1.5 py-0.5 text-[10px] rounded border"
            data-tone={configuredCount > 0 ? 'success' : 'muted'}
          >
            已配置 {configuredCount}/{items.length}
          </span>
          <span className={`hidden sm:inline text-[11px] ${hintCls}`}>每个模型可单独设置名称、Base URL 和 API Key</span>
          <span className={`ml-auto flex items-center gap-1 text-[11px] ${hintCls}`}>
            {llmConfigsOpen ? '收起' : '展开'}
            {llmConfigsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
        {!llmConfigsOpen && (
          <div className={`text-[11px] mt-2 ${hintCls}`}>
            这些配置会出现在支持 LLM Key 选择的画布节点里，默认项会同步到旧版 LLM Key 字段以兼容已有调用。
          </div>
        )}
        {llmConfigsOpen && (
          <div className="mt-3 space-y-3">
            {items.map((item, index) => {
              const hasSaved = !!(item.hasApiKey || item.apiKey);
              return (
                <div key={item.id || index} className={panelCls}>
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-black ${labelCls}`}>{item.label || `LLM Key ${index + 1}`}</span>
                        {item.isDefault && (
                          <span className="t8-api-settings-badge text-[10px] font-bold px-1.5 py-0.5 rounded border" data-tone="success">默认</span>
                        )}
                        {hasSaved && (
                          <span className="t8-api-settings-badge text-[10px] font-bold px-1.5 py-0.5 rounded border" data-tone="success">
                            已保存 {toMaskedDisplay(item.apiKey || '****')}
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 text-[11px] ${hintCls}`}>{item.model || DEFAULT_LLM_MODEL} · {item.baseUrl || FIXED_ZHENZHEN_BASE}</p>
                    </div>
                    <label className={`flex items-center gap-2 text-xs font-bold shrink-0 ${labelCls}`}>
                      <input type="radio" checked={!!item.isDefault} onChange={() => markDefaultLlmConfig(item.id)} />
                      默认
                    </label>
                    <button
                      type="button"
                      onClick={() => removeLlmConfig(item.id)}
                      disabled={items.length <= 1}
                      className={`${eyeBtnCls} disabled:opacity-40 disabled:cursor-not-allowed`}
                      title={items.length <= 1 ? '至少保留一个 LLM 配置' : '删除此 LLM 配置'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <label className="space-y-1 min-w-0">
                      <span className={`text-[11px] ${labelCls}`}>名称</span>
                      <input
                        value={item.label || ''}
                        onChange={(e) => updateLlmConfig(item.id, { label: e.target.value })}
                        className={fieldInputCls}
                        placeholder="例如 gpt5.5-pixel"
                      />
                    </label>
                    <label className="space-y-1 min-w-0">
                      <span className={`text-[11px] ${labelCls}`}>模型</span>
                      <input
                        value={item.model || ''}
                        onChange={(e) => updateLlmConfig(item.id, { model: e.target.value })}
                        className={fieldInputCls}
                        placeholder={DEFAULT_LLM_MODEL}
                      />
                    </label>
                    <label className="space-y-1 min-w-0 lg:col-span-2">
                      <span className={`text-[11px] ${labelCls}`}>Base URL</span>
                      <input
                        value={item.baseUrl || ''}
                        onChange={(e) => updateLlmConfig(item.id, { baseUrl: e.target.value })}
                        className={fieldInputCls}
                        placeholder={FIXED_ZHENZHEN_BASE}
                      />
                    </label>
                    <label className="space-y-1 min-w-0 lg:col-span-2">
                      <span className={`text-[11px] ${labelCls}`}>API Key</span>
                      <input
                        type="password"
                        value={item.apiKey || ''}
                        onChange={(e) => updateLlmConfig(item.id, { apiKey: e.target.value, hasApiKey: !!e.target.value.trim() || item.hasApiKey })}
                        className={fieldInputCls}
                        placeholder={hasSaved ? '留空或保留脱敏值表示不修改 / 输入新值覆盖' : 'sk-...'}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addLlmConfig}
              className={
                isPixel
                  ? 't8-api-settings-secondary-btn px-btn inline-flex items-center gap-1 px-3 py-2 text-xs'
                  : 't8-api-settings-secondary-btn inline-flex items-center gap-1 px-3 py-2 text-xs rounded border'
              }
            >
              <Plus size={14} />
              添加 LLM 配置
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderKey = (spec: KeySpec, opts: { fallbackHint?: boolean; baseUrlNote?: string }) => {
    const f = spec.field;
    const rawVal = (settings as any)[f] as string | undefined;
    const hasSaved = !!rawVal;
    const maskedDisplay = toMaskedDisplay(rawVal);
    const pendingClear = !!clearedFields[f];
    const showClearButton = !!opts.fallbackHint;
    const clearDisabled = showClearButton && !pendingClear && !hasSaved && !inputs[f].trim();
    return (
      <div key={f} className="space-y-2">
        <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
          <span className={`w-2 h-2 rounded-full ${spec.bullet}`} />
          {spec.label}
          <span className={`text-[11px] font-normal ${hintCls}`}>{spec.desc}</span>
          {pendingClear ? (
            <span className="t8-api-settings-badge text-[10px] font-bold px-1.5 py-0.5 rounded border" data-tone="muted">
              保存后清空
            </span>
          ) : hasSaved && (
            <span className="t8-api-settings-badge text-[10px] font-bold px-1.5 py-0.5 rounded border" data-tone="success">
              ✓ 已保存 {maskedDisplay}
            </span>
          )}
          {opts.fallbackHint && !hasSaved && (
            <span className="t8-api-settings-badge text-[10px] font-normal px-1.5 py-0.5 rounded border" data-tone="muted">
              未设置 · 使用通用 Key
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <input
            type={shows[f] ? 'text' : 'password'}
            value={inputs[f]}
            onChange={(e) => setInputAt(f, e.target.value)}
            placeholder={pendingClear ? '已标记清空，保存后回到通用 Key' : (hasSaved ? '留空保持不变 / 输入新值覆盖' : (opts.fallbackHint ? '留空则使用通用 Key / 输入独立 Key' : '请输入 sk-...'))}
            className={inputCls}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => handleToggleShow(f)}
            className={eyeBtnCls}
            title={shows[f] ? '隐藏' : '显示明文'}
            aria-label={`${spec.label}${shows[f] ? '隐藏' : '显示明文'}`}
          >
            {shows[f] ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          {showClearButton && (
            <button
              type="button"
              onClick={() => handleClearClassifiedKey(f)}
              className={`${eyeBtnCls} disabled:opacity-40 disabled:cursor-not-allowed`}
              title={clearDisabled ? '当前没有可清空的分类独立 Key' : (pendingClear ? '取消清空' : '清空该分类独立 Key')}
              aria-label={`${spec.label}${pendingClear ? '取消清空' : '清空'}`}
              disabled={clearDisabled}
            >
              {pendingClear ? <X size={16} /> : <Trash2 size={16} />}
            </button>
          )}
        </div>
        {(opts.baseUrlNote || renderGetKeyButtons(spec.field)) && (
          <div className={`flex items-center gap-2 flex-wrap text-[11px] ${hintCls}`}>
            {opts.baseUrlNote && (
              <span className="flex items-center gap-1.5">
                <Lock size={11} /> {opts.baseUrlNote}
              </span>
            )}
            {renderGetKeyButtons(spec.field)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm ${
        isPixel ? 'px-modal-mask' : 'bg-black/60'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={
          isPixel
            ? `t8-api-settings-modal w-full ${llmConfigsOpen || advancedOpen || cloudUploadOpen ? 'max-w-4xl' : 'max-w-2xl'} mx-4 px-card overflow-hidden flex flex-col max-h-[90vh]`
            : `t8-api-settings-modal w-full ${llmConfigsOpen || advancedOpen || cloudUploadOpen ? 'max-w-4xl' : 'max-w-2xl'} mx-4 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border`
        }
      >
        {/* 头部 */}
        <div
          className={`t8-api-settings-header flex items-center gap-3 px-5 py-4 border-b shrink-0 ${
            isPixel
              ? 'border-[var(--px-ink)]'
              : ''
          }`}
        >
          <KeyRound size={18} className="t8-api-settings-icon" />
          <div className="flex-1">
            <h2
              className={`t8-api-settings-title text-base font-semibold ${isPixel ? 'px-title' : ''}`}
            >
              API Key 设置 (通用 + 分类独立)
            </h2>
            <p className={`text-xs mt-0.5 ${hintCls}`}>
              留空表示保持后端已存的 Key 不变 · 输入新值即覆盖 · 点眼睛可预览明文。
            </p>
          </div>
          <button
            onClick={onClose}
            className={
              isPixel
                ? 't8-api-settings-icon-btn px-btn px-btn--icon px-btn--ghost'
                : 't8-api-settings-icon-btn p-1.5 rounded-md'
            }
          >
            <X size={18} />
          </button>
        </div>

        {/* 表单 */}
        <div className="t8-api-settings-body p-5 space-y-5 overflow-y-auto">
          {/* 三套通用 Key */}
          {renderKey(COMMON_KEYS[0], { baseUrlNote: `Base URL 锁定: ${FIXED_ZHENZHEN_BASE}` })}
          <label className={`flex items-center gap-2 text-xs font-bold ${labelCls} -mt-2`}>
            <input
              type="checkbox"
              checked={zhenzhenEnabled}
              onChange={(e) => setZhenzhenEnabled(e.target.checked)}
            />
            贞贞工坊有效
            {!zhenzhenEnabled && (
              <span className={`text-[10px] font-normal ${hintCls}`}>关闭后节点模型选择中不会显示贞贞工坊</span>
            )}
          </label>
          <LocalSettingsAddonSlot
            open={open}
            isPixel={isPixel}
            isDark={isDark}
            settings={settings as any}
            onSaved={load}
          />
          {renderKey(COMMON_KEYS[1], { baseUrlNote: `Base URL: ${RH_BASE}` })}
          {renderLlmConfigs()}

          {/* 分类独立 Key（默认折叠，点击展开 —— 新手友好） */}
          <div className="t8-api-settings-divider pt-3 border-t">
            {(() => {
              const configuredCount = CLASSIFIED_KEYS.filter((spec) => {
                const v = (settings as any)?.[spec.field];
                return typeof v === 'string' && v.trim().length > 0;
              }).length;
              const totalCount = CLASSIFIED_KEYS.length;
              return (
                <button
                  type="button"
                  onClick={() => setClassifiedOpen((v) => !v)}
                  aria-expanded={classifiedOpen}
                  data-open={classifiedOpen}
                  className={
                    isPixel
                      ? 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 px-btn'
                      : 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition'
                  }
                >
                  <Settings2 size={14} className="t8-api-settings-icon" />
                  <span className="text-xs font-bold">分类独立 API Key【可选】</span>
                  <span
                    className="t8-api-settings-badge ml-1 px-1.5 py-0.5 text-[10px] rounded border"
                    data-tone={configuredCount > 0 ? 'success' : 'muted'}
                  >
                    已配置 {configuredCount}/{totalCount}
                  </span>
                  <span className={`ml-auto flex items-center gap-1 text-[11px] ${hintCls}`}>
                    {classifiedOpen ? '收起' : '展开'}
                    {classifiedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>
              );
            })()}
            {!classifiedOpen && (
              <div className={`text-[11px] mt-2 ${hintCls}`}>
                不必担心：<b>未填项会自动 fallback 到贞贞工坊通用 Key</b>，新手可直接保存忽略此区块。
              </div>
            )}
            {classifiedOpen && (
              <div className="mt-3">
                <div className={`text-[11px] ${hintCls} mb-3`}>
                  为不同模型系列单独配置 Key；多数模型未填时会 fallback 到贞贞工坊通用 Key，Gitee ACE-Step Token 除外。后端会根据调用的模型名/路由自动选择。
                </div>
                <div className="space-y-4">
                  {CLASSIFIED_KEYS.map((spec) => renderKey(spec, { fallbackHint: spec.field !== 'giteeMusicApiKey' }))}
                </div>
              </div>
            )}
          </div>

          {/* FHL Images 独立 worker 池 */}
          <div className="t8-api-settings-divider pt-3 border-t" data-fhl-settings>
            <button
              type="button"
              onClick={() => setFhlOpen((value) => !value)}
              aria-expanded={fhlOpen}
              className={isPixel ? 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 px-btn' : 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition'}
            >
              <LucideIcons.Images size={14} className="t8-api-settings-icon" />
              <span className="text-xs font-bold">FHL Images</span>
              <span className={`hidden sm:inline text-[11px] ${hintCls}`}>固定 Images API · gpt-image-2 · 最多 10 个 worker</span>
              <span className="ml-auto flex items-center gap-2 text-[11px]">
                <span className="t8-api-settings-badge rounded border px-1.5 py-0.5" data-tone={(fhlConfig?.enabledWorkerCount || 0) > 0 ? 'success' : 'muted'}>启用 {fhlConfig?.enabledWorkerCount || 0}/{fhlConfig?.workerCount || 0}</span>
                {fhlOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
            {fhlOpen && (
              <div className="mt-3 space-y-3 rounded-lg border p-3">
                <div className={`text-[11px] leading-relaxed ${hintCls}`}>
                  FHL 生图节点只走 <code>https://www.fhl.mom/v1/images/*</code>。API Key 仅保存在后端本地设置中；这里和画布都不会返回明文。
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto]">
                  <input className="t8-api-settings-input rounded border px-2 py-1.5 text-xs" value={fhlWorkerName} placeholder="Worker 名称" onChange={(event) => setFhlWorkerName(event.target.value)} />
                  <input className="t8-api-settings-input rounded border px-2 py-1.5 text-xs" type="password" value={fhlWorkerKey} placeholder="FHL API Key" onChange={(event) => setFhlWorkerKey(event.target.value)} />
                  <button type="button" className={isPixel ? 't8-api-settings-secondary-btn px-btn px-3 text-xs' : 't8-api-settings-secondary-btn rounded border px-3 text-xs'} disabled={fhlBusy || !fhlWorkerKey.trim()} onClick={() => void runFhlAction(() => addFhlWorker({ name: fhlWorkerName.trim() || `worker ${(fhlConfig?.workerCount || 0) + 1}`, apiKey: fhlWorkerKey.trim() }), 'FHL worker 已添加')}>
                    <Plus size={12} className="mr-1 inline" />添加
                  </button>
                </div>
                <div className="space-y-2">
                  {(fhlConfig?.workers || []).map((worker) => (
                    <div key={worker.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded border p-2 text-xs">
                      <input type="checkbox" checked={worker.enabled} disabled={fhlBusy} onChange={(event) => void runFhlAction(() => updateFhlWorker(worker.id, { enabled: event.target.checked }), `${worker.name} 已${event.target.checked ? '启用' : '停用'}`)} />
                      <div className="min-w-0"><div className="truncate font-bold">{worker.name}</div><div className={`truncate text-[10px] ${hintCls}`}>{worker.id} · {worker.keyPreview}</div></div>
                      <button type="button" className="t8-api-settings-icon-btn rounded p-1" title="重命名" disabled={fhlBusy} onClick={() => { const name = window.prompt('新的 Worker 名称', worker.name); if (name?.trim()) void runFhlAction(() => updateFhlWorker(worker.id, { name: name.trim() }), 'Worker 已重命名'); }}><Edit3 size={13} /></button>
                      <button type="button" className="t8-api-settings-icon-btn rounded p-1 text-rose-400" title="删除" disabled={fhlBusy} onClick={() => { if (window.confirm(`删除 FHL worker「${worker.name}」？`)) void runFhlAction(() => deleteFhlWorker(worker.id), 'Worker 已删除'); }}><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {!fhlConfig?.workers?.length && <div className={`rounded border border-dashed p-3 text-center text-xs ${hintCls}`}>尚未配置 FHL worker，可手动添加或从 Codex 插件一次性导入。</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={isPixel ? 't8-api-settings-secondary-btn px-btn px-3 py-1 text-xs' : 't8-api-settings-secondary-btn rounded border px-3 py-1 text-xs'} disabled={fhlBusy || (fhlConfig?.workerCount || 0) >= 10} onClick={() => void runFhlAction(importCodexFhlWorkers, 'Codex FHL worker 导入完成')}>
                    {fhlBusy ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : <Download size={12} className="mr-1 inline" />}从 Codex 插件导入
                  </button>
                  {fhlMessage && <span className={`text-[11px] ${fhlMessage.includes('失败') || fhlMessage.includes('错误') ? 'text-rose-400' : hintCls}`}>{fhlMessage}</span>}
                </div>
              </div>
            )}
          </div>

          {/* v1.8.x: 扩展 API 平台，高级可选 */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              data-open={advancedOpen}
              className={
                isPixel
                  ? 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 px-btn'
                  : 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition'
              }
            >
              <ServerCog size={14} className="t8-api-settings-icon" />
              <span className="text-xs font-bold shrink-0">扩展 API 平台【高级/可选】</span>
              <span className={`hidden sm:inline text-[11px] ${hintCls}`}>给高级用户接入第三方平台，默认不影响主流程</span>
              <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                <span
                  className="t8-api-settings-badge px-1.5 py-0.5 text-[10px] rounded border"
                  data-tone={advancedSummary.enabledCount > 0 ? 'success' : 'muted'}
                >
                  已启用 {advancedSummary.enabledCount}/{advancedProvidersInput.length || 5}
                </span>
                <span className={`text-[10px] ${hintCls}`}>密钥 {advancedSummary.configuredKeyCount}</span>
              </span>
              <span className={`flex items-center gap-1 text-[11px] ${hintCls}`}>
                {advancedOpen ? '收起' : '展开'}
                {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
            {!advancedOpen && (
              <div className={`text-[11px] mt-2 ${hintCls}`}>
                未配置或未启用时不会影响贞贞工坊、RunningHub、LLM 独立 Key 等主流程。
              </div>
            )}
            {advancedOpen && (
              <div className="mt-3 space-y-3">
                <div className={`text-[11px] leading-relaxed ${hintCls}`}>
                  这里不是必填项。它只用于 ModelScope、火山引擎、ComfyUI、即梦 CLI 和 OpenAI 兼容接口；平台开启后，还需要在具体节点的“高级来源”里选择它才会生效。
                  当前状态：已启用 {advancedSummary.enabledCount} 个，已配置密钥 {advancedSummary.configuredKeyCount} 个，ComfyUI {advancedSummary.comfyuiConfigured ? '已填写地址' : '未填写地址'}，即梦 CLI {advancedSummary.jimengConfigured ? '已填写路径' : '未填写路径'}。
                </div>
                {advancedProvidersInput.length === 0 ? (
                  <div className={`text-xs ${hintCls}`}>后端尚未返回扩展平台卡片，请先保存或刷新设置。</div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] gap-3 items-start">
                    <div className={`space-y-2 min-w-0 ${isPixel ? '' : 'lg:sticky lg:top-0'}`}>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => addAdvancedProvider('openai-compatible')}
                          className={
                            isPixel
                              ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 inline-flex items-center justify-center gap-1'
                              : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] inline-flex items-center justify-center gap-1'
                          }
                          title="新增一个 OpenAI 兼容扩展平台"
                        >
                          <Plus size={12} /> OpenAI
                        </button>
                        <button
                          type="button"
                          onClick={() => addAdvancedProvider('gemini-compatible')}
                          className={
                            isPixel
                              ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 inline-flex items-center justify-center gap-1'
                              : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] inline-flex items-center justify-center gap-1'
                          }
                          title="新增一个 Gemini 兼容扩展平台"
                        >
                          <Plus size={12} /> Gemini
                        </button>
                      </div>
                      {advancedProvidersInput.map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => setActiveAdvancedProviderId(provider.id)}
                          draggable
                          aria-grabbed={draggedAdvancedProviderId === provider.id}
                          onDragStart={(event) => handleAdvancedProviderDragStart(event, provider.id)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setDragOverAdvancedProviderId(provider.id);
                          }}
                          onDrop={(event) => handleAdvancedProviderDrop(event, provider.id)}
                          onDragEnd={() => {
                            setDraggedAdvancedProviderId(null);
                            setDragOverAdvancedProviderId(null);
                          }}
                          data-active={activeAdvancedProvider?.id === provider.id}
                          data-enabled={!!provider.enabled}
                          title="拖拽调整平台顺序；点击编辑平台设置"
                          className={
                            isPixel
                              ? `t8-api-settings-provider-card w-full !block text-left px-2 py-2 px-btn cursor-grab active:cursor-grabbing ${draggedAdvancedProviderId === provider.id ? 'opacity-50' : ''} ${dragOverAdvancedProviderId === provider.id && draggedAdvancedProviderId !== provider.id ? 'ring-2 ring-cyan-400/70' : ''}`
                              : `t8-api-settings-provider-card w-full block text-left px-2 py-2 rounded-md border text-xs transition cursor-grab active:cursor-grabbing ${draggedAdvancedProviderId === provider.id ? 'opacity-50' : ''} ${dragOverAdvancedProviderId === provider.id && draggedAdvancedProviderId !== provider.id ? 'ring-2 ring-cyan-400/70' : ''}`
                          }
                        >
                          <div className="flex items-center gap-2 min-w-0 w-full">
                            <GripVertical size={13} className={`shrink-0 ${hintCls}`} aria-hidden="true" />
                            <span className={`w-2 h-2 rounded-full shrink-0 ${provider.enabled ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
                            <span className="font-bold min-w-0 truncate">{displayAdvancedProviderLabel(provider)}</span>
                            <span className={`ml-auto text-[10px] shrink-0 ${provider.enabled ? 'text-emerald-500' : hintCls}`}>
                              {provider.enabled ? '已启用' : '未启用'}
                            </span>
                          </div>
                          <div className={`mt-1 text-[10px] leading-snug ${hintCls}`}>
                            {ADVANCED_PROVIDER_GUIDES[provider.protocol]?.nodeScopes.join(' / ') || provider.protocol}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="min-w-0">
                      {activeAdvancedProvider && renderAdvancedProviderForm(activeAdvancedProvider)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 云端上传目标：素材右键上传到 OSS/COS/网盘 */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <button
              type="button"
              onClick={() => setCloudUploadOpen((v) => !v)}
              aria-expanded={cloudUploadOpen}
              data-open={cloudUploadOpen}
              className={
                isPixel
                  ? 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 px-btn'
                  : 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition'
              }
            >
              <CloudUpload size={14} className="t8-api-settings-icon" />
              <span className="text-xs font-bold shrink-0">云端上传目标【可选】</span>
              <span className={`hidden sm:inline text-[11px] ${hintCls}`}>素材右键上传到对象存储或网盘，不影响主流程</span>
              <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                <span
                  className="t8-api-settings-badge px-1.5 py-0.5 text-[10px] rounded border"
                  data-tone={cloudSummary.enabledCount > 0 ? 'success' : 'muted'}
                >
                  已启用 {cloudSummary.enabledCount}/{cloudSummary.totalCount || 4}
                </span>
                <span className={`text-[10px] ${hintCls}`}>已配置 {cloudSummary.configuredCount}</span>
              </span>
              <span className={`flex items-center gap-1 text-[11px] ${hintCls}`}>
                {cloudUploadOpen ? '收起' : '展开'}
                {cloudUploadOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
            {!cloudUploadOpen && (
              <div className={`text-[11px] mt-2 ${hintCls}`}>
                未启用时右键菜单不会出现云端上传目标；已启用后可把图像 / 视频 / 音频复制到外部存储。
              </div>
            )}
            {cloudUploadOpen && (
              <div className="mt-3 space-y-3">
                <div className={`text-[11px] leading-relaxed ${hintCls}`}>
                  这里用于外部归档与分享。腾讯云 COS、阿里云 OSS、百度网盘 WebDAV 和夸克网盘 WebDAV 均支持真实上传；网盘目标需要先用 Alist / CloudDrive2 / rclone 等工具提供 WebDAV 地址。
                  {cloudSummary.defaultLabel ? ` 当前默认目标：${cloudSummary.defaultLabel}。` : ''}
                </div>
                {cloudUploadTargetsInput.length === 0 ? (
                  <div className={`text-xs ${hintCls}`}>后端尚未返回云端上传目标，请先保存或刷新设置。</div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] gap-3 items-start">
                    <div className={`space-y-2 min-w-0 ${isPixel ? '' : 'lg:sticky lg:top-0'}`}>
                      {cloudUploadTargetsInput.map((target) => (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => setActiveCloudTargetId(target.id)}
                          data-active={activeCloudTarget?.id === target.id}
                          data-enabled={!!target.enabled}
                          className={
                            isPixel
                              ? 't8-api-settings-provider-card w-full !block text-left px-2 py-2 px-btn'
                              : 't8-api-settings-provider-card w-full block text-left px-2 py-2 rounded-md border text-xs transition'
                          }
                        >
                          <div className="flex items-center gap-2 min-w-0 w-full">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${target.enabled ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
                            <span className="font-bold min-w-0 truncate">{target.label || CLOUD_UPLOAD_LABELS[target.provider] || target.id}</span>
                            <span className={`ml-auto text-[10px] shrink-0 ${target.enabled ? 'text-emerald-500' : hintCls}`}>
                              {target.enabled ? '已启用' : '未启用'}
                            </span>
                          </div>
                          <div className={`mt-1 text-[10px] leading-snug ${hintCls}`}>
                            {CLOUD_UPLOAD_LABELS[target.provider] || target.provider}
                            {target.isDefault ? ' · 默认' : ''}
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="min-w-0">
                      {activeCloudTarget && renderCloudTargetForm(activeCloudTarget)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 任务完成提示音 */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <button
              type="button"
              onClick={() => setNodeMenuOpen((v) => !v)}
              aria-expanded={nodeMenuOpen}
              data-open={nodeMenuOpen}
              className={
                isPixel
                  ? 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 px-btn'
                  : 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition'
              }
            >
              <MousePointer2 size={14} className="t8-api-settings-icon" />
              <span className="text-xs font-bold shrink-0">画布右键节点菜单</span>
              <span className={`hidden sm:inline text-[11px] ${hintCls}`}>设置快速添加、从输入口拉线、从输出口拉线时显示哪些节点及顺序</span>
              <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                {CANVAS_NODE_MENU_SCENES.map((scene) => {
                  const pref = nodeMenuPreferencesInput[scene];
                  const visible = pref.items.filter((item) => item.visible).length;
                  return (
                    <span
                      key={scene}
                      className="t8-api-settings-badge px-1.5 py-0.5 text-[10px] rounded border"
                      data-tone={pref.enabled && visible > 0 ? 'success' : 'muted'}
                    >
                      {visible}
                    </span>
                  );
                })}
              </span>
              <span className={`flex items-center gap-1 text-[11px] ${hintCls}`}>
                {nodeMenuOpen ? '收起' : '展开'}
                {nodeMenuOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
            {!nodeMenuOpen && (
              <div className={`text-[11px] mt-2 ${hintCls}`}>
                用于控制空白区右键“快速添加节点”、输入接口“从...输入”和输出接口“连接到”的候选节点。
              </div>
            )}
            {nodeMenuOpen && (
              <div className="mt-3 space-y-3">
                <div className="flex items-start gap-3 justify-between flex-wrap">
                  <div className={`text-[11px] leading-relaxed ${hintCls}`}>
                    取消勾选会从对应菜单中隐藏该节点；上下箭头用于调整菜单显示顺序，不影响侧边栏节点列表和已有画布。
                  </div>
                  <button
                    type="button"
                    onClick={resetNodeMenuPreferences}
                    className={
                      isPixel
                        ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 shrink-0'
                        : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] shrink-0 inline-flex items-center gap-1'
                    }
                  >
                    恢复默认
                  </button>
                </div>
                {CANVAS_NODE_MENU_SCENES.map((scene) => renderNodeMenuSceneSettings(scene))}
              </div>
            )}
          </div>

          {/* 节点帮助文档管理 */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <button
              type="button"
              onClick={() => setNodeHelpOpen((v) => !v)}
              aria-expanded={nodeHelpOpen}
              data-open={nodeHelpOpen}
              className={
                isPixel
                  ? 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 px-btn'
                  : 't8-api-settings-toggle w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition'
              }
            >
              <HelpCircle size={14} className="t8-api-settings-icon" />
              <span className="text-xs font-bold shrink-0">节点帮助文档</span>
              <span className={`hidden sm:inline text-[11px] ${hintCls}`}>编辑节点标题栏 ? 按钮弹出的 Markdown 帮助内容</span>
              <span className="ml-auto flex items-center gap-1.5">
                {(() => {
                  let customCount = 0;
                  for (const node of NODE_HELP_NODES) {
                    const cur = nodeHelpMap[node.type];
                    if (cur && cur !== (DEFAULT_NODE_HELPS[node.type] || '')) customCount += 1;
                  }
                  return (
                    <span
                      className="t8-api-settings-badge px-1.5 py-0.5 text-[10px] rounded border"
                      data-tone={customCount > 0 ? 'success' : 'muted'}
                    >
                      {customCount}/{NODE_HELP_NODES.length}
                    </span>
                  );
                })()}
              </span>
              <span className={`flex items-center gap-1 text-[11px] ${hintCls}`}>
                {nodeHelpOpen ? '收起' : '展开'}
                {nodeHelpOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
            {!nodeHelpOpen && (
              <div className={`text-[11px] mt-2 ${hintCls}`}>
                用于编辑画布节点标题栏 ? 按钮弹出的帮助内容，支持 Markdown 格式，可导出/导入备份。
              </div>
            )}
            {nodeHelpOpen && (
              <div className="mt-3 space-y-3">
                <div className="flex items-start gap-3 justify-between flex-wrap">
                  <div className={`text-[11px] leading-relaxed ${hintCls}`}>
                    修改后点击「保存」立即生效；「重置为默认」会删除后端覆盖并回退到内置帮助；「恢复全部默认」会清空所有自定义。
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <button
                      type="button"
                      onClick={handleExportNodeHelps}
                      disabled={nodeHelpBusy}
                      className={
                        isPixel
                          ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 inline-flex items-center gap-1'
                          : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] inline-flex items-center gap-1'
                      }
                    >
                      <Download size={12} /> 导出 JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => nodeHelpImportFileRef.current?.click()}
                      disabled={nodeHelpBusy}
                      className={
                        isPixel
                          ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 inline-flex items-center gap-1'
                          : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] inline-flex items-center gap-1'
                      }
                    >
                      <FileUp size={12} /> 导入 JSON
                    </button>
                    <button
                      type="button"
                      onClick={handleResetAllNodeHelps}
                      disabled={nodeHelpBusy}
                      className={
                        isPixel
                          ? 't8-api-settings-secondary-btn px-btn text-[11px] px-2 py-1 inline-flex items-center gap-1'
                          : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] inline-flex items-center gap-1'
                      }
                    >
                      <RotateCcw size={12} /> 恢复全部默认
                    </button>
                  </div>
                  <input
                    ref={nodeHelpImportFileRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => handleImportNodeHelps(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="flex gap-3 flex-col md:flex-row">
                  {/* 左侧节点列表 */}
                  <div className={`md:w-52 shrink-0 ${isPixel ? 'border p-2' : 'rounded-lg border p-2'} max-h-[420px] overflow-y-auto`}>
                    {NODE_HELP_NODES.map((node) => {
                      const cur = nodeHelpMap[node.type];
                      const isCustom = !!cur && cur !== (DEFAULT_NODE_HELPS[node.type] || '');
                      const isActive = activeNodeHelpType === node.type;
                      return (
                        <button
                          key={node.type}
                          type="button"
                          onClick={() => setActiveNodeHelpType(node.type)}
                          className={
                            isPixel
                              ? `w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-2 ${isActive ? 'bg-cyan-300/10 text-cyan-200' : ''}`
                              : `w-full text-left px-2 py-1.5 text-[11px] rounded flex items-center gap-2 ${isActive ? 'bg-cyan-300/10 text-cyan-200' : 'hover:bg-white/[0.04]'}`
                          }
                        >
                          <span
                            className={`inline-block w-2 h-2 rounded-full shrink-0 ${isCustom ? 'bg-emerald-400' : 'bg-white/25'}`}
                            title={isCustom ? '已自定义' : '默认'}
                          />
                          <span className="truncate">{node.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 右侧编辑/预览区 */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {(() => {
                      const activeHelpNode = NODE_HELP_NODES.find((n) => n.type === activeNodeHelpType);
                      const activeHelpIsCustom = !!activeNodeHelpType
                        && !!nodeHelpMap[activeNodeHelpType]
                        && nodeHelpMap[activeNodeHelpType] !== (DEFAULT_NODE_HELPS[activeNodeHelpType] || '');
                      return (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold ${labelCls}`}>{activeHelpNode?.label || '未选择节点'}</span>
                            <span
                              className="t8-api-settings-badge px-1.5 py-0.5 text-[10px] rounded border"
                              data-tone={activeHelpIsCustom ? 'success' : 'muted'}
                            >
                              {activeHelpIsCustom ? '自定义' : '默认'}
                            </span>
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setNodeHelpView('edit')}
                                className={
                                  isPixel
                                    ? `px-btn px-2 py-1 text-[10px] inline-flex items-center gap-1 ${nodeHelpView === 'edit' ? 'bg-cyan-300/15 text-cyan-200' : ''}`
                                    : `rounded px-2 py-1 text-[10px] border inline-flex items-center gap-1 ${nodeHelpView === 'edit' ? 'bg-cyan-300/15 text-cyan-200 border-cyan-300/40' : ''}`
                                }
                              >
                                <Edit3 size={11} /> 编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => setNodeHelpView('preview')}
                                className={
                                  isPixel
                                    ? `px-btn px-2 py-1 text-[10px] inline-flex items-center gap-1 ${nodeHelpView === 'preview' ? 'bg-cyan-300/15 text-cyan-200' : ''}`
                                    : `rounded px-2 py-1 text-[10px] border inline-flex items-center gap-1 ${nodeHelpView === 'preview' ? 'bg-cyan-300/15 text-cyan-200 border-cyan-300/40' : ''}`
                                }
                              >
                                <EyeIcon size={11} /> 预览
                              </button>
                            </div>
                          </div>

                          {nodeHelpView === 'edit' ? (
                            <textarea
                              value={nodeHelpDraft}
                              onChange={(e) => {
                                setNodeHelpDraft(e.target.value);
                                setNodeHelpDirty(true);
                              }}
                              placeholder="在此输入 Markdown 帮助内容..."
                              spellCheck={false}
                              className="w-full min-h-[300px] resize-y rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] font-mono leading-relaxed text-white outline-none focus:border-cyan-300/60"
                            />
                          ) : (
                            <div
                              className={
                                isPixel
                                  ? 't8-api-settings-section min-h-[300px] max-h-[420px] overflow-y-auto p-2 border'
                                  : 't8-api-settings-section min-h-[300px] max-h-[420px] overflow-y-auto p-3 rounded-lg border'
                              }
                            >
                              <div className="t8-md-content">{renderSimpleMarkdown(nodeHelpDraft)}</div>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={handleSaveNodeHelp}
                              disabled={nodeHelpBusy || !activeNodeHelpType}
                              className={
                                isPixel
                                  ? 't8-api-settings-action-btn px-btn px-2 py-1 text-[11px] inline-flex items-center gap-1'
                                  : 't8-api-settings-action-btn rounded border px-2 py-1 text-[11px] inline-flex items-center gap-1'
                              }
                            >
                              <Save size={12} /> 保存
                            </button>
                            <button
                              type="button"
                              onClick={handleResetNodeHelp}
                              disabled={nodeHelpBusy || !activeNodeHelpType}
                              className={
                                isPixel
                                  ? 't8-api-settings-secondary-btn px-btn px-2 py-1 text-[11px] inline-flex items-center gap-1'
                                  : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] inline-flex items-center gap-1'
                              }
                            >
                              <RotateCcw size={12} /> 重置为默认
                            </button>
                            <button
                              type="button"
                              onClick={handleClearNodeHelp}
                              disabled={nodeHelpBusy || !activeNodeHelpType}
                              className={
                                isPixel
                                  ? 't8-api-settings-secondary-btn px-btn px-2 py-1 text-[11px] inline-flex items-center gap-1'
                                  : 't8-api-settings-secondary-btn rounded border px-2 py-1 text-[11px] inline-flex items-center gap-1'
                              }
                            >
                              <Trash2 size={12} /> 清空
                            </button>
                            {nodeHelpDirty && (
                              <span className={`text-[10px] ${hintCls}`}>未保存</span>
                            )}
                            {nodeHelpBusy && (
                              <Loader2 size={12} className="animate-spin text-cyan-300" />
                            )}
                            {nodeHelpMessage && (
                              <span className={`text-[10px] ${nodeHelpMessage.includes('失败') ? 'text-red-400' : 'text-emerald-400'}`}>
                                {nodeHelpMessage}
                              </span>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="t8-api-settings-divider pt-3 border-t">
            <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
              <Volume2 size={14} className="t8-api-settings-icon" />
              任务完成提示音
              <span className={`text-[11px] font-normal ${hintCls}`}>· 生成任务完成时播放；未上传时使用默认短提示音</span>
            </label>
            <div
              className={
                isPixel
                  ? 't8-api-settings-section mt-2 p-3 space-y-3 border'
                  : 't8-api-settings-section mt-2 p-3 space-y-3 rounded-lg border'
              }
            >
              <div className="flex items-start gap-3 justify-between flex-wrap">
                <div className="min-w-0">
                  <div className={`text-xs font-black ${labelCls}`}>
                    当前：{hasCustomTaskCompletionSound ? (taskCompletionSoundSettings.name || '自定义提示音') : '默认提示音'}
                  </div>
                  <div className={`mt-1 text-[11px] leading-relaxed ${hintCls}`}>
                    支持 mp3 / wav / ogg / m4a / aac / flac / webm，最大 20MB。
                    {hasCustomTaskCompletionSound && taskCompletionSoundSizeLabel ? ` 当前文件 ${taskCompletionSoundSizeLabel}。` : ''}
                  </div>
                </div>
                <span
                  className="t8-api-settings-badge px-2 py-1 text-[10px] rounded border shrink-0"
                  data-tone={hasCustomTaskCompletionSound ? 'success' : 'muted'}
                >
                  {hasCustomTaskCompletionSound ? '自定义' : '默认'}
                </span>
              </div>
              <input
                ref={taskCompletionSoundFileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
                className="hidden"
                onChange={(e) => handleTaskCompletionSoundUpload(e.target.files?.[0] || null)}
              />
              <input
                ref={taskFailureSoundFileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
                className="hidden"
                onChange={(e) => handleTaskFailureSoundUpload(e.target.files?.[0] || null)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => taskCompletionSoundFileInputRef.current?.click()}
                  disabled={taskSoundBusy}
                  className={
                    isPixel
                      ? 't8-api-settings-secondary-btn px-btn flex items-center gap-2 disabled:opacity-50'
                      : 't8-api-settings-secondary-btn px-3 py-2 text-xs rounded-md border flex items-center gap-2 disabled:opacity-50'
                  }
                >
                  <FileUp size={13} />
                  {taskSoundBusy ? '处理中...' : '上传音频'}
                </button>
                <button
                  type="button"
                  onClick={handlePreviewTaskCompletionSound}
                  disabled={taskSoundBusy || taskSoundTesting}
                  className={
                    isPixel
                      ? 't8-api-settings-action-btn px-btn flex items-center gap-2 disabled:opacity-50'
                      : 't8-api-settings-action-btn px-3 py-2 text-xs rounded-md border flex items-center gap-2 disabled:opacity-50'
                  }
                >
                  <Volume2 size={13} />
                  {taskSoundTesting ? '试听中...' : '试听'}
                </button>
                <button
                  type="button"
                  onClick={handleResetTaskCompletionSound}
                  disabled={taskSoundBusy || !hasCustomTaskCompletionSound}
                  className={
                    isPixel
                      ? 't8-api-settings-secondary-btn px-btn flex items-center gap-2 disabled:opacity-50'
                      : 't8-api-settings-secondary-btn px-3 py-2 text-xs rounded-md border flex items-center gap-2 disabled:opacity-50'
                  }
                >
                  <Trash2 size={13} />
                  恢复默认
                </button>
              </div>
              {taskSoundMessage && (
                <div
                  className={
                    taskSoundMessage.includes('失败') || taskSoundMessage.includes('请选择')
                      ? 'text-[11px] text-red-400'
                      : 'text-[11px] text-emerald-500'
                  }
                >
                  {taskSoundMessage}
                </div>
              )}
              <div className="t8-api-settings-divider border-t pt-3">
                <div className="flex items-start gap-3 justify-between flex-wrap">
                  <div className="min-w-0">
                    <div className={`text-xs font-black ${labelCls}`}>
                      任务失败提示音：{hasCustomTaskFailureSound ? (taskFailureSoundSettings.name || '自定义提示音') : '默认提示音'}
                    </div>
                    <div className={`mt-1 text-[11px] leading-relaxed ${hintCls}`}>
                      任务失败时播放，支持 mp3 / wav / ogg / m4a / aac / flac / webm。
                      {hasCustomTaskFailureSound && taskFailureSoundSizeLabel ? ` 当前文件 ${taskFailureSoundSizeLabel}。` : ''}
                    </div>
                  </div>
                  <span
                    className="t8-api-settings-badge px-2 py-1 text-[10px] rounded border shrink-0"
                    data-tone={hasCustomTaskFailureSound ? 'success' : 'muted'}
                  >
                    {hasCustomTaskFailureSound ? '自定义' : '默认'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => taskFailureSoundFileInputRef.current?.click()}
                    disabled={taskFailureSoundBusy}
                    className={
                      isPixel
                        ? 't8-api-settings-secondary-btn px-btn flex items-center gap-2 disabled:opacity-50'
                        : 't8-api-settings-secondary-btn px-3 py-2 text-xs rounded-md border flex items-center gap-2 disabled:opacity-50'
                    }
                  >
                    <FileUp size={13} />
                    {taskFailureSoundBusy ? '处理中...' : '上传失败音'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviewTaskFailureSound}
                    disabled={taskFailureSoundBusy || taskFailureSoundTesting}
                    className={
                      isPixel
                        ? 't8-api-settings-action-btn px-btn flex items-center gap-2 disabled:opacity-50'
                        : 't8-api-settings-action-btn px-3 py-2 text-xs rounded-md border flex items-center gap-2 disabled:opacity-50'
                    }
                  >
                    <Volume2 size={13} />
                    {taskFailureSoundTesting ? '试听中...' : '试听失败音'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetTaskFailureSound}
                    disabled={taskFailureSoundBusy || !hasCustomTaskFailureSound}
                    className={
                      isPixel
                        ? 't8-api-settings-secondary-btn px-btn flex items-center gap-2 disabled:opacity-50'
                        : 't8-api-settings-secondary-btn px-3 py-2 text-xs rounded-md border flex items-center gap-2 disabled:opacity-50'
                    }
                  >
                    <Trash2 size={13} />
                    恢复默认
                  </button>
                </div>
                {taskFailureSoundMessage && (
                  <div
                    className={
                      taskFailureSoundMessage.includes('Failed') || taskFailureSoundMessage.includes('Please choose')
                        ? 'mt-2 text-[11px] text-red-400'
                        : 'mt-2 text-[11px] text-emerald-500'
                    }
                  >
                    {taskFailureSoundMessage}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="t8-api-settings-divider pt-3 border-t space-y-3">
            <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
              <ServerCog size={14} className="t8-api-settings-icon" />
              输出保存空间
              <span className={`text-[11px] font-normal ${hintCls}`}>· 新生成文件写入当前空间，历史生成始终聚合所有空间</span>
            </label>
            <div className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
              <span className={`text-xs ${hintCls}`}>当前保存空间</span>
              <select
                className={inputCls}
                value={activeOutputStorageSpaceIdInput}
                onChange={(e) => {
                  setActiveOutputStorageSpaceIdInput(e.target.value);
                  setOutputStorageDirty(true);
                }}
              >
                {outputStorageSpacesInput.map((space) => {
                  const configured = space.id === 'primary'
                    || (space.type === 'cloud-upload-target' && space.enabled)
                    || (space.type === 't8-storage-node' && space.enabled && !!space.baseUrl && (!!space.apiToken || !!space.hasApiToken));
                  return <option key={space.id} value={space.id} disabled={!configured}>{space.label}{configured ? '' : '（未配置）'}</option>;
                })}
              </select>
            </div>
            {outputStorageSpacesInput.filter((space) => space.type !== 'local').map((space) => {
              const testState = outputStorageTestStatus[space.id];
              const updateSpace = (patch: Partial<OutputStorageSpaceConfig>) => {
                setOutputStorageSpacesInput((prev) => prev.map((item) => item.id === space.id ? { ...item, ...patch } : item));
                setOutputStorageDirty(true);
              };
              return (
                <div key={space.id} className={isPixel ? 't8-api-settings-section border p-3 space-y-2' : 't8-api-settings-section rounded-lg border p-3 space-y-2'}>
                  {space.type === 'cloud-upload-target' ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className={`text-sm font-medium ${labelCls}`}>{space.label}</div>
                          <div className={`text-[11px] ${hintCls}`}>复用“云端上传目标 → 百度网盘”的 WebDAV 配置</div>
                        </div>
                        <span className={`text-[11px] ${space.enabled ? 'text-emerald-500' : hintCls}`}>{space.enabled ? '可用' : '未配置或未启用'}</span>
                      </div>
                      <div className={`text-[11px] ${hintCls}`}>请在上方“云端上传目标”中修改 AList WebDAV 地址、账号、密码和目录；此处不会保存第二份凭据。</div>
                    </>
                  ) : (
                    <>
                  <div className="flex items-center justify-between gap-3">
                    <input className={`${inputCls} max-w-[240px]`} value={space.label} onChange={(e) => updateSpace({ label: e.target.value })} placeholder="第二台 ECS" />
                    <label className={`flex items-center gap-2 text-xs ${labelCls}`}>
                      <input type="checkbox" checked={space.enabled === true} onChange={(e) => updateSpace({ enabled: e.target.checked })} />
                      启用
                    </label>
                  </div>
                  <input className={inputCls} value={space.baseUrl || ''} onChange={(e) => updateSpace({ baseUrl: e.target.value })} placeholder="https://storage.example.com" autoComplete="off" spellCheck={false} />
                  <input type="password" className={inputCls} value={space.apiToken || ''} onChange={(e) => updateSpace({ apiToken: e.target.value })} placeholder={space.hasApiToken ? '已保存 Token；留空或保持掩码不变' : '存储节点访问 Token'} autoComplete="new-password" />
                    </>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" className={isPixel ? 'px-btn px-btn--ghost' : 'h-8 px-3 rounded-md border text-xs flex items-center gap-1.5'} disabled={testState?.loading} onClick={() => void handleTestOutputStorage(space)}>
                      {testState?.loading ? <Loader2 size={12} className="animate-spin" /> : <TestTube2 size={12} />} 测试连接
                    </button>
                    <button type="button" className={isPixel ? 'px-btn px-btn--ghost' : 'h-8 px-3 rounded-md border text-xs'} disabled={testState?.loading || !space.enabled} onClick={() => void handleReconcileOutputStorage(space)}>
                      对账文件
                    </button>
                    {testState?.message && <span className={`text-[11px] ${testState.ok ? 'text-emerald-500' : 'text-red-400'}`}>{testState.message}</span>}
                  </div>
                </div>
              );
            })}
            <div className={`text-[11px] ${hintCls}`}>切换只影响新文件；第二台 ECS 写入失败时会回落当前服务器。Token 仅保存在第一台 ECS 后端。</div>
          </div>

          {/* v1.2.10.2: 文件自动保存路径 */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
              <FolderOpen size={14} className="t8-api-settings-icon" />
              文件自动保存路径
              <span className={`text-[11px] font-normal ${hintCls}`}>· 所有可执行节点生成的图像/视频/音频均会自动复制一份到此路径</span>
            </label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={fileSavePathInput}
                onChange={(e) => setFileSavePathInput(e.target.value)}
                placeholder="例：D:\\zhenzhen 或 ~/zhenzhen · 路径不存在时会自动创建"
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className={`flex items-center gap-2 flex-wrap text-[11px] mt-1.5 ${hintCls}`}>
              <span className="flex items-center gap-1.5">
                <Lock size={11} /> 仅保存在本地机, 不上传上游。同名文件不覆盖。
              </span>
            </div>
          </div>

          {/* v1.3.1: 画布自动保存路径 */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
              <FolderOpen size={14} className="t8-api-settings-icon" />
              画布自动保存路径
              <span className={`text-[11px] font-normal ${hintCls}`}>· 当前画布变更后自动导出 JSON，方便更换版本后导入</span>
            </label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={canvasAutoSavePathInput}
                onChange={(e) => setCanvasAutoSavePathInput(e.target.value)}
                placeholder="例：D:\\zhenzhen 或 ~/zhenzhen · 实际保存到此路径下的 T8-penguin-canvas\\canvases"
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className={`flex items-center gap-2 flex-wrap text-[11px] mt-1.5 ${hintCls}`}>
              <span className="flex items-center gap-1.5">
                <Lock size={11} /> 默认路径由后端按平台返回：Windows 为 D:\zhenzhen，macOS/Linux 为用户目录下的 zhenzhen。
              </span>
            </div>
          </div>

          {/* v1.3.4: 资源库路径 */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
              <FolderOpen size={14} className="t8-api-settings-icon" />
              资源库路径
              <span className={`text-[11px] font-normal ${hintCls}`}>· 资源文件与分类索引都保存在此路径，更换版本后可继续读取</span>
            </label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={resourceLibraryPathInput}
                onChange={(e) => setResourceLibraryPathInput(e.target.value)}
                placeholder="例：D:\\zhenzhen\\resources 或 ~/zhenzhen/resources · 路径不存在时会自动创建"
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className={`flex items-center gap-2 flex-wrap text-[11px] mt-1.5 ${hintCls}`}>
              <span className="flex items-center gap-1.5">
                <Lock size={11} /> 加入资源库会复制一份到此目录，删除资源只删除资源库副本。
              </span>
            </div>
          </div>

          {/* v1.3.6: 主题模板路径 */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
              <FolderOpen size={14} className="t8-api-settings-icon" />
              主题模板路径
              <span className={`text-[11px] font-normal ${hintCls}`}>· 导入或编辑后的主题 JSON 保存在此路径</span>
            </label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={themeTemplatePathInput}
                onChange={(e) => setThemeTemplatePathInput(e.target.value)}
                placeholder="例：D:\\zhenzhen\\theme-templates 或 ~/zhenzhen/theme-templates · 路径不存在时会自动创建"
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className={`flex items-center gap-2 flex-wrap text-[11px] mt-1.5 ${hintCls}`}>
              <span className="flex items-center gap-1.5">
                <Lock size={11} /> 内置主题不可删除；自定义主题可导入、导出、编辑和删除。
              </span>
            </div>
          </div>

          {/* 本地 Eagle API */}
          <div className="t8-api-settings-divider pt-3 border-t">
            <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
              <ExternalLink size={14} className="t8-api-settings-icon" />
              Eagle 本地接口
              <span className={`text-[11px] font-normal ${hintCls}`}>· 发送素材到本机 Eagle 时使用</span>
            </label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={eagleApiBaseInput}
                onChange={(e) => setEagleApiBaseInput(e.target.value)}
                placeholder="http://127.0.0.1:41595"
                className={inputCls}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className={`flex items-center gap-2 flex-wrap text-[11px] mt-1.5 ${hintCls}`}>
              <span className="flex items-center gap-1.5">
                <Lock size={11} /> 后端只允许 127.0.0.1 / localhost，避免把本地素材发送到远端代理。
              </span>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              ❌ {error}
            </div>
          )}
          {backupMessage && (
            <div
              className={
                isPixel
                  ? 'text-xs px-3 py-2 border border-[var(--px-ink)] bg-[var(--px-yellow)] text-[var(--px-ink)]'
                  : `text-xs rounded-md px-3 py-2 border ${
                      backupMessage.includes('失败') || backupMessage.includes('不正确')
                        ? 'text-red-300 bg-red-500/10 border-red-500/25'
                        : isDark
                          ? 'text-amber-100 bg-amber-500/10 border-amber-500/25'
                          : 'text-amber-800 bg-amber-50 border-amber-200'
                    }`
              }
            >
              {backupMessage}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div
          className={`t8-api-settings-footer flex items-center justify-end gap-2 px-5 py-3 border-t shrink-0 ${
            isPixel
              ? 'border-[var(--px-ink)]'
              : ''
          }`}
        >
          <input
            ref={backupFileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => handleImportFile(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => backupFileInputRef.current?.click()}
            className={
              isPixel
                ? 't8-api-settings-secondary-btn px-btn flex items-center gap-2'
                : 't8-api-settings-secondary-btn px-3 py-2 text-sm rounded-md border flex items-center gap-2'
            }
            title="导入设置备份，回填后需点击保存生效"
          >
            <FileUp size={14} />
            导入设置
          </button>
          <button
            type="button"
            onClick={handleExportSettings}
            className={
              isPixel
                ? 't8-api-settings-secondary-btn px-btn flex items-center gap-2'
                : 't8-api-settings-secondary-btn px-3 py-2 text-sm rounded-md border flex items-center gap-2'
            }
            title="导出包含明文 API Key 的私密备份"
          >
            <Download size={14} />
            导出设置
          </button>
          <button
            onClick={onClose}
            className={
              isPixel
                ? 't8-api-settings-secondary-btn px-btn'
                : 't8-api-settings-secondary-btn px-4 py-2 text-sm rounded-md border'
            }
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className={
              isPixel
                ? 't8-api-settings-primary-btn px-btn px-btn--mint disabled:opacity-50 flex items-center gap-2'
                : 't8-api-settings-primary-btn px-4 py-2 text-sm rounded-md flex items-center gap-2 disabled:opacity-50'
            }
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <span>✓ 已保存</span>
            ) : (
              <Save size={14} />
            )}
            {!loading && !saved && '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
