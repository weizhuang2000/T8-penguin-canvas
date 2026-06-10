import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import {
  Brain,
  CheckCircle2,
  Clipboard,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Play,
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
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  EXHIBITION_CREATIVE_EXCLUDE_ITEMS,
  EXHIBITION_CREATIVE_INSERT_ITEMS,
  EXHIBITION_CREATIVE_SPACE_TYPES,
  exhibitionCreativeExcludeItemsText,
  exhibitionCreativeInsertItemsText,
  exhibitionCreativeSpaceTypeMeta,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeExcludeItems,
  normalizeExhibitionCreativeInsertItems,
  normalizeExhibitionCreativeSpaceSize,
  normalizeExhibitionCreativeSpaceType,
  type ExhibitionCreativeExcludeItem,
  type ExhibitionCreativeInsertItem,
} from '../../utils/exhibitionCreativeImagePrompt';
import {
  extractDocument,
  getCurrentUser,
  getExhibitionCreativePromptPresets,
  updateExhibitionCreativeExcludePresets,
  updateExhibitionCreativeInsertPresets,
  type AuthUser,
  type ExhibitionCreativeExcludePresetItem,
  type ExhibitionCreativeInsertPresetItem,
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
const MAX_IMAGE_SEED = 2147483647;
const MIN_GENERATION_COUNT = 1;
const MAX_GENERATION_COUNT = 12;
const EXTERNAL_SIZE_LEVELS = ['1K', '2K', '4K'];
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;

interface CreativeResult {
  index: number;
  brief: string;
  prompt: string;
  imageUrl: string;
  seed: number;
  taskId?: string;
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

function normalizeSpaceDimensionInput(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(200, Math.round(number * 100) / 100);
}

function imagesFromData(data: any): string[] {
  const out: string[] = [];
  const push = (value: any) => {
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

function useInputSpaceImage(nodeId: string): string {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(
    () => Array.from(new Set(conns.map((conn: any) => conn.source).filter(Boolean))),
    [conns],
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

function creativeResultsFromData(value: unknown): CreativeResult[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item, index) => {
      const imageUrl = typeof item?.imageUrl === 'string' ? item.imageUrl.trim() : '';
      if (!imageUrl) return null;
      return {
        index: Math.max(1, Number(item?.index) || index + 1),
        brief: String(item?.brief || '').trim(),
        prompt: String(item?.prompt || '').trim(),
        imageUrl,
        seed: Math.max(0, Math.floor(Number(item?.seed) || 0)),
        taskId: typeof item?.taskId === 'string' ? item.taskId : undefined,
      };
    })
    .filter(Boolean) as CreativeResult[];
}

function llmErrorMessage(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/no available accounts/i.test(message)) {
    return '当前 LLM 没有可用账号，请在创意描述区切换可用的 LLM 配置，或稍后重试。';
  }
  if (/unknown variant [`']?(image_url|image)[`']?/i.test(message) || /expected [`']?text[`']?/i.test(message)) {
    return '当前 LLM 配置不支持视觉输入。请切换支持图片理解的 LLM 配置，或改用文字灵感补充。';
  }
  return message || 'LLM 创意描述失败';
}

function fallbackCreativeBrief(values: {
  spaceType: string;
  projectTheme: string;
  inspiration: string;
  documentSummary: string;
  insertItemsText: string;
  excludeItemsText: string;
  roundIndex: number;
  total: number;
}) {
  const meta = exhibitionCreativeSpaceTypeMeta(values.spaceType);
  const theme = values.projectTheme || '展陈项目主题';
  const material = values.documentSummary
    ? '结合项目资料摘要中的核心叙事、关键展项和情绪基调，'
    : '';
  const inspiration = values.inspiration
    ? `吸收个人灵感中关于${values.inspiration.slice(0, 120)}的方向，`
    : '';
  const exclusion = values.excludeItemsText ? `同时避开${values.excludeItemsText}。` : '';
  return [
    `围绕${theme}创作第 ${values.roundIndex}/${values.total} 个${meta.label}展陈空间方案。`,
    `${material}${inspiration}在不改变原始室内建筑空间几何、透视、尺度和主要开口关系的前提下，植入${values.insertItemsText}。${exclusion}`,
    `整体气质应符合${meta.prompt}，画面具有专业展陈效果图的完成度、真实材料细节和可落地的施工表达，并与同批次其他方案形成可比较的差异化。`,
  ].join('');
}

function insertPresetEditorText(presets: ExhibitionCreativeInsertPresetItem[]) {
  return presets.map((preset) => preset.label).join('\n');
}

function excludePresetEditorText(presets: ExhibitionCreativeExcludePresetItem[]) {
  return presets.map((preset) => preset.label).join('\n');
}

function parseLabelPresetEditorText(text: string, fallbackId: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const label = line.trim();
      if (!label) return null;
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallbackId}-${index + 1}`,
        label,
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; order: number }>;
}

const ExhibitionCreativeImageNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [insertPresets, setInsertPresets] = useState<ExhibitionCreativeInsertPresetItem[]>([]);
  const [excludePresets, setExcludePresets] = useState<ExhibitionCreativeExcludePresetItem[]>([]);
  const [insertEditorOpen, setInsertEditorOpen] = useState(false);
  const [excludeEditorOpen, setExcludeEditorOpen] = useState(false);
  const [insertEditorValue, setInsertEditorValue] = useState('');
  const [excludeEditorValue, setExcludeEditorValue] = useState('');
  const [insertSaving, setInsertSaving] = useState(false);
  const [excludeSaving, setExcludeSaving] = useState(false);
  const [insertError, setInsertError] = useState('');
  const [excludeError, setExcludeError] = useState('');
  const { style } = useThemeStore();
  const isPixel = style === 'pixel';
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const imageAdvancedProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredLlmModel }];
  }, [configuredLlmModel, llmConfigs]);
  const selectedLlmKeyId = String(d.llmKeyId || '').trim();
  const activeLlmConfig = llmConfigOptions.find((item) => item.id === selectedLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const llmModel = activeLlmConfig?.model || String(d.llmModel || '').trim() || configuredLlmModel;
  const selectedDocumentLlmKeyId = String(d.documentLlmKeyId || d.llmKeyId || '').trim();
  const activeDocumentLlmConfig = llmConfigOptions.find((item) => item.id === selectedDocumentLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const documentLlmModel = activeDocumentLlmConfig?.model || String(d.documentLlmModel || '').trim() || llmModel;

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

  const model = d.model || 'gpt-image-2';
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || modelDef.defaultAspectRatio || '1:1';
  const sizeLevel = d.sizeLevel || modelDef.defaultSize || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const spaceType = normalizeExhibitionCreativeSpaceType(d.spaceType);
  const manualSpaceSize = normalizeExhibitionCreativeSpaceSize(d.manualSpaceSize);
  const hasManualSpaceSize = manualSpaceSize.width > 0 && manualSpaceSize.depth > 0 && manualSpaceSize.height > 0;
  const generationCount = normalizeExhibitionCreativeCount(d.generationCount);
  const insertOptions = useMemo<ExhibitionCreativeInsertItem[]>(
    () => (insertPresets.length > 0 ? insertPresets : EXHIBITION_CREATIVE_INSERT_ITEMS),
    [insertPresets],
  );
  const excludeOptions = useMemo<ExhibitionCreativeExcludeItem[]>(
    () => (excludePresets.length > 0 ? excludePresets : EXHIBITION_CREATIVE_EXCLUDE_ITEMS),
    [excludePresets],
  );
  const selectedInsertItems = useMemo(
    () => normalizeExhibitionCreativeInsertItems(d.insertItems, insertOptions),
    [d.insertItems, insertOptions],
  );
  const selectedInsertIds = useMemo(() => selectedInsertItems.map((item) => item.id), [selectedInsertItems]);
  const selectedExcludeItems = useMemo(
    () => normalizeExhibitionCreativeExcludeItems(d.excludeItems, excludeOptions),
    [d.excludeItems, excludeOptions],
  );
  const selectedExcludeIds = useMemo(() => selectedExcludeItems.map((item) => item.id), [selectedExcludeItems]);
  const allExcludeSelected = excludeOptions.length > 0 && selectedExcludeIds.length === excludeOptions.length;
  const regenerateEachTime = d.regenerateEachTime !== false;
  const projectTheme = String(d.projectTheme || '').trim();
  const inspiration = String(d.inspiration || '').trim();
  const sourceText = String(d.sourceText || '');
  const documentSummary = String(d.documentSummary || '').trim();
  const creativeBrief = normalizeExhibitionCreativeBrief(d.creativeBrief);
  const creativeResults = useMemo(() => creativeResultsFromData(d.creativeResults), [d.creativeResults]);
  const status = String(d.status || 'idle');
  const busy = status === 'generating' || status === 'creative' || status === 'extracting' || status === 'summarizing';
  const isGenerating = status === 'generating';
  const contentBusy = status === 'extracting' || status === 'summarizing';
  const pollAbortRef = useRef(false);
  const spaceImage = useInputSpaceImage(id);

  const previewPrompt = useMemo(
    () => buildExhibitionCreativeImagePrompt({
      spaceType,
      projectTheme,
      inspiration,
      documentSummary,
      creativeBrief,
      insertItems: selectedInsertIds,
      insertItemOptions: insertOptions,
      excludeItems: selectedExcludeIds,
      excludeItemOptions: excludeOptions,
      hasSpaceImage: !!spaceImage,
      spaceSize: manualSpaceSize,
      roundIndex: 1,
      total: generationCount,
    }),
    [creativeBrief, documentSummary, excludeOptions, generationCount, inspiration, insertOptions, manualSpaceSize, projectTheme, selectedExcludeIds, selectedInsertIds, spaceImage, spaceType],
  );

  useEffect(() => {
    const refs = spaceImage ? [spaceImage] : [];
    const patch = {
      prompt: previewPrompt,
      outputText: previewPrompt,
      text: previewPrompt,
      referenceImages: refs,
    };
    if (
      d.prompt !== patch.prompt ||
      d.outputText !== patch.outputText ||
      d.text !== patch.text ||
      JSON.stringify(d.referenceImages || []) !== JSON.stringify(refs)
    ) {
      update(patch);
    }
  }, [d.outputText, d.prompt, d.referenceImages, d.text, previewPrompt, spaceImage, update]);

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
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getExhibitionCreativePromptPresets()
      .then((presets) => {
        setInsertPresets(presets.inserts || []);
        setExcludePresets(presets.exclusions || []);
      })
      .catch(() => {
        setInsertPresets([]);
        setExcludePresets([]);
      });
  }, []);

  useEffect(() => {
    if (!insertEditorOpen) return;
    setInsertEditorValue(insertPresetEditorText(insertPresets));
    setInsertError('');
  }, [insertEditorOpen, insertPresets]);

  useEffect(() => {
    if (!excludeEditorOpen) return;
    setExcludeEditorValue(excludePresetEditorText(excludePresets));
    setExcludeError('');
  }, [excludeEditorOpen, excludePresets]);

  const saveInsertPresets = async () => {
    if (!canManageTeam) return;
    const presets = parseLabelPresetEditorText(insertEditorValue, 'insert');
    if (presets.length === 0) {
      setInsertError('请至少保留一项植入内容。');
      return;
    }
    setInsertSaving(true);
    setInsertError('');
    try {
      const saved = await updateExhibitionCreativeInsertPresets(presets);
      setInsertPresets(saved);
      update({ insertItems: normalizeExhibitionCreativeInsertItems(selectedInsertIds, saved).map((item) => item.id) });
      setInsertEditorOpen(false);
    } catch (error: any) {
      setInsertError(error?.message || '保存植入项失败');
    } finally {
      setInsertSaving(false);
    }
  };

  const saveExcludePresets = async () => {
    if (!canManageTeam) return;
    const presets = parseLabelPresetEditorText(excludeEditorValue, 'exclude');
    if (presets.length === 0) {
      setExcludeError('请至少保留一项排除内容。');
      return;
    }
    setExcludeSaving(true);
    setExcludeError('');
    try {
      const saved = await updateExhibitionCreativeExcludePresets(presets);
      setExcludePresets(saved);
      update({ excludeItems: normalizeExhibitionCreativeExcludeItems(selectedExcludeIds, saved).map((item) => item.id) });
      setExcludeEditorOpen(false);
    } catch (error: any) {
      setExcludeError(error?.message || '保存排除项失败');
    } finally {
      setExcludeSaving(false);
    }
  };

  const toggleInsertItem = (itemId: string) => {
    if (isReadonly || busy) return;
    const next = selectedInsertIds.includes(itemId)
      ? selectedInsertIds.filter((item) => item !== itemId)
      : [...selectedInsertIds, itemId];
    update({ insertItems: next });
  };

  const toggleExcludeItem = (itemId: string) => {
    if (isReadonly || busy) return;
    const next = selectedExcludeIds.includes(itemId)
      ? selectedExcludeIds.filter((item) => item !== itemId)
      : [...selectedExcludeIds, itemId];
    update({ excludeItems: next });
  };

  const toggleAllExcludeItems = () => {
    if (isReadonly || busy) return;
    update({ excludeItems: allExcludeSelected ? [] : excludeOptions.map((item) => item.id) });
  };

  const buildCreativeBrief = useCallback(async (roundIndex: number, previousBriefs: string[] = []) => {
    const requestPrompt = buildExhibitionCreativeBriefPrompt({
      spaceType,
      projectTheme,
      inspiration,
      documentSummary,
      insertItems: selectedInsertIds,
      insertItemOptions: insertOptions,
      excludeItems: selectedExcludeIds,
      excludeItemOptions: excludeOptions,
      roundIndex,
      total: generationCount,
      previousBriefs,
      regenerateEachTime,
    });
    const response = await generateLlm({
      model: llmModel,
      llmKeyId: activeLlmConfig?.id,
      temperature: 0.8,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content: '你是资深展陈策划、空间创意总监和室内效果图提示词专家。你只输出可用于图生图的中文创意描述。',
        },
        {
          role: 'user',
          content: requestPrompt,
        },
      ] as any,
    });
    const nextBrief = normalizeExhibitionCreativeBrief(response.content);
    if (!nextBrief) throw new Error('LLM 未返回有效创意描述');
    return nextBrief;
  }, [
    activeLlmConfig?.id,
    documentSummary,
    excludeOptions,
    generationCount,
    inspiration,
    llmModel,
    projectTheme,
    regenerateEachTime,
    insertOptions,
    selectedExcludeIds,
    selectedInsertIds,
    spaceType,
  ]);

  const generateCreativeOnly = useCallback(async () => {
    if (isReadonly || busy) return;
    update({ status: 'creative', progress: '创意描述中', error: '' });
    try {
      const nextBrief = await buildCreativeBrief(1, []);
      update({
        creativeBrief: nextBrief,
        lastCreativeBriefs: [nextBrief],
        status: 'success',
        progress: '',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      throw error;
    }
  }, [buildCreativeBrief, busy, isReadonly, update]);

  const summarizeDocument = useCallback(async (textOverride?: string, rethrow = false) => {
    if (isReadonly || busy) return;
    const text = String(textOverride ?? sourceText).trim();
    if (!text) {
      update({ status: 'error', error: '请先导入文档或粘贴资料原文' });
      return;
    }
    update({ status: 'summarizing', progress: '资料总结中', error: '' });
    try {
      const response = await generateLlm({
        model: documentLlmModel,
        llmKeyId: activeDocumentLlmConfig?.id,
        temperature: 0.25,
        max_tokens: 1400,
        messages: [
          {
            role: 'system',
            content: '你是展陈策划资料整理助手。请把项目资料总结成可供空间创意使用的高密度中文摘要。',
          },
          {
            role: 'user',
            content: [
              '请总结以下展陈项目资料，供序厅、尾厅、重点展项空间的创意生图使用。',
              '输出 5 到 9 条要点，覆盖：项目主题、核心叙事、关键内容/展项、情绪基调、可转化为空间装置或视觉符号的元素、必须避免误读的事实。',
              '只输出中文要点，不要 Markdown 表格，不要泛泛而谈。',
              '',
              text.slice(0, 50000),
            ].join('\n'),
          },
        ],
      });
      const summary = String(response.content || '').trim();
      if (!summary) throw new Error('LLM 未返回有效资料摘要');
      update({
        documentSummary: summary,
        status: 'success',
        progress: '',
        error: '',
        summarizedAt: Date.now(),
      });
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      if (rethrow) throw error;
    }
  }, [
    activeDocumentLlmConfig?.id,
    busy,
    documentLlmModel,
    isReadonly,
    sourceText,
    update,
  ]);

  const pickDocument = useCallback(async (file?: File) => {
    if (!file || isReadonly || busy) return;
    if (file.size > 10 * 1024 * 1024) {
      update({ status: 'error', error: '文档不能超过 10MB' });
      return;
    }
    update({ status: 'extracting', progress: '文档解析中', error: '' });
    try {
      const extracted = await extractDocument(file);
      const { text, ...documentMeta } = extracted;
      update({
        documentMeta,
        sourceText: text,
        documentSummary: '',
        status: 'summarizing',
        progress: '资料总结中',
        error: '',
      });
      await summarizeDocument(text);
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '文档解析失败', progress: '' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [busy, isReadonly, summarizeDocument, update]);

  const generateOneImage = useCallback(async ({
    brief,
    imagePrompt,
    runSeed,
    roundIndex,
  }: {
    brief: string;
    imagePrompt: string;
    runSeed: number;
    roundIndex: number;
  }): Promise<{ urls: string[]; taskId?: string }> => {
    const referenceImages = spaceImage ? [spaceImage] : [];
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'exhibition-creative-image',
      seed: runSeed,
      nodeTitle: `展陈创意生图 ${roundIndex}/${generationCount}`,
    };
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
        providerParams,
        historyContext,
        async: true,
      });
      if ((!res.imageUrls?.length) && res.taskId && (res.code === 'running' || res.status === 'running')) {
        let pollingTaskId = res.taskId;
        for (let i = 0; i < EXTERNAL_IMAGE_MAX_POLLS; i += 1) {
          if (pollAbortRef.current) throw new Error('任务已取消');
          await new Promise((resolve) => setTimeout(resolve, EXTERNAL_IMAGE_POLL_INTERVAL_MS));
          res = await queryExternalImageStatus({
            providerId: providerSelection.provider.id,
            providerModel: externalProviderModel,
            taskId: pollingTaskId,
            outputFormat,
          });
          pollingTaskId = res.taskId || pollingTaskId;
          update({ taskId: pollingTaskId, progress: `${roundIndex}/${generationCount} · ${Math.min(99, Math.round(((i + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%` });
          if (res.imageUrls?.length || (res.code && res.code !== 'running')) break;
        }
      }
      const urls = res.imageUrls || [];
      if (!urls.length) throw new Error('扩展平台完成但未返回图片');
      return { urls, taskId: res.taskId };
    }

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
    if (submit.sync && submit.urls?.length) {
      return { urls: submit.urls };
    }
    if (!submit.taskId) throw new Error('未获取到任务 ID');
    let lastProgress = submit.progress || '5%';
    update({ taskId: submit.taskId, progress: `${roundIndex}/${generationCount} · ${lastProgress}` });
    for (let index = 0; index < 1800; index += 1) {
      if (pollAbortRef.current) throw new Error('任务已取消');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const q = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
      if (q.progress && q.progress !== lastProgress) {
        lastProgress = q.progress;
        update({ progress: `${roundIndex}/${generationCount} · ${q.progress}` });
      }
      const statusText = String(q.status || '').toLowerCase();
      if (statusText === 'completed' || statusText === 'success' || statusText === 'done') {
        const url = q.urls?.[0];
        if (!url) throw new Error('任务完成但未返回图片');
        return { urls: q.urls || [url], taskId: submit.taskId };
      }
      if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') {
        throw new Error(q.error || '任务失败');
      }
    }
    throw new Error('轮询超时');
  }, [
    activeCanvasId,
    apiModel,
    aspectRatio,
    d.providerParams,
    externalProviderModel,
    generationCount,
    id,
    isExternalSelected,
    modelDef.id,
    modelDef.paramKind,
    outputFormat,
    providerSelection.provider,
    sizeLevel,
    spaceImage,
    update,
  ]);

  const runGenerate = useCallback(async () => {
    if (isReadonly) return;
    if (!spaceImage && !hasManualSpaceSize) {
      const msg = '请先连接一张室内建筑空间图，或填写完整的宽度、进深和高度';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    const src = `exhibition-creative-image:${id.slice(0, 6)}`;
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    update({
      status: 'generating',
      progress: `0/${generationCount}`,
      error: '',
      usedI2I: !!spaceImage,
      creativeResults: [],
      imageUrls: [],
    });
    const results: CreativeResult[] = [];
    const briefs: string[] = [];
    const imageUrls: string[] = [];
    try {
      let sharedBrief = creativeBrief;
      if (!regenerateEachTime) {
        if (!sharedBrief) {
          update({ progress: `创意描述 1/${generationCount}` });
          try {
            sharedBrief = await buildCreativeBrief(1, []);
          } catch (error: any) {
            const reason = llmErrorMessage(error);
            logBus.warn(`展陈创意描述失败，改用本地兜底描述: ${reason}`, src);
            sharedBrief = fallbackCreativeBrief({
              spaceType,
              projectTheme,
              inspiration,
              documentSummary,
              insertItemsText: exhibitionCreativeInsertItemsText(selectedInsertIds, insertOptions),
              excludeItemsText: exhibitionCreativeExcludeItemsText(selectedExcludeIds, excludeOptions),
              roundIndex: 1,
              total: generationCount,
            });
            update({ progress: `创意描述降级 1/${generationCount}` });
          }
          update({ creativeBrief: sharedBrief });
        }
        briefs.push(sharedBrief);
        update({ lastCreativeBriefs: briefs.slice() });
      }

      for (let index = 1; index <= generationCount; index += 1) {
        const nextSeed = seed > 0 && generationCount === 1 ? seed : randomImageSeed();
        let brief = sharedBrief;
        if (regenerateEachTime) {
          try {
            brief = await buildCreativeBrief(index, briefs);
          } catch (error: any) {
            const reason = llmErrorMessage(error);
            logBus.warn(`展陈创意描述失败，改用本地兜底描述: ${index}/${generationCount} ${reason}`, src);
            brief = fallbackCreativeBrief({
              spaceType,
              projectTheme,
              inspiration,
              documentSummary,
              insertItemsText: exhibitionCreativeInsertItemsText(selectedInsertIds, insertOptions),
              excludeItemsText: exhibitionCreativeExcludeItemsText(selectedExcludeIds, excludeOptions),
              roundIndex: index,
              total: generationCount,
            });
            update({ progress: `创意描述降级 ${index}/${generationCount}` });
          }
        }
        if (!brief) throw new Error('缺少有效创意描述');
        if (regenerateEachTime) {
          briefs.push(brief);
          update({ creativeBrief: brief, lastCreativeBriefs: briefs.slice(), progress: `创意描述 ${index}/${generationCount}` });
        }
        const imagePrompt = buildExhibitionCreativeImagePrompt({
          spaceType,
          projectTheme,
          inspiration,
          documentSummary,
          creativeBrief: brief,
          insertItems: selectedInsertIds,
          insertItemOptions: insertOptions,
          excludeItems: selectedExcludeIds,
          excludeItemOptions: excludeOptions,
          hasSpaceImage: !!spaceImage,
          spaceSize: manualSpaceSize,
          roundIndex: index,
          total: generationCount,
        });
        update({ lastPrompt: imagePrompt, lastSeed: nextSeed, progress: `提交生图 ${index}/${generationCount}` });
        logBus.info(`展陈创意生图提交: ${index}/${generationCount} seed=${nextSeed}`, src);
        const res = await generateOneImage({
          brief,
          imagePrompt,
          runSeed: nextSeed,
          roundIndex: index,
        });
        const url = res.urls[0];
        const nextResult = {
          index,
          brief,
          prompt: imagePrompt,
          imageUrl: url,
          seed: nextSeed,
          taskId: res.taskId,
        };
        results.push(nextResult);
        imageUrls.push(...res.urls.filter(Boolean));
        update({
          creativeResults: results.slice(),
          imageUrl: url,
          imageUrls: imageUrls.slice(),
          prompt: imagePrompt,
          outputText: imagePrompt,
          text: imagePrompt,
          progress: `${index}/${generationCount} 完成`,
        });
      }
      update({
        status: 'success',
        progress: '100%',
        creativeResults: results,
        imageUrl: imageUrls[imageUrls.length - 1] || '',
        imageUrls,
        lastCreativeBriefs: briefs,
        usedI2I: !!spaceImage,
        error: '',
      });
      logBus.success(`展陈创意生图完成: ${imageUrls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      logBus.error(`展陈创意生图失败: ${msg}`, src);
      update({ status: 'error', error: msg, progress: '' });
      throw error;
    }
  }, [
    buildCreativeBrief,
    creativeBrief,
    documentSummary,
    excludeOptions,
    generateOneImage,
    generationCount,
    hasManualSpaceSize,
    id,
    insertOptions,
    inspiration,
    isReadonly,
    manualSpaceSize,
    projectTheme,
    regenerateEachTime,
    selectedExcludeIds,
    selectedInsertIds,
    seed,
    spaceImage,
    spaceType,
    update,
  ]);

  useRunTrigger(id, runGenerate, 'image');

  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      className={`relative w-[780px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!bg-cyan-300 !border-0" />
      <Handle id="space" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-cyan-300" style={{ top: '30%' }} />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <Layers3 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">展陈创意生图</div>
          <div className="truncate text-[10px] text-white/45">单空间图 / LLM 创意 / 多次图生图</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan grid max-h-[760px] grid-cols-2 items-start gap-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && (
          <div className="col-span-2 rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">
            当前画布为只读，仅可查看结果。
          </div>
        )}
        {d.error && (
          <div className="col-span-2 rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">
            {d.error}
          </div>
        )}

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <ImageIcon size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">室内建筑空间输入</span>
          </div>
          {spaceImage ? (
            <div className="rounded border border-white/10 bg-black/20 p-2">
              <img src={spaceImage} alt="" className="h-44 w-full rounded border border-white/10 object-contain" draggable={false} />
              <div className="mt-1 truncate text-[10px] text-white/40" title={spaceImage}>{spaceImage.split('/').pop() || spaceImage}</div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-white/15 p-2">
              <div className="py-6 text-center text-[10px] text-white/35">
                连接一张图像作为室内空间骨架，或填写下方尺寸进行无图生图
              </div>
              <div className="grid grid-cols-3 gap-1">
                <input
                  className={FIELD}
                  type="number"
                  min={0}
                  step={0.1}
                  value={manualSpaceSize.width || ''}
                  disabled={isReadonly || busy}
                  placeholder="宽度 m"
                  onChange={(event) => update({ manualSpaceSize: { ...manualSpaceSize, width: normalizeSpaceDimensionInput(event.target.value) } })}
                />
                <input
                  className={FIELD}
                  type="number"
                  min={0}
                  step={0.1}
                  value={manualSpaceSize.depth || ''}
                  disabled={isReadonly || busy}
                  placeholder="进深 m"
                  onChange={(event) => update({ manualSpaceSize: { ...manualSpaceSize, depth: normalizeSpaceDimensionInput(event.target.value) } })}
                />
                <input
                  className={FIELD}
                  type="number"
                  min={0}
                  step={0.1}
                  value={manualSpaceSize.height || ''}
                  disabled={isReadonly || busy}
                  placeholder="高度 m"
                  onChange={(event) => update({ manualSpaceSize: { ...manualSpaceSize, height: normalizeSpaceDimensionInput(event.target.value) } })}
                />
              </div>
              <div className="mt-1 text-[9px] leading-snug text-white/35">
                无图时按该尺寸控制空间体量，空间结构可自由发挥。
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1">
            {EXHIBITION_CREATIVE_SPACE_TYPES.map((item) => {
              const active = item.id === spaceType;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isReadonly || busy}
                  className={`rounded border px-1.5 py-1 text-[10px] ${
                    active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  } disabled:opacity-50`}
                  onClick={() => update({ spaceType: item.id })}
                  title={item.prompt}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <input
            className={FIELD}
            value={projectTheme}
            disabled={isReadonly || busy}
            placeholder="项目主题 / 展览关键词"
            onChange={(event) => update({ projectTheme: event.target.value })}
          />
          <textarea
            className={`${FIELD} min-h-[78px] resize-y`}
            value={inspiration}
            disabled={isReadonly || busy}
            placeholder="个人灵感：想要的情绪、装置、材料、互动、叙事方向"
            onChange={(event) => update({ inspiration: event.target.value })}
          />
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <FileText size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">创意资料文档</span>
            <button
              type="button"
              className={`${BUTTON} ml-auto`}
              disabled={isReadonly || busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={12} />
              导入
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
            <div className="text-[10px] text-amber-200/80">{d.documentMeta.warnings.join('；')}</div>
          )}
          <div className="grid grid-cols-2 gap-1">
            <select
              className={FIELD}
              disabled={isReadonly || busy}
              value={`llm-key:${activeDocumentLlmConfig?.id || 'default'}`}
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId.startsWith('llm-key:')) update({ documentLlmKeyId: nextId.slice(8), documentLlmModel: '' });
              }}
            >
              {llmConfigOptions.map((item) => <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
            </select>
            <input className={FIELD} disabled value={documentLlmModel} title="资料总结模型由所选 LLM 配置决定" />
          </div>
          <textarea
            className={`${FIELD} min-h-[72px] resize-y`}
            value={sourceText}
            disabled={isReadonly || busy}
            placeholder="导入 DOCX、文本型 PDF、TXT，或直接粘贴项目资料原文"
            onChange={(event) => update({ sourceText: event.target.value })}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={isReadonly || busy || !sourceText.trim()}
              onClick={() => void summarizeDocument()}
            >
              {contentBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {contentBusy ? (status === 'extracting' ? '解析中' : '总结中') : '总结资料'}
            </button>
            <span className="min-w-0 flex-1 truncate text-[10px] text-white/40">
              摘要会参与后续创意描述和生图 Prompt。
            </span>
          </div>
          <textarea
            className={`${FIELD} min-h-[92px] resize-y`}
            value={documentSummary}
            disabled={isReadonly || busy}
            placeholder="LLM 总结后的创意资料摘要，可手动调整"
            onChange={(event) => update({ documentSummary: event.target.value })}
          />
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <Brain size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">LLM 创意描述</span>
            <button
              type="button"
              className={`${BUTTON} ml-auto`}
              disabled={isReadonly || busy}
              onClick={() => void generateCreativeOnly()}
            >
              {status === 'creative' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              生成创意
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <select
              className={FIELD}
              disabled={isReadonly || busy}
              value={`llm-key:${activeLlmConfig?.id || 'default'}`}
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId.startsWith('llm-key:')) update({ llmKeyId: nextId.slice(8), llmModel: '' });
              }}
            >
              {llmConfigOptions.map((item) => <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
            </select>
            <input className={FIELD} disabled value={llmModel} title="模型由所选 LLM 配置决定" />
          </div>
          <textarea
            className={`${FIELD} min-h-[132px] resize-y`}
            value={creativeBrief}
            disabled={isReadonly || busy}
            placeholder="点击生成创意，或在这里手动微调 LLM 创意描述"
            onChange={(event) => update({ creativeBrief: event.target.value })}
          />
          <label className="flex items-center gap-1.5 text-[10px] text-white/60">
            <input
              type="checkbox"
              className="h-3 w-3 accent-cyan-300"
              checked={regenerateEachTime}
              disabled={isReadonly || busy}
              onChange={(event) => update({ regenerateEachTime: event.target.checked })}
            />
            每次生图前重新用 LLM 创意
          </label>
        </section>

        <section className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-cyan-100">植入项</span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-white/40">
                写入“需要在该空间内植入...”提示词
              </span>
              {canManageTeam && (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => setInsertEditorOpen((open) => !open)}
                >
                  {insertEditorOpen ? '收起' : '编辑'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {insertOptions.map((item) => {
                const active = selectedInsertIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isReadonly || busy}
                    className={`rounded border px-1.5 py-1 text-[10px] ${
                      active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                    } disabled:opacity-50`}
                    onClick={() => toggleInsertItem(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {canManageTeam && insertEditorOpen && (
              <div className="space-y-1.5 rounded border border-cyan-300/15 bg-cyan-300/5 p-2">
                <textarea
                  className={`${FIELD} min-h-[92px] resize-y`}
                  value={insertEditorValue}
                  disabled={insertSaving || busy}
                  placeholder="每行一个植入项，例如：大型雕塑"
                  onChange={(event) => setInsertEditorValue(event.target.value)}
                />
                {insertError && <div className="text-[10px] text-red-200">{insertError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={insertSaving || busy}
                    onClick={() => setInsertEditorOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={insertSaving || busy}
                    onClick={() => void saveInsertPresets()}
                  >
                    {insertSaving ? '保存中' : '保存'}
                  </button>
                </div>
              </div>
            )}
        </section>

        <section className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-cyan-100">排除项</span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-white/40">
                优先于 LLM 创意描述，强调不要出现
              </span>
              <button
                type="button"
                className={BUTTON}
                disabled={isReadonly || busy || excludeOptions.length === 0}
                onClick={() => void toggleAllExcludeItems()}
              >
                {allExcludeSelected ? '清空' : '全选'}
              </button>
              {canManageTeam && (
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => setExcludeEditorOpen((open) => !open)}
                >
                  {excludeEditorOpen ? '收起' : '编辑'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {excludeOptions.map((item) => {
                const active = selectedExcludeIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isReadonly || busy}
                    className={`rounded border px-1.5 py-1 text-[10px] ${
                      active ? 'border-rose-300/55 bg-rose-300/15 text-rose-100' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                    } disabled:opacity-50`}
                    onClick={() => toggleExcludeItem(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {canManageTeam && excludeEditorOpen && (
              <div className="space-y-1.5 rounded border border-rose-300/15 bg-rose-300/5 p-2">
                <textarea
                  className={`${FIELD} min-h-[92px] resize-y`}
                  value={excludeEditorValue}
                  disabled={excludeSaving || busy}
                  placeholder="每行一个排除项，例如：真实品牌标识"
                  onChange={(event) => setExcludeEditorValue(event.target.value)}
                />
                {excludeError && <div className="text-[10px] text-red-200">{excludeError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={excludeSaving || busy}
                    onClick={() => setExcludeEditorOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={excludeSaving || busy}
                    onClick={() => void saveExcludePresets()}
                  >
                    {excludeSaving ? '保存中' : '保存'}
                  </button>
                </div>
              </div>
            )}
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2 space-y-2">
          <div className="text-[11px] font-semibold text-cyan-100">模型与输出</div>
          {imageAdvancedProviders.length > 0 && (
            <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-2">
              <button
                type="button"
                onClick={() => update({ advancedProviderOpen: !d.advancedProviderOpen })}
                className="flex w-full items-center justify-between text-[10px] font-semibold text-white/70 hover:text-white"
              >
                <span>高级来源</span>
                <span>{isExternalSelected && providerSelection.provider ? providerSelection.provider.label : (allowZhenzhenFallback ? '默认百达工坊' : '请选择扩展平台')}</span>
              </button>
              {d.advancedProviderOpen && (
                <div className="space-y-2">
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
                    className={FIELD}
                  >
                    {allowZhenzhenFallback && <option value="zhenzhen">百达工坊（默认）</option>}
                    {imageAdvancedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
                  </select>
                  {isExternalSelected && providerSelection.provider && (
                    <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy} onChange={(event) => update({ providerModel: event.target.value })}>
                      {externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  )}
                  {savedExternalMissing && (
                    <div className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                      当前画布记录的扩展平台未启用或不存在，已临时回到默认来源。
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isExternalSelected && (
            <div>
              <label className="mb-1 block text-[10px] text-white/50">模型</label>
              <div
                className={`flex gap-0.5 rounded p-0.5 ${isPixel ? '' : 'bg-white/5'}`}
                style={isPixel ? { background: 'var(--px-muted)', border: '1.5px solid var(--px-ink)' } : undefined}
              >
                {availableModelDefs.map((item) => {
                  const active = item.id === model;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isReadonly || busy}
                      onClick={() => update({ model: item.id, apiModel: item.apiModel, aspectRatio: item.defaultAspectRatio, sizeLevel: item.defaultSize || '2K' })}
                      title={item.description}
                      className={`flex-1 rounded py-1 text-[10px] font-semibold transition-all ${active ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {item.tabLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isExternalSelected && (
            <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(event) => update({ apiModel: event.target.value })}>
              {modelDef.apiModelOptions
                .filter((item) => !item.value.includes('-fal'))
                .map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          )}

          <div className="grid grid-cols-2 gap-1">
            <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
              {(modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
              {(isExternalSelected ? EXTERNAL_SIZE_LEVELS : (modelDef.sizes.length ? modelDef.sizes : EXTERNAL_SIZE_LEVELS)).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(event) => update({ outputFormat: event.target.value })}>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
            </select>
            <input
              className={FIELD}
              type="number"
              min={0}
              step={1}
              value={seed}
              disabled={isReadonly || busy}
              placeholder="Seed"
              title="多张生成时每张会自动记录随机 Seed；单张可使用指定 Seed"
              onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[10px] text-white/60">
              <span>生图数量</span>
              <input
                className="h-7 w-16 rounded border border-white/10 bg-black/20 px-2 text-center text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55"
                type="number"
                min={MIN_GENERATION_COUNT}
                max={MAX_GENERATION_COUNT}
                step={1}
                value={generationCount}
                disabled={isReadonly || busy}
                onChange={(event) => update({ generationCount: normalizeExhibitionCreativeCount(event.target.value) })}
              />
            </div>
            <input
              type="range"
              min={MIN_GENERATION_COUNT}
              max={MAX_GENERATION_COUNT}
              step={1}
              value={generationCount}
              disabled={isReadonly || busy}
              className="h-1 w-full accent-cyan-300"
              onChange={(event) => update({ generationCount: normalizeExhibitionCreativeCount(event.target.value) })}
            />
          </div>
        </section>

        <section className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
            <Clipboard size={13} />
            <span>当前生图 Prompt</span>
            <button type="button" className="ml-auto flex h-6 items-center gap-1 rounded border border-white/10 px-2 text-[10px] text-white/65 hover:bg-white/10" onClick={() => navigator.clipboard?.writeText(previewPrompt).catch(() => {})}>
              复制
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">{previewPrompt}</div>
        </section>

        {creativeResults.length > 0 && (
          <section className="col-span-2 rounded border border-white/10 bg-white/[0.035] p-2">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
              <CheckCircle2 size={13} />
              <span>生成结果</span>
              <span className="ml-auto text-[10px] font-normal text-white/45">{creativeResults.length} 张</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {creativeResults.map((item) => (
                <div key={`${item.index}:${item.imageUrl}`} className="rounded border border-white/10 bg-black/20 p-1.5">
                  <img src={item.imageUrl} alt="" className="h-32 w-full rounded border border-white/10 object-contain" draggable={false} />
                  <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-white/45">
                    <span>#{item.index}</span>
                    <span>Seed {item.seed || '-'}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[9px] leading-snug text-white/55" title={item.brief}>{item.brief}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <button
          type="button"
          className="col-span-2 flex h-8 w-full items-center justify-center gap-1.5 rounded border border-cyan-300/30 bg-cyan-300/15 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isReadonly || busy || (!spaceImage && !hasManualSpaceSize)}
          onClick={() => void runGenerate()}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {isGenerating ? `生成中 ${d.progress || ''}` : status === 'creative' ? '创意描述中' : `生成 ${generationCount} 张创意方案`}
        </button>
        {!spaceImage && (
          <div className="col-span-2 text-[10px] text-white/35">
            未连接空间图时，需要填写完整的宽度、进深和高度。
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ExhibitionCreativeImageNode);
