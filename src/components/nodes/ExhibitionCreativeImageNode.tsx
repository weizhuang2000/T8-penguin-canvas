import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, useReactFlow, type NodeProps } from '@xyflow/react';
import { EXHIBITION_COLOR_MATERIAL_REFERENCE_COLOR, EXHIBITION_IMAGE_HANDLE_COLOR, EXHIBITION_TEXT_HANDLE_COLOR } from '../../config/portTypes';
import {
  Brain,
  CheckCircle2,
  Clipboard,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Play,
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
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  EXHIBITION_CREATIVE_EXCLUDE_ITEMS,
  EXHIBITION_CREATIVE_INSERT_ITEMS,
  EXHIBITION_CREATIVE_SPACE_TYPES,
  EXHIBITION_CREATIVE_VIEW_ANGLES,
  exhibitionCreativeExcludeItemsText,
  exhibitionCreativeInsertItemsText,
  exhibitionCreativeSpaceTypeMeta,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeExcludeItems,
  normalizeExhibitionCreativeInsertItems,
  normalizeExhibitionCreativeSpaceSize,
  normalizeExhibitionCreativeSpaceType,
  normalizeExhibitionCreativeViewAngles,
  type ExhibitionCreativeExcludeItem,
  type ExhibitionCreativeInsertItem,
  type ExhibitionCreativeViewAngle,
} from '../../utils/exhibitionCreativeImagePrompt';
import {
  formatExhibitionOutputImageName,
  generateExhibitionImageNameWithLlm,
  normalizeExhibitionImageName,
} from '../../utils/exhibitionImageName';
import {
  extractDocument,
  getCurrentUser,
  getElevationPromptPresets,
  getExhibitionCreativePromptPresets,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_MB,
  updateElevationColorMaterialPresets,
  updateExhibitionCreativeConstraintPresets,
  updateExhibitionCreativeExcludePresets,
  updateExhibitionCreativeInsertPresets,
  updateExhibitionCreativeViewAnglePresets,
  type AuthUser,
  type ElevationColorMaterialPresetItem,
  type ExhibitionCreativeConstraintPresetItem,
  type ExhibitionCreativeExcludePresetItem,
  type ExhibitionCreativeInsertPresetItem,
  type ExhibitionCreativeViewAnglePresetItem,
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
import PromptConstraintPresetEditorModal from './PromptConstraintPresetEditorModal';
import MentionPromptInput from './MentionPromptInput';
import { materialMentionKey, resolveMediaMentions, type MediaMention } from './mediaMentions';
import NodeHelpButton from './NodeHelpButton';
import PromptExpandableInput from '../PromptExpandableInput';
import PromptTextarea from '../PromptTextarea';
import type { Material } from './useUpstreamMaterials';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const MIN_GENERATION_COUNT = 1;
const MAX_GENERATION_COUNT = 12;
const INSERT_CATEGORIES = ['装饰', '多媒体', '艺术品', '展陈', '展柜', '展台', '顶部', '其它'] as const;
const DEFAULT_INSERT_CATEGORY = '其它';
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
type SpaceLightingLevel = typeof SPACE_LIGHTING_OPTIONS[number]['value'];

interface ReferenceMarkSettings {
  text: string;
  position: ReferenceMarkPosition;
  color: string;
  fontSize: number;
  autoFontSize: boolean;
}

type ColorMaterialReferenceMode = 'abstract-card' | 'marked-image';
type ColorMaterialPriorityMode = 'frontend' | 'llm';

const REFERENCE_MARK_POSITION_OPTIONS: Array<{ value: ReferenceMarkPosition; label: string }> = [
  { value: 'top-left', label: '左上角' },
  { value: 'top-right', label: '右上角' },
  { value: 'bottom-left', label: '左下角' },
  { value: 'bottom-right', label: '右下角' },
];

interface CreativeResult {
  index: number;
  name?: string;
  brief: string;
  prompt: string;
  imageUrl: string;
  seed: number;
  taskId?: string;
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

function normalizeSpaceDimensionInput(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(200, Math.round(number * 100) / 100);
}

function mediaMentions(value: unknown): MediaMention[] {
  return Array.isArray(value) ? (value as MediaMention[]) : [];
}

function imageTokenForUrl(url: string, materials: Material[]): string {
  const material = materials.find((item) => item.kind === 'image' && item.url === url);
  if (!material) return '';
  let imageIndex = 0;
  for (const item of materials) {
    if (item.kind !== 'image') continue;
    imageIndex += 1;
    if (materialMentionKey(item) === materialMentionKey(material)) return `@img${imageIndex}`;
  }
  return '';
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

interface ExhibitReferenceInputImage {
  id: string;
  url: string;
  label: string;
}

interface ExhibitReferenceItem extends ExhibitReferenceInputImage {
  description: string;
  descriptionMentions?: MediaMention[];
}

interface CreativeReferenceMaterialRole {
  id: string;
  kind: 'image';
  url: string;
  label: string;
  sourceNodeId: string;
  origin: 'upstream';
  role: 'space' | 'color-material-reference' | 'exhibit-reference';
  roleIndex?: number;
}

function shortFileLabel(url: string, fallback = '展品') {
  return (url.split('/').pop() || fallback).split('?')[0].slice(0, 28) || fallback;
}

function useInputImageByHandle(nodeId: string, handle: string, includeLegacySpace = false): string {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns
      .filter((conn: any) => conn.targetHandle === handle || (includeLegacySpace && !conn.targetHandle))
      .map((conn: any) => conn.source)
      .filter(Boolean))),
    [conns, handle, includeLegacySpace],
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

function useInputImagesByHandle(nodeId: string, handle: string): ExhibitReferenceInputImage[] {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const filteredConns = useMemo(
    () => conns.filter((conn: any) => (conn.targetHandle || '') === handle),
    [conns, handle],
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
          id: `${nodeIdValue}:exhibit-ref:${index}:${url}`,
          url,
          label: shortFileLabel(url, `展品参考 ${out.length + 1}`),
        });
      });
    }
    return out;
  }, [nodesData]);
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

function normalizeReferenceMarkSettings(data: any, prefix: 'space' | 'colorMaterial'): ReferenceMarkSettings {
  const fallbackText = prefix === 'space' ? 'F' : DEFAULT_COLOR_MATERIAL_MARK_TEXT;
  return {
    text: normalizeReferenceMarkText(data?.[`${prefix}MarkText`], fallbackText),
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
  const fontSize = resolveReferenceMarkFontSize(width, height, settings);
  const margin = Math.max(2, Math.ceil(fontSize * 0.25));
  const isRight = settings.position.endsWith('right');
  const isBottom = settings.position.startsWith('bottom');
  ctx.font = `${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = settings.color;
  ctx.textAlign = isRight ? 'right' : 'left';
  ctx.textBaseline = isBottom ? 'alphabetic' : 'top';
  ctx.fillText(settings.text || DEFAULT_COLOR_MATERIAL_MARK_TEXT, isRight ? Math.max(0, width - margin) : margin, isBottom ? Math.max(fontSize, height - margin) : margin);
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

function textValuesFromData(data: any): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: any) => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  const arrayFields = ['textSegments', 'segments', 'texts'];
  const arrayField = arrayFields.find((field) => Array.isArray(data?.[field]) && data[field].length > 0);
  if (arrayField) {
    data[arrayField].forEach(push);
    return out;
  }
  push(data?.outputText);
  push(data?.reply);
  push(data?.prompt);
  push(data?.text);
  return out;
}

function useInputDocumentText(nodeId: string): string {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns
      .filter((conn: any) => conn.targetHandle === 'document-text')
      .map((conn: any) => conn.source)
      .filter(Boolean))),
    [conns],
  );
  const nodesData = useNodesData(sourceIds);
  return useMemo(() => {
    const list = Array.isArray(nodesData) ? nodesData : [nodesData];
    const texts: string[] = [];
    for (const node of list) {
      texts.push(...textValuesFromData((node as any)?.data || {}));
    }
    return texts.join('\n\n').trim();
  }, [nodesData]);
}

function creativeResultsFromData(value: unknown): CreativeResult[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const imageUrl = typeof item?.imageUrl === 'string' ? item.imageUrl.trim() : '';
      if (!imageUrl) return null;
      return {
        index: Math.max(1, Number(item?.index) || index + 1),
        name: normalizeExhibitionImageName(item?.name),
        brief: String(item?.brief || '').trim(),
        prompt: String(item?.prompt || '').trim(),
        imageUrl,
        seed: Math.max(0, Math.floor(Number(item?.seed) || 0)),
        taskId: typeof item?.taskId === 'string' ? item.taskId : undefined,
      };
    })
    .filter(Boolean) as CreativeResult[];
}

function llmErrorMessage(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/no available accounts/i.test(message)) {
    return '当前 LLM 没有可用账号，请在创意描述区切换可用的 LLM 配置，或稍后重试。';
  }
  if (/unknown variant [`']?(image_url|image)[`']?/i.test(message) || /expected [`']?text[`']?/i.test(message)) {
    return '当前 LLM 配置不支持视觉输入。请切换支持图片理解的 LLM 配置，或改用文字灵感补充。';
  }
  return message || 'LLM 创意描述失败';
}

function fallbackCreativeBrief(values: {
  spaceType: string;
  projectTheme: string;
  colorMaterial: string;
  inspiration: string;
  documentSummary: string;
  insertItemsText: string;
  excludeItemsText: string;
  roundIndex: number;
  total: number;
}) {
  const meta = exhibitionCreativeSpaceTypeMeta(values.spaceType);
  const theme = values.projectTheme || '展陈项目主题';
  const colorMaterial = values.colorMaterial
    ? `色彩与材质体系采用${values.colorMaterial}，`
    : '';
  const material = values.documentSummary
    ? '结合项目资料摘要中的核心叙事、关键展项和情绪基调，'
    : '';
  const inspiration = values.inspiration
    ? `吸收个人灵感中关于${values.inspiration.slice(0, 120)}的方向，`
    : '';
  const exclusion = values.excludeItemsText ? `同时避开${values.excludeItemsText}。` : '';
  return [
    `围绕${theme}创作第 ${values.roundIndex}/${values.total} 个${meta.label}展陈空间方案。`,
    `${material}${colorMaterial}${inspiration}在不改变原始室内建筑空间几何、透视、尺度和主要开口关系的前提下，植入${values.insertItemsText}。${exclusion}`,
    `整体气质应符合${meta.prompt}，画面具有专业展陈效果图的完成度、真实材料细节和可落地的施工表达，并与同批次其他方案形成可比较的差异化。`,
  ].join('');
}

function insertPresetEditorText(presets: ExhibitionCreativeInsertPresetItem[]) {
  return presets.map((preset) => `${normalizeInsertCategory(preset.category)}｜${preset.label}`).join('\n');
}

function normalizeInsertCategory(value: unknown) {
  const raw = String(value || '').trim();
  return (INSERT_CATEGORIES as readonly string[]).includes(raw) ? raw : DEFAULT_INSERT_CATEGORY;
}

function normalizeInsertRandomCounts(value: unknown): Record<string, number> {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const out: Record<string, number> = {};
  INSERT_CATEGORIES.forEach((category) => {
    const count = Math.floor(Number(source[category]) || 0);
    out[category] = Math.max(-1, Math.min(99, count));
  });
  return out;
}

function shuffleInsertIds(ids: string[]) {
  const out = ids.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function excludePresetEditorText(presets: ExhibitionCreativeExcludePresetItem[]) {
  return presets.map((preset) => preset.label).join('\n');
}

function viewAnglePresetEditorText(presets: ExhibitionCreativeViewAnglePresetItem[]) {
  return presets.map((preset) => preset.label).join('\n');
}

function colorPresetEditorText(presets: ElevationColorMaterialPresetItem[]): string {
  return presets
    .map((preset) => {
      const category = String(preset.category || '默认').trim() || '默认';
      const core = String(preset.core || '').trim();
      const features = String(preset.features || '').trim();
      const usage = String(preset.usage || '').trim();
      if (core || features || usage) return [category, preset.label, core, features, usage].join('｜');
      return [category, preset.label, preset.info || '', '', ''].join('｜');
    })
    .join('\n');
}

function parseColorPresetEditorText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const raw = line.trim();
      if (!raw) return null;
      const parts = raw.split(/[｜|]/).map((part) => String(part || '').trim());
      const hasCategory = parts.length >= 5;
      const category = String(hasCategory ? parts[0] : '默认').trim() || '默认';
      const label = String(hasCategory ? parts[1] : (parts[0] || '')).trim();
      if (!label) return null;
      const rest = hasCategory ? parts.slice(2) : parts.slice(1);
      const core = String(rest[0] || '').trim();
      const features = String(rest[1] || '').trim();
      const usageParts = rest.length >= 4 ? rest.slice(2, -1) : rest.slice(2);
      const usage = usageParts.join('｜').trim();
      const negativePrompt = String(rest.length >= 4 ? rest[rest.length - 1] : '可读错字、乱码文字不符合物理特性的结构和光线').trim();
      const info = rest.length > 2
        ? [core && `核心：${core}`, features && `特征：${features}`, usage && `适用：${usage}`].filter(Boolean).join('')
        : rest.join('｜').trim();
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'preset'}-${index + 1}`,
        category,
        label,
        core,
        features,
        usage,
        negativePrompt,
        info,
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; category: string; label: string; core: string; features: string; usage: string; negativePrompt: string; info: string; order: number }>;
}

function colorMaterialTextFromPreset(preset: ElevationColorMaterialPresetItem): string {
  const values = [
    preset.label,
    String(preset.core || '').trim(),
    String(preset.features || '').trim(),
  ].filter(Boolean);
  return values.join('，');
}

function buildColorMaterialPresetPayload(presets: ElevationColorMaterialPresetItem[]) {
  return presets.map((preset, index) => ({
    id: preset.id,
    category: preset.category,
    label: preset.label,
    core: preset.core || '',
    features: preset.features || '',
    usage: preset.usage || '',
    negativePrompt: preset.negativePrompt || '',
    info: preset.info || '',
    order: index,
  }));
}

function colorPaletteTextFromPreset(preset: ElevationColorMaterialPresetItem): string {
  return String(preset.core || preset.info || preset.label || '').trim();
}

function materialTexturesTextFromPreset(preset: ElevationColorMaterialPresetItem): string {
  return String(preset.features || preset.info || preset.core || preset.label || '').trim();
}

function combineColorMaterialText(palette: string, textures: string, fallback = ''): string {
  return [palette, textures].map((item) => String(item || '').trim()).filter(Boolean).join('；') || String(fallback || '').trim();
}

function parseLabelPresetEditorText(text: string, fallbackId: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const label = line.trim();
      if (!label) return null;
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallbackId}-${index + 1}`,
        label,
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; order: number }>;
}

function parseInsertPresetEditorText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const raw = line.trim();
      if (!raw) return null;
      const parts = raw.split(/[｜|]/).map((part) => part.trim()).filter(Boolean);
      const hasCategory = parts.length >= 2 && (INSERT_CATEGORIES as readonly string[]).includes(parts[0]);
      const category = hasCategory ? parts[0] : DEFAULT_INSERT_CATEGORY;
      const label = String(hasCategory ? parts[1] : parts[0] || '').trim();
      if (!label) return null;
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'insert'}-${index + 1}`,
        category,
        label,
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; category: string; label: string; order: number }>;
}

const ExhibitionCreativeImageNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const fileRef = useRef<HTMLInputElement>(null);
  const colorMaterialPresetDisconnectRef = useRef(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [insertPresets, setInsertPresets] = useState<ExhibitionCreativeInsertPresetItem[]>([]);
  const [excludePresets, setExcludePresets] = useState<ExhibitionCreativeExcludePresetItem[]>([]);
  const [viewAnglePresets, setViewAnglePresets] = useState<ExhibitionCreativeViewAnglePresetItem[]>([]);
  const [constraintPresets, setConstraintPresets] = useState<ExhibitionCreativeConstraintPresetItem[]>([]);
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);
  const [insertEditorOpen, setInsertEditorOpen] = useState(false);
  const [excludeEditorOpen, setExcludeEditorOpen] = useState(false);
  const [viewAngleEditorOpen, setViewAngleEditorOpen] = useState(false);
  const [constraintEditorOpen, setConstraintEditorOpen] = useState(false);
  const [colorMaterialEditorOpen, setColorMaterialEditorOpen] = useState(false);
  const [insertEditorValue, setInsertEditorValue] = useState('');
  const [excludeEditorValue, setExcludeEditorValue] = useState('');
  const [viewAngleEditorValue, setViewAngleEditorValue] = useState('');
  const [colorMaterialEditorValue, setColorMaterialEditorValue] = useState('');
  const [insertSaving, setInsertSaving] = useState(false);
  const [excludeSaving, setExcludeSaving] = useState(false);
  const [viewAngleSaving, setViewAngleSaving] = useState(false);
  const [constraintSaving, setConstraintSaving] = useState(false);
  const [colorMaterialSaving, setColorMaterialSaving] = useState(false);
  const [insertError, setInsertError] = useState('');
  const [excludeError, setExcludeError] = useState('');
  const [viewAngleError, setViewAngleError] = useState('');
  const [constraintError, setConstraintError] = useState('');
  const [colorMaterialError, setColorMaterialError] = useState('');
  const { style } = useThemeStore();
  const isPixel = style === 'pixel';
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const canManageConstraints = currentUser?.role === 'admin';
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const imageAdvancedProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredLlmModel }];
  }, [configuredLlmModel, llmConfigs]);
  const selectedLlmKeyId = String(d.llmKeyId || '').trim();
  const activeLlmConfig = llmConfigOptions.find((item) => item.id === selectedLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const llmModel = activeLlmConfig?.model || String(d.llmModel || '').trim() || configuredLlmModel;
  const selectedDocumentLlmKeyId = String(d.documentLlmKeyId || d.llmKeyId || '').trim();
  const activeDocumentLlmConfig = llmConfigOptions.find((item) => item.id === selectedDocumentLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const documentLlmModel = activeDocumentLlmConfig?.model || String(d.documentLlmModel || '').trim() || llmModel;

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
  const imageName = normalizeExhibitionImageName(d.imageName);
  const outputImageNames = Array.isArray(d.imageNames) ? d.imageNames.map((item: unknown) => String(item || '').trim()) : [];
  const spaceType = normalizeExhibitionCreativeSpaceType(d.spaceType);
  const manualSpaceSize = normalizeExhibitionCreativeSpaceSize(d.manualSpaceSize);
  const hasManualSpaceSize = manualSpaceSize.width > 0 && manualSpaceSize.depth > 0 && manualSpaceSize.height > 0;
  const generationCount = normalizeExhibitionCreativeCount(d.generationCount);
  const insertOptions = useMemo<ExhibitionCreativeInsertItem[]>(
    () => (insertPresets.length > 0 ? insertPresets : EXHIBITION_CREATIVE_INSERT_ITEMS),
    [insertPresets],
  );
  const insertRandomCounts = useMemo(() => normalizeInsertRandomCounts(d.insertRandomCounts), [d.insertRandomCounts]);
  const insertGroups = useMemo(
    () => INSERT_CATEGORIES.map((category) => ({
      category,
      items: insertOptions.filter((item) => normalizeInsertCategory(item.category) === category),
    })).filter((group) => group.items.length > 0),
    [insertOptions],
  );
  const excludeOptions = useMemo<ExhibitionCreativeExcludeItem[]>(
    () => (excludePresets.length > 0 ? excludePresets : EXHIBITION_CREATIVE_EXCLUDE_ITEMS),
    [excludePresets],
  );
  const viewAngleOptions = useMemo<ExhibitionCreativeViewAngle[]>(
    () => (viewAnglePresets.length > 0 ? viewAnglePresets : EXHIBITION_CREATIVE_VIEW_ANGLES),
    [viewAnglePresets],
  );
  const selectedInsertItems = useMemo(
    () => normalizeExhibitionCreativeInsertItems(d.insertItems, insertOptions),
    [d.insertItems, insertOptions],
  );
  const selectedInsertIds = useMemo(() => selectedInsertItems.map((item) => item.id), [selectedInsertItems]);
  const resolveRuntimeInsertItems = useCallback(() => {
    const picked = new Set(selectedInsertIds);
    for (const group of insertGroups) {
      const count = insertRandomCounts[group.category] || 0;
      if (count === 0) continue;
      const candidates = group.items
        .map((item) => item.id)
        .filter((itemId) => !picked.has(itemId));
      const nextItemIds = count === -1 ? candidates : shuffleInsertIds(candidates).slice(0, count);
      for (const itemId of nextItemIds) {
        picked.add(itemId);
      }
    }
    return Array.from(picked);
  }, [insertGroups, insertRandomCounts, selectedInsertIds]);
  const selectedExcludeItems = useMemo(
    () => normalizeExhibitionCreativeExcludeItems(d.excludeItems, excludeOptions),
    [d.excludeItems, excludeOptions],
  );
  const selectedExcludeIds = useMemo(() => selectedExcludeItems.map((item) => item.id), [selectedExcludeItems]);
  const allExcludeSelected = excludeOptions.length > 0 && selectedExcludeIds.length === excludeOptions.length;
  const viewControlEnabled = d.viewControlEnabled === true;
  const selectedViewAngles = useMemo(
    () => normalizeExhibitionCreativeViewAngles(d.viewAngles, viewAngleOptions),
    [d.viewAngles, viewAngleOptions],
  );
  const selectedViewAngleIds = useMemo(() => selectedViewAngles.map((item) => item.id), [selectedViewAngles]);
  const selectedConstraintIds = useMemo<string[]>(() => {
    const ids: string[] = Array.isArray(d.promptConstraintIds)
      ? d.promptConstraintIds.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];
    const availableIds = new Set(constraintPresets.map((item) => item.id));
    return Array.from(new Set(ids.filter((item: string) => availableIds.has(item))));
  }, [constraintPresets, d.promptConstraintIds]);
  const selectedPromptConstraints = useMemo(
    () => constraintPresets
      .filter((item) => selectedConstraintIds.includes(item.id))
      .map((item) => item.text.trim())
      .filter(Boolean),
    [constraintPresets, selectedConstraintIds],
  );
  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );
  const regenerateEachTime = d.regenerateEachTime !== false;
  const projectTheme = String(d.projectTheme || '').trim();
  const colorMaterial = String(d.colorMaterial || '').trim();
  const colorMaterialPalette = String(d.colorMaterialPalette || '').trim();
  const colorMaterialTextures = String(d.colorMaterialTextures || '').trim();
  const combinedColorMaterial = combineColorMaterialText(colorMaterialPalette, colorMaterialTextures, colorMaterial);
  const projectThemeMentions = mediaMentions(d.projectThemeMentions);
  const inspirationMentions = mediaMentions(d.inspirationMentions);
  const documentSummaryMentions = mediaMentions(d.documentSummaryMentions);
  const creativeBriefMentions = mediaMentions(d.creativeBriefMentions);
  const colorMaterialPaletteMentions = mediaMentions(d.colorMaterialPaletteMentions);
  const colorMaterialTexturesMentions = mediaMentions(d.colorMaterialTexturesMentions);
  const colorMaterialReferenceToneMentions = mediaMentions(d.colorMaterialReferenceToneMentions);
  const hasColorMaterialPreset = !!String(d.colorMaterialPreset || '').trim();
  const colorMaterialNegativePrompt = hasColorMaterialPreset ? String(selectedColorMaterialPreset?.negativePrompt || '').trim() : '';
  const colorMaterialPriorityMode = normalizeColorMaterialPriorityMode(d.colorMaterialPriorityMode);
  const spaceLightingEnabled = d.spaceLightingEnabled === true;
  const spaceLightingLevel = normalizeSpaceLightingLevel(d.spaceLightingLevel);
  const inspiration = String(d.inspiration || '').trim();
  const sourceText = String(d.sourceText || '');
  const documentSummary = String(d.documentSummary || '').trim();
  const documentSummaryOutputToPrompt = d.documentSummaryOutputToPrompt !== false;
  const documentSummaryForImagePrompt = documentSummaryOutputToPrompt ? documentSummary : '';
  const creativeBrief = normalizeExhibitionCreativeBrief(d.creativeBrief);
  const creativeResults = useMemo(() => creativeResultsFromData(d.creativeResults), [d.creativeResults]);
  const status = String(d.status || 'idle');
  const busy = status === 'generating' || status === 'creative' || status === 'extracting' || status === 'summarizing';
  const isGenerating = status === 'generating';
  const contentBusy = status === 'extracting' || status === 'summarizing';
  const pollAbortRef = useRef(false);
  const spaceImage = useInputImageByHandle(id, 'space', true);
  const colorMaterialReferenceImage = useInputImageByHandle(id, 'color-material-reference');
  const exhibitReferenceInputImages = useInputImagesByHandle(id, 'exhibit-reference');
  const exhibitReferenceItems = useMemo(() => {
    const saved: ExhibitReferenceItem[] = Array.isArray(d.exhibitReferenceItems) ? d.exhibitReferenceItems : [];
    return exhibitReferenceInputImages.map((image, index) => {
      const existing = saved.find((item) => item.url === image.url);
      return existing
        ? { ...existing, id: image.id, label: image.label, descriptionMentions: mediaMentions(existing.descriptionMentions) }
        : { ...image, description: '', descriptionMentions: [] };
    });
  }, [d.exhibitReferenceItems, exhibitReferenceInputImages]);
  const exhibitReferenceImage = exhibitReferenceInputImages[0]?.url || '';
  const exhibitReferenceImageUrls = useMemo(() => exhibitReferenceInputImages.map((img) => img.url), [exhibitReferenceInputImages]);
  const hasExhibitReference = exhibitReferenceInputImages.length > 0;
  const hasColorMaterialReference = !!colorMaterialReferenceImage;
  const colorMaterialRecognitionDisabled = hasColorMaterialPreset || !hasColorMaterialReference;
  const effectiveColorMaterial = hasColorMaterialPreset || !hasColorMaterialReference ? combinedColorMaterial : '';
  const colorMaterialReferenceTone = String(d.colorMaterialReferenceTone || '').trim();
  const colorMaterialMarkSettings = useMemo(() => normalizeReferenceMarkSettings(d, 'colorMaterial'), [
    d.colorMaterialMarkAutoFontSize,
    d.colorMaterialMarkColor,
    d.colorMaterialMarkFontSize,
    d.colorMaterialMarkPosition,
    d.colorMaterialMarkText,
  ]);
  const inputDocumentText = useInputDocumentText(id);
  const orderedReferenceMaterials = useMemo<CreativeReferenceMaterialRole[]>(() => {
    const out: CreativeReferenceMaterialRole[] = [];
    const seen = new Set<string>();
    const push = (item: CreativeReferenceMaterialRole) => {
      if (!item.url || seen.has(item.url)) return;
      seen.add(item.url);
      out.push(item);
    };
    if (spaceImage) {
      push({
        id: `${id}:reference:space:${spaceImage}`,
        kind: 'image',
        url: spaceImage,
        sourceNodeId: id,
        origin: 'upstream',
        label: '空间图',
        role: 'space',
      });
    }
    if (colorMaterialReferenceImage) {
      push({
        id: `${id}:reference:color-material-reference:${colorMaterialReferenceImage}`,
        kind: 'image',
        url: colorMaterialReferenceImage,
        sourceNodeId: id,
        origin: 'upstream',
        label: '色彩材质参考图',
        role: 'color-material-reference',
      });
    }
    for (const [index, item] of exhibitReferenceItems.entries()) {
      push({
        id: item.id,
        kind: 'image',
        url: item.url,
        sourceNodeId: item.id.split(':')[0] || id,
        origin: 'upstream',
        label: item.label || `展品参考图 ${index + 1}`,
        role: 'exhibit-reference',
        roleIndex: index + 1,
      });
    }
    return out;
  }, [colorMaterialReferenceImage, exhibitReferenceItems, id, spaceImage]);
  const orderedReferenceImages = useMemo(() => orderedReferenceMaterials.map((item) => item.url), [orderedReferenceMaterials]);
  const mentionMaterials: Material[] = useMemo(() => orderedReferenceMaterials.map((item) => ({
    id: item.id,
    kind: item.kind,
    url: item.url,
    sourceNodeId: item.sourceNodeId,
    origin: item.origin,
    label: item.label,
  })), [orderedReferenceMaterials]);
  const referenceRoleHints = useMemo(() => orderedReferenceMaterials.map((item) => ({
    token: imageTokenForUrl(item.url, mentionMaterials),
    role: item.role,
    index: item.roleIndex,
  })).filter((item) => item.token), [mentionMaterials, orderedReferenceMaterials]);

  const disconnectColorMaterialReferenceInput = useCallback(() => {
    colorMaterialPresetDisconnectRef.current = true;
    rf.setEdges((eds) => eds.filter((edge: any) => (
      edge.target !== id || (edge.targetHandle || '') !== 'color-material-reference'
    )));
  }, [id, rf]);

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
    if (hasColorMaterialPreset && !colorMaterialPresetDisconnectRef.current) {
      update({ colorMaterialPreset: '' });
    }
  }, [colorMaterialReferenceImage, hasColorMaterialPreset, update]);

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

  const resolvedPromptInputs = useMemo(() => {
    const resolveText = (value: unknown, mentions: MediaMention[]) => (
      resolveMediaMentions(String(value || ''), mentions, mentionMaterials)
    );
    const promptColorMaterialPalette = hasColorMaterialPreset || !hasColorMaterialReference ? (colorMaterialPalette || colorMaterial) : '';
    const promptColorMaterialTextures = hasColorMaterialPreset || !hasColorMaterialReference ? (colorMaterialTextures || colorMaterial) : '';
    return {
      projectTheme: resolveText(projectTheme, projectThemeMentions),
      inspiration: resolveText(inspiration, inspirationMentions),
      documentSummary: resolveText(documentSummaryForImagePrompt, documentSummaryMentions),
      creativeBrief: normalizeExhibitionCreativeBrief(resolveText(creativeBrief, creativeBriefMentions)),
      colorMaterialPalette: resolveText(promptColorMaterialPalette, colorMaterialPaletteMentions),
      colorMaterialTextures: resolveText(promptColorMaterialTextures, colorMaterialTexturesMentions),
      colorMaterialReferenceTone: resolveText(colorMaterialReferenceTone, colorMaterialReferenceToneMentions),
      exhibitReferenceItems: exhibitReferenceItems.map((item) => ({
        ...item,
        description: resolveText(item.description, mediaMentions(item.descriptionMentions)),
      })),
    };
  }, [
    colorMaterial,
    colorMaterialPalette,
    colorMaterialPaletteMentions,
    colorMaterialReferenceTone,
    colorMaterialReferenceToneMentions,
    colorMaterialTextures,
    colorMaterialTexturesMentions,
    creativeBrief,
    creativeBriefMentions,
    documentSummaryForImagePrompt,
    documentSummaryMentions,
    exhibitReferenceItems,
    hasColorMaterialPreset,
    hasColorMaterialReference,
    inspiration,
    inspirationMentions,
    mentionMaterials,
    projectTheme,
    projectThemeMentions,
  ]);

  const previewPrompt = useMemo(
    () => buildExhibitionCreativeImagePrompt({
      spaceType,
      projectTheme: resolvedPromptInputs.projectTheme,
      colorMaterial: effectiveColorMaterial,
      colorMaterialPalette: resolvedPromptInputs.colorMaterialPalette,
      colorMaterialTextures: resolvedPromptInputs.colorMaterialTextures,
      colorMaterialNegativePrompt,
      hasColorMaterialPreset,
      hasColorMaterialReferenceImage: hasColorMaterialReference,
      colorMaterialReferenceTone: resolvedPromptInputs.colorMaterialReferenceTone,
      colorMaterialPriorityMode,
      colorMaterialReferenceMode,
      colorMaterialReferenceMarkText: colorMaterialMarkSettings.text,
      colorMaterialReferenceMarkPosition: colorMaterialMarkSettings.position,
      spaceLightingEnabled,
      spaceLightingLevel,
      inspiration: resolvedPromptInputs.inspiration,
      documentSummary: resolvedPromptInputs.documentSummary,
      creativeBrief: resolvedPromptInputs.creativeBrief,
      insertItems: selectedInsertIds,
      insertItemOptions: insertOptions,
      excludeItems: selectedExcludeIds,
      excludeItemOptions: excludeOptions,
      hasSpaceImage: !!spaceImage,
      hasExhibitReferenceImage: hasExhibitReference,
      exhibitReferenceItems: resolvedPromptInputs.exhibitReferenceItems,
      annotationTextEffective: d.annotationTextEffective === true,
      spaceSize: manualSpaceSize,
      viewControlEnabled,
      viewAngles: selectedViewAngleIds,
      viewAngleOptions,
      roundIndex: 1,
      total: generationCount,
      referenceRoleHints,
    }),
    [colorMaterialMarkSettings.position, colorMaterialMarkSettings.text, colorMaterialNegativePrompt, colorMaterialPriorityMode, colorMaterialReferenceMode, d.annotationTextEffective, effectiveColorMaterial, excludeOptions, generationCount, hasColorMaterialPreset, hasColorMaterialReference, hasExhibitReference, insertOptions, manualSpaceSize, referenceRoleHints, resolvedPromptInputs, selectedExcludeIds, selectedInsertIds, selectedViewAngleIds, spaceImage, spaceLightingEnabled, spaceLightingLevel, spaceType, viewAngleOptions, viewControlEnabled],
  );

  const renderMarkSettings = (
    title: string,
    prefix: 'colorMaterial',
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
            onChange={(event) => update({ [`${prefix}MarkAutoFontSize`]: event.target.checked })}
          />
          自动字号
        </label>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <PromptExpandableInput
          title="扩大编辑"
          className={FIELD}
          value={settings.text}
          disabled={isReadonly || busy}
          maxLength={64}
          placeholder="标识"
          onValueChange={(value) => update({ [`${prefix}MarkText`]: value })}
        />
        <select
          className={`${FIELD} col-span-2`}
          value={settings.position}
          disabled={isReadonly || busy}
          onChange={(event) => update({ [`${prefix}MarkPosition`]: normalizeReferenceMarkPosition(event.target.value) })}
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
          onChange={(event) => update({ [`${prefix}MarkFontSize`]: clampReferenceMarkFontSize(event.target.value) })}
        />
      </div>
      <div className="grid grid-cols-[34px_1fr] gap-1">
        <input
          type="color"
          value={settings.color}
          disabled={isReadonly || busy}
          className="h-7 w-full rounded border border-white/10 bg-black/20 p-0.5 disabled:opacity-55"
          onChange={(event) => update({ [`${prefix}MarkColor`]: normalizeReferenceMarkColor(event.target.value) })}
        />
        <PromptExpandableInput
          title="扩大编辑"
          className={FIELD}
          value={settings.color}
          disabled={isReadonly || busy}
          onValueChange={(value) => update({ [`${prefix}MarkColor`]: value })}
        />
      </div>
    </div>
  );

  useEffect(() => {
    const patch = {
      prompt: previewPrompt,
      outputText: previewPrompt,
      text: previewPrompt,
      referenceImages: orderedReferenceImages,
    };
    if (
      d.prompt !== patch.prompt ||
      d.outputText !== patch.outputText ||
      d.text !== patch.text ||
      JSON.stringify(d.referenceImages || []) !== JSON.stringify(orderedReferenceImages)
    ) {
      update(patch);
    }
  }, [d.outputText, d.prompt, d.referenceImages, d.text, orderedReferenceImages, previewPrompt, update]);

  useEffect(() => {
    if (!inputDocumentText || d.sourceText === inputDocumentText) return;
    update({ sourceText: inputDocumentText, documentMeta: null });
  }, [d.sourceText, inputDocumentText, update]);

  useEffect(() => {
    const saved: ExhibitReferenceItem[] = Array.isArray(d.exhibitReferenceItems) ? d.exhibitReferenceItems : [];
    const same = saved.length === exhibitReferenceItems.length
      && saved.every((item, i) => (
        item.url === exhibitReferenceItems[i].url
        && item.description === exhibitReferenceItems[i].description
        && JSON.stringify(mediaMentions(item.descriptionMentions)) === JSON.stringify(mediaMentions(exhibitReferenceItems[i].descriptionMentions))
      ));
    if (!same) update({ exhibitReferenceItems });
  }, [d.exhibitReferenceItems, exhibitReferenceItems, update]);

  const patchExhibitReferenceItem = useCallback((url: string, patch: Partial<Pick<ExhibitReferenceItem, 'description' | 'descriptionMentions'>>) => {
    const next = exhibitReferenceItems.map((item) =>
      item.url === url ? { ...item, ...patch } : item
    );
    update({ exhibitReferenceItems: next });
  }, [exhibitReferenceItems, update]);

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
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getExhibitionCreativePromptPresets()
      .then((presets) => {
        setInsertPresets(presets.inserts || []);
        setExcludePresets(presets.exclusions || []);
        setViewAnglePresets(presets.viewAngles || []);
        setConstraintPresets(presets.constraints || []);
      })
      .catch(() => {
        setInsertPresets([]);
        setExcludePresets([]);
        setViewAnglePresets([]);
        setConstraintPresets([]);
      });
    getElevationPromptPresets()
      .then((presets) => setColorMaterialPresets(presets.colorMaterial || []))
      .catch(() => setColorMaterialPresets([]));
  }, []);

  useEffect(() => {
    if (!insertEditorOpen) return;
    setInsertEditorValue(insertPresetEditorText(insertPresets));
    setInsertError('');
  }, [insertEditorOpen, insertPresets]);

  useEffect(() => {
    if (!excludeEditorOpen) return;
    setExcludeEditorValue(excludePresetEditorText(excludePresets));
    setExcludeError('');
  }, [excludeEditorOpen, excludePresets]);

  useEffect(() => {
    if (!viewAngleEditorOpen) return;
    setViewAngleEditorValue(viewAnglePresetEditorText(viewAnglePresets));
    setViewAngleError('');
  }, [viewAngleEditorOpen, viewAnglePresets]);

  useEffect(() => {
    if (!colorMaterialEditorOpen) return;
    setColorMaterialEditorValue(colorPresetEditorText(colorMaterialPresets));
    setColorMaterialError('');
  }, [colorMaterialEditorOpen, colorMaterialPresets]);

  const saveColorMaterialPresets = async () => {
    if (!canManageTeam) return;
    const presets = parseColorPresetEditorText(colorMaterialEditorValue);
    if (presets.length === 0) {
      setColorMaterialError('请至少保留一条“名称｜核心内容｜特征内容｜适用提示”格式的预设。');
      return;
    }
    setColorMaterialSaving(true);
    setColorMaterialError('');
    try {
      const saved = await updateElevationColorMaterialPresets(presets);
      setColorMaterialPresets(saved);
      setColorMaterialEditorOpen(false);
    } catch (error: any) {
      setColorMaterialError(error?.message || '保存色彩与材质预设失败');
    } finally {
      setColorMaterialSaving(false);
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

  const saveInsertPresets = async () => {
    if (!canManageTeam) return;
    const presets = parseInsertPresetEditorText(insertEditorValue);
    if (presets.length === 0) {
      setInsertError('请至少保留一项植入内容。');
      return;
    }
    setInsertSaving(true);
    setInsertError('');
    try {
      const saved = await updateExhibitionCreativeInsertPresets(presets);
      setInsertPresets(saved);
      update({ insertItems: normalizeExhibitionCreativeInsertItems(selectedInsertIds, saved).map((item) => item.id) });
      setInsertEditorOpen(false);
    } catch (error: any) {
      setInsertError(error?.message || '保存植入项失败');
    } finally {
      setInsertSaving(false);
    }
  };

  const saveExcludePresets = async () => {
    if (!canManageTeam) return;
    const presets = parseLabelPresetEditorText(excludeEditorValue, 'exclude');
    if (presets.length === 0) {
      setExcludeError('请至少保留一项排除内容。');
      return;
    }
    setExcludeSaving(true);
    setExcludeError('');
    try {
      const saved = await updateExhibitionCreativeExcludePresets(presets);
      setExcludePresets(saved);
      update({ excludeItems: normalizeExhibitionCreativeExcludeItems(selectedExcludeIds, saved).map((item) => item.id) });
      setExcludeEditorOpen(false);
    } catch (error: any) {
      setExcludeError(error?.message || '保存排除项失败');
    } finally {
      setExcludeSaving(false);
    }
  };

  const saveViewAnglePresets = async () => {
    if (!canManageTeam) return;
    const presets = parseLabelPresetEditorText(viewAngleEditorValue, 'view');
    if (presets.length === 0) {
      setViewAngleError('请至少保留一项视角内容。');
      return;
    }
    setViewAngleSaving(true);
    setViewAngleError('');
    try {
      const saved = await updateExhibitionCreativeViewAnglePresets(presets);
      setViewAnglePresets(saved);
      update({ viewAngles: normalizeExhibitionCreativeViewAngles(selectedViewAngleIds, saved).map((item) => item.id) });
      setViewAngleEditorOpen(false);
    } catch (error: any) {
      setViewAngleError(error?.message || '保存视角项失败');
    } finally {
      setViewAngleSaving(false);
    }
  };

  const saveConstraintPresets = async (presets: ExhibitionCreativeConstraintPresetItem[]) => {
    if (!canManageConstraints) return;
    setConstraintSaving(true);
    setConstraintError('');
    try {
      const saved = await updateExhibitionCreativeConstraintPresets(presets);
      setConstraintPresets(saved);
      const savedIds = new Set(saved.map((item) => item.id));
      update({ promptConstraintIds: selectedConstraintIds.filter((item) => savedIds.has(item)) });
      setConstraintEditorOpen(false);
    } catch (error: any) {
      setConstraintError(error?.message || '保存提示词创作约束预设失败');
    } finally {
      setConstraintSaving(false);
    }
  };

  const toggleInsertItem = (itemId: string) => {
    if (isReadonly || busy) return;
    const next = selectedInsertIds.includes(itemId)
      ? selectedInsertIds.filter((item) => item !== itemId)
      : [...selectedInsertIds, itemId];
    update({ insertItems: next });
  };

  const setInsertRandomCount = (category: string, value: string | number) => {
    if (isReadonly || busy) return;
    const next = normalizeInsertRandomCounts(insertRandomCounts);
    next[category] = Math.max(-1, Math.min(99, Math.floor(Number(value) || 0)));
    update({ insertRandomCounts: next });
  };

  const toggleExcludeItem = (itemId: string) => {
    if (isReadonly || busy) return;
    const next = selectedExcludeIds.includes(itemId)
      ? selectedExcludeIds.filter((item) => item !== itemId)
      : [...selectedExcludeIds, itemId];
    update({ excludeItems: next });
  };

  const toggleAllExcludeItems = () => {
    if (isReadonly || busy) return;
    update({ excludeItems: allExcludeSelected ? [] : excludeOptions.map((item) => item.id) });
  };

  const toggleViewAngle = (itemId: string) => {
    if (isReadonly || busy || !viewControlEnabled) return;
    const next = selectedViewAngleIds.includes(itemId)
      ? selectedViewAngleIds.filter((item) => item !== itemId)
      : [...selectedViewAngleIds, itemId];
    update({ viewAngles: next });
  };

  const togglePromptConstraint = (itemId: string) => {
    if (isReadonly || busy) return;
    const next = selectedConstraintIds.includes(itemId)
      ? selectedConstraintIds.filter((item) => item !== itemId)
      : [...selectedConstraintIds, itemId];
    update({ promptConstraintIds: next });
  };

  const toggleViewControl = (enabled: boolean) => {
    if (isReadonly || busy) return;
    update({
      viewControlEnabled: enabled,
      viewAngles: enabled && selectedViewAngleIds.length === 0 ? [viewAngleOptions[0]?.id].filter(Boolean) : selectedViewAngleIds,
    });
  };

  const buildCreativeBrief = useCallback(async (roundIndex: number, previousBriefs: string[] = [], effectiveInsertIds = selectedInsertIds) => {
    const requestPrompt = buildExhibitionCreativeBriefPrompt({
      spaceType,
      projectTheme,
      colorMaterial: effectiveColorMaterial,
      hasColorMaterialReferenceImage: hasColorMaterialReference,
      inspiration,
      documentSummary,
      insertItems: effectiveInsertIds,
      insertItemOptions: insertOptions,
      excludeItems: selectedExcludeIds,
      excludeItemOptions: excludeOptions,
      roundIndex,
      total: generationCount,
      previousBriefs,
      regenerateEachTime,
      promptCreationConstraints: selectedPromptConstraints,
    });
    const response = await generateLlm({
      model: llmModel,
      llmKeyId: activeLlmConfig?.id,
      temperature: 0.8,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content: '你是资深展陈策划、空间创意总监和室内效果图提示词专家。你只输出可用于图生图的中文创意描述。',
        },
        {
          role: 'user',
          content: requestPrompt,
        },
      ] as any,
    });
    const nextBrief = normalizeExhibitionCreativeBrief(response.content);
    if (!nextBrief) throw new Error('LLM 未返回有效创意描述');
    return nextBrief;
  }, [
    activeLlmConfig?.id,
    documentSummary,
    excludeOptions,
    effectiveColorMaterial,
    generationCount,
    hasColorMaterialReference,
    inspiration,
    llmModel,
    projectTheme,
    regenerateEachTime,
    insertOptions,
    selectedExcludeIds,
    selectedInsertIds,
    selectedPromptConstraints,
    spaceType,
  ]);

  const generateCreativeOnly = useCallback(async () => {
    if (isReadonly || busy) return;
    update({ status: 'creative', progress: '创意描述中', error: '' });
    try {
      const nextBrief = await buildCreativeBrief(1, []);
      if (!normalizeExhibitionImageName(d.imageName)) {
        try {
          const nextName = await generateExhibitionImageNameWithLlm({
            generateLlm,
            model: llmModel,
            llmKeyId: activeLlmConfig?.id,
            material: nextBrief,
            fallback: projectTheme || '创意图',
          });
          if (nextName) update({ imageName: nextName });
        } catch (nameError: any) {
          logBus.warn(`展陈创意生图自动命名失败: ${nameError?.message || nameError}`, `exhibition-creative-image:${id.slice(0, 6)}`);
        }
      }
      update({
        creativeBrief: nextBrief,
        lastCreativeBriefs: [nextBrief],
        status: 'success',
        progress: '',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      throw error;
    }
  }, [activeLlmConfig?.id, buildCreativeBrief, busy, d.imageName, id, isReadonly, llmModel, projectTheme, update]);

  const summarizeDocument = useCallback(async (textOverride?: string, rethrow = false) => {
    if (isReadonly || busy) return;
    const text = String(textOverride ?? sourceText).trim();
    if (!text) {
      update({ status: 'error', error: '请先导入文档或粘贴资料原文' });
      return;
    }
    update({ status: 'summarizing', progress: '资料总结中', error: '' });
    try {
      const response = await generateLlm({
        model: documentLlmModel,
        llmKeyId: activeDocumentLlmConfig?.id,
        temperature: 0.25,
        max_tokens: 1400,
        messages: [
          {
            role: 'system',
            content: '你是展陈策划资料整理助手。请把项目资料总结成可供空间创意使用的高密度中文摘要。',
          },
          {
            role: 'user',
            content: [
              '请总结以下展陈项目资料，供序厅、尾厅、重点展项空间的创意生图使用。',
              '输出 5 到 9 条要点，覆盖：项目主题、核心叙事、关键内容/展项、情绪基调、可转化为空间装置或视觉符号的元素、必须避免误读的事实。',
              '只输出中文要点，不要 Markdown 表格，不要泛泛而谈。',
              '',
              text.slice(0, 50000),
            ].join('\n'),
          },
        ],
      });
      const summary = String(response.content || '').trim();
      if (!summary) throw new Error('LLM 未返回有效资料摘要');
      const patch: Record<string, any> = {
        documentSummary: summary,
        status: 'success',
        progress: '',
        error: '',
        summarizedAt: Date.now(),
      };
      if (!normalizeExhibitionImageName(d.imageName)) {
        try {
          const nextName = await generateExhibitionImageNameWithLlm({
            generateLlm,
            model: documentLlmModel,
            llmKeyId: activeDocumentLlmConfig?.id,
            material: summary,
            fallback: projectTheme || '创意图',
          });
          if (nextName) patch.imageName = nextName;
        } catch (nameError: any) {
          logBus.warn(`展陈创意生图资料自动命名失败: ${nameError?.message || nameError}`, `exhibition-creative-image:${id.slice(0, 6)}`);
        }
      }
      update({
        ...patch,
      });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      if (rethrow) throw error;
    }
  }, [
    activeDocumentLlmConfig?.id,
    busy,
    documentLlmModel,
    d.imageName,
    id,
    isReadonly,
    projectTheme,
    sourceText,
    update,
  ]);

  const pickDocument = useCallback(async (file?: File) => {
    if (!file || isReadonly || busy) return;
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      update({ status: 'error', error: `文档不能超过 ${MAX_DOCUMENT_FILE_SIZE_MB}MB` });
      return;
    }
    update({ status: 'extracting', progress: '文档解析中', error: '' });
    try {
      const extracted = await extractDocument(file);
      const { text, ...documentMeta } = extracted;
      update({
        documentMeta,
        sourceText: text,
        documentSummary: '',
        status: 'summarizing',
        progress: '资料总结中',
        error: '',
      });
      await summarizeDocument(text);
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '文档解析失败', progress: '' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [busy, isReadonly, summarizeDocument, update]);

  const generateOneImage = useCallback(async ({
    brief,
    imagePrompt,
    runSeed,
    roundIndex,
    referenceImages,
    outputTitle,
  }: {
    brief: string;
    imagePrompt: string;
    runSeed: number;
    roundIndex: number;
    referenceImages: string[];
    outputTitle: string;
  }): Promise<{ urls: string[]; taskId?: string }> => {
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'exhibition-creative-image',
      seed: runSeed,
      nodeTitle: `展陈创意生图 ${roundIndex}/${generationCount}`,
      outputTitle,
    };
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
      let res = await generateExternalImage({
        providerId: providerSelection.provider.id,
        providerModel: externalProviderModel,
        model: externalProviderModel,
        prompt: imagePrompt,
        size,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images: referenceImages,
        outputFormat,
        seed: runSeed,
        n: 1,
        providerParams,
        historyContext,
        async: true,
      });
      if ((!res.imageUrls?.length) && res.taskId && (res.code === 'running' || res.status === 'running')) {
        let pollingTaskId = res.taskId;
        for (let i = 0; i < EXTERNAL_IMAGE_MAX_POLLS; i += 1) {
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
          update({ taskId: pollingTaskId, progress: `${roundIndex}/${generationCount} · ${Math.min(99, Math.round(((i + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%` });
          if (res.imageUrls?.length || (res.code && res.code !== 'running')) break;
        }
      }
      const urls = res.imageUrls || [];
      if (!urls.length) throw new Error('扩展平台完成但未返回图片');
      return { urls, taskId: res.taskId };
    }

    const submit = await submitImageAsync({
      model: modelDef.id,
      apiModel,
      paramKind: modelDef.paramKind,
      prompt: imagePrompt,
      aspect_ratio: aspectRatio,
      image_size: sizeLevel,
      images: referenceImages,
      n: 1,
      outputFormat,
      seed: runSeed,
      historyContext,
    });
    if (submit.sync && submit.urls?.length) {
      return { urls: submit.urls };
    }
    if (!submit.taskId) throw new Error('未获取到任务 ID');
    let lastProgress = submit.progress || '5%';
    update({ taskId: submit.taskId, progress: `${roundIndex}/${generationCount} · ${lastProgress}` });
    for (let index = 0; index < 1800; index += 1) {
      if (pollAbortRef.current) throw new Error('任务已取消');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const q = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
      if (q.progress && q.progress !== lastProgress) {
        lastProgress = q.progress;
        update({ progress: `${roundIndex}/${generationCount} · ${q.progress}` });
      }
      const statusText = String(q.status || '').toLowerCase();
      if (statusText === 'completed' || statusText === 'success' || statusText === 'done') {
        const url = q.urls?.[0];
        if (!url) throw new Error('任务完成但未返回图片');
        return { urls: q.urls || [url], taskId: submit.taskId };
      }
      if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') {
        throw new Error(q.error || '任务失败');
      }
    }
    throw new Error('轮询超时');
  }, [
    activeCanvasId,
    apiModel,
    aspectRatio,
    d.providerParams,
    externalProviderModel,
    generationCount,
    id,
    isExternalSelected,
    modelDef.id,
    modelDef.paramKind,
    outputFormat,
    providerSelection.provider,
    sizeLevel,
    update,
  ]);

  const runGenerate = useCallback(async () => {
    if (isReadonly) return;
    if (!spaceImage && !hasManualSpaceSize) {
      const msg = '请先连接一张室内建筑空间图，或填写完整的宽度、进深和高度';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    const src = `exhibition-creative-image:${id.slice(0, 6)}`;
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    update({
      status: 'generating',
      progress: `0/${generationCount}`,
      error: '',
      usedI2I: !!spaceImage,
      creativeResults: [],
      imageUrls: [],
      imageNames: [],
    });
    const results: CreativeResult[] = [];
    const briefs: string[] = [];
    const imageUrls: string[] = [];
    const imageNames: string[] = [];
    try {
      const colorMaterialReferenceForModel = colorMaterialReferenceImage
        ? useColorMaterialAbstractCard
          ? await createColorMaterialAbstractCardDataUrl(colorMaterialReferenceImage, colorMaterialMarkSettings)
          : await markImageDataUrl(colorMaterialReferenceImage, colorMaterialMarkSettings)
        : '';
      const runtimeReferenceImages = orderedReferenceMaterials.map((item) => (
        item.role === 'color-material-reference' ? colorMaterialReferenceForModel : item.url
      )).filter(Boolean);
      const runtimeInsertIds = resolveRuntimeInsertItems();
      let sharedBrief = creativeBrief;
      const baseImageName = imageName || projectTheme || '创意图';
      if (!regenerateEachTime) {
        if (!sharedBrief) {
          update({ progress: `创意描述 1/${generationCount}` });
          try {
            sharedBrief = await buildCreativeBrief(1, [], runtimeInsertIds);
          } catch (error: any) {
            const reason = llmErrorMessage(error);
            logBus.warn(`展陈创意描述失败，改用本地兜底描述: ${reason}`, src);
            sharedBrief = fallbackCreativeBrief({
              spaceType,
              projectTheme,
              colorMaterial: effectiveColorMaterial,
              inspiration,
              documentSummary,
              insertItemsText: exhibitionCreativeInsertItemsText(runtimeInsertIds, insertOptions),
              excludeItemsText: exhibitionCreativeExcludeItemsText(selectedExcludeIds, excludeOptions),
              roundIndex: 1,
              total: generationCount,
            });
            update({ progress: `创意描述降级 1/${generationCount}` });
          }
          update({ creativeBrief: sharedBrief });
        }
        briefs.push(sharedBrief);
        update({ lastCreativeBriefs: briefs.slice() });
      }

      for (let index = 1; index <= generationCount; index += 1) {
        const nextSeed = seed > 0 && generationCount === 1 ? seed : randomImageSeed();
        let brief = sharedBrief;
        if (regenerateEachTime) {
          try {
            brief = await buildCreativeBrief(index, briefs, runtimeInsertIds);
          } catch (error: any) {
            const reason = llmErrorMessage(error);
            logBus.warn(`展陈创意描述失败，改用本地兜底描述: ${index}/${generationCount} ${reason}`, src);
            brief = fallbackCreativeBrief({
              spaceType,
              projectTheme,
              colorMaterial: effectiveColorMaterial,
              inspiration,
              documentSummary,
              insertItemsText: exhibitionCreativeInsertItemsText(runtimeInsertIds, insertOptions),
              excludeItemsText: exhibitionCreativeExcludeItemsText(selectedExcludeIds, excludeOptions),
              roundIndex: index,
              total: generationCount,
            });
            update({ progress: `创意描述降级 ${index}/${generationCount}` });
          }
        }
        if (!brief) throw new Error('缺少有效创意描述');
        if (regenerateEachTime) {
          briefs.push(brief);
          update({ creativeBrief: brief, lastCreativeBriefs: briefs.slice(), progress: `创意描述 ${index}/${generationCount}` });
        }
        const imagePrompt = buildExhibitionCreativeImagePrompt({
          spaceType,
          projectTheme: resolvedPromptInputs.projectTheme,
          colorMaterial: effectiveColorMaterial,
          colorMaterialPalette: resolvedPromptInputs.colorMaterialPalette,
          colorMaterialTextures: resolvedPromptInputs.colorMaterialTextures,
          colorMaterialNegativePrompt,
          hasColorMaterialPreset,
          hasColorMaterialReferenceImage: hasColorMaterialReference,
          colorMaterialReferenceTone: resolvedPromptInputs.colorMaterialReferenceTone,
          colorMaterialPriorityMode,
          colorMaterialReferenceMode,
          colorMaterialReferenceMarkText: colorMaterialMarkSettings.text,
          colorMaterialReferenceMarkPosition: colorMaterialMarkSettings.position,
          spaceLightingEnabled,
          spaceLightingLevel,
          inspiration: resolvedPromptInputs.inspiration,
          documentSummary: resolvedPromptInputs.documentSummary,
          creativeBrief: normalizeExhibitionCreativeBrief(resolveMediaMentions(brief, creativeBriefMentions, mentionMaterials)),
          insertItems: runtimeInsertIds,
          insertItemOptions: insertOptions,
          excludeItems: selectedExcludeIds,
          excludeItemOptions: excludeOptions,
          hasSpaceImage: !!spaceImage,
          hasExhibitReferenceImage: hasExhibitReference,
          exhibitReferenceItems: resolvedPromptInputs.exhibitReferenceItems,
          annotationTextEffective: d.annotationTextEffective === true,
          spaceSize: manualSpaceSize,
          viewControlEnabled,
          viewAngles: selectedViewAngleIds,
          viewAngleOptions,
          roundIndex: index,
          total: generationCount,
          referenceRoleHints,
        });
        update({ lastPrompt: imagePrompt, lastSeed: nextSeed, progress: `提交生图 ${index}/${generationCount}` });
        logBus.info(`展陈创意生图提交: ${index}/${generationCount} seed=${nextSeed}`, src);
        const displayName = formatExhibitionOutputImageName(baseImageName, index, generationCount, '创意图');
        const res = await generateOneImage({
          brief,
          imagePrompt,
          runSeed: nextSeed,
          roundIndex: index,
          referenceImages: runtimeReferenceImages,
          outputTitle: displayName,
        });
        const url = res.urls[0];
        const nextResult = {
          index,
          name: displayName,
          brief,
          prompt: imagePrompt,
          imageUrl: url,
          seed: nextSeed,
          taskId: res.taskId,
        };
        results.push(nextResult);
        imageUrls.push(...res.urls.filter(Boolean));
        imageNames.push(displayName);
        update({
          creativeResults: results.slice(),
          imageUrl: url,
          imageUrls: imageUrls.slice(),
          imageNames: imageNames.slice(),
          prompt: imagePrompt,
          outputText: imagePrompt,
          text: imagePrompt,
          progress: `${index}/${generationCount} 完成`,
        });
      }
      update({
        status: 'success',
        progress: '100%',
        creativeResults: results,
        imageUrl: imageUrls[imageUrls.length - 1] || '',
        imageUrls,
        imageNames,
        lastCreativeBriefs: briefs,
        usedI2I: !!spaceImage,
        error: '',
      });
      logBus.success(`展陈创意生图完成: ${imageUrls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      logBus.error(`展陈创意生图失败: ${msg}`, src);
      update({ status: 'error', error: msg, progress: '' });
      throw error;
    }
  }, [
    buildCreativeBrief,
    creativeBrief,
    documentSummary,
    excludeOptions,
    generateOneImage,
    generationCount,
    hasManualSpaceSize,
    id,
    imageName,
    insertOptions,
    colorMaterialMarkSettings,
    colorMaterialPriorityMode,
    colorMaterialReferenceImage,
    creativeBriefMentions,
    inspiration,
    effectiveColorMaterial,
    hasColorMaterialPreset,
    hasColorMaterialReference,
    hasExhibitReference,
    isReadonly,
    manualSpaceSize,
    mentionMaterials,
    orderedReferenceMaterials,
    projectTheme,
    referenceRoleHints,
    regenerateEachTime,
    resolvedPromptInputs,
    selectedExcludeIds,
    selectedViewAngleIds,
    seed,
    spaceImage,
    spaceType,
    update,
    viewAngleOptions,
    viewControlEnabled,
  ]);

  useRunTrigger(id, runGenerate, 'image');

  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      data-exhibition-compact-node-type="exhibition-creative-image"
      className={`relative w-[780px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!border-0 t8-exhibition-handle--image" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：展陈创意生图结果（图像）" />
      <Handle id="space" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '30%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：空间图 — 约束建筑空间结构" />
      <Handle id="color-material-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--pink" style={{ top: '43%', background: EXHIBITION_COLOR_MATERIAL_REFERENCE_COLOR }} title="输入：色彩材质参考图（可选）" />
      <Handle id="exhibit-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '56%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：展品参考图（可选）" />
      <Handle id="document-text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--text" style={{ top: '69%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输入：项目资料文档（DOCX/PDF/TXT，可选）" />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <Layers3 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">展陈创意生图</div>
          <div className="truncate text-[10px] text-white/45">单空间图 / LLM 创意 / 多次图生图</div>
        </div>
        <NodeHelpButton nodeType="exhibition-creative-image" />
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[760px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
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
        <section data-exhibition-compact-section="source" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <ImageIcon size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">室内建筑空间输入</span>
            {spaceImage && (
              <label data-exhibition-compact-item="reference-settings" className="ml-auto flex items-center gap-1 text-[10px] text-white/60">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-cyan-300"
                  checked={d.annotationTextEffective === true}
                  disabled={isReadonly || busy}
                  onChange={(event) => update({ annotationTextEffective: event.target.checked })}
                />
                标注文字有效
              </label>
            )}
          </div>
          {spaceImage ? (
            <div className="rounded border border-white/10 bg-black/20 p-2">
              <img src={spaceImage} alt="" className="h-44 w-full rounded border border-white/10 object-contain" draggable={false} />
              <div className="mt-1 truncate text-[10px] text-white/40" title={spaceImage}>{spaceImage.split('/').pop() || spaceImage}</div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-white/15 p-2">
              <div className="py-6 text-center text-[10px] text-white/35">
                连接一张图像作为室内空间骨架，或填写下方尺寸进行无图生图
              </div>
              <div data-exhibition-compact-item="space-reference" className="grid grid-cols-3 gap-1">
                <input
                  className={FIELD}
                  type="number"
                  min={0}
                  step={0.1}
                  value={manualSpaceSize.width || ''}
                  disabled={isReadonly || busy}
                  placeholder="宽度 m"
                  onChange={(event) => update({ manualSpaceSize: { ...manualSpaceSize, width: normalizeSpaceDimensionInput(event.target.value) } })}
                />
                <input
                  className={FIELD}
                  type="number"
                  min={0}
                  step={0.1}
                  value={manualSpaceSize.depth || ''}
                  disabled={isReadonly || busy}
                  placeholder="进深 m"
                  onChange={(event) => update({ manualSpaceSize: { ...manualSpaceSize, depth: normalizeSpaceDimensionInput(event.target.value) } })}
                />
                <input
                  className={FIELD}
                  type="number"
                  min={0}
                  step={0.1}
                  value={manualSpaceSize.height || ''}
                  disabled={isReadonly || busy}
                  placeholder="高度 m"
                  onChange={(event) => update({ manualSpaceSize: { ...manualSpaceSize, height: normalizeSpaceDimensionInput(event.target.value) } })}
                />
              </div>
              <div className="mt-1 text-[9px] leading-snug text-white/35">
                无图时按该尺寸控制空间体量，空间结构可自由发挥。
              </div>
            </div>
          )}
          <div data-exhibition-compact-item="material-reference" className="grid grid-cols-2 gap-2">
            <div className="rounded border border-white/10 bg-black/15 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-rose-100">
                <ImageIcon size={12} />
                色彩与材质参考图
              </div>
              {colorMaterialReferenceImage ? (
                <>
                  <img src={colorMaterialReferenceImage} alt="" className="h-24 w-full rounded border border-white/10 object-contain" draggable={false} />
                  <div className="mt-1 truncate text-[9px] text-white/40" title={colorMaterialReferenceImage}>{colorMaterialReferenceImage.split('/').pop() || colorMaterialReferenceImage}</div>
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-semibold text-rose-100/80">色彩优先</span>
                      {hasColorMaterialPreset && <span className="truncate text-[8px] text-white/35">预设接管</span>}
                    </div>
                    <div className="grid grid-cols-2 rounded border border-white/10 bg-black/20 p-0.5">
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
                  </div>
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-semibold text-rose-100/80">主色调识别（像素采样）</span>
                      {d.colorMaterialReferenceToneStatus && (
                        <span className="truncate text-[8px] text-amber-200/75" title={d.colorMaterialReferenceToneStatus}>需手动确认</span>
                      )}
                    </div>
                    <MentionPromptInput
                      title="扩大编辑"
                      className={`${FIELD} min-h-[46px] resize-y text-[10px] leading-snug${colorMaterialPriorityMode === 'llm' ? ' select-none pointer-events-none' : ''}`}
                      value={colorMaterialReferenceTone}
                      mentions={colorMaterialReferenceToneMentions}
                      materials={mentionMaterials}
                      disabled={isReadonly || busy || hasColorMaterialPreset || colorMaterialPriorityMode === 'llm'}
                      isDark
                      isPixel={false}
                      promptTemplateKind="image"
                      placeholder="接入图片后自动识别主色调，可手动修正"
                      onChange={(value, mentions) => update({
                        colorMaterialReferenceTone: value,
                        colorMaterialReferenceToneMentions: mentions,
                        colorMaterialReferenceToneSource: colorMaterialReferenceImage,
                        colorMaterialReferenceToneStatus: '',
                      })}
                    />
                  </div>
                </>
              ) : (
                <div className="flex h-24 items-center justify-center rounded border border-dashed border-white/15 px-2 text-center text-[10px] leading-snug text-white/35">
                  连接色彩、材质、肌理参考图
                </div>
              )}
            </div>
            <div className="rounded border border-white/10 bg-black/15 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-amber-100">
                <ImageIcon size={12} />
                展品参考图
              </div>
              {exhibitReferenceItems.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded border border-dashed border-white/15 px-2 text-center text-[10px] leading-snug text-white/35">
                  连接展品外观与主题参考图
                </div>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {exhibitReferenceItems.map((item, index) => (
                    <div key={item.url} className="grid grid-cols-[54px_minmax(0,1fr)] items-start gap-1.5 rounded border border-white/10 bg-black/15 p-1.5">
                      <img src={item.url} alt="" className="h-12 w-12 rounded border border-white/10 object-cover" draggable={false} />
                      <div className="min-w-0">
                        <MentionPromptInput
                          title="扩大编辑"
                          className={FIELD}
                          value={item.description}
                          mentions={mediaMentions(item.descriptionMentions)}
                          materials={mentionMaterials}
                          disabled={isReadonly || busy}
                          isDark
                          isPixel={false}
                          promptTemplateKind="image"
                          placeholder={`展品 ${index + 1} 特征描述，如"红色的茶壶"`}
                          onChange={(value, mentions) => patchExhibitReferenceItem(item.url, { description: value, descriptionMentions: mentions })}
                        />
                        <div className="mt-0.5 truncate text-[9px] text-white/35" title={item.url}>{item.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {colorMaterialReferenceImage && renderMarkSettings('色彩与材质图标识', 'colorMaterial', colorMaterialMarkSettings)}
          <div className="grid grid-cols-3 gap-1">
            {EXHIBITION_CREATIVE_SPACE_TYPES.map((item) => {
              const active = item.id === spaceType;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isReadonly || busy}
                  className={`rounded border px-1.5 py-1 text-[10px] ${
                    active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  } disabled:opacity-50`}
                  onClick={() => update({ spaceType: item.id })}
                  title={item.prompt}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-cyan-100">色彩与材质预设</span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-white/40">
                {hasColorMaterialPreset ? '预设已接管 Color palette 与 Materials/textures' : '参与 LLM 创意描述和最终生图 Prompt'}
              </span>
              {currentUser && (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => setColorMaterialEditorOpen((open) => !open)}
                >
                  {colorMaterialEditorOpen ? '收起' : '编辑'}
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
              <div className="rounded border border-cyan-300/15 bg-cyan-300/10 px-2 py-1 text-[10px] leading-relaxed text-cyan-50/75">
                {selectedColorMaterialPreset.info}
              </div>
            )}
            {hasColorMaterialReference && (
              <div className="rounded border border-rose-300/20 bg-rose-300/10 px-2 py-1 text-[10px] leading-relaxed text-rose-50/75">
                {hasColorMaterialPreset ? '色彩与材质预设已接管，参考图识别不参与 Color palette 和 Materials/textures。' : '已由接入的色彩与材质参考图接管'}
              </div>
            )}
            {currentUser && (
              <ColorMaterialPresetEditorModal
                open={colorMaterialEditorOpen}
                presets={colorMaterialPresets}
                saving={colorMaterialSaving || busy}
                error={colorMaterialError}
                title="展陈创意色彩与材质预设管理"
                paletteLabel="Color palette"
                texturesLabel="Materials/textures"
                onClose={() => setColorMaterialEditorOpen(false)}
                onSave={saveColorMaterialPresetItems}
                canManageSystem={canManageTeam}
                onRefresh={setColorMaterialPresets}
              />
            )}
              <MentionPromptInput
                title="扩大编辑"
                className={`${FIELD} min-h-[46px] resize-y`}
                value={colorMaterialPalette || d.colorMaterial || ''}
                mentions={colorMaterialPaletteMentions}
                materials={mentionMaterials}
                disabled={isReadonly || busy || hasColorMaterialReference || hasColorMaterialPreset}
                isDark
                isPixel={false}
                promptTemplateKind="image"
                placeholder="Color palette"
                onChange={(value, mentions) => update({
                  colorMaterialPalette: value,
                  colorMaterialPaletteMentions: mentions,
                  colorMaterial: combineColorMaterialText(value, colorMaterialTextures, d.colorMaterial || ''),
                  colorMaterialPreset: '',
                })}
              />
              <MentionPromptInput
                title="扩大编辑"
                className={`${FIELD} min-h-[46px] resize-y`}
                value={colorMaterialTextures || d.colorMaterial || ''}
                mentions={colorMaterialTexturesMentions}
                materials={mentionMaterials}
                disabled={isReadonly || busy || hasColorMaterialReference || hasColorMaterialPreset}
                isDark
                isPixel={false}
                promptTemplateKind="image"
                placeholder="Materials/textures"
                onChange={(value, mentions) => update({
                  colorMaterialTextures: value,
                  colorMaterialTexturesMentions: mentions,
                  colorMaterial: combineColorMaterialText(colorMaterialPalette, value, d.colorMaterial || ''),
                  colorMaterialPreset: '',
                })}
              />
          </div>
          <MentionPromptInput
            title="扩大编辑"
            className={`${FIELD} min-h-[78px] resize-y`}
            value={inspiration}
            mentions={inspirationMentions}
            materials={mentionMaterials}
            disabled={isReadonly || busy}
            isDark
            isPixel={false}
            promptTemplateKind="image"
            placeholder="个人灵感：想要的情绪、装置、材料、互动、叙事方向"
            onChange={(value, mentions) => update({ inspiration: value, inspirationMentions: mentions })}
          />
        </section>

        <section data-exhibition-compact-section="creative" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <FileText size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">创意资料文档</span>
            <label className="ml-auto flex items-center gap-1 text-[10px] text-white/55 select-none" title="关闭后总结资料不再写入生图提示词，但 LLM 创意描述仍会参考资料">
              <span>输出到提示词</span>
              <button
                type="button"
                role="switch"
                aria-checked={d.documentSummaryOutputToPrompt !== false}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${d.documentSummaryOutputToPrompt !== false ? 'border-cyan-300/50 bg-cyan-300/25' : 'border-white/15 bg-white/10'}`}
                disabled={isReadonly}
                onClick={() => update({ documentSummaryOutputToPrompt: d.documentSummaryOutputToPrompt === false ? true : false })}
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-full transition-transform ${d.documentSummaryOutputToPrompt !== false ? 'translate-x-3.5 bg-cyan-200' : 'translate-x-0.5 bg-white/50'}`} />
              </button>
            </label>
            <button
              type="button"
              className={BUTTON}
              disabled={isReadonly || busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={12} />
              导入
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
            <div className="text-[10px] text-amber-200/80">{d.documentMeta.warnings.join('；')}</div>
          )}
          <div data-exhibition-compact-item="direction" className="grid grid-cols-2 gap-1">
            <select
              className={FIELD}
              disabled={isReadonly || busy}
              value={`llm-key:${activeDocumentLlmConfig?.id || 'default'}`}
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId.startsWith('llm-key:')) update({ documentLlmKeyId: nextId.slice(8), documentLlmModel: '' });
              }}
            >
              {llmConfigOptions.map((item) => <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
            </select>
            <PromptExpandableInput title="扩大编辑" className={FIELD} disabled value={documentLlmModel} />
          </div>
          <PromptTextarea compact title="扩大编辑"
            className={`${FIELD} min-h-[72px] resize-y`}
            value={sourceText}
            disabled={isReadonly || busy}
            placeholder="导入 DOCX、文本型 PDF、TXT，或直接粘贴项目资料原文"
            onValueChange={(value) => update({ sourceText: value })}
                readOnly={isReadonly || busy}
              />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={isReadonly || busy || !sourceText.trim()}
              onClick={() => void summarizeDocument()}
            >
              {contentBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {contentBusy ? (status === 'extracting' ? '解析中' : '总结中') : '总结资料'}
            </button>
            <span className="min-w-0 flex-1 truncate text-[10px] text-white/40">
              摘要会参与后续创意描述和生图 Prompt。
            </span>
          </div>
          <MentionPromptInput
            title="扩大编辑"
            className={`${FIELD} min-h-[92px] resize-y`}
            value={documentSummary}
            mentions={documentSummaryMentions}
            materials={mentionMaterials}
            disabled={isReadonly || busy}
            isDark
            isPixel={false}
            promptTemplateKind="image"
            placeholder="LLM 总结后的创意资料摘要，可手动调整"
            onChange={(value, mentions) => update({ documentSummary: value, documentSummaryMentions: mentions })}
          />
        </section>

        <section data-exhibition-compact-section="insert" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <Brain size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">LLM 创意描述</span>
            <button
              type="button"
              className={`${BUTTON} ml-auto`}
              disabled={isReadonly || busy}
              onClick={() => void generateCreativeOnly()}
            >
              {status === 'creative' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              生成创意
            </button>
          </div>
          <div data-exhibition-compact-item="insert-options" className="grid grid-cols-2 gap-1">
            <select
              className={FIELD}
              disabled={isReadonly || busy}
              value={`llm-key:${activeLlmConfig?.id || 'default'}`}
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId.startsWith('llm-key:')) update({ llmKeyId: nextId.slice(8), llmModel: '' });
              }}
            >
              {llmConfigOptions.map((item) => <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
            </select>
            <PromptExpandableInput title="扩大编辑" className={FIELD} disabled value={llmModel} />
          </div>
          <div data-exhibition-compact-item="prompt-constraints" className="space-y-1.5 rounded border border-cyan-300/15 bg-cyan-300/[0.05] p-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-cyan-100">提示词创作约束</span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-white/40">
                可多选，也可以不选；所选约束会用于每次 LLM 创意描述
              </span>
              {selectedConstraintIds.length > 0 && (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={isReadonly || busy}
                  onClick={() => update({ promptConstraintIds: [] })}
                >
                  清空
                </button>
              )}
              {canManageConstraints && (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => {
                    setConstraintError('');
                    setConstraintEditorOpen(true);
                  }}
                >
                  编辑预设
                </button>
              )}
            </div>
            {constraintPresets.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {constraintPresets.map((item) => {
                  const active = selectedConstraintIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.text}
                      disabled={isReadonly || busy}
                      aria-pressed={active}
                      className={`rounded border px-1.5 py-1 text-[10px] transition ${
                        active
                          ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100'
                          : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                      onClick={() => togglePromptConstraint(item.id)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[9px] text-white/35">暂未加载到约束预设，不影响创意生成。</div>
            )}
          </div>
          {canManageConstraints && (
            <PromptConstraintPresetEditorModal
              open={constraintEditorOpen}
              presets={constraintPresets}
              saving={constraintSaving}
              error={constraintError}
              onClose={() => setConstraintEditorOpen(false)}
              onSave={saveConstraintPresets}
            />
          )}
          <MentionPromptInput
            title="扩大编辑"
            className={`${FIELD} min-h-[132px] resize-y`}
            value={creativeBrief}
            mentions={creativeBriefMentions}
            materials={mentionMaterials}
            disabled={isReadonly || busy}
            isDark
            isPixel={false}
            promptTemplateKind="image"
            placeholder="点击生成创意，或在这里手动微调 LLM 创意描述"
            onChange={(value, mentions) => update({ creativeBrief: value, creativeBriefMentions: mentions })}
          />
          <label data-exhibition-compact-item="random-count" className="flex items-center gap-1.5 text-[10px] text-white/60">
            <input
              type="checkbox"
              className="h-3 w-3 accent-cyan-300"
              checked={regenerateEachTime}
              disabled={isReadonly || busy}
              onChange={(event) => update({ regenerateEachTime: event.target.checked })}
            />
            每次生图前重新用 LLM 创意
          </label>
        </section>

        <section data-exhibition-compact-section="color-material" data-exhibition-compact-item="preset-options" className="space-y-1.5 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="text-[11px] font-semibold text-cyan-100">图像名称</div>
          <PromptExpandableInput
            title="扩大编辑"
            className={FIELD}
            value={imageName}
            disabled={isReadonly || busy}
            maxLength={12}
            placeholder="最多6字"
            onValueChange={(value) => update({ imageName: normalizeExhibitionImageName(value) })}
          />
          <div className="text-[9px] leading-snug text-white/35">为空时，LLM 提炼文本后自动生成；批量输出会追加 -1、-2。</div>
        </section>

        <section data-exhibition-compact-section="content" className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2" data-exhibition-compact-item="text-fields">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-cyan-100">植入项</span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-white/40">
                写入“需要在该空间内植入...”提示词
              </span>
              {canManageTeam && (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => setInsertEditorOpen((open) => !open)}
                >
                  {insertEditorOpen ? '收起' : '编辑'}
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="text-[9px] leading-snug text-white/35">随机数量会在每次运行时从该分类未手动选中的植入项中补选；-1 表示补入全部未选项，不改变当前勾选状态。</div>
              {insertGroups.map((group) => (
                <div key={group.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[9px] font-semibold text-white/40">{group.category}</div>
                    <label className="flex items-center gap-1 text-[9px] text-white/40">
                      随机
                      <input
                        className="h-5 w-11 rounded border border-white/10 bg-black/20 px-1 text-center text-[10px] text-white/70 outline-none focus:border-cyan-300/60 disabled:opacity-45"
                        type="number"
                        min={-1}
                        max={Math.max(0, group.items.length - selectedInsertIds.filter((itemId) => group.items.some((item) => item.id === itemId)).length)}
                        step={1}
                        value={insertRandomCounts[group.category] || 0}
                        disabled={isReadonly || busy}
                        onChange={(event) => setInsertRandomCount(group.category, event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map((item) => {
                      const active = selectedInsertIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isReadonly || busy}
                          className={`rounded border px-1.5 py-1 text-[10px] ${
                            active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                          } disabled:opacity-50`}
                          onClick={() => toggleInsertItem(item.id)}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {canManageTeam && insertEditorOpen && (
              <div className="space-y-1.5 rounded border border-cyan-300/15 bg-cyan-300/5 p-2">
                <PromptTextarea compact title="扩大编辑"
                  editorKind="lines"
                  className={`${FIELD} min-h-[92px] resize-y`}
                  value={insertEditorValue}
                  disabled={insertSaving || busy}
                  placeholder="每行一个植入项：分类｜名称；分类可用：装饰、多媒体、艺术品、展陈、展柜、展台、顶部、其它"
                  onValueChange={(value) => setInsertEditorValue(value)}
                readOnly={insertSaving || busy}
              />
                {insertError && <div className="text-[10px] text-red-200">{insertError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={insertSaving || busy}
                    onClick={() => setInsertEditorOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={insertSaving || busy}
                    onClick={() => void saveInsertPresets()}
                  >
                    {insertSaving ? '保存中' : '保存'}
                  </button>
                </div>
              </div>
            )}
        </section>

        <section data-exhibition-compact-section="model" className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2" data-exhibition-compact-item="actions">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-cyan-100">视角控制</span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-white/40">
                融入第一句话，1 项控视角，多项生成多视图
              </span>
              <label className="flex items-center gap-1 text-[10px] text-white/60">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-cyan-300"
                  checked={viewControlEnabled}
                  disabled={isReadonly || busy}
                  onChange={(event) => toggleViewControl(event.target.checked)}
                />
                启用
              </label>
              {canManageTeam && (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => setViewAngleEditorOpen((open) => !open)}
                >
                  {viewAngleEditorOpen ? '收起' : '编辑'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {viewAngleOptions.map((item) => {
                const active = selectedViewAngleIds.includes(item.id);
                const disabled = isReadonly || busy || !viewControlEnabled;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    className={`rounded border px-1.5 py-1 text-[10px] ${
                      active ? 'border-emerald-300/55 bg-emerald-300/15 text-emerald-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                    } disabled:opacity-45`}
                    onClick={() => toggleViewAngle(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {canManageTeam && viewAngleEditorOpen && (
              <div className="space-y-1.5 rounded border border-emerald-300/15 bg-emerald-300/5 p-2">
                <PromptTextarea compact title="扩大编辑"
                  editorKind="lines"
                  className={`${FIELD} min-h-[92px] resize-y`}
                  value={viewAngleEditorValue}
                  disabled={viewAngleSaving || busy}
                  placeholder="每行一个视角项，例如：正视角"
                  onValueChange={(value) => setViewAngleEditorValue(value)}
                readOnly={viewAngleSaving || busy}
              />
                {viewAngleError && <div className="text-[10px] text-red-200">{viewAngleError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={viewAngleSaving || busy}
                    onClick={() => setViewAngleEditorOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={viewAngleSaving || busy}
                    onClick={() => void saveViewAnglePresets()}
                  >
                    {viewAngleSaving ? '保存中' : '保存'}
                  </button>
                </div>
              </div>
            )}
        </section>

        <section data-exhibition-compact-section="prompt" className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2" data-exhibition-compact-item="prompt-preview">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-cyan-100">排除项</span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-white/40">
                优先于 LLM 创意描述，强调不要出现
              </span>
              <button
                type="button"
                className={BUTTON}
                disabled={isReadonly || busy || excludeOptions.length === 0}
                onClick={() => void toggleAllExcludeItems()}
              >
                {allExcludeSelected ? '清空' : '全选'}
              </button>
              {canManageTeam && (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => setExcludeEditorOpen((open) => !open)}
                >
                  {excludeEditorOpen ? '收起' : '编辑'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {excludeOptions.map((item) => {
                const active = selectedExcludeIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isReadonly || busy}
                    className={`rounded border px-1.5 py-1 text-[10px] ${
                      active ? 'border-rose-300/55 bg-rose-300/15 text-rose-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                    } disabled:opacity-50`}
                    onClick={() => toggleExcludeItem(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {canManageTeam && excludeEditorOpen && (
              <div className="space-y-1.5 rounded border border-rose-300/15 bg-rose-300/5 p-2">
                <PromptTextarea compact title="扩大编辑"
                  editorKind="lines"
                  className={`${FIELD} min-h-[92px] resize-y`}
                  value={excludeEditorValue}
                  disabled={excludeSaving || busy}
                  placeholder="每行一个排除项，例如：真实品牌标识"
                  onValueChange={(value) => setExcludeEditorValue(value)}
                readOnly={excludeSaving || busy}
              />
                {excludeError && <div className="text-[10px] text-red-200">{excludeError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={excludeSaving || busy}
                    onClick={() => setExcludeEditorOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={excludeSaving || busy}
                    onClick={() => void saveExcludePresets()}
                  >
                    {excludeSaving ? '保存中' : '保存'}
                  </button>
                </div>
              </div>
            )}
        </section>

        <section data-exhibition-compact-section="result" className="rounded border border-white/10 bg-white/[0.035] p-2 space-y-2" data-exhibition-compact-item="preview">
          <div className="text-[11px] font-semibold text-cyan-100">模型与输出</div>
          {imageAdvancedProviders.length > 0 && (
            <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-2">
              <button
                type="button"
                onClick={() => update({ advancedProviderOpen: !d.advancedProviderOpen })}
                className="flex w-full items-center justify-between text-[10px] font-semibold text-white/70 hover:text-white"
              >
                <span>高级来源</span>
                <span>{isExternalSelected && providerSelection.provider ? providerSelection.provider.label : (allowZhenzhenFallback ? '默认百达工坊' : '请选择扩展平台')}</span>
              </button>
              {d.advancedProviderOpen && (
                <div className="space-y-2">
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
                    className={FIELD}
                  >
                    {allowZhenzhenFallback && <option value="zhenzhen">百达工坊（默认）</option>}
                    {imageAdvancedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
                  </select>
                  {isExternalSelected && providerSelection.provider && (
                    <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy} onChange={(event) => update({ providerModel: event.target.value })}>
                      {externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  )}
                  {savedExternalMissing && (
                    <div className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                      当前画布记录的扩展平台未启用或不存在，已临时回到默认来源。
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isExternalSelected && (
            <div>
              <label className="mb-1 block text-[10px] text-white/50">模型</label>
              <div
                className={`flex gap-0.5 rounded p-0.5 ${isPixel ? '' : 'bg-white/5'}`}
                style={isPixel ? { background: 'var(--px-muted)', border: '1.5px solid var(--px-ink)' } : undefined}
              >
                {availableModelDefs.map((item) => {
                  const active = item.id === model;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isReadonly || busy}
                      onClick={() => update({ model: item.id, apiModel: item.apiModel, aspectRatio: item.defaultAspectRatio, sizeLevel: item.defaultSize || '2K' })}
                      title={item.description}
                      className={`flex-1 rounded py-1 text-[10px] font-semibold transition-all ${active ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {item.tabLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isExternalSelected && (
            <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(event) => update({ apiModel: event.target.value })}>
              {modelDef.apiModelOptions
                .filter((item) => !item.value.includes('-fal'))
                .map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          )}

          <div className="grid grid-cols-2 gap-1">
            <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
              {(modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
              {(isExternalSelected ? EXTERNAL_SIZE_LEVELS : (modelDef.sizes.length ? modelDef.sizes : EXTERNAL_SIZE_LEVELS)).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(event) => update({ outputFormat: event.target.value })}>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
            </select>
            <input
              className={FIELD}
              type="number"
              min={0}
              step={1}
              value={seed}
              disabled={isReadonly || busy}
              placeholder="Seed"
              title="多张生成时每张会自动记录随机 Seed；单张可使用指定 Seed"
              onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[10px] text-white/60">
              <span>生图数量</span>
              <input
                className="h-7 w-16 rounded border border-white/10 bg-black/20 px-2 text-center text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55"
                type="number"
                min={MIN_GENERATION_COUNT}
                max={MAX_GENERATION_COUNT}
                step={1}
                value={generationCount}
                disabled={isReadonly || busy}
                onChange={(event) => update({ generationCount: normalizeExhibitionCreativeCount(event.target.value) })}
              />
            </div>
            <input
              type="range"
              min={MIN_GENERATION_COUNT}
              max={MAX_GENERATION_COUNT}
              step={1}
              value={generationCount}
              disabled={isReadonly || busy}
              className="h-1 w-full accent-cyan-300"
              onChange={(event) => update({ generationCount: normalizeExhibitionCreativeCount(event.target.value) })}
            />
          </div>
        </section>

        <section data-exhibition-compact-section="result" data-exhibition-compact-item="prompt-output" className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
            <Clipboard size={13} />
            <span>当前生图 Prompt</span>
            <button type="button" className="ml-auto flex h-6 items-center gap-1 rounded border border-white/10 px-2 text-[10px] text-white/65 hover:bg-white/10" onClick={() => navigator.clipboard?.writeText(previewPrompt).catch(() => {})}>
              复制
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">{previewPrompt}</div>
        </section>

        {creativeResults.length > 0 && (
          <section className="col-span-2 rounded border border-white/10 bg-white/[0.035] p-2">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
              <CheckCircle2 size={13} />
              <span>生成结果</span>
              <span className="ml-auto text-[10px] font-normal text-white/45">{creativeResults.length} 张</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {creativeResults.map((item) => (
                <div key={`${item.index}:${item.imageUrl}`} className="rounded border border-white/10 bg-black/20 p-1.5">
                  <img src={item.imageUrl} alt="" className="h-32 w-full rounded border border-white/10 object-contain" draggable={false} />
                  <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-white/45">
                    <span className="truncate text-cyan-100" title={item.name || outputImageNames[item.index - 1] || `#${item.index}`}>
                      {item.name || outputImageNames[item.index - 1] || `#${item.index}`}
                    </span>
                    <span>Seed {item.seed || '-'}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[9px] leading-snug text-white/55" title={item.brief}>{item.brief}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        </div>

        <button
          type="button"
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-cyan-300/30 bg-cyan-300/15 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isReadonly || busy || (!spaceImage && !hasManualSpaceSize)}
          onClick={() => void runGenerate()}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {isGenerating ? `生成中 ${d.progress || ''}` : status === 'creative' ? '创意描述中' : `生成 ${generationCount} 张创意方案`}
        </button>
        {!spaceImage && (
          <div className="col-span-2 text-[10px] text-white/35">
            未连接空间图时，需要填写完整的宽度、进深和高度。
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ExhibitionCreativeImageNode);
