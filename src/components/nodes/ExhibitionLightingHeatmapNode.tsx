import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { PORT_COLOR } from '../../config/portTypes';
import { Image as ImageIcon, Play, SunMedium, ThermometerSun } from 'lucide-react';
import { IMAGE_MODELS } from '../../providers/models';
import {
  generateExternalImage,
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
  buildExhibitionLightingHeatmapPrompt,
  EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS,
  normalizeExhibitionLightingHeatmapFocusItems,
  normalizeExhibitionLightingHeatmapMode,
  type ExhibitionLightingHeatmapMode,
} from '../../utils/exhibitionLightingHeatmapPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;

const MODE_OPTIONS: Array<{ id: ExhibitionLightingHeatmapMode; label: string; hint: string }> = [
  { id: 'overlay', label: '覆盖层图', hint: '保留原图并叠加半透明热力色' },
  { id: 'technical', label: '独立分析图', hint: '弱化材质，输出伪彩色照明分析图' },
];

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
  push(data?.firstFrameUrl);
  return out;
}

function firstImageFromData(data: any): string {
  return imagesFromData(data)[0] || '';
}

function useInputImageByHandle(nodeId: string, handle: string): string {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns.filter((conn: any) => (conn.targetHandle || '') === handle).map((conn: any) => conn.source).filter(Boolean))),
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('输入图像加载失败'));
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.src = src;
  });
}

async function readImageNaturalRatio(imageUrl: string): Promise<number> {
  const image = await loadImage(imageUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('Invalid image dimensions');
  return width / height;
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
  if (candidates.length === 0) return options[0] || '1:1';
  return candidates.reduce((best, item) => (
    Math.abs(item.ratio - sourceRatio) < Math.abs(best.ratio - sourceRatio) ? item : best
  )).value;
}

function ImageSlot({ url }: { url: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/15 p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 输入图像</div>
      {url ? (
        <img src={url} alt="" className="h-40 w-full rounded border border-white/10 object-contain" draggable={false} />
      ) : (
        <div className="flex h-40 items-center justify-center rounded border border-dashed border-white/15 text-[10px] text-white/35">连接上游图像输入</div>
      )}
    </div>
  );
}

const ExhibitionLightingHeatmapNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const pollAbortRef = useRef(false);
  const sourceImage = useInputImageByHandle(id, 'source-image');
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);

  const status = String(d.status || 'idle');
  const busy = status === 'generating';
  const mode = normalizeExhibitionLightingHeatmapMode(d.heatmapMode || d.mode) as ExhibitionLightingHeatmapMode;
  const focusItems = useMemo(() => normalizeExhibitionLightingHeatmapFocusItems(d.focusItems), [d.focusItems]);
  const model = d.model || 'gpt-image-2';
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const availableModelDefs = useMemo(() => IMAGE_MODELS.filter((item) => item.paramKind !== 'mj'), []);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || '16:9';
  const sizeLevel = d.sizeLevel || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
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
  const externalModelOptions = providerSelection.provider ? advancedProviderModelOptions(providerSelection.provider, 'image') : [];
  const externalProviderModel = providerSelection.providerModel || externalModelOptions[0] || '';
  const firstImageAdvancedProvider = imageAdvancedProviders[0] || null;
  const providerSelectValue = isExternalSelected
    ? providerSelection.providerId
    : (allowZhenzhenFallback ? 'zhenzhen' : (firstImageAdvancedProvider?.id || ''));

  const prompt = useMemo(() => buildExhibitionLightingHeatmapPrompt({
    mode,
    focusItems,
    supplement: d.supplement,
  }), [d.supplement, focusItems, mode]);

  useEffect(() => {
    if (!sourceImage || isReadonly || busy) return;
    const ratioSourceKey = `${sourceImage}|${modelDef.id}`;
    if (d.aspectRatioSource === ratioSourceKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const sourceRatio = await readImageNaturalRatio(sourceImage);
        const nextRatio = closestAspectRatio(sourceRatio, modelDef.aspectRatios);
        if (!cancelled) update({ aspectRatio: nextRatio, aspectRatioSource: ratioSourceKey });
      } catch {
        if (!cancelled) update({ aspectRatioSource: ratioSourceKey });
      }
    })();
    return () => { cancelled = true; };
  }, [busy, d.aspectRatioSource, isReadonly, modelDef.aspectRatios, modelDef.id, sourceImage, update]);

  useEffect(() => {
    const refs = [sourceImage].filter(Boolean);
    if (d.prompt !== prompt || d.outputText !== prompt || d.text !== prompt || JSON.stringify(d.referenceImages || []) !== JSON.stringify(refs)) {
      update({ prompt, outputText: prompt, text: prompt, referenceImages: refs });
    }
  }, [d.outputText, d.prompt, d.referenceImages, d.text, prompt, sourceImage, update]);

  const toggleFocusItem = (focusId: string) => {
    const current = new Set(focusItems);
    if (current.has(focusId)) current.delete(focusId);
    else current.add(focusId);
    update({ focusItems: Array.from(current) });
  };

  const runGenerate = useCallback(async () => {
    if (isReadonly) return;
    if (!sourceImage) {
      const msg = '请先连接输入图像';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    const runtimeReferenceImages = [sourceImage];
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-lighting-heatmap:${id.slice(0, 6)}`;
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'exhibition-lighting-heatmap',
      seed: runSeed,
      nodeTitle: '灯光热力图',
    };
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
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
        logBus.info(`灯光热力图提交: ${providerSelection.provider.label || providerSelection.provider.id} / ${externalProviderModel}`, src);
        let res = await generateExternalImage({
          providerId: providerSelection.provider.id,
          providerModel: externalProviderModel,
          model: externalProviderModel,
          prompt,
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
        const urls = res.imageUrls || [];
        if (!urls.length) throw new Error('扩展平台完成但未返回图片');
        update({
          status: 'success',
          progress: '100%',
          imageUrl: urls[0],
          imageUrls: urls,
          urls,
          remoteImageUrls: res.remoteImageUrls,
          lastPrompt: prompt,
          lastSeed: runSeed,
          taskId: res.taskId || d.taskId,
          usedI2I: true,
          error: '',
        });
        logBus.success(`灯光热力图完成 -> ${urls[0]}`, src);
        taskCompletionSound.notifyComplete(id, 'image');
        return;
      }

      logBus.info(`灯光热力图提交: model=${apiModel} ratio=${aspectRatio} size=${sizeLevel}`, src);
      const submit = await submitImageAsync({
        model: modelDef.id,
        apiModel,
        paramKind: modelDef.paramKind,
        prompt,
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
          urls: submit.urls,
          lastPrompt: prompt,
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
        const statusText = String(q.status || '').toLowerCase();
        if (statusText === 'completed' || statusText === 'success' || statusText === 'done') {
          const url = q.urls?.[0];
          if (!url) throw new Error('任务完成但未返回图片');
          update({
            status: 'success',
            progress: '100%',
            imageUrl: url,
            imageUrls: q.urls,
            urls: q.urls,
            lastPrompt: prompt,
            lastSeed: runSeed,
            usedI2I: true,
            error: '',
          });
          logBus.success(`灯光热力图完成 -> ${url}`, src);
          taskCompletionSound.notifyComplete(id, 'image');
          return;
        }
        if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') {
          throw new Error(q.error || '任务失败');
        }
      }
      throw new Error('轮询超时');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      logBus.error(`灯光热力图失败: ${msg}`, src);
      update({ status: 'error', error: msg });
      throw error;
    }
  }, [
    activeCanvasId,
    apiModel,
    aspectRatio,
    d.providerParams,
    d.taskId,
    externalProviderModel,
    id,
    isExternalSelected,
    isReadonly,
    modelDef.id,
    modelDef.paramKind,
    outputFormat,
    prompt,
    providerSelection.provider,
    seed,
    sizeLevel,
    sourceImage,
    update,
  ]);

  useRunTrigger(id, runGenerate, 'image');

  return (
    <div
      data-exhibition-compact-node-type="exhibition-lighting-heatmap"
      className={`relative w-[640px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle id="source-image" type="target" position={Position.Left} className="!h-3 !w-3 !border-0" style={{ top: '30%', background: PORT_COLOR.image }} title="输入：展陈空间图像" />
      <Handle type="source" position={Position.Right} className="!border-0" style={{ background: PORT_COLOR.image }} title="输出：灯光热力图（图像）" />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <ThermometerSun size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">灯光热力图</div>
          <div className="truncate text-[10px] text-white/45">展陈空间 / 光照强弱 / 热力分析 / 图生图输出</div>
        </div>
      </div>

      <div className="nodrag nopan max-h-[760px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <ImageSlot url={sourceImage} />

        <section data-exhibition-compact-section="analysis" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
            <SunMedium size={13} /> 热力分析
          </div>
          <div data-exhibition-compact-item="mode" className="grid grid-cols-2 gap-1">
            {MODE_OPTIONS.map((item) => {
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isReadonly || busy}
                  className={`min-h-14 rounded border px-2 py-1 text-left transition ${
                    active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                  onClick={() => update({ heatmapMode: item.id })}
                >
                  <span className="block text-[10px] font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-[9px] leading-snug opacity-70">{item.hint}</span>
                </button>
              );
            })}
          </div>

          <div data-exhibition-compact-item="focus" className="grid grid-cols-4 gap-1">
            {EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS.map((item) => {
              const active = focusItems.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isReadonly || busy}
                  onClick={() => toggleFocusItem(item.id)}
                  className={`rounded border px-2 py-1.5 text-[10px] font-semibold transition ${
                    active ? 'border-amber-300/55 bg-amber-300/15 text-amber-100' : 'border-white/10 bg-black/15 text-white/50 hover:bg-white/[0.08]'
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <textarea
            data-exhibition-compact-item="supplement"
            className={`${FIELD} min-h-[56px] resize-y`}
            value={d.supplement || ''}
            disabled={isReadonly || busy}
            placeholder="补充要求，例如：重点分析展柜区域、突出墙面洗墙灯、弱化观众区"
            onChange={(event) => update({ supplement: event.target.value })}
          />
        </section>

        <section data-exhibition-compact-section="model" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生成</div>
            <button data-exhibition-compact-item="actions" type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成灯光热力图</button>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
            <label data-exhibition-compact-item="provider" className="space-y-1">
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
            <label data-exhibition-compact-item="model" className="space-y-1">
              <span className="text-[10px] text-white/55">生图模型</span>
              {isExternalSelected ? (
                <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy || externalModelOptions.length === 0} onChange={(event) => update({ providerModel: event.target.value })}>
                  {externalModelOptions.length > 0 ? externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>) : <option value="">未配置图像模型</option>}
                </select>
              ) : (
                <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(event) => update({ apiModel: event.target.value })}>
                  {modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              )}
            </label>
            <label data-exhibition-compact-item="model" className="space-y-1">
              <span className="text-[10px] text-white/55">基础模型</span>
              <select className={FIELD} value={modelDef.id} disabled={isReadonly || busy || isExternalSelected} onChange={(event) => {
                const next = availableModelDefs.find((item) => item.id === event.target.value) || modelDef;
                update({ model: next.id, apiModel: next.apiModel });
              }}>
                {availableModelDefs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label data-exhibition-compact-item="aspect-size" className="space-y-1">
              <span className="text-[10px] text-white/55">画面比例</span>
              <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
                {modelDef.aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </label>
            <label data-exhibition-compact-item="aspect-size" className="space-y-1">
              <span className="text-[10px] text-white/55">分辨率</span>
              <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </label>
            <label data-exhibition-compact-item="output-format" className="space-y-1">
              <span className="text-[10px] text-white/55">输出格式</span>
              <div className="grid grid-cols-2 gap-0.5 rounded bg-white/5 p-0.5">
                {(['jpg', 'png'] as const).map((fmt) => {
                  const active = outputFormat === fmt;
                  return (
                    <button
                      key={fmt}
                      type="button"
                      disabled={isReadonly || busy}
                      onClick={() => update({ outputFormat: fmt })}
                      className={`rounded py-1 text-[10px] font-semibold transition-all ${active ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </label>
            <label data-exhibition-compact-item="seed-name" className="space-y-1">
              <span className="text-[10px] text-white/55">Seed</span>
              <input className={FIELD} type="number" min={0} value={seed || ''} disabled={isReadonly || busy} placeholder="随机" onChange={(event) => update({ seed: event.target.value })} />
            </label>
          </div>
          {d.progress && <div data-exhibition-compact-item="progress" className="text-[10px] text-cyan-100">{d.progress}</div>}
          {d.imageUrl && <img data-exhibition-compact-item="preview" src={d.imageUrl} alt="" className="max-h-56 w-full rounded border border-white/10 object-contain" draggable={false} />}
        </section>
      </div>
    </div>
  );
};

export default memo(ExhibitionLightingHeatmapNode);
