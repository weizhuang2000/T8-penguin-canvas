import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Layers, Loader2, Play, Sparkles } from 'lucide-react';
import { EXHIBITION_IMAGE_HANDLE_COLOR } from '../../config/portTypes';
import { IMAGE_MODELS } from '../../providers/models';
import { generateExternalImage, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import { advancedProviderModelOptions, advancedProvidersForNode, externalImageSizeFor, resolveAdvancedProviderSelection } from '../../utils/advancedProviders';
import { FUSION_RENDER_AUTO_CEILING_CRAFT, FUSION_RENDER_AUTO_FLOOR_MATERIAL, FUSION_RENDER_CEILING_CRAFTS, FUSION_RENDER_VENUE_TYPES, buildFusionRenderPrompt, describeFusionRenderLayout } from '../../utils/fusionRenderDesignData.js';
import {
  REVERSE_ISOMETRIC_DIRECTIONS,
  REVERSE_ISOMETRIC_FLOOR_MATERIALS,
  describeWallAdjacentExhibits,
  normalizeReverseIsometricDirection,
  normalizeReverseIsometricLayoutItems,
  type ReverseIsometricLayoutItem,
} from '../../utils/reverseIsometricDesignData.js';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import NodeHelpButton from './NodeHelpButton';
import {
  ReverseIsometricLayoutModal,
  buildReverseIsometricLayoutReference,
  useHandleImages,
} from './ReverseIsometricDesignNode';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_POLLS = 300;
const POLL_INTERVAL = 3000;

function createBlankStage(hallLengthMm: number, hallWidthMm: number): string {
  const ratio = hallLengthMm / Math.max(1, hallWidthMm);
  const canvas = document.createElement('canvas');
  canvas.width = ratio >= 1 ? 1200 : Math.max(320, Math.round(1200 * ratio));
  canvas.height = ratio >= 1 ? Math.max(320, Math.round(1200 / ratio)) : 1200;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法创建矩形排版空间');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#d4d4d8';
  context.lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.004));
  context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, canvas.width - context.lineWidth, canvas.height - context.lineWidth);
  drawHallDimensions(context, canvas.width, canvas.height, hallLengthMm, hallWidthMm);
  return canvas.toDataURL('image/png');
}

function loadStageImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取平面布局图'));
    image.src = src;
  });
}

function drawHallDimensions(context: CanvasRenderingContext2D, width: number, height: number, hallLengthMm: number, hallWidthMm: number) {
  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.035));
  const inset = Math.max(28, margin * 2);
  context.save();
  context.strokeStyle = '#0e7490';
  context.fillStyle = 'rgba(255,255,255,0.9)';
  context.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.0025));
  context.font = `600 ${Math.max(14, Math.round(Math.min(width, height) * 0.025))}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const bottomY = height - margin;
  context.beginPath();
  context.moveTo(inset, bottomY);
  context.lineTo(width - inset, bottomY);
  context.moveTo(inset, bottomY - margin / 3);
  context.lineTo(inset, bottomY + margin / 3);
  context.moveTo(width - inset, bottomY - margin / 3);
  context.lineTo(width - inset, bottomY + margin / 3);
  context.stroke();
  const lengthText = `展厅长 ${hallLengthMm} mm`;
  const lengthMetrics = context.measureText(lengthText);
  context.fillRect(width / 2 - lengthMetrics.width / 2 - 8, bottomY - margin / 2, lengthMetrics.width + 16, margin);
  context.fillStyle = '#164e63';
  context.fillText(lengthText, width / 2, bottomY);

  const leftX = margin;
  context.strokeStyle = '#0e7490';
  context.beginPath();
  context.moveTo(leftX, inset);
  context.lineTo(leftX, height - inset);
  context.moveTo(leftX - margin / 3, inset);
  context.lineTo(leftX + margin / 3, inset);
  context.moveTo(leftX - margin / 3, height - inset);
  context.lineTo(leftX + margin / 3, height - inset);
  context.stroke();
  context.translate(leftX, height / 2);
  context.rotate(-Math.PI / 2);
  const widthText = `展厅宽 ${hallWidthMm} mm`;
  const widthMetrics = context.measureText(widthText);
  context.fillStyle = 'rgba(255,255,255,0.9)';
  context.fillRect(-widthMetrics.width / 2 - 8, -margin / 2, widthMetrics.width + 16, margin);
  context.fillStyle = '#164e63';
  context.fillText(widthText, 0, 0);
  context.restore();
}

async function createDimensionedStage(planUrl: string, hallLengthMm: number, hallWidthMm: number): Promise<string> {
  if (!planUrl) return createBlankStage(hallLengthMm, hallWidthMm);
  const image = await loadStageImage(planUrl);
  const naturalWidth = image.naturalWidth || image.width || 1;
  const naturalHeight = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, 1600 / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(320, Math.round(naturalWidth * scale));
  canvas.height = Math.max(320, Math.round(naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法创建尺寸标注底图');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  drawHallDimensions(context, canvas.width, canvas.height, hallLengthMm, hallWidthMm);
  return canvas.toDataURL('image/png');
}

async function buildFusionLayoutReference(planUrl: string, hallLengthMm: number, hallWidthMm: number, items: ReverseIsometricLayoutItem[]): Promise<string> {
  const dimensionedStage = await createDimensionedStage(planUrl, hallLengthMm, hallWidthMm);
  return buildReverseIsometricLayoutReference(dimensionedStage, items);
}

const FusionRenderDesignNode = ({ id, data, selected }: NodeProps) => {
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
  const venueType = FUSION_RENDER_VENUE_TYPES.includes(d.venueType) ? d.venueType : FUSION_RENDER_VENUE_TYPES[0];
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
  const hallLengthMm = Math.min(100000, Math.max(1000, Math.round(Number(d.hallLengthMm) || 12000)));
  const hallWidthMm = Math.min(100000, Math.max(1000, Math.round(Number(d.hallWidthMm) || 8000)));
  const hallHeightMm = Math.min(12000, Math.max(2400, Math.round(Number(d.hallHeightMm) || 4200)));
  const floorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS.includes(d.floorMaterial) ? d.floorMaterial : FUSION_RENDER_AUTO_FLOOR_MATERIAL;
  const ceilingCraft = FUSION_RENDER_CEILING_CRAFTS.includes(d.ceilingCraft) ? d.ceilingCraft : FUSION_RENDER_AUTO_CEILING_CRAFT;
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const busy = d.status === 'generating';
  const wallPlacementText = useMemo(() => describeWallAdjacentExhibits(layoutItems), [layoutItems]);
  const layoutDescription = useMemo(() => describeFusionRenderLayout(layoutItems), [layoutItems]);
  const previewPrompt = useMemo(() => buildFusionRenderPrompt({ hasPlan: Boolean(planImage), venueType, viewDirection, hallLengthMm, hallWidthMm, hallHeightMm, floorMaterial, ceilingCraft, layoutDescription, wallPlacementText, exhibitCount: layoutItems.length }), [ceilingCraft, floorMaterial, hallHeightMm, hallLengthMm, hallWidthMm, layoutDescription, layoutItems.length, planImage, venueType, viewDirection, wallPlacementText]);

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
    if (!layoutItems.length) {
      if (d.manualLayoutReferenceImage) update({ manualLayoutReferenceImage: '' });
      return;
    }
    let cancelled = false;
    buildFusionLayoutReference(planImage, hallLengthMm, hallWidthMm, layoutItems).then((value) => {
      if (!cancelled && value !== d.manualLayoutReferenceImage) update({ manualLayoutReferenceImage: value });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [d.manualLayoutReferenceImage, hallLengthMm, hallWidthMm, layoutItems, planImage, update]);

  const generateCandidate = useCallback(async (prompt: string, references: string[], runSeed: number): Promise<string> => {
    const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType: 'fusion-render-design', nodeTitle: '融合效果图', outputTitle: '融合效果图', seed: runSeed };
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
    if (!exhibitImages.length) throw new Error('请至少连接一张展项效果图');
    pollAbortRef.current = false;
    const runSeed = seed || Math.floor(Math.random() * 2147483646) + 1;
    const previousOutput = { imageUrl: d.imageUrl || '', imageUrls: d.imageUrls || [], urls: d.urls || [] };
    update({ status: 'generating', progress: '正在生成排版参考图...', error: '' });
    try {
      const layoutReference = await buildFusionLayoutReference(planImage, hallLengthMm, hallWidthMm, layoutItems);
      const references = planImage ? [planImage, layoutReference, ...layoutItems.map((item) => item.url)] : [layoutReference, ...layoutItems.map((item) => item.url)];
      update({ status: 'generating', progress: '正在生成融合效果图...' });
      const candidate = await generateCandidate(previewPrompt, references, runSeed);
      update({ status: 'success', progress: '100%', error: '', imageUrl: candidate, imageUrls: [candidate], urls: [candidate], outputText: previewPrompt, text: previewPrompt, prompt: previewPrompt, lastPrompt: previewPrompt, lastSeed: runSeed, referenceImages: references, manualLayoutReferenceImage: layoutReference });
      logBus.success('融合效果图生成完成', `fusion-render:${id.slice(0, 6)}`);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      update({ ...previousOutput, status: 'error', progress: '', error: error?.message || '融合效果图生成失败' });
      logBus.error(`融合效果图生成失败：${error?.message || error}`, `fusion-render:${id.slice(0, 6)}`);
      throw error;
    }
  }, [busy, d.imageUrl, d.imageUrls, d.urls, exhibitImages.length, generateCandidate, hallLengthMm, hallWidthMm, id, isReadonly, layoutItems, planImage, previewPrompt, seed, update]);

  useRunTrigger(id, runGenerate, 'image');

  return <div data-exhibition-compact-node-type="fusion-render-design" className={`relative w-[520px] rounded-xl border bg-zinc-950 text-white shadow-2xl ${selected ? 'border-cyan-300/70' : 'border-white/10'}`}>
    <Handle id="plan-layout" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '24%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：平面布局图（可选、排他）" />
    <Handle id="exhibit-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '48%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：展项效果图（可多图）" />
    <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：融合效果图" />
    <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2"><Sparkles size={16} className="text-cyan-300" /><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-cyan-100">融合效果图</div><div className="truncate text-[10px] text-white/45">矩形空间排版 · 展项融合 · 写实透视</div></div><NodeHelpButton nodeType="fusion-render-design" /></header>
    <div className="nodrag nopan max-h-[780px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
      <section data-exhibition-compact-section="inputs" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} />输入与排版</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-white/10 bg-black/20 p-1.5"><div className="mb-1 text-[9px] text-white/45">平面布局（可选、单图排他）</div>{planImage ? <img src={planImage} className="h-24 w-full rounded object-contain" /> : <div className="flex h-24 items-center justify-center rounded border border-dashed border-white/15 bg-white text-[10px] text-zinc-400" style={{ aspectRatio: `${hallLengthMm} / ${hallWidthMm}` }}>空白矩形空间</div>}</div>
          <div className="rounded border border-white/10 bg-black/20 p-1.5"><div className="mb-1 text-[9px] text-white/45">展项效果图（{exhibitImages.length}）</div><div className="grid h-24 grid-cols-3 gap-1 overflow-y-auto">{exhibitImages.map((item) => <img key={item.id + item.url} src={item.url} className="h-10 w-full rounded object-cover" />)}</div></div>
        </div>
        <button className={`${BUTTON} w-full border-cyan-300/30 bg-cyan-300/10 text-cyan-100`} disabled={isReadonly || busy || !exhibitImages.length} onClick={() => setLayoutOpen(true)}><Layers size={13} />打开手动排版</button>
      </section>
      <section data-exhibition-compact-section="view" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <label className="block space-y-1"><span className="text-[10px] text-white/55">展馆类型</span><select className={FIELD} value={venueType} disabled={isReadonly || busy} onChange={(e) => update({ venueType: e.target.value })}>{FUSION_RENDER_VENUE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <div className="text-[11px] font-semibold text-cyan-100">透视相机观察方向</div><div className="grid grid-cols-4 gap-1">{REVERSE_ISOMETRIC_DIRECTIONS.map((item) => <button key={item.value} className={`rounded px-1 py-1.5 text-[10px] ${viewDirection === item.value ? 'bg-cyan-300/20 text-cyan-100' : 'bg-black/20 text-white/50'}`} disabled={isReadonly || busy} onClick={() => update({ viewDirection: item.value })}>{item.label}</button>)}</div>
        <label className="block space-y-1"><span className="text-[10px] text-white/55">顶部工艺</span><select className={FIELD} value={ceilingCraft} disabled={isReadonly || busy} onChange={(e) => update({ ceilingCraft: e.target.value })}><option value={FUSION_RENDER_AUTO_CEILING_CRAFT}>{FUSION_RENDER_AUTO_CEILING_CRAFT}</option>{FUSION_RENDER_CEILING_CRAFTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[10px] text-white/55">展厅净高 mm</span><input className={FIELD} type="number" min={2400} max={12000} step={100} value={hallHeightMm} disabled={isReadonly || busy} onChange={(e) => update({ hallHeightMm: Math.min(12000, Math.max(2400, Math.round(Number(e.target.value) || 4200))) })} /></label><label className="space-y-1"><span className="text-[10px] text-white/55">地面材质</span><select className={FIELD} value={floorMaterial} disabled={isReadonly || busy} onChange={(e) => update({ floorMaterial: e.target.value })}><option value={FUSION_RENDER_AUTO_FLOOR_MATERIAL}>{FUSION_RENDER_AUTO_FLOOR_MATERIAL}</option>{REVERSE_ISOMETRIC_FLOOR_MATERIALS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
      </section>
      <section data-exhibition-compact-section="model" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <div className="flex items-center justify-between"><div className="text-[11px] font-semibold text-cyan-100">模型与尺寸</div><button className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy || !exhibitImages.length} onClick={() => void runGenerate()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}生成</button></div>
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
      {d.imageUrl && <section data-exhibition-compact-section="result" data-exhibition-compact-item="main" className="rounded border border-white/10 bg-black/20 p-2"><img src={d.imageUrl} alt="融合效果图" className="max-h-64 w-full rounded object-contain" /></section>}
      <section data-exhibition-compact-section="prompt" data-exhibition-compact-item="main" className="rounded border border-white/10 bg-white/[0.03] p-2"><div className="mb-1 text-[10px] font-semibold text-cyan-100">生成约束 Prompt</div><div className="max-h-36 overflow-y-auto whitespace-pre-wrap text-[9px] leading-relaxed text-white/55">{previewPrompt}</div></section>
    </div>
    <ReverseIsometricLayoutModal open={layoutOpen} planUrl={planImage} allowBlankStage aspectRatio={`${hallLengthMm} / ${hallWidthMm}`} title="融合效果图 · 手动排版" hallLengthMm={hallLengthMm} hallWidthMm={hallWidthMm} items={layoutItems} disabled={isReadonly || busy} onDimensionsChange={(dimensions) => update(dimensions)} onChange={persistLayoutItems} onClose={() => setLayoutOpen(false)} onReset={() => update({ manualLayoutItems: normalizeReverseIsometricLayoutItems([], exhibitImages), excludedLayoutUrls: [] })} />
  </div>;
};

export default memo(FusionRenderDesignNode);
