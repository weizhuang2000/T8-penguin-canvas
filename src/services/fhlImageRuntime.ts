import { createFhlJob, getFhlJob } from './fhlImage';
import type { FhlJobSnapshot, GenerationHistoryContextLike } from '../types/canvas';

export interface FhlImageRuntimeConfig {
  active: boolean;
  quality: '2K' | '4K';
  aspect: string;
  outputFormat: 'jpg' | 'png';
  update?: (patch: Record<string, any>) => void;
}

const runtimeConfigs = new Map<string, FhlImageRuntimeConfig>();
const TERMINAL = new Set<FhlJobSnapshot['status']>(['completed', 'partial', 'failed', 'cancelled', 'interrupted']);

export function setFhlImageRuntimeConfig(nodeId: string, config: FhlImageRuntimeConfig) {
  runtimeConfigs.set(nodeId, config);
}

export function clearFhlImageRuntimeConfig(nodeId: string) {
  runtimeConfigs.delete(nodeId);
}

export async function runFhlImageRuntimeGeneration(input: {
  prompt: string;
  images?: string[];
  historyContext?: GenerationHistoryContextLike;
}): Promise<{ jobId: string; urls: string[] } | null> {
  const nodeId = input.historyContext?.sourceNodeId;
  const config = nodeId ? runtimeConfigs.get(nodeId) : undefined;
  if (!nodeId || !config?.active) return null;
  const images = Array.from(new Set((input.images || []).map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 10);
  const created = await createFhlJob({
    mode: images.length > 0 ? 'edit' : 'generate',
    prompt: input.prompt,
    fixedImages: images,
    quality: config.quality,
    aspect: config.aspect,
    outputFormat: config.outputFormat,
    count: 1,
    concurrency: 1,
    historyContext: { ...input.historyContext, prompt: input.prompt },
  });
  config.update?.({ fhlJobId: created.id, taskId: created.id, progress: `${Math.max(0, Math.min(100, created.progress || 0))}%` });
  for (;;) {
    const job = await getFhlJob(created.id);
    config.update?.({ fhlJobId: job.id, taskId: job.id, progress: `${Math.max(0, Math.min(100, job.progress || 0))}%` });
    if (TERMINAL.has(job.status)) {
      const urls = job.outputUrls || [];
      if (!urls.length) throw new Error(job.error || job.tasks.find((task) => task.error)?.error || `FHL 任务${job.status}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('penguin:generation-history-changed'));
        window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
      }
      return { jobId: job.id, urls };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
