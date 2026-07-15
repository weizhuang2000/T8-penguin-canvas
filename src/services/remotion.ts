export type RemotionMode = 'json' | 'tsx';
export type RemotionQuality = 'standard' | 'professional';
export type RemotionStylePreset = 'auto' | 'cinematic' | 'editorial' | 'tech' | 'minimal' | 'playful';
export type RemotionRatio = '16:9' | '9:16' | '1:1';
export type RemotionResolution = '720p' | '1080p';
export type RemotionFps = 24 | 30 | 60;

export interface RemotionProfile {
  ratio: RemotionRatio;
  resolution: RemotionResolution;
  fps: RemotionFps;
  duration: number;
}

export interface RemotionAssetInput {
  id: string;
  kind: 'image' | 'video' | 'audio';
  url: string;
  label?: string;
}

export interface RemotionJob {
  id: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  phase: string;
  progress: number;
  error?: string;
  queuePosition?: number;
  videoUrl?: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  fileName?: string;
  size?: number;
}

export interface RemotionReview {
  round: number;
  score: number;
  summary?: string;
  criticalIssues?: string[];
}

export type RemotionSkillSupport = 'enabled' | 'adapted' | 'disabled';

export interface RemotionSkillSource {
  name: 'remotion-best-practices';
  pluginVersion: string;
  snapshot: string;
  repository?: string;
  license?: string;
}

export interface RemotionSkillRuleDetail {
  id: string;
  support: RemotionSkillSupport;
  phases: Array<'plan' | 'code' | 'repair' | 'review'>;
  reason?: string;
}

export interface RemotionGenerationJob {
  id: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  phase: string;
  progress: number;
  error?: string;
  queuePosition?: number;
  mode: RemotionMode;
  quality: RemotionQuality;
  source?: string;
  plan?: string;
  reviews: RemotionReview[];
  warnings: string[];
  skillVersion?: string;
  skillRules?: string[];
  skillSource?: RemotionSkillSource;
  skillRuleDetails?: RemotionSkillRuleDetail[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const detail = Array.isArray(payload?.data?.errors) && payload.data.errors.length
      ? `\n${payload.data.errors.join('\n')}`
      : '';
    throw new Error(`${payload.error || `HTTP ${response.status}`}${detail}`);
  }
  return payload.data as T;
}

export function getRemotionRuntimeStatus() {
  return request<{
    installed: boolean;
    executable?: string;
    phase: string;
    progress?: number;
    queuedJobs: number;
    skill: {
      version: string;
      source: RemotionSkillSource;
      ruleCount: number;
      capabilities: Record<RemotionSkillSupport, string[]>;
    };
  }>('/api/remotion/runtime/status');
}

export function validateRemotionSpec(payload: { mode: RemotionMode; source: string; assets: RemotionAssetInput[]; profile: RemotionProfile }) {
  return request<{ valid: true; spec?: unknown; source?: string; normalizations?: string[] }>('/api/remotion/spec/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function createRemotionGenerationJob(payload: {
  mode: RemotionMode;
  quality: RemotionQuality;
  stylePreset: RemotionStylePreset;
  llmKeyId: string;
  reviewLlmKeyId?: string;
  subject: string;
  texts: Array<{ id: string; label?: string; text: string }>;
  assets: RemotionAssetInput[];
  profile: RemotionProfile;
  historyContext?: Record<string, unknown>;
}) {
  return request<RemotionGenerationJob>('/api/remotion/generation-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getRemotionGenerationJob(id: string) {
  return request<RemotionGenerationJob>(`/api/remotion/generation-jobs/${encodeURIComponent(id)}`);
}

export function cancelRemotionGenerationJob(id: string) {
  return request<RemotionGenerationJob>(`/api/remotion/generation-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export function createRemotionJob(payload: {
  mode: RemotionMode;
  source: string;
  subject: string;
  assets: RemotionAssetInput[];
  profile: RemotionProfile;
  historyContext?: Record<string, unknown>;
}) {
  return request<RemotionJob>('/api/remotion/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getRemotionJob(id: string) {
  return request<RemotionJob>(`/api/remotion/jobs/${encodeURIComponent(id)}`);
}

export function cancelRemotionJob(id: string) {
  return request<RemotionJob>(`/api/remotion/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}
