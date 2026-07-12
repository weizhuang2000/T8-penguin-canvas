const DEFAULT_RUNNINGHUB_VIDEO_MODEL = 'rhart-video-g/image-to-video';

const RUNNINGHUB_VIDEO_MODELS = Object.freeze({
  [DEFAULT_RUNNINGHUB_VIDEO_MODEL]: Object.freeze({
    id: DEFAULT_RUNNINGHUB_VIDEO_MODEL,
    path: `/openapi/v2/${DEFAULT_RUNNINGHUB_VIDEO_MODEL}`,
    promptMin: 1,
    promptMax: 20000,
    aspectRatios: Object.freeze(['2:3', '3:2', '1:1', '16:9', '9:16']),
    resolutions: Object.freeze(['480p', '720p']),
    minImages: 0,
    maxImages: 7,
    maxImageBytes: 10 * 1024 * 1024,
    durationMin: 6,
    durationMax: 30,
    durationType: 'number',
    defaultDuration: 6,
    defaultResolution: '480p',
  }),
  'rhart-video-v3.1-fast/image-to-video': Object.freeze({
    id: 'rhart-video-v3.1-fast/image-to-video',
    path: '/openapi/v2/rhart-video-v3.1-fast/image-to-video',
    promptMin: 5,
    promptMax: 8000,
    aspectRatios: Object.freeze(['16:9', '9:16']),
    resolutions: Object.freeze(['720p', '1080p', '4k']),
    minImages: 1,
    maxImages: 3,
    maxImageBytes: 30 * 1024 * 1024,
    durations: Object.freeze(['8']),
    durationType: 'string',
    defaultDuration: '8',
    defaultResolution: '720p',
  }),
});

function resolveRunningHubVideoModel(value) {
  const model = String(value || DEFAULT_RUNNINGHUB_VIDEO_MODEL).trim();
  const definition = RUNNINGHUB_VIDEO_MODELS[model];
  if (!definition) throw new Error(`不支持的 RunningHub 视频模型: ${model}`);
  return definition;
}

function normalizeRunningHubVideoRequest(value = {}) {
  const definition = resolveRunningHubVideoModel(value.model);
  const prompt = String(value.prompt || '').trim();
  if (prompt.length < definition.promptMin || prompt.length > definition.promptMax) {
    throw new Error(`prompt 长度须为 ${definition.promptMin}-${definition.promptMax} 个字符`);
  }

  const aspectRatio = String(value.aspectRatio || value.aspect_ratio || '16:9').trim();
  if (!definition.aspectRatios.includes(aspectRatio)) {
    throw new Error(`模型 ${definition.id} 不支持比例 ${aspectRatio}`);
  }

  const resolution = String(value.resolution || definition.defaultResolution).trim().toLowerCase();
  if (!definition.resolutions.includes(resolution)) {
    throw new Error(`模型 ${definition.id} 不支持分辨率 ${resolution}`);
  }

  const rawDuration = value.duration ?? definition.defaultDuration;
  let duration;
  if (definition.durationType === 'string') {
    duration = String(rawDuration).trim();
    if (!definition.durations.includes(duration)) {
      throw new Error(`模型 ${definition.id} 仅支持 ${definition.durations.join('/')} 秒`);
    }
  } else {
    duration = Number(rawDuration);
    if (!Number.isInteger(duration) || duration < definition.durationMin || duration > definition.durationMax) {
      throw new Error(`模型 ${definition.id} 时长须为 ${definition.durationMin}-${definition.durationMax} 秒的整数`);
    }
  }

  const imageUrls = (Array.isArray(value.imageUrls) ? value.imageUrls : value.images || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (imageUrls.length < definition.minImages) {
    throw new Error(`模型 ${definition.id} 至少需要 ${definition.minImages} 张参考图`);
  }
  if (imageUrls.length > definition.maxImages) {
    throw new Error(`模型 ${definition.id} 最多支持 ${definition.maxImages} 张参考图`);
  }

  return {
    model: definition.id,
    path: definition.path,
    maxImageBytes: definition.maxImageBytes,
    body: { prompt, aspectRatio, imageUrls, duration, resolution },
  };
}

function normalizeRunningHubVideoStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  if (status === 'SUCCEEDED' || status === 'COMPLETED') return 'SUCCESS';
  if (status === 'FAILED' || status === 'ERROR') return 'FAILURE';
  return status || 'QUEUED';
}

function runningHubVideoFailReason(data) {
  const value = data?.errorMessage || data?.failedReason || data?.failReason || '';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.exception_message || value.message || JSON.stringify(value);
  }
  return value == null ? '' : String(value);
}

function extractRunningHubVideoUrl(data) {
  const results = Array.isArray(data?.results) ? data.results : [];
  const video = results.find((item) => {
    const outputType = String(item?.outputType || item?.fileType || '').toLowerCase();
    const url = String(item?.url || item?.fileUrl || '');
    return ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(outputType)
      || /\.(mp4|webm|mov|m4v|mkv)(?:[?#]|$)/i.test(url);
  });
  return String(video?.url || video?.fileUrl || '');
}

module.exports = {
  DEFAULT_RUNNINGHUB_VIDEO_MODEL,
  RUNNINGHUB_VIDEO_MODELS,
  resolveRunningHubVideoModel,
  normalizeRunningHubVideoRequest,
  normalizeRunningHubVideoStatus,
  runningHubVideoFailReason,
  extractRunningHubVideoUrl,
};
