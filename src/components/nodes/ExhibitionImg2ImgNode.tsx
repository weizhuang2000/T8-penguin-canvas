import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  Clipboard,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  MoveVertical,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_LLM_MODEL,
  IMAGE_MODELS,
} from '../../providers/models';
import {
  generateExternalImage,
  generateLlm,
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
  buildExhibitionImg2ImgPrompt,
  EXHIBITION_IMG2IMG_PRIORITY,
  normalizeExhibitionImg2ImgPriority,
  type ExhibitionImg2ImgPriorityId,
} from '../../utils/exhibitionImg2ImgPrompt';
import {
  ELEVATION_CRAFTS,
  buildElevationAnalysisMessages,
  buildElevationOutputs,
  normalizeElevationAnalysis,
  parseElevationAnalysisResponse,
  type ElevationCraft,
  type ElevationAnalysis,
  type ElevationWall,
  wallsFromAnalysis,
} from '../../utils/elevationPrompt';
import {
  extractDocument,
  getCurrentUser,
  getElevationPromptPresets,
  updateElevationCraftPresets,
  type AuthUser,
  type ElevationCraftPresetItem,
  type ExtractedDocument,
} from '../../services/api';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useThemeStore } from '../../stores/theme';
import { useUpdateNodeData } from './useUpdateNodeData';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const DEFAULT_CRAFTS = ['panel', 'dimensional-letters', 'soft-film-lightbox'];
const DEFAULT_REFINE_WORD_COUNT = 1200;
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_SIZE_LEVELS = ['1K', '2K', '4K'];

function same(valueA: unknown, valueB: unknown) {
  return JSON.stringify(valueA) === JSON.stringify(valueB);
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

function firstImageFromData(data: any): string {
  const direct = typeof data?.imageUrl === 'string' ? data.imageUrl.trim() : '';
  if (direct) return direct;
  for (const key of ['imageUrls', 'urls', 'generatedImages']) {
    const list = data?.[key];
    if (!Array.isArray(list)) continue;
    const found = list.find((item) => typeof item === 'string' && item.trim());
    if (found) return String(found).trim();
  }
  if (data?.firstFrameUrl) return String(data.firstFrameUrl).trim();
  return '';
}

function useHandleImage(nodeId: string, targetHandle: string): string {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns
      .filter((conn: any) => (conn.targetHandle || '') === targetHandle)
      .map((conn: any) => conn.source)
      .filter(Boolean))),
    [conns, targetHandle],
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

function craftPresetEditorText(presets: ElevationCraftPresetItem[]): string {
  return presets.map((preset) => `${preset.label}｜${preset.prompt}`).join('\n');
}

function parseCraftPresetEditorText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const raw = line.trim();
      if (!raw) return null;
      const [labelRaw, ...rest] = raw.split(/[｜|]/);
      const label = String(labelRaw || '').trim();
      const prompt = rest.join('｜').trim();
      if (!label || !prompt) return null;
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'craft'}-${index + 1}`,
        label,
        prompt,
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; prompt: string; order: number }>;
}

function PrioritySorter({
  value,
  disabled,
  onChange,
}: {
  value: ExhibitionImg2ImgPriorityId[];
  disabled: boolean;
  onChange: (next: ExhibitionImg2ImgPriorityId[]) => void;
}) {
  const [dragId, setDragId] = useState<ExhibitionImg2ImgPriorityId | null>(null);

  const move = (id: ExhibitionImg2ImgPriorityId, delta: number) => {
    const index = value.indexOf(id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= value.length) return;
    const next = value.slice();
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, id: ExhibitionImg2ImgPriorityId) => {
    if (disabled) return;
    event.stopPropagation();
    setDragId(id);
  };

  return (
    <div className="space-y-1">
      {value.map((id, index) => {
        const meta = EXHIBITION_IMG2IMG_PRIORITY.find((item) => item.id === id);
        return (
          <div
            key={id}
            className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${
              dragId === id ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-black/15 text-white/70'
            }`}
            onPointerDown={(event) => onPointerDown(event, id)}
            onPointerUp={() => setDragId(null)}
          >
            <MoveVertical size={12} className="text-white/35" />
            <span className="h-4 w-4 rounded bg-cyan-300/15 text-center text-[9px] leading-4 text-cyan-100">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate">{meta?.label || id}</span>
            <button type="button" className="rounded p-0.5 hover:bg-white/10 disabled:opacity-35" disabled={disabled || index === 0} onClick={() => move(id, -1)}>
              <ArrowUp size={12} />
            </button>
            <button type="button" className="rounded p-0.5 hover:bg-white/10 disabled:opacity-35" disabled={disabled || index === value.length - 1} onClick={() => move(id, 1)}>
              <ArrowDown size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ImageSlot({
  handleId,
  title,
  subtitle,
  url,
  top,
}: {
  handleId: 'structure' | 'style';
  title: string;
  subtitle: string;
  url: string;
  top: string;
}) {
  return (
    <>
      <Handle
        id={handleId}
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-0 !bg-cyan-300"
        style={{ top }}
      />
      <div className="rounded border border-white/10 bg-black/15 p-2">
        <div className="mb-1 flex items-center gap-1.5">
          <ImageIcon size={12} className="text-cyan-200" />
          <span className="text-[11px] font-semibold text-cyan-100">{title}</span>
        </div>
        {url ? (
          <div className="flex items-center gap-2">
            <img src={url} alt="" className="h-14 w-20 rounded border border-white/10 object-cover" draggable={false} />
            <div className="min-w-0 flex-1 text-[10px] text-white/45">
              <div className="truncate">{subtitle}</div>
              <div className="mt-1 truncate" title={url}>{url.split('/').pop() || url}</div>
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-white/15 px-2 py-3 text-[10px] text-white/35">
            请连接一张图像到此输入口
          </div>
        )}
      </div>
    </>
  );
}

const ExhibitionImg2ImgNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const { style } = useThemeStore();
  const isPixel = style === 'pixel';
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const imageAdvancedProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredLlmModel }];
  }, [configuredLlmModel, llmConfigs]);
  const providerSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'image', {
      providerSource: d.providerSource,
      providerId: d.providerId,
      providerModel: d.providerModel,
    }),
    [advancedProviders, d.providerSource, d.providerId, d.providerModel],
  );
  const isExternalSelected = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const savedExternalMissing = !!d.providerSource && d.providerSource !== 'zhenzhen' && !providerSelection.available;
  const externalModelOptions = providerSelection.provider
    ? advancedProviderModelOptions(providerSelection.provider, 'image')
    : [];
  const externalProviderModel = providerSelection.providerModel || externalModelOptions[0] || '';
  const firstImageAdvancedProvider = imageAdvancedProviders[0] || null;
  const providerSelectValue = isExternalSelected
    ? providerSelection.providerId
    : (allowZhenzhenFallback ? 'zhenzhen' : (firstImageAdvancedProvider?.id || ''));
  const selectedContentLlmKeyId = String(d.contentLlmKeyId || '').trim();
  const activeContentLlmConfig = llmConfigOptions.find((item) => item.id === selectedContentLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const savedContentModel = String(d.contentModel || '').trim();
  const contentModel = activeContentLlmConfig?.model || savedContentModel || configuredLlmModel;

  const model = d.model || 'gpt-image-2';
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || modelDef.defaultAspectRatio || '1:1';
  const sizeLevel = d.sizeLevel || modelDef.defaultSize || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));

  const structureImage = useHandleImage(id, 'structure');
  const styleImage = useHandleImage(id, 'style');
  const priorityOrder = normalizeExhibitionImg2ImgPriority(d.priorityOrder);
  const selectedCrafts: string[] = Array.isArray(d.selectedCrafts) ? d.selectedCrafts : DEFAULT_CRAFTS;
  const contentEnabled = d.contentPlanningEnabled === true;
  const sourceText = String(d.sourceText || '');
  const wallMode: 'single' | 'multi' = d.wallMode === 'single' ? 'single' : 'multi';
  const wallCount = Math.max(1, Math.min(12, Number(d.wallCount) || 3));
  const refineWordCount = Math.max(200, Math.min(3000, Number(d.refineWordCount) || DEFAULT_REFINE_WORD_COUNT));
  const analysis = useMemo(
    () => normalizeElevationAnalysis(d.analysis) as ElevationAnalysis,
    [d.analysis],
  );
  const [analysisDraft, setAnalysisDraft] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [craftPresets, setCraftPresets] = useState<ElevationCraftPresetItem[]>([]);
  const [craftEditorOpen, setCraftEditorOpen] = useState(false);
  const [craftEditorValue, setCraftEditorValue] = useState('');
  const [craftSaving, setCraftSaving] = useState(false);
  const [craftError, setCraftError] = useState('');
  const status = String(d.status || 'idle');
  const isGenerating = status === 'generating';
  const busy = isGenerating || status === 'extracting' || status === 'refining';
  const contentBusy = status === 'extracting' || status === 'refining';
  const pollAbortRef = useRef(false);
  const craftPresetOptions = useMemo<ElevationCraft[]>(
    () => (craftPresets.length > 0 ? craftPresets : ELEVATION_CRAFTS),
    [craftPresets],
  );
  const contentOutputs = useMemo(
    () => buildElevationOutputs({
      analysis,
      walls: Array.isArray(d.walls) ? d.walls : [],
      wallMode,
      wallCount,
      outputMode: d.outputMode === 'overview' ? 'overview' : 'segments',
      downstreamContent: 'schedule',
      selectedCrafts,
      customCraft: d.customCraft,
      aspectRatio: d.aspectRatio,
      dimensions: d.dimensions,
      density: d.density,
      colorMaterial: d.colorMaterial,
      visualStyle: d.visualStyle,
      supplement: d.contentSupplement,
      craftPresets,
    }),
    [
      analysis,
      craftPresets,
      d.colorMaterial,
      d.contentSupplement,
      d.customCraft,
      d.density,
      d.dimensions,
      d.outputMode,
      d.visualStyle,
      d.walls,
      selectedCrafts,
      wallCount,
      wallMode,
    ],
  );
  const hasContentPlanning = contentEnabled && (
    Array.isArray(d.walls) && d.walls.length > 0 ||
    !!analysis.projectTheme ||
    !!analysis.coreMessage ||
    analysis.sections.length > 0
  );
  const wallContentPrompt = hasContentPlanning ? contentOutputs.mainOutput : '';

  const prompt = useMemo(
    () => buildExhibitionImg2ImgPrompt({
      priorityOrder,
      selectedCrafts,
      customCraft: d.customCraft,
      craftPresets,
      density: d.density,
      dimensions: d.dimensions,
      colorMaterial: d.colorMaterial,
      visualStyle: d.visualStyle,
      supplement: d.supplement,
      wallContentPrompt,
    }),
    [craftPresets, d.colorMaterial, d.customCraft, d.density, d.dimensions, d.supplement, d.visualStyle, priorityOrder, selectedCrafts, wallContentPrompt],
  );

  useEffect(() => {
    const refs = [structureImage, styleImage].filter(Boolean);
    const patch = {
      prompt,
      outputText: prompt,
      text: prompt,
      referenceImages: refs,
    };
    if (
      d.prompt !== prompt ||
      d.outputText !== prompt ||
      d.text !== prompt ||
      JSON.stringify(d.referenceImages || []) !== JSON.stringify(refs)
    ) {
      update(patch);
    }
  }, [d.imageUrl, d.outputText, d.prompt, d.referenceImages, d.text, prompt, structureImage, styleImage, update]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getElevationPromptPresets()
      .then((presets) => setCraftPresets(presets.crafts || []))
      .catch(() => setCraftPresets([]));
  }, []);

  useEffect(() => {
    if (allowZhenzhenFallback || isExternalSelected || !firstImageAdvancedProvider) return;
    const nextModels = advancedProviderModelOptions(firstImageAdvancedProvider, 'image');
    update({
      providerSource: firstImageAdvancedProvider.protocol,
      providerId: firstImageAdvancedProvider.id,
      providerModel: nextModels[0] || '',
    });
  }, [allowZhenzhenFallback, firstImageAdvancedProvider, isExternalSelected, update]);

  useEffect(() => {
    if (!craftEditorOpen) return;
    setCraftEditorValue(craftPresetEditorText(craftPresets));
    setCraftError('');
  }, [craftEditorOpen, craftPresets]);

  useEffect(() => {
    setAnalysisDraft(JSON.stringify(analysis, null, 2));
  }, [analysis]);

  useEffect(() => {
    const patch = {
      contentPlanningPrompt: wallContentPrompt,
      contentWalls: contentOutputs.walls,
      contentLayoutSchedule: contentOutputs.layoutSchedule,
      contentConceptPrompts: contentOutputs.conceptPrompts,
    };
    if (
      d.contentPlanningPrompt !== patch.contentPlanningPrompt ||
      !same(d.contentWalls || [], patch.contentWalls) ||
      d.contentLayoutSchedule !== patch.contentLayoutSchedule ||
      !same(d.contentConceptPrompts || [], patch.contentConceptPrompts)
    ) {
      update(patch);
    }
  }, [contentOutputs.conceptPrompts, contentOutputs.layoutSchedule, contentOutputs.walls, d.contentConceptPrompts, d.contentLayoutSchedule, d.contentPlanningPrompt, d.contentWalls, update, wallContentPrompt]);

  const orderedReferenceImages = useMemo(() => {
    const imageForPriority: Record<string, string[]> = {
      structureAnnotations: structureImage ? [structureImage] : [],
      craftLayout: [],
      styleImageForm: styleImage ? [styleImage] : [],
    };
    const out: string[] = [];
    for (const key of priorityOrder) {
      for (const url of imageForPriority[key]) {
        if (url && !out.includes(url)) out.push(url);
      }
    }
    return out;
  }, [priorityOrder, structureImage, styleImage]);

  const saveCraftPresets = async () => {
    if (!canManageTeam) return;
    const presets = parseCraftPresetEditorText(craftEditorValue);
    if (presets.length === 0) {
      setCraftError('请至少保留一条“名称｜提示词”格式的工艺预设。');
      return;
    }
    setCraftSaving(true);
    setCraftError('');
    try {
      const saved = await updateElevationCraftPresets(presets);
      setCraftPresets(saved);
      setCraftEditorOpen(false);
    } catch (error: any) {
      setCraftError(error?.message || '保存工艺预设失败');
    } finally {
      setCraftSaving(false);
    }
  };

  const toggleCraft = (craftId: string) => {
    if (isReadonly) return;
    const next = selectedCrafts.includes(craftId)
      ? selectedCrafts.filter((item) => item !== craftId)
      : [...selectedCrafts, craftId];
    update({ selectedCrafts: next });
  };

  const refineText = useCallback(async (textOverride?: string, rethrow = false) => {
    if (isReadonly || !contentEnabled) return;
    const text = String(textOverride ?? sourceText).trim();
    if (!text) {
      update({ status: 'error', error: '请先上传文档或填写原文' });
      return;
    }
    update({ status: 'refining', error: '' });
    try {
      const messages = buildElevationAnalysisMessages(text, wallMode, wallCount, refineWordCount);
      const maxTokens = Math.max(1200, Math.min(8192, Math.ceil(refineWordCount * 3.2)));
      const response = await generateLlm({
        model: contentModel,
        messages: messages as any,
        llmKeyId: activeContentLlmConfig?.id,
        temperature: 0.2,
        max_tokens: maxTokens,
      });
      const nextAnalysis = parseElevationAnalysisResponse(response.content) as ElevationAnalysis;
      const nextWalls = wallsFromAnalysis(nextAnalysis, wallMode, wallCount) as ElevationWall[];
      update({
        analysis: nextAnalysis,
        walls: nextWalls,
        status: 'success',
        error: '',
        analyzedAt: Date.now(),
      });
    } catch (error: any) {
      update({ status: 'error', error: error?.message || 'AI 提炼失败' });
      if (rethrow) throw error;
    }
  }, [
    activeContentLlmConfig?.id,
    contentEnabled,
    contentModel,
    isReadonly,
    refineWordCount,
    sourceText,
    update,
    wallCount,
    wallMode,
  ]);

  const pickDocument = async (file?: File) => {
    if (!file || isReadonly || !contentEnabled) return;
    if (file.size > 10 * 1024 * 1024) {
      update({ status: 'error', error: '文档不能超过 10MB' });
      return;
    }
    update({ status: 'extracting', error: '' });
    try {
      const extracted = await extractDocument(file);
      const { text, ...documentMeta } = extracted;
      update({
        documentMeta,
        sourceText: text,
        analysis: null,
        walls: [],
        status: 'refining',
        error: '',
      });
      await refineText(text);
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '文档解析失败' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const rebuildWalls = () => {
    if (isReadonly || !contentEnabled) return;
    update({ walls: wallsFromAnalysis(analysis, wallMode, wallCount) });
  };

  const patchWall = (index: number, patch: Partial<ElevationWall>) => {
    if (isReadonly || !contentEnabled) return;
    const next = contentOutputs.walls.map((wall: ElevationWall, wallIndex: number) => (
      wallIndex === index ? { ...wall, ...patch } : wall
    ));
    update({ walls: next });
  };

  const applyAnalysisDraft = () => {
    if (isReadonly || !contentEnabled) return;
    try {
      const next = parseElevationAnalysisResponse(analysisDraft) as ElevationAnalysis;
      update({ analysis: next, walls: wallsFromAnalysis(next, wallMode, wallCount), error: '' });
      setDraftMessage('已应用');
    } catch (error: any) {
      setDraftMessage(error?.message || 'JSON 无法解析');
    }
  };

  const importAnalysisJson = async (file?: File) => {
    if (!file || isReadonly || !contentEnabled) return;
    try {
      const text = await file.text();
      const next = parseElevationAnalysisResponse(text) as ElevationAnalysis;
      setAnalysisDraft(JSON.stringify(next, null, 2));
      setDraftMessage('已导入');
    } catch (error: any) {
      setDraftMessage(error?.message || 'JSON 无法解析');
    } finally {
      if (jsonFileRef.current) jsonFileRef.current.value = '';
    }
  };

  const exportAnalysisJson = () => {
    try {
      const next = parseElevationAnalysisResponse(analysisDraft) as ElevationAnalysis;
      const content = JSON.stringify(next, null, 2);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const theme = String(next.projectTheme || 'exhibition-content-analysis')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .slice(0, 48) || 'exhibition-content-analysis';
      link.href = url;
      link.download = `${theme}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDraftMessage('已导出');
    } catch (error: any) {
      setDraftMessage(error?.message || 'JSON 无法解析');
    }
  };

  const runGenerate = async () => {
    if (isReadonly) return;
    if (!structureImage || !styleImage) {
      const msg = !structureImage && !styleImage
        ? '请连接空间结构示意图和空间表现效果图'
        : !structureImage
          ? '请连接空间结构示意图'
          : '请连接空间表现效果图';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-img2img:${id.slice(0, 6)}`;
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'exhibition-img2img',
      seed: runSeed,
      nodeTitle: '展陈图生图',
    };
    taskCompletionSound.primeAudio();
    pollAbortRef.current = false;
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
        logBus.info(`展陈图生图提交: ${providerSelection.provider.label || providerSelection.provider.id} · ${externalProviderModel} · refs=${orderedReferenceImages.length}`, src);
        const res = await generateExternalImage({
          providerId: providerSelection.provider.id,
          providerModel: externalProviderModel,
          model: externalProviderModel,
          prompt,
          size,
          aspect_ratio: aspectRatio,
          image_size: sizeLevel,
          images: orderedReferenceImages,
          outputFormat,
          seed: runSeed,
          n: Math.max(1, Math.min(4, Number(providerParams.n || 1))),
          providerParams,
          historyContext,
        });
        const urls = res.imageUrls || [];
        if (!urls.length) throw new Error('扩展平台完成但未返回图片');
        update({
          status: 'success',
          progress: '100%',
          imageUrl: urls[0],
          imageUrls: urls,
          remoteImageUrls: res.remoteImageUrls,
          lastPrompt: prompt,
          lastSeed: runSeed,
          taskId: res.taskId || d.taskId,
          usedI2I: true,
          error: '',
        });
        logBus.success(`展陈图生图完成 → ${urls[0]}`, src);
        taskCompletionSound.notifyComplete(id, 'image');
        return;
      }

      logBus.info(`展陈图生图提交: model=${apiModel} ratio=${aspectRatio} size=${sizeLevel} refs=${orderedReferenceImages.length}`, src);
      const submit = await submitImageAsync({
        model: modelDef.id,
        apiModel,
        paramKind: modelDef.paramKind,
        prompt,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images: orderedReferenceImages,
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
        const status = String(q.status || '').toLowerCase();
        if (status === 'completed' || status === 'success' || status === 'done') {
          const url = q.urls?.[0];
          if (!url) throw new Error('任务完成但未返回图片');
          update({
            status: 'success',
            progress: '100%',
            imageUrl: url,
            imageUrls: q.urls,
            lastPrompt: prompt,
            lastSeed: runSeed,
            usedI2I: true,
            error: '',
          });
          logBus.success(`展陈图生图完成 → ${url}`, src);
          taskCompletionSound.notifyComplete(id, 'image');
          return;
        }
        if (status === 'failed' || status === 'failure' || status === 'error') {
          throw new Error(q.error || '任务失败');
        }
      }
      throw new Error('轮询超时');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      logBus.error(`展陈图生图失败: ${msg}`, src);
      update({ status: 'error', error: msg });
      throw error;
    }
  };

  useRunTrigger(id, runGenerate, 'image');

  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      className={`relative w-[430px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!bg-cyan-300 !border-0" />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <Boxes size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">展陈图生图</div>
          <div className="truncate text-[10px] text-white/45">结构示意图 / 表现效果图 / 工艺版式</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[780px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && (
          <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">
            当前画布为只读，仅可查看结果。
          </div>
        )}
        {d.error && (
          <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">
            {d.error}
          </div>
        )}

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <ImageSlot handleId="structure" title="空间结构示意图" subtitle="保留结构、动线、分区；标注只作理解参考" url={structureImage} top="24%" />
          <ImageSlot handleId="style" title="空间表现效果图" subtitle="借鉴风格、材质、光影和完成度" url={styleImage} top="39%" />
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <FileText size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">展墙内容设计</span>
            <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-white/60">
              <input
                type="checkbox"
                className="h-3 w-3 accent-cyan-300"
                checked={contentEnabled}
                disabled={isReadonly || isGenerating}
                onChange={(event) => update({ contentPlanningEnabled: event.target.checked })}
              />
              启用
            </label>
          </div>
          <div className="text-[10px] leading-snug text-white/45">
            开启后导入文档、AI 提炼和立面组织会作为效果图中展墙具体内容的设计提示词；关闭时完全不参与生成。
          </div>
          {contentEnabled && (
            <div className="mt-2 space-y-2">
              <div className="rounded border border-white/10 bg-black/15 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-cyan-100">1. 导入文档</span>
                  <button
                    type="button"
                    className={`${BUTTON} ml-auto`}
                    disabled={contentBusy || isReadonly}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={12} />
                    选择文件
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".docx,.pdf,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => void pickDocument(event.target.files?.[0])}
                  />
                </div>
                <div className="truncate text-[10px] text-white/55" title={documentLabel(d.documentMeta)}>
                  {documentLabel(d.documentMeta)}
                </div>
                {Array.isArray(d.documentMeta?.warnings) && d.documentMeta.warnings.length > 0 && (
                  <div className="mt-1 text-[10px] text-amber-200/80">{d.documentMeta.warnings.join('；')}</div>
                )}
                <textarea
                  className={`${FIELD} mt-2 min-h-[72px] resize-y`}
                  value={sourceText}
                  disabled={isReadonly || contentBusy}
                  placeholder="上传 DOCX、文本型 PDF、TXT，或直接粘贴项目文案"
                  onChange={(event) => update({ sourceText: event.target.value })}
                />
              </div>

              <div className="rounded border border-white/10 bg-black/15 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-cyan-100">2. AI 提炼</span>
                  <label className="ml-auto flex min-w-[138px] items-center gap-1.5 text-[10px] text-white/55" title="控制 AI 结构化提炼的目标字数">
                    <span className="whitespace-nowrap">字数 {refineWordCount}</span>
                    <input
                      type="range"
                      min={200}
                      max={3000}
                      step={100}
                      value={refineWordCount}
                      disabled={contentBusy || isReadonly}
                      className="h-1 w-16 accent-cyan-300"
                      onChange={(event) => update({ refineWordCount: Number(event.target.value) })}
                    />
                  </label>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={contentBusy || isReadonly || !sourceText.trim()}
                    onClick={() => void refineText()}
                  >
                    {status === 'refining' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    重新提炼
                  </button>
                </div>
                <div className="mb-1.5 grid grid-cols-2 gap-1">
                  <select
                    className={FIELD}
                    disabled={isReadonly || contentBusy}
                    value={`llm-key:${activeContentLlmConfig?.id || 'default'}`}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      if (nextId.startsWith('llm-key:')) {
                        update({ contentProviderSource: 'zhenzhen', contentProviderId: '', contentProviderModel: '', contentLlmKeyId: nextId.slice(8) });
                      }
                    }}
                  >
                    {llmConfigOptions.map((item) => <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
                  </select>
                  <input className={FIELD} disabled value={contentModel} title="模型由所选 LLM 配置决定" />
                </div>
                <input
                  className={FIELD}
                  value={analysis.projectTheme}
                  disabled={isReadonly}
                  placeholder="项目主题"
                  onChange={(event) => update({ analysis: { ...analysis, projectTheme: event.target.value } })}
                />
                <textarea
                  className={`${FIELD} mt-1 min-h-[48px] resize-y`}
                  value={analysis.coreMessage}
                  disabled={isReadonly}
                  placeholder="核心信息"
                  onChange={(event) => update({ analysis: { ...analysis, coreMessage: event.target.value } })}
                />
                <details className="mt-1.5 text-[10px] text-white/55">
                  <summary className="cursor-pointer select-none">编辑结构化分析 JSON</summary>
                  <input
                    ref={jsonFileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(event) => importAnalysisJson(event.target.files?.[0])}
                  />
                  <textarea
                    className={`${FIELD} mt-1 min-h-[130px] resize-y font-mono`}
                    value={analysisDraft}
                    disabled={isReadonly}
                    onChange={(event) => {
                      setAnalysisDraft(event.target.value);
                      setDraftMessage('');
                    }}
                  />
                  <div className="mt-1 flex items-center justify-end gap-2">
                    {draftMessage && (
                      <span className={['已应用', '已导入', '已导出'].includes(draftMessage) ? 'text-emerald-300' : 'text-red-300'}>
                        {draftMessage}
                      </span>
                    )}
                    <button type="button" className={BUTTON} disabled={isReadonly} onClick={() => jsonFileRef.current?.click()}>
                      <Upload size={11} />导入 JSON
                    </button>
                    <button type="button" className={BUTTON} onClick={exportAnalysisJson}>
                      <Download size={11} />导出 JSON
                    </button>
                    <button type="button" className={BUTTON} disabled={isReadonly} onClick={applyAnalysisDraft}>
                      <Check size={11} />应用 JSON
                    </button>
                  </div>
                </details>
              </div>

              <div className="rounded border border-white/10 bg-black/15 p-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-cyan-100">3. 立面组织</span>
                  <button type="button" className={`${BUTTON} ml-auto`} disabled={isReadonly} onClick={rebuildWalls}>
                    <RefreshCw size={11} />按分析重建
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <select
                    className={FIELD}
                    disabled={isReadonly}
                    value={wallMode}
                    onChange={(event) => {
                      const nextMode = event.target.value === 'single' ? 'single' : 'multi';
                      update({
                        wallMode: nextMode,
                        walls: wallsFromAnalysis(analysis, nextMode, nextMode === 'single' ? 1 : wallCount),
                      });
                    }}
                  >
                    <option value="single">单立面</option>
                    <option value="multi">多立面</option>
                  </select>
                  <input
                    className={FIELD}
                    type="number"
                    min={1}
                    max={12}
                    disabled={isReadonly || wallMode === 'single'}
                    value={wallMode === 'single' ? 1 : wallCount}
                    onChange={(event) => {
                      const nextCount = Math.max(1, Math.min(12, Number(event.target.value) || 1));
                      update({ wallCount: nextCount, walls: wallsFromAnalysis(analysis, 'multi', nextCount) });
                    }}
                    title="立面数量"
                  />
                  <select
                    className={FIELD}
                    disabled={isReadonly || wallMode === 'single'}
                    value={d.outputMode === 'overview' ? 'overview' : 'segments'}
                    onChange={(event) => update({ outputMode: event.target.value })}
                  >
                    <option value="segments">逐面集合</option>
                    <option value="overview">整套总览</option>
                  </select>
                </div>
                <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                  {contentOutputs.walls.map((wall: ElevationWall, index: number) => (
                    <div key={wall.id || index} className="rounded border border-white/10 bg-white/[0.035] p-1.5">
                      <input
                        className={FIELD}
                        value={wall.title || ''}
                        disabled={isReadonly}
                        placeholder={`立面 ${index + 1} 标题`}
                        onChange={(event) => patchWall(index, { title: event.target.value })}
                      />
                      <textarea
                        className={`${FIELD} mt-1 min-h-[46px] resize-y`}
                        value={wall.content || ''}
                        disabled={isReadonly}
                        placeholder="展示重点与内容摘要"
                        onChange={(event) => patchWall(index, { content: event.target.value })}
                      />
                      <textarea
                        className={`${FIELD} mt-1 min-h-[40px] resize-y`}
                        value={(wall.exactText || []).join('\n')}
                        disabled={isReadonly}
                        placeholder="准确上墙文案，每行一条"
                        onChange={(event) => patchWall(index, {
                          exactText: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
                        })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 text-[11px] font-semibold text-cyan-100">优先级顺序</div>
          <div className="mb-1.5 text-[10px] leading-snug text-white/45">
            仅调整表现形式取舍；空间结构始终完全按结构示意图。
          </div>
          <PrioritySorter
            value={priorityOrder}
            disabled={isReadonly}
            onChange={(next) => update({ priorityOrder: next })}
          />
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-cyan-100">工艺与版式</span>
            {canManageTeam && (
              <button type="button" className={`${BUTTON} ml-auto`} disabled={craftSaving} onClick={() => setCraftEditorOpen((value) => !value)}>
                <Settings size={11} />设置工艺
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {craftPresetOptions.map((craft) => {
              const active = selectedCrafts.includes(craft.id);
              return (
                <button
                  key={craft.id}
                  type="button"
                  disabled={isReadonly}
                  className={`min-w-0 rounded border px-1.5 py-1 text-[10px] ${
                    active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  } disabled:opacity-50`}
                  onClick={() => toggleCraft(craft.id)}
                  title={craft.prompt}
                >
                  <span className="block truncate">{craft.label}</span>
                </button>
              );
            })}
          </div>
          {canManageTeam && craftEditorOpen && (
            <div className="mt-1.5 rounded border border-white/10 bg-white/[0.035] p-2">
              <div className="mb-1 text-[10px] text-white/45">每行一个工艺预设：名称｜提示词。</div>
              <textarea className={`${FIELD} min-h-[96px] resize-y font-mono`} value={craftEditorValue} disabled={craftSaving} onChange={(event) => setCraftEditorValue(event.target.value)} />
              {craftError && <div className="mt-1 text-[10px] text-red-300">{craftError}</div>}
              <div className="mt-1.5 flex justify-end gap-1">
                <button type="button" className={BUTTON} disabled={craftSaving} onClick={() => setCraftEditorOpen(false)}>取消</button>
                <button type="button" className={BUTTON} disabled={craftSaving} onClick={saveCraftPresets}>{craftSaving ? '保存中' : '保存工艺'}</button>
              </div>
            </div>
          )}
          <input className={`${FIELD} mt-1.5`} value={d.customCraft || ''} disabled={isReadonly} placeholder="自定义工艺" onChange={(event) => update({ customCraft: event.target.value })} />
          <div className="mt-1 grid grid-cols-2 gap-1">
            <select className={FIELD} value={d.density || '适中，图文层级均衡'} disabled={isReadonly} onChange={(event) => update({ density: event.target.value })}>
              <option value="疏朗，强调大图与留白">疏朗</option>
              <option value="适中，图文层级均衡">适中</option>
              <option value="信息丰富，采用严谨网格">丰富</option>
            </select>
            <input className={FIELD} value={d.dimensions || ''} disabled={isReadonly} placeholder="空间/画面尺寸" onChange={(event) => update({ dimensions: event.target.value })} />
            <input className={FIELD} value={d.colorMaterial || ''} disabled={isReadonly} placeholder="色彩与材质" onChange={(event) => update({ colorMaterial: event.target.value })} />
            <input className={FIELD} value={d.visualStyle || ''} disabled={isReadonly} placeholder="视觉风格" onChange={(event) => update({ visualStyle: event.target.value })} />
          </div>
          <textarea className={`${FIELD} mt-1 min-h-[48px] resize-y`} value={d.supplement || ''} disabled={isReadonly} placeholder="补充要求" onChange={(event) => update({ supplement: event.target.value })} />
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2 space-y-2">
          <div className="text-[11px] font-semibold text-cyan-100">模型与输出</div>
          {imageAdvancedProviders.length > 0 && (
            <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-2">
              <button
                type="button"
                onClick={() => update({ advancedProviderOpen: !d.advancedProviderOpen })}
                className="w-full flex items-center justify-between text-[10px] font-semibold text-white/70 hover:text-white"
              >
                <span>高级来源</span>
                <span>{isExternalSelected && providerSelection.provider ? providerSelection.provider.label : (allowZhenzhenFallback ? '默认百达工坊' : '请选择扩展平台')}</span>
              </button>
              {d.advancedProviderOpen && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">平台</label>
                    <select
                      value={providerSelectValue}
                      disabled={isReadonly || busy}
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
                      style={{ background: '#18181b', color: '#ffffff' }}
                      className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                    >
                      {allowZhenzhenFallback && <option value="zhenzhen" style={{ background: '#18181b', color: '#ffffff' }}>百达工坊（默认）</option>}
                      {imageAdvancedProviders.map((provider) => (
                        <option key={provider.id} value={provider.id} style={{ background: '#18181b', color: '#ffffff' }}>
                          {provider.label || provider.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isExternalSelected && providerSelection.provider && (
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">外部模型</label>
                      <select
                        value={externalProviderModel}
                        disabled={isReadonly || busy}
                        onChange={(event) => update({ providerModel: event.target.value })}
                        style={{ background: '#18181b', color: '#ffffff' }}
                        className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                      >
                        {externalModelOptions.map((item) => <option key={item} value={item} style={{ background: '#18181b', color: '#ffffff' }}>{item}</option>)}
                      </select>
                    </div>
                  )}
                  {savedExternalMissing && (
                    <div className="text-[10px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                      当前画布记录的扩展平台未启用或不存在，已临时回到默认来源。
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isExternalSelected && (
            <div>
              <label className="text-[10px] text-white/50 block mb-1">模型</label>
              <div
                className={`flex gap-0.5 p-0.5 rounded ${isPixel ? '' : 'bg-white/5'}`}
                style={isPixel ? { background: 'var(--px-muted)', border: '1.5px solid var(--px-ink)' } : undefined}
              >
                {availableModelDefs.map((item) => {
                  const active = item.id === model;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => update({ model: item.id, apiModel: item.apiModel, aspectRatio: item.defaultAspectRatio, sizeLevel: item.defaultSize || '2K' })}
                      title={item.description}
                      className={`flex-1 py-1 text-[10px] font-semibold rounded transition-all ${active ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                      style={
                        isPixel && active
                          ? { background: 'var(--px-yellow)', color: 'var(--px-ink)', border: '1.5px solid var(--px-ink)', boxShadow: '1px 1px 0 var(--px-ink)' }
                          : isPixel ? { color: 'var(--px-ink-soft)' } : undefined
                      }
                    >
                      {item.tabLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isExternalSelected && (
            <div>
              <label className="text-[10px] text-white/50 block mb-1">具体模型</label>
              <select
                value={apiModel}
                disabled={isReadonly || busy}
                onChange={(event) => update({ apiModel: event.target.value })}
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              >
                {modelDef.apiModelOptions
                  .filter((item) => !item.value.includes('-fal'))
                  .map((item) => <option key={item.value} value={item.value} style={{ background: '#18181b', color: '#ffffff' }}>{item.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/50 block mb-1">比例</label>
              <select
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                style={{ background: '#18181b', color: '#ffffff' }}
                value={aspectRatio}
                disabled={isReadonly || busy}
                onChange={(event) => update({ aspectRatio: event.target.value })}
              >
                {(modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']).map((item) => <option key={item} value={item} style={{ background: '#18181b', color: '#ffffff' }}>{item}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">尺寸</label>
              <select
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                style={{ background: '#18181b', color: '#ffffff' }}
                value={sizeLevel}
                disabled={isReadonly || busy}
                onChange={(event) => update({ sizeLevel: event.target.value })}
              >
                {(isExternalSelected ? EXTERNAL_SIZE_LEVELS : (modelDef.sizes.length ? modelDef.sizes : EXTERNAL_SIZE_LEVELS)).map((item) => <option key={item} value={item} style={{ background: '#18181b', color: '#ffffff' }}>{item}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white/50 block mb-1">输出格式</label>
            <div
              className={`grid grid-cols-2 gap-0.5 p-0.5 rounded ${isPixel ? '' : 'bg-white/5'}`}
              style={isPixel ? { background: 'var(--px-muted)', border: '1.5px solid var(--px-ink)' } : undefined}
            >
              {(['jpg', 'png'] as const).map((fmt) => {
                const active = outputFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    disabled={isReadonly || busy}
                    onClick={() => update({ outputFormat: fmt })}
                    title={fmt === 'png' ? '保留透明区域，文件更大' : '高质量 JPG，文件更小'}
                    className={`py-1 text-[10px] font-semibold rounded transition-all ${active ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    style={
                      isPixel && active
                        ? { background: 'var(--px-yellow)', color: 'var(--px-ink)', border: '1.5px solid var(--px-ink)', boxShadow: '1px 1px 0 var(--px-ink)' }
                        : isPixel ? { color: 'var(--px-ink-soft)' } : undefined
                    }
                  >
                    {fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white/50 block mb-1" title="0 = 自动生成并记录随机 seed">Seed (0=random)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={seed}
              disabled={isReadonly || busy}
              onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
              style={{ background: '#18181b', color: '#ffffff' }}
              className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
            />
          </div>
        </section>

        <section className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
            <Clipboard size={13} />
            <span>输出 prompt</span>
            <button type="button" className="ml-auto flex h-6 items-center gap-1 rounded border border-white/10 px-2 text-[10px] text-white/65 hover:bg-white/10" onClick={() => navigator.clipboard?.writeText(prompt).catch(() => {})}>
              复制
            </button>
          </div>
          <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">{prompt}</div>
        </section>

        {d.imageUrl && (
          <section className="rounded border border-white/10 bg-black/20 p-2">
            <img src={d.imageUrl} alt="" className="max-h-52 w-full rounded border border-white/10 object-contain" draggable={false} />
          </section>
        )}

        <button
          type="button"
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-cyan-300/30 bg-cyan-300/15 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isReadonly || busy || !structureImage || !styleImage}
          onClick={() => void runGenerate()}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {isGenerating ? `生成中 ${d.progress || ''}` : contentBusy ? '内容提炼中' : '生成展陈效果图'}
        </button>
        {!structureImage || !styleImage ? (
          <div className="text-[10px] text-white/35">
            需要同时连接空间结构示意图和空间表现效果图。
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default memo(ExhibitionImg2ImgNode);
