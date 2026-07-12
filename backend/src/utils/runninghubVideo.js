const RUNNINGHUB_VIDEO_MODEL = 'rhart-video-g/image-to-video';
const RUNNINGHUB_VIDEO_PATH = `/openapi/v2/${RUNNINGHUB_VIDEO_MODEL}`;

const ASPECT_RATIOS = new Set(['2:3', '3:2', '1:1', '16:9', '9:16']);
const RESOLUTIONS = new Set(['480p', '720p']);

function normalizeRunningHubVideoRequest(value = {}) {
  const prompt = String(value.prompt || '').trim();
  if (!prompt || prompt.length > 20000) {
    throw new Error('prompt 必填，长度须为 1-20000 个字符');
  }

  const aspectRatio = String(value.aspectRatio || value.aspect_ratio || '16:9').trim();
  if (!ASPECT_RATIOS.has(aspectRatio)) {
    throw new Error(`RunningHub 视频不支持比例 ${aspectRatio}`);
  }

  const resolution = String(value.resolution || '480p').trim().toLowerCase();
  if (!RESOLUTIONS.has(resolution)) {
    throw new Error(`RunningHub 视频不支持分辨率 ${resolution}`);
  }

  const duration = Number(value.duration ?? 6);
  if (!Number.isInteger(duration) || duration < 6 || duration > 30) {
    throw new Error('RunningHub 视频时长须为 6-30 秒的整数');
  }

  const imageUrls = (Array.isArray(value.imageUrls) ? value.imageUrls : value.images || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (imageUrls.length > 7) {
    throw new Error('RunningHub 视频最多支持 7 张参考图');
  }

  return { prompt, aspectRatio, imageUrls, resolution, duration };
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
  RUNNINGHUB_VIDEO_MODEL,
  RUNNINGHUB_VIDEO_PATH,
  normalizeRunningHubVideoRequest,
  normalizeRunningHubVideoStatus,
  runningHubVideoFailReason,
  extractRunningHubVideoUrl,
};
