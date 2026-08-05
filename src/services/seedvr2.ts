const BASE = '/api/seedvr2';

export type Seedvr2ColorCorrection = 'wavelet' | 'none';
export type Seedvr2ResizeMethod = 'lanczos' | 'bicubic';

export interface Seedvr2UpscaleRequest {
  imageUrl: string;
  width: number;
  height: number;
  seed?: number;
  colorCorrection?: Seedvr2ColorCorrection;
  resizeMethod?: Seedvr2ResizeMethod;
  prompt?: string;
}

export interface Seedvr2UpscaleResult {
  imageUrl: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  requestedWidth: number;
  requestedHeight: number;
  seed: number;
  colorCorrection: Seedvr2ColorCorrection;
  resizeMethod: Seedvr2ResizeMethod;
  model: 'seedvr2-7b';
}

export async function runSeedvr2Upscale(payload: Seedvr2UpscaleRequest): Promise<Seedvr2UpscaleResult> {
  const response = await fetch(`${BASE}/upscale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(/^\s*</.test(text || '') ? 'SeedVR2 后端接口未就绪，请重启后端服务' : `SeedVR2 接口返回异常：${text.slice(0, 160)}`);
  }
  if (!response.ok || json?.success === false) throw new Error(json?.error || `HTTP ${response.status}`);
  return json.data as Seedvr2UpscaleResult;
}
