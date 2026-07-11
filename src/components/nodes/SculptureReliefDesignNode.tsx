import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Brain, FileText, Image as ImageIcon, Landmark, Loader2, Pencil, Play, Upload } from 'lucide-react';
import { EXHIBITION_IMAGE_HANDLE_COLOR, EXHIBITION_TEXT_HANDLE_COLOR } from '../../config/portTypes';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
import {
  extractDocument,
  getDesignOptionPresets,
  getCurrentUser,
  getSculptureReliefMaterials,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_MB,
  updateSculptureReliefMaterials,
  updateDesignOptionPresets,
  type AuthUser,
  type ExtractedDocument,
  type SculptureReliefMaterialItem,
  type DesignOptionPresetItem,
  type SculptureReliefOptionGroup,
} from '../../services/api';
import { generateExternalImage, generateLlm, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import PromptTextarea from '../PromptTextarea';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import SculptureReliefMaterialEditorModal from './SculptureReliefMaterialEditorModal';
import MentionPromptInput from './MentionPromptInput';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';
import NodeHelpButton from './NodeHelpButton';
import DesignOptionEditorModal from './DesignOptionEditorModal';
import {
  buildSculptureReliefExtractPrompt,
  buildSculptureReliefImagePrompt,
  normalizeSculptureReliefDesignKind,
  normalizeSculptureReliefDimensions,
  normalizeSculptureReliefMaterial,
  normalizeSculptureReliefViewAngles,
  parseSculptureReliefExtractJson,
  RELIEF_DESIGN_TYPES,
  SCULPTURE_DESIGN_TYPES,
  SCULPTURE_RELIEF_MATERIALS,
  SCULPTURE_RELIEF_VIEW_ANGLES,
  type SculptureReliefDesignKind,
  type SculptureReliefOption,
} from '../../utils/sculptureReliefDesignPrompt';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const SCULPTURE_OPTION_GROUPS = [
  { id: 'sculptureTypes', label: '雕塑类型' },
  { id: 'reliefTypes', label: '浮雕类型' },
  { id: 'viewAngles', label: '多视角' },
];
const DEFAULT_SCULPTURE_OPTIONS: Record<string, DesignOptionPresetItem[]> = {
  sculptureTypes: SCULPTURE_DESIGN_TYPES.map((item, order) => ({ ...item, order })),
  reliefTypes: RELIEF_DESIGN_TYPES.map((item, order) => ({ ...item, order })),
  viewAngles: SCULPTURE_RELIEF_VIEW_ANGLES.map((item, order) => ({ ...item, order })),
};
const optionValue = (value: unknown, options: DesignOptionPresetItem[]) => options.some((item) => item.id === value) ? String(value) : options[0]?.id || '';

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

function firstImageFromData(data: any): string {
  return imagesFromData(data)[0] || '';
}

function shortFileLabel(url: string, fallback = '图像') {
  return (url.split('/').pop() || fallback).split('?')[0].slice(0, 28) || fallback;
}

function mergeMaterialOptions(materials: SculptureReliefMaterialItem[]): Array<SculptureReliefOption | SculptureReliefMaterialItem> {
  const byId = new Map<string, SculptureReliefOption | SculptureReliefMaterialItem>(
    SCULPTURE_RELIEF_MATERIALS.map((item) => [item.id, item]),
  );
  for (const item of materials) {
    if (!item?.id || !item?.label) continue;
    const previous = byId.get(item.id);
    byId.set(item.id, previous ? { ...previous, ...item } : item);
  }
  return Array.from(byId.values()).sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0));
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
            label: shortFileLabel(url, handle === 'pattern-reference' ? '参考图案' : '人物道具'),
          });
        }
      });
    }
    return out;
  }, [handle, nodesData]);
}

function useInputImageByHandle(nodeId: string, handle: string): string {
  const items = useInputImagesByHandle(nodeId, handle);
  return items[0]?.url || '';
}

function llmErrorMessage(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/no available accounts/i.test(message)) return '当前 LLM 没有可用账号，请切换可用的 LLM 配置后重试。';
  return message || 'LLM 请求失败';
}

const SculptureReliefDesignNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef(false);
  const upstream = useUpstreamMaterials(id);
  const patternReferenceImage = useInputImageByHandle(id, 'pattern-reference');
  const peoplePropsReferenceItems = useInputImagesByHandle(id, 'people-props');
  const peoplePropsReferenceImages = useMemo(() => peoplePropsReferenceItems.map((item) => item.url), [peoplePropsReferenceItems]);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [materials, setMaterials] = useState<SculptureReliefMaterialItem[]>([]);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [materialsError, setMaterialsError] = useState('');
  const [designOptions, setDesignOptions] = useState<Record<string, DesignOptionPresetItem[]>>(DEFAULT_SCULPTURE_OPTIONS);
  const [optionEditorOpen, setOptionEditorOpen] = useState(false);
  const [optionSaving, setOptionSaving] = useState(false);
  const [optionError, setOptionError] = useState('');

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
  const aspectRatio = d.aspectRatio || '1:1';
  const sizeLevel = d.sizeLevel || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));

  const designKind = normalizeSculptureReliefDesignKind(d.designKind) as SculptureReliefDesignKind;
  const sculptureTypeOptions = designOptions.sculptureTypes || DEFAULT_SCULPTURE_OPTIONS.sculptureTypes;
  const reliefTypeOptions = designOptions.reliefTypes || DEFAULT_SCULPTURE_OPTIONS.reliefTypes;
  const viewAngleOptions = designOptions.viewAngles || DEFAULT_SCULPTURE_OPTIONS.viewAngles;
  const sculptureType = optionValue(d.sculptureType, sculptureTypeOptions);
  const reliefType = optionValue(d.reliefType, reliefTypeOptions);
  const sculptureTypeOption = sculptureTypeOptions.find((item) => item.id === sculptureType)!;
  const reliefTypeOption = reliefTypeOptions.find((item) => item.id === reliefType)!;
  const dimensions = normalizeSculptureReliefDimensions(d.dimensions);
  const materialOptions = useMemo(() => mergeMaterialOptions(materials), [materials]);
  const materialId = materialOptions.some((item) => item.id === d.materialId)
    ? String(d.materialId)
    : normalizeSculptureReliefMaterial(d.materialId);
  const selectedMaterial = useMemo(
    () => materialOptions.find((item) => item.id === materialId) || null,
    [materialId, materialOptions],
  );
  const viewAngles = useMemo(() => {
    const allowed = new Set(viewAngleOptions.map((item) => item.id));
    const source = Array.isArray(d.viewAngles) ? d.viewAngles : normalizeSculptureReliefViewAngles(d.viewAngles);
    const selected = source.filter((item: unknown, index: number, values: unknown[]) => allowed.has(String(item)) && values.indexOf(item) === index).slice(0, 4) as string[];
    return selected.length ? selected : [viewAngleOptions[0]?.id || 'front'];
  }, [d.viewAngles, viewAngleOptions]);
  const titleText = String(d.titleText || '').trim();
  const themeText = String(d.themeText || '').trim();
  const bodyText = String(d.bodyText || '').trim();
  const peoplePropsText = String(d.peoplePropsText || '');
  const peoplePropsMentions: MediaMention[] = Array.isArray(d.peoplePropsMentions) ? d.peoplePropsMentions : [];
  const sourceText = String(d.sourceText || '');
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const effectiveSourceText = [d.useUpstream !== false ? upstreamText : '', sourceText].filter((item) => item.trim()).join('\n\n');
  const status = String(d.status || 'idle');
  const busy = ['extracting', 'generating', 'uploading'].includes(status);
  const canManageMaterials = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const peoplePropsOffset = patternReferenceImage ? 1 : 0;
  const mentionMaterials: Material[] = useMemo(() => peoplePropsReferenceItems.map((item, index) => ({
    id: item.id,
    kind: 'image',
    url: item.url,
    sourceNodeId: item.id.split(':')[0] || `sculpture-people-props-${index + 1}`,
    origin: 'upstream',
    label: item.label || `人物/道具 ${index + 1}`,
    mentionToken: `@img${peoplePropsOffset + index + 1}`,
  })), [peoplePropsOffset, peoplePropsReferenceItems]);
  const resolvedPeoplePropsText = useMemo(
    () => resolveMediaMentions(peoplePropsText, peoplePropsMentions, mentionMaterials),
    [mentionMaterials, peoplePropsMentions, peoplePropsText],
  );
  const previewReferenceImages = useMemo(
    () => [...(patternReferenceImage ? [patternReferenceImage] : []), ...peoplePropsReferenceImages],
    [patternReferenceImage, peoplePropsReferenceImages],
  );

  const previewPrompt = useMemo(() => buildSculptureReliefImagePrompt({
    designKind,
    sculptureType,
    reliefType,
    sculptureTypeOption,
    reliefTypeOption,
    dimensions,
    materialId,
    material: selectedMaterial || undefined,
    manualMaterial: d.manualMaterial,
    titleText,
    themeText,
    bodyText,
    dimensionMarksEnabled: d.dimensionMarksEnabled === true,
    backgroundMode: d.backgroundMode === 'white' ? 'white' : 'black',
    hasPatternReferenceImage: !!patternReferenceImage,
    peoplePropsText: resolvedPeoplePropsText,
    peoplePropsReferenceImages,
    hasPeoplePropsReferenceImage: peoplePropsReferenceImages.length > 0,
    viewAngles,
    viewAngleOptions,
  }), [bodyText, d.backgroundMode, d.dimensionMarksEnabled, d.manualMaterial, designKind, dimensions, materialId, patternReferenceImage, peoplePropsReferenceImages, reliefType, reliefTypeOption, resolvedPeoplePropsText, sculptureType, sculptureTypeOption, selectedMaterial, themeText, titleText, viewAngleOptions, viewAngles]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getSculptureReliefMaterials().then(setMaterials).catch(() => setMaterials([]));
    getDesignOptionPresets('sculpture-relief-design')
      .then((presets) => setDesignOptions(Object.fromEntries(Object.entries(DEFAULT_SCULPTURE_OPTIONS).map(([group, defaults]) => [group, presets[group]?.length ? presets[group] : defaults]))))
      .catch(() => setDesignOptions(DEFAULT_SCULPTURE_OPTIONS));
  }, []);

  const saveDesignOptions = async (group: string, presets: DesignOptionPresetItem[]) => {
    if (!canManageMaterials || isReadonly) return;
    setOptionSaving(true); setOptionError('');
    try {
      const saved = await updateDesignOptionPresets('sculpture-relief-design', group as SculptureReliefOptionGroup, presets);
      setDesignOptions((current) => ({ ...current, [group]: saved }));
      setOptionEditorOpen(false);
    } catch (error: any) {
      setOptionError(error?.message || '保存雕塑/浮雕关键参数失败');
    } finally { setOptionSaving(false); }
  };

  useEffect(() => {
    if (
      d.prompt !== previewPrompt ||
      d.outputText !== previewPrompt ||
      d.text !== previewPrompt ||
      JSON.stringify(d.referenceImages || []) !== JSON.stringify(previewReferenceImages) ||
      JSON.stringify(d.peoplePropsReferenceImages || []) !== JSON.stringify(peoplePropsReferenceImages)
    ) {
      update({
        prompt: previewPrompt,
        outputText: previewPrompt,
        text: previewPrompt,
        referenceImages: previewReferenceImages,
        peoplePropsReferenceImages,
      });
    }
  }, [d.outputText, d.peoplePropsReferenceImages, d.prompt, d.referenceImages, d.text, peoplePropsReferenceImages, previewPrompt, previewReferenceImages, update]);

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
    update({ status: 'extracting', progress: 'LLM 提炼雕塑/浮雕文案...', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.25,
        messages: [{ role: 'user', content: buildSculptureReliefExtractPrompt({ sourceText: effectiveSourceText }) }],
      });
      const parsed = parseSculptureReliefExtractJson(response.content || '');
      if (!parsed.titleText && !parsed.themeText && !parsed.bodyText) throw new Error('LLM 未返回有效文案');
      update({
        titleText: parsed.titleText || titleText,
        themeText: parsed.themeText || themeText,
        bodyText: parsed.bodyText || bodyText,
        status: 'idle',
        progress: '',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
    }
  }, [activeLlmConfig?.id, bodyText, busy, effectiveSourceText, isReadonly, llmModel, themeText, titleText, update]);

  const runGenerate = useCallback(async () => {
    if (isReadonly || busy) return;
    const imagePrompt = buildSculptureReliefImagePrompt({
      designKind,
      sculptureType,
      reliefType,
      sculptureTypeOption,
      reliefTypeOption,
      dimensions,
      materialId,
      material: selectedMaterial || undefined,
      manualMaterial: d.manualMaterial,
      titleText,
      themeText,
      bodyText,
      dimensionMarksEnabled: d.dimensionMarksEnabled === true,
      backgroundMode: d.backgroundMode === 'white' ? 'white' : 'black',
      hasPatternReferenceImage: !!patternReferenceImage,
      peoplePropsText: resolvedPeoplePropsText,
      peoplePropsReferenceImages,
      hasPeoplePropsReferenceImage: peoplePropsReferenceImages.length > 0,
      viewAngles,
      viewAngleOptions,
    });
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `sculpture-relief-design:${id.slice(0, 6)}`;
    const referenceImages = [...(patternReferenceImage ? [patternReferenceImage] : []), ...peoplePropsReferenceImages];
    update({ status: 'generating', progress: '提交生图...', error: '', imageUrls: [], lastPrompt: imagePrompt, lastSeed: runSeed, referenceImages, peoplePropsReferenceImages });
    try {
      logBus.info(`雕塑/浮雕设计生图提交 seed=${runSeed}`, src);
      const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType: 'sculpture-relief-design', seed: runSeed, nodeTitle: '雕塑/浮雕设计' };
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
        peoplePropsReferenceImages,
        error: '',
      });
      logBus.success(`雕塑/浮雕设计生图完成: ${urls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`雕塑/浮雕设计生图失败: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, aspectRatio, bodyText, busy, d.backgroundMode, d.dimensionMarksEnabled, d.manualMaterial, d.providerParams, designKind, dimensions, externalProviderModel, id, isExternalSelected, isReadonly, materialId, modelDef.id, modelDef.paramKind, outputFormat, patternReferenceImage, peoplePropsReferenceImages, providerSelection.provider, reliefType, reliefTypeOption, resolvedPeoplePropsText, sculptureType, sculptureTypeOption, seed, selectedMaterial, sizeLevel, themeText, titleText, update, viewAngleOptions, viewAngles]);

  useRunTrigger(id, runGenerate, 'image');

  const updateDimension = (key: string, value: string) => {
    const n = Number(value);
    update({ dimensions: { ...dimensions, [key]: Number.isFinite(n) && n >= 0 ? n : 0 } });
  };

  const toggleViewAngle = (viewId: string) => {
    const next = viewAngles.includes(viewId)
      ? viewAngles.filter((item) => item !== viewId)
      : [...viewAngles, viewId].slice(0, 4);
    update({ viewAngles: next.length ? next : ['front'] });
  };

  const saveMaterials = async (next: SculptureReliefMaterialItem[]) => {
    setMaterialsSaving(true);
    setMaterialsError('');
    try {
      const saved = await updateSculptureReliefMaterials(next);
      setMaterials(saved);
      setMaterialsOpen(false);
    } catch (error: any) {
      setMaterialsError(error?.message || '材质保存失败');
    } finally {
      setMaterialsSaving(false);
    }
  };

  return (
    <div
      data-exhibition-compact-node-type="sculpture-relief-design"
      className={`relative w-[620px] rounded-xl border-2 transition-all ${selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'}`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!border-0 t8-exhibition-handle--image" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：雕塑/浮雕设计图" />
      <Handle id="text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--text" style={{ top: '34%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输入：上游文本资料" />
      <Handle id="pattern-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '54%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：参考图案轮廓" />
      <Handle id="people-props" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '68%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：人物及道具参考图" />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200"><Landmark size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">雕塑/浮雕设计</div>
          <div className="truncate text-[10px] text-white/45">文案提炼 / 类型选择 / 尺寸材质 / 轮廓参考</div>
        </div>
        <NodeHelpButton nodeType="sculpture-relief-design" />
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[740px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section data-exhibition-compact-section="source" className="grid grid-cols-2 gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
          {canManageMaterials && <div className="col-span-2 flex justify-end"><button data-exhibition-compact-item="option-editor" type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => setOptionEditorOpen(true)}><Pencil size={13} /> 编辑关键参数</button></div>}
          <label data-exhibition-compact-item="parameter-input" className="space-y-1">
            <span className="text-[10px] text-white/55">设计类型</span>
            <select className={FIELD} value={designKind} disabled={isReadonly || busy} onChange={(e) => update({ designKind: normalizeSculptureReliefDesignKind(e.target.value) })}>
              <option value="sculpture">雕塑</option>
              <option value="relief">浮雕</option>
            </select>
          </label>
          <label data-exhibition-compact-item="parameter-input" className="space-y-1">
            <span className="text-[10px] text-white/55">细分类型</span>
            <select
              className={FIELD}
              value={designKind === 'relief' ? reliefType : sculptureType}
              disabled={isReadonly || busy}
              onChange={(e) => {
                if (designKind === 'relief') update({ reliefType: e.target.value });
                else update({ sculptureType: e.target.value });
              }}
            >
              {(designKind === 'relief' ? reliefTypeOptions : sculptureTypeOptions).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label data-exhibition-compact-item="toggles" className="flex items-center gap-1.5 text-[10px] text-white/70">
            <input type="checkbox" className="accent-cyan-300" checked={d.dimensionMarksEnabled === true} disabled={isReadonly || busy} onChange={(e) => update({ dimensionMarksEnabled: e.target.checked })} />
            尺寸标注
          </label>
          <label data-exhibition-compact-item="toggles" className="space-y-1">
            <span className="text-[10px] text-white/55">背景</span>
            <select className={FIELD} value={d.backgroundMode === 'white' ? 'white' : 'black'} disabled={isReadonly || busy} onChange={(e) => update({ backgroundMode: e.target.value })}>
              <option value="black">黑背景</option>
              <option value="white">白背景</option>
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
          <label data-exhibition-compact-item="llm-settings" className="block space-y-1">
            <span className="text-[10px] text-white/55">LLM 配置模型</span>
            <select
              className={FIELD}
              value={activeLlmConfig?.id || ''}
              disabled={isReadonly || busy || llmConfigOptions.length === 0}
              onChange={(e) => {
                const next = llmConfigOptions.find((item) => item.id === e.target.value) || llmConfigOptions[0];
                update({ llmKeyId: next?.id || '', llmModel: next?.model || configuredLlmModel });
              }}
            >
              {llmConfigOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label || item.id} · {item.model || configuredLlmModel}
                </option>
              ))}
            </select>
          </label>
          <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void pickDocument(e.target.files?.[0])} />
          <div data-exhibition-compact-item="document" className="text-[10px] text-white/40">{documentLabel(d.documentMeta)}</div>
          <PromptTextarea data-exhibition-compact-item="document" title="扩大编辑" className={`${FIELD} min-h-[68px] resize-y`} value={sourceText} disabled={isReadonly || busy} readOnly={isReadonly || busy} placeholder="粘贴雕塑/浮雕资料，或连接上游文本/上传文档" onValueChange={(value) => update({ sourceText: value })} />
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
            <span className="text-[10px] text-white/55">设计说明</span>
            <PromptTextarea title="扩大编辑" className={`${FIELD} min-h-[68px] resize-y`} value={bodyText} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => update({ bodyText: value })} />
          </label>
        </section>

        <section data-exhibition-compact-section="layout" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-cyan-100">尺寸与材质</div>
            {canManageMaterials && <button data-exhibition-compact-item="actions" type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => setMaterialsOpen(true)}>编辑材质</button>}
          </div>
          <div data-exhibition-compact-item="size" className="grid grid-cols-4 gap-2">
            {[
              ['widthMm', '宽 mm'],
              ['heightMm', '高 mm'],
              ['depthMm', '厚/深 mm'],
              ['baseHeightMm', '底座高 mm'],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-[10px] text-white/55">{label}</span>
                <input className={FIELD} type="number" min={0} value={(dimensions as any)[key] || ''} disabled={isReadonly || busy} onChange={(e) => updateDimension(key, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label data-exhibition-compact-item="material-select" className="space-y-1">
              <span className="text-[10px] text-white/55">主材质</span>
              <select className={FIELD} value={materialId} disabled={isReadonly || busy} onChange={(e) => update({ materialId: e.target.value })}>
                {materialOptions.map((item: SculptureReliefOption | SculptureReliefMaterialItem) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">画面比例</span>
              <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(e) => update({ aspectRatio: e.target.value })}>
                {modelDef.aspectRatios.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          <div data-exhibition-compact-item="view-angles" className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-white/55">
              <span>多视角</span>
              <span>{viewAngles.length}/4</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {viewAngleOptions.map((item) => {
                const checked = viewAngles.includes(item.id);
                const disabled = isReadonly || busy || (!checked && viewAngles.length >= 4);
                return (
                  <label key={item.id} className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] ${checked ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-black/15 text-white/60'} ${disabled ? 'opacity-45' : ''}`}>
                    <input type="checkbox" className="accent-cyan-300" checked={checked} disabled={disabled} onChange={() => toggleViewAngle(item.id)} />
                    <span className="truncate">{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <PromptTextarea data-exhibition-compact-item="manual-input" title="扩大编辑" className={`${FIELD} min-h-[48px] resize-y`} value={d.manualMaterial || ''} disabled={isReadonly || busy} readOnly={isReadonly || busy} placeholder="手动材质/工艺补充，例如：局部内发光、金属蚀刻、仿石肌理、背板安装方式" onValueChange={(value) => update({ manualMaterial: value })} />
          {patternReferenceImage ? (
            <div data-exhibition-compact-item="reference" className="rounded border border-white/10 bg-black/15 p-2">
              <img src={patternReferenceImage} alt="" className="h-28 w-full rounded border border-white/10 object-contain" draggable={false} />
              <div className="mt-1 text-[10px] leading-relaxed text-cyan-100/75">参考图案仅用于轮廓、剪影、外形节奏和构图，不复制细节、色彩或材质。</div>
            </div>
          ) : <div data-exhibition-compact-item="reference" className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接参考图案，为雕塑或浮雕提供大致轮廓。</div>}
          <div data-exhibition-compact-item="people-props" className="space-y-2 rounded border border-white/10 bg-black/15 p-2">
            <div className="text-[10px] text-white/55">人物及道具参考图 · {peoplePropsReferenceImages.length}</div>
            {peoplePropsReferenceImages.length ? (
              <div className="grid grid-cols-4 gap-1.5">
                {peoplePropsReferenceImages.slice(0, 8).map((url, index) => (
                  <div key={url} className="relative">
                    <img src={url} alt="" className="h-16 w-full rounded border border-white/10 object-cover" draggable={false} />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-cyan-100">@img{peoplePropsOffset + index + 1}</span>
                  </div>
                ))}
              </div>
            ) : <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接人物及道具参考图，并在下方输入 @ 引用说明。</div>}
            <MentionPromptInput
              title="人物及道具 @ 引用说明"
              value={peoplePropsText}
              mentions={peoplePropsMentions}
              materials={mentionMaterials}
              onChange={(value, mentions) => update({ peoplePropsText: value, peoplePropsMentions: mentions })}
              placeholder="描述人物姿态、服饰、道具、比例或情节，可输入 @ 引用人物及道具图"
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
            <button data-exhibition-compact-item="actions" type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成设计图</button>
          </div>
          <div data-exhibition-compact-item="provider" className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">生图平台</span>
              <select
                className={FIELD}
                value={providerSelectValue}
                disabled={isReadonly || busy || (!allowZhenzhenFallback && imageAdvancedProviders.length === 0)}
                onChange={(e) => {
                  const nextId = e.target.value;
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
                <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy || externalModelOptions.length === 0} onChange={(e) => update({ providerModel: e.target.value })}>
                  {externalModelOptions.length > 0
                    ? externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>)
                    : <option value="">未配置图像模型</option>}
                </select>
              ) : (
                <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(e) => update({ apiModel: e.target.value })}>
                  {modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              )}
            </label>
            <label data-exhibition-compact-item="aspect-size" className="space-y-1">
              <span className="text-[10px] text-white/55">分辨率</span>
              <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(e) => update({ sizeLevel: e.target.value })}>
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </label>
            <label data-exhibition-compact-item="output-format" className="space-y-1">
              <span className="text-[10px] text-white/55">输出格式</span>
              <select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(e) => update({ outputFormat: e.target.value })}>
                <option value="jpg">JPG</option>
                <option value="png">PNG</option>
              </select>
            </label>
            <label data-exhibition-compact-item="seed-name" className="space-y-1">
              <span className="text-[10px] text-white/55">Seed（0 随机）</span>
              <input className={FIELD} type="number" min={0} value={seed} disabled={isReadonly || busy} onChange={(e) => update({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
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

      <SculptureReliefMaterialEditorModal
        open={materialsOpen}
        materials={materialOptions as SculptureReliefMaterialItem[]}
        saving={materialsSaving}
        error={materialsError}
        onClose={() => setMaterialsOpen(false)}
        onSave={saveMaterials}
      />
      {canManageMaterials && <DesignOptionEditorModal open={optionEditorOpen} title="雕塑/浮雕设计关键参数管理" groups={SCULPTURE_OPTION_GROUPS} presets={designOptions} saving={optionSaving} error={optionError} onClose={() => setOptionEditorOpen(false)} onSave={saveDesignOptions} />}
    </div>
  );
};

export default memo(SculptureReliefDesignNode);
