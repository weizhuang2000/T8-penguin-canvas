import type { FhlConfigSummary, FhlJobRequest, FhlJobSnapshot } from '../types/canvas';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/fhl-image${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data?.error || `HTTP ${response.status}`);
  return data.data as T;
}

export function getFhlConfig(): Promise<FhlConfigSummary> {
  return call('/config');
}

export function addFhlWorker(input: { name: string; apiKey: string; enabled?: boolean }): Promise<FhlConfigSummary> {
  return call('/workers', { method: 'POST', body: JSON.stringify(input) });
}

export function updateFhlWorker(id: string, input: { name?: string; apiKey?: string; enabled?: boolean }): Promise<FhlConfigSummary> {
  return call(`/workers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteFhlWorker(id: string): Promise<FhlConfigSummary> {
  return call(`/workers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function importCodexFhlWorkers(): Promise<FhlConfigSummary> {
  return call('/workers/import-codex', { method: 'POST', body: '{}' });
}

export function createFhlJob(input: FhlJobRequest): Promise<FhlJobSnapshot> {
  return call('/jobs', { method: 'POST', body: JSON.stringify(input) });
}

export function getFhlJob(id: string): Promise<FhlJobSnapshot> {
  return call(`/jobs/${encodeURIComponent(id)}`);
}

export function cancelFhlJob(id: string): Promise<FhlJobSnapshot> {
  return call(`/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
}

export function resumeFhlJob(id: string): Promise<FhlJobSnapshot> {
  return call(`/jobs/${encodeURIComponent(id)}/resume`, { method: 'POST', body: '{}' });
}
