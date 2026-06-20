import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, useReactFlow, type NodeProps } from '@xyflow/react';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Clipboard,
  FileText,
  Image as ImageIcon,
  Loader2,
  MoveVertical,
  Play,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_LLM_MODEL,
  IMAGE_MODELS,
} from '../../providers/models';
import {
  generateExternalImage,
  generateLlm,
  queryExternalImageStatus,
  queryImageStatus,
  submitImageAsync,
} from '../../services/generation';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  buildExhibitionImg2ImgPrompt,
  EXHIBITION_IMG2IMG_PRIORITY,
  normalizeExhibitionImg2ImgPriority,
  type ExhibitionImg2ImgPriorityId,
} from '../../utils/exhibitionImg2ImgPrompt';
import {
  ELEVATION_CRAFTS,
  buildElevationContentPlanMessages,
  buildElevationOutputs,
  normalizeElevationAnalysis,
  parseElevationContentPlanResponse,
  type ElevationCraft,
  type ElevationAnalysis,
  type ElevationContentPlan,
  type ElevationWall,
} from '../../utils/elevationPrompt';
import {
  extractDocument,
  getCurrentUser,
  getElevationPromptPresets,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_MB,
  updateElevationColorMaterialPresets,
  updateElevationCraftPresets,
  type AuthUser,
  type ElevationColorMaterialPresetItem,
  type ElevationCraftPresetItem,
  type ExtractedDocument,
} from '../../services/api';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useThemeStore } from '../../stores/theme';
import { useUpdateNodeData } from './useUpdateNodeData';
import ColorMaterialPresetEditorModal from './ColorMaterialPresetEditorModal';
import ColorMaterialPresetSelect from './ColorMaterialPresetSelect';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const DEFAULT_CRAFTS = ['panel', 'dimensional-letters', 'soft-film-lightbox'];
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_SIZE_LEVELS = ['1K', '2K', '4K'];
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const DEFAULT_REFERENCE_MARK_FONT_SIZE = 24;
const DEFAULT_COLOR_MATERIAL_MARK_TEXT = '图2';
const AUTO_REFERENCE_MARK_SIZE_RATIO = 0.05;
const LEGACY_COLOR_MATERIAL_MARK_TEXT = 'R';
const LEGACY_REFERENCE_MARK_FONT_SIZE = 12;
const COLOR_MATERIAL_MARK_DEFAULTS_VERSION = 2;
const SPACE_LIGHTING_OPTIONS = [
  { value: 'very-dark', label: '非常暗' },
  { value: 'dark', label: '比较暗' },
  { value: 'bright', label: '比较亮' },
  { value: 'very-bright', label: '非常亮' },
] as const;

type ReferenceMarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type ColorMaterialReferenceMode = 'abstract-card' | 'marked-image';
type ColorMaterialPriorityMode = 'frontend' | 'llm';
type SpaceLightingLevel = typeof SPACE_LIGHTING_OPTIONS[number]['value'];

interface ReferenceMarkSettings {
  text: string;
  position: ReferenceMarkPosition;
  color: string;
  fontSize: number;
  autoFontSize: boolean;
}

const REFERENCE_MARK_POSITION_OPTIONS: Array<{ value: ReferenceMarkPosition; label: string }> = [
  { value: 'top-left', label: '左上角' },
  { value: 'top-right', label: '右上角' },
  { value: 'bottom-left', label: '左下角' },
  { value: 'bottom-right', label: '右下角' },
];

interface ExhibitReferenceInputImage {
  id: string;
  url: string;
  label: string;
}

interface ExhibitReferenceItem extends ExhibitReferenceInputImage {
  description: string;
}

function same(valueA: unknown, valueB: unknown) {
  return JSON.stringify(valueA) === JSON.stringify(valueB);
}

function documentLabel(meta?: Omit<ExtractedDocument, 'text'> | null) {
  if (!meta) return '未选择文档';
  const pages = meta.pageCount ? ` · ${meta.pageCount} 页` : '';
  return `${meta.name} · ${meta.charCount} 字${pages}`;
}

function randomImageSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return (values[0] % MAX_IMAGE_SEED) + 1;
  }
  return Math.floor(Math.random() * MAX_IMAGE_SEED) + 1;
}

function normalizeReferenceMarkPosition(value: unknown): ReferenceMarkPosition {
  if (value === 'top-right' || value === 'bottom-left' || value === 'bottom-right') return value;
  return 'top-left';
}

function clampReferenceMarkFontSize(value: unknown): number {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isFinite(number)) return DEFAULT_REFERENCE_MARK_FONT_SIZE;
  return Math.max(1, Math.min(512, number));
}

function normalizeReferenceMarkColor(value: unknown): string {
  const text = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : '#ff0000';
}

function normalizeReferenceMarkText(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.slice(0, 64) : '';
  return text || fallback;
}

function normalizeColorMaterialPriorityMode(value: unknown): ColorMaterialPriorityMode {
  return value === 'llm' ? 'llm' : 'frontend';
}

function normalizeSpaceLightingLevel(value: unknown): SpaceLightingLevel {
  return SPACE_LIGHTING_OPTIONS.some((item) => item.value === value) ? value as SpaceLightingLevel : 'bright';
}

function normalizeReferenceMarkSettings(data: any, prefix: 'colorMaterial'): ReferenceMarkSettings {
  return {
    text: normalizeReferenceMarkText(data?.[`${prefix}MarkText`], DEFAULT_COLOR_MATERIAL_MARK_TEXT),
    position: normalizeReferenceMarkPosition(data?.[`${prefix}MarkPosition`]),
    color: normalizeReferenceMarkColor(data?.[`${prefix}MarkColor`]),
    fontSize: clampReferenceMarkFontSize(data?.[`${prefix}MarkFontSize`]),
    autoFontSize: data?.[`${prefix}MarkAutoFontSize`] === true,
  };
}

function loadReferenceImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('参考图加载失败，无法添加标识'));
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.src = src;
  });
}

function rgbToHsl(red: number, green: number, blue: number): { h: number; s: number; l: number } {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / delta + 2) / 6;
  else h = ((r - g) / delta + 4) / 6;
  return { h: h * 360, s, l };
}

function colorToneName(red: number, green: number, blue: number): string {
  const { h, s, l } = rgbToHsl(red, green, blue);
  if (l <= 0.12) return '黑色';
  if (s <= 0.1) {
    if (l >= 0.86) return '暖白/浅灰';
    if (l <= 0.32) return '深灰';
    return '中性灰';
  }
  if (h < 12 || h >= 345) return l < 0.45 ? '深红' : '红色';
  if (h < 28) return l < 0.46 ? '红褐' : '橙红';
  if (h < 46) return l < 0.55 ? '铜褐/棕色' : '暖橙/铜金';
  if (h < 66) return l < 0.5 ? '橄榄金' : '金黄';
  if (h < 90) return '黄绿';
  if (h < 165) return l < 0.42 ? '深绿' : '绿色';
  if (h < 195) return '青色';
  if (h < 245) return l < 0.42 ? '深蓝' : '蓝色';
  if (h < 285) return '蓝紫';
  if (h < 325) return '紫色';
  return '玫红/酒红';
}

async function analyzeReferenceImageDominantTone(imageUrl: string): Promise<string> {
  const image = await loadReferenceImage(imageUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('参考图尺寸无效，无法识别主色调');
  const maxSide = 96;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('当前浏览器无法创建主色调识别画布');
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const buckets = new Map<string, { name: string; count: number; sat: number; light: number; warm: number; cool: number }>();
  let total = 0;
  let satSum = 0;
  let lightSum = 0;
  let warm = 0;
  let cool = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const { h, s, l } = rgbToHsl(red, green, blue);
    const name = colorToneName(red, green, blue);
    const bucket = buckets.get(name) || { name, count: 0, sat: 0, light: 0, warm: 0, cool: 0 };
    const weight = 1 + Math.min(0.8, s);
    bucket.count += weight;
    bucket.sat += s * weight;
    bucket.light += l * weight;
    if (s > 0.08 && (h < 75 || h >= 325)) bucket.warm += weight;
    if (s > 0.08 && h >= 165 && h < 285) bucket.cool += weight;
    buckets.set(name, bucket);
    total += weight;
    satSum += s * weight;
    lightSum += l * weight;
    if (s > 0.08 && (h < 75 || h >= 325)) warm += weight;
    if (s > 0.08 && h >= 165 && h < 285) cool += weight;
  }
  if (!total || buckets.size === 0) return '主色调：未识别到有效色彩；可手动填写色彩倾向。';
  const dominant = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((item) => item.name);
  const temperature = warm > cool * 1.25 ? '整体偏暖' : cool > warm * 1.25 ? '整体偏冷' : '冷暖较均衡';
  const avgLight = lightSum / total;
  const lightText = avgLight < 0.36 ? '明度偏暗' : avgLight > 0.68 ? '明度偏亮' : '明度中等';
  const avgSat = satSum / total;
  const satText = avgSat < 0.18 ? '饱和度克制' : avgSat > 0.46 ? '饱和度较高' : '饱和度适中';
  return `主色调：${dominant.join('、')}；${temperature}，${lightText}，${satText}。`;
}

function resolveReferenceMarkFontSize(width: number, height: number, settings: ReferenceMarkSettings): number {
  if (!settings.autoFontSize) return settings.fontSize;
  return Math.max(1, Math.min(512, Math.round(Math.max(width, height) * AUTO_REFERENCE_MARK_SIZE_RATIO)));
}

function drawReferenceMark(ctx: CanvasRenderingContext2D, width: number, height: number, settings: ReferenceMarkSettings) {
  const fontSize = resolveReferenceMarkFontSize(width, height, settings);
  const margin = Math.max(2, Math.ceil(fontSize * 0.25));
  const isRight = settings.position.endsWith('right');
  const isBottom = settings.position.startsWith('bottom');
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = settings.color;
  ctx.textAlign = isRight ? 'right' : 'left';
  ctx.textBaseline = isBottom ? 'alphabetic' : 'top';
  ctx.fillText(settings.text || DEFAULT_COLOR_MATERIAL_MARK_TEXT, isRight ? Math.max(0, width - margin) : margin, isBottom ? Math.max(fontSize, height - margin) : margin);
}

async function markImageDataUrl(imageUrl: string, settings: ReferenceMarkSettings): Promise<string> {
  const image = await loadReferenceImage(imageUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('参考图尺寸无效，无法添加标识');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法创建标识画布');
  ctx.drawImage(image, 0, 0, width, height);
  drawReferenceMark(ctx, width, height, settings);
  return canvas.toDataURL('image/png');
}

async function createColorMaterialAbstractCardDataUrl(imageUrl: string, settings: ReferenceMarkSettings): Promise<string> {
  const image = await loadReferenceImage(imageUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Invalid color material reference image size');
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create color material abstract card');
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 18;
  sampleCanvas.height = 18;
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) throw new Error('Unable to sample color material reference image');
  sampleCtx.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sampleCanvas, 0, 0, size, size);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.filter = 'blur(24px) saturate(1.12)';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sampleCanvas, -48, -48, size + 96, size + 96);
  ctx.restore();
  const cells = 5;
  const gap = 18;
  const cellSize = (size - gap * (cells + 1)) / cells;
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.imageSmoothingEnabled = true;
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const index = row * cells + col;
      const sx = Math.floor((((index * 37) % 100) / 100) * Math.max(1, sourceWidth - sourceWidth * 0.18));
      const sy = Math.floor((((index * 53 + 17) % 100) / 100) * Math.max(1, sourceHeight - sourceHeight * 0.18));
      const sw = Math.max(16, Math.floor(sourceWidth * (0.12 + ((index % 4) * 0.035))));
      const sh = Math.max(16, Math.floor(sourceHeight * (0.12 + (((index + 2) % 4) * 0.035))));
      const dx = gap + col * (cellSize + gap);
      const dy = gap + row * (cellSize + gap);
      ctx.drawImage(image, sx, sy, Math.min(sw, sourceWidth - sx), Math.min(sh, sourceHeight - sy), dx, dy, cellSize, cellSize);
    }
  }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 28; i += 1) {
    const x = ((i * 97) % size);
    const y = ((i * 61 + 29) % size);
    const radius = 90 + ((i * 23) % 140);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(Math.max(0, x - radius), Math.max(0, y - radius), radius * 2, radius * 2);
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillRect(0, 0, size, 54);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = '24px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COLOR / MATERIAL ONLY - NO SPATIAL STRUCTURE', size / 2, 27);
  ctx.restore();
  drawReferenceMark(ctx, size, size, settings);
  return canvas.toDataURL('image/png');
}

function isGptImage2Model(value: unknown): boolean {
  return /^gpt-image-2(?:$|-|_)/i.test(String(value || '').trim());
}

function imagesFromData(data: any): string[] {
  const out: string[] = [];
  const push = (value: any) => {
    const url = typeof value === 'string' ? value.trim() : '';
    if (url && !out.includes(url)) out.push(url);
  };
  push(data?.imageUrl);
  for (const key of ['imageUrls', 'urls', 'generatedImages']) {
    const list = data?.[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) push(item);
  }
  push(data?.firstFrameUrl);
  return out;
}

function firstImageFromData(data: any): string {
  return imagesFromData(data)[0] || '';
}

function shortFileLabel(url: string, fallback = '展品') {
  return (url.split('/').pop() || fallback).split('?')[0].slice(0, 28) || fallback;
}

function useHandleImage(nodeId: string, targetHandle: string): string {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns
      .filter((conn: any) => (conn.targetHandle || '') === targetHandle)
      .map((conn: any) => conn.source)
      .filter(Boolean))),
    [conns, targetHandle],
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

function useHandleImages(nodeId: string, targetHandle: string, includeLegacyHandle = ''): ExhibitReferenceInputImage[] {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const filteredConns = useMemo(
    () => conns.filter((conn: any) => {
      const handle = conn.targetHandle || '';
      return handle === targetHandle || (!!includeLegacyHandle && handle === includeLegacyHandle);
    }),
    [conns, includeLegacyHandle, targetHandle],
  );
  const sourceIds = useMemo(
    () => Array.from(new Set(filteredConns.map((conn: any) => conn.source).filter(Boolean))),
    [filteredConns],
  );
  const nodesData = useNodesData(sourceIds);
  return useMemo(() => {
    const out: ExhibitReferenceInputImage[] = [];
    const seen = new Set<string>();
    const list = Array.isArray(nodesData) ? nodesData : [nodesData];
    for (const node of list) {
      const nodeIdValue = String((node as any)?.id || 'node');
      const urls = imagesFromData((node as any)?.data || {});
      urls.forEach((url, index) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        out.push({
          id: `${nodeIdValue}:exhibit:${index}:${url}`,
          url,
          label: shortFileLabel(url, `展品参考 ${out.length + 1}`),
        });
      });
    }
    return out;
  }, [nodesData]);
}

function craftPresetEditorText(presets: ElevationCraftPresetItem[]): string {
  return presets.map((preset) => `${preset.label}｜${preset.prompt}`).join('\n');
}

function parseCraftPresetEditorText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const raw = line.trim();
      if (!raw) return null;
      const [labelRaw, ...rest] = raw.split(/[｜|]/);
      const label = String(labelRaw || '').trim();
      const prompt = rest.join('｜').trim();
      if (!label || !prompt) return null;
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'craft'}-${index + 1}`,
        label,
        prompt,
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; prompt: string; order: number }>;
}

function colorMaterialTextFromPreset(preset: ElevationColorMaterialPresetItem): string {
  return [
    preset.label,
    String(preset.core || '').trim(),
    String(preset.features || '').trim(),
    String(preset.usage || '').trim(),
  ].filter(Boolean).join('；');
}

function colorPaletteTextFromPreset(preset: ElevationColorMaterialPresetItem): string {
  return String(preset.core || preset.info || preset.label || '').trim();
}

function materialTexturesTextFromPreset(preset: ElevationColorMaterialPresetItem): string {
  return String(preset.features || preset.info || preset.core || preset.label || '').trim();
}

function combineColorMaterialText(palette: string, textures: string, fallback = ''): string {
  const parts = [String(palette || '').trim(), String(textures || '').trim()].filter(Boolean);
  return parts.length ? parts.join('；') : String(fallback || '').trim();
}

function buildColorMaterialPresetPayload(presets: ElevationColorMaterialPresetItem[]) {
  return presets.map((preset, index) => ({
    id: preset.id,
    category: preset.category,
    label: preset.label,
    core: preset.core || '',
    features: preset.features || '',
    usage: preset.usage || '',
    info: preset.info || '',
    order: index,
  }));
}

function PrioritySorter({
  value,
  disabled,
  onChange,
}: {
  value: ExhibitionImg2ImgPriorityId[];
  disabled: boolean;
  onChange: (next: ExhibitionImg2ImgPriorityId[]) => void;
}) {
  const [dragId, setDragId] = useState<ExhibitionImg2ImgPriorityId | null>(null);

  const move = (id: ExhibitionImg2ImgPriorityId, delta: number) => {
    const index = value.indexOf(id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= value.length) return;
    const next = value.slice();
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, id: ExhibitionImg2ImgPriorityId) => {
    if (disabled) return;
    event.stopPropagation();
    setDragId(id);
  };

  return (
    <div className="space-y-1">
      {value.map((id, index) => {
        const meta = EXHIBITION_IMG2IMG_PRIORITY.find((item) => item.id === id);
        return (
          <div
            key={id}
            className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${
              dragId === id ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-black/15 text-white/70'
            }`}
            onPointerDown={(event) => onPointerDown(event, id)}
            onPointerUp={() => setDragId(null)}
          >
            <MoveVertical size={12} className="text-white/35" />
            <span className="h-4 w-4 rounded bg-cyan-300/15 text-center text-[9px] leading-4 text-cyan-100">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate">{meta?.label || id}</span>
            <button type="button" className="rounded p-0.5 hover:bg-white/10 disabled:opacity-35" disabled={disabled || index === 0} onClick={() => move(id, -1)}>
              <ArrowUp size={12} />
            </button>
            <button type="button" className="rounded p-0.5 hover:bg-white/10 disabled:opacity-35" disabled={disabled || index === value.length - 1} onClick={() => move(id, 1)}>
              <ArrowDown size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ImageSlot({
  handleId,
  title,
  subtitle,
  url,
  top,
}: {
  handleId: 'structure' | 'color-material-reference' | 'exhibit-reference';
  title: string;
  subtitle: string;
  url: string;
  top: string;
}) {
  return (
    <>
      <Handle
        id={handleId}
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-0 !bg-cyan-300"
        style={{ top }}
        title={`输入：${title} — ${subtitle}`}
      />
      <div className="rounded border border-white/10 bg-black/15 p-2">
        <div className="mb-1 flex items-center gap-1.5">
          <ImageIcon size={12} className="text-cyan-200" />
          <span className="text-[11px] font-semibold text-cyan-100">{title}</span>
        </div>
        {url ? (
          <div className="flex items-center gap-2">
            <img src={url} alt="" className="h-14 w-20 rounded border border-white/10 object-cover" draggable={false} />
            <div className="min-w-0 flex-1 text-[10px] text-white/45">
              <div className="truncate">{subtitle}</div>
              <div className="mt-1 truncate" title={url}>{url.split('/').pop() || url}</div>
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-white/15 px-2 py-3 text-[10px] text-white/35">
            请连接一张图像到此输入口
          </div>
        )}
      </div>
    </>
  );
}

const ExhibitionImg2ImgNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const fileRef = useRef<HTMLInputElement>(null);
  const colorMaterialPresetDisconnectRef = useRef(false);
  const { style } = useThemeStore();
  const isPixel = style === 'pixel';
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const imageAdvancedProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredLlmModel }];
  }, [configuredLlmModel, llmConfigs]);
  const providerSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'image', {
      providerSource: d.providerSource,
      providerId: d.providerId,
      providerModel: d.providerModel,
    }),
    [advancedProviders, d.providerSource, d.providerId, d.providerModel],
  );
  const isExternalSelected = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const savedExternalMissing = !!d.providerSource && d.providerSource !== 'zhenzhen' && !providerSelection.available;
  const externalModelOptions = providerSelection.provider
    ? advancedProviderModelOptions(providerSelection.provider, 'image')
    : [];
  const externalProviderModel = providerSelection.providerModel || externalModelOptions[0] || '';
  const firstImageAdvancedProvider = imageAdvancedProviders[0] || null;
  const providerSelectValue = isExternalSelected
    ? providerSelection.providerId
    : (allowZhenzhenFallback ? 'zhenzhen' : (firstImageAdvancedProvider?.id || ''));
  const selectedContentLlmKeyId = String(d.contentLlmKeyId || '').trim();
  const activeContentLlmConfig = llmConfigOptions.find((item) => item.id === selectedContentLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const savedContentModel = String(d.contentModel || '').trim();
  const contentModel = activeContentLlmConfig?.model || savedContentModel || configuredLlmModel;

  const model = d.model || 'gpt-image-2';
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const useColorMaterialAbstractCard = isExternalSelected
    ? isGptImage2Model(externalProviderModel)
    : (isGptImage2Model(apiModel) || isGptImage2Model(modelDef.id));
  const colorMaterialReferenceMode: ColorMaterialReferenceMode = useColorMaterialAbstractCard ? 'abstract-card' : 'marked-image';
  const aspectRatio = d.aspectRatio || modelDef.defaultAspectRatio || '1:1';
  const sizeLevel = d.sizeLevel || modelDef.defaultSize || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));

  const structureImage = useHandleImage(id, 'structure');
  const colorMaterialReferenceInputImage = useHandleImage(id, 'color-material-reference');
  const legacyStyleInputImage = useHandleImage(id, 'style');
  const colorMaterialReferenceImage = colorMaterialReferenceInputImage || legacyStyleInputImage;
  const exhibitReferenceInputImages = useHandleImages(id, 'exhibit-reference', 'exhibits');
  const exhibitReferenceImageUrls = useMemo(() => exhibitReferenceInputImages.map((item) => item.url), [exhibitReferenceInputImages]);
  const exhibitReferenceItems = useMemo(() => {
    const saved: ExhibitReferenceItem[] = Array.isArray(d.exhibitReferenceItems) ? d.exhibitReferenceItems : [];
    return exhibitReferenceInputImages.map((image) => {
      const existing = saved.find((item) => item.url === image.url);
      return existing
        ? { ...existing, id: image.id, label: image.label }
        : { ...image, description: '' };
    });
  }, [d.exhibitReferenceItems, exhibitReferenceInputImages]);
  const priorityOrder = normalizeExhibitionImg2ImgPriority(d.priorityOrder);
  const selectedCrafts: string[] = Array.isArray(d.selectedCrafts) ? d.selectedCrafts : DEFAULT_CRAFTS;
  const contentEnabled = d.contentPlanningEnabled === true;
  const sourceText = String(d.sourceText || '');
  const regenerateContentEachRun = d.regenerateContentEachRun === true;
  const wallMode: 'single' | 'multi' = d.wallMode === 'single' ? 'single' : 'multi';
  const wallCount = Math.max(1, Math.min(12, Number(d.wallCount) || 3));
  const analysis = useMemo(
    () => normalizeElevationAnalysis(d.analysis) as ElevationAnalysis,
    [d.analysis],
  );
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [craftPresets, setCraftPresets] = useState<ElevationCraftPresetItem[]>([]);
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);
  const [craftEditorOpen, setCraftEditorOpen] = useState(false);
  const [colorMaterialEditorOpen, setColorMaterialEditorOpen] = useState(false);
  const [craftEditorValue, setCraftEditorValue] = useState('');
  const [craftSaving, setCraftSaving] = useState(false);
  const [colorMaterialSaving, setColorMaterialSaving] = useState(false);
  const [craftError, setCraftError] = useState('');
  const [colorMaterialError, setColorMaterialError] = useState('');
  const status = String(d.status || 'idle');
  const isGenerating = status === 'generating';
  const busy = isGenerating || status === 'extracting' || status === 'refining';
  const contentBusy = status === 'extracting' || status === 'refining';
  const pollAbortRef = useRef(false);
  const craftPresetOptions = useMemo<ElevationCraft[]>(
    () => (craftPresets.length > 0 ? craftPresets : ELEVATION_CRAFTS),
    [craftPresets],
  );
  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );
  const colorMaterial = String(d.colorMaterial || '').trim();
  const colorMaterialPalette = String(d.colorMaterialPalette || '').trim();
  const colorMaterialTextures = String(d.colorMaterialTextures || '').trim();
  const combinedColorMaterial = combineColorMaterialText(colorMaterialPalette, colorMaterialTextures, colorMaterial);
  const colorMaterialPriorityMode = normalizeColorMaterialPriorityMode(d.colorMaterialPriorityMode);
  const spaceLightingEnabled = d.spaceLightingEnabled === true;
  const spaceLightingLevel = normalizeSpaceLightingLevel(d.spaceLightingLevel);
  const hasColorMaterialReference = !!colorMaterialReferenceImage;
  const hasSelectedColorMaterialPreset = !!String(d.colorMaterialPreset || '').trim();
  const hasColorMaterialPreset = hasSelectedColorMaterialPreset && !hasColorMaterialReference;
  const activeColorMaterialReferenceImage = hasColorMaterialReference ? colorMaterialReferenceImage : '';
  const colorMaterialRecognitionDisabled = hasColorMaterialPreset || !hasColorMaterialReference;
  const colorMaterialReferenceTone = String(d.colorMaterialReferenceTone || '').trim();
  const colorMaterialMarkSettings = useMemo(() => normalizeReferenceMarkSettings(d, 'colorMaterial'), [
    d.colorMaterialMarkAutoFontSize,
    d.colorMaterialMarkColor,
    d.colorMaterialMarkFontSize,
    d.colorMaterialMarkPosition,
    d.colorMaterialMarkText,
  ]);
  const hasColorMaterialInput = hasColorMaterialReference || hasColorMaterialPreset || !!combinedColorMaterial;
  const promptColorMaterial = hasColorMaterialReference ? '' : combinedColorMaterial;
  const promptColorMaterialPalette = hasColorMaterialReference ? '' : (colorMaterialPalette || colorMaterial);
  const promptColorMaterialTextures = hasColorMaterialReference ? '' : (colorMaterialTextures || colorMaterial);
  const contentOutputs = useMemo(
    () => buildElevationOutputs({
      analysis,
      walls: Array.isArray(d.walls) ? d.walls : [],
      wallMode,
      wallCount,
      outputMode: d.outputMode === 'overview' ? 'overview' : 'segments',
      downstreamContent: 'schedule',
      selectedCrafts,
      customCraft: d.customCraft,
      aspectRatio: d.aspectRatio,
      dimensions: d.dimensions,
      density: d.density,
      colorMaterial: d.colorMaterial,
      visualStyle: d.visualStyle,
      supplement: d.contentSupplement,
      craftPresets,
    }),
    [
      analysis,
      craftPresets,
      d.colorMaterial,
      d.contentSupplement,
      d.customCraft,
      d.density,
      d.dimensions,
      d.outputMode,
      d.visualStyle,
      d.walls,
      selectedCrafts,
      wallCount,
      wallMode,
    ],
  );
  const hasContentPlanning = contentEnabled && (
    Array.isArray(d.walls) && d.walls.length > 0 ||
    !!d.contentPlanningPrompt
  );
  const wallContentPrompt = hasContentPlanning ? contentOutputs.mainOutput : '';

  const buildPromptWithWallPlan = useCallback((plan: ElevationContentPlan) => {
    const nextAnalysis = {
      projectTheme: plan.projectTheme,
      coreMessage: plan.coreMessage,
      sections: [],
    };
    const nextContentOutputs = buildElevationOutputs({
      analysis: nextAnalysis,
      walls: plan.walls,
      wallMode,
      wallCount,
      outputMode: d.outputMode === 'overview' ? 'overview' : 'segments',
      downstreamContent: 'schedule',
      selectedCrafts,
      customCraft: d.customCraft,
      aspectRatio: d.aspectRatio,
      dimensions: d.dimensions,
      density: d.density,
      colorMaterial: d.colorMaterial,
      visualStyle: d.visualStyle,
      supplement: d.contentSupplement,
      craftPresets,
    });
    return buildExhibitionImg2ImgPrompt({
      priorityOrder,
      selectedCrafts,
      customCraft: d.customCraft,
      craftPresets,
      density: d.density,
      dimensions: d.dimensions,
      colorMaterial: promptColorMaterial,
      visualStyle: d.visualStyle,
      colorMaterialPalette: promptColorMaterialPalette,
      colorMaterialTextures: promptColorMaterialTextures,
      hasColorMaterialPreset,
      hasColorMaterialReferenceImage: !!activeColorMaterialReferenceImage,
      colorMaterialReferenceTone,
      colorMaterialPriorityMode,
      colorMaterialReferenceMode,
      colorMaterialReferenceMarkText: colorMaterialMarkSettings.text,
      colorMaterialReferenceMarkPosition: colorMaterialMarkSettings.position,
      spaceLightingEnabled,
      spaceLightingLevel,
      supplement: d.supplement,
      wallContentPrompt: nextContentOutputs.mainOutput,
      exhibitReferenceItems,
    });
  }, [
    activeColorMaterialReferenceImage,
    colorMaterialMarkSettings.position,
    colorMaterialMarkSettings.text,
    colorMaterialPriorityMode,
    colorMaterialReferenceMode,
    colorMaterialReferenceTone,
    craftPresets,
    d.aspectRatio,
    d.colorMaterial,
    d.contentSupplement,
    d.customCraft,
    d.density,
    d.dimensions,
    d.outputMode,
    d.supplement,
    d.visualStyle,
    exhibitReferenceItems,
    hasColorMaterialPreset,
    priorityOrder,
    promptColorMaterial,
    promptColorMaterialPalette,
    promptColorMaterialTextures,
    selectedCrafts,
    spaceLightingEnabled,
    spaceLightingLevel,
    wallCount,
    wallMode,
  ]);

  const prompt = useMemo(
    () => buildExhibitionImg2ImgPrompt({
      priorityOrder,
      selectedCrafts,
      customCraft: d.customCraft,
      craftPresets,
      density: d.density,
      dimensions: d.dimensions,
      colorMaterial: promptColorMaterial,
      visualStyle: d.visualStyle,
      colorMaterialPalette: promptColorMaterialPalette,
      colorMaterialTextures: promptColorMaterialTextures,
      hasColorMaterialPreset,
      hasColorMaterialReferenceImage: !!activeColorMaterialReferenceImage,
      colorMaterialReferenceTone,
      colorMaterialPriorityMode,
      colorMaterialReferenceMode,
      colorMaterialReferenceMarkText: colorMaterialMarkSettings.text,
      colorMaterialReferenceMarkPosition: colorMaterialMarkSettings.position,
      spaceLightingEnabled,
      spaceLightingLevel,
      supplement: d.supplement,
      wallContentPrompt,
      exhibitReferenceItems,
    }),
    [activeColorMaterialReferenceImage, colorMaterialMarkSettings.position, colorMaterialMarkSettings.text, colorMaterialPriorityMode, colorMaterialReferenceMode, colorMaterialReferenceTone, craftPresets, d.customCraft, d.density, d.dimensions, d.supplement, d.visualStyle, exhibitReferenceItems, hasColorMaterialPreset, priorityOrder, promptColorMaterial, promptColorMaterialPalette, promptColorMaterialTextures, selectedCrafts, spaceLightingEnabled, spaceLightingLevel, wallContentPrompt],
  );

  const disconnectColorMaterialReferenceInput = useCallback(() => {
    colorMaterialPresetDisconnectRef.current = true;
    rf.setEdges((eds) => eds.filter((edge: any) => (
      edge.target !== id || !['color-material-reference', 'style'].includes(edge.targetHandle || '')
    )));
  }, [id, rf]);

  const renderColorMaterialMarkSettings = (
    title: string,
    settings: ReferenceMarkSettings,
  ) => (
    <div className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-cyan-100">{title}</span>
        <label className="flex items-center gap-1.5 text-[9px] text-white/45">
          <input
            type="checkbox"
            checked={settings.autoFontSize}
            disabled={isReadonly || busy}
            className="accent-cyan-300"
            onChange={(event) => update({ colorMaterialMarkAutoFontSize: event.target.checked })}
          />
          自动字号
        </label>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <input
          className={FIELD}
          value={settings.text}
          disabled={isReadonly || busy}
          maxLength={64}
          placeholder="标识"
          onChange={(event) => update({ colorMaterialMarkText: event.target.value })}
        />
        <select
          className={`${FIELD} col-span-2`}
          value={settings.position}
          disabled={isReadonly || busy}
          onChange={(event) => update({ colorMaterialMarkPosition: normalizeReferenceMarkPosition(event.target.value) })}
        >
          {REFERENCE_MARK_POSITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          className={FIELD}
          type="number"
          min={1}
          max={512}
          value={settings.fontSize}
          disabled={isReadonly || busy || settings.autoFontSize}
          onChange={(event) => update({ colorMaterialMarkFontSize: clampReferenceMarkFontSize(event.target.value) })}
        />
      </div>
      <div className="grid grid-cols-[34px_1fr] gap-1">
        <input
          type="color"
          value={settings.color}
          disabled={isReadonly || busy}
          className="h-7 w-full rounded border border-white/10 bg-black/20 p-0.5 disabled:opacity-55"
          onChange={(event) => update({ colorMaterialMarkColor: normalizeReferenceMarkColor(event.target.value) })}
        />
        <input
          className={FIELD}
          value={settings.color}
          disabled={isReadonly || busy}
          onChange={(event) => update({ colorMaterialMarkColor: event.target.value })}
          onBlur={(event) => update({ colorMaterialMarkColor: normalizeReferenceMarkColor(event.target.value) })}
        />
      </div>
    </div>
  );

  useEffect(() => {
    const refs = [structureImage, activeColorMaterialReferenceImage, ...exhibitReferenceImageUrls].filter(Boolean);
    const patch = {
      prompt,
      outputText: prompt,
      text: prompt,
      referenceImages: refs,
    };
    if (
      d.prompt !== prompt ||
      d.outputText !== prompt ||
      d.text !== prompt ||
      JSON.stringify(d.referenceImages || []) !== JSON.stringify(refs)
    ) {
      update(patch);
    }
  }, [activeColorMaterialReferenceImage, d.imageUrl, d.outputText, d.prompt, d.referenceImages, d.text, exhibitReferenceImageUrls, prompt, structureImage, update]);

  useEffect(() => {
    const saved: ExhibitReferenceItem[] = Array.isArray(d.exhibitReferenceItems) ? d.exhibitReferenceItems : [];
    const isSame = saved.length === exhibitReferenceItems.length
      && saved.every((item, index) => item.url === exhibitReferenceItems[index].url && item.description === exhibitReferenceItems[index].description);
    if (!isSame) update({ exhibitReferenceItems });
  }, [d.exhibitReferenceItems, exhibitReferenceItems, update]);

  useEffect(() => {
    if (Number(d.colorMaterialMarkDefaultsVersion) >= COLOR_MATERIAL_MARK_DEFAULTS_VERSION) return;
    const patch: Record<string, any> = {};
    if (String(d.colorMaterialMarkText || '').trim() === LEGACY_COLOR_MATERIAL_MARK_TEXT) {
      patch.colorMaterialMarkText = DEFAULT_COLOR_MATERIAL_MARK_TEXT;
    }
    if (Number(d.colorMaterialMarkFontSize) === LEGACY_REFERENCE_MARK_FONT_SIZE) {
      patch.colorMaterialMarkFontSize = DEFAULT_REFERENCE_MARK_FONT_SIZE;
    }
    patch.colorMaterialMarkDefaultsVersion = COLOR_MATERIAL_MARK_DEFAULTS_VERSION;
    if (Object.keys(patch).length > 0) update(patch);
  }, [d.colorMaterialMarkDefaultsVersion, d.colorMaterialMarkFontSize, d.colorMaterialMarkText, update]);

  useEffect(() => {
    if (!colorMaterialReferenceImage) {
      colorMaterialPresetDisconnectRef.current = false;
      return;
    }
    if (hasSelectedColorMaterialPreset && !colorMaterialPresetDisconnectRef.current) {
      update({ colorMaterialPreset: '' });
    }
  }, [colorMaterialReferenceImage, hasSelectedColorMaterialPreset, update]);

  useEffect(() => {
    if (hasColorMaterialPreset) {
      if (colorMaterialReferenceTone || d.colorMaterialReferenceToneSource || d.colorMaterialReferenceToneStatus) {
        update({ colorMaterialReferenceTone: '', colorMaterialReferenceToneSource: '', colorMaterialReferenceToneStatus: '' });
      }
      return;
    }
    const source = colorMaterialReferenceImage || '';
    const savedSource = String(d.colorMaterialReferenceToneSource || '').trim();
    if (!source) {
      if (d.colorMaterialReferenceTone || d.colorMaterialReferenceToneSource || d.colorMaterialReferenceToneStatus) {
        update({ colorMaterialReferenceTone: '', colorMaterialReferenceToneSource: '', colorMaterialReferenceToneStatus: '' });
      }
      return;
    }
    if (savedSource === source && colorMaterialReferenceTone) return;
    let cancelled = false;
    void (async () => {
      try {
        const tone = await analyzeReferenceImageDominantTone(source);
        if (cancelled) return;
        update({
          colorMaterialReferenceTone: tone,
          colorMaterialReferenceToneSource: source,
          colorMaterialReferenceToneStatus: '',
        });
      } catch (error: any) {
        if (cancelled) return;
        update({
          colorMaterialReferenceTone: '主色调：识别失败，可手动填写。',
          colorMaterialReferenceToneSource: source,
          colorMaterialReferenceToneStatus: error?.message || '主色调识别失败',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [colorMaterialReferenceImage, colorMaterialReferenceTone, d.colorMaterialReferenceToneSource, d.colorMaterialReferenceToneStatus, hasColorMaterialPreset, update]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getElevationPromptPresets()
      .then((presets) => {
        setCraftPresets(presets.crafts || []);
        setColorMaterialPresets(presets.colorMaterial || []);
      })
      .catch(() => {
        setCraftPresets([]);
        setColorMaterialPresets([]);
      });
  }, []);

  useEffect(() => {
    if (allowZhenzhenFallback || isExternalSelected || !firstImageAdvancedProvider) return;
    const nextModels = advancedProviderModelOptions(firstImageAdvancedProvider, 'image');
    update({
      providerSource: firstImageAdvancedProvider.protocol,
      providerId: firstImageAdvancedProvider.id,
      providerModel: nextModels[0] || '',
    });
  }, [allowZhenzhenFallback, firstImageAdvancedProvider, isExternalSelected, update]);

  useEffect(() => {
    if (!craftEditorOpen) return;
    setCraftEditorValue(craftPresetEditorText(craftPresets));
    setCraftError('');
  }, [craftEditorOpen, craftPresets]);

  useEffect(() => {
    if (!colorMaterialEditorOpen) return;
    setColorMaterialError('');
  }, [colorMaterialEditorOpen, colorMaterialPresets]);

  useEffect(() => {
    const patch = {
      contentPlanningPrompt: wallContentPrompt,
      contentWalls: contentOutputs.walls,
      contentLayoutSchedule: contentOutputs.layoutSchedule,
      contentConceptPrompts: contentOutputs.conceptPrompts,
    };
    if (
      d.contentPlanningPrompt !== patch.contentPlanningPrompt ||
      !same(d.contentWalls || [], patch.contentWalls) ||
      d.contentLayoutSchedule !== patch.contentLayoutSchedule ||
      !same(d.contentConceptPrompts || [], patch.contentConceptPrompts)
    ) {
      update(patch);
    }
  }, [contentOutputs.conceptPrompts, contentOutputs.layoutSchedule, contentOutputs.walls, d.contentConceptPrompts, d.contentLayoutSchedule, d.contentPlanningPrompt, d.contentWalls, update, wallContentPrompt]);

  const orderedReferenceImages = useMemo(() => {
    const imageForPriority: Record<string, string[]> = {
      structureAnnotations: structureImage ? [structureImage] : [],
      craftLayout: [],
      colorMaterialReference: activeColorMaterialReferenceImage ? [activeColorMaterialReferenceImage] : [],
    };
    const out: string[] = [];
    for (const key of priorityOrder) {
      for (const url of imageForPriority[key]) {
        if (url && !out.includes(url)) out.push(url);
      }
    }
    for (const url of exhibitReferenceImageUrls) {
      if (url && !out.includes(url)) out.push(url);
    }
    return out;
  }, [activeColorMaterialReferenceImage, exhibitReferenceImageUrls, priorityOrder, structureImage]);

  const buildRuntimeReferenceImages = useCallback(async () => {
    const runtimeColorMaterialReference = activeColorMaterialReferenceImage && colorMaterialPriorityMode === 'llm'
      ? useColorMaterialAbstractCard
        ? await createColorMaterialAbstractCardDataUrl(activeColorMaterialReferenceImage, colorMaterialMarkSettings)
        : await markImageDataUrl(activeColorMaterialReferenceImage, colorMaterialMarkSettings)
      : activeColorMaterialReferenceImage;
    const imageForPriority: Record<string, string[]> = {
      structureAnnotations: structureImage ? [structureImage] : [],
      craftLayout: [],
      colorMaterialReference: runtimeColorMaterialReference ? [runtimeColorMaterialReference] : [],
    };
    const out: string[] = [];
    for (const key of priorityOrder) {
      for (const url of imageForPriority[key]) {
        if (url && !out.includes(url)) out.push(url);
      }
    }
    for (const url of exhibitReferenceImageUrls) {
      if (url && !out.includes(url)) out.push(url);
    }
    return out;
  }, [
    activeColorMaterialReferenceImage,
    colorMaterialMarkSettings,
    colorMaterialPriorityMode,
    exhibitReferenceImageUrls,
    priorityOrder,
    structureImage,
    useColorMaterialAbstractCard,
  ]);

  const saveCraftPresets = async () => {
    if (!canManageTeam) return;
    const presets = parseCraftPresetEditorText(craftEditorValue);
    if (presets.length === 0) {
      setCraftError('请至少保留一条“名称｜提示词”格式的工艺预设。');
      return;
    }
    setCraftSaving(true);
    setCraftError('');
    try {
      const saved = await updateElevationCraftPresets(presets);
      setCraftPresets(saved);
      setCraftEditorOpen(false);
    } catch (error: any) {
      setCraftError(error?.message || '保存工艺预设失败');
    } finally {
      setCraftSaving(false);
    }
  };

  const saveColorMaterialPresetItems = async (presets: ElevationColorMaterialPresetItem[]) => {
    if (!canManageTeam) return;
    if (presets.length === 0) {
      setColorMaterialError('请至少保留一条色彩与材质预设。');
      return;
    }
    setColorMaterialSaving(true);
    setColorMaterialError('');
    try {
      const saved = await updateElevationColorMaterialPresets(buildColorMaterialPresetPayload(presets));
      setColorMaterialPresets(saved);
      setColorMaterialEditorOpen(false);
    } catch (error: any) {
      setColorMaterialError(error?.message || '保存色彩与材质预设失败');
    } finally {
      setColorMaterialSaving(false);
    }
  };

  const toggleCraft = (craftId: string) => {
    if (isReadonly) return;
    const next = selectedCrafts.includes(craftId)
      ? selectedCrafts.filter((item) => item !== craftId)
      : [...selectedCrafts, craftId];
    update({ selectedCrafts: next });
  };

  const patchExhibitReferenceItem = useCallback((url: string, patch: Partial<Pick<ExhibitReferenceItem, 'description'>>) => {
    if (isReadonly) return;
    const next = exhibitReferenceItems.map((item) => (
      item.url === url ? { ...item, ...patch } : item
    ));
    update({ exhibitReferenceItems: next });
  }, [exhibitReferenceItems, isReadonly, update]);

  const planWallContent = useCallback(async (textOverride?: string, rethrow = false) => {
    if (isReadonly || !contentEnabled) return;
    const text = String(textOverride ?? sourceText).trim();
    if (!text) {
      update({ status: 'error', error: '请先上传文档或填写原文' });
      return;
    }
    update({ status: 'refining', error: '' });
    try {
      const messages = buildElevationContentPlanMessages({
        sourceText: text,
        wallMode,
        wallCount,
        selectedCrafts,
        customCraft: d.customCraft,
        craftPresets,
      });
      const response = await generateLlm({
        model: contentModel,
        messages: messages as any,
        llmKeyId: activeContentLlmConfig?.id,
        temperature: 0.2,
        max_tokens: 4096,
      });
      const plan = parseElevationContentPlanResponse(response.content);
      update({
        analysis: {
          projectTheme: plan.projectTheme,
          coreMessage: plan.coreMessage,
          sections: [],
        },
        walls: plan.walls,
        status: 'success',
        error: '',
        plannedAt: Date.now(),
      });
      return plan;
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '展示内容生成失败' });
      if (rethrow) throw error;
      return undefined;
    }
  }, [
    activeContentLlmConfig?.id,
    contentEnabled,
    contentModel,
    craftPresets,
    d.customCraft,
    isReadonly,
    selectedCrafts,
    sourceText,
    update,
    wallCount,
    wallMode,
  ]);

  const pickDocument = async (file?: File) => {
    if (!file || isReadonly || !contentEnabled) return;
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      update({ status: 'error', error: `文档不能超过 ${MAX_DOCUMENT_FILE_SIZE_MB}MB` });
      return;
    }
    update({ status: 'extracting', error: '' });
    try {
      const extracted = await extractDocument(file);
      const { text, ...documentMeta } = extracted;
      update({
        documentMeta,
        sourceText: text,
        analysis: null,
        walls: [],
        status: 'refining',
        error: '',
      });
      await planWallContent(text);
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '文档解析失败' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const patchWall = (index: number, patch: Partial<ElevationWall>) => {
    if (isReadonly || !contentEnabled) return;
    const next = contentOutputs.walls.map((wall: ElevationWall, wallIndex: number) => (
      wallIndex === index ? { ...wall, ...patch } : wall
    ));
    update({ walls: next });
  };

  const runGenerate = async () => {
    if (isReadonly) return;
    if (!structureImage || !hasColorMaterialInput) {
      const msg = !structureImage && !hasColorMaterialInput
        ? '请连接空间结构示意图，并连接色彩与材质参考图、选择共享预设或手填色彩材质'
        : !structureImage
          ? '请连接空间结构示意图'
          : '请连接色彩与材质参考图、选择共享预设或手填色彩材质';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    let promptForRun = prompt;
    if (contentEnabled && regenerateContentEachRun) {
      const plan = await planWallContent(undefined, true);
      if (plan) promptForRun = buildPromptWithWallPlan(plan);
    }
    const runtimeReferenceImages = await buildRuntimeReferenceImages();
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-img2img:${id.slice(0, 6)}`;
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'exhibition-img2img',
      seed: runSeed,
      nodeTitle: '展陈图生图',
    };
    taskCompletionSound.primeAudio();
    pollAbortRef.current = false;
    update({ status: 'generating', progress: '0%', error: '', lastSeed: runSeed, usedI2I: true });
    try {
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
        logBus.info(`展陈图生图提交: ${providerSelection.provider.label || providerSelection.provider.id} · ${externalProviderModel} · refs=${runtimeReferenceImages.length}`, src);
        let res = await generateExternalImage({
          providerId: providerSelection.provider.id,
          providerModel: externalProviderModel,
          model: externalProviderModel,
          prompt: promptForRun,
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
          update({ progress: '生成中', taskId: pollingTaskId });
          logBus.info(`展陈图扩展平台任务继续轮询: ${pollingTaskId}`, src);
          for (let i = 0; i < EXTERNAL_IMAGE_MAX_POLLS; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, EXTERNAL_IMAGE_POLL_INTERVAL_MS));
            res = await queryExternalImageStatus({
              providerId: providerSelection.provider.id,
              providerModel: externalProviderModel,
              taskId: pollingTaskId,
              outputFormat,
            });
            pollingTaskId = res.taskId || pollingTaskId;
            update({ progress: `${Math.min(99, Math.round(((i + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%`, taskId: pollingTaskId });
            if (res.imageUrls?.length || (res.code && res.code !== 'running')) break;
          }
        }
        const urls = res.imageUrls || [];
        if (!urls.length) throw new Error('扩展平台完成但未返回图片');
        update({
          status: 'success',
          progress: '100%',
          imageUrl: urls[0],
          imageUrls: urls,
          remoteImageUrls: res.remoteImageUrls,
          lastPrompt: promptForRun,
          lastSeed: runSeed,
          taskId: res.taskId || d.taskId,
          usedI2I: true,
          error: '',
        });
        logBus.success(`展陈图生图完成 → ${urls[0]}`, src);
        taskCompletionSound.notifyComplete(id, 'image');
        return;
      }

      logBus.info(`展陈图生图提交: model=${apiModel} ratio=${aspectRatio} size=${sizeLevel} refs=${runtimeReferenceImages.length}`, src);
      const submit = await submitImageAsync({
        model: modelDef.id,
        apiModel,
        paramKind: modelDef.paramKind,
        prompt: promptForRun,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images: runtimeReferenceImages,
        n: 1,
        outputFormat,
        seed: runSeed,
        historyContext,
      });
      if (submit.sync && submit.urls?.length) {
        update({
          status: 'success',
          progress: '100%',
          imageUrl: submit.urls[0],
          imageUrls: submit.urls,
          lastPrompt: promptForRun,
          lastSeed: runSeed,
          usedI2I: true,
          error: '',
        });
        taskCompletionSound.notifyComplete(id, 'image');
        return;
      }
      if (!submit.taskId) throw new Error('未获取到任务 ID');
      update({ progress: submit.progress || '5%', taskId: submit.taskId });
      let lastProgress = submit.progress || '5%';
      for (let index = 0; index < 1800; index += 1) {
        if (pollAbortRef.current) throw new Error('任务已取消');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const q = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
        if (q.progress && q.progress !== lastProgress) {
          lastProgress = q.progress;
          update({ progress: q.progress });
        }
        const status = String(q.status || '').toLowerCase();
        if (status === 'completed' || status === 'success' || status === 'done') {
          const url = q.urls?.[0];
          if (!url) throw new Error('任务完成但未返回图片');
          update({
            status: 'success',
            progress: '100%',
            imageUrl: url,
            imageUrls: q.urls,
            lastPrompt: promptForRun,
            lastSeed: runSeed,
            usedI2I: true,
            error: '',
          });
          logBus.success(`展陈图生图完成 → ${url}`, src);
          taskCompletionSound.notifyComplete(id, 'image');
          return;
        }
        if (status === 'failed' || status === 'failure' || status === 'error') {
          throw new Error(q.error || '任务失败');
        }
      }
      throw new Error('轮询超时');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      logBus.error(`展陈图生图失败: ${msg}`, src);
      update({ status: 'error', error: msg });
      throw error;
    }
  };

  useRunTrigger(id, runGenerate, 'image');

  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      className={`relative w-[860px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!bg-cyan-300 !border-0" title="输出：展陈图生图结果（图像）" />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <Boxes size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">展陈图生图</div>
          <div className="truncate text-[10px] text-white/45">结构示意图 / 表现效果图 / 工艺版式</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[780px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && (
          <div className="col-span-2 rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">
            当前画布为只读，仅可查看结果。
          </div>
        )}
        {d.error && (
          <div className="col-span-2 rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">
            {d.error}
          </div>
        )}

        <div className="columns-2 gap-2 [&>section]:mb-2 [&>section]:break-inside-avoid">
        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <ImageSlot handleId="structure" title="空间结构示意图" subtitle="保留结构、动线、分区；标注只作理解参考" url={structureImage} top="24%" />
          <ImageSlot handleId="color-material-reference" title="色彩与材质参考图" subtitle="仅提取色彩、材质、肌理、光泽和灯光氛围" url={colorMaterialReferenceImage} top="39%" />
          <ImageSlot
            handleId="exhibit-reference"
            title="展品参考图（可多张）"
            subtitle={exhibitReferenceItems.length ? `已接入 ${exhibitReferenceItems.length} 张展品参考图` : '连接展品外观与主题参考图'}
            url={exhibitReferenceItems[0]?.url || ''}
            top="54%"
          />
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 text-[11px] font-semibold text-cyan-100">优先级顺序</div>
          <div className="mb-1.5 text-[10px] leading-snug text-white/45">
            仅调整工艺、色彩材质与表现完成度取舍；空间结构始终完全按结构示意图。
          </div>
          <PrioritySorter
            value={priorityOrder}
            disabled={isReadonly}
            onChange={(next) => update({ priorityOrder: next })}
          />
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-cyan-100">工艺与版式</span>
            {canManageTeam && (
              <button type="button" className={`${BUTTON} ml-auto`} disabled={craftSaving} onClick={() => setCraftEditorOpen((value) => !value)}>
                <Settings size={11} />设置工艺
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {craftPresetOptions.map((craft) => {
              const active = selectedCrafts.includes(craft.id);
              return (
                <button
                  key={craft.id}
                  type="button"
                  disabled={isReadonly}
                  className={`min-w-0 rounded border px-1.5 py-1 text-[10px] ${
                    active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  } disabled:opacity-50`}
                  onClick={() => toggleCraft(craft.id)}
                  title={craft.prompt}
                >
                  <span className="block truncate">{craft.label}</span>
                </button>
              );
            })}
          </div>
          {canManageTeam && craftEditorOpen && (
            <div className="mt-1.5 rounded border border-white/10 bg-white/[0.035] p-2">
              <div className="mb-1 text-[10px] text-white/45">每行一个工艺预设：名称｜提示词。</div>
              <textarea className={`${FIELD} min-h-[96px] resize-y font-mono`} value={craftEditorValue} disabled={craftSaving} onChange={(event) => setCraftEditorValue(event.target.value)} />
              {craftError && <div className="mt-1 text-[10px] text-red-300">{craftError}</div>}
              <div className="mt-1.5 flex justify-end gap-1">
                <button type="button" className={BUTTON} disabled={craftSaving} onClick={() => setCraftEditorOpen(false)}>取消</button>
                <button type="button" className={BUTTON} disabled={craftSaving} onClick={saveCraftPresets}>{craftSaving ? '保存中' : '保存工艺'}</button>
              </div>
            </div>
          )}
          <input className={`${FIELD} mt-1.5`} value={d.customCraft || ''} disabled={isReadonly} placeholder="自定义工艺" onChange={(event) => update({ customCraft: event.target.value })} />
          <div className="mt-1 grid grid-cols-2 gap-1">
            <select className={FIELD} value={d.density || '适中，图文层级均衡'} disabled={isReadonly} onChange={(event) => update({ density: event.target.value })}>
              <option value="疏朗，强调大图与留白">疏朗</option>
              <option value="适中，图文层级均衡">适中</option>
              <option value="信息丰富，采用严谨网格">丰富</option>
            </select>
            <input
              className={FIELD}
              type="number"
              min={0}
              step={0.1}
              value={d.dimensions || ''}
              disabled={isReadonly}
              placeholder="空间高度"
              onChange={(event) => update({ dimensions: event.target.value })}
            />
            <input className={FIELD} value={d.visualStyle || ''} disabled={isReadonly} placeholder="视觉风格" onChange={(event) => update({ visualStyle: event.target.value })} />
          </div>
          <textarea className={`${FIELD} mt-1 min-h-[48px] resize-y`} value={d.supplement || ''} disabled={isReadonly} placeholder="补充要求" onChange={(event) => update({ supplement: event.target.value })} />
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-cyan-100">色彩与材质预设</span>
            <span className="min-w-0 flex-1 truncate text-[9px] text-white/40">
              {hasColorMaterialPreset ? '共享预设已接管色彩与材质' : hasColorMaterialReference ? '参考图接管色彩与材质' : '可选择共享预设或手填'}
            </span>
            {canManageTeam && (
              <button type="button" className={BUTTON} disabled={colorMaterialSaving || busy} onClick={() => setColorMaterialEditorOpen((open) => !open)}>
                <Settings size={11} />编辑
              </button>
            )}
          </div>
          <div className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-cyan-100">空间整体光照</span>
              <button
                type="button"
                role="switch"
                aria-checked={spaceLightingEnabled}
                disabled={isReadonly || busy}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${spaceLightingEnabled ? 'border-cyan-300/50 bg-cyan-300/25' : 'border-white/15 bg-white/10'} disabled:cursor-not-allowed disabled:opacity-45`}
                onClick={() => update({ spaceLightingEnabled: !spaceLightingEnabled })}
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-full transition-transform ${spaceLightingEnabled ? 'translate-x-3.5 bg-cyan-200' : 'translate-x-0.5 bg-white/50'}`} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {SPACE_LIGHTING_OPTIONS.map((option) => {
                const active = spaceLightingLevel === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isReadonly || busy || !spaceLightingEnabled}
                    className={`h-7 rounded border px-1 text-[10px] transition ${active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'} disabled:cursor-not-allowed disabled:opacity-40`}
                    onClick={() => update({ spaceLightingLevel: option.value })}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <ColorMaterialPresetSelect
            className={FIELD}
            presets={colorMaterialPresets}
            value={d.colorMaterialPreset || ''}
            disabled={isReadonly || busy}
            onChange={(presetId, preset) => {
              if (presetId) disconnectColorMaterialReferenceInput();
              update({
                colorMaterialPreset: presetId,
                ...(preset ? {
                  colorMaterial: colorMaterialTextFromPreset(preset),
                  colorMaterialPalette: colorPaletteTextFromPreset(preset),
                  colorMaterialTextures: materialTexturesTextFromPreset(preset),
                } : {}),
              });
            }}
          />
          {selectedColorMaterialPreset?.info && (
            <div className="rounded border border-cyan-300/15 bg-cyan-300/5 px-2 py-1 text-[10px] leading-snug text-cyan-50/70">
              {selectedColorMaterialPreset.info}
            </div>
          )}
          {hasColorMaterialReference && (
            <div className="rounded border border-white/10 bg-black/15 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold text-rose-100/80">色彩优先</span>
                {hasSelectedColorMaterialPreset && hasColorMaterialReference && <span className="truncate text-[8px] text-white/35">参考图接管</span>}
                {hasColorMaterialPreset && <span className="truncate text-[8px] text-white/35">预设接管</span>}
              </div>
              <div className="mt-1 grid grid-cols-2 rounded border border-white/10 bg-black/20 p-0.5">
                {[
                  { value: 'frontend', label: '前端识别' },
                  { value: 'llm', label: '大模型识别' },
                ].map((option) => {
                  const active = colorMaterialPriorityMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isReadonly || busy || colorMaterialRecognitionDisabled}
                      className={`h-6 rounded px-1 text-[9px] transition ${active ? 'bg-rose-300/20 text-rose-50' : 'text-white/45 hover:bg-white/[0.08]'} disabled:cursor-not-allowed disabled:opacity-45`}
                      onClick={() => update({ colorMaterialPriorityMode: option.value })}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold text-rose-100/80">主色调识别（像素采样）</span>
                {d.colorMaterialReferenceToneStatus && (
                  <span className="truncate text-[8px] text-amber-200/75" title={d.colorMaterialReferenceToneStatus}>需手动确认</span>
                )}
              </div>
              <textarea
                className={`${FIELD} mt-1 min-h-[46px] resize-y text-[10px] leading-snug${colorMaterialPriorityMode === 'llm' ? ' select-none pointer-events-none' : ''}`}
                value={colorMaterialReferenceTone}
                disabled={isReadonly || busy || hasColorMaterialPreset || colorMaterialPriorityMode === 'llm'}
                placeholder="接入图片后自动识别主色调，可手动修正"
                onChange={(event) => update({
                  colorMaterialReferenceTone: event.target.value,
                  colorMaterialReferenceToneSource: colorMaterialReferenceImage,
                  colorMaterialReferenceToneStatus: '',
                })}
              />
              {renderColorMaterialMarkSettings('色彩与材质图标识', colorMaterialMarkSettings)}
            </div>
          )}
          {canManageTeam && (
            <ColorMaterialPresetEditorModal
              open={colorMaterialEditorOpen}
              presets={colorMaterialPresets}
              saving={colorMaterialSaving || busy}
              error={colorMaterialError}
              title="展陈图生图色彩与材质预设管理"
              onClose={() => setColorMaterialEditorOpen(false)}
              onSave={saveColorMaterialPresetItems}
            />
          )}
          <div className="grid grid-cols-2 gap-1">
            <textarea
              className={`${FIELD} min-h-[54px] resize-y text-[10px] leading-snug`}
              value={colorMaterialPalette || d.colorMaterial || ''}
              disabled={isReadonly || busy || hasColorMaterialReference || hasColorMaterialPreset}
              placeholder="Color palette / 主色、辅助色、明暗、冷暖"
              onChange={(event) => update({
                colorMaterialPalette: event.target.value,
                colorMaterial: combineColorMaterialText(event.target.value, colorMaterialTextures, d.colorMaterial || ''),
                colorMaterialPreset: '',
              })}
            />
            <textarea
              className={`${FIELD} min-h-[54px] resize-y text-[10px] leading-snug`}
              value={colorMaterialTextures || d.colorMaterial || ''}
              disabled={isReadonly || busy || hasColorMaterialReference || hasColorMaterialPreset}
              placeholder="Materials/textures / 墙面、地面、展柜、灯光材质"
              onChange={(event) => update({
                colorMaterialTextures: event.target.value,
                colorMaterial: combineColorMaterialText(colorMaterialPalette, event.target.value, d.colorMaterial || ''),
                colorMaterialPreset: '',
              })}
            />
          </div>
          {hasColorMaterialReference && (
            <div className="rounded border border-rose-300/15 bg-rose-300/5 px-2 py-1 text-[10px] leading-snug text-rose-50/70">
              {hasColorMaterialPreset ? '色彩与材质预设已接管，参考图只保留为连接参考。' : '已由接入的色彩与材质参考图接管，手填项暂不参与。'}
            </div>
          )}
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <ImageIcon size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">展品参考图</span>
          </div>
          <div className="text-[10px] leading-snug text-white/45">
            接入展品外观与主题参考图；描述只用于说明展品特征和展示重点，不改变空间结构或色彩材质体系。
          </div>
          {exhibitReferenceItems.length === 0 ? (
            <div className="mt-2 rounded border border-dashed border-white/15 px-2 py-3 text-[10px] text-white/35">
              暂无展品参考图。可从上传节点、素材集或输出节点连接多张图片到展品参考图入口。
            </div>
          ) : (
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {exhibitReferenceItems.map((item, index) => (
                <div key={item.url} className="grid grid-cols-[54px_minmax(0,1fr)] items-start gap-1.5 rounded border border-white/10 bg-black/15 p-1.5">
                  <img src={item.url} alt="" className="h-12 w-12 rounded border border-white/10 object-cover" draggable={false} />
                  <div className="min-w-0">
                    <input
                      className={FIELD}
                      value={item.description}
                      disabled={isReadonly || busy}
                      placeholder={`展品 ${index + 1} 特征描述，如"红色的茶壶"`}
                      onChange={(event) => patchExhibitReferenceItem(item.url, { description: event.target.value })}
                    />
                    <div className="mt-0.5 truncate text-[9px] text-white/35" title={item.url}>{item.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <FileText size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">展墙内容设计</span>
            <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-white/60">
              <input
                type="checkbox"
                className="h-3 w-3 accent-cyan-300"
                checked={contentEnabled}
                disabled={isReadonly || isGenerating}
                onChange={(event) => update({ contentPlanningEnabled: event.target.checked })}
              />
              启用
            </label>
          </div>
          <div className="text-[10px] leading-snug text-white/45">
            开启后，系统会根据文档内容和已选工艺直接生成各立面的展示内容、工艺落位和版式提示；关闭时完全不参与生成。
          </div>
          {contentEnabled && (
            <div className="mt-2 space-y-2">
              <div className="rounded border border-white/10 bg-black/15 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-cyan-100">1. 导入文档</span>
                  <button
                    type="button"
                    className={`${BUTTON} ml-auto`}
                    disabled={contentBusy || isReadonly}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={12} />
                    选择文件
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".docx,.pdf,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => void pickDocument(event.target.files?.[0])}
                  />
                </div>
                <div className="truncate text-[10px] text-white/55" title={documentLabel(d.documentMeta)}>
                  {documentLabel(d.documentMeta)}
                </div>
                {Array.isArray(d.documentMeta?.warnings) && d.documentMeta.warnings.length > 0 && (
                  <div className="mt-1 text-[10px] text-amber-200/80">{d.documentMeta.warnings.join('；')}</div>
                )}
                <textarea
                  className={`${FIELD} mt-2 min-h-[72px] resize-y`}
                  value={sourceText}
                  disabled={isReadonly || contentBusy}
                  placeholder="上传 DOCX、文本型 PDF、TXT，或直接粘贴项目文案"
                  onChange={(event) => update({ sourceText: event.target.value })}
                />
              </div>

              <div className="rounded border border-white/10 bg-black/15 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-cyan-100">2. 生成展示内容</span>
                  <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-white/60" title="开启后，每次点击生图前都会先用大模型重新生成展墙展示内容">
                    <input
                      type="checkbox"
                      className="h-3 w-3 accent-cyan-300"
                      checked={regenerateContentEachRun}
                      disabled={contentBusy || isReadonly}
                      onChange={(event) => update({ regenerateContentEachRun: event.target.checked })}
                    />
                    每次生图重新生成
                  </label>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={contentBusy || isReadonly || !sourceText.trim()}
                    onClick={() => void planWallContent()}
                  >
                    {status === 'refining' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    生成展示内容
                  </button>
                </div>
                <div className="mb-1.5 grid grid-cols-2 gap-1">
                  <select
                    className={FIELD}
                    disabled={isReadonly || contentBusy}
                    value={`llm-key:${activeContentLlmConfig?.id || 'default'}`}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      if (nextId.startsWith('llm-key:')) {
                        update({ contentProviderSource: 'zhenzhen', contentProviderId: '', contentProviderModel: '', contentLlmKeyId: nextId.slice(8) });
                      }
                    }}
                  >
                    {llmConfigOptions.map((item) => <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
                  </select>
                  <input className={FIELD} disabled value={contentModel} title="模型由所选 LLM 配置决定" />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <select
                    className={FIELD}
                    disabled={isReadonly || contentBusy}
                    value={wallMode}
                    onChange={(event) => {
                      const nextMode = event.target.value === 'single' ? 'single' : 'multi';
                      update({
                        wallMode: nextMode,
                        wallCount: nextMode === 'single' ? 1 : wallCount,
                        walls: [],
                      });
                    }}
                  >
                    <option value="single">单立面</option>
                    <option value="multi">多立面</option>
                  </select>
                  <input
                    className={FIELD}
                    type="number"
                    min={1}
                    max={12}
                    disabled={isReadonly || contentBusy || wallMode === 'single'}
                    value={wallMode === 'single' ? 1 : wallCount}
                    onChange={(event) => {
                      const nextCount = Math.max(1, Math.min(12, Number(event.target.value) || 1));
                      update({ wallCount: nextCount, walls: [] });
                    }}
                    title="立面数量"
                  />
                  <select
                    className={FIELD}
                    disabled={isReadonly || contentBusy || wallMode === 'single'}
                    value={d.outputMode === 'overview' ? 'overview' : 'segments'}
                    onChange={(event) => update({ outputMode: event.target.value })}
                  >
                    <option value="segments">逐面集合</option>
                    <option value="overview">整套总览</option>
                  </select>
                </div>
                <input
                  className={`${FIELD} mt-1.5`}
                  value={analysis.projectTheme}
                  disabled={isReadonly}
                  placeholder="项目主题"
                  onChange={(event) => update({ analysis: { ...analysis, projectTheme: event.target.value } })}
                />
                <textarea
                  className={`${FIELD} mt-1 min-h-[48px] resize-y`}
                  value={analysis.coreMessage}
                  disabled={isReadonly}
                  placeholder="核心叙事"
                  onChange={(event) => update({ analysis: { ...analysis, coreMessage: event.target.value } })}
                />
                <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                  {contentOutputs.walls.map((wall: ElevationWall, index: number) => (
                    <div key={wall.id || index} className="rounded border border-white/10 bg-white/[0.035] p-1.5">
                      <input
                        className={FIELD}
                        value={wall.title || ''}
                        disabled={isReadonly}
                        placeholder={`立面 ${index + 1} 标题`}
                        onChange={(event) => patchWall(index, { title: event.target.value })}
                      />
                      <textarea
                        className={`${FIELD} mt-1 min-h-[46px] resize-y`}
                        value={wall.content || ''}
                        disabled={isReadonly}
                        placeholder="展示重点与内容摘要"
                        onChange={(event) => patchWall(index, { content: event.target.value })}
                      />
                      <textarea
                        className={`${FIELD} mt-1 min-h-[40px] resize-y`}
                        value={(wall.exactText || []).join('\n')}
                        disabled={isReadonly}
                        placeholder="准确上墙文案，每行一条"
                        onChange={(event) => patchWall(index, {
                          exactText: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
                        })}
                      />
                      <textarea
                        className={`${FIELD} mt-1 min-h-[40px] resize-y`}
                        value={wall.craftNotes || ''}
                        disabled={isReadonly}
                        placeholder="本立面工艺与版式配置，如：立体字展示标题；图文展板展示纹样；沿墙文物柜展示展品"
                        onChange={(event) => patchWall(index, { craftNotes: event.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2 space-y-2">
          <div className="text-[11px] font-semibold text-cyan-100">模型与输出</div>
          {imageAdvancedProviders.length > 0 && (
            <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-2">
              <button
                type="button"
                onClick={() => update({ advancedProviderOpen: !d.advancedProviderOpen })}
                className="w-full flex items-center justify-between text-[10px] font-semibold text-white/70 hover:text-white"
              >
                <span>高级来源</span>
                <span>{isExternalSelected && providerSelection.provider ? providerSelection.provider.label : (allowZhenzhenFallback ? '默认百达工坊' : '请选择扩展平台')}</span>
              </button>
              {d.advancedProviderOpen && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">平台</label>
                    <select
                      value={providerSelectValue}
                      disabled={isReadonly || busy}
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
                      style={{ background: '#18181b', color: '#ffffff' }}
                      className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                    >
                      {allowZhenzhenFallback && <option value="zhenzhen" style={{ background: '#18181b', color: '#ffffff' }}>百达工坊（默认）</option>}
                      {imageAdvancedProviders.map((provider) => (
                        <option key={provider.id} value={provider.id} style={{ background: '#18181b', color: '#ffffff' }}>
                          {provider.label || provider.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isExternalSelected && providerSelection.provider && (
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">外部模型</label>
                      <select
                        value={externalProviderModel}
                        disabled={isReadonly || busy}
                        onChange={(event) => update({ providerModel: event.target.value })}
                        style={{ background: '#18181b', color: '#ffffff' }}
                        className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                      >
                        {externalModelOptions.map((item) => <option key={item} value={item} style={{ background: '#18181b', color: '#ffffff' }}>{item}</option>)}
                      </select>
                    </div>
                  )}
                  {savedExternalMissing && (
                    <div className="text-[10px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                      当前画布记录的扩展平台未启用或不存在，已临时回到默认来源。
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isExternalSelected && (
            <div>
              <label className="text-[10px] text-white/50 block mb-1">模型</label>
              <div
                className={`flex gap-0.5 p-0.5 rounded ${isPixel ? '' : 'bg-white/5'}`}
                style={isPixel ? { background: 'var(--px-muted)', border: '1.5px solid var(--px-ink)' } : undefined}
              >
                {availableModelDefs.map((item) => {
                  const active = item.id === model;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => update({ model: item.id, apiModel: item.apiModel, aspectRatio: item.defaultAspectRatio, sizeLevel: item.defaultSize || '2K' })}
                      title={item.description}
                      className={`flex-1 py-1 text-[10px] font-semibold rounded transition-all ${active ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                      style={
                        isPixel && active
                          ? { background: 'var(--px-yellow)', color: 'var(--px-ink)', border: '1.5px solid var(--px-ink)', boxShadow: '1px 1px 0 var(--px-ink)' }
                          : isPixel ? { color: 'var(--px-ink-soft)' } : undefined
                      }
                    >
                      {item.tabLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isExternalSelected && (
            <div>
              <label className="text-[10px] text-white/50 block mb-1">具体模型</label>
              <select
                value={apiModel}
                disabled={isReadonly || busy}
                onChange={(event) => update({ apiModel: event.target.value })}
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              >
                {modelDef.apiModelOptions
                  .filter((item) => !item.value.includes('-fal'))
                  .map((item) => <option key={item.value} value={item.value} style={{ background: '#18181b', color: '#ffffff' }}>{item.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/50 block mb-1">比例</label>
              <select
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                style={{ background: '#18181b', color: '#ffffff' }}
                value={aspectRatio}
                disabled={isReadonly || busy}
                onChange={(event) => update({ aspectRatio: event.target.value })}
              >
                {(modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']).map((item) => <option key={item} value={item} style={{ background: '#18181b', color: '#ffffff' }}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">尺寸</label>
              <select
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                style={{ background: '#18181b', color: '#ffffff' }}
                value={sizeLevel}
                disabled={isReadonly || busy}
                onChange={(event) => update({ sizeLevel: event.target.value })}
              >
                {(isExternalSelected ? EXTERNAL_SIZE_LEVELS : (modelDef.sizes.length ? modelDef.sizes : EXTERNAL_SIZE_LEVELS)).map((item) => <option key={item} value={item} style={{ background: '#18181b', color: '#ffffff' }}>{item}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white/50 block mb-1">输出格式</label>
            <div
              className={`grid grid-cols-2 gap-0.5 p-0.5 rounded ${isPixel ? '' : 'bg-white/5'}`}
              style={isPixel ? { background: 'var(--px-muted)', border: '1.5px solid var(--px-ink)' } : undefined}
            >
              {(['jpg', 'png'] as const).map((fmt) => {
                const active = outputFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    disabled={isReadonly || busy}
                    onClick={() => update({ outputFormat: fmt })}
                    title={fmt === 'png' ? '保留透明区域，文件更大' : '高质量 JPG，文件更小'}
                    className={`py-1 text-[10px] font-semibold rounded transition-all ${active ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    style={
                      isPixel && active
                        ? { background: 'var(--px-yellow)', color: 'var(--px-ink)', border: '1.5px solid var(--px-ink)', boxShadow: '1px 1px 0 var(--px-ink)' }
                        : isPixel ? { color: 'var(--px-ink-soft)' } : undefined
                    }
                  >
                    {fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white/50 block mb-1" title="0 = 自动生成并记录随机 seed">Seed (0=random)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={seed}
              disabled={isReadonly || busy}
              onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
              style={{ background: '#18181b', color: '#ffffff' }}
              className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
            />
          </div>
        </section>

        <section className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
            <Clipboard size={13} />
            <span>当前生图 Prompt</span>
            <button type="button" className="ml-auto flex h-6 items-center gap-1 rounded border border-white/10 px-2 text-[10px] text-white/65 hover:bg-white/10" onClick={() => navigator.clipboard?.writeText(prompt).catch(() => {})}>
              复制
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">{prompt}</div>
        </section>

        {d.imageUrl && (
          <section className="rounded border border-white/10 bg-black/20 p-2">
            <img src={d.imageUrl} alt="" className="max-h-52 w-full rounded border border-white/10 object-contain" draggable={false} />
          </section>
        )}

        </div>

        <button
          type="button"
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-cyan-300/30 bg-cyan-300/15 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isReadonly || busy || !structureImage || !hasColorMaterialInput}
          onClick={() => void runGenerate()}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {isGenerating ? `生成中 ${d.progress || ''}` : contentBusy ? '内容提炼中' : '生成展陈效果图'}
        </button>
        {!structureImage || !hasColorMaterialInput ? (
          <div className="col-span-2 text-[10px] text-white/35">
            需要连接空间结构示意图，并提供色彩与材质参考图、共享预设或手填色彩材质。
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default memo(ExhibitionImg2ImgNode);
