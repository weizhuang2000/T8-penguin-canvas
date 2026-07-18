import type { ImageParamKind } from '../providers/models';
import { externalImageSizeFor } from '../utils/advancedProviders';
import {
  generateExternalImage,
  queryExternalImageStatus,
  queryImageStatus,
  submitImageAsync,
} from './generation';

export interface CodexAgentImageRequest {
  source: 'builtin' | 'external';
  prompt: string;
  images?: string[];
  aspectRatio?: string;
  sizeLevel?: string;
  outputFormat?: 'jpg' | 'png';
  signal?: AbortSignal;
  onProgress?: (message: string, progress: number) => void;
  builtin?: {
    model: string;
    apiModel: string;
    paramKind: ImageParamKind;
  };
  external?: {
    providerId: string;
    providerModel: string;
    providerParams?: Record<string, any>;
  };
  historyContext?: {
    canvasId?: string | null;
    sourceNodeId?: string;
    sourceNodeType?: string;
    nodeTitle?: string;
    outputTitle?: string;
    prompt?: string;
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw Object.assign(new Error('生图任务已停止'), { name: 'AbortError' });
}

function waitWithAbort(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('生图任务已停止'), { name: 'AbortError' }));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(Object.assign(new Error('生图任务已停止'), { name: 'AbortError' }));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function generateCodexAgentImage(request: CodexAgentImageRequest): Promise<string[]> {
  const prompt = String(request.prompt || '').trim();
  if (!prompt) throw new Error('Agent 没有返回可用于生图的提示词。');
  const images = Array.isArray(request.images) ? request.images.filter(Boolean) : [];
  const aspectRatio = String(request.aspectRatio || '1:1').trim() || '1:1';
  const sizeLevel = String(request.sizeLevel || '2K').trim() || '2K';
  const outputFormat = request.outputFormat === 'jpg' ? 'jpg' : 'png';
  throwIfAborted(request.signal);

  if (request.source === 'external') {
    const providerId = String(request.external?.providerId || '').trim();
    const providerModel = String(request.external?.providerModel || '').trim();
    if (!providerId || !providerModel) throw new Error('请先选择可用的扩展生图平台和模型。');
    request.onProgress?.(`正在提交 ${providerModel} 生图任务...`, 5);
    let result = await generateExternalImage({
      providerId,
      providerModel,
      model: providerModel,
      prompt,
      size: externalImageSizeFor(aspectRatio, sizeLevel),
      aspect_ratio: aspectRatio,
      image_size: sizeLevel,
      images,
      n: 1,
      outputFormat,
      providerParams: request.external?.providerParams || {},
      historyContext: request.historyContext,
      async: true,
    });
    if (result.imageUrls?.length) return result.imageUrls;
    if (!result.taskId) throw new Error(result.error || '扩展生图平台没有返回任务 ID 或图片。');
    let taskId = result.taskId;
    for (let index = 0; index < 1200; index += 1) {
      await waitWithAbort(3000, request.signal);
      result = await queryExternalImageStatus({
        providerId,
        providerModel,
        taskId,
        outputFormat,
        historyContext: request.historyContext,
      });
      taskId = result.taskId || taskId;
      const progress = Math.min(99, 5 + Math.round(((index + 1) / 1200) * 94));
      request.onProgress?.(`扩展生图平台处理中 · ${providerModel}`, progress);
      if (result.imageUrls?.length) return result.imageUrls;
      const status = String(result.status || result.code || '').toLowerCase();
      if (['failed', 'failure', 'error', 'cancelled'].includes(status)) {
        throw new Error(result.error || '扩展生图任务失败。');
      }
    }
    throw new Error('扩展生图任务超过 60 分钟仍未完成。');
  }

  const builtin = request.builtin;
  if (!builtin?.model || !builtin.apiModel) throw new Error('请先选择内置生图模型。');
  request.onProgress?.(`正在提交 ${builtin.apiModel} 生图任务...`, 5);
  const submitted = await submitImageAsync({
    model: builtin.model,
    apiModel: builtin.apiModel,
    paramKind: builtin.paramKind,
    prompt,
    aspect_ratio: aspectRatio,
    image_size: sizeLevel,
    images,
    n: 1,
    outputFormat,
    historyContext: request.historyContext,
  });
  if (submitted.sync && submitted.urls?.length) return submitted.urls;
  if (!submitted.taskId) throw new Error('内置生图平台没有返回任务 ID 或图片。');
  for (let index = 0; index < 1800; index += 1) {
    await waitWithAbort(2000, request.signal);
    const result = await queryImageStatus(
      submitted.taskId,
      builtin.apiModel,
      outputFormat,
      request.historyContext,
    );
    const numericProgress = Number.parseInt(String(result.progress || '').replace(/[^0-9]/g, ''), 10);
    request.onProgress?.(
      `内置生图平台处理中 · ${builtin.apiModel}`,
      Number.isFinite(numericProgress) ? Math.min(99, Math.max(5, numericProgress)) : Math.min(99, 5 + Math.round(((index + 1) / 1800) * 94)),
    );
    if (result.urls?.length) return result.urls;
    const status = String(result.status || '').toLowerCase();
    if (['failed', 'failure', 'error', 'cancelled'].includes(status)) {
      throw new Error(result.error || '内置生图任务失败。');
    }
  }
  throw new Error('内置生图任务超过 60 分钟仍未完成。');
}
