import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import SmartImage from '../SmartImage';
import { Boxes, Image as ImageIcon, Layers, Loader2, Play, RotateCw, Trash2, X } from 'lucide-react';
import { EXHIBITION_IMAGE_HANDLE_COLOR } from '../../config/portTypes';
import { IMAGE_MODELS } from '../../providers/models';
import { generateExternalImage, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import { advancedProviderModelOptions, advancedProvidersForNode, externalImageSizeFor, resolveAdvancedProviderSelection } from '../../utils/advancedProviders';
import {
  REVERSE_ISOMETRIC_DIRECTIONS,
  REVERSE_ISOMETRIC_FLOOR_MATERIALS,
  buildReverseIsometricPrompt,
  describeWallAdjacentExhibits,
  normalizeReverseIsometricDirection,
  normalizeReverseIsometricLayoutItems,
  patchReverseIsometricLayoutItem,
  type ReverseIsometricLayoutItem,
} from '../../utils/reverseIsometricDesignData.js';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import NodeHelpButton from './NodeHelpButton';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_POLLS = 300;
const POLL_INTERVAL = 3000;

export interface ReverseIsometricInputImageItem { id: string; url: string; label: string }
type DragMode = 'move' | 'scale' | 'stretch-x' | 'stretch-y' | 'rotate';
interface DragSession { mode: DragMode; item: ReverseIsometricLayoutItem; pointerId: number; startX: number; startY: number; stageWidth: number; stageHeight: number; centerX: number; centerY: number; startAngle: number }

function imagesFromData(data: any): string[] {
  const output: string[] = [];
  const push = (value: unknown) => {
    const url = typeof value === 'string' ? value.trim() : '';
    if (url && !output.includes(url)) output.push(url);
  };
  push(data?.imageUrl);
  for (const key of ['imageUrls', 'urls', 'generatedImages', 'referenceImages']) {
    if (Array.isArray(data?.[key])) data[key].forEach(push);
  }
  return output;
}

export function useHandleImages(nodeId: string, handle: string, firstOnly = false): ReverseIsometricInputImageItem[] {
  const connections = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(() => Array.from(new Set(connections
    .filter((connection: any) => String(connection.targetHandle || '') === handle)
    .map((connection: any) => connection.source)
    .filter(Boolean))), [connections, handle]);
  const nodesData = useNodesData(sourceIds);
  return useMemo(() => {
    const output: ReverseIsometricInputImageItem[] = [];
    const seen = new Set<string>();
    const list = Array.isArray(nodesData) ? nodesData : [nodesData];
    for (const node of list) {
      const urls = imagesFromData((node as any)?.data || {});
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        output.push({ id: `${(node as any)?.id || 'node'}:${handle}:${output.length}`, url, label: (url.split('/').pop() || `图片 ${output.length + 1}`).split('?')[0] });
        if (firstOnly) return output;
      }
    }
    return output;
  }, [firstOnly, handle, nodesData]);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法读取图片：${src}`));
    image.src = src;
  });
}

export async function buildReverseIsometricLayoutReference(planUrl: string, items: ReverseIsometricLayoutItem[]): Promise<string> {
  const plan = await loadImage(planUrl);
  const naturalWidth = plan.naturalWidth || plan.width || 1;
  const naturalHeight = plan.naturalHeight || plan.height || 1;
  const scale = Math.min(1, 1600 / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(320, Math.round(naturalWidth * scale));
  canvas.height = Math.max(320, Math.round(naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法创建排版参考图');
  context.drawImage(plan, 0, 0, canvas.width, canvas.height);
  const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex);
  const images = await Promise.all(sorted.map((item) => loadImage(item.url).catch(() => null)));
  sorted.forEach((item, index) => {
    const image = images[index];
    if (!image) return;
    const x = item.xRatio * canvas.width;
    const y = item.yRatio * canvas.height;
    const width = item.widthRatio * canvas.width;
    const height = item.heightRatio * canvas.height;
    context.save();
    context.translate(x + width / 2, y + height / 2);
    context.rotate(item.rotationDeg * Math.PI / 180);
    const sourceWidth = image.naturalWidth || image.width || 1;
    const sourceHeight = image.naturalHeight || image.height || 1;
    context.drawImage(
      image,
      item.cropX * sourceWidth,
      item.cropY * sourceHeight,
      item.cropWidth * sourceWidth,
      item.cropHeight * sourceHeight,
      -width / 2,
      -height / 2,
      width,
      height,
    );
    context.restore();
  });
  return canvas.toDataURL('image/png');
}

export function ReverseIsometricLayoutModal({ open, planUrl, allowBlankStage = false, aspectRatio = '1 / 1', title = '反推轴侧 · 手动排版', hallLengthMm, hallWidthMm, items, disabled, onChange, onDimensionsChange, onClose, onReset }: {
  open: boolean; planUrl: string; items: ReverseIsometricLayoutItem[]; disabled: boolean;
  allowBlankStage?: boolean; aspectRatio?: string; title?: string; hallLengthMm?: number; hallWidthMm?: number;
  onChange: (items: ReverseIsometricLayoutItem[]) => void; onClose: () => void; onReset: () => void;
  onDimensionsChange?: (dimensions: { hallLengthMm: number; hallWidthMm: number }) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const draftRef = useRef(items);
  const [draft, setDraft] = useState(items);
  const [selectedId, setSelectedId] = useState(items[0]?.id || '');
  const selected = draft.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    if (!open || dragRef.current) return;
    draftRef.current = items;
    setDraft(items);
    setSelectedId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id || ''));
  }, [items, open]);

  const setItems = (next: ReverseIsometricLayoutItem[], commit = false) => {
    draftRef.current = next;
    setDraft(next);
    if (commit) onChange(next);
  };

  const startDrag = (event: ReactPointerEvent, item: ReverseIsometricLayoutItem, mode: DragMode) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + (item.xRatio + item.widthRatio / 2) * rect.width;
    const centerY = rect.top + (item.yRatio + item.heightRatio / 2) * rect.height;
    dragRef.current = { mode, item, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, stageWidth: rect.width, stageHeight: rect.height, centerX, centerY, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) };
    setSelectedId(item.id);
  };

  useEffect(() => {
    if (!open) return;
    const move = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      event.preventDefault();
      const dx = (event.clientX - session.startX) / Math.max(1, session.stageWidth);
      const dy = (event.clientY - session.startY) / Math.max(1, session.stageHeight);
      let patch: Partial<ReverseIsometricLayoutItem> = {};
      if (session.mode === 'move') patch = { xRatio: session.item.xRatio + dx, yRatio: session.item.yRatio + dy };
      if (session.mode === 'stretch-x') patch = { widthRatio: session.item.widthRatio + dx };
      if (session.mode === 'stretch-y') patch = { heightRatio: session.item.heightRatio + dy };
      if (session.mode === 'scale') {
        const factor = Math.max(0.1, 1 + Math.max(dx / Math.max(0.02, session.item.widthRatio), dy / Math.max(0.02, session.item.heightRatio)));
        patch = { widthRatio: session.item.widthRatio * factor, heightRatio: session.item.heightRatio * factor };
      }
      if (session.mode === 'rotate') {
        const angle = Math.atan2(event.clientY - session.centerY, event.clientX - session.centerX);
        patch = { rotationDeg: session.item.rotationDeg + (angle - session.startAngle) * 180 / Math.PI };
      }
      setItems(draftRef.current.map((item) => item.id === session.item.id ? patchReverseIsometricLayoutItem(session.item, patch) : item));
    };
    const up = (event: PointerEvent) => {
      if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
      dragRef.current = null;
      onChange(draftRef.current);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
    };
  }, [onChange, open]);

  if (!open || typeof document === 'undefined') return null;
  const patchSelected = (patch: Partial<ReverseIsometricLayoutItem>) => {
    if (!selected) return;
    setItems(draftRef.current.map((item) => item.id === selected.id ? patchReverseIsometricLayoutItem(item, patch) : item), true);
  };
  const removeSelected = () => {
    if (!selected) return;
    setItems(draftRef.current.filter((item) => item.id !== selected.id), true);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10035] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm nodrag nopan" onMouseDown={(event) => event.stopPropagation()}>
      <section className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-white/15 bg-zinc-950 text-white shadow-2xl">
        <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-cyan-100">{title}</div><div className="text-[10px] text-white/45">{planUrl ? '平面布局为锁定底图' : '空白矩形为空间排版范围'}；展项支持位移、旋转、等比缩放与横纵拉伸。</div></div>
          <button className={BUTTON} disabled={disabled} onClick={onReset}><Layers size={12} />重置</button>
          <button className={BUTTON} disabled={disabled || !selected} onClick={removeSelected}><Trash2 size={12} />删除选中</button>
          <button className="rounded p-1.5 text-white/60 hover:bg-white/10" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_260px]">
          <main className="flex min-h-0 items-center justify-center overflow-auto bg-slate-950/70 p-5">
            {planUrl || allowBlankStage ? <div ref={stageRef} className={`relative max-h-[78vh] max-w-full overflow-hidden border-2 border-cyan-300/60 bg-white shadow-2xl ${planUrl ? '' : 'w-full max-w-5xl'}`} style={{ aspectRatio: planUrl ? 'auto' : aspectRatio }} onPointerDown={() => setSelectedId('')}>
              {planUrl ? <img src={planUrl} alt="平面布局锁定底图" className="block max-h-[78vh] max-w-full select-none object-contain" draggable={false} /> : <div className="h-full w-full bg-white" aria-label="空白矩形空间" />}
              {onDimensionsChange && <div className="pointer-events-none absolute inset-0 z-[10000] text-cyan-950">
                <div className="absolute bottom-2 left-4 right-4 flex items-center gap-1.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)]">
                  <span className="h-px flex-1 bg-cyan-700/80" /><span className="h-2 w-px bg-cyan-700/80" /><span className="rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold">展厅长 {hallLengthMm || 12000} mm</span><span className="h-2 w-px bg-cyan-700/80" /><span className="h-px flex-1 bg-cyan-700/80" />
                </div>
                <div className="absolute bottom-4 left-2 top-4 flex flex-col items-center gap-1.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)]">
                  <span className="w-px flex-1 bg-cyan-700/80" /><span className="h-px w-2 bg-cyan-700/80" /><span className="whitespace-nowrap rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold [writing-mode:vertical-rl]">展厅宽 {hallWidthMm || 8000} mm</span><span className="h-px w-2 bg-cyan-700/80" /><span className="w-px flex-1 bg-cyan-700/80" />
                </div>
              </div>}
              {[...draft].sort((a, b) => a.zIndex - b.zIndex).map((item) => {
                const active = item.id === selectedId;
                return <div key={item.id} className={`absolute touch-none ${active ? 'ring-2 ring-amber-300' : 'ring-1 ring-cyan-200/60'}`} style={{ left: `${item.xRatio * 100}%`, top: `${item.yRatio * 100}%`, width: `${item.widthRatio * 100}%`, height: `${item.heightRatio * 100}%`, zIndex: item.zIndex, transform: `rotate(${item.rotationDeg}deg)`, transformOrigin: 'center' }} onPointerDown={(event) => startDrag(event, item, 'move')}>
                  <div className="relative h-full w-full overflow-hidden">
                    <img src={item.url} alt={item.label} className="pointer-events-none absolute max-w-none select-none" draggable={false} style={{ left: `${-(item.cropX / item.cropWidth) * 100}%`, top: `${-(item.cropY / item.cropHeight) * 100}%`, width: `${100 / item.cropWidth}%`, height: `${100 / item.cropHeight}%` }} />
                  </div>
                  {active && <>
                    <button className="absolute -right-2 top-1/2 h-5 w-4 -translate-y-1/2 cursor-ew-resize rounded bg-cyan-300" title="横向拉伸" onPointerDown={(event) => startDrag(event, item, 'stretch-x')} />
                    <button className="absolute bottom-[-8px] left-1/2 h-4 w-5 -translate-x-1/2 cursor-ns-resize rounded bg-cyan-300" title="纵向拉伸" onPointerDown={(event) => startDrag(event, item, 'stretch-y')} />
                    <button className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded bg-amber-300" title="等比缩放" onPointerDown={(event) => startDrag(event, item, 'scale')} />
                    <button className="absolute -top-8 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-amber-300 text-zinc-950" title="旋转" onPointerDown={(event) => startDrag(event, item, 'rotate')}><RotateCw size={13} /></button>
                  </>}
                </div>;
              })}
            </div> : <div className="rounded border border-dashed border-white/20 px-6 py-10 text-sm text-white/45">请先连接平面布局图</div>}
          </main>
          <aside className="min-h-0 space-y-3 overflow-y-auto border-l border-white/10 p-3">
            {onDimensionsChange && <div className="space-y-2 rounded border border-cyan-300/20 bg-cyan-300/[0.06] p-2">
              <div className="text-[11px] font-semibold text-cyan-100">展厅尺寸</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[9px] text-white/55">长 mm<input className={FIELD} type="number" min={1000} max={100000} step={100} value={hallLengthMm || 12000} disabled={disabled} onChange={(event) => onDimensionsChange({ hallLengthMm: Math.min(100000, Math.max(1000, Math.round(Number(event.target.value) || 12000))), hallWidthMm: hallWidthMm || 8000 })} /></label>
                <label className="block text-[9px] text-white/55">宽 mm<input className={FIELD} type="number" min={1000} max={100000} step={100} value={hallWidthMm || 8000} disabled={disabled} onChange={(event) => onDimensionsChange({ hallLengthMm: hallLengthMm || 12000, hallWidthMm: Math.min(100000, Math.max(1000, Math.round(Number(event.target.value) || 8000))) })} /></label>
              </div>
              <div className="text-[9px] text-white/40">{planUrl ? '尺寸用于约束真实空间尺度，底图比例保持不变。' : '空白矩形按展厅长宽比例显示。'}</div>
            </div>}
            <div className="text-[11px] font-semibold text-cyan-100">图层（{draft.length}）</div>
            {draft.map((item) => <button key={item.id} className={`flex w-full items-center gap-2 rounded border p-1.5 text-left ${item.id === selectedId ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-white/10 bg-white/[0.03]'}`} onClick={() => setSelectedId(item.id)}><SmartImage src={item.url} alt={item.label} className="h-9 w-9 rounded object-cover" thumbSize={180} /><span className="min-w-0 flex-1 truncate text-[10px]">{item.label}</span></button>)}
            {selected && <div className="space-y-2 rounded border border-white/10 bg-black/20 p-2">
              <label className="block text-[10px] text-white/55">旋转角度<input className={FIELD} type="number" value={selected.rotationDeg} disabled={disabled} onChange={(e) => patchSelected({ rotationDeg: Number(e.target.value) })} /></label>
              <label className="block text-[10px] text-white/55">层级<input className={FIELD} type="number" min={0} value={selected.zIndex} disabled={disabled} onChange={(e) => patchSelected({ zIndex: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></label>
              <div className="grid grid-cols-2 gap-1"><button className={BUTTON} disabled={disabled} onClick={() => patchSelected({ zIndex: Math.max(0, selected.zIndex - 1) })}>下移一层</button><button className={BUTTON} disabled={disabled} onClick={() => patchSelected({ zIndex: selected.zIndex + 1 })}>上移一层</button></div>
              <div className="space-y-1 border-t border-white/10 pt-2">
                <div className="flex items-center justify-between"><span className="text-[10px] font-semibold text-cyan-100">源图裁剪</span><button className={BUTTON} disabled={disabled} onClick={() => patchSelected({ cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 })}>重置裁剪</button></div>
                <label className="block text-[9px] text-white/50">左侧裁掉 {Math.round(selected.cropX * 100)}%<input className="w-full accent-cyan-300" type="range" min={0} max={Math.max(0, (selected.cropX + selected.cropWidth - 0.02) * 100)} step={1} value={selected.cropX * 100} disabled={disabled} onChange={(e) => { const cropX = Number(e.target.value) / 100; patchSelected({ cropX, cropWidth: selected.cropX + selected.cropWidth - cropX }); }} /></label>
                <label className="block text-[9px] text-white/50">右侧裁掉 {Math.round((1 - selected.cropX - selected.cropWidth) * 100)}%<input className="w-full accent-cyan-300" type="range" min={0} max={Math.max(0, (1 - selected.cropX - 0.02) * 100)} step={1} value={(1 - selected.cropX - selected.cropWidth) * 100} disabled={disabled} onChange={(e) => patchSelected({ cropWidth: 1 - selected.cropX - Number(e.target.value) / 100 })} /></label>
                <label className="block text-[9px] text-white/50">顶部裁掉 {Math.round(selected.cropY * 100)}%<input className="w-full accent-cyan-300" type="range" min={0} max={Math.max(0, (selected.cropY + selected.cropHeight - 0.02) * 100)} step={1} value={selected.cropY * 100} disabled={disabled} onChange={(e) => { const cropY = Number(e.target.value) / 100; patchSelected({ cropY, cropHeight: selected.cropY + selected.cropHeight - cropY }); }} /></label>
                <label className="block text-[9px] text-white/50">底部裁掉 {Math.round((1 - selected.cropY - selected.cropHeight) * 100)}%<input className="w-full accent-cyan-300" type="range" min={0} max={Math.max(0, (1 - selected.cropY - 0.02) * 100)} step={1} value={(1 - selected.cropY - selected.cropHeight) * 100} disabled={disabled} onChange={(e) => patchSelected({ cropHeight: 1 - selected.cropY - Number(e.target.value) / 100 })} /></label>
              </div>
            </div>}
          </aside>
        </div>
      </section>
    </div>, document.body,
  );
}

const ReverseIsometricDesignNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const pollAbortRef = useRef(false);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const planImage = useHandleImages(id, 'plan-layout', true)[0]?.url || '';
  const exhibitImages = useHandleImages(id, 'exhibit-reference');
  const [layoutOpen, setLayoutOpen] = useState(false);

  const excludedLayoutUrls: string[] = Array.isArray(d.excludedLayoutUrls) ? d.excludedLayoutUrls.filter((url: unknown) => typeof url === 'string') : [];
  const activeExhibitImages = useMemo(() => exhibitImages.filter((item) => !excludedLayoutUrls.includes(item.url)), [excludedLayoutUrls, exhibitImages]);
  const layoutItems = useMemo(() => normalizeReverseIsometricLayoutItems(d.manualLayoutItems, activeExhibitImages), [activeExhibitImages, d.manualLayoutItems]);
  const viewDirection = normalizeReverseIsometricDirection(d.viewDirection);
  const imageProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const providerSelection = useMemo(() => resolveAdvancedProviderSelection(advancedProviders, 'image', { providerSource: d.providerSource, providerId: d.providerId, providerModel: d.providerModel }), [advancedProviders, d.providerId, d.providerModel, d.providerSource]);
  const isExternal = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const externalModels = providerSelection.provider ? advancedProviderModelOptions(providerSelection.provider, 'image') : [];
  const externalModel = providerSelection.providerModel || externalModels[0] || '';
  const providerValue = isExternal ? providerSelection.providerId : (allowZhenzhenFallback ? 'zhenzhen' : (imageProviders[0]?.id || ''));
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === (d.model || 'gpt-image-2')) || IMAGE_MODELS[0], [d.model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || '1:1';
  const sizeLevel = d.sizeLevel || '2K';
  const hallHeightMm = Math.min(12000, Math.max(2400, Math.round(Number(d.hallHeightMm) || 4200)));
  const floorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS.includes(d.floorMaterial) ? d.floorMaterial : REVERSE_ISOMETRIC_FLOOR_MATERIALS[0];
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const busy = d.status === 'generating';
  const wallPlacementText = useMemo(() => describeWallAdjacentExhibits(layoutItems), [layoutItems]);
  const previewPrompt = useMemo(() => buildReverseIsometricPrompt({ viewDirection, hallHeightMm, floorMaterial, wallPlacementText, exhibitCount: layoutItems.length }), [floorMaterial, hallHeightMm, layoutItems.length, viewDirection, wallPlacementText]);

  useEffect(() => {
    const connected = new Set(exhibitImages.map((item) => item.url));
    const next = excludedLayoutUrls.filter((url) => connected.has(url));
    if (JSON.stringify(next) !== JSON.stringify(excludedLayoutUrls)) update({ excludedLayoutUrls: next });
  }, [excludedLayoutUrls, exhibitImages, update]);

  const persistLayoutItems = useCallback((next: ReverseIsometricLayoutItem[]) => {
    const connectedUrls = new Set(exhibitImages.map((item) => item.url));
    const archived = (Array.isArray(d.manualLayoutItems) ? d.manualLayoutItems : []).filter((item: any) => item?.url && !connectedUrls.has(item.url));
    const visibleUrls = new Set(next.map((item) => item.url));
    update({
      manualLayoutItems: [...archived, ...next],
      excludedLayoutUrls: exhibitImages.filter((item) => !visibleUrls.has(item.url)).map((item) => item.url),
    });
  }, [d.manualLayoutItems, exhibitImages, update]);

  useEffect(() => {
    if (!planImage || !layoutItems.length) {
      if (d.manualLayoutReferenceImage) update({ manualLayoutReferenceImage: '' });
      return;
    }
    let cancelled = false;
    buildReverseIsometricLayoutReference(planImage, layoutItems).then((value) => {
      if (!cancelled && value !== d.manualLayoutReferenceImage) update({ manualLayoutReferenceImage: value });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [d.manualLayoutReferenceImage, layoutItems, planImage, update]);

  const generateCandidate = useCallback(async (prompt: string, references: string[], runSeed: number): Promise<string> => {
    const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType: 'reverse-isometric-design', nodeTitle: '反推轴侧', outputTitle: '反推轴侧图', seed: runSeed };
    if (isExternal) {
      if (!providerSelection.provider || !externalModel) throw new Error('扩展平台未配置可用图像模型');
      let response = await generateExternalImage({ providerId: providerSelection.provider.id, providerModel: externalModel, model: externalModel, prompt, size: externalImageSizeFor(aspectRatio, sizeLevel), aspect_ratio: aspectRatio, image_size: sizeLevel, images: references, outputFormat, seed: runSeed, n: 1, providerParams: { ...(d.providerParams || {}), n: 1, aspect_ratio: aspectRatio, image_size: sizeLevel }, historyContext, async: true });
      for (let index = 0; !response.imageUrls?.length && response.taskId && index < MAX_POLLS; index += 1) {
        if (pollAbortRef.current) throw new Error('任务已取消');
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        response = await queryExternalImageStatus({ providerId: providerSelection.provider.id, providerModel: externalModel, taskId: response.taskId, outputFormat, historyContext });
        update({ progress: `生成中 ${Math.min(99, Math.round((index + 1) / MAX_POLLS * 100))}%` });
        if (response.code && response.code !== 'running' && !response.imageUrls?.length) break;
      }
      if (!response.imageUrls?.[0]) throw new Error(response.error || '扩展平台完成但未返回图片');
      return response.imageUrls[0];
    }
    const submit = await submitImageAsync({ model: modelDef.id, apiModel, paramKind: modelDef.paramKind, prompt, aspect_ratio: aspectRatio, image_size: sizeLevel, images: references, n: 1, outputFormat, seed: runSeed, historyContext });
    if (submit.urls?.[0]) return submit.urls[0];
    if (!submit.taskId) throw new Error('未获取到生图任务 ID');
    for (let index = 0; index < 1800; index += 1) {
      if (pollAbortRef.current) throw new Error('任务已取消');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
      update({ progress: result.progress || `生成中 ${index + 1}` });
      const status = String(result.status || '').toLowerCase();
      if (['completed', 'success', 'done'].includes(status)) {
        if (!result.urls?.[0]) throw new Error('任务完成但未返回图片');
        return result.urls[0];
      }
      if (['failed', 'failure', 'error'].includes(status)) throw new Error(result.error || '生图任务失败');
    }
    throw new Error('生图任务超时');
  }, [activeCanvasId, apiModel, aspectRatio, d.providerParams, externalModel, id, isExternal, modelDef.id, modelDef.paramKind, outputFormat, providerSelection.provider, sizeLevel, update]);

  const runGenerate = useCallback(async () => {
    if (busy || isReadonly) return;
    if (!planImage) throw new Error('请先连接一张平面布局图');
    if (!exhibitImages.length) throw new Error('请至少连接一张展项效果图');
    pollAbortRef.current = false;
    const runSeed = seed || Math.floor(Math.random() * 2147483646) + 1;
    const previousOutput = { imageUrl: d.imageUrl || '', imageUrls: d.imageUrls || [], urls: d.urls || [] };
    update({ status: 'generating', progress: '正在生成排版参考图...', error: '' });
    try {
      const layoutReference = await buildReverseIsometricLayoutReference(planImage, layoutItems);
      const references = [planImage, layoutReference, ...layoutItems.map((item) => item.url)];
      update({ status: 'generating', progress: '正在生成轴侧图...' });
      const candidate = await generateCandidate(previewPrompt, references, runSeed);
      update({ status: 'success', progress: '100%', error: '', imageUrl: candidate, imageUrls: [candidate], urls: [candidate], outputText: previewPrompt, text: previewPrompt, prompt: previewPrompt, lastPrompt: previewPrompt, lastSeed: runSeed, referenceImages: references, manualLayoutReferenceImage: layoutReference });
      logBus.success('反推轴侧生成完成', `reverse-isometric:${id.slice(0, 6)}`);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      update({ ...previousOutput, status: 'error', progress: '', error: error?.message || '反推轴侧生成失败' });
      logBus.error(`反推轴侧生成失败：${error?.message || error}`, `reverse-isometric:${id.slice(0, 6)}`);
      throw error;
    }
  }, [busy, d.imageUrl, d.imageUrls, d.urls, exhibitImages.length, generateCandidate, id, isReadonly, layoutItems, planImage, previewPrompt, seed, update]);

  useRunTrigger(id, runGenerate, 'image');

  return <div data-exhibition-compact-node-type="reverse-isometric-design" className={`relative w-[520px] rounded-xl border bg-zinc-950 text-white shadow-2xl ${selected ? 'border-cyan-300/70' : 'border-white/10'}`}>
    <Handle id="plan-layout" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '24%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：平面布局图（排他）" />
    <Handle id="exhibit-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '48%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：展项效果图（可多图）" />
    <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：展陈轴侧图" />
    <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2"><Boxes size={16} className="text-cyan-300" /><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-cyan-100">反推轴侧</div><div className="truncate text-[10px] text-white/45">锁定平面结构 · 手动展项排版 · 低视角轴侧</div></div><NodeHelpButton nodeType="reverse-isometric-design" /></header>
    <div className="nodrag nopan max-h-[780px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
      <section data-exhibition-compact-section="inputs" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} />输入与排版</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-white/10 bg-black/20 p-1.5"><div className="mb-1 text-[9px] text-white/45">平面布局（单图排他）</div>{planImage ? <SmartImage src={planImage} alt="平面布局" className="h-24 w-full rounded object-contain" thumbSize={360} /> : <div className="flex h-24 items-center justify-center text-[10px] text-white/30">等待连接</div>}</div>
          <div className="rounded border border-white/10 bg-black/20 p-1.5"><div className="mb-1 text-[9px] text-white/45">展项效果图（{exhibitImages.length}）</div><div className="grid h-24 grid-cols-3 gap-1 overflow-y-auto">{exhibitImages.map((item) => <SmartImage key={item.id + item.url} src={item.url} alt={item.label} className="h-10 w-full rounded object-cover" thumbSize={180} />)}</div></div>
        </div>
        <button className={`${BUTTON} w-full border-cyan-300/30 bg-cyan-300/10 text-cyan-100`} disabled={isReadonly || busy || !planImage || !exhibitImages.length} onClick={() => setLayoutOpen(true)}><Layers size={13} />打开手动排版</button>
      </section>
      <section data-exhibition-compact-section="view" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <div className="text-[11px] font-semibold text-cyan-100">无顶整体轴侧方向</div><div className="grid grid-cols-4 gap-1">{REVERSE_ISOMETRIC_DIRECTIONS.map((item) => <button key={item.value} className={`rounded px-1 py-1.5 text-[10px] ${viewDirection === item.value ? 'bg-cyan-300/20 text-cyan-100' : 'bg-black/20 text-white/50'}`} disabled={isReadonly || busy} onClick={() => update({ viewDirection: item.value })}>{item.label}</button>)}</div>
        <div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[10px] text-white/55">展厅净高 mm</span><input className={FIELD} type="number" min={2400} max={12000} step={100} value={hallHeightMm} disabled={isReadonly || busy} onChange={(e) => update({ hallHeightMm: Math.min(12000, Math.max(2400, Math.round(Number(e.target.value) || 4200))) })} /></label><label className="space-y-1"><span className="text-[10px] text-white/55">地面材质</span><select className={FIELD} value={floorMaterial} disabled={isReadonly || busy} onChange={(e) => update({ floorMaterial: e.target.value })}>{REVERSE_ISOMETRIC_FLOOR_MATERIALS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
      </section>
      <section data-exhibition-compact-section="model" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <div className="flex items-center justify-between"><div className="text-[11px] font-semibold text-cyan-100">模型与尺寸</div><button className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}生成</button></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-[10px] text-white/55">生图平台</span><select className={FIELD} value={providerValue} disabled={isReadonly || busy} onChange={(e) => { const provider = imageProviders.find((item) => item.id === e.target.value); if (e.target.value === 'zhenzhen') update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' }); else if (provider) update({ providerSource: provider.protocol, providerId: provider.id, providerModel: advancedProviderModelOptions(provider, 'image')[0] || '' }); }}>{allowZhenzhenFallback && <option value="zhenzhen">内置生图平台</option>}{imageProviders.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">生图模型</span>{isExternal ? <select className={FIELD} value={externalModel} disabled={isReadonly || busy} onChange={(e) => update({ providerModel: e.target.value })}>{externalModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(e) => update({ apiModel: e.target.value })}>{modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}</label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">比例</span><select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(e) => update({ aspectRatio: e.target.value })}>{(modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">尺寸</span><select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(e) => update({ sizeLevel: e.target.value })}>{(modelDef.sizes.length ? modelDef.sizes : ['1K', '2K', '4K']).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">Seed</span><input className={FIELD} type="number" min={0} value={seed} disabled={isReadonly || busy} onChange={(e) => update({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">输出格式</span><select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(e) => update({ outputFormat: e.target.value })}><option value="jpg">JPG</option><option value="png">PNG</option></select></label>
        </div>
      </section>
      {(d.progress || d.error) && <section data-exhibition-compact-section="status" data-exhibition-compact-item="main" className="space-y-1 rounded border border-cyan-300/20 bg-cyan-300/10 p-2">{d.progress && <div className="text-[10px] text-cyan-100">{d.progress}</div>}{d.error && <div className="text-[10px] text-rose-200">{d.error}</div>}</section>}
      {d.imageUrl && <section data-exhibition-compact-section="result" data-exhibition-compact-item="main" className="rounded border border-white/10 bg-black/20 p-2"><SmartImage src={d.imageUrl} alt="展陈轴侧图" className="max-h-64 w-full rounded object-contain" thumbSize={360} /></section>}
      <section data-exhibition-compact-section="prompt" data-exhibition-compact-item="main" className="rounded border border-white/10 bg-white/[0.03] p-2"><div className="mb-1 text-[10px] font-semibold text-cyan-100">生成约束 Prompt</div><div className="max-h-36 overflow-y-auto whitespace-pre-wrap text-[9px] leading-relaxed text-white/55">{previewPrompt}</div></section>
    </div>
    <ReverseIsometricLayoutModal open={layoutOpen} planUrl={planImage} items={layoutItems} disabled={isReadonly || busy} onChange={persistLayoutItems} onClose={() => setLayoutOpen(false)} onReset={() => update({ manualLayoutItems: normalizeReverseIsometricLayoutItems([], exhibitImages), excludedLayoutUrls: [] })} />
  </div>;
};

export default memo(ReverseIsometricDesignNode);
