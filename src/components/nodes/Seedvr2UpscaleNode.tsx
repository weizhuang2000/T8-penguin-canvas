import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes } from '@xyflow/react';
import { AlertCircle, CheckCircle2, ImageUp, Loader2, Sparkles } from 'lucide-react';
import { getMediaItemsFromData } from '../../utils/mediaCollection';
import { runSeedvr2Upscale, type Seedvr2ColorCorrection, type Seedvr2OutputFormat, type Seedvr2ResizeMethod } from '../../services/seedvr2';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useHasAutoOutput } from './useHasAutoOutput';
import SmartImage from '../SmartImage';
import { useCanvasRuntime } from './canvasRuntimeContext';

const MAX_PIXELS = 34_000_000;
const SCALE_OPTIONS = [1, 2, 3, 4] as const;

type Size = { width: number; height: number };

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function exactRatioTarget(source: Size, value: number, axis: 'width' | 'height'): Size {
  const divisor = gcd(source.width, source.height);
  const ratioWidth = source.width / divisor;
  const ratioHeight = source.height / divisor;
  const ratioAxis = axis === 'width' ? ratioWidth : ratioHeight;
  const minimumMultiplier = divisor;
  const multiplier = Math.max(minimumMultiplier, Math.round((Number(value) || 0) / ratioAxis));
  return { width: ratioWidth * multiplier, height: ratioHeight * multiplier };
}

function loadImageSize(url: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (width > 0 && height > 0) resolve({ width, height });
      else reject(new Error('无法读取原图尺寸'));
    };
    image.onerror = () => reject(new Error('无法加载上游图片'));
    image.src = url;
  });
}

function collectUpstreamImages(id: string, edges: any[], nodes: any[]): string[] {
  const sourceIds = edges.filter((edge) => edge.target === id).map((edge) => edge.source);
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const sourceId of sourceIds) {
    const node = nodes.find((item) => item.id === sourceId);
    for (const media of getMediaItemsFromData(node?.data || {}, 'image')) {
      if (!media.url || seen.has(media.url)) continue;
      seen.add(media.url);
      urls.push(media.url);
    }
  }
  return urls;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>{children}</label>;
}

function Seedvr2UpscaleNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const update = useUpdateNodeData(id);
  const edges = useEdges();
  const nodes = useNodes();
  const hasAutoOutput = useHasAutoOutput(id);
  const { loadedCanvasId } = useCanvasRuntime();
  const d = data || {};
  const [sourceSize, setSourceSize] = useState<Size | null>(null);
  const [sizeError, setSizeError] = useState('');
  const [localError, setLocalError] = useState('');
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');

  const inputImages = useMemo(() => collectUpstreamImages(id, edges, nodes), [id, edges, nodes]);
  const inputImage = inputImages.length === 1 ? inputImages[0] : '';
  const sizeMode = d.seedvr2SizeMode === 'custom' ? 'custom' : 'scale';
  const scale = SCALE_OPTIONS.includes(Number(d.seedvr2Scale) as any) ? Number(d.seedvr2Scale) : 2;
  const seed = Number.isSafeInteger(Number(d.seedvr2Seed)) ? Number(d.seedvr2Seed) : 42;
  const colorCorrection: Seedvr2ColorCorrection = d.seedvr2ColorCorrection === 'none' ? 'none' : 'wavelet';
  const resizeMethod: Seedvr2ResizeMethod = d.seedvr2ResizeMethod === 'bicubic' ? 'bicubic' : 'lanczos';
  const outputFormat: Seedvr2OutputFormat = d.seedvr2OutputFormat === 'png' ? 'png' : 'jpg';
  const prompt = typeof d.seedvr2Prompt === 'string' ? d.seedvr2Prompt : 'Upscale this image';
  const status = d.status || 'idle';
  const outputUrl = typeof d.imageUrl === 'string' ? d.imageUrl : '';

  useEffect(() => {
    let cancelled = false;
    setSourceSize(null);
    setSizeError('');
    if (!inputImage) return () => { cancelled = true; };
    loadImageSize(inputImage)
      .then((size) => {
        if (cancelled) return;
        setSourceSize(size);
        const initial = exactRatioTarget(size, Number(d.seedvr2CustomWidth) || size.width * 2, 'width');
        setCustomWidth(String(initial.width));
        setCustomHeight(String(initial.height));
      })
      .catch((error: any) => { if (!cancelled) setSizeError(error?.message || '无法读取原图尺寸'); });
    return () => { cancelled = true; };
  }, [inputImage, d.seedvr2CustomWidth]);

  const targetSize = useMemo<Size | null>(() => {
    if (!sourceSize) return null;
    if (sizeMode === 'scale') return { width: sourceSize.width * scale, height: sourceSize.height * scale };
    return exactRatioTarget(sourceSize, Number(customWidth) || sourceSize.width * 2, 'width');
  }, [sourceSize, sizeMode, scale, customWidth]);
  const targetPixels = targetSize ? targetSize.width * targetSize.height : 0;
  const targetValid = !!targetSize && targetPixels <= MAX_PIXELS;
  const validationValid = inputImages.length === 1 && !sizeError && targetValid;
  const validationMessage = inputImages.length === 0
    ? '请连接一张上游图片'
    : inputImages.length > 1
      ? `检测到 ${inputImages.length} 张图片，每次仅支持一张；批量素材请使用循环器`
      : sizeError
        ? sizeError
        : !targetSize
          ? '正在读取原图尺寸'
          : targetPixels > MAX_PIXELS
            ? `目标尺寸 ${(targetPixels / 1_000_000).toFixed(2)} MP，超过 34 MP 上限`
            : `${(targetPixels / 1_000_000).toFixed(2)} MP / 34 MP`;

  const changeCustom = (raw: string, axis: 'width' | 'height') => {
    if (axis === 'width') setCustomWidth(raw);
    else setCustomHeight(raw);
    const value = Number(raw);
    if (!sourceSize || !Number.isFinite(value) || value <= 0) return;
    const target = exactRatioTarget(sourceSize, value, axis);
    if (axis === 'width') setCustomHeight(String(target.height));
    else setCustomWidth(String(target.width));
  };

  const commitCustom = (value: number, axis: 'width' | 'height') => {
    if (!sourceSize) return;
    const target = exactRatioTarget(sourceSize, value, axis);
    setCustomWidth(String(target.width));
    setCustomHeight(String(target.height));
    update({ seedvr2CustomWidth: target.width, seedvr2CustomHeight: target.height });
  };

  const switchSizeMode = (mode: 'scale' | 'custom') => {
    if (mode === 'custom' && sourceSize) {
      const current = { width: sourceSize.width * scale, height: sourceSize.height * scale };
      setCustomWidth(String(current.width));
      setCustomHeight(String(current.height));
      update({ seedvr2SizeMode: mode, seedvr2CustomWidth: current.width, seedvr2CustomHeight: current.height });
    } else {
      update({ seedvr2SizeMode: mode });
    }
  };

  const handleRun = async () => {
    setLocalError('');
    if (inputImages.length === 0) {
      const message = '请连接一张上游图片';
      setLocalError(message);
      update({ status: 'error', error: message });
      return;
    }
    if (inputImages.length !== 1) {
      const message = 'SeedVR2 每次运行仅支持一张图片，请使用循环器串行处理';
      setLocalError(message);
      update({ status: 'error', error: message });
      return;
    }
    let naturalSize = sourceSize;
    try {
      if (!naturalSize) naturalSize = await loadImageSize(inputImages[0]);
    } catch (error: any) {
      const message = error?.message || '无法读取原图尺寸';
      setLocalError(message);
      update({ status: 'error', error: message });
      return;
    }
    const target = sizeMode === 'scale'
      ? { width: naturalSize.width * scale, height: naturalSize.height * scale }
      : exactRatioTarget(naturalSize, Number(customWidth) || naturalSize.width * 2, 'width');
    if (target.width * target.height > MAX_PIXELS) {
      const message = '目标尺寸超过 3400 万像素，请降低倍数或目标尺寸';
      setLocalError(message);
      update({ status: 'error', error: message });
      return;
    }

    update({ status: 'running', error: '', imageUrl: '', imageUrls: [], urls: [] });
    try {
      const result = await runSeedvr2Upscale({
        imageUrl: inputImages[0],
        width: target.width,
        height: target.height,
        seed,
        colorCorrection,
        resizeMethod,
        prompt: prompt.trim() || 'Upscale this image',
        outputFormat,
        historyContext: {
          canvasId: loadedCanvasId,
          sourceNodeId: id,
          sourceNodeType: 'seedvr2-upscale',
          nodeTitle: String(d.label || 'SeedVR2 超分'),
        },
      });
      update({
        status: 'success',
        error: '',
        imageUrl: result.imageUrl,
        imageUrls: [result.imageUrl],
        urls: [result.imageUrl],
        seedvr2Result: result,
        metadata: { ...(d.metadata || {}), seedvr2Result: result },
      });
    } catch (error: any) {
      const message = error?.message || 'SeedVR2 超分失败';
      setLocalError(message);
      update({ status: 'error', error: message });
    }
  };

  useRunTrigger(id, handleRun, 'seedvr2-upscale');
  const error = localError || sizeError || d.error || '';

  return (
    <div
      className={`t8-node overflow-hidden ${selected ? 'ring-2' : ''}`}
      style={{
        width: 390,
        borderColor: selected ? '#22d3ee' : 'var(--t8-border-strong)',
        boxShadow: selected ? '0 0 0 2px rgba(34,211,238,.25)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#22d3ee', border: '1px solid var(--t8-bg-node)' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#22d3ee', border: '1px solid var(--t8-bg-node)' }} />

      <div className="t8-node-header flex items-center gap-2 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-400/20 text-cyan-300"><ImageUp size={17} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">SeedVR2 超分</div>
          <div className="truncate text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>seedvr2-7b · 单图 · 最高 3400 万像素</div>
        </div>
      </div>

      <div className="nodrag space-y-3 p-3" onMouseDown={(event) => event.stopPropagation()}>
        <div className="grid grid-cols-2 gap-2 rounded border p-2 text-[10px]" style={{ borderColor: 'var(--t8-border)' }}>
          <div><span style={{ color: 'var(--t8-text-dim)' }}>原图</span><div className="font-semibold">{sourceSize ? `${sourceSize.width} × ${sourceSize.height}` : inputImages.length > 1 ? `${inputImages.length} 张输入` : '等待图片'}</div></div>
          <div><span style={{ color: 'var(--t8-text-dim)' }}>目标</span><div className="font-semibold">{targetSize ? `${targetSize.width} × ${targetSize.height}` : '—'}</div></div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`rounded border px-2 py-1 text-xs ${sizeMode === 'scale' ? 'border-cyan-400 bg-cyan-400/15 text-cyan-300' : ''}`} onClick={() => switchSizeMode('scale')}>放大倍数</button>
          <button type="button" className={`rounded border px-2 py-1 text-xs ${sizeMode === 'custom' ? 'border-cyan-400 bg-cyan-400/15 text-cyan-300' : ''}`} onClick={() => switchSizeMode('custom')}>自定义尺寸</button>
        </div>

        {sizeMode === 'scale' ? (
          <div className="space-y-1"><FieldLabel>放大倍数</FieldLabel><select className="t8-select nowheel w-full px-2 py-1 text-xs" value={scale} onChange={(event) => update({ seedvr2Scale: Number(event.target.value) })}>{SCALE_OPTIONS.map((value) => <option key={value} value={value}>{value}×</option>)}</select></div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><FieldLabel>目标宽度</FieldLabel><input className="t8-input nowheel w-full px-2 py-1 text-xs" type="number" min={1} value={customWidth} onChange={(event) => changeCustom(event.target.value, 'width')} onBlur={() => commitCustom(Number(customWidth), 'width')} /></div>
            <div className="space-y-1"><FieldLabel>目标高度</FieldLabel><input className="t8-input nowheel w-full px-2 py-1 text-xs" type="number" min={1} value={customHeight} onChange={(event) => changeCustom(event.target.value, 'height')} onBlur={() => commitCustom(Number(customHeight), 'height')} /></div>
          </div>
        )}

        <div className={`flex items-start gap-1 text-[10px] ${validationValid ? 'text-emerald-400' : 'text-rose-400'}`}>
          {validationValid ? <CheckCircle2 size={11} className="mt-0.5 shrink-0" /> : <AlertCircle size={11} className="mt-0.5 shrink-0" />}
          <span>{validationMessage}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><FieldLabel>随机种子</FieldLabel><input className="t8-input nowheel w-full px-2 py-1 text-xs" type="number" step={1} value={seed} onChange={(event) => update({ seedvr2Seed: Math.trunc(Number(event.target.value) || 0) })} /></div>
          <div className="space-y-1"><FieldLabel>颜色校正</FieldLabel><select className="t8-select nowheel w-full px-2 py-1 text-xs" value={colorCorrection} onChange={(event) => update({ seedvr2ColorCorrection: event.target.value })}><option value="wavelet">wavelet</option><option value="none">none</option></select></div>
          <div className="col-span-2 space-y-1"><FieldLabel>缩放算法</FieldLabel><select className="t8-select nowheel w-full px-2 py-1 text-xs" value={resizeMethod} onChange={(event) => update({ seedvr2ResizeMethod: event.target.value })}><option value="lanczos">lanczos · 更锐利</option><option value="bicubic">bicubic · 更平滑</option></select></div>
          <div className="col-span-2 space-y-1"><FieldLabel>保存格式</FieldLabel><select className="t8-select nowheel w-full px-2 py-1 text-xs" value={outputFormat} onChange={(event) => update({ seedvr2OutputFormat: event.target.value })}><option value="jpg">JPG · 高质量 100 / 4:4:4</option><option value="png">PNG · 无损</option></select></div>
        </div>

        <div className="space-y-1"><FieldLabel>处理指令</FieldLabel><textarea className="t8-input nowheel w-full resize-y px-2 py-1 text-xs" rows={2} value={prompt} onChange={(event) => update({ seedvr2Prompt: event.target.value })} /></div>

        <button type="button" onClick={handleRun} disabled={status === 'running' || !validationValid} className="flex w-full items-center justify-center gap-1.5 rounded bg-cyan-500/20 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/30 disabled:opacity-50">
          {status === 'running' ? <><Loader2 size={12} className="animate-spin" />超分处理中</> : <><Sparkles size={12} />运行超分</>}
        </button>

        {error && <div className="flex items-start gap-1 rounded border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300"><AlertCircle size={11} className="mt-0.5 shrink-0" /><span className="break-all">{error}</span></div>}
      </div>

      {outputUrl && !hasAutoOutput && <div className="border-t p-2" style={{ borderColor: 'var(--t8-border)' }}><SmartImage src={outputUrl} alt="SeedVR2 超分结果" className="w-full rounded object-contain" thumbSize={720} /></div>}
    </div>
  );
}

export default memo(Seedvr2UpscaleNode);
