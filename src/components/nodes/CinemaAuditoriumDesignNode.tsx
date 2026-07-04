import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Loader2, Maximize2, Play, Settings2, Theater, X } from 'lucide-react';
import { EXHIBITION_COLOR_MATERIAL_REFERENCE_COLOR, EXHIBITION_IMAGE_HANDLE_COLOR, EXHIBITION_TEXT_HANDLE_COLOR } from '../../config/portTypes';
import { IMAGE_MODELS } from '../../providers/models';
import { getElevationPromptPresets, type ElevationColorMaterialPresetItem } from '../../services/api';
import { generateExternalImage, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import { uploadDataUrl } from '../../services/imageOps';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  buildCinemaAuditoriumDrawingPrompt,
  buildCinemaAuditoriumImagePrompt,
  buildCinemaAuditoriumSummary,
  cinemaOutputTypeMeta,
  colorMaterialTextFromCinemaPreset,
  normalizeCinemaAisleMode,
  normalizeCinemaAudioSystem,
  normalizeCinemaDimensions,
  normalizeCinemaOutputSelection,
  normalizeCinemaScreenStageSide,
  normalizeCinemaScreenType,
  normalizeCinemaMainScreenKind,
  normalizeCinemaSlopeMode,
  normalizeCinemaSpecialEffects,
  normalizeCinemaVenueType,
  CINEMA_AISLE_MODES,
  CINEMA_AUDIO_SYSTEMS,
  CINEMA_AUDITORIUM_OUTPUT_TYPES,
  CINEMA_AUDITORIUM_VENUE_TYPES,
  CINEMA_SCREEN_STAGE_SIDES,
  CINEMA_SCREEN_TYPES,
  CINEMA_MAIN_SCREEN_KINDS,
  CINEMA_SLOPE_MODES,
  CINEMA_SPECIAL_EFFECTS,
  type CinemaAuditoriumOutputType,
  type CinemaAuditoriumResult,
} from '../../utils/cinemaAuditoriumDesignPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import ColorMaterialPresetSelect from './ColorMaterialPresetSelect';
import MentionPromptInput from './MentionPromptInput';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const INTERNAL_IMAGE_MAX_POLLS = 300;
const INTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const OUTPUT_ORDER: CinemaAuditoriumOutputType[] = ['color-plan', 'render', 'system-principle'];

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

function textFromData(data: any): string {
  return String(data?.outputText || data?.text || data?.prompt || '').trim();
}

function useHandleImages(nodeId: string, handle: string): string[] {
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
    const out: string[] = [];
    const list = Array.isArray(nodesData) ? nodesData : [nodesData];
    for (const node of list) {
      imagesFromData((node as any)?.data || {}).forEach((url) => {
        if (url && !out.includes(url)) out.push(url);
      });
    }
    return out;
  }, [nodesData]);
}

function useHandleTexts(nodeId: string, handle: string): string[] {
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
    const out: string[] = [];
    const list = Array.isArray(nodesData) ? nodesData : [nodesData];
    for (const node of list) {
      const text = textFromData((node as any)?.data || {});
      if (text) out.push(text);
    }
    return out;
  }, [nodesData]);
}

function outputLabel(kind: CinemaAuditoriumOutputType): string {
  return cinemaOutputTypeMeta(kind).label;
}

function positiveNumber(value: unknown, fallback: number, min = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function normalizeLayoutMm(value: unknown, fallback: number, min = 0): number {
  return Math.max(min, Math.round(positiveNumber(value, fallback, min)));
}

function splitSeatBanks(totalSeats: number, bankCount: number): number[] {
  const seats = Math.max(0, Math.round(totalSeats));
  const count = Math.max(1, bankCount);
  const base = Math.floor(seats / count);
  const remainder = seats % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function fitSeatGrid(count: number, bankW: number, bankH: number, seatW: number, seatD: number, seatGap: number, rowSpacing: number) {
  const colPitch = Math.max(1, seatW + seatGap);
  const rowPitch = Math.max(1, rowSpacing);
  const maxCols = Math.max(1, Math.floor((bankW + seatGap) / colPitch));
  const maxRows = Math.max(1, Math.floor((bankH + Math.max(0, rowPitch - seatD)) / rowPitch));
  const idealCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count) * (bankW / Math.max(1, bankH)))));
  let cols = Math.max(1, Math.min(maxCols, idealCols || maxCols));
  let rows = Math.max(1, Math.ceil(Math.max(1, count) / cols));
  if (rows > maxRows && maxRows > 0) {
    cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.max(1, count) / maxRows)));
    rows = Math.max(1, Math.ceil(Math.max(1, count) / cols));
  }
  return { cols, rows };
}

function buildCinemaColorPlanReferenceDataUrl(params: {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  screenStageSide: string;
  seatCount: number;
  aisleMode: string;
  venueType: string;
  seatWidthMm?: number;
  seatDepthMm?: number;
  seatGapMm?: number;
  rowSpacingMm?: number;
  frontClearanceMm?: number;
  sideAisleWidthMm?: number;
  centerAisleWidthMm?: number;
}): string {
  const lengthMm = Math.max(3000, params.lengthMm || 24000);
  const widthMm = Math.max(3000, params.widthMm || 16000);
  const seatWidthMm = normalizeLayoutMm(params.seatWidthMm, 550, 250);
  const seatDepthMm = normalizeLayoutMm(params.seatDepthMm, 600, 250);
  const seatGapMm = normalizeLayoutMm(params.seatGapMm, 80, 0);
  const rowSpacingMm = normalizeLayoutMm(params.rowSpacingMm, 900, seatDepthMm);
  const frontClearanceMm = normalizeLayoutMm(params.frontClearanceMm, 1600, 0);
  const sideAisleWidthMm = normalizeLayoutMm(params.sideAisleWidthMm, 1200, 0);
  const centerAisleWidthMm = normalizeLayoutMm(params.centerAisleWidthMm, 1200, 0);
  const side = normalizeCinemaScreenStageSide(params.screenStageSide);
  const isHorizontalStage = side === 'north' || side === 'south';
  const planW = isHorizontalStage ? widthMm : lengthMm;
  const planH = isHorizontalStage ? lengthMm : widthMm;
  const maxSide = 1400;
  const scale = Math.min(maxSide / planW, maxSide / planH);
  const canvasW = Math.round(planW * scale) + 120;
  const canvasH = Math.round(planH * scale) + 120;
  const x0 = 60;
  const y0 = 60;
  const w = Math.round(planW * scale);
  const h = Math.round(planH * scale);
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#fff7ed';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeRect(x0, y0, w, h);

  const stageDepth = Math.max(42, Math.round((isHorizontalStage ? h : w) * 0.16));
  const controlDepth = Math.max(32, Math.round((isHorizontalStage ? h : w) * 0.08));
  let stage = { x: x0, y: y0, w, h: stageDepth };
  let control = { x: x0, y: y0 + h - controlDepth, w, h: controlDepth };
  if (side === 'south') {
    stage = { x: x0, y: y0 + h - stageDepth, w, h: stageDepth };
    control = { x: x0, y: y0, w, h: controlDepth };
  } else if (side === 'east') {
    stage = { x: x0 + w - stageDepth, y: y0, w: stageDepth, h };
    control = { x: x0, y: y0, w: controlDepth, h };
  } else if (side === 'west') {
    stage = { x: x0, y: y0, w: stageDepth, h };
    control = { x: x0 + w - controlDepth, y: y0, w: controlDepth, h };
  }
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
  ctx.fillStyle = '#0369a1';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('银幕/舞台区', stage.x + 12, stage.y + Math.min(34, stage.h - 8));

  ctx.fillStyle = '#c4b5fd';
  ctx.fillRect(control.x, control.y, control.w, control.h);
  ctx.fillStyle = '#4c1d95';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('控制室/机房', control.x + 12, control.y + Math.min(28, control.h - 6));

  const seatArea = {
    x: Math.min(stage.x + stage.w, control.x + control.w, x0 + w) === x0 + w ? x0 + stageDepth : x0 + 22,
    y: y0 + 22,
    w: w - 44,
    h: h - 44,
  };
  if (side === 'north') {
    seatArea.y = stage.y + stage.h + 22;
    seatArea.h = control.y - seatArea.y - 18;
  } else if (side === 'south') {
    seatArea.y = control.y + control.h + 18;
    seatArea.h = stage.y - seatArea.y - 22;
  } else if (side === 'east') {
    seatArea.x = control.x + control.w + 18;
    seatArea.w = stage.x - seatArea.x - 22;
  } else if (side === 'west') {
    seatArea.x = stage.x + stage.w + 22;
    seatArea.w = control.x - seatArea.x - 18;
  }
  ctx.fillStyle = '#dcfce7';
  ctx.fillRect(seatArea.x, seatArea.y, seatArea.w, seatArea.h);
  ctx.fillStyle = '#166534';
  ctx.font = 'bold 20px sans-serif';
  const totalSeats = Math.max(0, Math.round(params.seatCount || 0));
  const effectiveSeats = totalSeats || 120;
  const bankCount = params.aisleMode === 'center-and-side' || params.aisleMode === 'center-only' || params.aisleMode === 'cross-aisle' ? 2 : 1;
  const bankSeats = splitSeatBanks(effectiveSeats, bankCount);
  ctx.fillText(`观众席 总计${effectiveSeats}座${bankCount === 2 ? `（${bankSeats[0]}+${bankSeats[1]}）` : ''}`, seatArea.x + 12, seatArea.y + 30);

  const drawSeatBank = (bankX: number, bankY: number, bankW: number, bankH: number, count: number, label: string) => {
    if (count <= 0 || bankW <= 20 || bankH <= 36) return;
    const grid = fitSeatGrid(count, bankW / scale, Math.max(1, bankH - 24) / scale, seatWidthMm, seatDepthMm, seatGapMm, rowSpacingMm);
    const cols = grid.cols;
    const rows = grid.rows;
    const naturalSeatW = Math.max(4, seatWidthMm * scale);
    const naturalSeatH = Math.max(4, seatDepthMm * scale);
    const naturalColGap = Math.max(2, seatGapMm * scale);
    const naturalRowPitch = Math.max(naturalSeatH + 2, rowSpacingMm * scale);
    const naturalGridW = cols * naturalSeatW + (cols - 1) * naturalColGap;
    const naturalGridH = rows > 1 ? (rows - 1) * naturalRowPitch + naturalSeatH : naturalSeatH;
    const fitScale = Math.min(1, bankW / Math.max(1, naturalGridW), Math.max(1, bankH - 24) / Math.max(1, naturalGridH));
    const seatW = Math.max(3, naturalSeatW * fitScale);
    const seatH = Math.max(3, naturalSeatH * fitScale);
    const colGap = Math.max(1, naturalColGap * fitScale);
    const rowPitch = Math.max(seatH + 1, naturalRowPitch * fitScale);
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${label} ${count}座 / ${rows}排`, bankX, bankY + 14);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    const totalGridW = cols * seatW + (cols - 1) * colGap;
    const totalGridH = rows > 1 ? (rows - 1) * rowPitch + seatH : seatH;
    const startX = bankX + Math.max(0, (bankW - totalGridW) / 2);
    const startY = bankY + 24 + Math.max(0, (bankH - 24 - totalGridH) / 2);
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const x = startX + col * (seatW + colGap);
      const y = startY + row * rowPitch;
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(x, y, seatW, seatH);
      ctx.strokeRect(x, y, seatW, seatH);
    }
  };
  const bankTop = seatArea.y + 48 + frontClearanceMm * scale;
  const sideAislePx = sideAisleWidthMm * scale;
  const centerAislePx = centerAisleWidthMm * scale;
  const bankHeight = Math.max(40, seatArea.h - 62 - frontClearanceMm * scale);
  if (bankCount === 2) {
    const bankGap = Math.max(16, centerAislePx);
    if (isHorizontalStage) {
      const bankW = (seatArea.w - bankGap - sideAislePx * 2) / 2;
      drawSeatBank(seatArea.x + sideAislePx, bankTop, bankW, bankHeight, bankSeats[0], '左区');
      drawSeatBank(seatArea.x + sideAislePx + bankW + bankGap, bankTop, bankW, bankHeight, bankSeats[1], '右区');
    } else {
      const bankH = (seatArea.h - bankGap - 62 - frontClearanceMm * scale - sideAislePx * 2) / 2;
      drawSeatBank(seatArea.x + sideAislePx, bankTop, seatArea.w - sideAislePx * 2, bankH, bankSeats[0], '前区');
      drawSeatBank(seatArea.x + sideAislePx, bankTop + bankH + bankGap, seatArea.w - sideAislePx * 2, bankH, bankSeats[1], '后区');
    }
  } else {
    drawSeatBank(seatArea.x + sideAislePx, bankTop, seatArea.w - sideAislePx * 2, bankHeight, effectiveSeats, '全区');
  }

  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 8;
  ctx.setLineDash([18, 12]);
  if (params.aisleMode === 'center-only' || params.aisleMode === 'center-and-side' || params.aisleMode === 'cross-aisle') {
    if (isHorizontalStage) {
      const cx = seatArea.x + seatArea.w / 2;
      ctx.beginPath();
      ctx.moveTo(cx, seatArea.y + 42);
      ctx.lineTo(cx, seatArea.y + seatArea.h - 8);
      ctx.stroke();
    } else {
      const cy = seatArea.y + seatArea.h / 2;
      ctx.beginPath();
      ctx.moveTo(seatArea.x + 42, cy);
      ctx.lineTo(seatArea.x + seatArea.w - 8, cy);
      ctx.stroke();
    }
  }
  if (params.aisleMode === 'cross-aisle') {
    if (isHorizontalStage) {
      const cy = seatArea.y + seatArea.h * 0.58;
      ctx.beginPath();
      ctx.moveTo(seatArea.x + 8, cy);
      ctx.lineTo(seatArea.x + seatArea.w - 8, cy);
      ctx.stroke();
    } else {
      const cx = seatArea.x + seatArea.w * 0.58;
      ctx.beginPath();
      ctx.moveTo(cx, seatArea.y + 8);
      ctx.lineTo(cx, seatArea.y + seatArea.h - 8);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  ctx.fillStyle = '#fde68a';
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2;
  const equipment = side === 'north' || side === 'south'
    ? { x: x0 + w - 150, y: y0 + h / 2 - 42, w: 120, h: 84 }
    : { x: x0 + w / 2 - 60, y: y0 + h - 116, w: 120, h: 84 };
  ctx.fillRect(equipment.x, equipment.y, equipment.w, equipment.h);
  ctx.strokeRect(equipment.x, equipment.y, equipment.w, equipment.h);
  ctx.fillStyle = '#92400e';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('设备区', equipment.x + 20, equipment.y + 48);

  ctx.fillStyle = '#0f172a';
  ctx.font = '16px sans-serif';
  ctx.fillText(`比例底图 ${lengthMm} x ${widthMm} x ${Math.max(2500, Math.round(params.heightMm || 0))} mm`, 60, canvasH - 30);
  ctx.fillText(`方向：${CINEMA_SCREEN_STAGE_SIDES.find((item) => item.id === side)?.label || side}`, canvasW - 250, canvasH - 30);
  ctx.fillText(`座椅 ${seatWidthMm}x${seatDepthMm}mm / 行距${rowSpacingMm}mm / 走道${sideAisleWidthMm}/${centerAisleWidthMm}mm`, 60, canvasH - 10);
  return canvas.toDataURL('image/png');
}

function CinemaPlanLayoutModal({
  open,
  params,
  onClose,
}: {
  open: boolean;
  params: Parameters<typeof buildCinemaColorPlanReferenceDataUrl>[0];
  onClose: () => void;
}) {
  const previewUrl = useMemo(() => {
    if (!open || typeof document === 'undefined') return '';
    return buildCinemaColorPlanReferenceDataUrl(params);
  }, [open, params]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10035] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm nodrag nopan" onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/12 bg-zinc-950 text-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-cyan-100">影院报告厅平面布局</div>
            <div className="text-[10px] text-white/45">
              {params.lengthMm} x {params.widthMm} x {params.heightMm} mm / {params.seatCount || 120} 座 / 座椅 {params.seatWidthMm || 550} x {params.seatDepthMm || 600} mm / 行距 {params.rowSpacingMm || 900} mm
            </div>
          </div>
          <button type="button" className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white" onClick={onClose} title="关闭"><X size={16} /></button>
        </header>
        <main className="min-h-0 overflow-auto bg-slate-950/70 p-4">
          <div className="flex min-h-[60vh] items-center justify-center">
            {previewUrl ? (
              <img src={previewUrl} className="max-h-[72vh] max-w-full rounded-lg border border-cyan-300/30 bg-white object-contain shadow-2xl" alt="影院报告厅平面布局预览" />
            ) : (
              <div className="rounded border border-dashed border-white/20 px-4 py-6 text-sm text-white/50">无法生成平面布局预览</div>
            )}
          </div>
        </main>
      </section>
    </div>,
    document.body,
  );
}

const CinemaAuditoriumDesignNode = memo((p: NodeProps) => {
  const id = p.id;
  const d: any = p.data || {};
  const update = useUpdateNodeData(id);
  const abortRef = useRef(false);
  const { canvases, activeId } = useCanvasStore();
  const activeCanvas = canvases.find((canvas) => canvas.id === activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const settings = useApiKeysStore((s) => s.settings);
  const advancedProviders = useApiKeysStore((s) => s.settings.advancedProviders || []);
  const imageAdvancedProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);
  const [planLayoutOpen, setPlanLayoutOpen] = useState(false);

  const dimensions = normalizeCinemaDimensions(d.dimensions);
  const seatWidthMm = normalizeLayoutMm(d.seatWidthMm, 550, 250);
  const seatDepthMm = normalizeLayoutMm(d.seatDepthMm, 600, 250);
  const seatGapMm = normalizeLayoutMm(d.seatGapMm, 80, 0);
  const rowSpacingMm = normalizeLayoutMm(d.rowSpacingMm, 900, seatDepthMm);
  const frontClearanceMm = normalizeLayoutMm(d.frontClearanceMm, 1600, 0);
  const sideAisleWidthMm = normalizeLayoutMm(d.sideAisleWidthMm, 1200, 0);
  const centerAisleWidthMm = normalizeLayoutMm(d.centerAisleWidthMm, 1200, 0);
  const venueType = normalizeCinemaVenueType(d.venueType);
  const screenStageSide = normalizeCinemaScreenStageSide(d.screenStageSide);
  const aisleMode = normalizeCinemaAisleMode(d.aisleMode);
  const slopeMode = normalizeCinemaSlopeMode(d.slopeMode);
  const screenType = normalizeCinemaScreenType(d.screenType);
  const mainScreenKind = normalizeCinemaMainScreenKind(d.mainScreenKind);
  const audioSystem = normalizeCinemaAudioSystem(d.audioSystem);
  const specialEffects = normalizeCinemaSpecialEffects(d.specialEffects);
  const outputSelection = normalizeCinemaOutputSelection(d.outputSelection);
  const selectedOutputSet = useMemo(() => new Set(outputSelection), [outputSelection]);
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const aspectRatio = d.aspectRatio || '16:9';
  const sizeLevel = d.sizeLevel || '2K';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const modelDef = IMAGE_MODELS.find((item) => item.id === (d.model || 'gpt-image-2')) || IMAGE_MODELS[0];
  const apiModel = d.apiModel || modelDef.apiModel;
  const providerSelection = resolveAdvancedProviderSelection(advancedProviders, 'image', { providerSource: d.providerSource, providerId: d.providerId, providerModel: d.providerModel });
  const isExternalSelected = providerSelection.providerSource !== 'zhenzhen';
  const allowZhenzhenFallback = !!settings?.zhenzhenApiKey || !isExternalSelected;
  const externalModelOptions = providerSelection.provider ? advancedProviderModelOptions(providerSelection.provider, 'image') : [];
  const externalProviderModel = d.providerModel || externalModelOptions[0] || '';
  const providerSelectValue = isExternalSelected && providerSelection.provider ? `advanced:${providerSelection.provider.id}` : 'zhenzhen';
  const busy = String(d.status || '') !== '' && !['idle', 'success', 'error'].includes(String(d.status || 'idle'));

  const upstreamTexts = useHandleTexts(id, 'text');
  const spaceReferenceImages = useHandleImages(id, 'space-reference');
  const colorMaterialReferenceImages = useHandleImages(id, 'color-material-reference');
  const equipmentReferenceImages = useHandleImages(id, 'equipment-reference');

  const mentionMaterials = useMemo(() => {
    const urls = [...spaceReferenceImages, ...colorMaterialReferenceImages, ...equipmentReferenceImages];
    return urls.map((url, index) => ({
      id: `cinema-ref-${index}-${url}`,
      kind: 'image' as const,
      url,
      label: `参考图 ${index + 1}`,
      sourceNodeId: id,
      origin: 'upstream' as const,
    }));
  }, [colorMaterialReferenceImages, equipmentReferenceImages, spaceReferenceImages]);
  const supplementMentions: MediaMention[] = Array.isArray(d.supplementMentions) ? d.supplementMentions : [];
  const resolvedSupplement = resolveMediaMentions(String(d.supplement || ''), supplementMentions, mentionMaterials);
  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );
  const colorMaterialPresetText = colorMaterialTextFromCinemaPreset(selectedColorMaterialPreset);
  const sourceText = [d.sourceText, ...upstreamTexts].map((item) => String(item || '').trim()).filter(Boolean).join('\n\n');
  const summaryText = useMemo(() => buildCinemaAuditoriumSummary({
    dimensions,
    venueType,
    screenStageSide,
    capacityMode: d.capacityMode,
    seatCount: d.seatCount,
    aisleMode,
    seatWidthMm,
    seatDepthMm,
    seatGapMm,
    rowSpacingMm,
    frontClearanceMm,
    sideAisleWidthMm,
    centerAisleWidthMm,
    slopeMode,
    screenType,
    mainScreenKind,
    audioSystem,
    specialEffects,
    colorMaterialPresetText,
    colorMaterial: d.colorMaterial,
    colorMaterialReferenceTone: d.colorMaterialReferenceTone,
    supplement: resolvedSupplement,
  }), [audioSystem, aisleMode, centerAisleWidthMm, colorMaterialPresetText, d.capacityMode, d.colorMaterial, d.colorMaterialReferenceTone, d.seatCount, dimensions, frontClearanceMm, mainScreenKind, resolvedSupplement, rowSpacingMm, screenStageSide, screenType, seatDepthMm, seatGapMm, seatWidthMm, sideAisleWidthMm, slopeMode, specialEffects, venueType]);

  useEffect(() => {
    getElevationPromptPresets().then((presets) => setColorMaterialPresets(presets.colorMaterial || [])).catch(() => setColorMaterialPresets([]));
  }, []);

  useEffect(() => {
    if (d.prompt !== summaryText || d.outputText !== summaryText || d.text !== summaryText) {
      update({ prompt: summaryText, outputText: summaryText, text: summaryText, referenceImages: [...spaceReferenceImages, ...colorMaterialReferenceImages, ...equipmentReferenceImages] });
    }
  }, [colorMaterialReferenceImages, d.outputText, d.prompt, d.text, equipmentReferenceImages, spaceReferenceImages, summaryText, update]);

  const generateOneImage = useCallback(async ({
    kind,
    prompt,
    images,
    runSeed,
  }: {
    kind: CinemaAuditoriumOutputType;
    prompt: string;
    images: string[];
    runSeed: number;
  }) => {
    const outputTitle = outputLabel(kind);
    const historyContext = {
      canvasId: activeId,
      sourceNodeId: id,
      sourceNodeType: 'cinema-auditorium-design',
      seed: runSeed,
      nodeTitle: `影院报告厅设计 ${outputTitle}`,
      outputTitle,
    };
    let urls: string[] = [];
    let taskId = '';
    if (isExternalSelected && providerSelection.provider) {
      if (!externalProviderModel) throw new Error('扩展平台未配置可用图像模型');
      const size = externalImageSizeFor(aspectRatio, sizeLevel);
      let res = await generateExternalImage({
        providerId: providerSelection.provider.id,
        providerModel: externalProviderModel,
        model: externalProviderModel,
        prompt,
        size,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images,
        outputFormat,
        seed: runSeed,
        n: 1,
        providerParams: {
          ...(d.providerParams || {}),
          aspect_ratio: aspectRatio,
          aspectRatio,
          image_size: sizeLevel,
          imageSize: sizeLevel,
        },
        historyContext,
        async: true,
      });
      if (res.taskId && !res.imageUrls?.length && (res.code === 'running' || res.status === 'running')) {
        taskId = res.taskId;
        for (let index = 0; index < EXTERNAL_IMAGE_MAX_POLLS; index += 1) {
          if (abortRef.current) throw new Error('任务已取消');
          await new Promise((resolve) => setTimeout(resolve, EXTERNAL_IMAGE_POLL_INTERVAL_MS));
          res = await queryExternalImageStatus({
            providerId: providerSelection.provider.id,
            taskId,
            providerModel: externalProviderModel,
            outputFormat,
            historyContext,
          });
          update({ taskId, progress: `${outputTitle} · ${Math.min(99, Math.round(((index + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%` });
          if (res.imageUrls?.length) break;
          const statusText = String(res.code || res.status || '').toLowerCase();
          if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') throw new Error(res.error || '任务失败');
        }
      }
      urls = res.imageUrls || [];
      taskId = res.taskId || taskId;
    } else {
      const submit = await submitImageAsync({
        model: modelDef.id,
        apiModel,
        paramKind: modelDef.paramKind,
        prompt,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images,
        n: 1,
        outputFormat,
        seed: runSeed,
        historyContext,
      });
      urls = submit.urls || [];
      if (!submit.sync) {
        if (!submit.taskId) throw new Error('未获取到任务 ID');
        taskId = submit.taskId;
        let lastProgress = submit.progress || '5%';
        update({ taskId, progress: `${outputTitle} · ${lastProgress}` });
        for (let index = 0; index < INTERNAL_IMAGE_MAX_POLLS; index += 1) {
          if (abortRef.current) throw new Error('任务已取消');
          await new Promise((resolve) => setTimeout(resolve, INTERNAL_IMAGE_POLL_INTERVAL_MS));
          const q = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
          if (q.progress && q.progress !== lastProgress) {
            lastProgress = q.progress;
            update({ progress: `${outputTitle} · ${q.progress}` });
          }
          const statusText = String(q.status || '').toLowerCase();
          if (statusText === 'completed' || statusText === 'success' || statusText === 'done') {
            urls = q.urls || [];
            break;
          }
          if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') throw new Error(q.error || '任务失败');
        }
      }
    }
    const imageUrl = urls.find(Boolean);
    if (!imageUrl) throw new Error(`${outputTitle} 生成完成但未返回图片`);
    return { imageUrl, taskId };
  }, [activeId, apiModel, aspectRatio, d.providerParams, externalProviderModel, id, isExternalSelected, modelDef.id, modelDef.paramKind, outputFormat, providerSelection.provider, sizeLevel, update]);

  const runGenerate = useCallback(async () => {
    if (isReadonly || busy) return;
    abortRef.current = false;
    taskCompletionSound.primeAudio();
    const src = `cinema-auditorium-design:${id.slice(0, 6)}`;
    const generatedUrls: string[] = [];
    const results: CinemaAuditoriumResult[] = [];
    let renderImage = '';
    let previousDrawingImage = '';
    let planReferenceImage = '';
    let generatedColorPlanImage = '';
    let latestTaskId = '';
    const sequence = OUTPUT_ORDER.filter((kind) => outputSelection.includes(kind));
    if (sequence.length === 0) {
      update({ status: 'error', error: '请至少选择一种输出类型' });
      return;
    }
    try {
      update({
        status: 'preparing',
        progress: '准备影院报告厅图包...',
        error: '',
        imageUrl: '',
        imageUrls: [],
        urls: [],
        cinemaAuditoriumResults: [],
        referenceImages: [...spaceReferenceImages, ...colorMaterialReferenceImages, ...equipmentReferenceImages],
      });
      if (sequence.includes('color-plan') || sequence.includes('render')) {
        const dataUrl = buildCinemaColorPlanReferenceDataUrl({
          lengthMm: dimensions.lengthMm,
          widthMm: dimensions.widthMm,
          heightMm: dimensions.heightMm,
          screenStageSide,
          seatCount: Number(d.seatCount) || 0,
          aisleMode,
          venueType,
          seatWidthMm,
          seatDepthMm,
          seatGapMm,
          rowSpacingMm,
          frontClearanceMm,
          sideAisleWidthMm,
          centerAisleWidthMm,
        });
        if (dataUrl) {
          update({ progress: '上传彩平比例底图...' });
          planReferenceImage = await uploadDataUrl(dataUrl, 'cinema-color-plan-reference');
        }
      }
      for (let index = 0; index < sequence.length; index += 1) {
        if (abortRef.current) throw new Error('任务已取消');
        const kind = sequence[index];
        const runSeed = index === 0 && seed > 0 ? seed : randomImageSeed();
        const prompt = kind === 'render'
          ? buildCinemaAuditoriumImagePrompt({
            dimensions,
            venueType,
            screenStageSide,
            capacityMode: d.capacityMode,
            seatCount: d.seatCount,
            aisleMode,
            seatWidthMm,
            seatDepthMm,
            seatGapMm,
            rowSpacingMm,
            frontClearanceMm,
            sideAisleWidthMm,
            centerAisleWidthMm,
            slopeMode,
            screenType,
            mainScreenKind,
            audioSystem,
            specialEffects,
            colorMaterialPresetText,
            colorMaterial: d.colorMaterial,
            colorMaterialReferenceTone: d.colorMaterialReferenceTone,
            supplement: [sourceText, resolvedSupplement].filter(Boolean).join('\n\n'),
            colorPlanReferenceImages: [generatedColorPlanImage || planReferenceImage].filter(Boolean),
            spaceReferenceImages,
            colorMaterialReferenceImages,
            equipmentReferenceImages,
          })
          : buildCinemaAuditoriumDrawingPrompt({
            outputType: kind,
            dimensions,
            venueType,
            screenStageSide,
            capacityMode: d.capacityMode,
            seatCount: d.seatCount,
            aisleMode,
            seatWidthMm,
            seatDepthMm,
            seatGapMm,
            rowSpacingMm,
            frontClearanceMm,
            sideAisleWidthMm,
            centerAisleWidthMm,
            slopeMode,
            screenType,
            mainScreenKind,
            audioSystem,
            specialEffects,
            colorMaterialPresetText,
            colorMaterial: d.colorMaterial,
            colorMaterialReferenceTone: d.colorMaterialReferenceTone,
            supplement: [sourceText, resolvedSupplement].filter(Boolean).join('\n\n'),
            renderImage,
            previousDrawingImage: kind === 'system-principle' ? '' : previousDrawingImage,
            planReferenceImage: kind === 'color-plan' ? planReferenceImage : '',
            userReferenceImages: kind === 'system-principle'
              ? equipmentReferenceImages
              : [...spaceReferenceImages, ...colorMaterialReferenceImages, ...equipmentReferenceImages],
          });
        const images = kind === 'render'
          ? [generatedColorPlanImage || planReferenceImage, ...spaceReferenceImages, ...colorMaterialReferenceImages, ...equipmentReferenceImages].filter(Boolean)
          : kind === 'system-principle'
            ? equipmentReferenceImages
            : [renderImage, previousDrawingImage, kind === 'color-plan' ? planReferenceImage : '', ...spaceReferenceImages, ...colorMaterialReferenceImages, ...equipmentReferenceImages].filter(Boolean);
        update({
          status: `generating-${kind}`,
          progress: `提交 ${index + 1}/${sequence.length} · ${outputLabel(kind)}`,
          lastPrompt: prompt,
          lastSeed: runSeed,
          outputText: summaryText,
          text: summaryText,
        });
        logBus.info(`影院报告厅设计提交 ${outputLabel(kind)} seed=${runSeed} refs=${images.length}`, src);
        const generated = await generateOneImage({ kind, prompt, images, runSeed });
        const result: CinemaAuditoriumResult = {
          kind,
          name: outputLabel(kind),
          imageUrl: generated.imageUrl,
          prompt,
          seed: runSeed,
          taskId: generated.taskId,
        };
        if (generated.taskId) latestTaskId = generated.taskId;
        if (kind === 'render') renderImage = generated.imageUrl;
        else if (kind === 'color-plan') {
          generatedColorPlanImage = generated.imageUrl;
          previousDrawingImage = generated.imageUrl;
        } else if (kind !== 'system-principle') previousDrawingImage = generated.imageUrl;
        generatedUrls.push(generated.imageUrl);
        results.push(result);
        update({
          status: index + 1 >= sequence.length ? 'success' : `generating-${kind}`,
          progress: `${index + 1}/${sequence.length} 完成 · ${outputLabel(kind)}`,
          imageUrl: generatedUrls[0],
          imageUrls: generatedUrls.slice(),
          urls: generatedUrls.slice(),
          cinemaAuditoriumResults: results.slice(),
          prompt,
          outputText: summaryText,
          text: summaryText,
          referenceImages: [...spaceReferenceImages, ...colorMaterialReferenceImages, ...equipmentReferenceImages, planReferenceImage].filter(Boolean),
          colorPlanReferenceImage: planReferenceImage,
          taskId: latestTaskId,
          error: '',
        });
      }
      update({ status: 'success', progress: '100%', taskId: latestTaskId });
      logBus.success(`影院报告厅设计图包完成: ${generatedUrls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const message = error?.message || '影院报告厅设计生成失败';
      update({ status: 'error', error: message, progress: '' });
      logBus.error(message, src);
      taskCompletionSound.notifyFailure(id, 'image');
      throw error;
    }
  }, [audioSystem, aisleMode, busy, centerAisleWidthMm, colorMaterialPresetText, colorMaterialReferenceImages, d.capacityMode, d.colorMaterial, d.colorMaterialReferenceTone, d.seatCount, dimensions, equipmentReferenceImages, frontClearanceMm, generateOneImage, id, isReadonly, mainScreenKind, outputSelection, resolvedSupplement, rowSpacingMm, screenStageSide, screenType, seatDepthMm, seatGapMm, seatWidthMm, seed, sideAisleWidthMm, slopeMode, sourceText, spaceReferenceImages, specialEffects, summaryText, update, venueType]);

  useRunTrigger(id, runGenerate, 'image');

  const patchDimensions = (patch: Partial<typeof dimensions>) => update({ dimensions: normalizeCinemaDimensions({ ...dimensions, ...patch }) });
  const patchLayoutNumber = (key: string, fallback: number, min = 0) => (value: string) => {
    update({ [key]: normalizeLayoutMm(value, fallback, min) });
  };
  const toggleOutput = (kind: CinemaAuditoriumOutputType) => {
    const next = selectedOutputSet.has(kind) ? outputSelection.filter((item) => item !== kind) : [...outputSelection, kind];
    update({ outputSelection: normalizeCinemaOutputSelection(next) });
  };
  const toggleEffect = (effectId: string) => {
    const set = new Set(specialEffects);
    if (set.has(effectId)) set.delete(effectId);
    else set.add(effectId);
    update({ specialEffects: normalizeCinemaSpecialEffects(Array.from(set)) });
  };
  const results: CinemaAuditoriumResult[] = Array.isArray(d.cinemaAuditoriumResults) ? d.cinemaAuditoriumResults : [];
  const planLayoutParams = useMemo(() => ({
    lengthMm: dimensions.lengthMm,
    widthMm: dimensions.widthMm,
    heightMm: dimensions.heightMm,
    screenStageSide,
    seatCount: Number(d.seatCount) || 0,
    aisleMode,
    venueType,
    seatWidthMm,
    seatDepthMm,
    seatGapMm,
    rowSpacingMm,
    frontClearanceMm,
    sideAisleWidthMm,
    centerAisleWidthMm,
  }), [aisleMode, centerAisleWidthMm, d.seatCount, dimensions.heightMm, dimensions.lengthMm, dimensions.widthMm, frontClearanceMm, rowSpacingMm, screenStageSide, seatDepthMm, seatGapMm, seatWidthMm, sideAisleWidthMm, venueType]);

  return (
    <div className="w-[640px] rounded-xl border border-cyan-300/20 bg-zinc-950/95 p-3 text-white shadow-2xl shadow-cyan-950/30" data-exhibition-compact-node-type="cinema-auditorium-design">
      <Handle id="text" type="target" position={Position.Left} className="!border-0" style={{ top: '18%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输入：方案说明文本" />
      <Handle id="space-reference" type="target" position={Position.Left} className="!border-0" style={{ top: '34%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：空间/建筑参考图" />
      <Handle id="color-material-reference" type="target" position={Position.Left} className="!border-0" style={{ top: '50%', background: EXHIBITION_COLOR_MATERIAL_REFERENCE_COLOR }} title="输入：色彩材质参考图" />
      <Handle id="equipment-reference" type="target" position={Position.Left} className="!border-0" style={{ top: '66%', background: '#f59e0b' }} title="输入：设备/座椅/舞台参考图" />
      <Handle id="text-output" type="source" position={Position.Right} className="!border-0 t8-exhibition-handle--text" style={{ top: '36%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输出：方案摘要文本" />
      <Handle type="source" position={Position.Right} className="!border-0" style={{ top: '56%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：图像" />

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-cyan-300/15 p-2 text-cyan-200"><Theater size={18} /></div>
          <div>
            <div className="text-sm font-bold text-cyan-100">影院报告厅设计</div>
            <div className="text-[10px] text-white/45">效果图 / 彩平图 / 系统设备原理图</div>
          </div>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />}
      </div>

      {isReadonly && <div className="mb-2 rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}

      <div data-exhibition-compact-section="venue" className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <label data-exhibition-compact-item="venue-type" className="space-y-1 text-[10px] text-white/55">
          影院/报告厅类型
          <select className={FIELD} value={venueType} disabled={isReadonly || busy} onChange={(event) => update({ venueType: normalizeCinemaVenueType(event.target.value) })}>
            {CINEMA_AUDITORIUM_VENUE_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div data-exhibition-compact-section="plan-layout" className="mt-2 grid grid-cols-4 gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <label data-exhibition-compact-item="screen-stage-side" className="space-y-1 text-[10px] text-white/55">
          银幕/舞台区方向
          <select className={FIELD} value={screenStageSide} disabled={isReadonly || busy} onChange={(event) => update({ screenStageSide: normalizeCinemaScreenStageSide(event.target.value) })}>
            {CINEMA_SCREEN_STAGE_SIDES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {[
          ['lengthMm', '长 mm'],
          ['widthMm', '宽 mm'],
          ['heightMm', '高 mm'],
        ].map(([key, label]) => (
          <label key={key} data-exhibition-compact-item="size-input" className="space-y-1 text-[10px] text-white/55">
            {label}
            <input className={FIELD} type="number" min={1000} value={(dimensions as any)[key]} disabled={isReadonly || busy} onChange={(event) => patchDimensions({ [key]: Number(event.target.value) || 0 } as any)} />
          </label>
        ))}
        <label data-exhibition-compact-item="seat-count" className="space-y-1 text-[10px] text-white/55">
          座席数
          <input className={FIELD} type="number" min={0} value={Number(d.seatCount) || 0} disabled={isReadonly || busy || d.capacityMode !== 'manual'} onChange={(event) => update({ seatCount: Math.max(0, Math.round(Number(event.target.value) || 0)), capacityMode: 'manual' })} />
        </label>
        <label data-exhibition-compact-item="aisle-mode" className="space-y-1 text-[10px] text-white/55">
          走道模式
          <select className={FIELD} value={aisleMode} disabled={isReadonly || busy} onChange={(event) => update({ aisleMode: normalizeCinemaAisleMode(event.target.value) })}>
            {CINEMA_AISLE_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label data-exhibition-compact-item="seat-size" className="space-y-1 text-[10px] text-white/55">
          座椅宽 mm
          <input className={FIELD} type="number" min={250} value={seatWidthMm} disabled={isReadonly || busy} onChange={(event) => patchLayoutNumber('seatWidthMm', 550, 250)(event.target.value)} />
        </label>
        <label data-exhibition-compact-item="seat-size" className="space-y-1 text-[10px] text-white/55">
          座椅深 mm
          <input className={FIELD} type="number" min={250} value={seatDepthMm} disabled={isReadonly || busy} onChange={(event) => patchLayoutNumber('seatDepthMm', 600, 250)(event.target.value)} />
        </label>
        <label data-exhibition-compact-item="seat-size" className="space-y-1 text-[10px] text-white/55">
          座椅间隙 mm
          <input className={FIELD} type="number" min={0} value={seatGapMm} disabled={isReadonly || busy} onChange={(event) => patchLayoutNumber('seatGapMm', 80, 0)(event.target.value)} />
        </label>
        <label data-exhibition-compact-item="row-spacing" className="space-y-1 text-[10px] text-white/55">
          行间距 mm
          <input className={FIELD} type="number" min={seatDepthMm} value={rowSpacingMm} disabled={isReadonly || busy} onChange={(event) => patchLayoutNumber('rowSpacingMm', 900, seatDepthMm)(event.target.value)} />
        </label>
        <label data-exhibition-compact-item="front-clearance" className="space-y-1 text-[10px] text-white/55">
          前区净距 mm
          <input className={FIELD} type="number" min={0} value={frontClearanceMm} disabled={isReadonly || busy} onChange={(event) => patchLayoutNumber('frontClearanceMm', 1600, 0)(event.target.value)} />
        </label>
        <label data-exhibition-compact-item="aisle-widths" className="space-y-1 text-[10px] text-white/55">
          侧走道宽 mm
          <input className={FIELD} type="number" min={0} value={sideAisleWidthMm} disabled={isReadonly || busy} onChange={(event) => patchLayoutNumber('sideAisleWidthMm', 1200, 0)(event.target.value)} />
        </label>
        <label data-exhibition-compact-item="aisle-widths" className="space-y-1 text-[10px] text-white/55">
          中走道宽 mm
          <input className={FIELD} type="number" min={0} value={centerAisleWidthMm} disabled={isReadonly || busy} onChange={(event) => patchLayoutNumber('centerAisleWidthMm', 1200, 0)(event.target.value)} />
        </label>
        <label data-exhibition-compact-item="seat-count" className="col-span-4 flex items-center gap-2 text-[10px] text-white/65">
          <input type="checkbox" className="accent-cyan-300" checked={d.capacityMode !== 'manual'} disabled={isReadonly || busy} onChange={(event) => update({ capacityMode: event.target.checked ? 'auto' : 'manual' })} />
          自动按空间尺寸推导座席密度
        </label>
        <button data-exhibition-compact-item="plan-preview" type="button" className={`${BUTTON} col-span-4 border-cyan-300/30 bg-cyan-300/10 text-cyan-100`} onClick={() => setPlanLayoutOpen(true)}>
          <Maximize2 size={12} /> 查看平面布局
        </button>
      </div>

      <div data-exhibition-compact-section="layout" className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <label data-exhibition-compact-item="slope-mode" className="space-y-1 text-[10px] text-white/55">
          地坪/视线
          <select className={FIELD} value={slopeMode} disabled={isReadonly || busy} onChange={(event) => update({ slopeMode: normalizeCinemaSlopeMode(event.target.value) })}>
            {CINEMA_SLOPE_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label data-exhibition-compact-item="screen-type" className="space-y-1 text-[10px] text-white/55">
          银幕系统
          <select className={FIELD} value={screenType} disabled={isReadonly || busy} onChange={(event) => update({ screenType: normalizeCinemaScreenType(event.target.value) })}>
            {CINEMA_SCREEN_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label data-exhibition-compact-item="main-screen-kind" className="space-y-1 text-[10px] text-white/55">
          主屏幕种类
          <select className={FIELD} value={mainScreenKind} disabled={isReadonly || busy} onChange={(event) => update({ mainScreenKind: normalizeCinemaMainScreenKind(event.target.value) })}>
            {CINEMA_MAIN_SCREEN_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label data-exhibition-compact-item="audio-system" className="space-y-1 text-[10px] text-white/55">
          声学系统
          <select className={FIELD} value={audioSystem} disabled={isReadonly || busy} onChange={(event) => update({ audioSystem: normalizeCinemaAudioSystem(event.target.value) })}>
            {CINEMA_AUDIO_SYSTEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div data-exhibition-compact-section="equipment" className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <div data-exhibition-compact-item="special-effects" className="mb-1 text-[10px] font-semibold text-white/65">特效系统</div>
        <div className="grid grid-cols-4 gap-1">
          {CINEMA_SPECIAL_EFFECTS.map((item) => (
            <label key={item.id} className="flex items-center gap-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-white/70">
              <input type="checkbox" className="accent-cyan-300" checked={specialEffects.includes(item.id)} disabled={isReadonly || busy} onChange={() => toggleEffect(item.id)} />
              <span className="truncate">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div data-exhibition-compact-section="color-material" className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <div data-exhibition-compact-item="preset-options">
          <ColorMaterialPresetSelect
            presets={colorMaterialPresets}
            value={d.colorMaterialPreset || ''}
            disabled={isReadonly || busy}
            className={FIELD}
            onChange={(presetId, preset) => update({ colorMaterialPreset: presetId, colorMaterial: preset ? colorMaterialTextFromCinemaPreset(preset) : d.colorMaterial || '' })}
          />
        </div>
        <textarea data-exhibition-compact-item="manual-input" className={`${FIELD} min-h-[50px] resize-y`} value={d.colorMaterial || ''} disabled={isReadonly || busy} placeholder="手动色彩与材质补充" onChange={(event) => update({ colorMaterial: event.target.value, colorMaterialPreset: '' })} />
        <textarea data-exhibition-compact-item="reference-analysis" className={`${FIELD} min-h-[42px] resize-y`} value={d.colorMaterialReferenceTone || ''} disabled={isReadonly || busy} placeholder="色彩材质参考图分析/倾向" onChange={(event) => update({ colorMaterialReferenceTone: event.target.value })} />
      </div>

      <div data-exhibition-compact-section="output" className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <div data-exhibition-compact-item="output-selection" className="mb-1 text-[10px] font-semibold text-white/65">同步输出</div>
        <div className="grid grid-cols-3 gap-1">
          {CINEMA_AUDITORIUM_OUTPUT_TYPES.map((item) => (
            <label key={item.id} className="flex items-center gap-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-white/70">
              <input type="checkbox" className="accent-cyan-300" checked={selectedOutputSet.has(item.id)} disabled={isReadonly || busy} onChange={() => toggleOutput(item.id as CinemaAuditoriumOutputType)} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div data-exhibition-compact-section="prompt" className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <MentionPromptInput
          data-exhibition-compact-item="text-input"
          value={d.supplement || ''}
          mentions={supplementMentions}
          materials={mentionMaterials}
          isDark
          isPixel={false}
          disabled={isReadonly || busy}
          placeholder="补充空间主题、品牌气质、声学/设备特殊要求，可 @ 引用参考图"
          onChange={(value, mentions) => update({ supplement: value, supplementMentions: mentions })}
        />
      </div>

      <div data-exhibition-compact-section="model" className="mt-2 grid grid-cols-4 gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <button data-exhibition-compact-item="actions" type="button" className={`${BUTTON} col-span-4 border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成图包</button>
        <label data-exhibition-compact-item="provider" className="space-y-1 text-[10px] text-white/55">
          平台
          <select className={FIELD} value={providerSelectValue} disabled={isReadonly || busy || (!allowZhenzhenFallback && imageAdvancedProviders.length === 0)} onChange={(event) => {
            const value = event.target.value;
            if (value === 'zhenzhen') update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
            else {
              const provider = imageAdvancedProviders.find((item) => `advanced:${item.id}` === value);
              const models = provider ? advancedProviderModelOptions(provider, 'image') : [];
              update({ providerSource: provider?.protocol || 'zhenzhen', providerId: provider?.id || '', providerModel: models[0] || '', providerParams: {} });
            }
          }}>
            <option value="zhenzhen">真真 / 内置</option>
            {imageAdvancedProviders.map((provider) => <option key={provider.id} value={`advanced:${provider.id}`}>{provider.label}</option>)}
          </select>
        </label>
        <label data-exhibition-compact-item="model" className="space-y-1 text-[10px] text-white/55">
          模型
          {isExternalSelected ? (
            <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy || externalModelOptions.length === 0} onChange={(event) => update({ providerModel: event.target.value })}>
              {externalModelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          ) : (
            <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(event) => update({ apiModel: event.target.value })}>
              {modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          )}
        </label>
        <label data-exhibition-compact-item="aspect-size" className="space-y-1 text-[10px] text-white/55">
          比例
          <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
            {modelDef.aspectRatios.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label data-exhibition-compact-item="aspect-size" className="space-y-1 text-[10px] text-white/55">
          尺寸
          <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
            {(modelDef.sizes.length ? modelDef.sizes : ['1K', '2K', '4K']).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label data-exhibition-compact-item="seed-name" className="space-y-1 text-[10px] text-white/55">
          Seed
          <input className={FIELD} type="number" min={0} value={seed} disabled={isReadonly || busy} onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
        </label>
        <label data-exhibition-compact-item="output-format" className="space-y-1 text-[10px] text-white/55">
          格式
          <select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(event) => update({ outputFormat: event.target.value })}>
            <option value="jpg">JPG</option>
            <option value="png">PNG</option>
          </select>
        </label>
        <div data-exhibition-compact-item="progress" className="col-span-2 flex items-center gap-1 rounded border border-white/10 bg-black/20 px-2 text-[10px] text-white/55">
          <Settings2 size={12} /> {d.progress || d.status || 'idle'}
        </div>
      </div>

      {d.error && <div className="mt-2 rounded border border-red-400/30 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-100">{d.error}</div>}

      <div data-exhibition-compact-section="result" className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <div data-exhibition-compact-item="preview" className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-white/65"><ImageIcon size={12} /> 输出结果</div>
        {results.length > 0 ? (
          <div data-exhibition-compact-item="outputs" className="grid grid-cols-3 gap-2">
            {results.map((item) => (
              <div key={`${item.kind}-${item.imageUrl}`} className="rounded border border-white/10 bg-black/20 p-1">
                <img src={item.imageUrl} className="h-24 w-full rounded object-cover" />
                <div className="mt-1 truncate text-center text-[10px] text-cyan-100" title={item.name}>{item.name}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded border border-dashed border-white/10 p-4 text-center text-[11px] text-white/35">暂无输出</div>
        )}
      </div>
      <CinemaPlanLayoutModal open={planLayoutOpen} params={planLayoutParams} onClose={() => setPlanLayoutOpen(false)} />
    </div>
  );
});

CinemaAuditoriumDesignNode.displayName = 'CinemaAuditoriumDesignNode';

export default CinemaAuditoriumDesignNode;
