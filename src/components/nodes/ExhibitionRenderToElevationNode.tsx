import { memo, useCallback, useMemo, useRef } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Loader2, Play, RefreshCw, Square, Wand2 } from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
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
  buildRenderToElevationAnalysisMessages,
  buildRenderToElevationImagePrompt,
  normalizeElevationSections,
  parseElevationSectionsFromLlmResponse,
  parseElevationSectionsFromText,
  type RenderToElevationSection,
} from '../../utils/exhibitionRenderToElevationPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const PRIMARY_BUTTON = 'inline-flex h-8 items-center justify-center gap-1 rounded bg-cyan-400 px-3 text-[11px] font-medium text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function randomImageSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return (values[0] % MAX_IMAGE_SEED) + 1;
  }
  return Math.floor(Math.random() * MAX_IMAGE_SEED) + 1;
}

function textValuesFromData(data: any): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
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

function imagesFromData(data: any): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
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

function useInputTextByHandle(nodeId: string, handle: string): string {
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
    const texts: string[] = [];
    for (const node of list) {
      texts.push(...textValuesFromData((node as any)?.data || {}));
    }
    return texts.join('\n\n').trim();
  }, [nodesData]);
}

function useInputImageByHandle(nodeId: string, handle: string): string {
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

function outputName(section: RenderToElevationSection): string {
  const title = String(section.title || '').trim() || `立面${section.index}`;
  const normalized = title.startsWith(`立面${section.index}`) ? title : `立面${section.index}-${title}`;
  return normalized.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
}

const ExhibitionRenderToElevationNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const abortRef = useRef(false);

  const upstreamText = useInputTextByHandle(id, 'document-text');
  const referenceImage = useInputImageByHandle(id, 'reference-image');
  const sourceText = upstreamText || String(d.sourceText || '').trim();
  const imageAdvancedProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredLlmModel }];
  }, [configuredLlmModel, llmConfigs]);
  const selectedLlmKeyId = String(d.llmKeyId || '').trim();
  const activeLlmConfig = llmConfigOptions.find((item) => item.id === selectedLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const llmModel = String(d.llmModel || activeLlmConfig?.model || configuredLlmModel).trim() || configuredLlmModel;
  const providerSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'image', {
      providerSource: d.providerSource,
      providerId: d.providerId,
      providerModel: d.providerModel,
    }),
    [advancedProviders, d.providerId, d.providerModel, d.providerSource],
  );
  const isExternalSelected = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const externalModelOptions = providerSelection.provider ? advancedProviderModelOptions(providerSelection.provider, 'image') : [];
  const externalProviderModel = providerSelection.providerModel || externalModelOptions[0] || '';
  const firstImageAdvancedProvider = imageAdvancedProviders[0] || null;
  const providerSelectValue = isExternalSelected
    ? providerSelection.providerId
    : (allowZhenzhenFallback ? 'zhenzhen' : (firstImageAdvancedProvider?.id || ''));

  const model = String(d.model || 'gpt-image-2');
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const apiModel = String(d.apiModel || modelDef.apiModel);
  const aspectRatio = String(d.aspectRatio || modelDef.defaultAspectRatio || '16:9');
  const sizeLevel = String(d.sizeLevel || modelDef.defaultSize || '2K');
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const outputImageUrls = Array.isArray(d.imageUrls) && d.imageUrls.length ? d.imageUrls.filter(Boolean) : (d.imageUrl ? [d.imageUrl] : []);
  const outputImageNames = Array.isArray(d.imageNames) ? d.imageNames.map((item: unknown) => String(item || '').trim()) : [];
  const parsedElevations = normalizeElevationSections(d.parsedElevations);
  const status = String(d.status || 'idle');
  const isGenerating = status === 'generating' || status === 'analyzing';

  const analyzeElevations = useCallback(async (): Promise<RenderToElevationSection[]> => {
    if (!sourceText) throw new Error('请接入或填写包含“立面1：...”的文本');
    const ruleSections = parseElevationSectionsFromText(sourceText);
    const messages = buildRenderToElevationAnalysisMessages({ sourceText, referenceImage });
    const shouldUseLlm = ruleSections.length === 0 || referenceImage;
    if (!shouldUseLlm) return ruleSections;
    update({ status: 'analyzing', progress: 'LLM 正在识别立面', error: '' });
    const res = await generateLlm({
      model: llmModel,
      llmKeyId: activeLlmConfig?.id && activeLlmConfig.id !== 'default' ? activeLlmConfig.id : undefined,
      messages: messages as any,
      temperature: 0.2,
      max_tokens: 3000,
    });
    const llmSections = parseElevationSectionsFromLlmResponse(res.content);
    const sections = llmSections.length ? llmSections : ruleSections;
    if (!sections.length) throw new Error('未识别到立面内容，请补充“立面1：...”格式后重试');
    update({ parsedElevations: sections, analysisText: res.content, progress: `识别到 ${sections.length} 个立面` });
    return sections;
  }, [activeLlmConfig?.id, llmModel, referenceImage, sourceText, update]);

  const runGenerate = useCallback(async () => {
    const src = '效果图转立面';
    if (!referenceImage) throw new Error('请接入效果图参考图');
    if (isGenerating) return;
    abortRef.current = false;
    const generatedUrls: string[] = [];
    const generatedNames: string[] = [];
    const elevationResults: any[] = [];
    let latestTaskId = '';
    let latestSeed = seed || randomImageSeed();
    taskCompletionSound.primeAudio();
    update({
      status: 'analyzing',
      progress: '准备识别立面',
      error: '',
      imageUrl: '',
      imageUrls: [],
      imageNames: [],
      elevationResults: [],
      referenceImages: [referenceImage],
      lastSeed: latestSeed,
    });
    try {
      const sections = await analyzeElevations();
      update({ status: 'generating', progress: `0/${sections.length}` });
      for (let index = 0; index < sections.length; index += 1) {
        if (abortRef.current) throw new Error('任务已取消');
        const section = sections[index];
        const runSeed = index === 0 ? latestSeed : randomImageSeed();
        latestSeed = runSeed;
        const name = outputName(section);
        const prompt = buildRenderToElevationImagePrompt({
          ...section,
          supplement: d.supplement,
        });
        const historyContext = {
          canvasId: activeCanvasId,
          sourceNodeId: id,
          sourceNodeType: 'exhibition-render-to-elevation',
          seed: runSeed,
          nodeTitle: `效果图转立面 ${index + 1}/${sections.length}`,
          outputTitle: name,
        };
        update({ status: 'generating', progress: `提交 ${index + 1}/${sections.length}`, lastPrompt: prompt, lastSeed: runSeed });
        let urls: string[] = [];
        let remoteUrls: string[] | undefined;
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
            images: [referenceImage],
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
          if ((!res.imageUrls?.length) && res.taskId && (res.code === 'running' || res.status === 'running')) {
            let pollingTaskId = res.taskId;
            for (let pollIndex = 0; pollIndex < EXTERNAL_IMAGE_MAX_POLLS; pollIndex += 1) {
              if (abortRef.current) throw new Error('任务已取消');
              await new Promise((resolve) => setTimeout(resolve, EXTERNAL_IMAGE_POLL_INTERVAL_MS));
              res = await queryExternalImageStatus({
                providerId: providerSelection.provider.id,
                providerModel: externalProviderModel,
                taskId: pollingTaskId,
                outputFormat,
                historyContext,
              });
              pollingTaskId = res.taskId || pollingTaskId;
              update({ progress: `${index + 1}/${sections.length} · ${Math.min(99, Math.round(((pollIndex + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%`, taskId: pollingTaskId });
              if (res.imageUrls?.length || (res.code && res.code !== 'running')) break;
            }
          }
          urls = res.imageUrls || [];
          remoteUrls = res.remoteImageUrls;
          taskId = res.taskId || '';
        } else {
          const submit = await submitImageAsync({
            model: modelDef.id,
            apiModel,
            paramKind: modelDef.paramKind,
            prompt,
            aspect_ratio: aspectRatio,
            image_size: sizeLevel,
            images: [referenceImage],
            n: 1,
            outputFormat,
            seed: runSeed,
            historyContext,
          });
          if (submit.sync && submit.urls?.length) {
            urls = submit.urls;
          } else {
            if (!submit.taskId) throw new Error('未获取到任务 ID');
            taskId = submit.taskId;
            let lastProgress = submit.progress || '5%';
            update({ progress: `${index + 1}/${sections.length} · ${lastProgress}`, taskId });
            for (let pollIndex = 0; pollIndex < 1800; pollIndex += 1) {
              if (abortRef.current) throw new Error('任务已取消');
              await new Promise((resolve) => setTimeout(resolve, 2000));
              const q = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
              if (q.progress && q.progress !== lastProgress) {
                lastProgress = q.progress;
                update({ progress: `${index + 1}/${sections.length} · ${q.progress}` });
              }
              const qStatus = String(q.status || '').toLowerCase();
              if (qStatus === 'completed' || qStatus === 'success' || qStatus === 'done') {
                urls = q.urls || [];
                break;
              }
              if (qStatus === 'failed' || qStatus === 'failure' || qStatus === 'error') {
                throw new Error(q.error || '任务失败');
              }
            }
          }
        }
        const url = urls.find(Boolean);
        if (!url) throw new Error(`${name} 生成完成但未返回图片`);
        generatedUrls.push(url);
        generatedNames.push(name);
        if (taskId) latestTaskId = taskId;
        elevationResults.push({
          ...section,
          name,
          imageUrl: url,
          remoteImageUrl: remoteUrls?.find(Boolean) || '',
          prompt,
          seed: runSeed,
          taskId,
        });
        update({
          status: index + 1 >= sections.length ? 'success' : 'generating',
          progress: `${index + 1}/${sections.length} 完成`,
          imageUrl: generatedUrls[0],
          imageUrls: generatedUrls.slice(),
          imageNames: generatedNames.slice(),
          elevationResults: elevationResults.slice(),
          parsedElevations: sections,
          referenceImages: [referenceImage],
          lastPrompt: prompt,
          lastSeed: runSeed,
          taskId: latestTaskId,
          error: '',
        });
        logBus.success(`${src}完成 ${name} -> ${url}`, src);
      }
      update({ status: 'success', progress: '100%', taskId: latestTaskId });
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const message = error?.message || '生成失败';
      logBus.error(`${src}失败：${message}`, src);
      update({ status: 'error', error: message });
      throw error;
    }
  }, [
    activeCanvasId,
    analyzeElevations,
    apiModel,
    aspectRatio,
    d.providerParams,
    d.supplement,
    externalProviderModel,
    id,
    isExternalSelected,
    isGenerating,
    modelDef.id,
    modelDef.paramKind,
    outputFormat,
    providerSelection.provider,
    referenceImage,
    seed,
    sizeLevel,
    update,
  ]);

  useRunTrigger(id, runGenerate, 'image');
  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      data-exhibition-compact-node-type="exhibition-render-to-elevation"
      className={`relative w-[520px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!border-0" style={{ background: PORT_COLOR.image }} title="输出：立面图" />
      <Handle id="document-text" type="target" position={Position.Left} className="!border-0" style={{ top: '30%', background: PORT_COLOR.text }} title="输入：立面文本" />
      <Handle id="reference-image" type="target" position={Position.Left} className="!border-0" style={{ top: '58%', background: PORT_COLOR.image }} title="输入：效果图参考" />

      <div className="nodrag nopan space-y-3 p-3 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wand2 size={16} className="text-cyan-300" />
              效果图转立面
            </div>
            <div className="mt-0.5 truncate text-[10px] text-white/45">
              文本 + 效果图 → 多张独立立面图
            </div>
          </div>
          <div className="rounded bg-white/[0.06] px-2 py-1 text-[10px] text-white/60">{status}</div>
        </div>

        <div className="grid grid-cols-[112px_1fr] gap-2 text-[11px]">
          <div className="rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 text-white/50">立面文本</div>
            <div className="line-clamp-4 text-white/75">{sourceText || '接入文本素材'}</div>
          </div>
          <div className="rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 text-white/50">效果图参考</div>
            {referenceImage ? (
              <img src={referenceImage} alt="效果图参考" className="h-24 w-full rounded object-cover" draggable={false} />
            ) : (
              <div className="flex h-24 items-center justify-center rounded bg-white/[0.04] text-white/35">
                <ImageIcon size={18} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] text-white/45">LLM Key</span>
            <select
              className={FIELD}
              value={activeLlmConfig?.id || 'default'}
              disabled={isReadonly || isGenerating}
              onChange={(event) => {
                const cfg = llmConfigOptions.find((item) => item.id === event.target.value);
                update({ llmKeyId: event.target.value, llmModel: cfg?.model || llmModel });
              }}
            >
              {llmConfigOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label || item.id}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/45">LLM 模型</span>
            <input
              className={FIELD}
              value={llmModel}
              disabled={isReadonly || isGenerating}
              onChange={(event) => update({ llmModel: event.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/45">生图平台</span>
            <select
              className={FIELD}
              value={providerSelectValue}
              disabled={isReadonly || isGenerating}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'zhenzhen') {
                  update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
                  return;
                }
                const provider = imageAdvancedProviders.find((item) => item.id === value);
                const models = provider ? advancedProviderModelOptions(provider, 'image') : [];
                update({
                  providerSource: provider?.protocol || 'zhenzhen',
                  providerId: provider?.id || '',
                  providerModel: models[0] || '',
                });
              }}
            >
              {allowZhenzhenFallback && <option value="zhenzhen">默认生图</option>}
              {imageAdvancedProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/45">图像模型</span>
            {isExternalSelected ? (
              <select
                className={FIELD}
                value={externalProviderModel}
                disabled={isReadonly || isGenerating}
                onChange={(event) => update({ providerModel: event.target.value })}
              >
                {externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            ) : (
              <select
                className={FIELD}
                value={model}
                disabled={isReadonly || isGenerating}
                onChange={(event) => {
                  const next = IMAGE_MODELS.find((item) => item.id === event.target.value) || IMAGE_MODELS[0];
                  update({
                    model: next.id,
                    apiModel: next.apiModel,
                    aspectRatio: next.defaultAspectRatio || aspectRatio,
                    sizeLevel: next.defaultSize || sizeLevel,
                  });
                }}
              >
                {availableModelDefs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            )}
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/45">比例</span>
            <select className={FIELD} value={aspectRatio} disabled={isReadonly || isGenerating} onChange={(event) => update({ aspectRatio: event.target.value })}>
              {['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/45">尺寸</span>
            <select className={FIELD} value={sizeLevel} disabled={isReadonly || isGenerating} onChange={(event) => update({ sizeLevel: event.target.value })}>
              {['1K', '2K', '4K'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/45">格式</span>
            <select className={FIELD} value={outputFormat} disabled={isReadonly || isGenerating} onChange={(event) => update({ outputFormat: event.target.value })}>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/45">Seed</span>
            <input
              className={FIELD}
              type="number"
              min={0}
              max={MAX_IMAGE_SEED}
              value={seed}
              disabled={isReadonly || isGenerating}
              onChange={(event) => update({ seed: clampNumber(event.target.value, 0, MAX_IMAGE_SEED, 0) })}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] text-white/45">补充要求</span>
          <textarea
            className={`${FIELD} min-h-[54px] resize-y`}
            value={String(d.supplement || '')}
            disabled={isReadonly || isGenerating}
            placeholder="可选：指定图纸风格、材质、文字密度、汇报深度..."
            onChange={(event) => update({ supplement: event.target.value })}
          />
        </label>

        {parsedElevations.length > 0 && (
          <div className="rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 text-[10px] text-white/45">已识别立面</div>
            <div className="flex flex-wrap gap-1">
              {parsedElevations.map((item: RenderToElevationSection) => (
                <span key={`${item.index}-${item.title}`} className="rounded bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100">
                  立面{item.index} · {item.title}
                </span>
              ))}
            </div>
          </div>
        )}

        {outputImageUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {outputImageUrls.map((url: string, index: number) => (
              <div key={`${url}-${index}`} className="overflow-hidden rounded border border-white/10 bg-black/20">
                <img src={url} alt={outputImageNames[index] || `立面${index + 1}`} className="h-24 w-full object-cover" draggable={false} />
                <div className="truncate px-2 py-1 text-[10px] text-white/60">{outputImageNames[index] || `立面${index + 1}`}</div>
              </div>
            ))}
          </div>
        )}

        {(d.progress || d.error) && (
          <div className={`rounded px-2 py-1 text-[10px] ${d.error ? 'bg-red-500/10 text-red-200' : 'bg-cyan-400/10 text-cyan-100'}`}>
            {d.error || d.progress}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={isReadonly || isGenerating || !sourceText}
            onClick={async () => {
              try {
                await analyzeElevations();
                update({ status: 'idle' });
              } catch (error: any) {
                update({ status: 'error', error: error?.message || '识别失败' });
              }
            }}
          >
            <RefreshCw size={13} /> 重新识别
          </button>
          {isGenerating ? (
            <button type="button" className={BUTTON} onClick={() => { abortRef.current = true; }}>
              <Square size={13} /> 停止
            </button>
          ) : (
            <button type="button" className={PRIMARY_BUTTON} disabled={isReadonly || !sourceText || !referenceImage} onClick={runGenerate}>
              <Play size={14} /> 生成立面
            </button>
          )}
        </div>

        {isGenerating && (
          <div className="flex items-center gap-2 text-[10px] text-cyan-100">
            <Loader2 size={12} className="animate-spin" />
            {d.progress || '处理中'}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ExhibitionRenderToElevationNode);
