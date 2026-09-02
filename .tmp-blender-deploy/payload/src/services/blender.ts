export type BlenderRenderPreset = 'draft' | 'final';

export interface BlenderRuntimeStatus {
  installed: boolean;
  executable?: string;
  version?: string;
  source?: string;
  error?: string;
  activeJobId?: string;
  queuedJobs: number;
}

export interface BlenderReview {
  phase: string;
  label: string;
  round: number;
  score: number;
  criticalIssues: string[];
  summary: string;
  revisionInstruction?: string;
}

export interface BlenderArtifacts {
  blendUrl: string;
  glbUrl: string;
  zipUrl: string;
  reportUrl: string;
  previewUrls: string[];
}

export interface BlenderJob {
  id: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  phase: string;
  progress: number;
  error?: string;
  queuePosition?: number;
  renderPreset: BlenderRenderPreset;
  runtime?: BlenderRuntimeStatus;
  researchMode?: 'web-search' | 'knowledge-fallback';
  planSummary?: string;
  reviews: BlenderReview[];
  warnings: string[];
  repairsUsed: number;
  artifacts?: BlenderArtifacts;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload.data as T;
}

export function getBlenderRuntimeStatus(path = '') {
  const query = path.trim() ? `?path=${encodeURIComponent(path.trim())}` : '';
  return request<BlenderRuntimeStatus>(`/api/blender/runtime/status${query}`);
}

export function createBlenderJob(payload: {
  llmKeyId: string;
  prompt: string;
  texts: Array<{ id: string; label?: string; text: string }>;
  images: Array<{ id: string; label?: string; url: string }>;
  renderPreset: BlenderRenderPreset;
  blenderPath?: string;
  historyContext?: Record<string, unknown>;
}) {
  return request<BlenderJob>('/api/blender/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getBlenderJob(id: string) {
  return request<BlenderJob>(`/api/blender/jobs/${encodeURIComponent(id)}`);
}

export function cancelBlenderJob(id: string) {
  return request<BlenderJob>(`/api/blender/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}
