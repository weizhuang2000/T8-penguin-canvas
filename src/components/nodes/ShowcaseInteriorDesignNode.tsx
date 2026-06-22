import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Boxes, Image as ImageIcon, Loader2, Palette, Play, Ruler, Settings2 } from 'lucide-react';
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


  const previewReferenceImages = useMemo(() => [
    ...exhibitItems.map((item) => item.url),
    colorMaterialReferenceImage,
  ].filter(Boolean), [colorMaterialReferenceImage, exhibitItems]);

  const previewPrompt = useMemo(() => buildShowcaseInteriorDesignPrompt({
    showcaseStyle,
    exhibitItems,
    colorMaterialPresetText: colorMaterialTextFromPreset(selectedColorMaterialPreset),
    manualColorMaterial: selectedColorMaterialPreset ? '' : d.colorMaterial,
    colorMaterialReferenceTone: d.colorMaterialReferenceTone,
    hasColorMaterialReferenceImage: !!colorMaterialReferenceImage,
    perspectiveEnabled: d.perspectiveEnabled !== false,
    dimensionMarksEnabled: d.dimensionMarksEnabled === true,
    explodedViewEnabled: d.explodedViewEnabled === true,
    supplement: d.supplement,
  }), [colorMaterialReferenceImage, d.colorMaterial, d.colorMaterialReferenceTone, d.dimensionMarksEnabled, d.explodedViewEnabled, d.perspectiveEnabled, d.supplement, exhibitItems, selectedColorMaterialPreset, showcaseStyle]);

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

  const runGenerate = useCallback(async () => {
    if (isReadonly || busy) return;
    const imagePrompt = buildShowcaseInteriorDesignPrompt({
      showcaseStyle,
      exhibitItems,
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
      ...exhibitItems.map((item) => item.url),
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
      lastPrompt: imagePrompt,
      lastSeed: runSeed,
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
  }, [activeCanvasId, apiModel, aspectRatio, busy, colorMaterialReferenceImage, d.colorMaterial, d.colorMaterialReferenceTone, d.dimensionMarksEnabled, d.explodedViewEnabled, d.perspectiveEnabled, d.providerParams, d.supplement, d.taskId, exhibitItems, externalProviderModel, id, isExternalSelected, isReadonly, modelDef.id, modelDef.paramKind, outputFormat, providerSelection.provider, seed, selectedColorMaterialPreset, showcaseStyle, sizeLevel, update]);

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
                    <span className="text-[9px] text-white/45">高度 mm</span>
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
    </div>
  );
};

export default memo(ShowcaseInteriorDesignNode);
