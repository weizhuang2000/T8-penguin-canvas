import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { ArrowDown, ArrowUp, Brain, FileText, Image as ImageIcon, Loader2, Palette, Play, Upload } from 'lucide-react';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
import { extractDocument, getCurrentUser, getElevationPromptPresets, getUnitPanelMaterials, MAX_DOCUMENT_FILE_SIZE, MAX_DOCUMENT_FILE_SIZE_MB, updateUnitPanelMaterials, type AuthUser, type ElevationColorMaterialPresetItem, type ExtractedDocument, type UnitPanelMaterialItem } from '../../services/api';
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
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import ColorMaterialPresetSelect from './ColorMaterialPresetSelect';
import UnitPanelMaterialEditorModal from './UnitPanelMaterialEditorModal';
import UnitPanelMaterialSelect from './UnitPanelMaterialSelect';
import {
  buildUnitPanelExtractPrompt,
  buildUnitPanelImagePrompt,
  buildUnitPanelTranslatePrompt,
  languageMeta,
  normalizeUnitPanelBodyFont,
  normalizeUnitPanelDimensions,
  normalizeUnitPanelLanguages,
  normalizeUnitPanelOutputMode,
  normalizeUnitPanelTextLayoutBounds,
  normalizeUnitPanelTitleFont,
  parseUnitPanelExtractJson,
  parseUnitPanelTranslateJson,
  UNIT_PANEL_BODY_FONTS,
  UNIT_PANEL_LANGUAGES,
  UNIT_PANEL_TITLE_FONTS,
  type UnitPanelFontOption,
  type UnitPanelLanguage,
} from '../../utils/unitPanelDesignPrompt';

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

function toneName(red: number, green: number, blue: number) {
  const { h, s, l } = rgbToHsl(red, green, blue);
  if (l <= 0.12) return '黑色';
  if (s <= 0.1) return l >= 0.8 ? '浅灰/白色' : l <= 0.32 ? '深灰' : '中性灰';
  if (h < 20 || h >= 345) return '红色';
  if (h < 46) return '橙褐/铜色';
  if (h < 70) return '金黄';
  if (h < 165) return '绿色';
  if (h < 195) return '青色';
  if (h < 250) return '蓝色';
  if (h < 300) return '蓝紫';
  return '紫红';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('参考图加载失败，无法识别主色调'));
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.src = src;
  });
}

async function analyzeReferenceImageDominantTone(imageUrl: string): Promise<string> {
  const image = await loadImage(imageUrl);
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
  const buckets = new Map<string, number>();
  let warm = 0;
  let cool = 0;
  let light = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const hsl = rgbToHsl(red, green, blue);
    const name = toneName(red, green, blue);
    const weight = 1 + Math.min(0.8, hsl.s);
    buckets.set(name, (buckets.get(name) || 0) + weight);
    if (hsl.s > 0.08 && (hsl.h < 75 || hsl.h >= 325)) warm += weight;
    if (hsl.s > 0.08 && hsl.h >= 165 && hsl.h < 285) cool += weight;
    light += hsl.l * weight;
    count += weight;
  }
  const names = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name);
  const lightText = count ? (light / count < 0.38 ? '明度偏暗' : light / count > 0.68 ? '明度偏亮' : '明度适中') : '明度适中';
  const tempText = warm > cool * 1.2 ? '整体偏暖' : cool > warm * 1.2 ? '整体偏冷' : '冷暖较均衡';
  return `主色调：${names.join('、') || '中性灰'}；${tempText}，${lightText}。`;
}

function colorMaterialTextFromPreset(preset: ElevationColorMaterialPresetItem | null): string {
  if (!preset) return '';
  return [preset.core, preset.features, preset.usage, preset.info].map((item) => String(item || '').trim()).filter(Boolean).join('；');
}

function llmErrorMessage(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/no available accounts/i.test(message)) return '当前 LLM 没有可用账号，请切换可用的 LLM 配置后重试。';
  return message || 'LLM 请求失败';
}

const UnitPanelDesignNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef(false);
  const upstream = useUpstreamMaterials(id);
  const colorMaterialReferenceImage = useInputImageByHandle(id, 'color-material-reference');
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [materials, setMaterials] = useState<UnitPanelMaterialItem[]>([]);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [materialsError, setMaterialsError] = useState('');
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);

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

  const outputMode = normalizeUnitPanelOutputMode(d.outputMode);
  const dimensions = normalizeUnitPanelDimensions(d.dimensions);
  const textLayoutBounds = normalizeUnitPanelTextLayoutBounds(d.textLayoutBounds);
  const languages: string[] = normalizeUnitPanelLanguages(d.languages);
  const titleFont = normalizeUnitPanelTitleFont(d.titleFont);
  const bodyFont = normalizeUnitPanelBodyFont(d.bodyFont);
  const translations = d.translations && typeof d.translations === 'object' ? d.translations : {};
  const titleText = String(d.titleText || '').trim();
  const bodyText = String(d.bodyText || '').trim();
  const projectTheme = String(d.projectTheme || '').trim();
  const sourceText = String(d.sourceText || '');
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const effectiveSourceText = [d.useUpstream !== false ? upstreamText : '', sourceText].filter((item) => item.trim()).join('\n\n');
  const selectedPrimaryMaterial = useMemo(
    () => materials.find((item) => item.id === d.primaryMaterialId) || null,
    [d.primaryMaterialId, materials],
  );
  const selectedSecondaryMaterials = useMemo(() => {
    const ids = Array.isArray(d.secondaryMaterialIds) ? d.secondaryMaterialIds.map(String) : [];
    return materials.filter((item) => ids.includes(item.id));
  }, [d.secondaryMaterialIds, materials]);
  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );
  const colorMaterialReferenceTone = String(d.colorMaterialReferenceTone || '').trim();
  const status = String(d.status || 'idle');
  const busy = ['extracting', 'translating', 'generating', 'uploading'].includes(status);
  const canManageMaterials = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const referenceOverridesMaterialAndFont = !!colorMaterialReferenceImage;

  const previewPrompt = useMemo(() => buildUnitPanelImagePrompt({
    outputMode,
    splitDesignEnabled: d.splitDesignEnabled !== false,
    dimensionMarksEnabled: d.dimensionMarksEnabled === true,
    imageDisplayEnabled: d.imageDisplayEnabled !== false,
    specialShapeEnabled: d.specialShapeEnabled === true,
    dimensions,
    textLayoutBounds,
    languages,
    translations,
    titleText,
    bodyText,
    titleFont,
    bodyFont,
    projectTheme,
    primaryMaterial: selectedPrimaryMaterial,
    secondaryMaterials: selectedSecondaryMaterials,
    colorMaterialPresetText: colorMaterialTextFromPreset(selectedColorMaterialPreset),
    colorMaterialReferenceTone,
    manualColorMaterial: d.colorMaterial,
    hasColorMaterialReferenceImage: !!colorMaterialReferenceImage,
  }), [bodyFont, bodyText, colorMaterialReferenceImage, colorMaterialReferenceTone, d.colorMaterial, d.dimensionMarksEnabled, d.imageDisplayEnabled, d.specialShapeEnabled, d.splitDesignEnabled, dimensions, languages, outputMode, projectTheme, selectedColorMaterialPreset, selectedPrimaryMaterial, selectedSecondaryMaterials, textLayoutBounds, titleFont, titleText, translations]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getUnitPanelMaterials().then(setMaterials).catch(() => setMaterials([]));
    getElevationPromptPresets().then((presets) => setColorMaterialPresets(presets.colorMaterial || [])).catch(() => setColorMaterialPresets([]));
  }, []);

  useEffect(() => {
    if (!colorMaterialReferenceImage) {
      if (d.colorMaterialReferenceTone || d.colorMaterialReferenceToneSource || d.colorMaterialReferenceToneStatus) {
        update({ colorMaterialReferenceTone: '', colorMaterialReferenceToneSource: '', colorMaterialReferenceToneStatus: '' });
      }
      return;
    }
    if (d.colorMaterialReferenceToneSource === colorMaterialReferenceImage && colorMaterialReferenceTone) return;
    let cancelled = false;
    void (async () => {
      try {
        const tone = await analyzeReferenceImageDominantTone(colorMaterialReferenceImage);
        if (!cancelled) update({ colorMaterialReferenceTone: tone, colorMaterialReferenceToneSource: colorMaterialReferenceImage, colorMaterialReferenceToneStatus: '' });
      } catch (error: any) {
        if (!cancelled) update({ colorMaterialReferenceTone: '主色调：识别失败，可手动填写。', colorMaterialReferenceToneSource: colorMaterialReferenceImage, colorMaterialReferenceToneStatus: error?.message || '主色调识别失败' });
      }
    })();
    return () => { cancelled = true; };
  }, [colorMaterialReferenceImage, colorMaterialReferenceTone, d.colorMaterialReferenceTone, d.colorMaterialReferenceToneSource, d.colorMaterialReferenceToneStatus, update]);

  useEffect(() => {
    const refs = [colorMaterialReferenceImage].filter(Boolean);
    if (
      d.prompt !== previewPrompt ||
      d.outputText !== previewPrompt ||
      d.text !== previewPrompt ||
      JSON.stringify(d.referenceImages || []) !== JSON.stringify(refs)
    ) {
      update({ prompt: previewPrompt, outputText: previewPrompt, text: previewPrompt, referenceImages: refs });
    }
  }, [colorMaterialReferenceImage, d.outputText, d.prompt, d.referenceImages, d.text, previewPrompt, update]);

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
    update({ status: 'extracting', progress: 'LLM 提炼标题和说明文字...', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.25,
        messages: [{ role: 'user', content: buildUnitPanelExtractPrompt({ sourceText: effectiveSourceText, projectTheme }) }],
      });
      const parsed = parseUnitPanelExtractJson(response.content || '');
      if (!parsed.titleText && !parsed.bodyText) throw new Error('LLM 未返回有效标题或说明文字');
      update({
        titleText: parsed.titleText || titleText,
        bodyText: parsed.bodyText || bodyText,
        status: 'idle',
        progress: '',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
    }
  }, [activeLlmConfig?.id, bodyText, busy, effectiveSourceText, isReadonly, llmModel, projectTheme, titleText, update]);

  const runTranslate = useCallback(async () => {
    if (isReadonly || busy) return;
    if (!titleText && !bodyText) {
      update({ status: 'error', error: '请先填写或提炼标题字和说明文字' });
      return;
    }
    update({ status: 'translating', progress: 'LLM 自动翻译中...', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.2,
        messages: [{ role: 'user', content: buildUnitPanelTranslatePrompt({ languages, titleText, bodyText }) }],
      });
      const parsed = parseUnitPanelTranslateJson(response.content || '', languages);
      update({ translations: { ...translations, ...parsed }, status: 'idle', progress: '', error: '' });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
    }
  }, [activeLlmConfig?.id, bodyText, busy, isReadonly, languages, llmModel, titleText, translations, update]);

  const runGenerate = useCallback(async () => {
    if (isReadonly) return;
    const imagePrompt = buildUnitPanelImagePrompt({
      outputMode,
      splitDesignEnabled: d.splitDesignEnabled !== false,
      dimensionMarksEnabled: d.dimensionMarksEnabled === true,
      imageDisplayEnabled: d.imageDisplayEnabled !== false,
      specialShapeEnabled: d.specialShapeEnabled === true,
      dimensions,
      textLayoutBounds,
      languages,
      translations,
      titleText,
      bodyText,
      titleFont,
      bodyFont,
      projectTheme,
      primaryMaterial: selectedPrimaryMaterial,
      secondaryMaterials: selectedSecondaryMaterials,
      colorMaterialPresetText: colorMaterialTextFromPreset(selectedColorMaterialPreset),
      colorMaterialReferenceTone,
      manualColorMaterial: d.colorMaterial,
      hasColorMaterialReferenceImage: !!colorMaterialReferenceImage,
    });
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `unit-panel-design:${id.slice(0, 6)}`;
    update({ status: 'generating', progress: '提交生图...', error: '', imageUrls: [], lastPrompt: imagePrompt, lastSeed: runSeed });
    try {
      logBus.info(`单元板设计生图提交 seed=${runSeed}`, src);
      const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType: 'unit-panel-design', seed: runSeed, nodeTitle: '单元板设计' };
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
          images: colorMaterialReferenceImage ? [colorMaterialReferenceImage] : [],
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
          images: colorMaterialReferenceImage ? [colorMaterialReferenceImage] : [],
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
        prompt: imagePrompt,
        outputText: imagePrompt,
        text: imagePrompt,
        error: '',
      });
      logBus.success(`单元板设计生图完成: ${urls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`单元板设计生图失败: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, aspectRatio, bodyFont, bodyText, colorMaterialReferenceImage, colorMaterialReferenceTone, d.colorMaterial, d.dimensionMarksEnabled, d.imageDisplayEnabled, d.providerParams, d.specialShapeEnabled, d.splitDesignEnabled, dimensions, externalProviderModel, id, isExternalSelected, isReadonly, languages, modelDef.id, modelDef.paramKind, outputFormat, outputMode, projectTheme, providerSelection.provider, seed, selectedColorMaterialPreset, selectedPrimaryMaterial, selectedSecondaryMaterials, sizeLevel, textLayoutBounds, titleFont, titleText, translations, update]);

  useRunTrigger(id, runGenerate, 'image');

  const updateDimension = (key: string, value: string) => {
    const n = Number(value);
    update({ dimensions: { ...dimensions, [key]: Number.isFinite(n) && n >= 0 ? n : 0 } });
  };
  const updatePanelCount = (value: number | string) => {
    const n = Math.floor(Number(value) || 0);
    update({ dimensions: { ...dimensions, panelCount: Math.max(0, Math.min(99, n)) } });
  };
  const updateTextLayoutBound = (key: 'lowerMeters' | 'upperMeters', value: string) => {
    const n = Number(value);
    update({ textLayoutBounds: { ...textLayoutBounds, [key]: Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0 } });
  };

  const moveLanguage = (lang: string, delta: number) => {
    const index = languages.indexOf(lang);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= languages.length) return;
    const next = languages.slice();
    next.splice(index, 1);
    next.splice(nextIndex, 0, lang);
    update({ languages: next });
  };

  const saveMaterials = async (next: UnitPanelMaterialItem[]) => {
    setMaterialsSaving(true);
    setMaterialsError('');
    try {
      const saved = await updateUnitPanelMaterials(next);
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
      className={`relative w-[720px] rounded-xl border-2 transition-all ${selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'}`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!bg-cyan-300 !border-0" title="输出：单元板设计图" />
      <Handle id="text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-sky-300" style={{ top: '35%' }} title="输入：上游文本资料" />
      <Handle id="color-material-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-rose-300" style={{ top: '54%' }} title="输入：色彩与材质参考图" />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200"><Palette size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">单元板设计</div>
          <div className="truncate text-[10px] text-white/45">文本提炼 / 多语言 / 材质优先级 / 尺寸标注</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[760px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section className="grid grid-cols-2 gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <label className="space-y-1">
            <span className="text-[10px] text-white/55">输出形态</span>
            <select className={FIELD} value={outputMode} disabled={isReadonly || busy} onChange={(e) => update({ outputMode: normalizeUnitPanelOutputMode(e.target.value) })}>
              <option value="set">整套板式图</option>
              <option value="single">单块单元板</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/55">LLM 配置模型</span>
            <select
              className={FIELD}
              value={activeLlmConfig?.id || ''}
              disabled={isReadonly || busy}
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
          <label className="flex items-center gap-2 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[11px] text-white/70">
            <input type="checkbox" className="accent-cyan-300" checked={d.splitDesignEnabled !== false} disabled={isReadonly || busy} onChange={(e) => update({ splitDesignEnabled: e.target.checked })} />
            是否分体设计
          </label>
          <label className="flex items-center gap-2 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[11px] text-white/70">
            <input type="checkbox" className="accent-cyan-300" checked={d.dimensionMarksEnabled === true} disabled={isReadonly || busy} onChange={(e) => update({ dimensionMarksEnabled: e.target.checked })} />
            是否标注尺寸
          </label>
          <label className="flex items-center gap-2 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[11px] text-white/70">
            <input type="checkbox" className="accent-cyan-300" checked={d.imageDisplayEnabled !== false} disabled={isReadonly || busy} onChange={(e) => update({ imageDisplayEnabled: e.target.checked })} />
            图片显示
          </label>
          <label className="flex items-center gap-2 rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[11px] text-white/70">
            <input type="checkbox" className="accent-cyan-300" checked={d.specialShapeEnabled === true} disabled={isReadonly || busy} onChange={(e) => update({ specialShapeEnabled: e.target.checked })} />
            特殊造型
          </label>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><FileText size={13} /> 文本导入与提炼</div>
            <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.pdf,.docx" onChange={(e) => void pickDocument(e.target.files?.[0] || undefined)} />
            <button type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => fileRef.current?.click()}><Upload size={13} /> 上传文档</button>
          </div>
          <div className="text-[10px] text-white/40">{documentLabel(d.documentMeta)}</div>
          <textarea className={`${FIELD} min-h-[74px] resize-y`} value={sourceText} disabled={isReadonly || busy} placeholder="粘贴单元板资料，或连接上游文本/上传文档" onChange={(e) => update({ sourceText: e.target.value })} />
          {upstream.texts.length > 0 && <div className="text-[10px] text-sky-200/75">已连接 {upstream.texts.length} 条上游文本，运行提炼时会合并使用。</div>}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">标题字</span>
              <input className={FIELD} value={titleText} disabled={isReadonly || busy} onChange={(e) => update({ titleText: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">项目主题</span>
              <input className={FIELD} value={projectTheme} disabled={isReadonly || busy} onChange={(e) => update({ projectTheme: e.target.value })} />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-[10px] text-white/55">说明文字</span>
            <textarea className={`${FIELD} min-h-[74px] resize-y`} value={bodyText} disabled={isReadonly || busy} onChange={(e) => update({ bodyText: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <button type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => void runExtract()}><Brain size={13} /> 提炼文本</button>
            <button type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => void runTranslate()}><Brain size={13} /> 自动翻译</button>
          </div>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="text-[11px] font-semibold text-cyan-100">多语言排序</div>
          <div className="space-y-1">
            {languages.map((lang: string, index: number) => {
              const meta = languageMeta(lang);
              const item = translations[lang] || {};
              return (
                <div key={lang} className="rounded border border-white/10 bg-black/15 p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[10px] font-semibold text-white/70">{index + 1}. {meta.label}</span>
                    <button type="button" className={BUTTON} disabled={isReadonly || busy || index === 0} onClick={() => moveLanguage(lang, -1)}><ArrowUp size={12} /></button>
                    <button type="button" className={BUTTON} disabled={isReadonly || busy || index === languages.length - 1} onClick={() => moveLanguage(lang, 1)}><ArrowDown size={12} /></button>
                    {languages.length > 1 && <button type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => update({ languages: languages.filter((languageId: string) => languageId !== lang) })}>删除</button>}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <input className={FIELD} value={item.title || ''} disabled={isReadonly || busy} placeholder="译文标题" onChange={(e) => update({ translations: { ...translations, [lang]: { ...item, title: e.target.value } } })} />
                    <input className={FIELD} value={item.body || ''} disabled={isReadonly || busy} placeholder="译文说明" onChange={(e) => update({ translations: { ...translations, [lang]: { ...item, body: e.target.value } } })} />
                  </div>
                </div>
              );
            })}
          </div>
          <select className={FIELD} disabled={isReadonly || busy} value="" onChange={(e) => e.target.value && update({ languages: [...languages, e.target.value] })}>
            <option value="">新增语言...</option>
            {UNIT_PANEL_LANGUAGES.filter((item: UnitPanelLanguage) => !languages.includes(item.id)).map((item: UnitPanelLanguage) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2 rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-2">
            <div>
              <div className="text-[11px] font-semibold text-cyan-100">单元板数量</div>
              <div className="text-[10px] text-white/45">设置本次生成几块单元板</div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className={`${BUTTON} h-8 w-8 px-0 text-sm`} disabled={isReadonly || busy || dimensions.panelCount <= 1} onClick={() => updatePanelCount(Math.max(1, dimensions.panelCount - 1))}>-</button>
              <input className={`${FIELD} h-8 w-16 text-center text-sm font-semibold`} type="number" min={1} max={99} value={dimensions.panelCount || 1} disabled={isReadonly || busy} onChange={(e) => updatePanelCount(e.target.value)} />
              <button type="button" className={`${BUTTON} h-8 w-8 px-0 text-sm`} disabled={isReadonly || busy || dimensions.panelCount >= 99} onClick={() => updatePanelCount((dimensions.panelCount || 1) + 1)}>+</button>
            </div>
          </div>
          <div className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold text-cyan-100">文字控制区</div>
                <div className="text-[10px] text-white/45">限制标题字和说明文字的垂直排版高度</div>
              </div>
              <div className="text-[10px] text-cyan-100">{textLayoutBounds.lowerMeters}m - {textLayoutBounds.upperMeters}m</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-white/55">下限 m</span>
                <input className={FIELD} type="number" min={0} max={10} step={0.1} value={textLayoutBounds.lowerMeters} disabled={isReadonly || busy} onChange={(e) => updateTextLayoutBound('lowerMeters', e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-white/55">上限 m</span>
                <input className={FIELD} type="number" min={0} max={10} step={0.1} value={textLayoutBounds.upperMeters} disabled={isReadonly || busy} onChange={(e) => updateTextLayoutBound('upperMeters', e.target.value)} />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
          {[
            ['panelWidth', '单板宽 mm'], ['panelHeight', '单板高 mm'], ['gap', '间距 mm'], ['thickness', '厚度 mm'],
          ].map(([key, label]) => (
            <label key={key} className="space-y-1">
              <span className="text-[10px] text-white/55">{label}</span>
              <input className={FIELD} type="number" min={0} value={(dimensions as any)[key] || ''} disabled={isReadonly || busy} onChange={(e) => updateDimension(key, e.target.value)} />
            </label>
          ))}
          <div className="rounded border border-white/10 bg-black/15 px-2 py-1.5 text-[10px] leading-relaxed text-white/50">
            总宽自动按“单板宽 x 板数 + 板间距总和”推导；总高等于单板高。
          </div>
          <label className="space-y-1">
            <span className="text-[10px] text-white/55">比例</span>
            <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(e) => update({ aspectRatio: e.target.value })}>
              {modelDef.aspectRatios.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          </div>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-cyan-100">材质与字体</div>
            {canManageMaterials && <button type="button" className={BUTTON} onClick={() => setMaterialsOpen(true)}>编辑材质</button>}
          </div>
          {referenceOverridesMaterialAndFont && (
            <div className="rounded border border-amber-300/25 bg-amber-300/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-100">
              已连接色彩与材质参考图，材质与字体板块暂不生效；生成时将按参考图仿制材质、字体风格、字号大小和排版密度。
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">主材质</span>
              <UnitPanelMaterialSelect materials={materials} value={d.primaryMaterialId || ''} disabled={isReadonly || busy || referenceOverridesMaterialAndFont} className={FIELD} placeholder="选择主材质" onChange={(next) => update({ primaryMaterialId: next })} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">辅助材质</span>
              <UnitPanelMaterialSelect materials={materials} multiple values={Array.isArray(d.secondaryMaterialIds) ? d.secondaryMaterialIds : []} disabled={isReadonly || busy || referenceOverridesMaterialAndFont} className={FIELD} placeholder="选择辅助材质" onChange={(next) => update({ secondaryMaterialIds: next })} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">标题字体</span>
              <select className={FIELD} value={titleFont} disabled={isReadonly || busy || referenceOverridesMaterialAndFont} onChange={(e) => update({ titleFont: normalizeUnitPanelTitleFont(e.target.value) })}>
                {UNIT_PANEL_TITLE_FONTS.map((item: UnitPanelFontOption) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">说明字体</span>
              <select className={FIELD} value={bodyFont} disabled={isReadonly || busy || referenceOverridesMaterialAndFont} onChange={(e) => update({ bodyFont: normalizeUnitPanelBodyFont(e.target.value) })}>
                {UNIT_PANEL_BODY_FONTS.map((item: UnitPanelFontOption) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <ColorMaterialPresetSelect
            presets={colorMaterialPresets}
            value={d.colorMaterialPreset || ''}
            disabled={isReadonly || busy || referenceOverridesMaterialAndFont}
            className={FIELD}
            placeholder="不使用共享色彩与材质预设"
            onChange={(presetId, preset) => update({ colorMaterialPreset: presetId, colorMaterial: colorMaterialTextFromPreset(preset) })}
          />
          <textarea className={`${FIELD} min-h-[50px] resize-y`} value={d.colorMaterial || ''} disabled={isReadonly || busy || referenceOverridesMaterialAndFont} placeholder="手动色彩与材质补充（优先级最低）" onChange={(e) => update({ colorMaterial: e.target.value, colorMaterialPreset: '' })} />
          {colorMaterialReferenceImage ? (
            <div className="rounded border border-white/10 bg-black/15 p-2">
              <img src={colorMaterialReferenceImage} alt="" className="h-24 w-full rounded border border-white/10 object-contain" draggable={false} />
              <textarea className={`${FIELD} mt-1 min-h-[42px] resize-y`} value={colorMaterialReferenceTone} disabled={isReadonly || busy} onChange={(e) => update({ colorMaterialReferenceTone: e.target.value, colorMaterialReferenceToneSource: colorMaterialReferenceImage, colorMaterialReferenceToneStatus: '' })} />
            </div>
          ) : <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接色彩与材质参考图，自动读取主色调</div>}
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生图</div>
            <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成单元板</button>
          </div>
          <div className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
            <div className="mb-2 text-[11px] font-semibold text-cyan-100">生图平台与模型</div>
            <div className="grid grid-cols-2 gap-2">
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
              <label className="space-y-1">
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
            </div>
          </div>
          {d.progress && <div className="text-[10px] text-cyan-100">{d.progress}</div>}
          {d.imageUrl && <img src={d.imageUrl} alt="" className="max-h-56 w-full rounded border border-white/10 object-contain" draggable={false} />}
        </section>
      </div>

      <UnitPanelMaterialEditorModal
        open={materialsOpen}
        materials={materials}
        saving={materialsSaving}
        error={materialsError}
        llmModel={llmModel}
        llmKeyId={activeLlmConfig?.id || ''}
        onClose={() => setMaterialsOpen(false)}
        onSave={saveMaterials}
      />
    </div>
  );
};

export default memo(UnitPanelDesignNode);
