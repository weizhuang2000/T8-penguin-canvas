import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Atom, Brain, FileText, Image as ImageIcon, Loader2, Pencil, Play, Upload } from 'lucide-react';
import { EXHIBITION_IMAGE_HANDLE_COLOR, EXHIBITION_TEXT_HANDLE_COLOR } from '../../config/portTypes';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
import {
  extractDocument,
  getCurrentUser,
  getElevationPromptPresets,
  getScienceExhibitPromptPresets,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_MB,
  updateScienceExhibitPromptPresets,
  type AuthUser,
  type ElevationColorMaterialPresetItem,
  type ExtractedDocument,
  type ScienceExhibitOptionPresetItem,
  type ScienceExhibitPresetGroup,
  type ScienceExhibitPromptPresetMap,
} from '../../services/api';
import { generateExternalImage, generateLlm, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  buildScienceExhibitDrawingPrompt,
  buildScienceExhibitExtractPrompt,
  buildScienceExhibitImagePrompt,
  buildScienceExhibitParameterMarkdown,
  normalizeScienceExhibitAnalysis,
  normalizeScienceExhibitAudience,
  normalizeScienceExhibitBackground,
  normalizeScienceExhibitDimensions,
  normalizeScienceExhibitDomain,
  normalizeScienceExhibitDrawingSelection,
  normalizeScienceExhibitInteraction,
  normalizeScienceExhibitScale,
  normalizeScienceExhibitType,
  parseScienceExhibitExtractJson,
  SCIENCE_EXHIBIT_AUDIENCES,
  SCIENCE_EXHIBIT_BACKGROUNDS,
  SCIENCE_EXHIBIT_DEFAULT_DRAWINGS,
  SCIENCE_EXHIBIT_DOMAINS,
  SCIENCE_EXHIBIT_DRAWING_TYPES,
  SCIENCE_EXHIBIT_INTERACTIONS,
  SCIENCE_EXHIBIT_SCALES,
  SCIENCE_EXHIBIT_TYPES,
  type ScienceExhibitAnalysis,
  type ScienceExhibitDimensions,
  type ScienceExhibitDrawingType,
  type ScienceExhibitOption,
  type ScienceExhibitResult,
} from '../../utils/scienceExhibitDesignPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import PromptTextarea from '../PromptTextarea';
import ColorMaterialPresetSelect from './ColorMaterialPresetSelect';
import ScienceExhibitOptionEditorModal from './ScienceExhibitOptionEditorModal';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import MentionPromptInput from './MentionPromptInput';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';
import NodeHelpButton from './NodeHelpButton';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const INTERNAL_IMAGE_MAX_POLLS = 1800;
const INTERNAL_IMAGE_POLL_INTERVAL_MS = 2000;
const NEXT_DRAWING_SETTLE_MS = 1200;
const DRAWING_ORDER: ScienceExhibitDrawingType[] = ['render', 'exploded', 'principle', 'orthographic', 'parameter-table'];
const SCIENCE_EXHIBIT_OPTION_GROUPS: ScienceExhibitPresetGroup[] = ['domains', 'types', 'interactions', 'audiences', 'scales'];
const EMPTY_SCIENCE_EXHIBIT_PRESETS: ScienceExhibitPromptPresetMap = {
  domains: [],
  types: [],
  interactions: [],
  audiences: [],
  scales: [],
};

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
      imagesFromData((node as any)?.data || {}).forEach((url, index) => {
        if (!out.some((item) => item.url === url)) {
          out.push({
            id: `${sourceId || 'source'}:${handle}:${index}`,
            url,
            label: shortFileLabel(url, handle === 'space-reference' ? '空间参考' : '装置参考'),
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

function analysisHasContent(analysis: ScienceExhibitAnalysis) {
  return Boolean(
    analysis.titleText ||
    analysis.sciencePrinciple ||
    analysis.keyParameters.length ||
    analysis.interactionFlow ||
    analysis.mechanismDesign ||
    analysis.safetyMaintenance ||
    analysis.visualBrief ||
    analysis.drawingNotes,
  );
}

function drawingLabel(kind: ScienceExhibitDrawingType) {
  return SCIENCE_EXHIBIT_DRAWING_TYPES.find((item: ScienceExhibitOption) => item.id === kind)?.label || kind;
}

function colorMaterialTextFromPreset(preset: ElevationColorMaterialPresetItem | null): string {
  if (!preset) return '';
  return [
    preset.label,
    String(preset.core || '').trim(),
    String(preset.features || '').trim(),
    String(preset.usage || '').trim(),
  ].filter(Boolean).join('; ');
}

function colorPaletteTextFromPreset(preset: ElevationColorMaterialPresetItem | null): string {
  if (!preset) return '';
  return String(preset.core || preset.info || preset.label || '').trim();
}

function materialTexturesTextFromPreset(preset: ElevationColorMaterialPresetItem | null): string {
  if (!preset) return '';
  return String(preset.features || preset.info || preset.core || preset.label || '').trim();
}

function combineColorMaterialText(palette: string, textures: string, fallback = ''): string {
  const parts = [String(palette || '').trim(), String(textures || '').trim()].filter(Boolean);
  return parts.length ? parts.join('; ') : String(fallback || '').trim();
}

function scienceOptionList(items: ScienceExhibitOptionPresetItem[] | undefined, fallback: ScienceExhibitOption[]): ScienceExhibitOption[] {
  const list = Array.isArray(items) && items.length > 0 ? items : fallback;
  const normalized = list
    .map((item, index) => ({
      id: String(item.id || '').trim(),
      label: String(item.label || '').trim(),
      prompt: String(item.prompt || '').trim(),
      order: Number.isFinite(Number((item as any).order)) ? Number((item as any).order) : index,
    }))
    .filter((item) => item.id && item.label && item.prompt)
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
  return normalized.length ? normalized : fallback;
}

function sciencePresetItems(options: ScienceExhibitOption[]): ScienceExhibitOptionPresetItem[] {
  return options.map((item, index) => ({
    id: item.id,
    label: item.label,
    prompt: item.prompt,
    order: Number.isFinite(Number((item as any).order)) ? Number((item as any).order) : index,
  }));
}

const ScienceExhibitDesignNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);
  const [scienceOptionPresets, setScienceOptionPresets] = useState<ScienceExhibitPromptPresetMap>(EMPTY_SCIENCE_EXHIBIT_PRESETS);
  const [optionEditorOpen, setOptionEditorOpen] = useState(false);
  const [optionSaving, setOptionSaving] = useState(false);
  const [optionError, setOptionError] = useState('');
  const upstream = useUpstreamMaterials(id);
  const spaceReferenceItems = useInputImagesByHandle(id, 'space-reference');
  const deviceReferenceItems = useInputImagesByHandle(id, 'device-reference');
  const spaceReferenceImages = useMemo(() => spaceReferenceItems.map((item) => item.url), [spaceReferenceItems]);
  const deviceReferenceImages = useMemo(() => deviceReferenceItems.map((item) => item.url), [deviceReferenceItems]);
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

  const domainOptions = useMemo(() => scienceOptionList(scienceOptionPresets.domains, SCIENCE_EXHIBIT_DOMAINS), [scienceOptionPresets.domains]);
  const typeOptions = useMemo(() => scienceOptionList(scienceOptionPresets.types, SCIENCE_EXHIBIT_TYPES), [scienceOptionPresets.types]);
  const interactionOptions = useMemo(() => scienceOptionList(scienceOptionPresets.interactions, SCIENCE_EXHIBIT_INTERACTIONS), [scienceOptionPresets.interactions]);
  const audienceOptions = useMemo(() => scienceOptionList(scienceOptionPresets.audiences, SCIENCE_EXHIBIT_AUDIENCES), [scienceOptionPresets.audiences]);
  const scaleOptions = useMemo(() => scienceOptionList(scienceOptionPresets.scales, SCIENCE_EXHIBIT_SCALES), [scienceOptionPresets.scales]);
  const scienceDomain = normalizeScienceExhibitDomain(d.scienceDomain, domainOptions);
  const exhibitType = normalizeScienceExhibitType(d.exhibitType, typeOptions);
  const interactionMode = normalizeScienceExhibitInteraction(d.interactionMode, interactionOptions);
  const audience = normalizeScienceExhibitAudience(d.audience, audienceOptions);
  const spatialScale = normalizeScienceExhibitScale(d.spatialScale, scaleOptions);
  const canManageScienceOptions = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const backgroundMode = normalizeScienceExhibitBackground(d.backgroundMode);
  const dimensions = useMemo(() => normalizeScienceExhibitDimensions(d.dimensions, spatialScale), [d.dimensions, spatialScale]);
  const drawingSelection = useMemo(() => normalizeScienceExhibitDrawingSelection(d.drawingSelection), [d.drawingSelection]);
  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );
  const colorMaterialPalette = String(d.colorMaterialPalette || colorPaletteTextFromPreset(selectedColorMaterialPreset)).trim();
  const colorMaterialTextures = String(d.colorMaterialTextures || materialTexturesTextFromPreset(selectedColorMaterialPreset)).trim();
  const colorMaterialText = combineColorMaterialText(
    colorMaterialPalette,
    colorMaterialTextures,
    String(d.colorMaterial || colorMaterialTextFromPreset(selectedColorMaterialPreset)).trim(),
  );
  const hasColorMaterialPreset = !!selectedColorMaterialPreset;
  const analysis = useMemo(() => normalizeScienceExhibitAnalysis(d.analysis || {
    titleText: d.titleText,
    sciencePrinciple: d.sciencePrinciple,
    keyParameters: d.keyParameters,
    interactionFlow: d.interactionFlow,
    mechanismDesign: d.mechanismDesign,
    safetyMaintenance: d.safetyMaintenance,
    visualBrief: d.visualBrief,
    drawingNotes: d.drawingNotes,
  }), [d.analysis, d.drawingNotes, d.interactionFlow, d.keyParameters, d.mechanismDesign, d.safetyMaintenance, d.sciencePrinciple, d.titleText, d.visualBrief]);
  const titleText = analysis.titleText;
  const sourceText = String(d.sourceText || '');
  const supplement = String(d.supplement || '');
  const supplementMentions: MediaMention[] = Array.isArray(d.supplementMentions) ? d.supplementMentions : [];
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const effectiveSourceText = [d.useUpstream !== false ? upstreamText : '', sourceText].filter((item) => item.trim()).join('\n\n');
  const status = String(d.status || 'idle');
  const busy = ['uploading', 'analyzing', 'generating-render', 'generating-exploded', 'generating-principle', 'generating-orthographic', 'generating-parameter-table'].includes(status);

  const mentionMaterials: Material[] = useMemo(() => deviceReferenceItems.map((item, index) => ({
    id: item.id,
    kind: 'image',
    url: item.url,
    sourceNodeId: item.id.split(':')[0] || `science-device-${index + 1}`,
    origin: 'upstream',
    label: item.label || `装置参考 ${index + 1}`,
    mentionToken: `@img${spaceReferenceImages.length + index + 1}`,
  })), [deviceReferenceItems, spaceReferenceImages.length]);
  const resolvedSupplement = useMemo(
    () => resolveMediaMentions(supplement, supplementMentions, mentionMaterials),
    [mentionMaterials, supplement, supplementMentions],
  );
  const parameterMarkdown = useMemo(() => buildScienceExhibitParameterMarkdown({
    analysis,
    dimensions,
    spatialScale,
    colorMaterial: colorMaterialText,
    colorMaterialPalette,
    colorMaterialTextures,
  }), [analysis, colorMaterialPalette, colorMaterialText, colorMaterialTextures, dimensions, spatialScale]);
  const previewReferenceImages = useMemo(() => [...spaceReferenceImages, ...deviceReferenceImages], [deviceReferenceImages, spaceReferenceImages]);
  const previewPrompt = useMemo(() => buildScienceExhibitImagePrompt({
    scienceDomain,
    exhibitType,
    interactionMode,
    audience,
    spatialScale,
    backgroundMode,
    dimensions,
    analysis,
    spaceReferenceImages,
    deviceReferenceImages,
    supplement: resolvedSupplement,
    colorMaterial: colorMaterialText,
    colorMaterialPalette,
    colorMaterialTextures,
    hasColorMaterialPreset,
    domainOptions,
    typeOptions,
    interactionOptions,
    audienceOptions,
    scaleOptions,
  }), [analysis, audience, audienceOptions, backgroundMode, colorMaterialPalette, colorMaterialText, colorMaterialTextures, deviceReferenceImages, dimensions, domainOptions, exhibitType, hasColorMaterialPreset, interactionMode, interactionOptions, resolvedSupplement, scaleOptions, scienceDomain, spaceReferenceImages, spatialScale, typeOptions]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getElevationPromptPresets()
      .then((presets) => setColorMaterialPresets(presets.colorMaterial || []))
      .catch(() => setColorMaterialPresets([]));
    getScienceExhibitPromptPresets()
      .then((presets) => setScienceOptionPresets(presets || EMPTY_SCIENCE_EXHIBIT_PRESETS))
      .catch(() => setScienceOptionPresets(EMPTY_SCIENCE_EXHIBIT_PRESETS));
  }, []);

  useEffect(() => {
    const patch: Record<string, string> = {};
    if (d.scienceDomain !== scienceDomain) patch.scienceDomain = scienceDomain;
    if (d.exhibitType !== exhibitType) patch.exhibitType = exhibitType;
    if (d.interactionMode !== interactionMode) patch.interactionMode = interactionMode;
    if (d.audience !== audience) patch.audience = audience;
    if (d.spatialScale !== spatialScale) patch.spatialScale = spatialScale;
    if (Object.keys(patch).length) update(patch);
  }, [audience, d.audience, d.exhibitType, d.interactionMode, d.scienceDomain, d.spatialScale, exhibitType, interactionMode, scienceDomain, spatialScale, update]);

  useEffect(() => {
    if (
      d.prompt !== previewPrompt ||
      d.referenceImages?.join('|') !== previewReferenceImages.join('|') ||
      d.spaceReferenceImages?.join('|') !== spaceReferenceImages.join('|') ||
      d.deviceReferenceImages?.join('|') !== deviceReferenceImages.join('|')
    ) {
      update({
        prompt: previewPrompt,
        referenceImages: previewReferenceImages,
        spaceReferenceImages,
        deviceReferenceImages,
      });
    }
  }, [d.deviceReferenceImages, d.prompt, d.referenceImages, d.spaceReferenceImages, deviceReferenceImages, previewPrompt, previewReferenceImages, spaceReferenceImages, update]);

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

  const patchAnalysis = (patch: Partial<ScienceExhibitAnalysis>) => {
    update({ analysis: normalizeScienceExhibitAnalysis({ ...analysis, ...patch }) });
  };

  const patchDimensions = (patch: Partial<ScienceExhibitDimensions>) => {
    update({ dimensions: normalizeScienceExhibitDimensions({ ...dimensions, ...patch }, spatialScale) });
  };

  const runExtract = useCallback(async (options: { force?: boolean } = {}): Promise<ScienceExhibitAnalysis | null> => {
    if (isReadonly || (busy && !options.force)) return null;
    if (!effectiveSourceText.trim()) {
      update({ status: 'error', error: '请先输入、上传或连接上游科技展项资料' });
      return null;
    }
    update({ status: 'analyzing', progress: 'LLM 正在提炼科学原理、参数和图纸约束...', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.2,
        messages: [{ role: 'user', content: buildScienceExhibitExtractPrompt({
          sourceText: effectiveSourceText,
          scienceDomain,
          exhibitType,
          interactionMode,
          audience,
          spatialScale,
          backgroundMode,
          dimensions,
          colorMaterial: colorMaterialText,
          colorMaterialPalette,
          colorMaterialTextures,
          hasColorMaterialPreset,
          domainOptions,
          typeOptions,
          interactionOptions,
          audienceOptions,
          scaleOptions,
        }) }],
      });
      const parsed = parseScienceExhibitExtractJson(response.content || '');
      if (!analysisHasContent(parsed)) throw new Error('LLM 未返回有效科技展项分析');
      update({
        analysis: parsed,
        titleText: parsed.titleText,
        sciencePrinciple: parsed.sciencePrinciple,
        keyParameters: parsed.keyParameters,
        interactionFlow: parsed.interactionFlow,
        mechanismDesign: parsed.mechanismDesign,
        safetyMaintenance: parsed.safetyMaintenance,
        visualBrief: parsed.visualBrief,
        drawingNotes: parsed.drawingNotes,
        outputText: buildScienceExhibitParameterMarkdown({
          analysis: parsed,
          dimensions,
          spatialScale,
          colorMaterial: colorMaterialText,
          colorMaterialPalette,
          colorMaterialTextures,
        }),
        text: buildScienceExhibitParameterMarkdown({
          analysis: parsed,
          dimensions,
          spatialScale,
          colorMaterial: colorMaterialText,
          colorMaterialPalette,
          colorMaterialTextures,
        }),
        status: 'idle',
        progress: '',
        error: '',
      });
      return parsed;
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      return null;
    }
  }, [activeLlmConfig?.id, audience, audienceOptions, backgroundMode, busy, colorMaterialPalette, colorMaterialText, colorMaterialTextures, dimensions, domainOptions, effectiveSourceText, exhibitType, hasColorMaterialPreset, interactionMode, interactionOptions, isReadonly, llmModel, scaleOptions, scienceDomain, spatialScale, typeOptions, update]);

  const generateOneImage = useCallback(async ({
    kind,
    prompt,
    images,
    runSeed,
    outputTitle,
  }: {
    kind: ScienceExhibitDrawingType;
    prompt: string;
    images: string[];
    runSeed: number;
    outputTitle: string;
  }) => {
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'science-exhibit-design',
      seed: runSeed,
      nodeTitle: `科技展项设计 ${outputTitle}`,
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
        const pollingTaskId = res.taskId;
        taskId = pollingTaskId;
        for (let index = 0; index < EXTERNAL_IMAGE_MAX_POLLS; index += 1) {
          if (abortRef.current) throw new Error('任务已取消');
          await new Promise((resolve) => setTimeout(resolve, EXTERNAL_IMAGE_POLL_INTERVAL_MS));
          res = await queryExternalImageStatus({
            providerId: providerSelection.provider.id,
            taskId: pollingTaskId,
            providerModel: externalProviderModel,
            outputFormat,
            historyContext,
          });
          update({ taskId: pollingTaskId, progress: `${drawingLabel(kind)} · ${Math.min(99, Math.round(((index + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%` });
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
        update({ taskId, progress: `${drawingLabel(kind)} · ${lastProgress}` });
        for (let index = 0; index < INTERNAL_IMAGE_MAX_POLLS; index += 1) {
          if (abortRef.current) throw new Error('任务已取消');
          await new Promise((resolve) => setTimeout(resolve, INTERNAL_IMAGE_POLL_INTERVAL_MS));
          const q = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
          if (q.progress && q.progress !== lastProgress) {
            lastProgress = q.progress;
            update({ progress: `${drawingLabel(kind)} · ${q.progress}` });
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
  }, [activeCanvasId, apiModel, aspectRatio, d.providerParams, externalProviderModel, id, isExternalSelected, modelDef.id, modelDef.paramKind, outputFormat, providerSelection.provider, sizeLevel, update]);

  const runGenerate = useCallback(async () => {
    if (isReadonly || busy) return;
    abortRef.current = false;
    taskCompletionSound.primeAudio();
    const src = `science-exhibit-design:${id.slice(0, 6)}`;
    const extractBeforeGenerate = d.extractBeforeGenerate === true;
    let runtimeAnalysis = analysisHasContent(analysis) ? analysis : null;
    const userReferenceImages = [...spaceReferenceImages, ...deviceReferenceImages];
    const generatedUrls: string[] = [];
    const results: ScienceExhibitResult[] = [];
    let previousDrawingImage = '';
    let renderImage = '';
    let latestTaskId = '';
    try {
      update({
        status: 'analyzing',
        progress: extractBeforeGenerate ? '每次生图前提炼已开启，正在刷新科学分析...' : (runtimeAnalysis ? '使用已有科学分析，准备生成图包...' : '准备提炼科学分析...'),
        error: '',
        imageUrl: '',
        imageUrls: [],
        urls: [],
        scienceExhibitResults: [],
        referenceImages: userReferenceImages,
      });
      if (extractBeforeGenerate || !runtimeAnalysis) {
        runtimeAnalysis = await runExtract({ force: true });
        if (!runtimeAnalysis) throw new Error('未获得科技展项科学分析');
      }
      const markdown = buildScienceExhibitParameterMarkdown({
        analysis: runtimeAnalysis,
        dimensions,
        spatialScale,
        colorMaterial: colorMaterialText,
        colorMaterialPalette,
        colorMaterialTextures,
      });
      const sequence: ScienceExhibitDrawingType[] = DRAWING_ORDER.filter((item) => item === 'render' || drawingSelection.includes(item));
      for (let index = 0; index < sequence.length; index += 1) {
        if (abortRef.current) throw new Error('任务已取消');
        const kind = sequence[index];
        const runSeed = index === 0 && seed > 0 ? seed : randomImageSeed();
        const statusKey = `generating-${kind}`;
        const outputTitle = drawingLabel(kind);
        const prompt = kind === 'render'
          ? buildScienceExhibitImagePrompt({
            scienceDomain,
            exhibitType,
            interactionMode,
            audience,
            spatialScale,
            backgroundMode,
            dimensions,
            analysis: runtimeAnalysis,
            spaceReferenceImages,
            deviceReferenceImages,
            supplement: resolvedSupplement,
            colorMaterial: colorMaterialText,
            colorMaterialPalette,
            colorMaterialTextures,
            hasColorMaterialPreset,
            domainOptions,
            typeOptions,
            interactionOptions,
            audienceOptions,
            scaleOptions,
          })
          : buildScienceExhibitDrawingPrompt({
            drawingType: kind,
            analysis: runtimeAnalysis,
            backgroundMode,
            dimensions,
            spatialScale,
            renderImage,
            previousDrawingImage,
            userReferenceImages,
            parameterMarkdown: markdown,
            colorMaterial: colorMaterialText,
            colorMaterialPalette,
            colorMaterialTextures,
            hasColorMaterialPreset,
          });
        const images = kind === 'render'
          ? userReferenceImages
          : [renderImage, previousDrawingImage, ...userReferenceImages].filter(Boolean);
        update({
          status: statusKey,
          progress: `提交 ${index + 1}/${sequence.length} · ${outputTitle}`,
          lastPrompt: prompt,
          lastSeed: runSeed,
          outputText: markdown,
          text: markdown,
        });
        logBus.info(`科技展项设计提交 ${outputTitle} seed=${runSeed} refs=${images.length}`, src);
        const generated = await generateOneImage({ kind, prompt, images, runSeed, outputTitle });
        const result: ScienceExhibitResult = {
          kind,
          name: outputTitle,
          imageUrl: generated.imageUrl,
          prompt,
          seed: runSeed,
          taskId: generated.taskId,
        };
        if (generated.taskId) latestTaskId = generated.taskId;
        if (kind === 'render') renderImage = generated.imageUrl;
        else previousDrawingImage = generated.imageUrl;
        generatedUrls.push(generated.imageUrl);
        results.push(result);
        update({
          status: index + 1 >= sequence.length ? 'success' : statusKey,
          progress: `${index + 1}/${sequence.length} 完成 · ${outputTitle}`,
          imageUrl: generatedUrls[0],
          imageUrls: generatedUrls.slice(),
          urls: generatedUrls.slice(),
          scienceExhibitResults: results.slice(),
          prompt,
          outputText: markdown,
          text: markdown,
          analysis: runtimeAnalysis,
          referenceImages: userReferenceImages,
          spaceReferenceImages,
          deviceReferenceImages,
          taskId: latestTaskId,
          error: '',
        });
        if (index + 1 < sequence.length) await new Promise((resolve) => setTimeout(resolve, NEXT_DRAWING_SETTLE_MS));
      }
      update({ status: 'success', progress: '100%', taskId: latestTaskId });
      logBus.success(`科技展项设计图包完成: ${generatedUrls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`科技展项设计失败: ${msg}`, src);
      throw error;
    }
  }, [analysis, audience, audienceOptions, backgroundMode, busy, colorMaterialPalette, colorMaterialText, colorMaterialTextures, d.extractBeforeGenerate, deviceReferenceImages, dimensions, domainOptions, drawingSelection, exhibitType, generateOneImage, hasColorMaterialPreset, id, interactionMode, interactionOptions, isReadonly, resolvedSupplement, runExtract, scaleOptions, scienceDomain, seed, spaceReferenceImages, spatialScale, typeOptions, update]);

  useRunTrigger(id, runGenerate, 'image');

  const results: ScienceExhibitResult[] = Array.isArray(d.scienceExhibitResults) ? d.scienceExhibitResults : [];
  const selectedDrawingSet = new Set(drawingSelection);
  const toggleDrawing = (kind: string) => {
    const next = new Set(drawingSelection);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    update({ drawingSelection: normalizeScienceExhibitDrawingSelection(Array.from(next)) });
  };

  const saveScienceOptions = useCallback(async (group: ScienceExhibitPresetGroup, presets: ScienceExhibitOptionPresetItem[]) => {
    if (!canManageScienceOptions || isReadonly) return;
    setOptionSaving(true);
    setOptionError('');
    try {
      const saved = await updateScienceExhibitPromptPresets(group, presets);
      const nextPresets = { ...scienceOptionPresets, [group]: saved };
      setScienceOptionPresets(nextPresets);
      const nextOptions = scienceOptionList(saved, {
        domains: SCIENCE_EXHIBIT_DOMAINS,
        types: SCIENCE_EXHIBIT_TYPES,
        interactions: SCIENCE_EXHIBIT_INTERACTIONS,
        audiences: SCIENCE_EXHIBIT_AUDIENCES,
        scales: SCIENCE_EXHIBIT_SCALES,
      }[group]);
      const keyByGroup: Record<ScienceExhibitPresetGroup, string> = {
        domains: 'scienceDomain',
        types: 'exhibitType',
        interactions: 'interactionMode',
        audiences: 'audience',
        scales: 'spatialScale',
      };
      const currentValue = String(d[keyByGroup[group]] || '');
      if (!nextOptions.some((item) => item.id === currentValue)) {
        update({ [keyByGroup[group]]: nextOptions[0]?.id || '' });
      }
    } catch (error: any) {
      setOptionError(error?.message || '保存科技展项设计选项失败');
      throw error;
    } finally {
      setOptionSaving(false);
    }
  }, [canManageScienceOptions, d, isReadonly, scienceOptionPresets, update]);

  return (
    <div
      data-exhibition-compact-node-type="science-exhibit-design"
      className={`relative w-[660px] rounded-xl border-2 transition-all ${selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'}`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!border-0 t8-exhibition-handle--image" style={{ top: '42%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：科技展项图包" />
      <Handle id="text-output" type="source" position={Position.Right} className="!border-0 t8-exhibition-handle--text" style={{ top: '62%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输出：参数表文本" />
      <Handle id="text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--text" style={{ top: '24%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输入：科技展项资料" />
      <Handle id="space-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '44%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：整体空间/风格参考图" />
      <Handle id="device-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '64%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：装置/结构参考图" />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200"><Atom size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">科技展项设计</div>
          <div className="truncate text-[10px] text-white/45">科学原理提炼 / 效果图 / 爆炸图 / 原理图 / 三视图 / 参数表</div>
        </div>
        <NodeHelpButton nodeType="science-exhibit-design" />
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[820px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section data-exhibition-compact-section="science" className="grid grid-cols-3 gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
          {canManageScienceOptions && (
            <div className="col-span-3 flex justify-end">
              <button data-exhibition-compact-item="option-editor" type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => setOptionEditorOpen(true)}><Pencil size={13} /> 编辑选项</button>
            </div>
          )}
          {[
            ['scienceDomain', '科学领域', scienceDomain, domainOptions, (raw: string) => normalizeScienceExhibitDomain(raw, domainOptions)],
            ['exhibitType', '展项类型', exhibitType, typeOptions, (raw: string) => normalizeScienceExhibitType(raw, typeOptions)],
            ['interactionMode', '互动方式', interactionMode, interactionOptions, (raw: string) => normalizeScienceExhibitInteraction(raw, interactionOptions)],
            ['audience', '目标观众', audience, audienceOptions, (raw: string) => normalizeScienceExhibitAudience(raw, audienceOptions)],
            ['spatialScale', '空间尺度', spatialScale, scaleOptions, (raw: string) => normalizeScienceExhibitScale(raw, scaleOptions)],
            ['backgroundMode', '背景', backgroundMode, SCIENCE_EXHIBIT_BACKGROUNDS, normalizeScienceExhibitBackground],
          ].map(([key, label, value, options, normalize]) => (
            <label key={String(key)} data-exhibition-compact-item={String(key) === 'backgroundMode' ? 'background-mode' : 'parameter-input'} className="space-y-1">
              <span className="text-[10px] text-white/55">{String(label)}</span>
              <select className={FIELD} value={String(value)} disabled={isReadonly || busy} onChange={(event) => update({ [String(key)]: (normalize as (raw: string) => string)(event.target.value) })}>
                {(options as ScienceExhibitOption[]).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          ))}
          <label data-exhibition-compact-item="aspect-size" className="space-y-1">
            <span className="text-[10px] text-white/55">画面比例</span>
            <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
              {modelDef.aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
          </label>
        </section>

        <section data-exhibition-compact-section="dimensions" className="grid grid-cols-3 gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="col-span-3 flex items-center justify-between">
            <div className="text-[11px] font-semibold text-cyan-100">尺寸设置</div>
            <div className="text-[10px] text-white/45">单位 mm / W，进入效果图、图纸和参数表</div>
          </div>
          {[
            ['widthMm', '宽度 mm'],
            ['depthMm', '深度 mm'],
            ['heightMm', '高度 mm'],
            ['operationHeightMm', '操作高度 mm'],
            ['safetyClearanceMm', '安全净距 mm'],
            ['maintenanceClearanceMm', '维护净距 mm'],
            ['estimatedPowerW', '估算功率 W'],
          ].map(([key, label]) => (
            <label key={key} data-exhibition-compact-item="size-input" className="space-y-1">
              <span className="text-[10px] text-white/55">{label}</span>
              <input
                className={FIELD}
                type="number"
                min={0}
                value={dimensions[key as keyof ScienceExhibitDimensions]}
                disabled={isReadonly || busy}
                onChange={(event) => patchDimensions({ [key]: Math.max(0, Math.round(Number(event.target.value) || 0)) } as Partial<ScienceExhibitDimensions>)}
              />
            </label>
          ))}
        </section>

        <section data-exhibition-compact-section="color-material" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-cyan-100">色彩与材质预设</div>
            {hasColorMaterialPreset && <div className="truncate text-[10px] text-white/45">{selectedColorMaterialPreset?.label}</div>}
          </div>
          <div data-exhibition-compact-item="preset-select">
            <ColorMaterialPresetSelect
              presets={colorMaterialPresets}
              value={d.colorMaterialPreset || ''}
              disabled={isReadonly || busy}
              className={FIELD}
              placeholder="不使用色彩与材质预设"
              onChange={(presetId, preset) => update({
                colorMaterialPreset: presetId,
                colorMaterial: colorMaterialTextFromPreset(preset),
                colorMaterialPalette: colorPaletteTextFromPreset(preset),
                colorMaterialTextures: materialTexturesTextFromPreset(preset),
              })}
            />
          </div>
          <div data-exhibition-compact-item="manual-input" className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">色彩倾向</span>
              <PromptTextarea
                compact
                title="扩大编辑"
                className={`${FIELD} min-h-[52px] resize-y`}
                value={colorMaterialPalette}
                disabled={isReadonly || busy}
                readOnly={isReadonly || busy}
                placeholder="例如：冷白、银灰、低饱和蓝绿色点缀"
                onValueChange={(value) => update({
                  colorMaterialPalette: value,
                  colorMaterial: combineColorMaterialText(value, colorMaterialTextures, d.colorMaterial),
                  colorMaterialPreset: '',
                })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">材质纹理</span>
              <PromptTextarea
                compact
                title="扩大编辑"
                className={`${FIELD} min-h-[52px] resize-y`}
                value={colorMaterialTextures}
                disabled={isReadonly || busy}
                readOnly={isReadonly || busy}
                placeholder="例如：拉丝金属、磨砂亚克力、透明防护罩"
                onValueChange={(value) => update({
                  colorMaterialTextures: value,
                  colorMaterial: combineColorMaterialText(colorMaterialPalette, value, d.colorMaterial),
                  colorMaterialPreset: '',
                })}
              />
            </label>
          </div>
          <PromptTextarea
            data-exhibition-compact-item="manual-input"
            compact
            title="扩大编辑"
            className={`${FIELD} min-h-[48px] resize-y`}
            value={d.colorMaterial || ''}
            disabled={isReadonly || busy}
            readOnly={isReadonly || busy}
            placeholder="手动补充色彩、材料、表面处理或耐久要求"
            onValueChange={(value) => update({ colorMaterial: value, colorMaterialPreset: '' })}
          />
        </section>

        <section data-exhibition-compact-section="language" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><FileText size={13} /> 资料与科学分析</div>
            <div className="flex gap-1">
              <button type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => fileRef.current?.click()}><Upload size={13} /> 上传文档</button>
              <button type="button" className={BUTTON} disabled={isReadonly || busy} onClick={() => void runExtract()}><Brain size={13} /> LLM 提炼</button>
              <label data-exhibition-compact-item="extract-before-generate" className="inline-flex h-7 items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 text-[10px] text-white/70">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={d.extractBeforeGenerate === true}
                  disabled={isReadonly || busy}
                  onChange={(event) => update({ extractBeforeGenerate: event.target.checked })}
                />
                <span>每次生图前进行提炼</span>
              </label>
            </div>
          </div>
          <label data-exhibition-compact-item="llm-settings" className="block space-y-1">
            <span className="text-[10px] text-white/55">LLM 配置模型</span>
            <select
              className={FIELD}
              value={activeLlmConfig?.id || ''}
              disabled={isReadonly || busy || llmConfigOptions.length === 0}
              onChange={(event) => {
                const next = llmConfigOptions.find((item) => item.id === event.target.value) || llmConfigOptions[0];
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
          <input ref={fileRef} type="file" className="hidden" accept=".txt,.md,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void pickDocument(event.target.files?.[0])} />
          <div data-exhibition-compact-item="document" className="text-[10px] text-white/40">{documentLabel(d.documentMeta)}</div>
          <PromptTextarea data-exhibition-compact-item="document" title="扩大编辑" className={`${FIELD} min-h-[58px] resize-y`} value={sourceText} disabled={isReadonly || busy} readOnly={isReadonly || busy} placeholder="粘贴科技展项资料，或连接上游文本/上传文档" onValueChange={(value) => update({ sourceText: value })} />
          {upstream.texts.length > 0 && <div className="text-[10px] text-sky-200/75">已连接 {upstream.texts.length} 条上游文本，LLM 提炼时会合并使用。</div>}
          <div data-exhibition-compact-item="text-fields" className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">展项名称</span>
              <PromptTextarea compact title="扩大编辑" className={FIELD} value={titleText} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => patchAnalysis({ titleText: value })} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">互动流程</span>
              <PromptTextarea compact title="扩大编辑" className={FIELD} value={analysis.interactionFlow} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => patchAnalysis({ interactionFlow: value })} />
            </label>
          </div>
          <label data-exhibition-compact-item="text-fields" className="block space-y-1">
            <span className="text-[10px] text-white/55">真实科学原理</span>
            <PromptTextarea title="扩大编辑" className={`${FIELD} min-h-[58px] resize-y`} value={analysis.sciencePrinciple} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => patchAnalysis({ sciencePrinciple: value })} />
          </label>
          <label data-exhibition-compact-item="text-fields" className="block space-y-1">
            <span className="text-[10px] text-white/55">构成与图纸约束</span>
            <PromptTextarea title="扩大编辑" className={`${FIELD} min-h-[58px] resize-y`} value={[analysis.mechanismDesign, analysis.drawingNotes].filter(Boolean).join('\n')} disabled={isReadonly || busy} readOnly={isReadonly || busy} onValueChange={(value) => patchAnalysis({ mechanismDesign: value, drawingNotes: value })} />
          </label>
        </section>

        <section data-exhibition-compact-section="drawings" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 图纸输出</div>
          <div data-exhibition-compact-item="drawing-selection" className="grid grid-cols-4 gap-1.5">
            {SCIENCE_EXHIBIT_DRAWING_TYPES.filter((item: ScienceExhibitOption) => item.id !== 'render').map((item: ScienceExhibitOption) => (
              <label key={item.id} className="flex items-center gap-1 rounded border border-white/10 bg-black/15 px-2 py-1 text-[10px] text-white/70">
                <input type="checkbox" checked={selectedDrawingSet.has(item.id)} disabled={isReadonly || busy} onChange={() => toggleDrawing(item.id)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <div data-exhibition-compact-item="parameter-table" className="max-h-32 overflow-y-auto rounded border border-white/10 bg-black/20 p-2 text-[10px] leading-relaxed text-white/65">
            <div className="mb-1 font-semibold text-cyan-100">参数表文本预览</div>
            <pre className="whitespace-pre-wrap break-words font-sans">{parameterMarkdown}</pre>
          </div>
        </section>

        <section data-exhibition-compact-section="references" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 参考图</div>
          <div data-exhibition-compact-item="space-reference" className="rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 text-[10px] text-white/55">整体空间/风格参考 · {spaceReferenceImages.length}</div>
            {spaceReferenceImages.length ? <div className="grid grid-cols-4 gap-1.5">{spaceReferenceImages.slice(0, 8).map((url) => <img key={url} src={url} alt="" className="h-16 w-full rounded border border-white/10 object-cover" draggable={false} />)}</div> : <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接空间、风格或展厅环境参考图。</div>}
          </div>
          <div data-exhibition-compact-item="device-reference" className="space-y-2 rounded border border-white/10 bg-black/15 p-2">
            <div className="text-[10px] text-white/55">装置/结构参考 · {deviceReferenceImages.length}</div>
            {deviceReferenceImages.length ? <div className="grid grid-cols-4 gap-1.5">{deviceReferenceImages.slice(0, 8).map((url, index) => <div key={url} className="relative"><img src={url} alt="" className="h-16 w-full rounded border border-white/10 object-cover" draggable={false} /><span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-cyan-100">@img{spaceReferenceImages.length + index + 1}</span></div>)}</div> : <div className="rounded border border-dashed border-white/15 p-2 text-center text-[10px] text-white/35">可连接机械结构、设备、传感器或屏幕参考图。</div>}
            <MentionPromptInput
              title="补充要求 / @ 装置参考"
              value={supplement}
              mentions={supplementMentions}
              materials={mentionMaterials}
              onChange={(value, mentions) => update({ supplement: value, supplementMentions: mentions })}
              placeholder="补充科学变量、操作方式、材料或安全要求，可输入 @ 引用装置参考图"
              isDark
              isPixel={false}
              promptTemplateKind="image"
              className={`${FIELD} min-h-[52px] resize-y`}
              disabled={isReadonly || busy}
            />
          </div>
        </section>

        <section data-exhibition-compact-section="model" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生图图包</div>
            <button data-exhibition-compact-item="actions" type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成整套图包</button>
          </div>
          <div data-exhibition-compact-item="provider" className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">生图平台</span>
              <select className={FIELD} value={providerSelectValue} disabled={isReadonly || busy || (!allowZhenzhenFallback && imageAdvancedProviders.length === 0)} onChange={(event) => {
                const nextId = event.target.value;
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
          {results.length > 0 && (
            <div data-exhibition-compact-item="preview" className="grid grid-cols-2 gap-2">
              {results.map((item) => (
                <div key={`${item.kind}:${item.imageUrl}`} className="rounded border border-white/10 bg-black/20 p-1.5">
                  <div className="mb-1 truncate text-[10px] text-cyan-100">{item.name}</div>
                  <img src={item.imageUrl} alt={item.name} className="h-32 w-full rounded object-cover" draggable={false} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section data-exhibition-compact-section="prompt" data-exhibition-compact-item="prompt-preview" className="rounded border border-white/10 bg-black/20 p-2">
          <div className="mb-1 text-[11px] font-semibold text-cyan-100">主效果图 Prompt</div>
          <div className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">{previewPrompt}</div>
        </section>
      </div>
      {canManageScienceOptions && (
        <ScienceExhibitOptionEditorModal
          open={optionEditorOpen}
          presets={{
            domains: sciencePresetItems(domainOptions),
            types: sciencePresetItems(typeOptions),
            interactions: sciencePresetItems(interactionOptions),
            audiences: sciencePresetItems(audienceOptions),
            scales: sciencePresetItems(scaleOptions),
          }}
          saving={optionSaving}
          error={optionError}
          onClose={() => setOptionEditorOpen(false)}
          onSave={saveScienceOptions}
        />
      )}
    </div>
  );
};

export default memo(ScienceExhibitDesignNode);
