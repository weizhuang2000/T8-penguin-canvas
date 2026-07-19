/**
 * T8-penguin-canvas 节点类型定义
 * 与 features.json 节点清单严格对齐(24 节点 + 4 已弃)
 */

// 节点类型(25 种保留 = 24 + upload)
export type NodeType =
  // Core (8)
  | 'text'
  | 'image'
  | 'fhl-image-gen'
  | 'gitee-music'
  | 'video'
  | 'runninghub-video'
  | 'seedance'
  | 'director-storyboard'
  | 'audio'
  | 'llm'
  | 'prompt-reverse'
  | 'remotion-animation'
  | 'runninghub'
  | 'runninghub-wallet'
  | 'rh-config'
  | 'rh-tools'
  | 'rh-toolbox'
  | 'rh-toolbox-maker'
  | 'fal-toolbox'
  | 'fal-toolbox-maker'
  | 'model-3d-preview'
  | 'model-3d-upload'
  | 'grok-oauth-agent'
  | 'codex-cli-agent'
  | 'codex-image-conjure'
  | 'image-to-editable-document'
  | 'artist-style-master'
  | 'anime-tag-master'
  | 'comfyui-store'
  | 'comfyui-app-maker'
  // Special (5)
  | 'multi-angle-3d'
  | 'panorama-720'
  | 'penguin-portrait'
  | 'portrait-metadata'
  | 'storyboard-grid'
  // Utility (9)
  | 'drawing-board'
  | 'image-edit'
  | 'browser'
  | 'image-compare'
  | 'frame-extractor'
  | 'frame-pair'
  | 'loop'
  | 'pick-from-set'
  | 'text-split'
  | 'import-cam-project'
  | 'resize'
  | 'combine'
  | 'mark'
  | 'remove-bg'
  | 'upscale'
  | 'grid-crop'
  | 'grid-editor'
  // Auxiliary (5)
  | 'edit'
  | 'idea'
  | 'bp'
  | 'relay'
  | 'remove-ai-watermark'
  | 'video-output'
  // Toolbox (5)
  | 'cinematic'
  | 'video-motion'
  | 'elevation-prompt'
  | 'exhibition-img2img'
  | 'exhibition-render-to-elevation'
  | 'exhibition-style-transfer'
  | 'exhibition-recolor'
  | 'exhibition-lighting-heatmap'
  | 'exhibition-creative-image'
  | 'exhibition-text-image-loop'
  | 'exhibition-outline-split'
  | 'unit-panel-design'
  | 'sculpture-relief-design'
  | 'exhibition-wayfinding-design'
  | 'exhibition-scene-design'
  | 'science-exhibit-design'
  | 'exhibition-floorplan-layout'
  | 'showcase-interior-design'
  | 'reverse-isometric-design'
  | 'fusion-render-design'
  | 'cinema-auditorium-design'
  | 'multi-angle-visual'
  | 'portrait-master'
  | 'pose-master'
  | 'aggregate-parser'
  | 'batch-processor'
  | 'topaz-image-upscale'
  | 'topaz-video-upscale'
  // 3D (1)
  | 'panorama-3d'
  // Input/Output 素材 (2) - 上传素材(图像/视频/音频三合一) + 输出素材(文本/图像/视频/音频预览)
  | 'upload'
  | 'material-set'
  | 'output';

// 节点分类
export type NodeCategory =
  | 'core'
  | 'exhibition'
  | 'rh'
  | 'fal'
  | 'grok'
  | 'codex'
  | 'inspiration'
  | 'comfyui'
  | 'special'
  | 'utility'
  | 'auxiliary'
  | 'toolbox'
  | '3d'
  | 'input';

// 节点元数据(用于 Sidebar 展示)
export interface NodeMeta {
  type: NodeType;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string; // lucide-react 图标名
  color: string; // tailwind 色阶
  /**
   * 是否在 UI 入口暂时隐藏(Sidebar 节点列表 + 端口拖出候选选择器)。
   * 节点本身仍然在 NODE_REGISTRY 中注册到 nodeTypes,以保证已存在画布数据加载与渲染兼容,
   * 仅从用户主动添加入口中移除。设为 true 即等价于「暂时不展示」。
   */
  hidden?: boolean;
}

// 画布节点数据(xyflow Node.data)
export type AdvancedProviderProtocol =
  | 'openai-compatible'
  | 'gemini-compatible'
  | 'modelscope'
  | 'volcengine'
  | 'comfyui'
  | 'jimeng-cli';

export interface AdvancedProviderConfig {
  id: string;
  label: string;
  protocol: AdvancedProviderProtocol;
  baseUrl?: string;
  enabled?: boolean;
  allowRemote?: boolean;
  apiKey?: string;
  hasApiKey?: boolean;
  imageModels?: string[];
  imageModelSizes?: Record<string, Array<'1K' | '2K' | '4K'>>;
  videoModels?: string[];
  chatModels?: string[];
  defaults?: Record<string, any>;
  modelscopeConfig?: {
    defaultsVersion?: number;
    loras?: Array<{
      id: string;
      name?: string;
      targetModel: string;
      strength?: number;
      enabled?: boolean;
      note?: string;
    }>;
  };
  volcengineConfig?: {
    project?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    hasAccessKeyId?: boolean;
    hasSecretAccessKey?: boolean;
  };
  comfyuiConfig?: {
    instances?: string[];
    workflows?: Array<{
      id: string;
      name: string;
      workflowJson?: Record<string, any>;
      fields?: Array<{ nodeId: string; fieldName: string; source?: string; value?: any; options?: Array<string | number> }>;
      excludeRules?: string[];
    }>;
  };
  jimengConfig?: {
    executablePath?: string;
    useWsl?: boolean;
    wslDistro?: string;
    pollSeconds?: number;
  };
}

export interface AdvancedProviderSummary {
  enabledCount: number;
  configuredKeyCount: number;
  comfyuiConfigured: boolean;
  jimengConfigured: boolean;
}

export interface LlmConfig {
  id: string;
  label: string;
  apiKey?: string;
  hasApiKey?: boolean;
  baseUrl?: string;
  model?: string;
  isDefault?: boolean;
}

export type CloudUploadProvider =
  | 'tencent-cos'
  | 'aliyun-oss'
  | 'baidu-netdisk'
  | 'quark-netdisk';

export interface CloudUploadTargetConfig {
  id: string;
  provider: CloudUploadProvider;
  label: string;
  enabled?: boolean;
  isDefault?: boolean;
  prefix?: string;
  publicBaseUrl?: string;
  tencentCos?: {
    bucket?: string;
    region?: string;
    secretId?: string;
    secretKey?: string;
    hasSecretId?: boolean;
    hasSecretKey?: boolean;
  };
  aliyunOss?: {
    bucket?: string;
    endpoint?: string;
    accessKeyId?: string;
    accessKeySecret?: string;
    hasAccessKeyId?: boolean;
    hasAccessKeySecret?: boolean;
  };
  baiduNetdisk?: {
    webdavUrl?: string;
    username?: string;
    password?: string;
    folder?: string;
    hasPassword?: boolean;
  };
  quarkNetdisk?: {
    webdavUrl?: string;
    username?: string;
    password?: string;
    folder?: string;
    hasPassword?: boolean;
  };
}

export interface CloudUploadSummary {
  totalCount: number;
  enabledCount: number;
  configuredCount: number;
  supportedUploadCount: number;
  defaultTargetId?: string;
  defaultLabel?: string;
}

export type OutputStorageSpaceType = 'local' | 't8-storage-node' | 'cloud-upload-target';

export interface OutputStorageSpaceConfig {
  id: string;
  type: OutputStorageSpaceType;
  label: string;
  enabled?: boolean;
  immutable?: boolean;
  baseUrl?: string;
  apiToken?: string;
  hasApiToken?: boolean;
  cloudTargetId?: string;
  provider?: CloudUploadProvider;
  managed?: boolean;
}

export interface OutputStorageSummary {
  totalCount: number;
  enabledCount: number;
  activeSpaceId: string;
  activeLabel: string;
}

export type CanvasNodeMenuScene = 'quickAdd' | 'connectFromInput' | 'connectToOutput';

export interface CanvasNodeMenuItemPreference {
  type: NodeType;
  visible: boolean;
  order: number;
}

export interface CanvasNodeMenuScenePreference {
  enabled: boolean;
  items: CanvasNodeMenuItemPreference[];
}

export type CanvasNodeMenuPreferences = Record<CanvasNodeMenuScene, CanvasNodeMenuScenePreference>;

export type CanvasProviderSource = 'zhenzhen' | AdvancedProviderProtocol;

export interface CanvasNodeData {
  label?: string;
  prompt?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  model?: string;
  providerSource?: CanvasProviderSource;
  providerId?: string;
  providerModel?: string;
  llmKeyId?: string;
  providerParams?: Record<string, any>;
  status?: 'idle' | 'generating' | 'success' | 'error';
  error?: string;
  // 通用扩展字段
  [key: string]: any;
}

export interface FhlWorkerSummary {
  index: number;
  id: string;
  name: string;
  enabled: boolean;
  hasApiKey: boolean;
  keyPreview: string;
  createdAt?: string;
}

export interface FhlConfigSummary {
  apiRoot: string;
  model: 'gpt-image-2';
  apiMode: 'images';
  workerLimit: number;
  workerCount: number;
  enabledWorkerCount: number;
  workers: FhlWorkerSummary[];
  defaults: { quality: '2K'; outputFormat: FhlOutputFormat; aspect: string; concurrency: number; repairPasses: number };
  ratioSupport: Record<'generate' | 'edit', Record<'2K' | '4K', string[]>>;
  importedCount?: number;
}

export type FhlJobMode = 'generate' | 'edit' | 'batch-generate' | 'batch-edit' | 'workflow-batch-edit';
export type FhlOutputFormat = 'jpg' | 'png';

export interface FhlJobRequest {
  mode: FhlJobMode;
  prompt?: string;
  prompts?: string[];
  fixedImages?: string[];
  itemImages?: string[];
  templates?: Array<{ key?: string; label?: string; prompt: string }>;
  preset?: '' | 'nail-tryon';
  quality?: '2K' | '4K';
  outputFormat?: FhlOutputFormat;
  aspect?: string;
  count?: number;
  repeat?: number;
  concurrency?: number;
  repairPasses?: number;
  limit?: number;
  adaptive?: boolean;
  resize?: boolean;
  dryRun?: boolean;
  historyContext?: GenerationHistoryContextLike;
}

export interface GenerationHistoryContextLike {
  canvasId?: string | null;
  sourceNodeId?: string;
  sourceNodeType?: string;
  nodeTitle?: string;
  prompt?: string;
}

export interface FhlTaskResult {
  id: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  itemIndex: number;
  templateIndex: number;
  templateKey: string;
  templateLabel: string;
  outputUrl: string;
  workerId: string;
  workerName: string;
  attempts: number;
  retries: number;
  width: number;
  height: number;
  error: string;
  errorClass: string;
}

export interface FhlJobSnapshot {
  id: string;
  mode: FhlJobMode;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled' | 'interrupted';
  createdAt: string;
  updatedAt: string;
  error: string;
  total: number;
  success: number;
  failed: number;
  cancelled: number;
  progress: number;
  tasks: FhlTaskResult[];
  outputUrls: string[];
  workerStats: Array<Record<string, any>>;
  artifactUrls: Record<string, string>;
  dryRun?: boolean;
}

// 画布列表项(后端返回)
export type CanvasSharePermission = 'view' | 'edit';

export interface CanvasShareEntry {
  userId: string;
  username: string;
  name: string;
  role: string;
  permission: CanvasSharePermission;
  sharedAt: number;
  sharedByUserId: string;
}

export interface CanvasAllUsersShare {
  enabled: boolean;
  permission: CanvasSharePermission;
  updatedAt: number;
  updatedByUserId: string;
}

export interface CanvasAccess {
  canView: boolean;
  canEdit: boolean;
  canManageSharing: boolean;
  isOwner: boolean;
  isShared: boolean;
  isAllUsersShared?: boolean;
  sharePermission?: CanvasSharePermission | null;
  allUsersPermission?: CanvasSharePermission | null;
}

export interface CanvasListItem {
  id: string;
  name: string;
  ownerUserId?: string | null;
  ownerName?: string;
  ownerRole?: string;
  sharedWith?: CanvasShareEntry[];
  allUsersShare?: CanvasAllUsersShare;
  access?: CanvasAccess;
  nodeCount: number;
  createdAt: number;
  updatedAt: number;
}

export type CreativeDeskFrameId =
  | 'none'
  | 'poster-card'
  | 'glass-card'
  | 'sticker'
  | 'polaroid'
  | 'comic-panel'
  | 'matte-gallery'
  | 'torn-paper'
  | 'kraft-tape'
  | 'washi-corners'
  | 'scrapbook-tabs'
  | 'linen-mat'
  | 'walnut-frame'
  | 'brass-gallery'
  | 'silver-bevel'
  | 'black-archive'
  | 'neon-tube'
  | 'holographic'
  | 'film-strip'
  | 'slide-mount'
  | 'contact-sheet'
  | 'blueprint'
  | 'manga-speed'
  | 'ink-brush'
  | 'dotted-stitch'
  | 'sewing-thread'
  | 'lace-paper'
  | 'ticket-stub'
  | 'stamp-postage'
  | 'label-maker'
  | 'memo-pin'
  | 'cork-board'
  | 'magnetic-board'
  | 'acrylic-block'
  | 'frosted-panel'
  | 'shadow-float'
  | 'soft-vignette'
  | 'double-line'
  | 'triple-rule'
  | 'corner-brackets'
  | 'ruler-grid'
  | 'studio-slate'
  | 'photo-booth'
  | 'album-sleeve'
  | 'arcade-marquee'
  | 'safety-stripe'
  | 'cosmic-rim'
  | 'aurora-glow'
  | 'sakura-washi'
  | 'ocean-glass'
  | 'sunset-ticket';

export type CreativeDeskFrameColorId =
  | 'cream'
  | 'white'
  | 'black'
  | 'rose'
  | 'amber'
  | 'mint'
  | 'cyan'
  | 'violet';

export interface CreativeDeskItem {
  id: string;
  kind: 'image';
  url: string;
  title?: string;
  resourceId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
  frameId: CreativeDeskFrameId | string;
  frameColorId?: CreativeDeskFrameColorId | string;
  zIndex: number;
  locked?: boolean;
  visible?: boolean;
  createdAt: number;
}

export interface CreativeDeskState {
  version: 1;
  coordinateMode?: 'viewport' | 'flow';
  defaultOpacity?: number;
  items: CreativeDeskItem[];
}

// 画布完整数据
export interface CanvasData {
  ownerUserId?: string | null;
  ownerName?: string;
  ownerRole?: string;
  sharedWith?: CanvasShareEntry[];
  allUsersShare?: CanvasAllUsersShare;
  access?: CanvasAccess;
  nodes: any[];
  edges: any[];
  viewport: { x: number; y: number; zoom: number };
  nextNodeSerialId?: number;
  creativeDesk?: CreativeDeskState;
}

// API Key 设置(对应后端 settings)
export interface ApiSettings {
  // 三套通用 Key
  zhenzhenApiKey: string;
  enableZhenzhenFallback?: boolean;
  zhenzhenBaseUrl: string; // 默认 https://ai.t8star.org，可在设置中调整
  rhApiKey: string;
  rhBaseUrl: string; // https://www.runninghub.cn
  llmApiKey: string;
  llmApiKeys?: LlmConfig[];
  llmConfigs?: LlmConfig[];
  llmBaseUrl: string;
  llmModel: string;
  // 分类 API Key（留空时 fallback 到 zhenzhenApiKey）
  gptImageApiKey?: string;
  nanoBananaApiKey?: string;
  mjApiKey?: string;
  veoApiKey?: string;
  soraApiKey?: string;
  grokApiKey?: string;
  seedanceApiKey?: string;
  sunoApiKey?: string;
  giteeMusicApiKey?: string;
  // v1.2.10.2: 全局生成素材自动保存到本地的路径(可用户自定义)
  fileSavePath?: string;
  // v1.3.1: 画布自动保存导出路径(实际写入 <path>/T8-penguin-canvas/canvases)
  canvasAutoSavePath?: string;
  // v1.3.4: 资源库路径(资源文件 + resource_library.json 元数据)
  resourceLibraryPath?: string;
  // v1.3.6: 自定义主题模板路径(主题 JSON 文件)
  themeTemplatePath?: string;
  // 本地 Eagle API 地址(默认 http://127.0.0.1:41595)
  eagleApiBase?: string;
  advancedProviders?: AdvancedProviderConfig[];
  fhlWorkers?: FhlWorkerSummary[];
  advancedProviderSummary?: AdvancedProviderSummary;
  cloudUploadTargets?: CloudUploadTargetConfig[];
  cloudUploadSummary?: CloudUploadSummary;
  outputStorageSpaces?: OutputStorageSpaceConfig[];
  activeOutputStorageSpaceId?: string;
  outputStorageSummary?: OutputStorageSummary;
  canvasNodeMenuPreferences?: CanvasNodeMenuPreferences;
  taskCompletionSound?: {
    mode?: 'default' | 'custom';
    name?: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
    updatedAt?: number;
    url?: string;
  };
  taskFailureSound?: {
    mode?: 'default' | 'custom';
    name?: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
    updatedAt?: number;
    url?: string;
  };
  preferences?: {
    theme?: 'dark' | 'light';
    language?: string;
  };
}
