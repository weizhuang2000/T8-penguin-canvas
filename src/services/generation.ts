/**
 * 鐢熸垚鏈嶅姟 - 灏佽浠ｇ悊璋冪敤
 * 鎵€鏈夎姹傝蛋 /api/proxy/* (鍚庣浼氭敞鍏ュ搴?Key 骞惰浆瀛樼粨鏋?
 */
import type { AdvancedProviderConfig } from '../types/canvas';

async function parseJsonResponse<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(`鎺ュ彛杩斿洖闈?JSON锛屽彲鑳芥槸涓婃父/浠ｇ悊涓存椂閿欒锛欻TTP ${res.status}銆傚搷搴旂墖娈碉細${preview}`);
  }
}

export interface GenerateImageRequest {
  model: string;          // 鑺傜偣 id (gpt-image-2 / nano-banana-2 / nano-banana-pro / grok-image)
  apiModel?: string;       // 涓婃父鐪熷疄妯″瀷鍚?浼樺厛浣跨敤)
  paramKind?: 'gpt-size' | 'banana-ratio' | 'grok-image' | 'mj';
  prompt: string;
  n?: number;
  // 涓诲弬鏁?鍙屽崗璁€氱敤):
  aspectRatio?: string;    // camelCase 鍏煎瀛楁锛屽悗绔粛浠?aspect_ratio 涓轰富
  aspect_ratio?: string;   // 1:1 / 16:9 / Auto 鈥?  sizeLevel?: string;      // camelCase 鍏煎瀛楁锛屽悗绔粛浠?image_size 涓轰富
  image_size?: string;     // 1K / 2K / 4K (banana) 鎴栧儚绱犱覆(GPT 涔熷彲閫忎紶)
  // 澶氬紶鍙傝€冨浘(base64 dataURL 鎴?http(s):// URL)
  images?: string[];
  quality?: string;
  seed?: number;
  // 鍏煎鏃у弬鏁?鑻ヤ紶浜?size(鍍忕礌涓?鍒欎紭鍏堢敤銆乮mage 鍗曞紶涔熶細骞跺叆 images
  size?: string;
  image?: string;
  outputFormat?: 'jpg' | 'png';
  historyContext?: GenerationHistoryContext;
}

export interface GenerationHistoryContext {
  canvasId?: string | null;
  sourceNodeId?: string;
  sourceNodeType?: string;
  nodeTitle?: string;
  seed?: number;
}

export interface GenerateImageResult {
  urls: string[]; // 鏈湴鐩稿 URL,濡?/files/output/xxx.png
  raw: any;
}

export async function generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
  const r = await fetch('/api/proxy/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data.data;
}

export interface GenerateExternalImageRequest {
  providerId: string;
  provider?: AdvancedProviderConfig;
  providerModel?: string;
  model?: string;
  prompt: string;
  size?: string;
  aspect_ratio?: string;
  image_size?: string;
  width?: number;
  height?: number;
  n?: number;
  images?: string[];
  outputFormat?: 'jpg' | 'png';
  videos?: string[];
  audios?: string[];
  negativePrompt?: string;
  negative?: string;
  seed?: number;
  providerParams?: Record<string, any>;
  historyContext?: GenerationHistoryContext;
  async?: boolean;
}

export interface GenerateExternalImageResult {
  imageUrls: string[];
  remoteImageUrls?: string[];
  videoUrls?: string[];
  audioUrls?: string[];
  text?: string;
  taskId?: string;
  status?: string;
  code?: string;
  error?: string;
  raw?: any;
  provider?: any;
}

export async function generateExternalImage(req: GenerateExternalImageRequest): Promise<GenerateExternalImageResult> {
  const r = await fetch('/api/proxy/external/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  const payload = data.data || {};
  return {
    imageUrls: Array.isArray(payload.imageUrls) ? payload.imageUrls : [],
    remoteImageUrls: Array.isArray(payload.remoteImageUrls) ? payload.remoteImageUrls : undefined,
    videoUrls: Array.isArray(payload.videoUrls) ? payload.videoUrls : undefined,
    audioUrls: Array.isArray(payload.audioUrls) ? payload.audioUrls : undefined,
    text: typeof payload.text === 'string' ? payload.text : undefined,
    taskId: payload.taskId,
    status: payload.status || data.code,
    code: data.code || payload.code,
    error: data.error || payload.error,
    raw: payload.raw,
    provider: payload.provider,
  };
}

export interface QueryExternalImageStatusRequest {
  providerId?: string;
  taskId: string;
  providerModel?: string;
  outputFormat?: 'jpg' | 'png';
}

export async function queryExternalImageStatus(req: QueryExternalImageStatusRequest): Promise<GenerateExternalImageResult> {
  const qs = new URLSearchParams();
  const isLocalJob = req.taskId.startsWith('external-image-');
  if (!isLocalJob && req.providerId) qs.set('providerId', req.providerId);
  if (!isLocalJob && req.providerModel) qs.set('providerModel', req.providerModel);
  if (req.outputFormat) qs.set('outputFormat', req.outputFormat);
  const query = qs.toString();
  const r = await fetch(`/api/proxy/external/image/status/${encodeURIComponent(req.taskId)}${query ? `?${query}` : ''}`);
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  const payload = data.data || {};
  return {
    imageUrls: Array.isArray(payload.imageUrls) ? payload.imageUrls : [],
    remoteImageUrls: Array.isArray(payload.remoteImageUrls) ? payload.remoteImageUrls : undefined,
    taskId: payload.taskId || req.taskId,
    status: payload.status || data.code,
    code: data.code || payload.code,
    error: data.error || payload.error,
    raw: payload.raw,
    provider: payload.provider,
  };
}

export interface GenerateExternalVideoRequest {
  providerId: string;
  providerModel?: string;
  model?: string;
  prompt: string;
  aspect_ratio?: string;
  ratio?: string;
  duration?: number | string;
  resolution?: string;
  seed?: number;
  images?: string[];
  videos?: string[];
  audios?: string[];
  providerParams?: Record<string, any>;
  historyContext?: GenerationHistoryContext;
}

export interface GenerateExternalVideoResult {
  videoUrls: string[];
  remoteVideoUrls?: string[];
  taskId?: string;
  raw?: any;
  provider?: any;
}

export async function generateExternalVideo(req: GenerateExternalVideoRequest): Promise<GenerateExternalVideoResult> {
  const r = await fetch('/api/proxy/external/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  const payload = data.data || {};
  return {
    videoUrls: Array.isArray(payload.videoUrls) ? payload.videoUrls : [],
    remoteVideoUrls: Array.isArray(payload.remoteVideoUrls) ? payload.remoteVideoUrls : undefined,
    taskId: payload.taskId,
    raw: payload.raw,
    provider: payload.provider,
  };
}

// ========================================================================
// 鍥惧儚寮傛浠诲姟(瀵归綈 gpt-image-2-web 鐨?submit + poll 妯″紡)
// submitImageAsync 杩?{ sync, taskId?, urls?, status, progress }
//   - sync=true: 鍚屾瀹屾垚,urls 宸插瓨鍦?//   - sync=false: 闇€杞 queryImageStatus(taskId)
// ========================================================================
export interface ImageSubmitResult {
  sync: boolean;
  taskId?: string;
  urls?: string[];
  status: string;       // pending / running / completed / failed
  progress: string;     // '0%' / '50%' / '100%'
  raw?: any;
}

export async function submitImageAsync(req: GenerateImageRequest): Promise<ImageSubmitResult> {
  const r = await fetch('/api/proxy/image/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface ImageQueryResult {
  status: string;       // pending / running / completed / failed
  progress: string;
  urls?: string[];
  error?: string;
}

// apiModel 閫忎紶缁欏悗绔紝璁╄疆璇㈤樁娈靛鐢ㄤ笌 submit 涓€鑷寸殑鍒嗙被 API Key
// (鍚﹀垯 hint 涓虹┖鏃朵細 fallback 鍒伴€氱敤 zhenzhenApiKey锛屽垎绫?key 澶辨晥)
export async function queryImageStatus(taskId: string, apiModel?: string, outputFormat?: 'jpg' | 'png', historyContext?: GenerationHistoryContext): Promise<ImageQueryResult> {
  const qs = new URLSearchParams();
  if (apiModel) qs.set('model', apiModel);
  if (outputFormat) qs.set('outputFormat', outputFormat);
  if (historyContext) qs.set('historyContext', JSON.stringify(historyContext));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const r = await fetch(`/api/proxy/image/status/${encodeURIComponent(taskId)}${query}`);
  const data = await parseJsonResponse(r);
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  // 澶辫触鐘舵€佷笅 success=false 浣嗚繑鍥?body 涓粛鍖呭惈 status:'failed'
  return data.data || { status: data.success ? 'pending' : 'failed', progress: '0%', error: data?.error };
}

// ========================================================================
// FAL 娓犻亾(鐙珛鎻愪氦 + 杞,瀵归綈 gpt-image-2-web runGPTFal / runNanoFal)
//   submitImageFal 杩?{ sync, urls? } 鎴?{ sync:false, requestId, responseUrl, endpoint }
//   queryImageFal  杩?{ status: 'pending'|'completed'|'failed', urls?, error? }
// ========================================================================
export interface FalSubmitRequest {
  /** 'gpt-image-2-fal' | 'nano-banana-pro-fal' */
  apiModel: string;
  prompt: string;
  /** 鍙傝€冨浘 URL(鏈湴 /files/* 鎴?base64 dataURI),鍚庣浼氫笂浼犲埌 /v1/files 鍙?URL */
  images?: string[];
  /** 鐢熸垚寮犳暟 1-4 */
  n?: number;
  /** 杈撳嚭鏍煎紡 png / jpeg / webp */
  format?: 'png' | 'jpeg' | 'webp';
  /** 鍚屾妯″紡(true 浼氬湪鎻愪氦璇锋眰涓檮鍔?sync_mode:true,鐧捐揪涓婃父濡傛灉鎺ュ彈浼氬悓姝ヨ繑 images) */
  sync?: boolean;

  // === gpt-fal 涓撳睘 ===
  /** 'edit' | 'gen';涓嶅～鏃舵湁鍙傝€冨浘璧?edit,鏃犲弬鑰冨浘璧?gen */
  mode?: 'edit' | 'gen';
  /** 'auto' / 'square_hd' / 'square' / 'portrait_4_3' / 'portrait_16_9' / 'landscape_4_3' / 'landscape_16_9' / 'custom' */
  size?: string;
  /** size === 'custom' 鏃舵湁鏁?鍚庣浼?snap 鍒?16 鍊嶆暟 */
  customW?: number;
  customH?: number;
  /** 'low' | 'medium' | 'high' | 'auto' 涓婚」鐩粯璁?medium */
  quality?: 'low' | 'medium' | 'high' | 'auto';

  // === nbpro-fal 涓撳睘 ===
  /** 'auto' / '21:9' / '16:9' / '3:2' / '4:3' / '5:4' / '1:1' / '4:5' / '3:4' / '2:3' / '9:16' */
  aspect_ratio?: string;
  /** '1K' / '2K' / '4K' */
  resolution?: string;
  /** '1'(涓?..'6'(鏉? 榛樿 '4' */
  safety_tolerance?: string;
  /** 0 = 涓嶄紶 */
  seed?: number;
  system_prompt?: string;
  enable_web_search?: boolean;
  /** 'image_url'(涓婁紶鐧捐揪鍙?URL) | 'base64' 榛樿 'image_url' */
  image_mode?: 'image_url' | 'base64';
  outputFormat?: 'jpg' | 'png';
  historyContext?: GenerationHistoryContext;
}

export interface FalSubmitResult {
  sync: boolean;
  urls?: string[];
  requestId?: string;
  responseUrl?: string;
  endpoint?: string;
}

export async function submitImageFal(req: FalSubmitRequest): Promise<FalSubmitResult> {
  const r = await fetch('/api/proxy/image/fal/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface FalQueryResult {
  status: 'pending' | 'completed' | 'failed' | string;
  urls?: string[];
  error?: string;
  falStatus?: string;
}

export async function queryImageFal(params: { responseUrl?: string; endpoint?: string; requestId?: string; outputFormat?: 'jpg' | 'png'; historyContext?: GenerationHistoryContext }): Promise<FalQueryResult> {
  const r = await fetch('/api/proxy/image/fal/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJsonResponse(r);
  // 鍚庣鍦?FAILED 鏃朵細 success=false 浣?data.status='failed',杩欓噷杩斿洖缁撴灉渚涗笂灞傚垽鏂?  if (!r.ok && !data.data) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data || { status: 'failed', error: data?.error || 'unknown' };
}

// ========== Midjourney (涓ユ牸瀵归綈 gpt-image-2-web/index.html runMJ L4437~L4694 + uploadMJImage L4407) ==========
// 鍚庣璺敱: /api/proxy/mj/imagine | /api/proxy/mj/task/:id | /api/proxy/mj/upload

export type MjSpeed = 'fast' | 'turbo' | 'relax';

export interface MjPromptParts {
  prompt: string;
  model?: string;       // 渚嬪 'v 8.1' / 'niji 7'
  ar?: string;          // 渚嬪 '1:1' / '16:9'
  no?: string;
  c?: number;
  s?: number;
  iw?: number;
  sw?: number;
  cw?: number;
  sv?: string;          // '1' | '2' | '3' | '4'
  srefUrls?: string[];  // --sref 椋庢牸鍙傝€冨浘 URL
  orefUrls?: string[];  // --oref 瑙掕壊鍙傝€冨浘 URL
}

/** 鎷艰 MJ prompt 鈥?涓?index.html L4467~L4485 涓ユ牸涓€鑷?*/
export function buildMjPrompt(p: MjPromptParts): string {
  let full = p.prompt || '';
  if (p.model) full += ` --${p.model}`;
  if (p.ar) full += ` --ar ${p.ar}`;
  if (p.no) full += ` --no ${p.no}`;
  if (p.c) full += ` --c ${p.c}`;
  if (p.s) full += ` --s ${p.s}`;
  if (p.iw) full += ` --iw ${p.iw}`;
  if (p.sw) full += ` --sw ${p.sw}`;
  if (p.cw) full += ` --cw ${p.cw}`;
  if (p.sv && p.sv !== '0' && p.sv !== '1') full += ` --sv ${p.sv}`;
  for (const u of p.srefUrls || []) if (u) full += ` --sref ${u}`;
  for (const u of p.orefUrls || []) if (u) full += ` --oref ${u}`;
  return full;
}

export interface MjImagineRequest {
  prompt: string;          // 宸茬粡鎷艰濂界殑瀹屾暣 prompt
  speed?: MjSpeed;
  base64Array?: string[];  // 閫氬父绌烘暟缁?鍙傝€冨浘璧?sref/oref URL)
  ar?: string;
  no?: string;
  c?: number;
  s?: number;
  iw?: number;
  sw?: number;
  cw?: number;
  sv?: string;
  seed?: number;
  remix?: boolean;
  historyContext?: GenerationHistoryContext;
}

export interface MjImagineResult {
  taskId: string;
  raw: any;
}

export async function submitMjImagine(req: MjImagineRequest): Promise<MjImagineResult> {
  const r = await fetch('/api/proxy/mj/imagine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  const upstream = data.data || {};
  // upstream.code === 1 琛ㄧず鎻愪氦鎴愬姛(涓婚」鐩?L4658)
  if (upstream.code !== undefined && upstream.code !== 1) {
    throw new Error(upstream.description || upstream.error || 'MJ imagine 鎻愪氦澶辫触');
  }
  const taskId = String(upstream.result || upstream.task_id || '');
  if (!taskId) throw new Error('鏈嬁鍒?MJ taskId: ' + JSON.stringify(upstream).slice(0, 200));
  return { taskId, raw: upstream };
}

export interface MjTaskResult {
  status: 'SUBMITTED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | string;
  progress?: string;
  imageUrl?: string;
  imageUrls?: string[];
  failReason?: string;
  raw: any;
}

export async function queryMjTask(taskId: string, speed: MjSpeed = 'fast', historyContext?: GenerationHistoryContext): Promise<MjTaskResult> {
  const qs = new URLSearchParams({ speed });
  if (historyContext) qs.set('historyContext', JSON.stringify(historyContext));
  const r = await fetch(`/api/proxy/mj/task/${encodeURIComponent(taskId)}?${qs.toString()}`);
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  const d = data.data || {};
  // 涓婚」鐩?L4675~L4694: image_urls 鍙兘鏄?JSON 瀛楃涓?/ 瀵硅薄鏁扮粍 / 瀛楃涓叉暟缁?  // 鍏冪礌鍙兘涓哄瓧绗︿覆 '...' 鎴栧璞?{ url: '...' }锛屽榻愪富椤圭洰鐢?x.url || x 鍏煎
  // 鍙﹀涓婃父瀛楁鍚嶅彲鑳戒负 snake_case (image_url/image_urls) 鎴?camelCase (imageUrl/imageUrls)
  let imageUrls: string[] | undefined;
  const rawList = d.image_urls ?? d.imageUrls;
  if (rawList) {
    let parsed: any = rawList;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { parsed = null; }
    }
    if (Array.isArray(parsed)) {
      imageUrls = parsed
        .map((x: any) => (typeof x === 'string' ? x : (x && (x.url || x.image_url || x.imageUrl)) || ''))
        .filter((u: any): u is string => typeof u === 'string' && !!u);
    }
  }
  return {
    status: d.status || 'IN_PROGRESS',
    progress: d.progress,
    imageUrl: d.image_url || d.imageUrl,
    imageUrls,
    failReason: d.fail_reason || d.failReason,
    raw: d,
  };
}

/** 涓婁紶鍙傝€冨浘(sref/oref)骞跺彇 URL 鈥?瀵瑰簲涓婚」鐩?uploadMJImage L4407 */
export async function uploadMjImage(file: File, speed: MjSpeed = 'fast'): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const r = await fetch('/api/proxy/mj/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data: dataUrl, speed }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  const url = data.data?.url || '';
  if (!url) throw new Error('MJ upload 鏈繑鍥?URL');
  return url;
}

// LLM
// content 鏀寔澶氭ā鎬?瀛楃涓?鎴?[{type:'text',text} | {type:'image_url',image_url:{url}} | {type:'video_url',video_url:{url}}]
// (瀵归綈 gpt-image-2-web _doSendChat 澶氭ā鎬佹牸寮? index.html L8106~L8123)
export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'image'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } };

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
}

export interface GenerateLlmRequest {
  model: string;
  messages: LlmMessage[];
  llmKeyId?: string;
  temperature?: number;
  max_tokens?: number;
  /** 瑙嗛浼犲叆鏂瑰紡锛歠rames 榛樿鐢ㄥ唴缃?ffmpeg 鎶藉叧閿抚锛沶ative-base64 鍙戦€佸帇缂╁師瑙嗛锛泆rl 杞粷瀵?URL銆?*/
  llmVideoMode?: 'frames' | 'native-base64' | 'compressed-base64' | 'url';
  videoMaxWidth?: number;
  videoMaxHeight?: number;
  videoMaxBase64Mb?: number;
  videoCrf?: number;
  /** 鍏抽敭甯фā寮忎笅鎶藉彇鐨勫抚鏁帮紝鍚庣浼氭寜瑙嗛鏃堕暱鍧囧寑鎶藉彇銆?*/
  videoFrameCount?: number;
  /** 娴佸紡寮€鍏?榛樿 false(闈炴祦寮? */
  stream?: boolean;
}

export interface GenerateLlmResult {
  content: string;
  /** 浠?gpt-image-2-all 绛夊嚭鍥炬ā鍨嬭繑鍥?*/
  imageUrls?: string[];
  raw: any;
  model: string;
}

export async function generateLlm(req: GenerateLlmRequest): Promise<GenerateLlmResult> {
  const r = await fetch('/api/proxy/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, stream: false }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data.data;
}

export interface GenerateExternalLlmRequest extends Omit<GenerateLlmRequest, 'stream'> {
  providerId: string;
  providerModel?: string;
  providerParams?: Record<string, any>;
}

export async function generateExternalLlm(req: GenerateExternalLlmRequest): Promise<GenerateLlmResult> {
  const r = await fetch('/api/proxy/external/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  const payload = data.data || {};
  return {
    content: payload.text || payload.content || '',
    imageUrls: Array.isArray(payload.imageUrls) ? payload.imageUrls : undefined,
    raw: payload.raw,
    model: req.model,
  };
}

/**
 * 娴佸紡 LLM 璋冪敤,鍚庣閫忎紶涓婃父 SSE銆? * @param req 璇锋眰(鑷姩娉ㄥ叆 stream:true)
 * @param opts.onDelta 姣忎釜澧為噺鐗囨鍥炶皟(瀹炴椂鎷兼帴)
 * @param opts.signal AbortSignal 鏀寔涓柇
 * @returns 鏈€缁堟嫾鎺ュ悗鐨勫畬鏁?content
 * 瀵归綈 gpt-image-2-web index.html L8262~L8295 娴佸紡瑙ｆ瀽閫昏緫銆? */
export async function generateLlmStream(
  req: GenerateLlmRequest,
  opts: { onDelta?: (chunk: string) => void; signal?: AbortSignal } = {}
): Promise<{ content: string }> {
  const r = await fetch('/api/proxy/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, stream: true }),
    signal: opts.signal,
  });
  if (!r.ok) {
    // 鍚庣鍦?stream 閿欒矾浠嶈繑 JSON
    let msg = `HTTP ${r.status}`;
    try {
      const j = await parseJsonResponse(r);
      msg = j?.error || msg;
    } catch (e: any) {
      msg = e?.message || msg;
    }
    throw new Error(msg);
  }
  if (!r.body) throw new Error('涓婃父鏈繑鍥炲彲璇绘祦');
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let assembled = '';
  let buffer = '';
  // SSE 鎸夎瑙ｆ瀽
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return { content: assembled };
      try {
        const j = JSON.parse(data);
        const delta = j?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length) {
          assembled += delta;
          opts.onDelta?.(delta);
        }
      } catch {
        /* 蹇冭烦鎴栦笉瀹屾暣 JSON 蹇界暐 */
      }
    }
  }
  return { content: assembled };
}

/** File 鈫?dataURL(瀵归綈涓婚」鐩?FileReader.readAsDataURL) */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result || ''));
    reader.onerror = () => reject(new Error('璇诲彇鏂囦欢澶辫触'));
    reader.readAsDataURL(file);
  });
}

// 鏂囦欢涓婁紶
export async function uploadFile(file: File): Promise<{ url: string; filename: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/api/files/upload', { method: 'POST', body: fd });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data.data;
}

// ========================================================================
// Video FAL 娓犻亾(鐙珛鎻愪氦 + 杞,瀵归綈 gpt-image-2-web runVeo3Fal / runGrokFal / runSora2Fal)
//   submitVideoFal 杩?{ sync, videoUrl? } 鎴?{ sync:false, requestId, responseUrl, endpoint }
//   queryVideoFal  杩?{ status: 'pending'|'completed'|'failed', videoUrl?, error? }
// ========================================================================
export interface VideoFalSubmitRequest {
  /** 'veo3.1-fal' | 'grok-video-fal' | 'grok-imagine-video-1.5' | 'sora-2' */
  apiModel: string;
  prompt: string;
  /** 鍙傝€冨浘(base64 dataURI 鎴栨湰鍦?/files/* URL) */
  images?: string[];
  /** veo-fal: '16:9' | '9:16' */
  aspect_ratio?: string;
  /** veo-fal: '8s' */
  duration?: string;
  /** veo-fal: '720p' | '1080p' | '4k';  grok-fal: '720p' | '480p' */
  resolution?: string;
  /** veo-fal: 鐢熸垚闊抽 */
  generate_audio?: boolean;
  /** veo-fal: 1-6 (榛樿 4) */
  safety_tolerance?: number;
  /** 鍙傝€冨浘涓婁紶鏂瑰紡: 'image_url'(涓婁紶鍙朥RL) | 'base64'锛汫rok 1.5 榛樿 base64 */
  image_mode?: 'image_url' | 'base64';
  /** grok-fal: 鏃堕暱绉掓暟 1-30 */
  gkDuration?: number;
  /** grok-fal: 姣斾緥 */
  gkRatio?: string;
  /** grok-fal: 鍥剧敓瑙嗛鍙栭鍥? 鍙傝€冪敓瑙嗛鍙栨渶澶?7 寮犲弬鑰冨浘 */
  gkMode?: 'image_to_video' | 'reference_to_video';
  /** grok-fal reference_to_video: 棰濆鍏綉鍙傝€冨浘 URL */
  gkReferenceUrls?: string[];
  /** sora-fal: auto | text_to_video | image_to_video */
  soraMode?: 'auto' | 'text_to_video' | 'image_to_video';
  /** sora-fal: '16:9' | '9:16' | 'auto' */
  soraRatio?: string;
  /** sora-fal: 鏃堕暱绉掓暟 4/8/12/16/20 */
  soraDuration?: number;
  /** sora-fal: '720p' | 'auto' */
  soraResolution?: string;
  /** sora-fal: 鏄惁鍒犻櫎涓婃父瑙嗛缂撳瓨 */
  soraDeleteVideo?: boolean;
  /** sora-fal: detect_and_block_ip */
  soraBlockIp?: boolean;
  /** sora-fal: 鏈€澶?2 涓?character id锛岄€楀彿鍒嗛殧 */
  soraCharacterIds?: string;
  historyContext?: GenerationHistoryContext;
}

export interface VideoFalSubmitResult {
  sync: boolean;
  videoUrl?: string;
  requestId?: string;
  responseUrl?: string;
  endpoint?: string;
}

export async function submitVideoFal(req: VideoFalSubmitRequest): Promise<VideoFalSubmitResult> {
  const r = await fetch('/api/proxy/video/fal/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface VideoFalQueryResult {
  status: 'pending' | 'completed' | 'failed' | string;
  videoUrl?: string;
  error?: string;
  falStatus?: string;
}

export async function queryVideoFal(params: { responseUrl?: string; endpoint?: string; requestId?: string; historyContext?: GenerationHistoryContext }): Promise<VideoFalQueryResult> {
  const r = await fetch('/api/proxy/video/fal/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok && !data.data) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data || { status: 'failed', error: data?.error || 'unknown' };
}

// ========================================================================
// 瑙嗛鐢熸垚(寮傛) 鈥?瀹屽叏瀵归綈 gpt-image-2-web
//   - veo3.1   瀛楁:  aspect_ratio + enhance_prompt + enable_upsample + seed + images(base64,鈮?)
//   - grok     瀛楁:  ratio + duration(绉?鏁板瓧) + resolution + seed + images(鏈湴 URL/base64,鈮?,鍚庣杞笂娓?URL)
//   - seedance 瀛楁:  娌跨敤 veo 瀛楁(闆剁牬鍧?
// 鍚庣閫氳繃 model 瀛楁鍚嶈嚜鍔ㄩ€夋嫨鍗忚,鍓嶇鏃犻渶鏄惧紡浼?kind銆?// ========================================================================
export interface VideoSubmitRequest {
  model: string;
  prompt: string;
  // Veo3.1
  aspect_ratio?: string;
  enhance_prompt?: boolean;
  enable_upsample?: boolean;
  // Grok Video
  ratio?: string;
  duration?: number;
  resolution?: string;
  // 閫氱敤
  seed?: number;
  /**
   * 鍙傝€冨浘銆?   *  - veo3.1:   base64 dataURL,鏈€澶?3 寮?   *  - grok:     鍙紶 base64 dataURL 鎴?/files/* 鏈湴 URL,鏈€澶?7 寮?鍚庣浼氫笂浼犲埌涓婃父 /v1/files 鍙?URL)
   *  - seedance: base64 dataURL,鏈€澶?3 寮?鍚?veo)
   */
  images?: string[];
  historyContext?: GenerationHistoryContext;
}

export async function submitVideo(req: VideoSubmitRequest): Promise<{ taskId: string }> {
  const r = await fetch('/api/proxy/video/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface VideoQueryResult {
  status: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'RUNNING' | string;
  progress?: string;
  videoUrl?: string | null;
  failReason?: string | null;
}

// model 閫忎紶缁欏悗绔紝璁╄疆璇㈤樁娈靛鐢ㄤ笌 submit 涓€鑷寸殑鍒嗙被 API Key
export async function queryVideo(taskId: string, model?: string, historyContext?: GenerationHistoryContext): Promise<VideoQueryResult> {
  const extra = model ? `&model=${encodeURIComponent(model)}` : '';
  const history = historyContext ? `&historyContext=${encodeURIComponent(JSON.stringify(historyContext))}` : '';
  const r = await fetch(`/api/proxy/video/query?taskId=${encodeURIComponent(taskId)}${extra}${history}`);
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

// ========================================================================
// Seedance 2.0 (寮傛) 鈥?瀹屽叏瀵归綈 gpt-image-2-web runSeedance / pollSeedance
//   submit: POST /api/proxy/seedance/submit
//   query : GET  /api/proxy/seedance/query?taskId=
// ========================================================================
export interface SeedanceSubmitRequest {
  /** 'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128' */
  model: string;
  prompt: string;
  /** 鏃堕暱(绉? 4..15 */
  duration?: number;
  /** 姣斾緥 16:9|9:16|1:1|4:3|3:4|21:9|9:21|adaptive */
  ratio?: string;
  /** 鍒嗚鲸鐜?480p|720p|native1080p|1080p|2k|4k */
  resolution?: string;
  /** 鐢熸垚闊抽锛堥粯璁?true锛?*/
  generate_audio?: boolean;
  /** 杩斿洖鏈抚 */
  return_last_frame?: boolean;
  /** 姘村嵃 */
  watermark?: boolean;
  /** 鍚敤 web_search 宸ュ叿 */
  web_search?: boolean;
  /** 闅忔満绉嶅瓙 -1=涓嶄紶 */
  seed?: number;
  /** 棣栧抚鍙傝€?base64 dataURL 鎴?/files/* URL)锛屽悗绔細涓婁紶鍙?URL */
  firstFrame?: string;
  /** 鏈抚鍙傝€?闇€涓?firstFrame 鍚屾椂浼? */
  lastFrame?: string;
  /** 鍙傝€冨浘澶氬紶(reference_image) */
  refImages?: string[];
  /** 鍙傝€冭棰?URL 澶氫釜 */
  videos?: string[];
  /** 鍙傝€冮煶棰?URL 澶氫釜 */
  audios?: string[];
  historyContext?: GenerationHistoryContext;
}

export async function submitSeedance(req: SeedanceSubmitRequest): Promise<{ taskId: string }> {
  const r = await fetch('/api/proxy/seedance/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface SeedanceQueryResult {
  /** 'pending' | 'running' | 'succeeded' | 'failed' (宸插悗绔綊涓€) */
  status: string;
  progress?: string;
  videoUrl?: string | null;
  failReason?: string | null;
}

export async function querySeedance(taskId: string, historyContext?: GenerationHistoryContext): Promise<SeedanceQueryResult> {
  const history = historyContext ? `&historyContext=${encodeURIComponent(JSON.stringify(historyContext))}` : '';
  const r = await fetch(`/api/proxy/seedance/query?taskId=${encodeURIComponent(taskId)}${history}`);
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

// ========================================================================
// 闊抽 Suno(寮傛)
// 瀹屽叏瀵归綈涓婚」鐩?gpt-image-2-web 鐨?runSuno / runSunoCover / runSunoExtend
// ========================================================================
export type AudioMode = 'generate' | 'cover' | 'extend';
export interface AudioSubmitRequest {
  mode: AudioMode;
  prompt?: string;
  title?: string;
  tags?: string;
  /**
   * Suno 鐗堟湰鍙凤細鎺ㄨ崘浼犱富椤圭洰鍘熷鍊?(v3.0 / v3.5 / v4 / v4.5 / v4.5+ / v5 / v5.5)銆?   * 鍚庣 resolveSunoMv() 鍚屾椂鍏煎甯?'suno-' 鍓嶇紑鐨勬棫璋冪敤鏂?(濡?'suno-v5.5')銆?   */
  version?: string;
  seed?: number;
  continue_clip_id?: string;
  continue_at?: number;
  cover_clip_id?: string;
  historyContext?: GenerationHistoryContext;
}

export async function submitAudio(
  req: AudioSubmitRequest,
): Promise<{ taskId: string; clipIds: string[] }> {
  const r = await fetch('/api/proxy/audio/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface AudioTrack {
  id: string;
  clipId?: string;
  audioUrl: string;
  /** 涓婃父鍘熷 URL锛堝悗绔?saveLocal=true 鏃跺悓鏃惰繑鍥烇級 */
  remoteUrl?: string;
  imageUrl?: string;
  title?: string;
  tags?: string;
  duration?: number;
}
export interface AudioQueryResult {
  status: 'PENDING' | 'SUCCESS' | string;
  tracks: AudioTrack[];
  total: number;
  completed: number;
}

/**
 * 杞 Suno feed銆? * @param clipIds 浠诲姟涓殑 clip id 鍒楄〃
 * @param saveLocal 鏄惁璁╁悗绔皢瀹屾垚鐨勯煶棰戣浆瀛樺埌鏈湴 output锛堥粯璁?true锛? */
export async function queryAudio(clipIds: string[], saveLocal: boolean = true, historyContext?: GenerationHistoryContext): Promise<AudioQueryResult> {
  const ids = clipIds.join(',');
  const params = new URLSearchParams({ clipIds: ids, saveLocal: String(saveLocal) });
  if (historyContext) params.set('historyContext', JSON.stringify(historyContext));
  const r = await fetch(`/api/proxy/audio/query?${params.toString()}`);
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

/**
 * 灏嗘湰鍦伴煶棰戜笂浼犵粰 Suno 骞惰幏鍙?clipId锛堢敤浜?cover/extend 妯″紡锛夈€? * 鍚庣浠ｇ悊 _sunoUploadAudio 鐨?5 姝ユ祦绋嬨€? */
export async function uploadAudioForSuno(
  file: File,
): Promise<{ clipId: string; uploadId: string; filename: string; size: number; mime: string }> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const r = await fetch('/api/proxy/audio/upload', { method: 'POST', body: fd });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

// ========================================================================
// RunningHub 宸ヤ綔娴?寮傛)
// v1.2.9.16: 鍙栨秷 rhWalletApiKey / useWallet 鍒嗚矾 鈥斺€?// RH 閽卞寘搴旂敤鑺傜偣涓庢櫘閫?RunningHub 鑺傜偣缁熶竴浣跨敤 settings.rhApiKey銆?// ========================================================================
export interface RhSubmitRequest {
  webappId: string;
  nodeInfoList?: Array<{ nodeId: string; fieldName: string; fieldValue: any }>;
  instanceType?: string;
}

export async function submitRh(req: RhSubmitRequest): Promise<{ taskId: string }> {
  const r = await fetch('/api/proxy/runninghub/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface RhQueryResult {
  status: 'PENDING' | 'SUCCESS' | 'RUNNING' | 'QUEUED' | 'FAILED' | string;
  urls: string[];
  failReason?: string | null;
  code?: number;
}

export async function queryRh(taskId: string, historyContext?: GenerationHistoryContext): Promise<RhQueryResult> {
  const qs = new URLSearchParams({ taskId });
  if (historyContext) qs.set('historyContext', JSON.stringify(historyContext));
  const url = `/api/proxy/runninghub/query?${qs.toString()}`;
  const r = await fetch(url);
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export async function fetchRhAppInfo(webappId: string): Promise<any> {
  const url = `/api/proxy/runninghub/app-info?webappId=${encodeURIComponent(webappId)}`;
  const r = await fetch(url);
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

/**
 * 涓婁紶浠绘剰鏈湴/杩滅▼绱犳潗鍒?RunningHub锛屾嬁鍒板唴閮?fileName銆? * 鐢ㄤ簬 RhConfigNode / RunningHubNode 涓?valueType=image|video|audio 鐨勬潯鐩彁浜ゅ墠鐨勮祫婧愯浆鎹€? */
export async function uploadRhAsset(url: string): Promise<{ fileName: string; fileType: string }> {
  const r = await fetch('/api/proxy/runninghub/upload-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

// ============================================================================
// (鍘熷穿婧冨墠閬楃暀鐨?MJ 浠ｇ爜鍧楀凡绉婚櫎; MJ 瀹炵幇鍙傝涓婃柟 buildMjPrompt / submitMjImagine / queryMjTask / uploadMjImage 鍙?fileToDataUrl)
// ============================================================================
