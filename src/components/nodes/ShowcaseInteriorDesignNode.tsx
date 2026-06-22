import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Boxes, Image as ImageIcon, Layers, Loader2, MoveDiagonal2, Palette, Play, Ruler, Settings2, Trash2, X } from 'lucide-react';
import { IMAGE_MODELS } from '../../providers/models';
import { getElevationPromptPresets, type ElevationColorMaterialPresetItem } from '../../services/api';
import { generateExternalImage, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  buildShowcaseInteriorDesignPrompt,
  colorMaterialTextFromPreset,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseManualLayoutItems,
  normalizeShowcaseStyle,
} from '../../utils/showcaseInteriorDesignPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import ColorMaterialPresetSelect from './ColorMaterialPresetSelect';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const DEFAULT_EXHIBIT_HEIGHT_MM = 300;

interface InputImageItem {
  id: string;
  url: string;
  label: string;
}

interface ManualLayoutItem {
  url: string;
  label: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  zIndex: number;
}

type LayoutMode = 'auto' | 'manual';
type LayoutDragMode = 'move' | 'scale';

interface LayoutDragSession {
  item: ManualLayoutItem;
  mode: LayoutDragMode;
  pointerId: number;
  startX: number;
  startY: number;
  scale: number;
}

function randomImageSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return (values[0] % MAX_IMAGE_SEED) + 1;
  }
  return Math.floor(Math.random() * MAX_IMAGE_SEED) + 1;
}

function imagesFromData(data: any): string[] {
  const out: string[] = [];
  const push = (value: any) => {
    const url = typeof value === 'string' ? value.trim() : '';
    if (url && !out.includes(url)) out.push(url);
  };
  push(data?.imageUrl);
  for (const key of ['imageUrls', 'urls', 'generatedImages', 'referenceImages']) {
    const list = data?.[key];
    if (Array.isArray(list)) list.forEach(push);
  }
  return out;
}

function firstImageFromData(data: any): string {
  return imagesFromData(data)[0] || '';
}

function shortFileLabel(url: string, fallback = '展品') {
  return (url.split('/').pop() || fallback).split('?')[0].slice(0, 28) || fallback;
}

function useHandleImage(nodeId: string, handle: string): string {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns
      .filter((conn: any) => (conn.targetHandle || '') === handle)
      .map((conn: any) => conn.source)
      .filter(Boolean))),
    [conns, handle],
  );
  const nodesData = useNodesData(sourceIds);
  return useMemo(() => {
    const list = Array.isArray(nodesData) ? nodesData : [nodesData];
    for (const node of list) {
      const url = firstImageFromData((node as any)?.data || {});
      if (url) return url;
    }
    return '';
  }, [nodesData]);
}

function useHandleImages(nodeId: string, handle: string): InputImageItem[] {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns
      .filter((conn: any) => (conn.targetHandle || '') === handle)
      .map((conn: any) => conn.source)
      .filter(Boolean))),
    [conns, handle],
  );
  const nodesData = useNodesData(sourceIds);
  return useMemo(() => {
    const out: InputImageItem[] = [];
    const seen = new Set<string>();
    const list = Array.isArray(nodesData) ? nodesData : [nodesData];
    for (const node of list) {
      const sourceId = String((node as any)?.id || 'node');
      const urls = imagesFromData((node as any)?.data || {});
      urls.forEach((url, index) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        out.push({
          id: `${sourceId}:showcase-exhibit:${index}:${url}`,
          url,
          label: shortFileLabel(url, `展品 ${out.length + 1}`),
        });
      });
    }
    return out;
  }, [nodesData]);
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMm(value: number) {
  return Math.round(value * 100) / 100;
}

function loadLooseImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function ratioValue(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return width / height;
}

function closestAspectRatio(sourceRatio: number, options: string[]): string {
  const candidates = options
    .map((value) => ({ value, ratio: ratioValue(value) }))
    .filter((item): item is { value: string; ratio: number } => item.ratio !== null);
  if (candidates.length === 0) return options.find((item) => item !== 'Auto') || '1:1';
  return candidates.reduce((best, item) => (
    Math.abs(item.ratio - sourceRatio) < Math.abs(best.ratio - sourceRatio) ? item : best
  )).value;
}

function normalizeLayoutMode(value: unknown): LayoutMode {
  return value === 'manual' ? 'manual' : 'auto';
}

function defaultManualLayoutItems(
  exhibitItems: Array<{ url: string; label: string; heightMm: number }>,
  savedItems: unknown,
  showcaseStyle: ReturnType<typeof normalizeShowcaseStyle>,
): ManualLayoutItem[] {
  const saved = normalizeShowcaseManualLayoutItems(savedItems) as ManualLayoutItem[];
  const savedByUrl = new Map(saved.map((item) => [item.url, item]));
  const widthMm = Math.max(1, showcaseStyle.widthMm);
  const glassHeightMm = Math.max(1, showcaseStyle.glassHeightMm);
  const count = Math.max(1, exhibitItems.length);
  const slotW = widthMm / count;
  return exhibitItems.map((item, index) => {
    const prev = savedByUrl.get(item.url);
    if (prev) {
      const nextWidth = clamp(prev.widthMm, 1, widthMm);
      const nextHeight = clamp(prev.heightMm, 1, glassHeightMm);
      return {
        ...prev,
        label: item.label || prev.label || `展品 ${index + 1}`,
        xMm: roundMm(clamp(prev.xMm, 0, Math.max(0, widthMm - nextWidth))),
        yMm: roundMm(clamp(prev.yMm, 0, Math.max(0, glassHeightMm - nextHeight))),
        widthMm: roundMm(nextWidth),
        heightMm: roundMm(nextHeight),
        zIndex: Number.isFinite(prev.zIndex) ? prev.zIndex : index + 1,
      };
    }
    const defaultHeight = clamp(Math.min(item.heightMm * 0.7, glassHeightMm * 0.24), 60, Math.max(60, glassHeightMm * 0.36));
    const defaultWidth = clamp(defaultHeight, 50, Math.max(50, slotW * 0.56));
    const x = clamp(slotW * index + (slotW - defaultWidth) / 2, 0, Math.max(0, widthMm - defaultWidth));
    const y = clamp(glassHeightMm * 0.64 - defaultHeight / 2, 0, Math.max(0, glassHeightMm - defaultHeight));
    return {
      url: item.url,
      label: item.label || `展品 ${index + 1}`,
      xMm: roundMm(x),
      yMm: roundMm(y),
      widthMm: roundMm(defaultWidth),
      heightMm: roundMm(defaultHeight),
      zIndex: index + 1,
    };
  });
}

async function buildManualLayoutReferenceImage(
  manualLayoutItems: ManualLayoutItem[],
  showcaseStyle: ReturnType<typeof normalizeShowcaseStyle>,
): Promise<string> {
  if (typeof document === 'undefined') return '';
  const widthMm = Math.max(1, showcaseStyle.widthMm);
  const heightMm = Math.max(1, showcaseStyle.glassHeightMm);
  const maxSide = 1600;
  const scale = Math.min(maxSide / widthMm, maxSide / heightMm, 1.6);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(320, Math.round(widthMm * scale));
  canvas.height = Math.max(320, Math.round(heightMm * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const sx = canvas.width / widthMm;
  const sy = canvas.height / heightMm;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sorted = manualLayoutItems.slice().sort((a, b) => a.zIndex - b.zIndex);
  const loaded = await Promise.all(sorted.map((item) => loadLooseImage(item.url)));
  sorted.forEach((item, index) => {
    const x = item.xMm * sx;
    const y = item.yMm * sy;
    const w = item.widthMm * sx;
    const h = item.heightMm * sy;
    const image = loaded[index];
    ctx.save();
    if (image) {
      ctx.drawImage(image, x, y, w, h);
    } else {
      ctx.fillStyle = 'rgba(226,232,240,0.9)';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  });
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function ShowcaseManualLayoutModal({
  open,
  items,
  showcaseStyle,
  disabled,
  onChange,
  onClose,
  onReset,
}: {
  open: boolean;
  items: ManualLayoutItem[];
  showcaseStyle: ReturnType<typeof normalizeShowcaseStyle>;
  disabled?: boolean;
  onChange: (items: ManualLayoutItem[]) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<LayoutDragSession | null>(null);
  const [selectedUrl, setSelectedUrl] = useState('');
  const widthMm = Math.max(1, showcaseStyle.widthMm);
  const heightMm = Math.max(1, showcaseStyle.glassHeightMm);
  const sortedItems = useMemo(() => items.slice().sort((a, b) => a.zIndex - b.zIndex), [items]);
  const selectedItem = items.find((item) => item.url === selectedUrl) || sortedItems[sortedItems.length - 1] || null;
  const verticalGuideLines = useMemo(() => {
    const lines: number[] = [];
    for (let x = 100; x < widthMm; x += 100) lines.push(x);
    return lines;
  }, [widthMm]);
  const horizontalGuideLines = useMemo(() => {
    const lines: number[] = [];
    for (let y = 100; y < heightMm; y += 100) lines.push(y);
    return lines;
  }, [heightMm]);

  useEffect(() => {
    if (!open) return;
    setSelectedUrl((current) => (items.some((item) => item.url === current) ? current : (items[0]?.url || '')));
  }, [items, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedItem && !disabled) {
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        onChange(items.filter((item) => item.url !== selectedItem.url));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, items, onChange, onClose, open, selectedItem]);

  const updateItem = (url: string, patch: Partial<ManualLayoutItem>) => {
    onChange(items.map((item) => item.url === url ? { ...item, ...patch } : item));
  };

  const stageScale = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return 1;
    return rect.width / widthMm;
  };

  const startDrag = (event: ReactPointerEvent, item: ManualLayoutItem, mode: LayoutDragMode) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    setSelectedUrl(item.url);
    dragRef.current = {
      item,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scale: stageScale(),
    };
    window.addEventListener('pointermove', moveDrag, true);
    window.addEventListener('pointerup', endDrag, { capture: true, once: true });
  };

  const moveDrag = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const dxMm = (event.clientX - drag.startX) / Math.max(0.001, drag.scale);
    const dyMm = (event.clientY - drag.startY) / Math.max(0.001, drag.scale);
    if (drag.mode === 'move') {
      updateItem(drag.item.url, {
        xMm: roundMm(clamp(drag.item.xMm + dxMm, 0, Math.max(0, widthMm - drag.item.widthMm))),
        yMm: roundMm(clamp(drag.item.yMm + dyMm, 0, Math.max(0, heightMm - drag.item.heightMm))),
      });
      return;
    }
    const sourceRatio = drag.item.widthMm / Math.max(1, drag.item.heightMm);
    const deltaMm = Math.max(dxMm, dyMm);
    const nextWidth = clamp(drag.item.widthMm + deltaMm, 12, Math.max(12, widthMm - drag.item.xMm));
    const nextHeight = clamp(nextWidth / sourceRatio, 12, Math.max(12, heightMm - drag.item.yMm));
    const finalWidth = nextHeight * sourceRatio > widthMm - drag.item.xMm ? widthMm - drag.item.xMm : nextHeight * sourceRatio;
    const finalHeight = finalWidth / sourceRatio;
    updateItem(drag.item.url, {
      widthMm: roundMm(finalWidth),
      heightMm: roundMm(finalHeight),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
    window.removeEventListener('pointermove', moveDrag, true);
  };

  const removeSelected = () => {
    if (!selectedItem || disabled) return;
    onChange(items.filter((item) => item.url !== selectedItem.url));
  };

  const moveLayer = (direction: 1 | -1) => {
    if (!selectedItem || disabled) return;
    updateItem(selectedItem.url, { zIndex: Math.max(0, selectedItem.zIndex + direction) });
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10035] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm nodrag nopan" onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <section className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-white/12 bg-zinc-950 text-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-cyan-100">柜内手动排版</div>
            <div className="text-[10px] text-white/45">玻璃区画布：{widthMm} x {heightMm} mm，拖拽移动，右下角等比缩放。</div>
          </div>
          <button type="button" className={BUTTON} onClick={onReset} disabled={disabled}><Layers size={12} /> 重置排版</button>
          <button type="button" className={BUTTON} onClick={removeSelected} disabled={disabled || !selectedItem}><Trash2 size={12} /> 删除选中</button>
          <button type="button" className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white" onClick={onClose} title="关闭"><X size={16} /></button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px] gap-0">
          <main className="min-h-0 overflow-auto bg-slate-950/70 p-4">
            <div className="flex min-h-full items-center justify-center">
              <div
                ref={stageRef}
                className="relative overflow-hidden border-2 border-cyan-300/70 bg-slate-50 shadow-2xl"
                style={{
                  width: `min(100%, min(${widthMm}px, calc((92vh - 120px) * ${widthMm / heightMm})))`,
                  aspectRatio: `${widthMm} / ${heightMm}`,
                }}
                onPointerDown={() => setSelectedUrl('')}
              >
                <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox={`0 0 ${widthMm} ${heightMm}`} preserveAspectRatio="none" aria-hidden="true">
                  {verticalGuideLines.map((x) => (
                    <line key={`x-${x}`} x1={x} y1={0} x2={x} y2={heightMm} stroke="rgba(14,165,233,0.45)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  ))}
                  {horizontalGuideLines.map((y) => (
                    <line key={`y-${y}`} x1={0} y1={y} x2={widthMm} y2={y} stroke="rgba(14,165,233,0.45)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
                {sortedItems.map((item) => {
                  const selected = item.url === selectedUrl;
                  return (
                    <div
                      key={item.url}
                      className={`absolute z-10 touch-none select-none border ${selected ? 'border-cyan-500 shadow-[0_0_0_2px_rgba(14,165,233,0.35)]' : 'border-slate-500/40'} bg-white/85`}
                      style={{
                        left: `${(item.xMm / widthMm) * 100}%`,
                        top: `${(item.yMm / heightMm) * 100}%`,
                        width: `${(item.widthMm / widthMm) * 100}%`,
                        height: `${(item.heightMm / heightMm) * 100}%`,
                        zIndex: item.zIndex,
                      }}
                      onPointerDown={(event) => startDrag(event, item, 'move')}
                    >
                      <img src={item.url} alt="" className="h-full w-full object-fill" draggable={false} />
                      <div className="pointer-events-none absolute left-0 top-0 bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">{item.label}</div>
                      {selected && (
                        <button
                          type="button"
                          className="absolute -bottom-3 -right-3 flex h-7 w-7 items-center justify-center rounded-full border border-cyan-200 bg-cyan-500 text-white shadow-lg"
                          title="等比缩放"
                          onPointerDown={(event) => startDrag(event, item, 'scale')}
                        >
                          <MoveDiagonal2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </main>
          <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-white/[0.025] p-3">
            <div className="mb-2 text-[11px] font-semibold text-cyan-100">排版对象</div>
            <div className="space-y-1.5">
              {sortedItems.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  className={`w-full rounded border px-2 py-1.5 text-left text-[10px] ${item.url === selectedUrl ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-black/20 text-white/65 hover:bg-white/[0.08]'}`}
                  onClick={() => setSelectedUrl(item.url)}
                >
                  <div className="truncate font-semibold">{item.label}</div>
                  <div className="text-white/42">x {item.xMm} / y {item.yMm}</div>
                  <div className="text-white/42">{item.widthMm} x {item.heightMm} mm</div>
                </button>
              ))}
            </div>
            {selectedItem && (
              <div className="mt-3 space-y-2 rounded border border-white/10 bg-black/20 p-2">
                <div className="text-[10px] font-semibold text-white/60">选中项</div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-white/50">
                  <div>x: {selectedItem.xMm}</div>
                  <div>y: {selectedItem.yMm}</div>
                  <div>w: {selectedItem.widthMm}</div>
                  <div>h: {selectedItem.heightMm}</div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" className={BUTTON} onClick={() => moveLayer(-1)} disabled={disabled}>下移层级</button>
                  <button type="button" className={BUTTON} onClick={() => moveLayer(1)} disabled={disabled}>上移层级</button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}

const ShowcaseInteriorDesignNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const pollAbortRef = useRef(false);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);

  const exhibitImages = useHandleImages(id, '');
  const colorMaterialReferenceImage = useHandleImage(id, 'color-material-reference');
  const imageAdvancedProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const providerSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'image', {
      providerSource: d.providerSource,
      providerId: d.providerId,
      providerModel: d.providerModel,
    }),
    [advancedProviders, d.providerSource, d.providerId, d.providerModel],
  );
  const isExternalSelected = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const externalModelOptions = providerSelection.provider
    ? advancedProviderModelOptions(providerSelection.provider, 'image')
    : [];
  const externalProviderModel = providerSelection.providerModel || externalModelOptions[0] || '';
  const firstImageAdvancedProvider = imageAdvancedProviders[0] || null;
  const providerSelectValue = isExternalSelected
    ? providerSelection.providerId
    : (allowZhenzhenFallback ? 'zhenzhen' : (firstImageAdvancedProvider?.id || ''));
  const model = d.model || 'gpt-image-2';
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || '1:1';
  const sizeLevel = d.sizeLevel || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const status = String(d.status || 'idle');
  const busy = status === 'generating';
  const layoutMode = normalizeLayoutMode(d.layoutMode);
  const showcaseStyle = normalizeShowcaseStyle(d.showcaseStyle);
  const autoAspectRatio = useMemo(() => {
    const totalHeightMm = showcaseStyle.baseHeightMm + showcaseStyle.glassHeightMm + (showcaseStyle.hasCap ? showcaseStyle.capHeightMm : 0);
    if (showcaseStyle.widthMm <= 0 || totalHeightMm <= 0) return modelDef.defaultAspectRatio || '1:1';
    return closestAspectRatio(showcaseStyle.widthMm / totalHeightMm, modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']);
  }, [modelDef.aspectRatios, modelDef.defaultAspectRatio, showcaseStyle.baseHeightMm, showcaseStyle.capHeightMm, showcaseStyle.glassHeightMm, showcaseStyle.hasCap, showcaseStyle.widthMm]);
  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );

  const exhibitItems = useMemo(() => {
    const saved = normalizeShowcaseExhibitItems(d.exhibitItems);
    const byUrl = new Map(saved.map((item) => [item.url, item]));
    return exhibitImages.map((image, index) => {
      const prev = byUrl.get(image.url);
      return {
        url: image.url,
        label: prev?.label || image.label || `展品 ${index + 1}`,
        heightMm: prev?.heightMm || DEFAULT_EXHIBIT_HEIGHT_MM,
      };
    });
  }, [d.exhibitItems, exhibitImages]);

  const manualLayoutItems = useMemo(
    () => defaultManualLayoutItems(exhibitItems, d.manualLayoutItems, showcaseStyle),
    [d.manualLayoutItems, exhibitItems, showcaseStyle.glassHeightMm, showcaseStyle.widthMm],
  );
  const [manualLayoutOpen, setManualLayoutOpen] = useState(false);

  const previewReferenceImages = useMemo(() => [
    ...(layoutMode === 'manual' ? [d.manualLayoutReferenceImage] : exhibitItems.map((item) => item.url)),
    colorMaterialReferenceImage,
  ].filter(Boolean), [colorMaterialReferenceImage, d.manualLayoutReferenceImage, exhibitItems, layoutMode]);

  const previewPrompt = useMemo(() => buildShowcaseInteriorDesignPrompt({
    showcaseStyle,
    exhibitItems,
    layoutMode,
    manualLayoutItems,
    colorMaterialPresetText: colorMaterialTextFromPreset(selectedColorMaterialPreset),
    manualColorMaterial: selectedColorMaterialPreset ? '' : d.colorMaterial,
    colorMaterialReferenceTone: d.colorMaterialReferenceTone,
    hasColorMaterialReferenceImage: !!colorMaterialReferenceImage,
    perspectiveEnabled: d.perspectiveEnabled !== false,
    dimensionMarksEnabled: d.dimensionMarksEnabled === true,
    explodedViewEnabled: d.explodedViewEnabled === true,
    supplement: d.supplement,
  }), [colorMaterialReferenceImage, d.colorMaterial, d.colorMaterialReferenceTone, d.dimensionMarksEnabled, d.explodedViewEnabled, d.perspectiveEnabled, d.supplement, exhibitItems, layoutMode, manualLayoutItems, selectedColorMaterialPreset, showcaseStyle.baseHeightMm, showcaseStyle.capHeightMm, showcaseStyle.glassHeightMm, showcaseStyle.hasCap, showcaseStyle.widthMm]);

  useEffect(() => {
    getElevationPromptPresets().then((presets) => setColorMaterialPresets(presets.colorMaterial || [])).catch(() => setColorMaterialPresets([]));
  }, []);

  useEffect(() => {
    if (isReadonly || busy) return;
    const totalHeightMm = showcaseStyle.baseHeightMm + showcaseStyle.glassHeightMm + (showcaseStyle.hasCap ? showcaseStyle.capHeightMm : 0);
    const aspectRatioSource = `${showcaseStyle.widthMm}x${totalHeightMm}|${modelDef.id}`;
    if (d.aspectRatio === autoAspectRatio && d.aspectRatioSource === aspectRatioSource) return;
    update({ aspectRatio: autoAspectRatio, aspectRatioSource });
  }, [autoAspectRatio, busy, d.aspectRatio, d.aspectRatioSource, isReadonly, modelDef.id, showcaseStyle.baseHeightMm, showcaseStyle.capHeightMm, showcaseStyle.glassHeightMm, showcaseStyle.hasCap, showcaseStyle.widthMm, update]);

  useEffect(() => {
    if (!sameJson(d.exhibitItems || [], exhibitItems)) update({ exhibitItems });
  }, [d.exhibitItems, exhibitItems, update]);

  useEffect(() => {
    if (!sameJson(d.manualLayoutItems || [], manualLayoutItems)) update({ manualLayoutItems });
  }, [d.manualLayoutItems, manualLayoutItems, update]);

  useEffect(() => {
    if (layoutMode !== 'manual') return;
    let cancelled = false;
    buildManualLayoutReferenceImage(manualLayoutItems, showcaseStyle).then((image) => {
      if (cancelled || !image || d.manualLayoutReferenceImage === image) return;
      update({ manualLayoutReferenceImage: image });
    });
    return () => {
      cancelled = true;
    };
  }, [d.manualLayoutReferenceImage, layoutMode, manualLayoutItems, showcaseStyle.glassHeightMm, showcaseStyle.widthMm, update]);

  useEffect(() => {
    if (
      d.prompt !== previewPrompt ||
      d.outputText !== previewPrompt ||
      d.text !== previewPrompt ||
      !sameJson(d.referenceImages || [], previewReferenceImages)
    ) {
      update({ prompt: previewPrompt, outputText: previewPrompt, text: previewPrompt, referenceImages: previewReferenceImages });
    }
  }, [d.outputText, d.prompt, d.referenceImages, d.text, previewPrompt, previewReferenceImages, update]);

  const patchShowcaseStyle = (key: string, value: unknown) => {
    update({ showcaseStyle: { ...showcaseStyle, [key]: value } });
  };

  const updateExhibitSize = (url: string, value: string) => {
    const n = Number(value);
    const next = exhibitItems.map((item) => item.url === url
      ? { ...item, heightMm: Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : DEFAULT_EXHIBIT_HEIGHT_MM }
      : item);
    update({ exhibitItems: next });
  };

  const updateManualLayoutItems = (items: ManualLayoutItem[]) => {
    update({ manualLayoutItems: items });
  };

  const resetManualLayoutItems = () => {
    update({ manualLayoutItems: defaultManualLayoutItems(exhibitItems, [], showcaseStyle), manualLayoutReferenceImage: '' });
  };

  const runGenerate = useCallback(async () => {
    if (isReadonly || busy) return;
    const generatedManualLayoutReferenceImage = layoutMode === 'manual'
      ? await buildManualLayoutReferenceImage(manualLayoutItems, showcaseStyle)
      : '';
    const manualLayoutReferenceImage = generatedManualLayoutReferenceImage || (layoutMode === 'manual' ? String(d.manualLayoutReferenceImage || '') : '');
    const imagePrompt = buildShowcaseInteriorDesignPrompt({
      showcaseStyle,
      exhibitItems,
      layoutMode,
      manualLayoutItems,
      colorMaterialPresetText: colorMaterialTextFromPreset(selectedColorMaterialPreset),
      manualColorMaterial: selectedColorMaterialPreset ? '' : d.colorMaterial,
      colorMaterialReferenceTone: d.colorMaterialReferenceTone,
      hasColorMaterialReferenceImage: !!colorMaterialReferenceImage,
      perspectiveEnabled: d.perspectiveEnabled !== false,
      dimensionMarksEnabled: d.dimensionMarksEnabled === true,
      explodedViewEnabled: d.explodedViewEnabled === true,
      supplement: d.supplement,
    });
    const runtimeReferenceImages = [
      ...(layoutMode === 'manual' ? [manualLayoutReferenceImage] : exhibitItems.map((item) => item.url)),
      colorMaterialReferenceImage,
    ].filter(Boolean);
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `showcase-interior-design:${id.slice(0, 6)}`;
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'showcase-interior-design',
      seed: runSeed,
      nodeTitle: '柜内设计',
    };
    taskCompletionSound.primeAudio();
    pollAbortRef.current = false;
    update({
      status: 'generating',
      progress: '0%',
      error: '',
      imageUrls: [],
      urls: [],
      prompt: imagePrompt,
      outputText: imagePrompt,
      text: imagePrompt,
      lastPrompt: imagePrompt,
      lastSeed: runSeed,
      manualLayoutReferenceImage,
      referenceImages: runtimeReferenceImages,
    });
    try {
      let urls: string[] = [];
      if (isExternalSelected && providerSelection.provider) {
        if (!externalProviderModel) throw new Error('扩展平台未配置可用图像模型');
        const size = externalImageSizeFor(aspectRatio, sizeLevel);
        const providerParams = {
          ...(d.providerParams || {}),
          aspect_ratio: aspectRatio,
          aspectRatio,
          image_size: sizeLevel,
          imageSize: sizeLevel,
        };
        logBus.info(`柜内设计提交: ${providerSelection.provider.label || providerSelection.provider.id} · ${externalProviderModel} · refs=${runtimeReferenceImages.length}`, src);
        let res = await generateExternalImage({
          providerId: providerSelection.provider.id,
          providerModel: externalProviderModel,
          model: externalProviderModel,
          prompt: imagePrompt,
          size,
          aspect_ratio: aspectRatio,
          image_size: sizeLevel,
          images: runtimeReferenceImages,
          outputFormat,
          seed: runSeed,
          n: Math.max(1, Math.min(4, Number(providerParams.n || 1))),
          providerParams,
          historyContext,
          async: true,
        });
        if ((!res.imageUrls?.length) && res.taskId && (res.code === 'running' || res.status === 'running')) {
          let pollingTaskId = res.taskId;
          update({ progress: '生成中...', taskId: pollingTaskId });
          for (let index = 0; index < EXTERNAL_IMAGE_MAX_POLLS; index += 1) {
            if (pollAbortRef.current) throw new Error('任务已取消');
            await new Promise((resolve) => setTimeout(resolve, EXTERNAL_IMAGE_POLL_INTERVAL_MS));
            res = await queryExternalImageStatus({
              providerId: providerSelection.provider.id,
              providerModel: externalProviderModel,
              taskId: pollingTaskId,
              outputFormat,
              historyContext,
            });
            pollingTaskId = res.taskId || pollingTaskId;
            update({ progress: `${Math.min(99, Math.round(((index + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%`, taskId: pollingTaskId });
            if (res.imageUrls?.length || (res.code && res.code !== 'running')) break;
          }
        }
        urls = res.imageUrls || [];
        if (!urls.length) throw new Error('扩展平台完成但未返回图片');
        update({
          status: 'success',
          progress: '100%',
          imageUrl: urls[0],
          imageUrls: urls,
          urls,
          remoteImageUrls: res.remoteImageUrls,
          prompt: imagePrompt,
          outputText: imagePrompt,
          text: imagePrompt,
          lastPrompt: imagePrompt,
          lastSeed: runSeed,
          manualLayoutReferenceImage,
          referenceImages: runtimeReferenceImages,
          taskId: res.taskId || d.taskId,
          error: '',
        });
        logBus.success(`柜内设计生成完成 ${urls.length} 张`, src);
        taskCompletionSound.notifyComplete(id, 'image');
        return;
      }

      logBus.info(`柜内设计提交: model=${apiModel} ratio=${aspectRatio} size=${sizeLevel} refs=${runtimeReferenceImages.length}`, src);
      const submit = await submitImageAsync({
        model: modelDef.id,
        apiModel,
        paramKind: modelDef.paramKind,
        prompt: imagePrompt,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images: runtimeReferenceImages,
        n: 1,
        outputFormat,
        seed: runSeed,
        historyContext,
      });
      urls = submit.urls || [];
      if (!submit.sync) {
        if (!submit.taskId) throw new Error('未获取到任务 ID');
        let lastProgress = submit.progress || '5%';
        update({ taskId: submit.taskId, progress: lastProgress });
        for (let index = 0; index < 1800; index += 1) {
          if (pollAbortRef.current) throw new Error('任务已取消');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const q = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
          if (q.progress && q.progress !== lastProgress) {
            lastProgress = q.progress;
            update({ progress: q.progress });
          }
          const statusText = String(q.status || '').toLowerCase();
          if (statusText === 'completed' || statusText === 'success' || statusText === 'done') {
            urls = q.urls || [];
            break;
          }
          if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') {
            throw new Error(q.error || '任务失败');
          }
        }
      }
      if (!urls.length) throw new Error('任务完成但未返回图片');
      update({
        status: 'success',
        progress: '100%',
        imageUrl: urls[0],
        imageUrls: urls,
        urls,
        prompt: imagePrompt,
        outputText: imagePrompt,
        text: imagePrompt,
        lastPrompt: imagePrompt,
        lastSeed: runSeed,
        manualLayoutReferenceImage,
        referenceImages: runtimeReferenceImages,
        error: '',
      });
      logBus.success(`柜内设计生成完成 ${urls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`柜内设计生成失败: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, aspectRatio, busy, colorMaterialReferenceImage, d.colorMaterial, d.colorMaterialReferenceTone, d.dimensionMarksEnabled, d.explodedViewEnabled, d.manualLayoutReferenceImage, d.perspectiveEnabled, d.providerParams, d.supplement, d.taskId, exhibitItems, externalProviderModel, id, isExternalSelected, isReadonly, layoutMode, manualLayoutItems, modelDef.id, modelDef.paramKind, outputFormat, providerSelection.provider, seed, selectedColorMaterialPreset, showcaseStyle, sizeLevel, update]);

  useRunTrigger(id, runGenerate, 'image');

  return (
    <div className={`relative w-[520px] rounded-xl border bg-zinc-950 text-white shadow-2xl ${selected ? 'border-cyan-300/70' : 'border-white/10'}`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-amber-300" style={{ top: '32%' }} title="输入：展品图" />
      <Handle id="color-material-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-rose-300" style={{ top: '52%' }} title="输入：色彩与材质参考图" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-0 !bg-cyan-300" />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Boxes size={16} className="text-cyan-200" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-cyan-100">柜内设计</div>
          <div className="truncate text-[10px] text-white/45">展柜尺寸 / 展品比例 / 色彩材质 / 输出形式</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nowheel max-h-[660px] space-y-2 overflow-y-auto p-3" onMouseDown={(event) => event.stopPropagation()}>
        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><Settings2 size={13} /> 展柜样式</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['widthMm', '展柜宽度 mm'],
              ['baseHeightMm', '底座高度 mm'],
              ['glassHeightMm', '玻璃区高度 mm'],
              ['capHeightMm', '柜帽高度 mm'],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-[10px] text-white/55">{label}</span>
                <input className={FIELD} type="number" min={0} value={(showcaseStyle as any)[key] || 0} disabled={isReadonly || busy} onChange={(event) => patchShowcaseStyle(key, Number(event.target.value) || 0)} />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[11px] text-white/70">
            <input type="checkbox" className="accent-cyan-300" checked={showcaseStyle.hasCap} disabled={isReadonly || busy} onChange={(event) => patchShowcaseStyle('hasCap', event.target.checked)} />
            是否有柜帽
          </label>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 展品输入</div>
          <div className="grid grid-cols-2 gap-1 rounded bg-black/20 p-1">
            {([
              ['auto', '自动尺寸模式'],
              ['manual', '手动排版模式'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                disabled={isReadonly || busy}
                onClick={() => update({ layoutMode: mode })}
                className={`rounded px-2 py-1.5 text-[10px] font-semibold transition-all ${layoutMode === mode ? 'bg-cyan-300/20 text-cyan-100' : 'text-white/45 hover:bg-white/[0.08] hover:text-white/75'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {layoutMode === 'manual' && (
            <div className="flex items-center justify-between gap-2 rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
              <div className="min-w-0 text-[10px] leading-snug text-cyan-50/75">手动模式按排版窗口的位置和缩放生成，不使用高度/70% 自动约束。</div>
              <button type="button" className={`${BUTTON} shrink-0 border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => setManualLayoutOpen(true)}>
                <Layers size={13} /> 排版
              </button>
            </div>
          )}
          {exhibitItems.length > 0 ? (
            <div className="space-y-1.5">
              {exhibitItems.map((item, index) => (
                <div key={item.url} className="grid grid-cols-[52px_minmax(0,1fr)_84px] items-center gap-2 rounded border border-white/10 bg-black/15 p-1.5">
                  <img src={item.url} alt="" className="h-12 w-12 rounded border border-white/10 object-cover" draggable={false} />
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-semibold text-white/75">{index + 1}. {item.label}</div>
                    <div className="truncate text-[9px] text-white/35">{item.url}</div>
                  </div>
                  <label className="space-y-0.5">
                    <span className="text-[9px] text-white/45">{layoutMode === 'manual' ? '自动高度停用' : '高度 mm'}</span>
                    <input className={`${FIELD} px-1 text-center`} type="number" min={1} value={item.heightMm} disabled={isReadonly || busy} onChange={(event) => updateExhibitSize(item.url, event.target.value)} />
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-white/15 p-3 text-center text-[10px] text-white/35">连接图像素材作为展品图后，可逐件填写高度 mm</div>
          )}
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><Palette size={13} /> 柜内形式设计风格</div>
          <ColorMaterialPresetSelect
            presets={colorMaterialPresets}
            value={d.colorMaterialPreset || ''}
            disabled={isReadonly || busy}
            className={FIELD}
            placeholder="不使用共享色彩与材质预设"
            onChange={(presetId, preset) => update({ colorMaterialPreset: presetId, colorMaterial: colorMaterialTextFromPreset(preset) })}
          />
          <textarea className={`${FIELD} min-h-[56px] resize-y`} value={d.colorMaterial || ''} disabled={isReadonly || busy} placeholder="手动色彩与材质补充" onChange={(event) => update({ colorMaterial: event.target.value, colorMaterialPreset: '' })} />
          {colorMaterialReferenceImage ? (
            <div className="rounded border border-white/10 bg-black/15 p-2">
              <img src={colorMaterialReferenceImage} alt="" className="h-24 w-full rounded border border-white/10 object-contain" draggable={false} />
              <textarea className={`${FIELD} mt-1 min-h-[42px] resize-y`} value={d.colorMaterialReferenceTone || ''} disabled={isReadonly || busy} placeholder="可手动填写参考图主色调 / 材质特征" onChange={(event) => update({ colorMaterialReferenceTone: event.target.value })} />
            </div>
          ) : (
            <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接色彩与材质参考图；普通 image 输入仍只作为展品图</div>
          )}
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><Ruler size={13} /> 输出形式要求</div>
            <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[11px] text-white/70">
              <input type="checkbox" className="accent-cyan-300" checked={d.perspectiveEnabled !== false} disabled={isReadonly || busy} onChange={(event) => update({ perspectiveEnabled: event.target.checked })} />
              透视效果
            </label>
            <label className="flex items-center gap-2 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[11px] text-white/70">
              <input type="checkbox" className="accent-cyan-300" checked={d.dimensionMarksEnabled === true} disabled={isReadonly || busy} onChange={(event) => update({ dimensionMarksEnabled: event.target.checked })} />
              是否标注尺寸
            </label>
            <label className="flex items-center gap-2 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[11px] text-white/70">
              <input type="checkbox" className="accent-cyan-300" checked={d.explodedViewEnabled === true} disabled={isReadonly || busy} onChange={(event) => update({ explodedViewEnabled: event.target.checked })} />
              输出分解爆炸图
            </label>
          </div>

          <div className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
            <div className="mb-2 text-[11px] font-semibold text-cyan-100">模型与尺寸</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-white/55">生图平台</span>
                <select
                  className={FIELD}
                  value={providerSelectValue}
                  disabled={isReadonly || busy || (!allowZhenzhenFallback && imageAdvancedProviders.length === 0)}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    if (nextId === 'zhenzhen') {
                      update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
                      return;
                    }
                    const provider = imageAdvancedProviders.find((item) => item.id === nextId);
                    if (!provider) return;
                    const models = advancedProviderModelOptions(provider, 'image');
                    update({ providerSource: provider.protocol, providerId: provider.id, providerModel: models[0] || '' });
                  }}
                >
                  {allowZhenzhenFallback && <option value="zhenzhen">内置生图平台</option>}
                  {imageAdvancedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-white/55">生图模型</span>
                {isExternalSelected ? (
                  <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy || externalModelOptions.length === 0} onChange={(event) => update({ providerModel: event.target.value })}>
                    {externalModelOptions.length > 0
                      ? externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>)
                      : <option value="">未配置图像模型</option>}
                  </select>
                ) : (
                  <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(event) => update({ apiModel: event.target.value })}>
                    {modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-white/55">比例</span>
                <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
                  {(modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <span className="text-[9px] text-cyan-100/65">按展柜宽高自动匹配：{autoAspectRatio}</span>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-white/55">尺寸</span>
                <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
                  {(modelDef.sizes.length ? modelDef.sizes : ['1K', '2K', '4K']).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-white/55">Seed</span>
                <input className={FIELD} type="number" min={0} value={seed} disabled={isReadonly || busy} onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-white/55">输出格式</span>
                <div className="grid grid-cols-2 gap-0.5 rounded bg-white/5 p-0.5">
                  {(['jpg', 'png'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      disabled={isReadonly || busy}
                      onClick={() => update({ outputFormat: fmt })}
                      className={`rounded py-1 text-[10px] font-semibold transition-all ${outputFormat === fmt ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </label>
            </div>
          </div>
          {d.progress && <div className="text-[10px] text-cyan-100">{d.progress}</div>}
          {d.error && <div className="rounded border border-rose-400/20 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-100">{d.error}</div>}
          {d.imageUrl && <img src={d.imageUrl} alt="" className="max-h-56 w-full rounded border border-white/10 object-contain" draggable={false} />}
        </section>

        <section className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
          <div className="mb-1 text-[11px] font-semibold text-cyan-100">当前 Prompt</div>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">{previewPrompt}</div>
        </section>
      </div>
      <ShowcaseManualLayoutModal
        open={manualLayoutOpen}
        items={manualLayoutItems}
        showcaseStyle={showcaseStyle}
        disabled={isReadonly || busy}
        onChange={updateManualLayoutItems}
        onClose={() => setManualLayoutOpen(false)}
        onReset={resetManualLayoutItems}
      />
    </div>
  );
};

export default memo(ShowcaseInteriorDesignNode);
