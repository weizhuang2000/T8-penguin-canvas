import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Brain, FileText, Image as ImageIcon, Loader2, MapPinned, Play, Settings, Upload } from 'lucide-react';
import { EXHIBITION_IMAGE_HANDLE_COLOR, EXHIBITION_TEXT_HANDLE_COLOR } from '../../config/portTypes';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
import {
  extractDocument,
  getCurrentUser,
  getElevationPromptPresets,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_MB,
  updateElevationColorMaterialPresets,
  type AuthUser,
  type ElevationColorMaterialPresetItem,
  type ExtractedDocument,
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
import ColorMaterialPresetEditorModal from './ColorMaterialPresetEditorModal';
import ColorMaterialPresetSelect from './ColorMaterialPresetSelect';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import NodeHelpButton from './NodeHelpButton';
import {
  buildWayfindingExtractPrompt,
  buildWayfindingImagePrompt,
  normalizeWayfindingArrowStyle,
  normalizeWayfindingDimensions,
  normalizeWayfindingLanguage,
  normalizeWayfindingMaterial,
  normalizeWayfindingMounting,
  normalizeWayfindingOutputMode,
  normalizeWayfindingOutputPageCount,
  normalizeWayfindingOutputPageMode,
  normalizeWayfindingScope,
  normalizeWayfindingSignTypes,
  parseWayfindingExtractJson,
  resolveWayfindingOutputPages,
  WAYFINDING_ARROW_STYLES,
  WAYFINDING_LANGUAGES,
  WAYFINDING_MATERIALS,
  WAYFINDING_MOUNTING_OPTIONS,
  WAYFINDING_OUTPUT_MODES,
  WAYFINDING_OUTPUT_PAGE_OPTIONS,
  WAYFINDING_SCOPE_OPTIONS,
  WAYFINDING_SIGN_TYPES,
  type WayfindingDimensions,
  type WayfindingOption,
} from '../../utils/wayfindingDesignPrompt';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;

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

function useInputImagesByHandle(nodeId: string, handle: string): string[] {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns.filter((conn: any) => (conn.targetHandle || '') === handle).map((conn: any) => conn.source).filter(Boolean))),
    [conns, handle],
  );
  const nodesData = useNodesData(sourceIds);
  return useMemo(() => {
    const list = Array.isArray(nodesData) ? nodesData : [nodesData];
    const out: string[] = [];
    for (const node of list) {
      imagesFromData((node as any)?.data || {}).forEach((url) => {
        if (!out.includes(url)) out.push(url);
      });
    }
    return out;
  }, [nodesData]);
}

function llmErrorMessage(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/no available accounts/i.test(message)) return '当前 LLM 没有可用账号，请切换可用的 LLM 配置后重试。';
  return message || 'LLM 请求失败';
}

function normalizeTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(/[;\n,，、]+/).map((item) => item.trim()).filter(Boolean);
}

function colorMaterialTextFromPreset(preset: ElevationColorMaterialPresetItem | null): string {
  if (!preset) return '';
  return [
    preset.label,
    String(preset.core || '').trim(),
    String(preset.features || '').trim(),
    String(preset.usage || '').trim(),
  ].filter(Boolean).join('；');
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
    order: Number.isFinite(Number(preset.order)) ? Number(preset.order) : index,
  }));
}

const WayfindingDesignNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef(false);
  const upstream = useUpstreamMaterials(id);
  const spaceReferenceImages = useInputImagesByHandle(id, 'space-reference');
  const graphicReferenceImages = useInputImagesByHandle(id, 'graphic-reference');
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);
  const [colorMaterialEditorOpen, setColorMaterialEditorOpen] = useState(false);
  const [colorMaterialSaving, setColorMaterialSaving] = useState(false);
  const [colorMaterialError, setColorMaterialError] = useState('');

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
  const externalModelOptions = providerSelection.provider ? advancedProviderModelOptions(providerSelection.provider, 'image') : [];
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

  const outputMode = normalizeWayfindingOutputMode(d.outputMode);
  const outputPageMode = normalizeWayfindingOutputPageMode(d.outputPageMode);
  const outputPageCount = normalizeWayfindingOutputPageCount(d.outputPageCount);
  const scope = normalizeWayfindingScope(d.scope);
  const signTypes = normalizeWayfindingSignTypes(d.signTypes);
  const materialId = normalizeWayfindingMaterial(d.materialId);
  const mountingId = normalizeWayfindingMounting(d.mountingId);
  const arrowStyle = normalizeWayfindingArrowStyle(d.arrowStyle);
  const language = normalizeWayfindingLanguage(d.language);
  const dimensions = normalizeWayfindingDimensions(d.dimensions);
  const museumName = String(d.museumName || '').trim();
  const projectTheme = String(d.projectTheme || '').trim();
  const zones = normalizeTextArray(d.zones);
  const destinations = normalizeTextArray(d.destinations);
  const routeText = String(d.routeText || '').trim();
  const signText = String(d.signText || '').trim();
  const notes = String(d.notes || '').trim();
  const colorMaterial = String(d.colorMaterial || '').trim();
  const sourceText = String(d.sourceText || '');
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const effectiveSourceText = [d.useUpstream !== false ? upstreamText : '', sourceText].filter((item) => item.trim()).join('\n\n');
  const referenceImages = useMemo(() => [...spaceReferenceImages, ...graphicReferenceImages], [graphicReferenceImages, spaceReferenceImages]);
  const status = String(d.status || 'idle');
  const busy = ['extracting', 'generating', 'uploading'].includes(status);
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );
  const colorMaterialPresetText = colorMaterialTextFromPreset(selectedColorMaterialPreset);
  const outputPages = useMemo(
    () => resolveWayfindingOutputPages({ outputMode, outputPageMode, outputPageCount, scope, signTypes }),
    [outputMode, outputPageCount, outputPageMode, scope, signTypes],
  );
  const resolvedOutputPageCount = outputPages.length;
  const firstOutputPage = outputPages[0] || { index: 1, total: 1, title: '导视系统总览规范图' };

  const previewPrompt = useMemo(() => buildWayfindingImagePrompt({
    outputMode,
    outputPageMode,
    outputPageCount,
    pageIndex: firstOutputPage.index,
    pageTitle: firstOutputPage.title,
    pageFocus: (firstOutputPage as any).focus,
    pageSignTypes: (firstOutputPage as any).signTypeIds,
    totalPages: resolvedOutputPageCount,
    scope,
    signTypes,
    materialId,
    mountingId,
    arrowStyle,
    language,
    dimensions,
    museumName,
    projectTheme,
    zones,
    destinations,
    routeText,
    signText,
    notes,
    colorMaterial,
    colorMaterialPresetText,
    supplement: d.supplement,
    hasSpaceReferenceImage: spaceReferenceImages.length > 0,
    hasGraphicReferenceImage: graphicReferenceImages.length > 0,
  }), [arrowStyle, colorMaterial, colorMaterialPresetText, d.supplement, destinations, dimensions, firstOutputPage.index, firstOutputPage.title, graphicReferenceImages.length, language, materialId, mountingId, museumName, notes, outputMode, outputPageCount, outputPageMode, projectTheme, resolvedOutputPageCount, routeText, scope, signText, signTypes, spaceReferenceImages.length, zones]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getElevationPromptPresets()
      .then((presets) => setColorMaterialPresets(presets.colorMaterial || []))
      .catch(() => setColorMaterialPresets([]));
  }, []);

  useEffect(() => {
    if (
      d.prompt !== previewPrompt ||
      d.outputText !== previewPrompt ||
      d.text !== previewPrompt ||
      d.resolvedOutputPageCount !== resolvedOutputPageCount ||
      JSON.stringify(d.referenceImages || []) !== JSON.stringify(referenceImages) ||
      JSON.stringify(d.spaceReferenceImages || []) !== JSON.stringify(spaceReferenceImages) ||
      JSON.stringify(d.graphicReferenceImages || []) !== JSON.stringify(graphicReferenceImages)
    ) {
      update({ prompt: previewPrompt, outputText: previewPrompt, text: previewPrompt, resolvedOutputPageCount, referenceImages, spaceReferenceImages, graphicReferenceImages });
    }
  }, [d.graphicReferenceImages, d.outputText, d.prompt, d.referenceImages, d.resolvedOutputPageCount, d.spaceReferenceImages, d.text, graphicReferenceImages, previewPrompt, referenceImages, resolvedOutputPageCount, spaceReferenceImages, update]);

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
    update({ status: 'extracting', progress: 'LLM 提炼导视文案...', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.25,
        messages: [{ role: 'user', content: buildWayfindingExtractPrompt({ sourceText: effectiveSourceText }) }],
      });
      const parsed = parseWayfindingExtractJson(response.content || '');
      update({
        museumName: parsed.museumName || museumName,
        projectTheme: parsed.projectTheme || projectTheme,
        zones: parsed.zones.length ? parsed.zones : zones,
        destinations: parsed.destinations.length ? parsed.destinations : destinations,
        routeText: parsed.routeText || routeText,
        signText: parsed.signText || signText,
        notes: parsed.notes || notes,
        status: 'idle',
        progress: '',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
    }
  }, [activeLlmConfig?.id, busy, destinations, effectiveSourceText, isReadonly, llmModel, museumName, notes, projectTheme, routeText, signText, update, zones]);

  const runGenerateSinglePage = useCallback(async () => {
    if (isReadonly || busy) return;
    const imagePrompt = buildWayfindingImagePrompt({
      outputMode,
      scope,
      signTypes,
      materialId,
      mountingId,
      arrowStyle,
      language,
      dimensions,
      museumName,
      projectTheme,
      zones,
      destinations,
      routeText,
      signText,
      notes,
      colorMaterial,
      colorMaterialPresetText,
      supplement: d.supplement,
      hasSpaceReferenceImage: spaceReferenceImages.length > 0,
      hasGraphicReferenceImage: graphicReferenceImages.length > 0,
    });
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-wayfinding-design:${id.slice(0, 6)}`;
    update({ status: 'generating', progress: '提交生图...', error: '', imageUrls: [], lastPrompt: imagePrompt, lastSeed: runSeed, referenceImages, spaceReferenceImages, graphicReferenceImages });
    try {
      logBus.info(`导视系统设计生图提交 seed=${runSeed}`, src);
      const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType: 'exhibition-wayfinding-design', seed: runSeed, nodeTitle: '导视系统设计' };
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
            res = await queryExternalImageStatus({ providerId: providerSelection.provider.id, taskId: pollingTaskId, providerModel: externalProviderModel, outputFormat, historyContext });
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
            if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') throw new Error(q.error || '任务失败');
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
        spaceReferenceImages,
        graphicReferenceImages,
        error: '',
      });
      logBus.success(`导视系统设计生图完成: ${urls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`导视系统设计生图失败: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, arrowStyle, aspectRatio, busy, colorMaterial, colorMaterialPresetText, d.providerParams, d.supplement, destinations, dimensions, externalProviderModel, graphicReferenceImages, id, isExternalSelected, isReadonly, language, materialId, modelDef.id, modelDef.paramKind, mountingId, museumName, notes, outputFormat, outputMode, projectTheme, providerSelection.provider, referenceImages, routeText, scope, seed, signText, signTypes, sizeLevel, spaceReferenceImages, update, zones]);

  const runGenerate = useCallback(async () => {
    if (isReadonly || busy) return;
    const buildPagePrompt = (page: { index: number; total: number; title: string }) => buildWayfindingImagePrompt({
      outputMode,
      outputPageMode,
      outputPageCount,
      pageIndex: page.index,
      pageTitle: page.title,
      pageFocus: (page as any).focus,
      pageSignTypes: (page as any).signTypeIds,
      totalPages: resolvedOutputPageCount,
      scope,
      signTypes,
      materialId,
      mountingId,
      arrowStyle,
      language,
      dimensions,
      museumName,
      projectTheme,
      zones,
      destinations,
      routeText,
      signText,
      notes,
      colorMaterial,
      colorMaterialPresetText,
      supplement: d.supplement,
      hasSpaceReferenceImage: spaceReferenceImages.length > 0,
      hasGraphicReferenceImage: graphicReferenceImages.length > 0,
    });
    const prompts = outputPages.map(buildPagePrompt);
    const joinedPrompt = prompts.join('\n\n---\n\n');
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-wayfinding-design:${id.slice(0, 6)}`;
    update({
      status: 'generating',
      progress: `提交生图... 0/${resolvedOutputPageCount} 页`,
      error: '',
      imageUrls: [],
      urls: [],
      resolvedOutputPageCount,
      lastPrompt: joinedPrompt,
      lastSeed: runSeed,
      referenceImages,
      spaceReferenceImages,
      graphicReferenceImages,
    });
    try {
      logBus.info(`Wayfinding generation submit seed=${runSeed}, pages=${resolvedOutputPageCount}`, src);
      const allUrls: string[] = [];
      for (const page of outputPages) {
        const pagePrompt = buildPagePrompt(page);
        const pageSeed = ((runSeed + page.index - 2) % MAX_IMAGE_SEED) + 1;
        const historyContext = {
          canvasId: activeCanvasId,
          sourceNodeId: id,
          sourceNodeType: 'exhibition-wayfinding-design',
          seed: pageSeed,
          nodeTitle: `导视系统设计 ${page.index}/${resolvedOutputPageCount}`,
        };
        let pageUrls: string[] = [];
        update({ progress: `第 ${page.index}/${resolvedOutputPageCount} 页生成中：${page.title}` });
        if (isExternalSelected && providerSelection.provider) {
          if (!externalProviderModel) throw new Error('扩展平台未配置可用图像模型');
          const size = externalImageSizeFor(aspectRatio, sizeLevel);
          let res = await generateExternalImage({
            providerId: providerSelection.provider.id,
            providerModel: externalProviderModel,
            model: externalProviderModel,
            prompt: pagePrompt,
            size,
            aspect_ratio: aspectRatio,
            image_size: sizeLevel,
            images: referenceImages,
            outputFormat,
            seed: pageSeed,
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
              res = await queryExternalImageStatus({ providerId: providerSelection.provider.id, taskId: pollingTaskId, providerModel: externalProviderModel, outputFormat, historyContext });
              update({ taskId: pollingTaskId, progress: `第 ${page.index}/${resolvedOutputPageCount} 页 ${Math.min(99, Math.round(((index + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%` });
              if (res.imageUrls?.length || (res.code && res.code !== 'running')) break;
            }
          }
          pageUrls = res.imageUrls || [];
        } else {
          const submit = await submitImageAsync({
            model: modelDef.id,
            apiModel,
            paramKind: modelDef.paramKind,
            prompt: pagePrompt,
            aspect_ratio: aspectRatio,
            image_size: sizeLevel,
            images: referenceImages,
            n: 1,
            outputFormat,
            seed: pageSeed,
            historyContext,
          });
          pageUrls = submit.urls || [];
          if (!submit.sync) {
            if (!submit.taskId) throw new Error('未获取到任务 ID');
            let lastProgress = submit.progress || '5%';
            update({ taskId: submit.taskId, progress: `第 ${page.index}/${resolvedOutputPageCount} 页 ${lastProgress}` });
            for (let index = 0; index < 1800; index += 1) {
              if (pollAbortRef.current) throw new Error('任务已取消');
              await new Promise((resolve) => setTimeout(resolve, 2000));
              const q = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
              if (q.progress && q.progress !== lastProgress) {
                lastProgress = q.progress;
                update({ progress: `第 ${page.index}/${resolvedOutputPageCount} 页 ${q.progress}` });
              }
              const statusText = String(q.status || '').toLowerCase();
              if (statusText === 'completed' || statusText === 'success' || statusText === 'done') {
                pageUrls = q.urls || [];
                break;
              }
              if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') throw new Error(q.error || '任务失败');
            }
          }
        }
        if (!pageUrls.length) throw new Error(`第 ${page.index} 页任务完成但未返回图片`);
        for (const url of pageUrls) {
          if (url && !allUrls.includes(url)) allUrls.push(url);
        }
        update({ imageUrl: allUrls[0], imageUrls: allUrls, urls: allUrls, progress: `已完成 ${page.index}/${resolvedOutputPageCount} 页` });
      }
      if (!allUrls.length) throw new Error('任务完成但未返回图片');
      update({
        status: 'success',
        progress: '100%',
        imageUrl: allUrls[0],
        imageUrls: allUrls,
        urls: allUrls,
        prompt: joinedPrompt,
        outputText: joinedPrompt,
        text: joinedPrompt,
        resolvedOutputPageCount,
        referenceImages,
        spaceReferenceImages,
        graphicReferenceImages,
        error: '',
      });
      logBus.success(`Wayfinding generation completed: ${allUrls.length} images`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`Wayfinding generation failed: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, arrowStyle, aspectRatio, busy, colorMaterial, colorMaterialPresetText, d.providerParams, d.supplement, destinations, dimensions, externalProviderModel, graphicReferenceImages.length, id, isExternalSelected, isReadonly, language, materialId, modelDef.id, modelDef.paramKind, mountingId, museumName, notes, outputFormat, outputMode, outputPageCount, outputPageMode, outputPages, projectTheme, providerSelection.provider, referenceImages, resolvedOutputPageCount, routeText, scope, seed, signText, signTypes, sizeLevel, spaceReferenceImages, update, zones]);

  useRunTrigger(id, runGenerate, 'image');

  const updateDimension = (key: keyof WayfindingDimensions, value: string) => {
    const n = Number(value);
    update({ dimensions: { ...dimensions, [key]: Number.isFinite(n) && n >= 0 ? Math.round(n) : 0 } });
  };

  const toggleSignType = (signType: string) => {
    const set = new Set(signTypes);
    if (set.has(signType)) set.delete(signType);
    else set.add(signType);
    const next = Array.from(set);
    update({ signTypes: next.length ? next : [signType] });
  };

  const updateListText = (key: 'zones' | 'destinations', value: string) => update({ [key]: normalizeTextArray(value) });

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

  return (
    <div
      data-exhibition-compact-node-type="exhibition-wayfinding-design"
      className={`relative w-[640px] overflow-hidden rounded-xl border-2 transition-all ${selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'}`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!border-0 t8-exhibition-handle--image" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：导视系统设计图" />
      <Handle id="text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--text" style={{ top: '31%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输入：上游文本资料" />
      <Handle id="space-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '52%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：空间/材质参考图" />
      <Handle id="graphic-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '68%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：标识图形参考图" />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200"><MapPinned size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">导视系统设计</div>
          <div className="truncate text-[10px] text-white/45">室内外导览标牌 / 系统规范图 / 方案效果图</div>
        </div>
        <NodeHelpButton nodeType="exhibition-wayfinding-design" />
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[760px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()} onWheelCapture={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section data-exhibition-compact-section="source" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><FileText size={13} /> 资料与提炼</div>
            <div className="flex gap-1">
              <button data-exhibition-compact-item="actions" type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => fileRef.current?.click()}><Upload size={13} /> 上传文档</button>
              <button data-exhibition-compact-item="actions" type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => void runExtract()}><Brain size={13} /> LLM 提炼</button>
            </div>
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void pickDocument(e.target.files?.[0])} />
          <label data-exhibition-compact-item="llm-settings" className="block space-y-1">
            <span className="text-[10px] text-white/55">LLM 配置模型</span>
            <select className={FIELD} value={activeLlmConfig?.id || ''} disabled={isReadonly || busy || llmConfigOptions.length === 0} onChange={(e) => {
              const next = llmConfigOptions.find((item) => item.id === e.target.value) || llmConfigOptions[0];
              update({ llmKeyId: next?.id || '', llmModel: next?.model || configuredLlmModel });
            }}>
              {llmConfigOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id} · {item.model || configuredLlmModel}</option>)}
            </select>
          </label>
          <div data-exhibition-compact-item="document" className="text-[10px] text-white/40">{documentLabel(d.documentMeta)}</div>
          <PromptTextarea data-exhibition-compact-item="document" title="扩大编辑" className={`${FIELD} min-h-[62px] resize-y`} value={sourceText} disabled={isReadonly || busy} readOnly={isReadonly || busy} placeholder="粘贴导视设计资料，或连接上游文本/上传文档" onValueChange={(value) => update({ sourceText: value })} />
          {upstream.texts.length > 0 && <div className="text-[10px] text-sky-200/75">已连接 {upstream.texts.length} 条上游文本，运行提炼时会合并使用。</div>}
        </section>

        <section data-exhibition-compact-section="system" className="grid grid-cols-2 gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <label data-exhibition-compact-item="mode-scope" className="space-y-1">
            <span className="text-[10px] text-white/55">输出模式</span>
            <select className={FIELD} value={outputMode} disabled={isReadonly || busy} onChange={(e) => update({ outputMode: normalizeWayfindingOutputMode(e.target.value) })}>
              {WAYFINDING_OUTPUT_MODES.map((item: WayfindingOption) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label data-exhibition-compact-item="mode-scope" className="space-y-1">
            <span className="text-[10px] text-white/55">空间范围</span>
            <select className={FIELD} value={scope} disabled={isReadonly || busy} onChange={(e) => update({ scope: normalizeWayfindingScope(e.target.value) })}>
              {WAYFINDING_SCOPE_OPTIONS.map((item: WayfindingOption) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label data-exhibition-compact-item="page-control" className="col-span-2 space-y-1">
            <span className="text-[10px] text-white/55">输出页面</span>
            <select
              className={FIELD}
              value={outputPageMode === 'auto' ? 'auto' : String(outputPageCount)}
              disabled={isReadonly || busy}
              onChange={(e) => {
                if (e.target.value === 'auto') update({ outputPageMode: 'auto' });
                else update({ outputPageMode: 'fixed', outputPageCount: normalizeWayfindingOutputPageCount(e.target.value) });
              }}
            >
              {WAYFINDING_OUTPUT_PAGE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <div className="text-[10px] text-white/40">{outputPageMode === 'auto' ? `自动分页：预计 ${resolvedOutputPageCount} 页` : `固定输出：${resolvedOutputPageCount} 页`}</div>
          </label>
          <label data-exhibition-compact-item="text-fields" className="space-y-1">
            <span className="text-[10px] text-white/55">场馆名称</span>
            <input className={FIELD} value={museumName} disabled={isReadonly || busy} onChange={(e) => update({ museumName: e.target.value })} />
          </label>
          <label data-exhibition-compact-item="text-fields" className="space-y-1">
            <span className="text-[10px] text-white/55">项目主题</span>
            <input className={FIELD} value={projectTheme} disabled={isReadonly || busy} onChange={(e) => update({ projectTheme: e.target.value })} />
          </label>
          <label data-exhibition-compact-item="text-fields" className="space-y-1">
            <span className="text-[10px] text-white/55">展区/楼层（逗号或换行）</span>
            <textarea className={`${FIELD} min-h-[52px] resize-y`} value={zones.join('\n')} disabled={isReadonly || busy} onChange={(e) => updateListText('zones', e.target.value)} />
          </label>
          <label data-exhibition-compact-item="text-fields" className="space-y-1">
            <span className="text-[10px] text-white/55">目的地（逗号或换行）</span>
            <textarea className={`${FIELD} min-h-[52px] resize-y`} value={destinations.join('\n')} disabled={isReadonly || busy} onChange={(e) => updateListText('destinations', e.target.value)} />
          </label>
        </section>

        <section data-exhibition-compact-section="signage" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="text-[11px] font-semibold text-cyan-100">标牌类型</div>
          <div data-exhibition-compact-item="sign-types" className="grid grid-cols-3 gap-1.5">
            {WAYFINDING_SIGN_TYPES.map((item: WayfindingOption) => {
              const checked = signTypes.includes(item.id);
              return (
                <label key={item.id} className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] ${checked ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-black/15 text-white/60'}`}>
                  <input type="checkbox" className="accent-cyan-300" checked={checked} disabled={isReadonly || busy} onChange={() => toggleSignType(item.id)} />
                  <span className="truncate">{item.label}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section data-exhibition-compact-section="style" className="grid grid-cols-2 gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div data-exhibition-compact-item="preset-options" className="col-span-2 space-y-1.5 rounded border border-cyan-300/20 bg-cyan-300/[0.06] p-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-cyan-100">色彩与材质预设</div>
                <div className="truncate text-[9px] text-white/45">
                  {selectedColorMaterialPreset ? `当前预设：${selectedColorMaterialPreset.label}` : `可用共享预设 ${colorMaterialPresets.length} 个`}
                </div>
              </div>
              {currentUser && (
                <button type="button" className={BUTTON} disabled={colorMaterialSaving || busy} onClick={() => setColorMaterialEditorOpen((open) => !open)}>
                  <Settings size={11} />管理
                </button>
              )}
            </div>
            <ColorMaterialPresetSelect
              className={FIELD}
              presets={colorMaterialPresets}
              value={d.colorMaterialPreset || ''}
              disabled={isReadonly || busy}
              placeholder="选择共享色彩与材质预设"
              onChange={(presetId, preset) => update({
                colorMaterialPreset: presetId,
                colorMaterial: colorMaterialTextFromPreset(preset),
              })}
            />
            {selectedColorMaterialPreset?.info && (
              <div className="rounded border border-cyan-300/15 bg-cyan-300/5 px-2 py-1 text-[10px] leading-snug text-cyan-50/70">
                {selectedColorMaterialPreset.info}
              </div>
            )}
            {currentUser && (
              <ColorMaterialPresetEditorModal
                open={colorMaterialEditorOpen}
                presets={colorMaterialPresets}
                saving={colorMaterialSaving || busy}
                error={colorMaterialError}
                title="导视系统色彩与材质预设管理"
                onClose={() => setColorMaterialEditorOpen(false)}
                onSave={saveColorMaterialPresetItems}
                canManageSystem={canManageTeam}
                onRefresh={setColorMaterialPresets}
              />
            )}
          </div>
          <label data-exhibition-compact-item="manual-color-material" className="col-span-2 space-y-1">
            <span className="text-[10px] text-white/55">手动色彩与材质补充</span>
            <PromptTextarea
              title="扩大编辑"
              className={`${FIELD} min-h-[46px] resize-y`}
              value={colorMaterial}
              disabled={isReadonly || busy}
              readOnly={isReadonly || busy}
              placeholder="例如：深灰铝板、低反射亚克力、暖铜色边框、浅色石材基座、博物馆低眩光质感"
              onValueChange={(value) => update({ colorMaterial: value, colorMaterialPreset: '' })}
            />
          </label>
          <label data-exhibition-compact-item="material" className="space-y-1">
            <span className="text-[10px] text-white/55">材质工艺</span>
            <select className={FIELD} value={materialId} disabled={isReadonly || busy} onChange={(e) => update({ materialId: normalizeWayfindingMaterial(e.target.value) })}>
              {WAYFINDING_MATERIALS.map((item: WayfindingOption) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label data-exhibition-compact-item="mounting" className="space-y-1">
            <span className="text-[10px] text-white/55">安装方式</span>
            <select className={FIELD} value={mountingId} disabled={isReadonly || busy} onChange={(e) => update({ mountingId: normalizeWayfindingMounting(e.target.value) })}>
              {WAYFINDING_MOUNTING_OPTIONS.map((item: WayfindingOption) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label data-exhibition-compact-item="icons-language" className="space-y-1">
            <span className="text-[10px] text-white/55">箭头/图标</span>
            <select className={FIELD} value={arrowStyle} disabled={isReadonly || busy} onChange={(e) => update({ arrowStyle: normalizeWayfindingArrowStyle(e.target.value) })}>
              {WAYFINDING_ARROW_STYLES.map((item: WayfindingOption) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label data-exhibition-compact-item="icons-language" className="space-y-1">
            <span className="text-[10px] text-white/55">语言</span>
            <select className={FIELD} value={language} disabled={isReadonly || busy} onChange={(e) => update({ language: normalizeWayfindingLanguage(e.target.value) })}>
              {WAYFINDING_LANGUAGES.map((item: WayfindingOption) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <div data-exhibition-compact-item="dimensions" className="col-span-2 grid grid-cols-4 gap-2">
            {[
              ['widthMm', '宽 mm'],
              ['heightMm', '高 mm'],
              ['depthMm', '厚/深 mm'],
              ['installHeightMm', '安装高 mm'],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-[10px] text-white/55">{label}</span>
                <input className={FIELD} type="number" min={0} value={(dimensions as any)[key] || ''} disabled={isReadonly || busy} onChange={(e) => updateDimension(key as keyof WayfindingDimensions, e.target.value)} />
              </label>
            ))}
          </div>
          <label data-exhibition-compact-item="copy" className="col-span-2 space-y-1">
            <span className="text-[10px] text-white/55">导览动线</span>
            <PromptTextarea title="扩大编辑" className={`${FIELD} min-h-[54px] resize-y`} value={routeText} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => update({ routeText: value })} />
          </label>
          <label data-exhibition-compact-item="copy" className="col-span-2 space-y-1">
            <span className="text-[10px] text-white/55">上牌文字</span>
            <PromptTextarea title="扩大编辑" className={`${FIELD} min-h-[54px] resize-y`} value={signText} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => update({ signText: value })} />
          </label>
          <label data-exhibition-compact-item="manual-input" className="col-span-2 space-y-1">
            <span className="text-[10px] text-white/55">补充要求</span>
            <PromptTextarea title="扩大编辑" className={`${FIELD} min-h-[48px] resize-y`} value={d.supplement || ''} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => update({ supplement: value })} />
          </label>
        </section>

        <section data-exhibition-compact-section="references" className="grid grid-cols-2 gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div data-exhibition-compact-item="space-reference" className="space-y-1">
            <div className="text-[10px] text-white/55">空间/材质参考 · {spaceReferenceImages.length}</div>
            {spaceReferenceImages.length ? <div className="grid grid-cols-4 gap-1">{spaceReferenceImages.slice(0, 8).map((url) => <img key={url} src={url} alt="" className="h-14 w-full rounded border border-white/10 object-cover" draggable={false} />)}</div> : <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接空间或材质参考图</div>}
          </div>
          <div data-exhibition-compact-item="graphic-reference" className="space-y-1">
            <div className="text-[10px] text-white/55">标识图形参考 · {graphicReferenceImages.length}</div>
            {graphicReferenceImages.length ? <div className="grid grid-cols-4 gap-1">{graphicReferenceImages.slice(0, 8).map((url) => <img key={url} src={url} alt="" className="h-14 w-full rounded border border-white/10 object-cover" draggable={false} />)}</div> : <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接图标/箭头/视觉参考图</div>}
          </div>
        </section>

        <section data-exhibition-compact-section="model" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生图</div>
            <button data-exhibition-compact-item="actions" type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成导视图</button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            <label data-exhibition-compact-item="provider" className="col-span-2 space-y-1">
              <span className="text-[10px] text-white/55">生图平台</span>
              <select className={FIELD} value={providerSelectValue} disabled={isReadonly || busy || (!allowZhenzhenFallback && imageAdvancedProviders.length === 0)} onChange={(e) => {
                const nextId = e.target.value;
                if (nextId === 'zhenzhen') {
                  update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
                  return;
                }
                const provider = imageAdvancedProviders.find((item) => item.id === nextId);
                if (!provider) return;
                const models = advancedProviderModelOptions(provider, 'image');
                update({ providerSource: provider.protocol, providerId: provider.id, providerModel: models[0] || '' });
              }}>
                {allowZhenzhenFallback && <option value="zhenzhen">内置生图平台</option>}
                {imageAdvancedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
              </select>
            </label>
            <label data-exhibition-compact-item="model" className="col-span-2 space-y-1">
              <span className="text-[10px] text-white/55">生图模型</span>
              {isExternalSelected ? (
                <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy || externalModelOptions.length === 0} onChange={(e) => update({ providerModel: e.target.value })}>
                  {externalModelOptions.length > 0 ? externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>) : <option value="">未配置图像模型</option>}
                </select>
              ) : (
                <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(e) => update({ apiModel: e.target.value })}>
                  {modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              )}
            </label>
            <label data-exhibition-compact-item="aspect-size" className="space-y-1">
              <span className="text-[10px] text-white/55">比例</span>
              <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(e) => update({ aspectRatio: e.target.value })}>
                {modelDef.aspectRatios.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
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
              <span className="text-[10px] text-white/55">格式</span>
              <select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(e) => update({ outputFormat: e.target.value })}>
                <option value="jpg">JPG</option>
                <option value="png">PNG</option>
              </select>
            </label>
            <label data-exhibition-compact-item="seed-name" className="space-y-1">
              <span className="text-[10px] text-white/55">Seed</span>
              <input className={FIELD} type="number" min={0} value={seed} disabled={isReadonly || busy} onChange={(e) => update({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
            </label>
          </div>
          {d.progress && <div data-exhibition-compact-item="progress" className="text-[10px] text-cyan-100">{d.progress}</div>}
          {d.imageUrl && <img data-exhibition-compact-item="preview" src={d.imageUrl} alt="" className="max-h-56 w-full rounded border border-white/10 object-contain" draggable={false} />}
        </section>

        <section data-exhibition-compact-section="prompt" data-exhibition-compact-item="prompt-preview" className="rounded border border-white/10 bg-black/20 p-2">
          <div className="mb-1 text-[11px] font-semibold text-cyan-100">当前 Prompt</div>
          <div className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">{previewPrompt}</div>
        </section>
      </div>
    </div>
  );
};

export default memo(WayfindingDesignNode);
