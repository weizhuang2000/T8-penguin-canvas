import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Brain, FileText, Image as ImageIcon, Loader2, Play, Theater, Upload } from 'lucide-react';
import { EXHIBITION_IMAGE_HANDLE_COLOR, EXHIBITION_TEXT_HANDLE_COLOR } from '../../config/portTypes';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
import { extractDocument, MAX_DOCUMENT_FILE_SIZE, MAX_DOCUMENT_FILE_SIZE_MB, type ExtractedDocument } from '../../services/api';
import { generateExternalImage, generateLlm, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  buildExhibitionSceneExtractPrompt,
  buildExhibitionSceneImagePrompt,
  EXHIBITION_SCENE_ATMOSPHERES,
  EXHIBITION_SCENE_CATEGORIES,
  EXHIBITION_SCENE_CROWD_DENSITIES,
  EXHIBITION_SCENE_PRESENTATION_FORMS,
  EXHIBITION_SCENE_SPATIAL_SCALES,
  normalizeExhibitionSceneAtmosphere,
  normalizeExhibitionSceneCategory,
  normalizeExhibitionSceneCrowdDensity,
  normalizeExhibitionScenePresentationForm,
  normalizeExhibitionSceneSpatialScale,
  parseExhibitionSceneExtractJson,
  type ExhibitionSceneOption,
} from '../../utils/exhibitionSceneDesignPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import PromptTextarea from '../PromptTextarea';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import MentionPromptInput from './MentionPromptInput';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;

interface InputImageItem {
  id: string;
  url: string;
  label: string;
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

function shortFileLabel(url: string, fallback = '图像') {
  return (url.split('/').pop() || fallback).split('?')[0].slice(0, 28) || fallback;
}

function useInputImagesByHandle(nodeId: string, handle: string): InputImageItem[] {
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
    const out: InputImageItem[] = [];
    for (const node of list) {
      const sourceId = String((node as any)?.id || '');
      const urls = imagesFromData((node as any)?.data || {});
      urls.forEach((url, index) => {
        if (!out.some((item) => item.url === url)) {
          out.push({
            id: `${sourceId || 'source'}:${handle}:${index}`,
            url,
            label: shortFileLabel(url, handle === 'environment-reference' ? '环境参考' : '人物道具'),
          });
        }
      });
    }
    return out;
  }, [handle, nodesData]);
}

function llmErrorMessage(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/no available accounts/i.test(message)) return '当前 LLM 没有可用账号，请切换可用的 LLM 配置后重试。';
  return message || 'LLM 请求失败';
}

const ExhibitionSceneDesignNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef(false);
  const upstream = useUpstreamMaterials(id);
  const environmentReferenceItems = useInputImagesByHandle(id, 'environment-reference');
  const peoplePropsReferenceItems = useInputImagesByHandle(id, 'people-props');
  const environmentReferenceImages = useMemo(() => environmentReferenceItems.map((item) => item.url), [environmentReferenceItems]);
  const peoplePropsReferenceImages = useMemo(() => peoplePropsReferenceItems.map((item) => item.url), [peoplePropsReferenceItems]);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);

  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredLlmModel }];
  }, [configuredLlmModel, llmConfigs]);
  const selectedLlmKeyId = String(d.llmKeyId || '').trim();
  const activeLlmConfig = llmConfigOptions.find((item) => item.id === selectedLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const llmModel = activeLlmConfig?.model || String(d.llmModel || '').trim() || configuredLlmModel;

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
  const aspectRatio = d.aspectRatio || '16:9';
  const sizeLevel = d.sizeLevel || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));

  const sceneCategory = normalizeExhibitionSceneCategory(d.sceneCategory);
  const presentationForm = normalizeExhibitionScenePresentationForm(d.presentationForm);
  const spatialScale = normalizeExhibitionSceneSpatialScale(d.spatialScale);
  const atmosphere = normalizeExhibitionSceneAtmosphere(d.atmosphere);
  const crowdDensity = normalizeExhibitionSceneCrowdDensity(d.crowdDensity);
  const titleText = String(d.titleText || '').trim();
  const themeText = String(d.themeText || '').trim();
  const sceneText = String(d.sceneText || '').trim();
  const interactionText = String(d.interactionText || '').trim();
  const peoplePropsText = String(d.peoplePropsText || '');
  const peoplePropsMentions: MediaMention[] = Array.isArray(d.peoplePropsMentions) ? d.peoplePropsMentions : [];
  const sourceText = String(d.sourceText || '');
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const effectiveSourceText = [d.useUpstream !== false ? upstreamText : '', sourceText].filter((item) => item.trim()).join('\n\n');
  const status = String(d.status || 'idle');
  const busy = ['extracting', 'generating', 'uploading'].includes(status);

  const mentionMaterials: Material[] = useMemo(() => peoplePropsReferenceItems.map((item, index) => ({
    id: item.id,
    kind: 'image',
    url: item.url,
    sourceNodeId: item.id.split(':')[0] || `scene-people-props-${index + 1}`,
    origin: 'upstream',
    label: item.label || `人物/道具 ${index + 1}`,
    mentionToken: `@img${environmentReferenceImages.length + index + 1}`,
  })), [environmentReferenceImages.length, peoplePropsReferenceItems]);
  const resolvedPeoplePropsText = useMemo(
    () => resolveMediaMentions(peoplePropsText, peoplePropsMentions, mentionMaterials),
    [mentionMaterials, peoplePropsMentions, peoplePropsText],
  );

  const previewPrompt = useMemo(() => buildExhibitionSceneImagePrompt({
    sceneCategory,
    presentationForm,
    spatialScale,
    atmosphere,
    crowdDensity,
    titleText,
    themeText,
    sceneText,
    interactionText,
    peoplePropsText: resolvedPeoplePropsText,
    environmentReferenceImages,
    peoplePropsReferenceImages,
    hasEnvironmentReferenceImage: environmentReferenceImages.length > 0,
    hasPeoplePropsReferenceImage: peoplePropsReferenceImages.length > 0,
  }), [atmosphere, crowdDensity, environmentReferenceImages, interactionText, peoplePropsReferenceImages, presentationForm, resolvedPeoplePropsText, sceneCategory, sceneText, spatialScale, themeText, titleText]);

  const previewReferenceImages = useMemo(
    () => [...environmentReferenceImages, ...peoplePropsReferenceImages],
    [environmentReferenceImages, peoplePropsReferenceImages],
  );

  useEffect(() => {
    if (
      d.prompt !== previewPrompt ||
      d.outputText !== previewPrompt ||
      d.text !== previewPrompt ||
      JSON.stringify(d.referenceImages || []) !== JSON.stringify(previewReferenceImages) ||
      JSON.stringify(d.environmentReferenceImages || []) !== JSON.stringify(environmentReferenceImages) ||
      JSON.stringify(d.peoplePropsReferenceImages || []) !== JSON.stringify(peoplePropsReferenceImages)
    ) {
      update({
        prompt: previewPrompt,
        outputText: previewPrompt,
        text: previewPrompt,
        referenceImages: previewReferenceImages,
        environmentReferenceImages,
        peoplePropsReferenceImages,
      });
    }
  }, [d.environmentReferenceImages, d.outputText, d.peoplePropsReferenceImages, d.prompt, d.referenceImages, d.text, environmentReferenceImages, peoplePropsReferenceImages, previewPrompt, previewReferenceImages, update]);

  const pickDocument = useCallback(async (file?: File) => {
    if (!file || isReadonly || busy) return;
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      update({ status: 'error', error: `文档不能超过 ${MAX_DOCUMENT_FILE_SIZE_MB}MB` });
      return;
    }
    update({ status: 'uploading', progress: '文档解析中...', error: '' });
    try {
      const extracted = await extractDocument(file);
      const { text, ...documentMeta } = extracted;
      update({ documentMeta, sourceText: text, status: 'idle', progress: '', error: '' });
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '文档解析失败', progress: '' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [busy, isReadonly, update]);

  const runExtract = useCallback(async () => {
    if (isReadonly || busy) return;
    if (!effectiveSourceText.trim()) {
      update({ status: 'error', error: '请先输入、上传或连接上游文本' });
      return;
    }
    update({ status: 'extracting', progress: 'LLM 提炼场景设计文案...', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.25,
        messages: [{ role: 'user', content: buildExhibitionSceneExtractPrompt({ sourceText: effectiveSourceText }) }],
      });
      const parsed = parseExhibitionSceneExtractJson(response.content || '');
      if (!parsed.titleText && !parsed.themeText && !parsed.sceneText && !parsed.interactionText) throw new Error('LLM 未返回有效文案');
      update({
        titleText: parsed.titleText || titleText,
        themeText: parsed.themeText || themeText,
        sceneText: parsed.sceneText || sceneText,
        interactionText: parsed.interactionText || interactionText,
        status: 'idle',
        progress: '',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
    }
  }, [activeLlmConfig?.id, busy, effectiveSourceText, interactionText, isReadonly, llmModel, sceneText, themeText, titleText, update]);

  const runGenerate = useCallback(async () => {
    if (isReadonly || busy) return;
    const imagePrompt = buildExhibitionSceneImagePrompt({
      sceneCategory,
      presentationForm,
      spatialScale,
      atmosphere,
      crowdDensity,
      titleText,
      themeText,
      sceneText,
      interactionText,
      peoplePropsText: resolvedPeoplePropsText,
      environmentReferenceImages,
      peoplePropsReferenceImages,
      hasEnvironmentReferenceImage: environmentReferenceImages.length > 0,
      hasPeoplePropsReferenceImage: peoplePropsReferenceImages.length > 0,
    });
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-scene-design:${id.slice(0, 6)}`;
    const referenceImages = [...environmentReferenceImages, ...peoplePropsReferenceImages];
    update({ status: 'generating', progress: '提交生图...', error: '', imageUrls: [], lastPrompt: imagePrompt, lastSeed: runSeed, referenceImages, environmentReferenceImages, peoplePropsReferenceImages });
    try {
      logBus.info(`场景设计生图提交 seed=${runSeed} refs=${referenceImages.length}`, src);
      const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType: 'exhibition-scene-design', seed: runSeed, nodeTitle: '场景设计' };
      let urls: string[] = [];
      if (isExternalSelected && providerSelection.provider) {
        if (!externalProviderModel) throw new Error('扩展平台未配置可用图像模型');
        const size = externalImageSizeFor(aspectRatio, sizeLevel);
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
          const pollingTaskId = res.taskId;
          for (let index = 0; index < EXTERNAL_IMAGE_MAX_POLLS; index += 1) {
            if (pollAbortRef.current) throw new Error('任务已取消');
            await new Promise((resolve) => setTimeout(resolve, EXTERNAL_IMAGE_POLL_INTERVAL_MS));
            res = await queryExternalImageStatus({
              providerId: providerSelection.provider.id,
              taskId: pollingTaskId,
              providerModel: externalProviderModel,
              outputFormat,
              historyContext,
            });
            update({ taskId: pollingTaskId, progress: `${Math.min(99, Math.round(((index + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%` });
            if (res.imageUrls?.length || (res.code && res.code !== 'running')) break;
          }
        }
        urls = res.imageUrls || [];
      } else {
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
        referenceImages,
        environmentReferenceImages,
        peoplePropsReferenceImages,
        error: '',
      });
      logBus.success(`场景设计生图完成: ${urls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`场景设计生图失败: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, aspectRatio, atmosphere, busy, crowdDensity, d.providerParams, environmentReferenceImages, externalProviderModel, id, interactionText, isExternalSelected, isReadonly, modelDef.id, modelDef.paramKind, outputFormat, peoplePropsReferenceImages, presentationForm, providerSelection.provider, resolvedPeoplePropsText, sceneCategory, sceneText, seed, sizeLevel, spatialScale, themeText, titleText, update]);

  useRunTrigger(id, runGenerate, 'image');

  return (
    <div
      data-exhibition-compact-node-type="exhibition-scene-design"
      className={`relative w-[640px] rounded-xl border-2 transition-all ${selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'}`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!border-0 t8-exhibition-handle--image" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：场景设计图" />
      <Handle id="text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--text" style={{ top: '26%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输入：上游文本资料" />
      <Handle id="environment-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '44%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：整体环境参考图" />
      <Handle id="people-props" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '62%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：人物及道具参考图" />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200"><Theater size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">场景设计</div>
          <div className="truncate text-[10px] text-white/45">文案提炼 / 环境参考 / 人物道具 @ 引用 / 场景表现</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[760px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section data-exhibition-compact-section="scene" className="grid grid-cols-2 gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
          {[
            ['sceneCategory', '场景分类', sceneCategory, EXHIBITION_SCENE_CATEGORIES, normalizeExhibitionSceneCategory],
            ['presentationForm', '表现形式', presentationForm, EXHIBITION_SCENE_PRESENTATION_FORMS, normalizeExhibitionScenePresentationForm],
            ['spatialScale', '空间尺度', spatialScale, EXHIBITION_SCENE_SPATIAL_SCALES, normalizeExhibitionSceneSpatialScale],
            ['atmosphere', '氛围/灯光', atmosphere, EXHIBITION_SCENE_ATMOSPHERES, normalizeExhibitionSceneAtmosphere],
          ].map(([key, label, value, options, normalize]) => (
            <label key={String(key)} data-exhibition-compact-item="parameter-input" className="space-y-1">
              <span className="text-[10px] text-white/55">{String(label)}</span>
              <select className={FIELD} value={String(value)} disabled={isReadonly || busy} onChange={(event) => update({ [String(key)]: (normalize as (raw: string) => string)(event.target.value) })}>
                {(options as ExhibitionSceneOption[]).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          ))}
          <label data-exhibition-compact-item="parameter-input" className="space-y-1">
            <span className="text-[10px] text-white/55">人群密度</span>
            <select className={FIELD} value={crowdDensity} disabled={isReadonly || busy} onChange={(event) => update({ crowdDensity: normalizeExhibitionSceneCrowdDensity(event.target.value) })}>
              {EXHIBITION_SCENE_CROWD_DENSITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label data-exhibition-compact-item="aspect-size" className="space-y-1">
            <span className="text-[10px] text-white/55">画面比例</span>
            <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
              {modelDef.aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
          </label>
        </section>

        <section data-exhibition-compact-section="language" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><FileText size={13} /> 文案接口</div>
            <div className="flex gap-1">
              <button type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => fileRef.current?.click()}><Upload size={13} /> 上传文档</button>
              <button type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => void runExtract()}><Brain size={13} /> LLM 提炼</button>
            </div>
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void pickDocument(event.target.files?.[0])} />
          <div data-exhibition-compact-item="document" className="text-[10px] text-white/40">{documentLabel(d.documentMeta)}</div>
          <PromptTextarea data-exhibition-compact-item="document" title="扩大编辑" className={`${FIELD} min-h-[64px] resize-y`} value={sourceText} disabled={isReadonly || busy} readOnly={isReadonly || busy} placeholder="粘贴场景设计资料，或连接上游文本/上传文档" onValueChange={(value) => update({ sourceText: value })} />
          {upstream.texts.length > 0 && <div className="text-[10px] text-sky-200/75">已连接 {upstream.texts.length} 条上游文本，运行提炼时会合并使用。</div>}
          <div data-exhibition-compact-item="text-fields" className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">标题文字</span>
              <PromptTextarea compact title="扩大编辑" className={FIELD} value={titleText} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => update({ titleText: value })} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">主题概念</span>
              <PromptTextarea compact title="扩大编辑" className={FIELD} value={themeText} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => update({ themeText: value })} />
            </label>
          </div>
          <label data-exhibition-compact-item="text-fields" className="block space-y-1">
            <span className="text-[10px] text-white/55">场景说明</span>
            <PromptTextarea title="扩大编辑" className={`${FIELD} min-h-[68px] resize-y`} value={sceneText} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => update({ sceneText: value })} />
          </label>
          <label data-exhibition-compact-item="text-fields" className="block space-y-1">
            <span className="text-[10px] text-white/55">互动与叙事说明</span>
            <PromptTextarea title="扩大编辑" className={`${FIELD} min-h-[52px] resize-y`} value={interactionText} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => update({ interactionText: value })} />
          </label>
        </section>

        <section data-exhibition-compact-section="references" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 参考图</div>
          <div data-exhibition-compact-item="environment-reference" className="rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 text-[10px] text-white/55">整体环境参考图 · {environmentReferenceImages.length}</div>
            {environmentReferenceImages.length ? (
              <div className="grid grid-cols-3 gap-1.5">
                {environmentReferenceImages.slice(0, 6).map((url) => <img key={url} src={url} alt="" className="h-20 w-full rounded border border-white/10 object-cover" draggable={false} />)}
              </div>
            ) : <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接整体环境参考图，约束空间结构、尺度、动线和氛围。</div>}
          </div>
          <div data-exhibition-compact-item="people-props" className="space-y-2 rounded border border-white/10 bg-black/15 p-2">
            <div className="text-[10px] text-white/55">人物及道具参考图 · {peoplePropsReferenceImages.length}</div>
            {peoplePropsReferenceImages.length ? (
              <div className="grid grid-cols-4 gap-1.5">
                {peoplePropsReferenceImages.slice(0, 8).map((url, index) => (
                  <div key={url} className="relative">
                    <img src={url} alt="" className="h-16 w-full rounded border border-white/10 object-cover" draggable={false} />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-cyan-100">@img{environmentReferenceImages.length + index + 1}</span>
                  </div>
                ))}
              </div>
            ) : <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接人物及道具参考图，并在下方输入 @ 引用。</div>}
            <MentionPromptInput
              title="人物及道具 @ 引用说明"
              value={peoplePropsText}
              mentions={peoplePropsMentions}
              materials={mentionMaterials}
              onChange={(value, mentions) => update({ peoplePropsText: value, peoplePropsMentions: mentions })}
              placeholder="描述人物姿态、服饰、道具与情节，可输入 @ 引用人物及道具图"
              isDark
              isPixel={false}
              promptTemplateKind="image"
              className={`${FIELD} min-h-[58px] resize-y`}
              disabled={isReadonly || busy}
            />
          </div>
        </section>

        <section data-exhibition-compact-section="model" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生图</div>
            <button data-exhibition-compact-item="actions" type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成场景图</button>
          </div>
          <div data-exhibition-compact-item="provider" className="grid grid-cols-2 gap-2">
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
            <label data-exhibition-compact-item="model" className="space-y-1">
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
              <select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(event) => update({ outputFormat: event.target.value })}>
                <option value="jpg">JPG</option>
                <option value="png">PNG</option>
              </select>
            </label>
            <label data-exhibition-compact-item="seed-name" className="space-y-1">
              <span className="text-[10px] text-white/55">Seed（0 随机）</span>
              <input className={FIELD} type="number" min={0} value={seed} disabled={isReadonly || busy} onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
            </label>
          </div>
          {d.progress && <div data-exhibition-compact-item="progress" className="text-[10px] text-cyan-100">{d.progress}</div>}
          {d.imageUrl && <img data-exhibition-compact-item="preview" src={d.imageUrl} alt="" className="max-h-56 w-full rounded border border-white/10 object-contain" draggable={false} />}
        </section>

        <section data-exhibition-compact-section="prompt" data-exhibition-compact-item="prompt-preview" className="rounded border border-white/10 bg-black/20 p-2">
          <div className="mb-1 text-[11px] font-semibold text-cyan-100">当前 Prompt</div>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">{previewPrompt}</div>
        </section>
      </div>
    </div>
  );
};

export default memo(ExhibitionSceneDesignNode);
