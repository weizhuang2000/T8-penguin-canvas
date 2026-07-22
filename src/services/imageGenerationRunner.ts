import { buildMjPrompt, generateExternalImage, queryExternalImageStatus, queryImageFal, queryImageStatus, queryMjTask, submitImageAsync, submitImageFal, submitMjImagine, type GenerationHistoryContext, type MjSpeed } from './generation';

const IMAGE_POLL_TIMEOUT_MS = 60 * 60 * 1000;

export type ImageGenerationMode = 'standard' | 'fal' | 'mj' | 'external';

export interface ImageGenerationProgress {
  progress: string;
  taskId?: string;
  meta?: Record<string, unknown>;
}

export interface ImageGenerationResult {
  primaryUrl: string;
  urls: string[];
  remoteImageUrls?: string[];
  taskId?: string;
}

export interface ImageGenerationRunOptions {
  mode: ImageGenerationMode;
  prompt: string;
  images?: string[];
  outputFormat?: 'jpg' | 'png';
  historyContext?: GenerationHistoryContext;
  signal?: AbortSignal;
  onProgress?: (event: ImageGenerationProgress) => void;
  onWarning?: (message: string) => void;

  model?: string;
  apiModel?: string;
  paramKind?: 'gpt-size' | 'banana-ratio' | 'grok-image' | 'mj';
  aspectRatio?: string;
  sizeLevel?: string;
  providerParams?: Record<string, any>;
  seed?: number;
  n?: number;

  external?: {
    providerId: string;
    providerModel: string;
    size?: string;
    negativePrompt?: string;
  };
  fal?: {
    kind: 'gpt-fal' | 'nbpro-fal';
    mode?: 'edit' | 'gen';
    size?: string;
    customW?: number;
    customH?: number;
    quality?: 'low' | 'medium' | 'high' | 'auto';
    format?: 'png' | 'jpeg' | 'webp';
    sync?: boolean;
    aspectRatio?: string;
    resolution?: string;
    safetyTolerance?: string;
    systemPrompt?: string;
    enableWebSearch?: boolean;
    imageMode?: 'image_url' | 'base64';
  };
  mj?: {
    version: string;
    aspectRatio: string;
    speed: MjSpeed;
    chaos?: number;
    stylize?: number;
    imageWeight?: number;
    styleWeight?: number;
    styleVersion?: string;
    negativePrompt?: string;
    seed?: number;
    pollIntervalSeconds?: number;
    maxPolls?: number;
    srefUrls?: string[];
    orefUrls?: string[];
  };
}

function abortError(): Error {
  return new DOMException('任务已取消', 'AbortError');
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function pollCount(intervalMs: number): number {
  return Math.max(1, Math.ceil(IMAGE_POLL_TIMEOUT_MS / Math.max(1, intervalMs)));
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`参考图读取失败: HTTP ${response.status}`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('参考图读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function runExternal(options: ImageGenerationRunOptions): Promise<ImageGenerationResult> {
  const external = options.external;
  if (!external?.providerId || !external.providerModel) throw new Error('扩展平台未配置可用图像模型');
  const providerParams = { ...(options.providerParams || {}) };
  let result = await generateExternalImage({
    providerId: external.providerId,
    providerModel: external.providerModel,
    model: external.providerModel,
    prompt: options.prompt,
    size: external.size,
    aspect_ratio: options.aspectRatio,
    image_size: options.sizeLevel,
    images: options.images || [],
    outputFormat: options.outputFormat,
    negativePrompt: external.negativePrompt || undefined,
    negative: external.negativePrompt || undefined,
    n: Math.max(1, Math.min(4, Number(options.n || 1))),
    seed: options.seed || undefined,
    providerParams,
    historyContext: options.historyContext,
    async: true,
  });
  if ((!result.imageUrls?.length) && result.taskId && (result.code === 'running' || result.status === 'running')) {
    let taskId = result.taskId;
    let transientFailures = 0;
    const interval = 3000;
    const maxPolls = pollCount(interval);
    options.onProgress?.({ progress: '5%', taskId });
    for (let index = 0; index < maxPolls; index += 1) {
      await delay(interval, options.signal);
      try {
        result = await queryExternalImageStatus({
          providerId: external.providerId,
          providerModel: external.providerModel,
          taskId,
          outputFormat: options.outputFormat,
          historyContext: options.historyContext,
        });
        transientFailures = 0;
      } catch (error: any) {
        transientFailures += 1;
        options.onWarning?.(`扩展平台状态查询暂时失败(${transientFailures}/5): ${error?.message || error}`);
        if (transientFailures >= 5) throw error;
        continue;
      }
      taskId = result.taskId || taskId;
      options.onProgress?.({
        progress: `${Math.min(99, Math.round(((index + 1) / maxPolls) * 100))}%`,
        taskId,
      });
      if (result.imageUrls?.length || (result.code && result.code !== 'running')) break;
    }
  }
  const urls = result.imageUrls || [];
  if (!urls.length) throw new Error('扩展平台完成但未返回图片');
  return {
    primaryUrl: urls[0],
    urls,
    remoteImageUrls: result.remoteImageUrls,
    taskId: result.taskId,
  };
}

async function runMidjourney(options: ImageGenerationRunOptions): Promise<ImageGenerationResult> {
  const mj = options.mj;
  if (!mj) throw new Error('Midjourney 参数缺失');
  const base64Array: string[] = [];
  for (const url of options.images || []) {
    assertNotAborted(options.signal);
    try {
      base64Array.push(await imageUrlToDataUrl(url));
    } catch (error: any) {
      options.onWarning?.(`Midjourney 参考图读取失败，已跳过: ${error?.message || error}`);
    }
  }
  const fullPrompt = buildMjPrompt({
    prompt: options.prompt,
    model: mj.version,
    ar: mj.aspectRatio,
    c: mj.chaos || undefined,
    s: mj.stylize || undefined,
    iw: mj.imageWeight || undefined,
    sw: mj.styleWeight || undefined,
    sv: mj.styleVersion || undefined,
    no: mj.negativePrompt || undefined,
    srefUrls: mj.srefUrls || [],
    orefUrls: mj.orefUrls || [],
  });
  const submitted = await submitMjImagine({
    prompt: fullPrompt,
    ar: mj.aspectRatio,
    c: mj.chaos || undefined,
    s: mj.stylize || undefined,
    iw: mj.imageWeight || undefined,
    sw: mj.styleWeight || undefined,
    sv: mj.styleVersion || undefined,
    no: mj.negativePrompt || undefined,
    seed: mj.seed || undefined,
    speed: mj.speed,
    base64Array,
    remix: true,
    historyContext: options.historyContext,
  });
  const interval = Math.max(1, Math.min(30, mj.pollIntervalSeconds || 3)) * 1000;
  const maxPolls = Math.max(10, pollCount(interval), Math.min(3600, mj.maxPolls || 1200));
  options.onProgress?.({ progress: '15%', taskId: submitted.taskId });
  for (let index = 0; index < maxPolls; index += 1) {
    await delay(interval, options.signal);
    const result = await queryMjTask(submitted.taskId, mj.speed, options.historyContext);
    if (result.status === 'FAILURE') throw new Error(`MJ 失败: ${result.failReason || '未知错误'}`);
    if (result.progress) {
      const percent = Number.parseInt(String(result.progress), 10) || 0;
      options.onProgress?.({ progress: `${Math.min(99, 15 + Math.floor(percent * 0.85))}%`, taskId: submitted.taskId });
    }
    if (result.status === 'SUCCESS') {
      const children = result.imageUrls || [];
      const urls = children.length ? children : (result.imageUrl ? [result.imageUrl] : []);
      if (!urls.length) throw new Error('MJ 任务完成但未返回图片');
      return {
        primaryUrl: result.imageUrl || urls[0],
        urls,
        taskId: submitted.taskId,
      };
    }
  }
  throw new Error(`MJ 轮询超时: ${maxPolls} 次 × ${interval / 1000}s`);
}

async function runFal(options: ImageGenerationRunOptions): Promise<ImageGenerationResult> {
  const fal = options.fal;
  if (!fal || !options.apiModel) throw new Error('FAL 参数缺失');
  const submitted = await submitImageFal({
    apiModel: options.apiModel,
    prompt: options.prompt,
    images: options.images || [],
    n: Math.max(1, Math.min(4, Number(options.n || 1))),
    format: fal.format || 'png',
    sync: fal.sync === true,
    mode: fal.kind === 'gpt-fal' ? fal.mode : undefined,
    size: fal.kind === 'gpt-fal' ? fal.size : undefined,
    customW: fal.kind === 'gpt-fal' && fal.size === 'custom' ? fal.customW : undefined,
    customH: fal.kind === 'gpt-fal' && fal.size === 'custom' ? fal.customH : undefined,
    quality: fal.kind === 'gpt-fal' ? fal.quality : undefined,
    aspect_ratio: fal.kind === 'nbpro-fal' ? fal.aspectRatio : undefined,
    resolution: fal.kind === 'nbpro-fal' ? fal.resolution : undefined,
    safety_tolerance: fal.kind === 'nbpro-fal' ? fal.safetyTolerance : undefined,
    seed: fal.kind === 'nbpro-fal' && options.seed ? options.seed : undefined,
    system_prompt: fal.kind === 'nbpro-fal' ? fal.systemPrompt : undefined,
    enable_web_search: fal.kind === 'nbpro-fal' ? fal.enableWebSearch : undefined,
    image_mode: fal.kind === 'nbpro-fal' ? fal.imageMode : undefined,
    outputFormat: options.outputFormat,
    providerParams: options.providerParams,
    historyContext: options.historyContext,
  });
  if (submitted.sync && submitted.urls?.length) {
    return { primaryUrl: submitted.urls[0], urls: submitted.urls };
  }
  if (!submitted.requestId || !submitted.responseUrl) throw new Error('FAL 提交后未获得 request_id/response_url');
  const interval = 3000;
  const maxPolls = pollCount(interval);
  options.onProgress?.({
    progress: '5%',
    taskId: submitted.requestId,
    meta: { falResponseUrl: submitted.responseUrl, falEndpoint: submitted.endpoint },
  });
  for (let index = 0; index < maxPolls; index += 1) {
    await delay(interval, options.signal);
    const result = await queryImageFal({
      responseUrl: submitted.responseUrl,
      endpoint: submitted.endpoint,
      requestId: submitted.requestId,
      outputFormat: options.outputFormat,
      historyContext: options.historyContext,
    });
    const status = String(result.status || '').toLowerCase();
    if (status === 'completed') {
      const urls = result.urls || [];
      if (!urls.length) throw new Error('FAL 任务完成但未返回图片');
      return { primaryUrl: urls[0], urls, taskId: submitted.requestId };
    }
    if (status === 'failed') throw new Error(result.error || 'FAL 任务失败');
    if (index % 5 === 4) {
      options.onProgress?.({
        progress: `${Math.min(95, 15 + Math.floor((index / maxPolls) * 80))}%`,
        taskId: submitted.requestId,
      });
    }
  }
  throw new Error(`FAL 超时: ${(maxPolls * interval) / 1000}s 未完成`);
}

async function runStandard(options: ImageGenerationRunOptions): Promise<ImageGenerationResult> {
  if (!options.model || !options.apiModel || !options.paramKind) throw new Error('图像模型参数缺失');
  const submitted = await submitImageAsync({
    model: options.model,
    apiModel: options.apiModel,
    paramKind: options.paramKind,
    prompt: options.prompt,
    aspect_ratio: options.aspectRatio,
    image_size: options.sizeLevel,
    images: options.images || [],
    n: Math.max(1, Math.min(4, Number(options.n || 1))),
    outputFormat: options.outputFormat,
    seed: options.seed || undefined,
    providerParams: options.providerParams,
    historyContext: options.historyContext,
  });
  if (submitted.sync && submitted.urls?.length) {
    return { primaryUrl: submitted.urls[0], urls: submitted.urls };
  }
  if (!submitted.taskId) throw new Error('未获取到 taskId 且无同步结果');
  const interval = 2000;
  const maxPolls = pollCount(interval);
  let lastProgress = submitted.progress || '5%';
  options.onProgress?.({ progress: lastProgress, taskId: submitted.taskId });
  for (let index = 0; index < maxPolls; index += 1) {
    await delay(interval, options.signal);
    const result = await queryImageStatus(submitted.taskId, options.apiModel, options.outputFormat, options.historyContext);
    if (result.progress && result.progress !== lastProgress) {
      lastProgress = result.progress;
      options.onProgress?.({ progress: result.progress, taskId: submitted.taskId });
    }
    const status = String(result.status || '').toLowerCase();
    if (status === 'completed' || status === 'success' || status === 'done') {
      const urls = result.urls || [];
      if (!urls.length) throw new Error('任务完成但未返回图片');
      return { primaryUrl: urls[0], urls, taskId: submitted.taskId };
    }
    if (status === 'failed' || status === 'failure' || status === 'error') throw new Error(result.error || '任务失败');
  }
  throw new Error(`超时:${(maxPolls * interval) / 1000}s 未完成`);
}

export async function runConfiguredImageGeneration(options: ImageGenerationRunOptions): Promise<ImageGenerationResult> {
  assertNotAborted(options.signal);
  const prompt = String(options.prompt || '').trim();
  if (!prompt) throw new Error('prompt 不得为空');
  const normalized = { ...options, prompt };
  if (options.mode === 'external') return runExternal(normalized);
  if (options.mode === 'mj') return runMidjourney(normalized);
  if (options.mode === 'fal') return runFal(normalized);
  return runStandard(normalized);
}
