// 三套 API Key 设置路由
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { requireAdmin } = require('../auth/middleware');
const {
  maskAdvancedProviders,
  normalizeAdvancedProviders,
  summarizeAdvancedProviders,
} = require('../providers/registry');
const { normalizeLlmBaseUrl, normalizeLlmModelName } = require('../utils/llmBaseUrl');
const {
  maskCloudUploadTargets,
  normalizeCloudUploadTargets,
  summarizeCloudUploadTargets,
} = require('../cloudUploads/settings');
const {
  maskOutputStorageSpaces,
  normalizeActiveOutputStorageSpaceId,
  normalizeOutputStorageSpaces,
  summarizeOutputStorageSpaces,
} = require('../outputStorage/settings');
const { maskWorkers: maskFhlWorkers, normalizeWorkers: normalizeFhlWorkers } = require('../providers/fhlImages');

const router = express.Router();

// 默认 settings 结构(三套通用 Key + 7 类分类 Key)
const DEFAULT_SETTINGS = {
  // 三套通用 Key
  zhenzhenApiKey: '',
  enableZhenzhenFallback: true,
  zhenzhenBaseUrl: config.ZHENZHEN_BASE_URL, // 固定 https://ai.t8star.org
  rhApiKey: '',
  rhBaseUrl: config.RH_BASE_URL,
  // v1.2.9.16: 取消 rhWalletApiKey —— RH 钱包应用节点与普通 RunningHub 节点统一使用 rhApiKey
  llmApiKey: '',
  llmBaseUrl: config.ZHENZHEN_BASE_URL, // 默认同百达工坊，可单独设置
  llmModel: config.LLM_DEFAULT_MODEL,
  // 分类 Key（留空时 fallback 到 zhenzhenApiKey）
  gptImageApiKey: '',
  nanoBananaApiKey: '',
  mjApiKey: '',
  veoApiKey: '',
  grokApiKey: '',
  seedanceApiKey: '',
  sunoApiKey: '',
  giteeMusicApiKey: '',
  // v1.2.10.2: 全局生成素材自动保存到本地的路径(可用户自定义)
  fileSavePath: config.DEFAULT_LOCAL_SAVE_DIR,
  // v1.3.1: 画布自动保存导出路径(实际写入 <path>/T8-penguin-canvas/canvases)
  canvasAutoSavePath: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
  // v1.3.4: 资源库路径(资源文件 + resource_library.json 元数据)
  resourceLibraryPath: config.DEFAULT_RESOURCE_LIBRARY_DIR,
  // v1.3.6: 自定义主题模板路径
  themeTemplatePath: config.DEFAULT_THEME_TEMPLATE_DIR,
  // 本地 Eagle API 地址，只用于“发送到 Eagle”功能。路由层仍会强制限制为本机地址。
  eagleApiBase: config.DEFAULT_EAGLE_API_BASE,
  // v1.8.0: 扩展 API 平台（高级可选）。默认只提供禁用的配置卡片，不影响主流程。
  advancedProviders: normalizeAdvancedProviders(),
  // FHL Images 独立 worker 池。Key 只保存在后端 settings，前端只接收脱敏摘要。
  fhlWorkers: [],
  // v1.9.x: 云端上传目标（可选）。默认禁用，不影响资源库/自动保存主流程。
  cloudUploadTargets: normalizeCloudUploadTargets(),
  outputStorageSpaces: normalizeOutputStorageSpaces(),
  activeOutputStorageSpaceId: 'primary',
  canvasNodeMenuPreferences: {
    quickAdd: {
      enabled: true,
      items: [
        'upload', 'model-3d-upload', 'model-3d-preview', 'material-set', 'output',
        'text', 'image', 'video', 'seedance', 'director-storyboard', 'audio', 'llm', 'interactive-game-script',
      ].map((type, order) => ({ type, visible: true, order })),
    },
    connectFromInput: { enabled: true, items: [] },
    connectToOutput: { enabled: true, items: [] },
  },
  taskCompletionSound: { mode: 'default', url: '' },
  taskFailureSound: { mode: 'default', url: '' },
  // 其他偏好
  preferences: {
    theme: 'dark',
    language: 'zh-CN',
  },
};

const CURRENT_DEFAULT_PATHS = {
  fileSavePath: config.DEFAULT_LOCAL_SAVE_DIR,
  canvasAutoSavePath: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
  resourceLibraryPath: config.DEFAULT_RESOURCE_LIBRARY_DIR,
  themeTemplatePath: config.DEFAULT_THEME_TEMPLATE_DIR,
};

const LEGACY_DEFAULT_PATHS = {
  fileSavePath: config.LEGACY_WINDOWS_DEFAULT_ROOT,
  canvasAutoSavePath: config.LEGACY_WINDOWS_DEFAULT_ROOT,
  resourceLibraryPath: `${config.LEGACY_WINDOWS_DEFAULT_ROOT}\\resources`,
  themeTemplatePath: `${config.LEGACY_WINDOWS_DEFAULT_ROOT}\\theme-templates`,
};

// 分类 key 字段列表（供 GET 脱敏与 POST 合并使用）
const CLASSIFIED_KEY_FIELDS = [
  'gptImageApiKey', 'nanoBananaApiKey', 'mjApiKey', 'veoApiKey',
  'grokApiKey', 'seedanceApiKey', 'sunoApiKey',
  'giteeMusicApiKey',
];

const DEFAULT_TASK_COMPLETION_SOUND = { mode: 'default', url: '' };
const DEFAULT_TASK_FAILURE_SOUND = { mode: 'default', url: '' };
const TASK_COMPLETION_SOUND_MAX_SIZE = 10 * 1024 * 1024;
const TASK_COMPLETION_SOUND_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm']);
const TASK_COMPLETION_SOUND_MIME_EXTENSIONS = new Map([
  ['audio/mpeg', '.mp3'],
  ['audio/mp3', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/ogg', '.ogg'],
  ['audio/mp4', '.m4a'],
  ['audio/aac', '.aac'],
  ['audio/flac', '.flac'],
  ['audio/webm', '.webm'],
]);
const taskCompletionSoundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TASK_COMPLETION_SOUND_MAX_SIZE, files: 1 },
});

const DEFAULT_CANVAS_NODE_MENU_PREFERENCES = {
  quickAdd: {
    enabled: true,
    items: [
      'upload', 'model-3d-upload', 'model-3d-preview', 'material-set', 'output',
      'text', 'image', 'video', 'seedance', 'director-storyboard', 'audio', 'llm', 'interactive-game-script',
    ].map((type, order) => ({ type, visible: true, order })),
  },
  connectFromInput: { enabled: true, items: [] },
  connectToOutput: { enabled: true, items: [] },
};

function normalizeCanvasNodeMenuPreferences(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const scenes = ['quickAdd', 'connectFromInput', 'connectToOutput'];
  return scenes.reduce((acc, scene) => {
    const defaults = DEFAULT_CANVAS_NODE_MENU_PREFERENCES[scene] || { enabled: true, items: [] };
    const rawScene = source[scene] && typeof source[scene] === 'object' && !Array.isArray(source[scene])
      ? source[scene]
      : {};
    const items = Array.isArray(rawScene.items) ? rawScene.items : defaults.items;
    acc[scene] = {
      enabled: rawScene.enabled !== false,
      items: items
        .filter((item) => item && typeof item === 'object' && String(item.type || '').trim())
        .map((item, index) => ({
          type: String(item.type || '').trim().slice(0, 80),
          visible: item.visible !== false,
          order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        }))
        .sort((a, b) => a.order - b.order)
        .map((item, order) => ({ ...item, order })),
    };
    return acc;
  }, {});
}

function taskCompletionSoundDir() {
  const dir = path.join(config.DATA_DIR, 'settings-assets');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function taskCompletionSoundPath(fileName) {
  const safeName = path.basename(String(fileName || ''));
  if (!safeName) return '';
  const dir = taskCompletionSoundDir();
  const target = path.resolve(dir, safeName);
  const root = path.resolve(dir) + path.sep;
  return target.startsWith(root) ? target : '';
}

function taskCompletionSoundUrl(updatedAt) {
  const version = Number(updatedAt) || Date.now();
  return `/api/settings/task-completion-sound/file?v=${version}`;
}

function taskFailureSoundUrl(updatedAt) {
  const version = Number(updatedAt) || Date.now();
  return `/api/settings/task-failure-sound/file?v=${version}`;
}

function normalizeTaskCompletionSound(value) {
  if (!value || value.mode !== 'custom') return { ...DEFAULT_TASK_COMPLETION_SOUND };
  const fileName = path.basename(String(value.fileName || ''));
  const filePath = taskCompletionSoundPath(fileName);
  if (!fileName || !filePath || !fs.existsSync(filePath)) return { ...DEFAULT_TASK_COMPLETION_SOUND };
  const updatedAt = Number(value.updatedAt) || Date.now();
  return {
    mode: 'custom',
    name: String(value.name || fileName).slice(0, 180),
    fileName,
    mimeType: String(value.mimeType || 'audio/mpeg').slice(0, 120),
    size: Number(value.size) || fs.statSync(filePath).size,
    updatedAt,
    url: taskCompletionSoundUrl(updatedAt),
  };
}

function normalizeTaskFailureSound(value) {
  if (!value || value.mode !== 'custom') return { ...DEFAULT_TASK_FAILURE_SOUND };
  const fileName = path.basename(String(value.fileName || ''));
  const filePath = taskCompletionSoundPath(fileName);
  if (!fileName || !filePath || !fs.existsSync(filePath)) return { ...DEFAULT_TASK_FAILURE_SOUND };
  const updatedAt = Number(value.updatedAt) || Date.now();
  return {
    mode: 'custom',
    name: String(value.name || fileName).slice(0, 180),
    fileName,
    mimeType: String(value.mimeType || 'audio/mpeg').slice(0, 120),
    size: Number(value.size) || fs.statSync(filePath).size,
    updatedAt,
    url: taskFailureSoundUrl(updatedAt),
  };
}

function resolveTaskCompletionSoundExtension(file) {
  const originalExt = path.extname(file?.originalname || '').toLowerCase();
  if (TASK_COMPLETION_SOUND_EXTENSIONS.has(originalExt)) return originalExt;
  return TASK_COMPLETION_SOUND_MIME_EXTENSIONS.get(String(file?.mimetype || '').toLowerCase()) || '';
}

function cleanTaskCompletionSoundName(name) {
  const base = path.basename(String(name || 'task-completion-sound'));
  return base.slice(0, 180) || 'task-completion-sound';
}

function sendTaskCompletionSoundUploadError(res, err) {
  if (err instanceof multer.MulterError) {
    const error = err.code === 'LIMIT_FILE_SIZE'
      ? '提示音不能超过 10MB'
      : (err.message || '提示音上传失败');
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, error, code: err.code });
  }
  return res.status(500).json({ success: false, error: err?.message || '提示音上传失败' });
}

function normalizePathForCompare(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/]+$/, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function migrateLegacyDefaultPaths(settings) {
  let changed = false;
  const next = { ...settings };
  for (const field of Object.keys(CURRENT_DEFAULT_PATHS)) {
    const current = String(next[field] || '').trim();
    if (!current) continue;
    if (normalizePathForCompare(current) === normalizePathForCompare(LEGACY_DEFAULT_PATHS[field])) {
      next[field] = CURRENT_DEFAULT_PATHS[field];
      changed = true;
    }
  }
  return { settings: next, changed };
}

function maskKey(k) {
  return k ? '****' + String(k).slice(-4) : '';
}

function cleanLlmKeyId(value, fallback = 'llm-key') {
  const raw = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return raw || `${fallback}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeZhenzhenBaseUrl(value) {
  return normalizeLlmBaseUrl(value, config.ZHENZHEN_BASE_URL);
}

function normalizeLlmConfigs(raw, current = [], legacy = {}) {
  const currentItems = Array.isArray(current) ? current : [];
  const currentById = new Map(currentItems.map((item) => [String(item?.id || ''), item]));
  const source = Array.isArray(raw) ? raw : [];
  const used = new Set();
  const items = [];
  for (let index = 0; index < source.length; index += 1) {
    const entry = source[index] || {};
    let id = cleanLlmKeyId(entry.id, `llm-${index + 1}`);
    while (used.has(id)) id = cleanLlmKeyId(`${id}-${items.length + 1}`);
    used.add(id);
    const label = String(entry.label || '').trim().slice(0, 60) || `LLM Key ${index + 1}`;
    const previous = currentById.get(id);
    const incomingKey = typeof entry.apiKey === 'string' ? entry.apiKey.trim() : '';
    const previousKey = previous?.apiKey || (id === 'default' ? legacy.apiKey : '');
    const apiKey = !incomingKey || /^\*{2,}/.test(incomingKey) ? previousKey : incomingKey;
    const baseUrl = normalizeLlmBaseUrl(entry.baseUrl ?? previous?.baseUrl ?? legacy.baseUrl, config.ZHENZHEN_BASE_URL);
    const model = normalizeLlmModelName(entry.model ?? previous?.model ?? legacy.model, config.LLM_DEFAULT_MODEL);
    if (!baseUrl || !model) continue;
    items.push({
      id,
      label,
      apiKey,
      baseUrl,
      model,
      isDefault: entry.isDefault === true,
    });
  }
  if (items.length === 0 && (legacy.apiKey || legacy.baseUrl || legacy.model)) {
    items.push({
      id: 'default',
      label: '默认 LLM',
      apiKey: legacy.apiKey || '',
      baseUrl: normalizeLlmBaseUrl(legacy.baseUrl, config.ZHENZHEN_BASE_URL) || config.ZHENZHEN_BASE_URL,
      model: normalizeLlmModelName(legacy.model, config.LLM_DEFAULT_MODEL) || config.LLM_DEFAULT_MODEL,
      isDefault: true,
    });
  }
  if (items.length > 0 && !items.some((item) => item.isDefault)) {
    items[0].isDefault = true;
  }
  if (items.filter((item) => item.isDefault).length > 1) {
    let seenDefault = false;
    items.forEach((item) => {
      if (!item.isDefault) return;
      if (seenDefault) item.isDefault = false;
      seenDefault = true;
    });
  }
  return items;
}

function maskLlmConfigs(configs) {
  return normalizeLlmConfigs(configs).map((item) => ({
    ...item,
    apiKey: maskKey(item.apiKey),
    hasApiKey: !!item.apiKey,
  }));
}

function syncLegacyLlmConfig(settings) {
  const legacy = {
    apiKey: settings.llmApiKey,
    baseUrl: settings.llmBaseUrl,
    model: settings.llmModel,
  };
  const sourceConfigs = Array.isArray(settings.llmConfigs) ? settings.llmConfigs : settings.llmApiKeys;
  const configs = normalizeLlmConfigs(sourceConfigs, settings.llmConfigs || settings.llmApiKeys, legacy);
  const defaultItem = configs.find((item) => item.isDefault) || configs[0] || null;
  return {
    ...settings,
    llmConfigs: configs,
    llmApiKeys: configs,
    llmApiKey: defaultItem?.apiKey || settings.llmApiKey || '',
    llmBaseUrl: defaultItem?.baseUrl || settings.llmBaseUrl || config.ZHENZHEN_BASE_URL,
    llmModel: defaultItem?.model || settings.llmModel || config.LLM_DEFAULT_MODEL,
  };
}

function loadSettings({ persistMigrations = true } = {}) {
  if (!fs.existsSync(config.SETTINGS_FILE)) {
    const defaults = { ...DEFAULT_SETTINGS };
    defaults.outputStorageSpaces = normalizeOutputStorageSpaces(defaults.outputStorageSpaces, defaults.outputStorageSpaces, defaults.cloudUploadTargets);
    return defaults;
  }
  try {
    const data = JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf-8'));
    const legacyGiteeFluxProvider = (Array.isArray(data.advancedProviders) ? data.advancedProviders : [])
      .find((provider) => provider?.id === 'gitee-flux' || provider?.protocol === 'gitee-flux');
    const migratedGiteeMusicApiKey = !String(data.giteeMusicApiKey || '').trim()
      ? String(legacyGiteeFluxProvider?.apiKey || '').trim()
      : '';
    // 强制 base URL 与配置一致(防篡改)
    const merged = {
      ...DEFAULT_SETTINGS,
      ...data,
      giteeMusicApiKey: String(data.giteeMusicApiKey || migratedGiteeMusicApiKey || '').trim(),
      zhenzhenBaseUrl: normalizeZhenzhenBaseUrl(data.zhenzhenBaseUrl) || config.ZHENZHEN_BASE_URL,
      llmBaseUrl: normalizeLlmBaseUrl(data.llmBaseUrl, config.ZHENZHEN_BASE_URL) || config.ZHENZHEN_BASE_URL,
      llmModel: normalizeLlmModelName(data.llmModel, config.LLM_DEFAULT_MODEL) || config.LLM_DEFAULT_MODEL,
    };
    Object.assign(merged, syncLegacyLlmConfig(merged));
    merged.advancedProviders = normalizeAdvancedProviders(data.advancedProviders);
    merged.fhlWorkers = normalizeFhlWorkers(data.fhlWorkers);
    merged.cloudUploadTargets = normalizeCloudUploadTargets(data.cloudUploadTargets);
    merged.outputStorageSpaces = normalizeOutputStorageSpaces(data.outputStorageSpaces, data.outputStorageSpaces, merged.cloudUploadTargets);
    merged.activeOutputStorageSpaceId = normalizeActiveOutputStorageSpaceId(
      data.activeOutputStorageSpaceId,
      merged.outputStorageSpaces,
    );
    merged.canvasNodeMenuPreferences = normalizeCanvasNodeMenuPreferences(data.canvasNodeMenuPreferences);
    merged.taskCompletionSound = normalizeTaskCompletionSound(data.taskCompletionSound);
    merged.taskFailureSound = normalizeTaskFailureSound(data.taskFailureSound);
    const migrated = migrateLegacyDefaultPaths(merged);
    const removedLegacyGiteeFlux = !!legacyGiteeFluxProvider;
    if (persistMigrations && (migrated.changed || removedLegacyGiteeFlux || !!migratedGiteeMusicApiKey)) {
      saveSettings(migrated.settings);
    }
    return migrated.settings;
  } catch {
    const defaults = { ...DEFAULT_SETTINGS };
    defaults.outputStorageSpaces = normalizeOutputStorageSpaces(defaults.outputStorageSpaces, defaults.outputStorageSpaces, defaults.cloudUploadTargets);
    return defaults;
  }
}

function saveSettings(settings) {
  fs.writeFileSync(config.SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// v1.2.10.2/v1.3.1: 启动时确保本地保存路径存在(不存在则 mkdir -p)
function ensureLocalSavePaths() {
  try {
    const s = loadSettings();
    const paths = [
      { label: '文件自动保存路径', value: s.fileSavePath || config.DEFAULT_LOCAL_SAVE_DIR || '' },
      { label: '画布自动保存路径', value: s.canvasAutoSavePath || config.DEFAULT_CANVAS_AUTO_SAVE_DIR || '' },
      { label: '资源库路径', value: s.resourceLibraryPath || config.DEFAULT_RESOURCE_LIBRARY_DIR || '' },
      { label: '主题模板路径', value: s.themeTemplatePath || config.DEFAULT_THEME_TEMPLATE_DIR || '' },
    ];
    for (const item of paths) {
      const p = String(item.value || '').trim();
      if (!p) continue;
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
        console.log(`[settings] 创建${item.label}: ${p}`);
      }
    }
  } catch (e) {
    console.warn('[settings] 创建本地保存路径失败(忽略):', e?.message || e);
  }
}
ensureLocalSavePaths();

// GET /api/settings — 获取全部设置(脱敏 Key 仅返回最后4位)
router.get('/', (_req, res) => {
  const settings = loadSettings();
  const masked = {
    ...settings,
    zhenzhenApiKey: maskKey(settings.zhenzhenApiKey),
    rhApiKey: maskKey(settings.rhApiKey),
    llmApiKey: maskKey(settings.llmApiKey),
    llmConfigs: maskLlmConfigs(settings.llmConfigs),
    llmApiKeys: maskLlmConfigs(settings.llmConfigs),
    advancedProviders: maskAdvancedProviders(settings.advancedProviders),
    fhlWorkers: maskFhlWorkers(settings.fhlWorkers),
    advancedProviderSummary: summarizeAdvancedProviders(settings.advancedProviders),
    cloudUploadTargets: maskCloudUploadTargets(settings.cloudUploadTargets),
    cloudUploadSummary: summarizeCloudUploadTargets(settings.cloudUploadTargets),
    outputStorageSpaces: maskOutputStorageSpaces(settings.outputStorageSpaces),
    outputStorageSummary: summarizeOutputStorageSpaces(
      settings.outputStorageSpaces,
      settings.activeOutputStorageSpaceId,
    ),
  };
  for (const f of CLASSIFIED_KEY_FIELDS) {
    masked[f] = maskKey(settings[f]);
  }
  res.json({ success: true, data: masked });
});

router.get('/task-completion-sound', (_req, res) => {
  const settings = loadSettings();
  res.json({ success: true, data: normalizeTaskCompletionSound(settings.taskCompletionSound) });
});

router.get('/task-failure-sound', (_req, res) => {
  const settings = loadSettings();
  res.json({ success: true, data: normalizeTaskFailureSound(settings.taskFailureSound) });
});

router.get('/task-completion-sound/file', (_req, res) => {
  const settings = loadSettings();
  const sound = normalizeTaskCompletionSound(settings.taskCompletionSound);
  const filePath = taskCompletionSoundPath(sound.fileName);
  if (sound.mode !== 'custom' || !filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '提示音文件不存在' });
  }
  res.setHeader('Content-Type', sound.mimeType || 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(filePath);
});

router.get('/task-failure-sound/file', (_req, res) => {
  const settings = loadSettings();
  const sound = normalizeTaskFailureSound(settings.taskFailureSound);
  const filePath = taskCompletionSoundPath(sound.fileName);
  if (sound.mode !== 'custom' || !filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Sound file does not exist' });
  }
  res.setHeader('Content-Type', sound.mimeType || 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(filePath);
});

router.post('/task-completion-sound', requireAdmin, (req, res) => {
  taskCompletionSoundUpload.single('audio')(req, res, (uploadError) => {
    if (uploadError) return sendTaskCompletionSoundUploadError(res, uploadError);
    if (!req.file) return res.status(400).json({ success: false, error: '未收到提示音文件' });
    const ext = resolveTaskCompletionSoundExtension(req.file);
    if (!ext || !String(req.file.mimetype || '').toLowerCase().startsWith('audio/')) {
      return res.status(400).json({ success: false, error: '请选择音频文件' });
    }
    try {
      const current = loadSettings();
      const previous = normalizeTaskCompletionSound(current.taskCompletionSound);
      const fileName = `task-completion-sound${ext}`;
      const target = taskCompletionSoundPath(fileName);
      fs.writeFileSync(target, req.file.buffer);
      if (previous.fileName && previous.fileName !== fileName) {
        const previousPath = taskCompletionSoundPath(previous.fileName);
        if (previousPath && fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
      }
      const updatedAt = Date.now();
      const nextSound = {
        mode: 'custom',
        name: cleanTaskCompletionSoundName(req.file.originalname),
        fileName,
        mimeType: req.file.mimetype || 'audio/mpeg',
        size: req.file.size,
        updatedAt,
        url: taskCompletionSoundUrl(updatedAt),
      };
      saveSettings({ ...current, taskCompletionSound: nextSound });
      return res.json({ success: true, data: nextSound });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || '提示音上传失败' });
    }
  });
});

router.post('/task-failure-sound', requireAdmin, (req, res) => {
  taskCompletionSoundUpload.single('audio')(req, res, (uploadError) => {
    if (uploadError) return sendTaskCompletionSoundUploadError(res, uploadError);
    if (!req.file) return res.status(400).json({ success: false, error: 'Audio file is required' });
    const ext = resolveTaskCompletionSoundExtension(req.file);
    if (!ext || !String(req.file.mimetype || '').toLowerCase().startsWith('audio/')) {
      return res.status(400).json({ success: false, error: 'Please choose an audio file' });
    }
    try {
      const current = loadSettings();
      const previous = normalizeTaskFailureSound(current.taskFailureSound);
      const fileName = `task-failure-sound${ext}`;
      const target = taskCompletionSoundPath(fileName);
      fs.writeFileSync(target, req.file.buffer);
      if (previous.fileName && previous.fileName !== fileName) {
        const previousPath = taskCompletionSoundPath(previous.fileName);
        if (previousPath && fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
      }
      const updatedAt = Date.now();
      const nextSound = {
        mode: 'custom',
        name: cleanTaskCompletionSoundName(req.file.originalname),
        fileName,
        mimeType: req.file.mimetype || 'audio/mpeg',
        size: req.file.size,
        updatedAt,
        url: taskFailureSoundUrl(updatedAt),
      };
      saveSettings({ ...current, taskFailureSound: nextSound });
      return res.json({ success: true, data: nextSound });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Failed to upload sound' });
    }
  });
});

router.delete('/task-completion-sound', requireAdmin, (_req, res) => {
  try {
    const current = loadSettings();
    const previous = normalizeTaskCompletionSound(current.taskCompletionSound);
    if (previous.fileName) {
      const previousPath = taskCompletionSoundPath(previous.fileName);
      if (previousPath && fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
    }
    saveSettings({ ...current, taskCompletionSound: { ...DEFAULT_TASK_COMPLETION_SOUND } });
    res.json({ success: true, data: { ...DEFAULT_TASK_COMPLETION_SOUND } });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || '提示音重置失败' });
  }
});

router.delete('/task-failure-sound', requireAdmin, (_req, res) => {
  try {
    const current = loadSettings();
    const previous = normalizeTaskFailureSound(current.taskFailureSound);
    if (previous.fileName) {
      const previousPath = taskCompletionSoundPath(previous.fileName);
      if (previousPath && fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
    }
    saveSettings({ ...current, taskFailureSound: { ...DEFAULT_TASK_FAILURE_SOUND } });
    res.json({ success: true, data: { ...DEFAULT_TASK_FAILURE_SOUND } });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to reset sound' });
  }
});

// GET /api/settings/raw — 内部接口,获取明文(供 Phase 4 代理调用使用)
router.get('/raw', requireAdmin, (_req, res) => {
  res.json({ success: true, data: loadSettings() });
});

// POST /api/settings — 更新设置
router.post('/', requireAdmin, (req, res) => {
  const current = loadSettings();
  const incoming = req.body || {};
  const hasAdvancedProviders = Object.prototype.hasOwnProperty.call(incoming, 'advancedProviders');
  const hasFhlWorkers = Object.prototype.hasOwnProperty.call(incoming, 'fhlWorkers');
  const hasCloudUploadTargets = Object.prototype.hasOwnProperty.call(incoming, 'cloudUploadTargets');
  const hasOutputStorageSpaces = Object.prototype.hasOwnProperty.call(incoming, 'outputStorageSpaces');
  const hasActiveOutputStorageSpaceId = Object.prototype.hasOwnProperty.call(incoming, 'activeOutputStorageSpaceId');
  const hasCanvasNodeMenuPreferences = Object.prototype.hasOwnProperty.call(incoming, 'canvasNodeMenuPreferences');
  const hasLlmConfigs = Object.prototype.hasOwnProperty.call(incoming, 'llmConfigs');
  const hasLlmApiKeys = Object.prototype.hasOwnProperty.call(incoming, 'llmApiKeys');
  const hasZhenzhenBaseUrl = Object.prototype.hasOwnProperty.call(incoming, 'zhenzhenBaseUrl');
  const zhenzhenBaseUrl = hasZhenzhenBaseUrl
    ? normalizeZhenzhenBaseUrl(incoming.zhenzhenBaseUrl)
    : normalizeZhenzhenBaseUrl(current.zhenzhenBaseUrl);
  if (!zhenzhenBaseUrl) {
    return res.status(400).json({ success: false, error: '百达工坊 Base URL 必须是有效的 http/https 地址' });
  }
  const hasLlmBaseUrl = Object.prototype.hasOwnProperty.call(incoming, 'llmBaseUrl');
  const llmBaseUrl = hasLlmBaseUrl
    ? normalizeLlmBaseUrl(incoming.llmBaseUrl, config.ZHENZHEN_BASE_URL)
    : normalizeLlmBaseUrl(current.llmBaseUrl, config.ZHENZHEN_BASE_URL);
  if (!llmBaseUrl) {
    return res.status(400).json({ success: false, error: 'LLM Base URL 必须是有效的 http/https 地址' });
  }
  const hasLlmModel = Object.prototype.hasOwnProperty.call(incoming, 'llmModel');
  const llmModel = hasLlmModel
    ? normalizeLlmModelName(incoming.llmModel, config.LLM_DEFAULT_MODEL)
    : normalizeLlmModelName(current.llmModel, config.LLM_DEFAULT_MODEL);
  if (!llmModel) {
    return res.status(400).json({ success: false, error: 'LLM 模型名称格式不正确' });
  }
  const merged = {
    ...current,
    ...incoming,
    // 百达工坊地址可配置；LLM 地址仍允许单独配置。
    zhenzhenBaseUrl,
    llmBaseUrl,
    llmModel,
  };
  if (hasLlmConfigs || hasLlmApiKeys) {
    merged.llmConfigs = normalizeLlmConfigs(
      hasLlmConfigs ? incoming.llmConfigs : incoming.llmApiKeys,
      current.llmConfigs || current.llmApiKeys,
      { apiKey: current.llmApiKey, baseUrl: current.llmBaseUrl, model: current.llmModel },
    );
  } else if (Object.prototype.hasOwnProperty.call(incoming, 'llmApiKey') && String(incoming.llmApiKey || '').trim()) {
    merged.llmConfigs = normalizeLlmConfigs(
      current.llmConfigs?.length ? current.llmConfigs : [{ id: 'default', label: '默认 LLM', isDefault: true }],
      current.llmConfigs,
      { apiKey: String(incoming.llmApiKey || '').trim(), baseUrl: llmBaseUrl, model: llmModel },
    ).map((item, index) => (
      item.isDefault || index === 0
        ? { ...item, apiKey: String(incoming.llmApiKey || '').trim(), isDefault: true }
        : { ...item, isDefault: false }
    ));
  } else {
    merged.llmConfigs = normalizeLlmConfigs(
      current.llmConfigs || current.llmApiKeys,
      current.llmConfigs || current.llmApiKeys,
      { apiKey: current.llmApiKey, baseUrl: current.llmBaseUrl, model: current.llmModel },
    );
  }
  Object.assign(merged, syncLegacyLlmConfig(merged));
  merged.advancedProviders = hasAdvancedProviders
    ? normalizeAdvancedProviders(incoming.advancedProviders, current.advancedProviders)
    : normalizeAdvancedProviders(current.advancedProviders);
  merged.fhlWorkers = hasFhlWorkers
    ? normalizeFhlWorkers(incoming.fhlWorkers, current.fhlWorkers)
    : normalizeFhlWorkers(current.fhlWorkers);
  merged.cloudUploadTargets = hasCloudUploadTargets
    ? normalizeCloudUploadTargets(incoming.cloudUploadTargets, current.cloudUploadTargets)
    : normalizeCloudUploadTargets(current.cloudUploadTargets);
  merged.outputStorageSpaces = hasOutputStorageSpaces
    ? normalizeOutputStorageSpaces(incoming.outputStorageSpaces, current.outputStorageSpaces, merged.cloudUploadTargets)
    : normalizeOutputStorageSpaces(current.outputStorageSpaces, current.outputStorageSpaces, merged.cloudUploadTargets);
  merged.activeOutputStorageSpaceId = normalizeActiveOutputStorageSpaceId(
    hasActiveOutputStorageSpaceId ? incoming.activeOutputStorageSpaceId : current.activeOutputStorageSpaceId,
    merged.outputStorageSpaces,
  );
  merged.canvasNodeMenuPreferences = hasCanvasNodeMenuPreferences
    ? normalizeCanvasNodeMenuPreferences(incoming.canvasNodeMenuPreferences)
    : normalizeCanvasNodeMenuPreferences(current.canvasNodeMenuPreferences);
  saveSettings(merged);
  // v1.2.10.2/v1.3.1/v1.3.4: 保存后重新确保本地保存路径存在
  for (const field of ['fileSavePath', 'canvasAutoSavePath', 'resourceLibraryPath', 'themeTemplatePath']) {
    if (typeof incoming[field] !== 'string' || !incoming[field].trim()) continue;
    try {
      const p = incoming[field].trim();
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
        console.log(`[settings] 创建${field}: ${p}`);
      }
    } catch (e) {
      console.warn(`[settings] mkdir ${field} 失败:`, e?.message || e);
    }
  }
  res.json({ success: true });
});

// =====================
// RH 工具节点 - 分类 API（v1.2.10+，与 RH 应用创意包数据完全分开）
// =====================

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}
function saveJson(file, data) {
  try {
    const dir = require('path').dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
function cleanId(value, prefix) {
  const raw = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
  return raw || genId(prefix);
}
function normalizeRhToolsBackup(raw) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const rawCategories = Array.isArray(payload.categories) ? payload.categories : [];
  const rawTools = Array.isArray(payload.tools) ? payload.tools : [];

  const usedCatIds = new Set();
  const categories = rawCategories
    .map((c, idx) => {
      const name = String(c?.name || '').trim();
      if (!name) return null;
      let id = cleanId(c?.id, 'rhcat');
      while (usedCatIds.has(id)) id = genId('rhcat');
      usedCatIds.add(id);
      return {
        id,
        name: name.slice(0, 80),
        order: Number.isFinite(Number(c?.order)) ? Number(c.order) : idx,
        createdAt: Number(c?.createdAt) || Date.now(),
      };
    })
    .filter(Boolean);

  const categoryIds = new Set(categories.map((c) => c.id));
  const usedToolIds = new Set();
  const tools = rawTools
    .map((t, idx) => {
      const webappId = String(t?.webappId || '').trim();
      const title = String(t?.title || '').trim();
      if (!webappId || !title) return null;
      let id = cleanId(t?.id, 'rhtool');
      while (usedToolIds.has(id)) id = genId('rhtool');
      usedToolIds.add(id);
      const categoryId = String(t?.categoryId || '').trim();
      return {
        id,
        webappId: webappId.slice(0, 120),
        title: title.slice(0, 120),
        description: typeof t?.description === 'string' ? t.description.slice(0, 2000) : '',
        categoryId: categoryIds.has(categoryId) ? categoryId : '',
        coverUrl: typeof t?.coverUrl === 'string' ? t.coverUrl.slice(0, 2000) : '',
        order: Number.isFinite(Number(t?.order)) ? Number(t.order) : idx,
        addedAt: Number(t?.addedAt) || Date.now(),
      };
    })
    .filter(Boolean);

  categories.sort((a, b) => (a.order || 0) - (b.order || 0));
  tools.sort((a, b) => (a.order || 0) - (b.order || 0));
  categories.forEach((c, idx) => { c.order = idx; });
  tools.forEach((t, idx) => { t.order = idx; });
  return { categories, tools };
}

// 获取分类列表
router.get('/rh-tool-categories', (_req, res) => {
  const list = loadJson(config.RH_TOOL_CATEGORIES_FILE, []);
  list.sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({ success: true, data: list });
});

// 新增分类
router.post('/rh-tool-categories', (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.json({ success: false, error: '分类名不能为空' });
  }
  const list = loadJson(config.RH_TOOL_CATEGORIES_FILE, []);
  if (list.find((c) => c.name === String(name).trim())) {
    return res.json({ success: false, error: '分类名已存在' });
  }
  const newCat = {
    id: genId('rhcat'),
    name: String(name).trim(),
    order: list.length,
    createdAt: Date.now(),
  };
  list.push(newCat);
  saveJson(config.RH_TOOL_CATEGORIES_FILE, list);
  res.json({ success: true, data: newCat });
});

// 重命名分类
router.put('/rh-tool-categories/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.json({ success: false, error: '分类名不能为空' });
  }
  const list = loadJson(config.RH_TOOL_CATEGORIES_FILE, []);
  const target = list.find((c) => c.id === id);
  if (!target) return res.json({ success: false, error: '分类不存在' });
  if (list.find((c) => c.id !== id && c.name === String(name).trim())) {
    return res.json({ success: false, error: '分类名已存在' });
  }
  target.name = String(name).trim();
  saveJson(config.RH_TOOL_CATEGORIES_FILE, list);
  res.json({ success: true, data: target });
});

// 删除分类（其下应用 categoryId 重置为空）
router.delete('/rh-tool-categories/:id', (req, res) => {
  const { id } = req.params;
  let list = loadJson(config.RH_TOOL_CATEGORIES_FILE, []);
  const len = list.length;
  list = list.filter((c) => c.id !== id);
  if (list.length === len) {
    return res.json({ success: false, error: '分类不存在' });
  }
  saveJson(config.RH_TOOL_CATEGORIES_FILE, list);
  const apps = loadJson(config.RH_TOOL_APPS_FILE, []);
  let changed = false;
  apps.forEach((a) => {
    if (a.categoryId === id) {
      a.categoryId = '';
      changed = true;
    }
  });
  if (changed) saveJson(config.RH_TOOL_APPS_FILE, apps);
  res.json({ success: true });
});

// 分类排序
router.post('/rh-tool-categories/reorder', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.json({ success: false, error: '参数错误' });
  const list = loadJson(config.RH_TOOL_CATEGORIES_FILE, []);
  const map = new Map(list.map((c) => [c.id, c]));
  const reordered = [];
  ids.forEach((id, idx) => {
    const c = map.get(id);
    if (c) {
      c.order = idx;
      reordered.push(c);
      map.delete(id);
    }
  });
  for (const c of map.values()) {
    c.order = reordered.length;
    reordered.push(c);
  }
  saveJson(config.RH_TOOL_CATEGORIES_FILE, reordered);
  res.json({ success: true, data: reordered });
});

// =====================
// RH 工具节点 - 应用 API
// =====================

// 获取应用列表
router.get('/rh-tool-apps', (_req, res) => {
  const list = loadJson(config.RH_TOOL_APPS_FILE, []);
  list.sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({ success: true, data: list });
});

// 新增应用
router.post('/rh-tool-apps', (req, res) => {
  const { webappId, title, description, categoryId, coverUrl } = req.body || {};
  if (!webappId || !title) {
    return res.json({ success: false, error: '缺少必要参数 (webappId / title)' });
  }
  const list = loadJson(config.RH_TOOL_APPS_FILE, []);
  const newApp = {
    id: genId('rhtool'),
    webappId: String(webappId).trim(),
    title: String(title).trim(),
    description: description ? String(description) : '',
    categoryId: categoryId || '',
    coverUrl: coverUrl || '',
    order: list.length,
    addedAt: Date.now(),
  };
  list.push(newApp);
  saveJson(config.RH_TOOL_APPS_FILE, list);
  res.json({ success: true, data: newApp });
});

// 更新应用
router.put('/rh-tool-apps/:id', (req, res) => {
  const { id } = req.params;
  const list = loadJson(config.RH_TOOL_APPS_FILE, []);
  const app = list.find((a) => a.id === id);
  if (!app) return res.json({ success: false, error: '应用不存在' });
  const { webappId, title, description, categoryId, coverUrl } = req.body || {};
  if (typeof webappId === 'string' && webappId.trim()) app.webappId = webappId.trim();
  if (typeof title === 'string' && title.trim()) app.title = title.trim();
  if (typeof description === 'string') app.description = description;
  if (typeof categoryId === 'string') app.categoryId = categoryId;
  if (typeof coverUrl === 'string') app.coverUrl = coverUrl;
  saveJson(config.RH_TOOL_APPS_FILE, list);
  res.json({ success: true, data: app });
});

// 删除应用
router.delete('/rh-tool-apps/:id', (req, res) => {
  const { id } = req.params;
  let list = loadJson(config.RH_TOOL_APPS_FILE, []);
  const len = list.length;
  list = list.filter((a) => a.id !== id);
  if (list.length === len) return res.json({ success: false, error: '应用不存在' });
  saveJson(config.RH_TOOL_APPS_FILE, list);
  res.json({ success: true });
});

// 应用排序
router.post('/rh-tool-apps/reorder', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.json({ success: false, error: '参数错误' });
  const list = loadJson(config.RH_TOOL_APPS_FILE, []);
  const map = new Map(list.map((a) => [a.id, a]));
  const reordered = [];
  ids.forEach((id, idx) => {
    const a = map.get(id);
    if (a) {
      a.order = idx;
      reordered.push(a);
      map.delete(id);
    }
  });
  for (const a of map.values()) {
    a.order = reordered.length;
    reordered.push(a);
  }
  saveJson(config.RH_TOOL_APPS_FILE, reordered);
  res.json({ success: true, data: reordered });
});

// RH 超市导出: 分类 + 应用一次性备份，便于版本迁移。
router.get('/rh-tools/export', (_req, res) => {
  const categories = loadJson(config.RH_TOOL_CATEGORIES_FILE, [])
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const tools = loadJson(config.RH_TOOL_APPS_FILE, [])
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({
    success: true,
    data: {
      schema: 't8-rh-tools',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories,
      tools,
    },
  });
});

// RH 超市导入: 默认覆盖当前 RH 超市数据，保留备份内 id 以兼容画布节点选中的应用。
router.post('/rh-tools/import', (req, res) => {
  try {
    const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';
    const normalized = normalizeRhToolsBackup(req.body || {});

    let categories = normalized.categories;
    let tools = normalized.tools;

    if (mode === 'merge') {
      const existingCategories = loadJson(config.RH_TOOL_CATEGORIES_FILE, []);
      const existingTools = loadJson(config.RH_TOOL_APPS_FILE, []);
      const catByName = new Map(existingCategories.map((c) => [String(c.name || '').trim(), c]));
      const mergedCategories = [...existingCategories];
      const catIdMap = new Map();
      for (const c of normalized.categories) {
        const existing = catByName.get(c.name);
        if (existing) {
          catIdMap.set(c.id, existing.id);
          continue;
        }
        c.order = mergedCategories.length;
        mergedCategories.push(c);
        catIdMap.set(c.id, c.id);
      }

      const toolByWebapp = new Map(existingTools.map((t) => [String(t.webappId || '').trim(), t]));
      const mergedTools = [...existingTools];
      for (const t of normalized.tools) {
        const mappedCategory = catIdMap.get(t.categoryId) || t.categoryId || '';
        const existing = toolByWebapp.get(t.webappId);
        if (existing) {
          Object.assign(existing, { ...t, id: existing.id, categoryId: mappedCategory });
        } else {
          t.categoryId = mappedCategory;
          t.order = mergedTools.length;
          mergedTools.push(t);
        }
      }
      categories = mergedCategories.map((c, idx) => ({ ...c, order: idx }));
      tools = mergedTools.map((t, idx) => ({ ...t, order: idx }));
    }

    saveJson(config.RH_TOOL_CATEGORIES_FILE, categories);
    saveJson(config.RH_TOOL_APPS_FILE, tools);
    res.json({
      success: true,
      data: {
        categories,
        tools,
        categoryCount: categories.length,
        toolCount: tools.length,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

module.exports = router;
module.exports.loadSettings = loadSettings;
module.exports.saveSettings = saveSettings;
module.exports.normalizeLlmConfigs = normalizeLlmConfigs;
module.exports.normalizeLlmApiKeys = normalizeLlmConfigs;
module.exports.maskLlmConfigs = maskLlmConfigs;
module.exports.maskLlmApiKeys = maskLlmConfigs;
module.exports.syncLegacyLlmConfig = syncLegacyLlmConfig;
module.exports.syncLegacyLlmApiKey = syncLegacyLlmConfig;
module.exports.normalizeZhenzhenBaseUrl = normalizeZhenzhenBaseUrl;
