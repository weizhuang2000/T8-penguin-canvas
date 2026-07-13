const DEFAULT_RUNNINGHUB_VIDEO_MODEL = 'rhart-video-g/image-to-video';

function model(id, config) {
  return Object.freeze({ id, path: `/openapi/v2/${id}`, ...config });
}

const RUNNINGHUB_VIDEO_MODELS = Object.freeze({
  [DEFAULT_RUNNINGHUB_VIDEO_MODEL]: model(DEFAULT_RUNNINGHUB_VIDEO_MODEL, {
    promptMin: 1,
    promptMax: 20000,
    aspectRatios: Object.freeze(['2:3', '3:2', '1:1', '16:9', '9:16']),
    ratioField: 'aspectRatio',
    resolutions: Object.freeze(['480p', '720p']),
    resolutionField: 'resolution',
    minImages: 0,
    maxImages: 7,
    maxImageBytes: 10 * 1024 * 1024,
    imageField: 'imageUrls',
    durationMin: 6,
    durationMax: 30,
    durationType: 'number',
    defaultDuration: 6,
    defaultResolution: '480p',
  }),
  'rhart-video-g/text-to-video': model('rhart-video-g/text-to-video', {
    promptMin: 1,
    promptMax: 20000,
    aspectRatios: Object.freeze(['2:3', '3:2', '1:1', '16:9', '9:16']),
    ratioField: 'aspectRatio',
    resolutions: Object.freeze(['480p', '720p']),
    resolutionField: 'resolution',
    minImages: 0,
    maxImages: 0,
    maxImageBytes: 0,
    imageField: null,
    durationMin: 6,
    durationMax: 30,
    durationType: 'number',
    defaultDuration: 6,
    defaultResolution: '480p',
  }),
  'rhart-video-g-official/image-to-video': model('rhart-video-g-official/image-to-video', {
    promptMin: 5,
    promptMax: 800,
    aspectRatios: Object.freeze([]),
    ratioField: null,
    resolutions: Object.freeze(['480p', '720p']),
    resolutionField: 'resolution',
    minImages: 1,
    maxImages: 1,
    maxImageBytes: 10 * 1024 * 1024,
    imageField: 'imageUrl',
    durations: Object.freeze(['6', '10']),
    durationType: 'string',
    defaultDuration: '6',
    defaultResolution: '720p',
  }),
  'rhart-video-g-official/image-to-video-v1.5': model('rhart-video-g-official/image-to-video-v1.5', {
    promptMin: 5,
    promptMax: 2048,
    aspectRatios: Object.freeze([]),
    ratioField: null,
    resolutions: Object.freeze(['480p', '720p']),
    resolutionField: 'resolution',
    minImages: 1,
    maxImages: 1,
    maxImageBytes: 100 * 1024 * 1024,
    imageField: 'imageUrl',
    durationMin: 1,
    durationMax: 15,
    durationType: 'number',
    defaultDuration: 6,
    defaultResolution: '720p',
  }),
  'rhart-video-g-official/reference-to-video': model('rhart-video-g-official/reference-to-video', {
    promptMin: 1,
    aspectRatios: Object.freeze([]),
    ratioField: null,
    resolutions: Object.freeze(['480p', '720p']),
    resolutionField: 'resolution',
    minImages: 1,
    maxImages: 7,
    maxImageBytes: 10 * 1024 * 1024,
    imageField: 'imageUrls',
    durations: Object.freeze(['6', '10']),
    durationType: 'string',
    defaultDuration: '6',
    defaultResolution: '720p',
  }),
  'rhart-video-g-official/edit-video': model('rhart-video-g-official/edit-video', {
    promptMin: 5,
    promptMax: 800,
    aspectRatios: Object.freeze([]),
    ratioField: null,
    resolutions: Object.freeze(['480p', '720p']),
    resolutionField: 'resolution',
    minImages: 0,
    maxImages: 0,
    maxImageBytes: 0,
    imageField: null,
    minVideos: 1,
    maxVideos: 1,
    maxVideoBytes: 50 * 1024 * 1024,
    videoField: 'videoUrl',
    defaultResolution: '480p',
  }),
  'rhart-video-g-official/text-to-video': model('rhart-video-g-official/text-to-video', {
    promptMin: 5,
    promptMax: 800,
    aspectRatios: Object.freeze(['16:9', '9:16', '1:1']),
    ratioField: 'aspectRatio',
    resolutions: Object.freeze(['480p', '720p']),
    resolutionField: 'resolution',
    minImages: 0,
    maxImages: 0,
    maxImageBytes: 0,
    imageField: null,
    durations: Object.freeze(['6', '10']),
    durationType: 'string',
    defaultDuration: '6',
    defaultResolution: '720p',
  }),
  'rhart-video-g-official/video-extend': model('rhart-video-g-official/video-extend', {
    promptMin: 1,
    aspectRatios: Object.freeze([]),
    ratioField: null,
    resolutions: Object.freeze([]),
    minImages: 0,
    maxImages: 0,
    maxImageBytes: 0,
    imageField: null,
    minVideos: 1,
    maxVideos: 1,
    maxVideoBytes: 100 * 1024 * 1024,
    videoField: 'videoUrl',
    durations: Object.freeze(['6', '10']),
    durationType: 'string',
    defaultDuration: '6',
    defaultResolution: '',
  }),
  'rhart-video-s/image-to-video': model('rhart-video-s/image-to-video', {
    promptMin: 5,
    promptMax: 4000,
    aspectRatios: Object.freeze(['9:16', '16:9']),
    ratioField: 'aspectRatio',
    resolutions: Object.freeze([]),
    minImages: 1,
    maxImages: 1,
    maxImageBytes: 50 * 1024 * 1024,
    imageField: 'imageUrl',
    durations: Object.freeze(['10', '15']),
    durationType: 'string',
    defaultDuration: '10',
    defaultResolution: '',
    supportsStoryboard: true,
  }),
  'rhart-video-s/text-to-video': model('rhart-video-s/text-to-video', {
    promptMin: 5,
    promptMax: 4000,
    aspectRatios: Object.freeze(['9:16', '16:9']),
    ratioField: 'aspectRatio',
    resolutions: Object.freeze([]),
    minImages: 0,
    maxImages: 0,
    maxImageBytes: 0,
    imageField: null,
    durations: Object.freeze(['10', '15']),
    durationType: 'string',
    defaultDuration: '10',
    defaultResolution: '',
    supportsStoryboard: true,
  }),
  'rhart-video-v3.1-fast/image-to-video': model('rhart-video-v3.1-fast/image-to-video', {
    promptMin: 5,
    promptMax: 8000,
    aspectRatios: Object.freeze(['16:9', '9:16']),
    ratioField: 'aspectRatio',
    resolutions: Object.freeze(['720p', '1080p', '4k']),
    resolutionField: 'resolution',
    minImages: 1,
    maxImages: 3,
    maxImageBytes: 30 * 1024 * 1024,
    imageField: 'imageUrls',
    durations: Object.freeze(['8']),
    durationType: 'string',
    defaultDuration: '8',
    defaultResolution: '720p',
  }),
  'rhart-video-v3.1-fast/text-to-video': model('rhart-video-v3.1-fast/text-to-video', {
    promptMin: 5,
    promptMax: 8000,
    aspectRatios: Object.freeze(['16:9', '9:16']),
    ratioField: 'aspectRatio',
    resolutions: Object.freeze(['720p', '1080p', '4k']),
    resolutionField: 'resolution',
    minImages: 0,
    maxImages: 0,
    maxImageBytes: 0,
    imageField: null,
    durations: Object.freeze(['8']),
    durationType: 'string',
    defaultDuration: '8',
    defaultResolution: '720p',
  }),
  'rhart-video-s-official/image-to-video': model('rhart-video-s-official/image-to-video', {
    promptMin: 1,
    aspectRatios: Object.freeze(['16:9', '9:16']),
    ratioField: null,
    resolutions: Object.freeze([]),
    minImages: 1,
    maxImages: 1,
    maxImageBytes: 10 * 1024 * 1024,
    imageField: 'imageUrl',
    durations: Object.freeze(['4', '8', '12']),
    durationType: 'string',
    defaultDuration: '4',
    defaultResolution: '',
  }),
  'rhart-video-s-official/text-to-video': model('rhart-video-s-official/text-to-video', {
    promptMin: 1,
    aspectRatios: Object.freeze(['16:9', '9:16']),
    ratioField: 'size',
    ratioValues: Object.freeze({ '16:9': '1280x720', '9:16': '720x1280' }),
    resolutions: Object.freeze([]),
    minImages: 0,
    maxImages: 0,
    maxImageBytes: 0,
    imageField: null,
    durations: Object.freeze(['4', '8', '12']),
    durationType: 'string',
    defaultDuration: '4',
    defaultResolution: '',
  }),
});

function resolveRunningHubVideoModel(value) {
  const requested = String(value || DEFAULT_RUNNINGHUB_VIDEO_MODEL).trim();
  const definition = RUNNINGHUB_VIDEO_MODELS[requested];
  if (!definition) throw new Error(`不支持的 RunningHub 视频模型: ${requested}`);
  return definition;
}

function normalizeRunningHubVideoRequest(value = {}) {
  const definition = resolveRunningHubVideoModel(value.model);
  const prompt = String(value.prompt || '').trim();
  const promptTooLong = Number.isFinite(definition.promptMax) && prompt.length > definition.promptMax;
  if (prompt.length < definition.promptMin || promptTooLong) {
    const range = Number.isFinite(definition.promptMax)
      ? `${definition.promptMin}-${definition.promptMax}`
      : `至少 ${definition.promptMin}`;
    throw new Error(`prompt 长度须为 ${range} 个字符`);
  }

  let aspectRatio = '';
  if (definition.aspectRatios.length) {
    aspectRatio = String(value.aspectRatio || value.aspect_ratio || definition.aspectRatios[0]).trim();
    if (!definition.aspectRatios.includes(aspectRatio)) {
      throw new Error(`模型 ${definition.id} 不支持比例 ${aspectRatio}`);
    }
  }

  let resolution = '';
  if (definition.resolutions.length) {
    resolution = String(value.resolution || definition.defaultResolution).trim().toLowerCase();
    if (!definition.resolutions.includes(resolution)) {
      throw new Error(`模型 ${definition.id} 不支持分辨率 ${resolution}`);
    }
  }

  let duration;
  if (definition.durationType === 'string') {
    const rawDuration = value.duration ?? definition.defaultDuration;
    duration = String(rawDuration).trim();
    if (!definition.durations.includes(duration)) {
      throw new Error(`模型 ${definition.id} 仅支持 ${definition.durations.join('/')} 秒`);
    }
  } else if (definition.durationType === 'number') {
    const rawDuration = value.duration ?? definition.defaultDuration;
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

  const videoUrls = (Array.isArray(value.videoUrls) ? value.videoUrls : value.videos || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const minVideos = definition.minVideos || 0;
  const maxVideos = definition.maxVideos || 0;
  if (videoUrls.length < minVideos) {
    throw new Error(`模型 ${definition.id} 至少需要 ${minVideos} 个参考视频`);
  }
  if (videoUrls.length > maxVideos) {
    throw new Error(`模型 ${definition.id} 最多支持 ${maxVideos} 个参考视频`);
  }

  const body = { prompt };
  if (duration !== undefined) body.duration = duration;
  if (definition.ratioField) {
    body[definition.ratioField] = definition.ratioValues?.[aspectRatio] || aspectRatio;
  }
  if (definition.resolutionField) body[definition.resolutionField] = resolution;
  if (definition.supportsStoryboard) body.storyboard = value.storyboard === true;

  return {
    model: definition.id,
    path: definition.path,
    maxImageBytes: definition.maxImageBytes,
    imageField: definition.imageField,
    imageUrls,
    maxVideoBytes: definition.maxVideoBytes || 0,
    videoField: definition.videoField || null,
    videoUrls,
    body,
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
