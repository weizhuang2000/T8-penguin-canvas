const BASE = '/api/qoder-cli';
const ROUTE_MISSING = 'Qoder CLI 后端路由未加载：请重启后端服务或桌面应用。';

export interface QoderCliStatus {
  available: boolean;
  executable?: string;
  version?: string;
  message?: string;
}

export interface QoderArtifact {
  id?: string;
  kind: 'text' | 'image' | 'video' | 'audio' | 'model3d' | 'file';
  title?: string;
  text?: string;
  url?: string;
  urls?: string[];
  status?: string;
  progress?: number;
}

export interface QoderImagePayload {
  nodeId?: string;
  sessionId?: string;
  nodeTitle?: string;
  prompt: string;
  images?: string[];
  model?: string;
  executablePath?: string;
  providerSource: string;
  providerId: string;
  providerModel: string;
  providerParams?: Record<string, unknown>;
  negativePrompt?: string;
  size?: string;
  imageSize?: string;
  aspectRatio?: string;
  quality?: string;
  count?: number;
  outputFormat?: 'png' | 'jpg';
}

export interface QoderImageResult {
  text?: string;
  reply?: string;
  imageUrl?: string;
  imageUrls?: string[];
  artifacts?: QoderArtifact[];
  workspace?: string;
  executable?: string;
  provider?: unknown;
  taskId?: string;
  [key: string]: unknown;
}

export interface QoderStreamEvent {
  event?: string;
  type?: string;
  delta?: string;
  text?: string;
  message?: string;
  error?: string;
  done?: boolean;
  artifact?: QoderArtifact;
  result?: QoderImageResult;
  [key: string]: unknown;
}

async function responseError(res: Response) {
  if (res.status === 404) return ROUTE_MISSING;
  try {
    const data = await res.json();
    return data?.error || data?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function getQoderCliStatus(executablePath?: string): Promise<QoderCliStatus> {
  const sp = new URLSearchParams();
  if (executablePath) sp.set('executablePath', executablePath);
  const res = await fetch(`${BASE}/status${sp.size ? `?${sp}` : ''}`);
  if (!res.ok) throw new Error(await responseError(res));
  const data = await res.json();
  if (data?.success === false) throw new Error(data.error || 'Qoder CLI 状态检查失败。');
  return data.data as QoderCliStatus;
}

function parseSse(raw: string): QoderStreamEvent | null {
  const lines = raw.split(/\r?\n/);
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
  const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    return event && !parsed.event ? { ...parsed, event } : parsed;
  } catch {
    return { event, text: data };
  }
}

function mergeArtifact(result: QoderImageResult, artifact: QoderArtifact) {
  const items = Array.isArray(result.artifacts) ? result.artifacts : [];
  if (!artifact.id || !items.some((item) => item.id === artifact.id)) items.push(artifact);
  result.artifacts = items;
  if (artifact.kind === 'image') {
    const urls = Array.isArray(artifact.urls) ? artifact.urls : (artifact.url ? [artifact.url] : []);
    result.imageUrls = Array.from(new Set([...(result.imageUrls || []), ...urls]));
    result.imageUrl = result.imageUrls[0] || '';
  }
}

export async function streamQoderImage(
  payload: QoderImagePayload,
  options: {
    signal?: AbortSignal;
    onDelta?: (delta: string, event?: QoderStreamEvent) => void;
    onEvent?: (event: QoderStreamEvent) => void;
  } = {},
): Promise<QoderImageResult> {
  const res = await fetch(`${BASE}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!res.ok) throw new Error(await responseError(res));
  if (!res.body) throw new Error('浏览器不支持 Qoder 流式响应。');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const result: QoderImageResult = {};
  let buffer = '';
  let reply = '';
  const consume = (chunk: string) => {
    const event = parseSse(chunk);
    if (!event) return false;
    options.onEvent?.(event);
    const eventName = String(event.event || event.type || '');
    if (event.error || eventName === 'turn.failed') throw new Error(String(event.error || event.message || 'Qoder 生图失败。'));
    const delta = String(event.delta || (eventName === 'message.delta' ? event.text || '' : ''));
    if (delta) {
      reply += delta;
      result.text = reply;
      result.reply = reply;
      options.onDelta?.(delta, event);
    }
    if (event.artifact) mergeArtifact(result, event.artifact);
    if (event.result) {
      Object.assign(result, event.result);
      for (const artifact of event.result.artifacts || []) mergeArtifact(result, artifact);
    }
    return event.done === true || eventName === 'done';
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split = buffer.indexOf('\n\n');
    while (split >= 0) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      if (consume(chunk)) return result;
      split = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) consume(buffer);
  return result;
}

export const qoderRouteMissingMessageForTests = (status: number) => status === 404 ? ROUTE_MISSING : `HTTP ${status}`;
