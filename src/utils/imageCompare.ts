export type CompareMode = 'slider' | 'side-by-side' | 'overlay' | 'blink' | 'heatmap' | 'focus';
export type AlignMode = 'contain' | 'cover' | 'fill';

export interface CompareStats {
  imageA: { width: number; height: number };
  imageB: { width: number; height: number };
  meanDiff?: number;
  changedRatio?: number;
  maxDiff?: number;
}

export interface ImageCompareCandidate {
  url: string;
  label: string;
  sourceNodeId?: string;
  sourceType?: string;
}

export const MODE_OPTIONS: Array<{ value: CompareMode; label: string; short: string }> = [
  { value: 'slider', label: '滑杆对比', short: '滑杆' },
  { value: 'side-by-side', label: '并排对比', short: '并排' },
  { value: 'overlay', label: '透明叠加', short: '叠加' },
  { value: 'blink', label: '闪烁对比', short: '闪烁' },
  { value: 'heatmap', label: '差异热力图', short: '热力' },
  { value: 'focus', label: '差异聚焦', short: '聚焦' },
];

export const ALIGN_OPTIONS: Array<{ value: AlignMode; label: string }> = [
  { value: 'contain', label: '完整适配' },
  { value: 'cover', label: '裁剪铺满' },
  { value: 'fill', label: '拉伸对齐' },
];

const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i;

export function isImageLikeUrl(url: string): boolean {
  if (!url) return false;
  if (/^data:image\//i.test(url)) return true;
  if (/^data:(audio|video)\//i.test(url)) return false;
  if (AUDIO_RE.test(url) || VIDEO_RE.test(url)) return false;
  return true;
}

function pushImage(out: string[], value: any) {
  if (typeof value !== 'string') return;
  const s = value.trim();
  if (!s || !isImageLikeUrl(s) || out.includes(s)) return;
  out.push(s);
}

function pushCandidate(out: ImageCompareCandidate[], seen: Set<string>, url: any, label: string, sourceNodeId?: string, sourceType?: string) {
  if (typeof url !== 'string') return;
  const s = url.trim();
  if (!s || !isImageLikeUrl(s) || seen.has(s)) return;
  seen.add(s);
  out.push({ url: s, label, sourceNodeId, sourceType });
}

function isDisplayableImageValue(value: any): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!isImageLikeUrl(s)) return false;
  return /^(data:image\/|blob:|https?:\/\/|\/files\/|\.?\/)/i.test(s);
}

export function extractImagesFromData(data: any, sourceHandle?: string | null): string[] {
  const out: string[] = [];
  if (!data) return out;

  const isFramePair =
    Object.prototype.hasOwnProperty.call(data, 'firstFrameUrl') &&
    Object.prototype.hasOwnProperty.call(data, 'lastFrameUrl');
  if (isFramePair) {
    if (sourceHandle === 'last') {
      pushImage(out, data.lastFrameUrl);
      return out;
    }
    if (sourceHandle === 'first') {
      pushImage(out, data.firstFrameUrl);
      return out;
    }
    pushImage(out, data.firstFrameUrl);
    pushImage(out, data.lastFrameUrl);
    return out;
  }

  pushImage(out, data.imageUrl);
  pushImage(out, data.directImageUrl);
  for (const field of ['imageUrls', 'urls', 'generatedImages', 'directImageUrls']) {
    const v = data[field];
    if (Array.isArray(v)) v.forEach((u) => pushImage(out, u));
  }
  return out;
}

export function extractInputCandidatesFromData(
  data: any,
  sourceNodeId?: string,
  sourceType?: string,
  seen = new Set<string>(),
): ImageCompareCandidate[] {
  const out: ImageCompareCandidate[] = [];
  if (!data) return out;

  const pushArray = (field: string, label: string) => {
    const arr = data[field];
    if (!Array.isArray(arr)) return;
    arr.forEach((u: any, i: number) => pushCandidate(out, seen, u, `${label} ${i + 1}`, sourceNodeId, sourceType));
  };

  pushArray('referenceImages', '参考图');
  pushArray('localRefImages', '本地参考图');
  pushArray('mjSrefImages', '风格参考图');
  pushArray('mjOrefImages', '角色参考图');

  if (Array.isArray(data.pickedFiles)) {
    data.pickedFiles.forEach((f: any, i: number) => {
      pushCandidate(out, seen, f?.dataUrl || f?.url, f?.name || `视觉输入 ${i + 1}`, sourceNodeId, sourceType);
    });
  }

  const paramValues = data.paramValues;
  if (paramValues && typeof paramValues === 'object') {
    Object.entries(paramValues).forEach(([key, raw], i) => {
      const value = (raw as any)?.value;
      if (!isDisplayableImageValue(value)) return;
      const label = key.split('::').pop() || `参数图 ${i + 1}`;
      pushCandidate(out, seen, value, label, sourceNodeId, sourceType);
    });
  }

  const nodeInfoList = data.appInfo?.nodeInfoList || data.nodeInfoList;
  if (Array.isArray(nodeInfoList)) {
    nodeInfoList.forEach((item: any, i: number) => {
      const fieldType = String(item?.fieldType || '').toLowerCase();
      if (fieldType && fieldType !== 'image') return;
      if (!isDisplayableImageValue(item?.fieldValue)) return;
      pushCandidate(out, seen, item?.fieldValue, item?.fieldName || `参数图 ${i + 1}`, sourceNodeId, sourceType);
    });
  }

  return out;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图像读取失败'));
    img.src = url;
  });
}

export function drawAligned(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  align: AlignMode,
) {
  if (align === 'fill') {
    ctx.drawImage(img, 0, 0, width, height);
    return;
  }
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const scale = align === 'cover'
    ? Math.max(width / iw, height / ih)
    : Math.min(width / iw, height / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

export function drawDiffPixels(
  rawA: Uint8ClampedArray,
  rawB: Uint8ClampedArray,
  threshold: number,
  variant: 'heatmap' | 'focus',
) {
  const out = new Uint8ClampedArray(rawA.length);
  for (let i = 0; i < rawA.length; i += 4) {
    const diff = (
      Math.abs(rawA[i] - rawB[i]) +
      Math.abs(rawA[i + 1] - rawB[i + 1]) +
      Math.abs(rawA[i + 2] - rawB[i + 2])
    ) / 3;
    const t = Math.max(0, Math.min(1, (diff - threshold) / Math.max(1, 255 - threshold)));

    if (variant === 'focus') {
      if (diff < threshold) {
        const gray = rawA[i] * 0.299 + rawA[i + 1] * 0.587 + rawA[i + 2] * 0.114;
        out[i] = gray * 0.58;
        out[i + 1] = gray * 0.58;
        out[i + 2] = gray * 0.58;
      } else {
        const mix = Math.max(0.18, t * 0.36);
        out[i] = rawB[i] * (1 - mix) + 255 * mix;
        out[i + 1] = rawB[i + 1] * (1 - mix) + 148 * mix;
        out[i + 2] = rawB[i + 2] * (1 - mix) + 36 * mix;
      }
      out[i + 3] = 255;
      continue;
    }

    const mix = diff < threshold ? 0 : Math.max(0.3, t * 0.82);
    const heatR = 255;
    const heatG = Math.round(232 * (1 - t) + 48 * t);
    const heatB = Math.round(60 * (1 - t));
    const base = diff < threshold ? 0.86 : 0.62;
    out[i] = rawA[i] * base * (1 - mix) + heatR * mix;
    out[i + 1] = rawA[i + 1] * base * (1 - mix) + heatG * mix;
    out[i + 2] = rawA[i + 2] * base * (1 - mix) + heatB * mix;
    out[i + 3] = 255;
  }
  return out;
}

async function drawAlignedToImageData(
  img: HTMLImageElement,
  width: number,
  height: number,
  align: AlignMode,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 不可用');
  ctx.clearRect(0, 0, width, height);
  drawAligned(ctx, img, width, height, align);
  return { canvas, ctx, imageData: ctx.getImageData(0, 0, width, height) };
}

export async function getImageCompareStats(
  before: string,
  after: string,
  align: AlignMode,
  threshold: number,
): Promise<CompareStats> {
  const [a, b] = await Promise.all([loadImage(before), loadImage(after)]);
  const baseW = a.naturalWidth || a.width || 1;
  const baseH = a.naturalHeight || a.height || 1;
  const sampleScale = Math.min(192 / baseW, 192 / baseH, 1);
  const sampleW = Math.max(24, Math.round(baseW * sampleScale));
  const sampleH = Math.max(24, Math.round(baseH * sampleScale));
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      imageA: { width: baseW, height: baseH },
      imageB: { width: b.naturalWidth || b.width || 1, height: b.naturalHeight || b.height || 1 },
    };
  }
  ctx.clearRect(0, 0, sampleW, sampleH);
  drawAligned(ctx, a, sampleW, sampleH, 'fill');
  const dataA = ctx.getImageData(0, 0, sampleW, sampleH).data;
  ctx.clearRect(0, 0, sampleW, sampleH);
  drawAligned(ctx, b, sampleW, sampleH, align);
  const dataB = ctx.getImageData(0, 0, sampleW, sampleH).data;
  let sum = 0;
  let max = 0;
  let changed = 0;
  const px = sampleW * sampleH;
  for (let i = 0; i < dataA.length; i += 4) {
    const diff = (
      Math.abs(dataA[i] - dataB[i]) +
      Math.abs(dataA[i + 1] - dataB[i + 1]) +
      Math.abs(dataA[i + 2] - dataB[i + 2])
    ) / 3;
    sum += diff;
    if (diff > max) max = diff;
    if (diff >= threshold) changed += 1;
  }
  return {
    imageA: { width: baseW, height: baseH },
    imageB: { width: b.naturalWidth || b.width || 1, height: b.naturalHeight || b.height || 1 },
    meanDiff: sum / px,
    maxDiff: max,
    changedRatio: changed / px,
  };
}

export async function renderCompareDataUrl(args: {
  before: string;
  after: string;
  mode: CompareMode;
  align: AlignMode;
  split: number;
  opacity: number;
  threshold: number;
}) {
  const { before, after, mode, align, split, opacity, threshold } = args;
  const [a, b] = await Promise.all([loadImage(before), loadImage(after)]);
  const width = a.naturalWidth || a.width || 1;
  const height = a.naturalHeight || a.height || 1;
  const { canvas: canvasA, ctx: ctxA, imageData: dataA } = await drawAlignedToImageData(a, width, height, 'fill');
  const { canvas: canvasB, imageData: dataB } = await drawAlignedToImageData(b, width, height, align);

  if (mode === 'side-by-side' || mode === 'blink') {
    const gap = 16;
    const out = document.createElement('canvas');
    out.width = width * 2 + gap;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('canvas 不可用');
    ctx.drawImage(canvasA, 0, 0);
    ctx.drawImage(canvasB, width + gap, 0);
    return out.toDataURL('image/png');
  }

  if (mode === 'overlay') {
    ctxA.save();
    ctxA.globalAlpha = Math.max(0, Math.min(1, opacity / 100));
    ctxA.drawImage(canvasB, 0, 0);
    ctxA.restore();
    return canvasA.toDataURL('image/png');
  }

  if (mode === 'heatmap' || mode === 'focus') {
    const raw = drawDiffPixels(dataA.data, dataB.data, threshold, mode);
    ctxA.putImageData(new ImageData(raw, width, height), 0, 0);
    return canvasA.toDataURL('image/png');
  }

  const clipW = Math.max(1, Math.min(width, Math.round(width * split / 100)));
  ctxA.save();
  ctxA.beginPath();
  ctxA.rect(0, 0, clipW, height);
  ctxA.clip();
  ctxA.drawImage(canvasB, 0, 0);
  ctxA.restore();
  ctxA.fillStyle = '#fb923c';
  ctxA.fillRect(Math.max(0, clipW - 1), 0, 2, height);
  return canvasA.toDataURL('image/png');
}
