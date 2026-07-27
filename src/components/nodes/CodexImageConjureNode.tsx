import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import SmartImage from '../SmartImage';
import {
  Archive,
  Copy,
  Download,
  FileDown,
  FileUp,
  ImagePlus,
  Library,
  ListChecks,
  Loader2,
  PackagePlus,
  Play,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import * as api from '../../services/api';
import { getCodexCliStatus, type CodexCliStatus } from '../../services/codexCli';
import { publishCodexImageConjureResult, streamCodexImageConjure, type CodexImageConjureResult } from '../../services/codexImageConjure';
import { getQoderCliStatus } from '../../services/qoderCli';
import { publishQoderImageResult, streamQoderImageConjure } from '../../services/qoderImageConjure';
import { generateExternalImage, queryExternalImageStatus } from '../../services/generation';
import { PORT_COLOR } from '../../config/portTypes';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useThemeStore } from '../../stores/theme';
import {
  DEFAULT_CODEX_IMAGE_TEMPLATES,
  buildCodexImageConjurePrompt,
  createCodexImageConjureTask,
  deleteCodexImageSnippet,
  deleteCodexImageTemplate,
  enqueueCodexImageConjureTasks,
  exportCodexImagePromptPack,
  importCodexImagePromptPack,
  normalizeCodexImagePromptState,
  trimCodexImageConjureHistory,
  updateCodexImageConjureTask,
  upsertCodexImageSnippet,
  upsertCodexImageTemplate,
  type CodexImageConjureTask,
  type CodexImagePromptSnippet,
  type CodexImagePromptState,
  type CodexImagePromptTemplate,
} from '../../utils/codexImageConjure';
import MentionPromptInput from './MentionPromptInput';
import MaterialPreviewSection from './MaterialPreviewSection';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import { useOrderedMaterials } from './useOrderedMaterials';
import {
  countExcludedMaterials,
  excludeMaterialId,
  filterExcludedMaterials,
  normalizeExcludedMaterialIds,
} from '../../utils/materialExclusion';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';

const STORAGE_KEY = 't8.codexImageConjure.prompts.v1';
const QODER_STORAGE_KEY = 't8.qoderImageConjure.prompts.v1';
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const EXTERNAL_IMAGE_POLL_TIMEOUT_SECONDS = 3600;

type CodexConjureSource = 'codex-cli' | 'external-image';

const minExternalPollCount = (intervalMs: number) =>
  Math.ceil((EXTERNAL_IMAGE_POLL_TIMEOUT_SECONDS * 1000) / Math.max(1, intervalMs));

const CODEX_CONJURE_MODELS = [
  { value: 'gpt-5.5', label: 'GPT-5.5（推荐）' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: '', label: '默认模型' },
];

type PanelKey = 'queue' | 'gallery' | 'template' | 'snippet' | 'settings';

const PANEL_TABS: Array<{ key: PanelKey; label: string }> = [
  { key: 'queue', label: '任务队列' },
  { key: 'gallery', label: '公共图库' },
  { key: 'template', label: '模板工坊' },
  { key: 'snippet', label: '片段工坊' },
  { key: 'settings', label: '设置' },
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

function initialPromptState(storageKey = STORAGE_KEY): CodexImagePromptState {
  if (typeof window === 'undefined') {
    return normalizeCodexImagePromptState({ templates: DEFAULT_CODEX_IMAGE_TEMPLATES });
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) return normalizeCodexImagePromptState(JSON.parse(raw));
  } catch {
    // ignore corrupted local prompt pack
  }
  return normalizeCodexImagePromptState({ templates: DEFAULT_CODEX_IMAGE_TEMPLATES });
}

function savePromptState(state: CodexImagePromptState, storageKey = STORAGE_KEY) {
  if (typeof window === 'undefined') return;
  const pack = exportCodexImagePromptPack(state);
  window.localStorage.setItem(storageKey, JSON.stringify(storageKey === QODER_STORAGE_KEY
    ? { ...pack, schema: 't8-qoder-image-conjure-prompts' }
    : pack));
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fileNameFromUrl(url: string) {
  try {
    return decodeURIComponent(url.split('?')[0].split('/').pop() || url).slice(0, 72);
  } catch {
    return (url.split('?')[0].split('/').pop() || url).slice(0, 72);
  }
}

function materialKey(material: Material) {
  return `${material.kind}:${material.url}`;
}

function resultImageUrls(result?: CodexImageConjureResult | null) {
  return unique([...(Array.isArray(result?.imageUrls) ? result.imageUrls : []), result?.imageUrl || '']);
}

function resultArray<T>(result: api.Result<T[]>): T[] {
  return result.success && Array.isArray(result.data) ? result.data : [];
}

function normalizeTasks(value: unknown): CodexImageConjureTask[] {
  if (!Array.isArray(value)) return [];
  return value.map((task) => createCodexImageConjureTask(task)).slice(0, 80);
}

function taskStatusLabel(task: CodexImageConjureTask) {
  if (task.status === 'queued') return '待运行';
  if (task.status === 'running') return '生成中';
  if (task.status === 'completed') return '已完成';
  if (task.status === 'cancelled') return '已取消';
  return '失败';
}

function compactText(value: string, max = 72) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned;
}

export type ImageConjureRuntime = 'codex' | 'qoder';

function runtimeKey(key: string, runtime: ImageConjureRuntime) {
  if (runtime !== 'qoder') return key;
  if (key === 'codexExecutablePath') return 'qoderExecutablePath';
  if (key === 'codexConjureModel') return 'qoderModel';
  if (key.startsWith('codexConjure')) return `qoderConjure${key.slice('codexConjure'.length)}`;
  return key;
}

export const CodexImageConjureNode = ({ id, data, selected, runtime = 'codex' }: NodeProps & { runtime?: ImageConjureRuntime }) => {
  const isQoder = runtime === 'qoder';
  const sourceData = data as any;
  const d = useMemo(() => new Proxy(sourceData, {
    get(target, property) {
      return typeof property === 'string' ? target[runtimeKey(property, runtime)] : target[property as any];
    },
  }), [runtime, sourceData]);
  const rawUpdate = useUpdateNodeData(id);
  const update = useCallback((patch: Record<string, any>) => {
    if (!isQoder) return rawUpdate(patch);
    return rawUpdate(Object.fromEntries(Object.entries(patch).map(([key, value]) => [runtimeKey(key, runtime), value])));
  }, [isQoder, rawUpdate, runtime]);
  const { theme, style } = useThemeStore();
  const advancedProviders = useApiKeysStore((s) => s.settings.advancedProviders);
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const upstream = useUpstreamMaterials(id);
  const importRef = useRef<HTMLInputElement | null>(null);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const tasksRef = useRef<CodexImageConjureTask[]>([]);
  const [status, setStatus] = useState<CodexCliStatus | null>(null);
  const [promptState, setPromptState] = useState<CodexImagePromptState>(() => initialPromptState(isQoder ? QODER_STORAGE_KEY : STORAGE_KEY));
  const [galleryItems, setGalleryItems] = useState<api.ResourceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [panel, setPanel] = useState<PanelKey>('queue');
  const [templateDraft, setTemplateDraft] = useState({
    id: '',
    title: '',
    shortTitle: '',
    category: '常用',
    content: '',
    notes: '',
    tags: '',
  });
  const [snippetDraft, setSnippetDraft] = useState({
    id: '',
    tag: '',
    title: '',
    category: '常用',
    content: '',
  });

  const prompt = String(d.codexConjurePrompt || '');
  const mentions: MediaMention[] = Array.isArray(d.codexConjurePromptMentions) ? d.codexConjurePromptMentions : [];
  const galleryRefs: string[] = Array.isArray(d.codexConjureGalleryRefs) ? d.codexConjureGalleryRefs : [];
  const tasks = useMemo(() => trimCodexImageConjureHistory(normalizeTasks(d.codexConjureTasks), 30), [d.codexConjureTasks]);
  const latestResult = d.codexConjureLastResult as CodexImageConjureResult | undefined;
  const latestUrls = resultImageUrls(latestResult);
  const count = clampNumber(d.codexConjureCount, 1, 4, 1);
  const batchCount = clampNumber(d.codexConjureBatchCount, 1, 20, 1);
  const concurrency = clampNumber(d.codexConjureConcurrency, 1, 4, 1);
  const autoPublish = d.codexConjureAutoPublish !== false;
  const persistPrompt = Boolean(d.codexConjurePersistPrompt);
  const persistRefs = d.codexConjurePersistRefs !== false;
  const conjureSource: CodexConjureSource = !isQoder && d.codexConjureSource === 'external-image' ? 'external-image' : 'codex-cli';
  const isExternalSource = conjureSource === 'external-image';
  const imageAdvancedProviders = useMemo(
    () => advancedProvidersForNode(advancedProviders, 'image'),
    [advancedProviders],
  );
  const providerSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'image', {
      providerSource: d.providerSource,
      providerId: d.providerId,
      providerModel: d.providerModel,
    }),
    [advancedProviders, d.providerSource, d.providerId, d.providerModel],
  );
  const activeExternalSelection = useMemo(() => {
    if (providerSelection.available) return providerSelection;
    const provider = imageAdvancedProviders[0];
    if (!provider) return providerSelection;
    const models = advancedProviderModelOptions(provider, 'image');
    return {
      providerSource: provider.protocol,
      providerId: provider.id,
      providerModel: models[0] || '',
      provider,
      available: !!models[0],
    };
  }, [imageAdvancedProviders, providerSelection]);
  const isExternalReady = (isExternalSource || isQoder) && activeExternalSelection.available && !!activeExternalSelection.provider;
  const externalModelOptions = activeExternalSelection.provider
    ? advancedProviderModelOptions(activeExternalSelection.provider, 'image')
    : [];
  const externalProviderModel = activeExternalSelection.providerModel || externalModelOptions[0] || '';

  useEffect(() => {
    if (!isQoder || !activeExternalSelection.available || !activeExternalSelection.provider) return;
    if (
      d.providerSource === activeExternalSelection.providerSource
      && d.providerId === activeExternalSelection.providerId
      && d.providerModel === externalProviderModel
    ) return;
    update({
      providerSource: activeExternalSelection.providerSource,
      providerId: activeExternalSelection.providerId,
      providerModel: externalProviderModel,
    });
  }, [activeExternalSelection.available, activeExternalSelection.provider, activeExternalSelection.providerId, activeExternalSelection.providerSource, d.providerId, d.providerModel, d.providerSource, externalProviderModel, isQoder, update]);
  const materialOrder: string[] = Array.isArray(d.codexConjureMaterialOrder) ? d.codexConjureMaterialOrder : [];
  const excludedMaterialIds = useMemo(
    () => normalizeExcludedMaterialIds(d.codexConjureExcludedMaterialIds),
    [d.codexConjureExcludedMaterialIds],
  );

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const galleryMaterials = useMemo<Material[]>(() => (
    galleryRefs.map((url, index) => ({
      id: `gallery:${index}:${url}`,
      kind: 'image' as const,
      url,
      sourceNodeId: id,
      origin: 'local' as const,
      label: fileNameFromUrl(url),
    }))
  ), [galleryRefs, id]);
  const visibleUpstreamTexts = useMemo(
    () => filterExcludedMaterials(upstream.texts, excludedMaterialIds),
    [upstream.texts, excludedMaterialIds],
  );
  const visibleUpstreamImages = useMemo(
    () => filterExcludedMaterials(upstream.images, excludedMaterialIds),
    [upstream.images, excludedMaterialIds],
  );
  const inputImageMaterials = useMemo(
    () => [...visibleUpstreamImages, ...galleryMaterials],
    [galleryMaterials, visibleUpstreamImages],
  );
  const orderedInputImages = useOrderedMaterials(inputImageMaterials, materialOrder);
  const orderedInputTexts = useOrderedMaterials(visibleUpstreamTexts, materialOrder);
  const excludedUpstreamCount = useMemo(
    () => countExcludedMaterials(excludedMaterialIds, [...upstream.texts, ...upstream.images]),
    [excludedMaterialIds, upstream.texts, upstream.images],
  );
  const setMaterialOrder = useCallback((nextOrder: string[]) => update({ codexConjureMaterialOrder: nextOrder }), [update]);
  const excludeUpstreamMaterial = useCallback((material: Material) => {
    if (material.origin !== 'upstream') return;
    update({
      codexConjureExcludedMaterialIds: excludeMaterialId(excludedMaterialIds, material.id),
      codexConjureMaterialOrder: materialOrder.filter((itemId) => itemId !== material.id),
    });
  }, [excludedMaterialIds, materialOrder, update]);
  const removeGalleryMaterial = useCallback((material: Material) => {
    if (material.origin !== 'local') return;
    update({
      codexConjureGalleryRefs: galleryRefs.filter((url) => url !== material.url),
      codexConjureMaterialOrder: materialOrder.filter((itemId) => itemId !== material.id),
    });
  }, [galleryRefs, materialOrder, update]);
  const restoreExcludedMaterials = useCallback(() => update({ codexConjureExcludedMaterialIds: [] }), [update]);

  const mentionMaterials = useMemo<Material[]>(() => {
    const all = [...orderedInputTexts, ...orderedInputImages];
    const seen = new Set<string>();
    return all.filter((item) => {
      const key = materialKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [orderedInputImages, orderedInputTexts]);

  const selectedTemplate = useMemo(
    () => promptState.templates.find((item) => item.id === d.codexConjureTemplateId) || promptState.templates[0] || null,
    [d.codexConjureTemplateId, promptState.templates],
  );

  const filteredSnippets = useMemo(() => {
    const query = String(d.codexConjureSnippetQuery || '').trim().replace(/^~+/, '').toLowerCase();
    const pool = promptState.snippets;
    if (!query) return pool.slice(0, 12);
    return pool
      .filter((item) => `${item.tag} ${item.title} ${item.category} ${item.content}`.toLowerCase().includes(query))
      .slice(0, 12);
  }, [d.codexConjureSnippetQuery, promptState.snippets]);

  const accent = isPixel ? 'var(--px-cyan)' : isDark ? '#38bdf8' : '#0284c7';
  const bg = isPixel ? 'var(--px-surface)' : isDark ? 'rgba(8,13,28,0.97)' : '#f8fdff';
  const surface = isPixel ? 'var(--px-muted)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(14,165,233,0.08)';
  const surfaceStrong = isPixel ? 'var(--px-yellow)' : isDark ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.16)';
  const text = isPixel ? 'var(--px-ink)' : isDark ? '#ecfeff' : '#0f172a';
  const subText = isPixel ? 'var(--px-ink-soft)' : isDark ? 'rgba(236,254,255,0.68)' : '#4b6475';
  const border = isPixel ? 'var(--px-ink)' : isDark ? 'rgba(125,211,252,0.28)' : 'rgba(2,132,199,0.25)';

  const rootStyle: CSSProperties = {
    width: 520,
    background: bg,
    color: text,
    border: `2px solid ${selected ? accent : border}`,
    borderRadius: isPixel ? 8 : 18,
    boxShadow: isPixel ? '4px 4px 0 var(--px-ink)' : '0 18px 50px rgba(2, 8, 23, 0.32)',
    overflow: 'visible',
  };

  const cardStyle: CSSProperties = {
    border: `1px solid ${border}`,
    background: surface,
    borderRadius: isPixel ? 6 : 14,
  };

  const inputStyle: CSSProperties = {
    border: `1px solid ${border}`,
    background: isDark ? 'rgba(2,6,23,0.75)' : '#ffffff',
    color: text,
    borderRadius: isPixel ? 4 : 10,
  };

  const buttonStyle: CSSProperties = {
    border: `1px solid ${border}`,
    background: surfaceStrong,
    color: text,
    borderRadius: isPixel ? 4 : 10,
  };

  const setTasks = useCallback((next: CodexImageConjureTask[]) => {
    const trimmed = trimCodexImageConjureHistory(next, 30);
    tasksRef.current = trimmed;
    update({ codexConjureTasks: trimmed });
  }, [update]);

  const patchTask = useCallback((taskId: string, patch: Partial<CodexImageConjureTask>) => {
    setTasks(updateCodexImageConjureTask(tasksRef.current, taskId, patch));
  }, [setTasks]);

  const refreshStatus = useCallback(async () => {
    if (isExternalSource && !isQoder) {
      setStatus(null);
      return;
    }
    try {
      if (isQoder) {
        const next = await getQoderCliStatus(String(d.codexExecutablePath || ''));
        setStatus(next);
      } else {
        const next = await getCodexCliStatus(String(d.codexExecutablePath || ''));
        setStatus(next);
      }
    } catch (error: any) {
      setStatus({ available: false, message: error?.message || `${isQoder ? 'Qoder' : 'Codex'} CLI 状态检查失败` });
    }
  }, [d.codexExecutablePath, isExternalSource, isQoder]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    let alive = true;
    api.getResourceItems({ kind: 'image', q: String(d.codexConjureGalleryQuery || '') })
      .then((result) => {
        if (alive) setGalleryItems(resultArray(result).slice(0, 10));
      })
      .catch(() => {
        if (alive) setGalleryItems([]);
      });
    return () => {
      alive = false;
    };
  }, [d.codexConjureGalleryQuery]);

  const applyPromptState = useCallback((next: CodexImagePromptState) => {
    setPromptState(next);
    savePromptState(next, isQoder ? QODER_STORAGE_KEY : STORAGE_KEY);
  }, [isQoder]);

  const importPromptPack = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const textValue = await file.text();
      const parsed = JSON.parse(textValue);
      const next = importCodexImagePromptPack(parsed, promptState);
      applyPromptState(next);
      update({ codexConjureLastRunSummary: `已导入 ${next.templates.length} 个模板、${next.snippets.length} 个片段` });
    } catch (error: any) {
      update({ error: error?.message || '导入失败' });
    }
  }, [applyPromptState, promptState, update]);

  const exportPromptPack = useCallback(() => {
    const pack = exportCodexImagePromptPack(promptState);
    downloadJsonFile(isQoder ? 'qoder-image-conjure-prompts.json' : 'codex-image-conjure-prompts.json', isQoder
      ? { ...pack, schema: 't8-qoder-image-conjure-prompts' }
      : pack);
  }, [promptState]);

  const applyTemplate = useCallback((templateId: string) => {
    const template = promptState.templates.find((item) => item.id === templateId);
    update({
      codexConjureTemplateId: templateId,
      codexConjurePrompt: template?.content || prompt,
      codexConjurePromptMentions: [],
    });
  }, [prompt, promptState.templates, update]);

  const loadTemplateDraft = useCallback((template?: CodexImagePromptTemplate | null) => {
    setTemplateDraft({
      id: template?.id || '',
      title: template?.title || '',
      shortTitle: template?.shortTitle || '',
      category: template?.category || '常用',
      content: template?.content || '',
      notes: template?.notes || '',
      tags: template?.tags?.join(', ') || '',
    });
    setPanel('template');
  }, []);

  const saveTemplateDraft = useCallback(() => {
    if (!templateDraft.title.trim() || !templateDraft.content.trim()) {
      update({ error: '模板需要名称和提示词内容。' });
      return;
    }
    const next = upsertCodexImageTemplate(promptState, {
      id: templateDraft.id,
      title: templateDraft.title,
      shortTitle: templateDraft.shortTitle || templateDraft.title,
      category: templateDraft.category || '常用',
      content: templateDraft.content,
      notes: templateDraft.notes,
      tags: templateDraft.tags.split(/[,\s，、]+/).filter(Boolean),
      mode: 'any',
      modelHint: 'gpt-image-2',
    });
    applyPromptState(next);
    const saved = next.templates.find((item) => item.title === templateDraft.title);
    update({ codexConjureTemplateId: saved?.id || d.codexConjureTemplateId, codexConjureLastRunSummary: '模板已保存，可在下拉列表中选择。' });
  }, [applyPromptState, d.codexConjureTemplateId, promptState, templateDraft, update]);

  const removeTemplateDraft = useCallback(() => {
    const targetId = templateDraft.id || selectedTemplate?.id;
    if (!targetId) return;
    const next = deleteCodexImageTemplate(promptState, targetId);
    applyPromptState(next);
    setTemplateDraft({ id: '', title: '', shortTitle: '', category: '常用', content: '', notes: '', tags: '' });
    update({ codexConjureTemplateId: next.templates[0]?.id || '', codexConjureLastRunSummary: '模板已删除。' });
  }, [applyPromptState, promptState, selectedTemplate?.id, templateDraft.id, update]);

  const saveSnippetDraft = useCallback(() => {
    if (!snippetDraft.tag.trim() || !snippetDraft.content.trim()) {
      update({ error: '片段需要触发词和内容。' });
      return;
    }
    const next = upsertCodexImageSnippet(promptState, {
      id: snippetDraft.id,
      tag: snippetDraft.tag,
      title: snippetDraft.title || snippetDraft.tag,
      category: snippetDraft.category || '常用',
      content: snippetDraft.content,
    });
    applyPromptState(next);
    update({ codexConjureLastRunSummary: '片段已保存，可用 ~tag 插入。' });
  }, [applyPromptState, promptState, snippetDraft, update]);

  const removeSnippetDraft = useCallback((snippet?: CodexImagePromptSnippet) => {
    const target = snippet?.tag || snippetDraft.tag || snippetDraft.id;
    if (!target) return;
    const next = deleteCodexImageSnippet(promptState, target);
    applyPromptState(next);
    if (!snippet) setSnippetDraft({ id: '', tag: '', title: '', category: '常用', content: '' });
    update({ codexConjureLastRunSummary: '片段已删除。' });
  }, [applyPromptState, promptState, snippetDraft.id, snippetDraft.tag, update]);

  const insertSnippet = useCallback((tag: string) => {
    const next = prompt ? `${prompt.trim()} ~${tag}` : `~${tag}`;
    update({ codexConjurePrompt: next });
  }, [prompt, update]);

  const toggleGalleryRef = useCallback((url: string) => {
    const next = galleryRefs.includes(url) ? galleryRefs.filter((item) => item !== url) : [...galleryRefs, url];
    update({ codexConjureGalleryRefs: next.slice(0, 12), codexConjureLastRunSummary: galleryRefs.includes(url) ? '已移除参考图。' : '已加入参考图。' });
  }, [galleryRefs, update]);

  const buildCurrentTaskInput = useCallback(() => {
    const upstreamTexts = orderedInputTexts.map((item) => item.url).filter(Boolean);
    const resolvedLocal = resolveMediaMentions(prompt, mentions, mentionMaterials).trim();
    const mentionedImageUrls = mentions.filter((mention) => mention.kind === 'image').map((mention) => mention.url);
    const imageRefs = unique([
      ...mentionedImageUrls,
      ...orderedInputImages.map((item) => item.url),
    ]);
    const promptBody = buildCodexImageConjurePrompt({
      upstreamTexts,
      templateNotes: selectedTemplate?.notes || '',
      prompt: resolvedLocal,
      snippets: promptState.snippets,
      negativePrompt: String(d.codexConjureNegativePrompt || ''),
      outputSettings: {
        model: String(d.codexConjureModel || (isQoder ? '' : 'gpt-5.5')),
        size: String(d.codexConjureSize || '2K'),
        aspectRatio: String(d.codexConjureAspectRatio || '9:16'),
        quality: String(d.codexConjureQuality || '高'),
        count,
        promptMode: String(d.codexConjurePromptMode || '原始模式'),
        format: String(d.codexConjureFormat || 'png'),
        background: String(d.codexConjureBackground || '自动'),
      },
    });
    const referenceInstruction = imageRefs.length
      ? `参考图要求: 已附加 ${imageRefs.length} 张参考图。生成时必须优先继承参考图中的主体身份、构图关系、色彩线索和材质细节；如果用户要求变体，也要保持与参考图的可识别关联。`
      : '';
    return {
      prompt: [referenceInstruction, promptBody].filter(Boolean).join('\n\n').trim(),
      images: imageRefs,
      source: conjureSource,
      model: String(d.codexConjureModel || (isQoder ? '' : 'gpt-5.5')),
      size: String(d.codexConjureSize || '2K'),
      aspectRatio: String(d.codexConjureAspectRatio || '9:16'),
      quality: String(d.codexConjureQuality || '高'),
      count,
      providerSource: (isExternalSource || isQoder) ? activeExternalSelection.providerSource : undefined,
      providerId: (isExternalSource || isQoder) ? activeExternalSelection.providerId : undefined,
      providerModel: (isExternalSource || isQoder) ? externalProviderModel : undefined,
      providerParams: (isExternalSource || isQoder) && d.providerParams && typeof d.providerParams === 'object' && !Array.isArray(d.providerParams)
        ? { ...d.providerParams }
        : undefined,
    };
  }, [activeExternalSelection.providerId, activeExternalSelection.providerSource, conjureSource, count, d.codexConjureAspectRatio, d.codexConjureBackground, d.codexConjureFormat, d.codexConjureModel, d.codexConjureNegativePrompt, d.codexConjurePromptMode, d.codexConjureQuality, d.codexConjureSize, d.providerParams, externalProviderModel, isExternalSource, isQoder, mentionMaterials, mentions, orderedInputImages, orderedInputTexts, prompt, promptState.snippets, selectedTemplate?.notes]);

  const addLatestToLibrary = useCallback(async () => {
    const url = latestUrls[0];
    if (!url) return;
    try {
      const added = await api.addResourceItem({
        url,
        kind: 'image',
        title: fileNameFromUrl(url),
        tags: [isQoder ? 'qoder' : 'codex', 'conjure'],
        sourceNodeId: id,
      });
      if (!added.success) throw new Error(added.error || '入库失败');
      update({ codexConjureLastRunSummary: '已入库到资源库图像素材' });
      void api.getResourceItems({ kind: 'image', q: String(d.codexConjureGalleryQuery || '') }).then((result) => setGalleryItems(resultArray(result).slice(0, 10)));
    } catch (error: any) {
      update({ error: error?.message || '入库失败' });
    }
  }, [d.codexConjureGalleryQuery, id, isQoder, latestUrls, update]);

  const runTask = useCallback(async (task: CodexImageConjureTask) => {
    const controller = new AbortController();
    controllersRef.current.set(task.id, controller);
    let reply = '';
    const taskSource = task.source === 'external-image' ? 'external-image' : 'codex-cli';
    patchTask(task.id, { status: 'running', progressText: isQoder ? 'Qoder 正在调用扩展平台…' : (taskSource === 'external-image' ? '扩展 API 正在生成...' : 'Codex 正在生成...'), startedAt: new Date().toISOString(), error: '' });
    setStreamText('');
    try {
      let result: CodexImageConjureResult;
      if (isQoder) {
        if (!task.providerId || !task.providerModel) {
          throw new Error('请先在 API 设置中启用支持图像生成的扩展平台，并选择平台与模型。');
        }
        const outputFormat = String(d.codexConjureFormat || 'png').toLowerCase() === 'jpg' ? 'jpg' : 'png';
        result = await streamQoderImageConjure({
          nodeId: id,
          nodeTitle: String(d.label || 'Qoder 生图工作台'),
          prompt: task.prompt,
          images: task.images,
          model: String(d.codexConjureModel || ''),
          executablePath: String(d.codexExecutablePath || ''),
          providerSource: task.providerSource || '',
          providerId: task.providerId,
          providerModel: task.providerModel,
          providerParams: task.providerParams,
          negativePrompt: String(d.codexConjureNegativePrompt || '').trim() || undefined,
          size: externalImageSizeFor(task.aspectRatio, task.size),
          imageSize: task.size,
          aspectRatio: task.aspectRatio,
          quality: task.quality,
          count: task.count,
          outputFormat,
        }, {
          signal: controller.signal,
          onDelta: (delta) => {
            reply += delta;
            setStreamText((prev) => `${prev}${delta}`);
          },
        }) as CodexImageConjureResult;
      } else if (taskSource === 'external-image') {
        if (!task.providerId || !task.providerModel) {
          throw new Error('请先在 API 设置中启用支持图像生成的扩展平台，并在节点中选择平台与模型。');
        }
        const providerParams = task.providerParams && typeof task.providerParams === 'object' && !Array.isArray(task.providerParams)
          ? { ...task.providerParams }
          : {};
        const outputFormat = String(d.codexConjureFormat || 'png').toLowerCase() === 'jpg' ? 'jpg' : 'png';
        let externalResult = await generateExternalImage({
          providerId: task.providerId,
          providerModel: task.providerModel,
          model: task.providerModel,
          prompt: task.prompt,
          size: externalImageSizeFor(task.aspectRatio, task.size),
          aspect_ratio: task.aspectRatio,
          image_size: task.size,
          images: task.images,
          negativePrompt: String(d.codexConjureNegativePrompt || '').trim() || undefined,
          negative: String(d.codexConjureNegativePrompt || '').trim() || undefined,
          n: task.count,
          outputFormat,
          providerParams,
          historyContext: {
            sourceNodeId: id,
            sourceNodeType: 'codex-image-conjure',
            nodeTitle: String(d.label || 'Codex 生图工作台'),
          },
          async: true,
        });
        if ((!externalResult.imageUrls?.length) && externalResult.taskId && (externalResult.code === 'running' || externalResult.status === 'running')) {
          let pollingTaskId = externalResult.taskId;
          const maxPoll = minExternalPollCount(EXTERNAL_IMAGE_POLL_INTERVAL_MS);
          for (let i = 0; i < maxPoll; i += 1) {
            if (controller.signal.aborted) {
              const abortError = new Error('用户停止');
              abortError.name = 'AbortError';
              throw abortError;
            }
            await new Promise((resolve) => setTimeout(resolve, EXTERNAL_IMAGE_POLL_INTERVAL_MS));
            externalResult = await queryExternalImageStatus({
              providerId: task.providerId,
              providerModel: task.providerModel,
              taskId: pollingTaskId,
              outputFormat,
              historyContext: {
                sourceNodeId: id,
                sourceNodeType: 'codex-image-conjure',
                nodeTitle: String(d.label || 'Codex 生图工作台'),
              },
            });
            pollingTaskId = externalResult.taskId || pollingTaskId;
            patchTask(task.id, { progressText: `扩展 API 轮询中 ${Math.min(99, Math.round(((i + 1) / maxPoll) * 100))}%` });
            if (externalResult.imageUrls?.length || (externalResult.code && externalResult.code !== 'running')) break;
          }
        }
        if (!externalResult.imageUrls?.length) throw new Error(externalResult.error || '扩展平台完成但未返回图片');
        result = {
          imageUrl: externalResult.imageUrls[0] || '',
          imageUrls: externalResult.imageUrls,
          text: externalResult.text || '',
          reply: externalResult.text || '',
          artifacts: externalResult.imageUrls.map((url, index) => ({
            id: `external-image-${task.id}-${index}`,
            kind: 'image' as const,
            title: `扩展 API 图像 ${index + 1}`,
            url,
            urls: [url],
            status: 'completed',
          })),
          provider: externalResult.provider,
          taskId: externalResult.taskId,
          raw: externalResult.raw,
        } as CodexImageConjureResult;
      } else {
        result = await streamCodexImageConjure(
          {
            nodeId: id,
            prompt: task.prompt,
            images: task.images,
            selectedSkillNames: ['imagegen'],
            model: task.model,
            size: task.size,
            aspectRatio: task.aspectRatio,
            quality: task.quality,
            count: task.count,
            executablePath: String(d.codexExecutablePath || ''),
          },
          {
            signal: controller.signal,
            onDelta: (delta) => {
              reply += delta;
              setStreamText((prev) => `${prev}${delta}`);
            },
          },
        );
      }
      const published = (isQoder
        ? publishQoderImageResult(result as any, { maxImages: task.count })
        : publishCodexImageConjureResult(result, { maxImages: task.count })) as CodexImageConjureResult;
      const canvasPublished = (isQoder
        ? publishQoderImageResult(result as any, { maxImages: task.count, includeText: false })
        : publishCodexImageConjureResult(result, { maxImages: task.count, includeText: false })) as CodexImageConjureResult;
      patchTask(task.id, {
        status: 'completed',
        progressText: `完成 ${published.imageUrls.length} 张`,
        resultImageUrls: published.imageUrls,
        resultText: published.outputText || reply,
        completedAt: new Date().toISOString(),
      });
      update({
        status: 'success',
        error: '',
        codexConjureLastResult: published,
        codexConjureLastRunSummary: `已生成 ${published.imageUrls.length} 张图像${autoPublish ? '，并发布到输出素材' : ''}`,
        ...(autoPublish ? {
          imageUrl: canvasPublished.imageUrl,
          imageUrls: canvasPublished.imageUrls,
          outputText: canvasPublished.outputText,
        } : {}),
        ...(persistPrompt ? {} : { codexConjurePrompt: '', codexConjurePromptMentions: [] }),
        ...(persistRefs ? {} : { codexConjureGalleryRefs: [] }),
      });
      return published;
    } catch (error: any) {
      const aborted = error?.name === 'AbortError';
      patchTask(task.id, {
        status: aborted ? 'cancelled' : 'failed',
        error: aborted ? '用户停止' : (error?.message || '生成失败'),
        progressText: aborted ? '已停止' : '失败',
        completedAt: new Date().toISOString(),
      });
      if (!aborted) {
        update({ status: 'error', error: error?.message || '生成失败' });
      }
      return null;
    } finally {
      controllersRef.current.delete(task.id);
    }
  }, [autoPublish, d.codexConjureFormat, d.codexConjureModel, d.codexConjureNegativePrompt, d.codexExecutablePath, d.label, id, isQoder, patchTask, persistPrompt, persistRefs, update]);

  const handleGenerate = useCallback(async () => {
    if (busy) return;
    const input = buildCurrentTaskInput();
    if (!input.prompt) {
      update({ error: '请填写提示词，或连接上游文本节点。' });
      return;
    }
    if ((input.source === 'external-image' || isQoder) && (!input.providerId || !input.providerModel)) {
      update({ status: 'error', error: '请先在 API 设置中启用支持图像生成的扩展平台，并在节点设置中选择平台与模型。' });
      return;
    }
    const task = createCodexImageConjureTask(input);
    setTasks([...tasksRef.current, task]);
    setBusy(true);
    update({ status: 'running', error: '', codexConjureLastRunSummary: isQoder ? 'Qoder 正在调用扩展平台生成图像...' : (input.source === 'external-image' ? '扩展 API 正在生成图像...' : 'Codex 正在生成图像...') });
    try {
      await runTask(task);
    } finally {
      setBusy(false);
    }
  }, [buildCurrentTaskInput, busy, isQoder, runTask, setTasks, update]);

  const addToQueue = useCallback(() => {
    const input = buildCurrentTaskInput();
    if (!input.prompt) {
      update({ error: '请填写提示词，或连接上游文本节点。' });
      return;
    }
    if ((input.source === 'external-image' || isQoder) && (!input.providerId || !input.providerModel)) {
      update({ status: 'error', error: '请先在 API 设置中启用支持图像生成的扩展平台，并在节点设置中选择平台与模型。' });
      return;
    }
    const next = enqueueCodexImageConjureTasks(tasksRef.current, input, batchCount);
    setTasks(next);
    setPanel('queue');
    update({ codexConjureLastRunSummary: `已加入 ${batchCount} 个任务到队列。` });
  }, [batchCount, buildCurrentTaskInput, isQoder, setTasks, update]);

  const runQueue = useCallback(async () => {
    if (busy) return;
    let pending = tasksRef.current.filter((task) => task.status === 'queued');
    if (!pending.length) {
      const input = buildCurrentTaskInput();
      if (!input.prompt) {
        update({ error: '请填写提示词，或连接上游文本节点。' });
        return;
      }
      if ((input.source === 'external-image' || isQoder) && (!input.providerId || !input.providerModel)) {
        update({ status: 'error', error: '请先在 API 设置中启用支持图像生成的扩展平台，并在节点设置中选择平台与模型。' });
        return;
      }
      const next = enqueueCodexImageConjureTasks(tasksRef.current, input, batchCount);
      setTasks(next);
      pending = next.filter((task) => task.status === 'queued');
    }
    setBusy(true);
    update({ status: 'running', error: '', codexConjureLastRunSummary: `队列启动：${pending.length} 个任务，并发 ${concurrency}` });
    try {
      while (pending.length) {
        const batch = pending.slice(0, concurrency);
        await Promise.all(batch.map((task) => runTask(task)));
        pending = tasksRef.current.filter((task) => task.status === 'queued');
        if (!pending.length) break;
      }
      update({ status: 'success', codexConjureLastRunSummary: '任务队列已完成。' });
    } finally {
      setBusy(false);
    }
  }, [batchCount, buildCurrentTaskInput, busy, concurrency, isQoder, runTask, setTasks, update]);

  const handleStop = useCallback(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    const cancelled = tasksRef.current.map((task) => (task.status === 'running' || task.status === 'queued'
      ? createCodexImageConjureTask({ ...task, status: 'cancelled', progressText: '已停止', completedAt: new Date().toISOString() })
      : task));
    setTasks(cancelled);
    setBusy(false);
    update({ status: 'idle', codexConjureLastRunSummary: '已停止生成' });
  }, [setTasks, update]);

  const clearFinishedTasks = useCallback(() => {
    setTasks(tasksRef.current.filter((task) => task.status === 'queued' || task.status === 'running'));
  }, [setTasks]);

  const createVariant = useCallback(() => {
    const url = latestUrls[0];
    update({
      codexConjureGalleryRefs: url ? unique([...galleryRefs, url]).slice(0, 12) : galleryRefs,
      codexConjurePrompt: prompt ? `${prompt}\n\n变体：保持核心主体和风格，换一个构图、光线或背景方案。` : '变体：保持核心主体和风格，换一个构图、光线或背景方案。',
      codexConjureLastRunSummary: '已准备变体提示词。',
    });
  }, [galleryRefs, latestUrls, prompt, update]);

  useRunTrigger(id, async () => {
    if (!busy) await handleGenerate();
  }, isQoder ? 'qoder-image-conjure' : 'codex-image-conjure');

  const statusText = isQoder
    ? (!status?.available
      ? (status?.message || '正在检查 Qoder CLI')
      : (isExternalReady && activeExternalSelection.provider
        ? `Qoder ${status.version || ''} · ${activeExternalSelection.provider.label || activeExternalSelection.provider.id} · ${externalProviderModel}`.trim()
        : 'Qoder CLI 可用；请在 API 设置中启用支持图像生成的扩展平台'))
    : isExternalSource
    ? (isExternalReady && activeExternalSelection.provider
      ? `扩展 API 已就绪：${activeExternalSelection.provider.label || activeExternalSelection.provider.id} · ${externalProviderModel || '默认模型'}`
      : '请先在 API 设置中启用支持图像生成的扩展平台')
    : (status?.available ? (status.version ? `Codex ${status.version}` : 'Codex 已就绪') : (status?.message || '正在检查 Codex CLI'));
  const statusReady = isQoder ? (!!status?.available && isExternalReady) : (isExternalSource ? isExternalReady : !!status?.available);
  const statusTitle = isQoder
    ? (statusReady ? 'Qoder 与扩展平台已就绪' : 'Qoder / 扩展平台检查')
    : (isExternalSource ? (isExternalReady ? '扩展 API 已就绪' : '扩展 API 未配置') : (status?.available ? 'Codex 已就绪' : '登录 / 路径检查'));
  const headerSubtitle = isQoder
    ? 'Qoder CLI · 扩展平台生图 · 队列/模板/图库'
    : isExternalSource
    ? '扩展 API · 图像模型 · 队列/模板/片段/公共图库'
    : 'Codex CLI · imagegen · 队列/模板/片段/公共图库';
  const queuedCount = tasks.filter((task) => task.status === 'queued').length;
  const runningCount = tasks.filter((task) => task.status === 'running').length;
  const completedCount = tasks.filter((task) => task.status === 'completed').length;

  const renderPanel = () => {
    if (panel === 'gallery') {
      return (
        <section className="space-y-2 p-3" style={cardStyle}>
          <div className="flex items-center gap-2 font-bold"><Library size={15} /> 公共图库</div>
          <div className="flex items-center gap-2 px-2 py-2" style={inputStyle}>
            <Search size={14} style={{ color: subText }} />
            <input
              className="nodrag min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={String(d.codexConjureGalleryQuery || '')}
              onChange={(event) => update({ codexConjureGalleryQuery: event.currentTarget.value })}
              placeholder="搜索资源库图片"
            />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {galleryItems.slice(0, 10).map((item) => {
              const url = item.thumbUrl || item.fileUrl;
              const active = galleryRefs.includes(item.fileUrl);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="nodrag group relative aspect-square overflow-hidden rounded-lg border"
                  style={{ borderColor: active ? accent : border, background: surface }}
                  onClick={() => toggleGalleryRef(item.fileUrl)}
                  title={active ? '移除参考' : '加入参考'}
                >
                  <SmartImage src={url} alt={item.title} className="h-full w-full object-cover" thumbSize={180} />
                  <span className="absolute inset-x-1 bottom-1 rounded px-1 py-0.5 text-[10px] font-bold" style={{ background: active ? accent : 'rgba(2,6,23,0.78)', color: active ? '#00111a' : '#fff' }}>
                    {active ? '移除参考' : '加入参考'}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="text-[11px]" style={{ color: subText }}>已选参考 {galleryRefs.length} 张，上游参考 {upstream.images.length} 张。</div>
        </section>
      );
    }

    if (panel === 'template') {
      return (
        <section className="space-y-2 p-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold">模板工坊</div>
            <button type="button" className="nodrag px-2 py-1 text-xs font-bold" style={buttonStyle} onClick={() => loadTemplateDraft(null)}>新建</button>
          </div>
          <select className="nodrag w-full px-2 py-2 text-sm font-bold outline-none" style={inputStyle} value={selectedTemplate?.id || ''} onChange={(event) => loadTemplateDraft(promptState.templates.find((item) => item.id === event.currentTarget.value))}>
            {promptState.templates.map((template) => <option key={template.id} value={template.id}>{template.category} · {template.title}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className="nodrag px-2 py-2 text-xs outline-none" style={inputStyle} value={templateDraft.title} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, title: event.currentTarget.value }))} placeholder="模板名称" />
            <input className="nodrag px-2 py-2 text-xs outline-none" style={inputStyle} value={templateDraft.category} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, category: event.currentTarget.value }))} placeholder="分类" />
            <input className="nodrag px-2 py-2 text-xs outline-none" style={inputStyle} value={templateDraft.shortTitle} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, shortTitle: event.currentTarget.value }))} placeholder="短标题" />
            <input className="nodrag px-2 py-2 text-xs outline-none" style={inputStyle} value={templateDraft.tags} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, tags: event.currentTarget.value }))} placeholder="标签，用逗号分隔" />
          </div>
          <textarea className="nodrag min-h-20 w-full resize-y px-2 py-2 text-xs outline-none" style={inputStyle} value={templateDraft.content} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, content: event.currentTarget.value }))} placeholder="模板提示词" />
          <textarea className="nodrag min-h-12 w-full resize-y px-2 py-2 text-xs outline-none" style={inputStyle} value={templateDraft.notes} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, notes: event.currentTarget.value }))} placeholder="用途说明" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={saveTemplateDraft}><Save size={14} /> 保存/重命名</button>
            <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={removeTemplateDraft}><Trash2 size={14} /> 删除</button>
          </div>
        </section>
      );
    }

    if (panel === 'snippet') {
      return (
        <section className="space-y-2 p-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold">片段工坊</div>
            <span className="text-[11px]" style={{ color: subText }}>输入 ~tag 快速展开</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-2" style={inputStyle}>
            <Search size={14} style={{ color: subText }} />
            <input className="nodrag min-w-0 flex-1 bg-transparent text-sm outline-none" value={String(d.codexConjureSnippetQuery || '')} onChange={(event) => update({ codexConjureSnippetQuery: event.currentTarget.value })} placeholder="搜索片段，例如 cinematic / product" />
          </div>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-auto pr-1">
            {filteredSnippets.map((snippet) => (
              <button key={snippet.tag} type="button" className="nodrag rounded-full px-2 py-1 text-[11px] font-bold" style={buttonStyle} onClick={() => {
                setSnippetDraft({ id: snippet.id, tag: snippet.tag, title: snippet.title, category: snippet.category, content: snippet.content });
                insertSnippet(snippet.tag);
              }}>
                ~{snippet.tag}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="nodrag px-2 py-2 text-xs outline-none" style={inputStyle} value={snippetDraft.tag} onChange={(event) => setSnippetDraft((prev) => ({ ...prev, tag: event.currentTarget.value }))} placeholder="tag，不用写 ~" />
            <input className="nodrag px-2 py-2 text-xs outline-none" style={inputStyle} value={snippetDraft.category} onChange={(event) => setSnippetDraft((prev) => ({ ...prev, category: event.currentTarget.value }))} placeholder="分类" />
            <input className="nodrag col-span-2 px-2 py-2 text-xs outline-none" style={inputStyle} value={snippetDraft.title} onChange={(event) => setSnippetDraft((prev) => ({ ...prev, title: event.currentTarget.value }))} placeholder="片段名称" />
          </div>
          <textarea className="nodrag min-h-16 w-full resize-y px-2 py-2 text-xs outline-none" style={inputStyle} value={snippetDraft.content} onChange={(event) => setSnippetDraft((prev) => ({ ...prev, content: event.currentTarget.value }))} placeholder="片段内容" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={saveSnippetDraft}><Save size={14} /> 保存/重命名</button>
            <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={() => removeSnippetDraft()}><Trash2 size={14} /> 删除</button>
          </div>
        </section>
      );
    }

    if (panel === 'settings') {
      return (
        <section className="space-y-2 p-3" style={cardStyle}>
          <div className="font-bold">工作台设置</div>
          <div className="grid grid-cols-2 gap-2">
            {!isQoder && <label className="col-span-2 space-y-1 text-[11px] font-bold">
              <span>生成来源</span>
              <select
                data-codex-conjure-source
                className="nodrag w-full px-2 py-2 text-xs font-bold outline-none"
                style={inputStyle}
                value={conjureSource}
                onChange={(event) => {
                  const nextSource = event.currentTarget.value === 'external-image' ? 'external-image' : 'codex-cli';
                  const patch: Record<string, any> = { codexConjureSource: nextSource };
                  if (nextSource === 'external-image' && !providerSelection.available && imageAdvancedProviders[0]) {
                    const provider = imageAdvancedProviders[0];
                    patch.providerSource = provider.protocol;
                    patch.providerId = provider.id;
                    patch.providerModel = advancedProviderModelOptions(provider, 'image')[0] || '';
                  }
                  update(patch);
                }}
              >
                <option value="codex-cli">Codex CLI / imagegen</option>
                <option value="external-image">扩展 API 生图</option>
              </select>
            </label>}
            {(isExternalSource || isQoder) && (
              <div data-codex-conjure-external-provider data-qoder-conjure-external-provider={isQoder || undefined} className="col-span-2 grid grid-cols-2 gap-2">
                {imageAdvancedProviders.length > 0 ? (
                  <>
                    <label className="space-y-1 text-[11px] font-bold">
                      <span>扩展平台</span>
                      <select
                        className="nodrag w-full px-2 py-2 text-xs font-bold outline-none"
                        style={inputStyle}
                        value={activeExternalSelection.providerId}
                        onChange={(event) => {
                          const provider = imageAdvancedProviders.find((item) => item.id === event.currentTarget.value);
                          if (!provider) return;
                          const nextModels = advancedProviderModelOptions(provider, 'image');
                          update({
                            providerSource: provider.protocol,
                            providerId: provider.id,
                            providerModel: nextModels[0] || '',
                          });
                        }}
                      >
                        {imageAdvancedProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-[11px] font-bold">
                      <span>{isQoder ? '生图模型' : '外部模型'}</span>
                      <select
                        className="nodrag w-full px-2 py-2 text-xs font-bold outline-none"
                        style={inputStyle}
                        value={externalProviderModel}
                        onChange={(event) => update({ providerModel: event.currentTarget.value })}
                      >
                        {externalModelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                      </select>
                    </label>
                  </>
                ) : (
                  <div className="col-span-2 rounded-lg px-2 py-2 text-xs font-bold" style={{ ...inputStyle, color: subText }}>
                    请先在 API 设置中启用支持图像生成的扩展平台
                  </div>
                )}
              </div>
            )}
            {isQoder && (
              <label className="col-span-2 space-y-1 text-[11px] font-bold">
                <span>Qoder CLI 路径（留空自动探测）</span>
                <input
                  className="nodrag w-full px-2 py-2 text-xs outline-none"
                  style={inputStyle}
                  value={String(d.codexExecutablePath || '')}
                  onChange={(event) => update({ codexExecutablePath: event.currentTarget.value })}
                  placeholder="C:\\Users\\...\\.qoder\\bin\\qodercli\\qodercli.exe"
                />
              </label>
            )}
            <label className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold" style={inputStyle}>
              <input type="checkbox" checked={autoPublish} onChange={(event) => update({ codexConjureAutoPublish: event.currentTarget.checked })} /> 自动发布
            </label>
            <label className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold" style={inputStyle}>
              <input type="checkbox" checked={persistPrompt} onChange={(event) => update({ codexConjurePersistPrompt: event.currentTarget.checked })} /> 提示词持久化
            </label>
            <label className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold" style={inputStyle}>
              <input type="checkbox" checked={persistRefs} onChange={(event) => update({ codexConjurePersistRefs: event.currentTarget.checked })} /> 素材持久化
            </label>
            <select className="nodrag px-2 py-2 text-xs font-bold outline-none" style={inputStyle} value={String(d.codexConjurePromptMode || '原始模式')} onChange={(event) => update({ codexConjurePromptMode: event.currentTarget.value })}>
              {['原始模式', '保真模式', '创意模式'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <textarea className="nodrag min-h-16 w-full resize-y px-2 py-2 text-xs outline-none" style={inputStyle} value={String(d.codexConjureNegativePrompt || '')} onChange={(event) => update({ codexConjureNegativePrompt: event.currentTarget.value })} placeholder="Negative prompt，可选" />
          <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={importPromptPack} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={() => importRef.current?.click()}><FileUp size={14} /> 导入</button>
            <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={exportPromptPack}><FileDown size={14} /> 导出</button>
          </div>
        </section>
      );
    }

    return (
      <section className="space-y-2 p-3" style={cardStyle}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold"><ListChecks size={15} /> 任务队列 / 历史</div>
          <span className="text-[11px]" style={{ color: subText }}>待 {queuedCount} · 运行 {runningCount} · 完成 {completedCount}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="nodrag px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={addToQueue}>加入队列</button>
          <button type="button" className="nodrag px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={() => void runQueue()} disabled={busy}>开始队列</button>
          <button type="button" className="nodrag px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={clearFinishedTasks}>清空完成</button>
        </div>
        <div className="max-h-32 space-y-1 overflow-auto pr-1">
          {tasks.length === 0 && <div className="rounded-lg px-2 py-2 text-xs" style={{ ...inputStyle, color: subText }}>暂无队列任务，可直接生成或先加入队列。</div>}
          {tasks.slice(0, 8).map((task) => (
            <div key={task.id} className="rounded-lg px-2 py-1.5 text-xs" style={inputStyle}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">#{task.queueIndex} {taskStatusLabel(task)}</span>
                <span style={{ color: subText }}>{task.resultImageUrls.length ? `${task.resultImageUrls.length} 图` : task.size}</span>
              </div>
              <div className="truncate" style={{ color: subText }}>{task.error || task.progressText || compactText(task.prompt)}</div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div data-codex-image-conjure-root={!isQoder || undefined} data-qoder-image-conjure-root={isQoder || undefined} className="relative p-4 text-sm" style={rootStyle}>
      <Handle type="target" id="text" position={Position.Left} style={{ top: 180, background: PORT_COLOR.text }} />
      <Handle type="target" id="image" position={Position.Left} style={{ top: 220, background: PORT_COLOR.image }} />
      <Handle type="source" id="image" position={Position.Right} style={{ top: 196, background: PORT_COLOR.image }} />
      <Handle type="source" id="text" position={Position.Right} style={{ top: 236, background: PORT_COLOR.text }} />

      <header data-codex-image-conjure-drag-surface={!isQoder || undefined} data-qoder-image-conjure-drag-surface={isQoder || undefined} className="flex cursor-grab items-center gap-3 pb-3 active:cursor-grabbing">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: accent, color: isDark ? '#00111a' : '#fff' }}>
          <ImagePlus size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-black leading-tight">{isQoder ? 'Qoder 生图工作台' : 'Codex 生图工作台'}</div>
          <div className="truncate text-xs" style={{ color: subText }}>{headerSubtitle}</div>
        </div>
        {(!isExternalSource || isQoder) && (
          <button type="button" className="nodrag inline-flex items-center gap-1 px-2 py-1 text-xs font-bold" style={buttonStyle} onClick={() => void refreshStatus()}>
            <RefreshCw size={13} /> 刷新
          </button>
        )}
      </header>

      <div
        data-codex-image-conjure-body={!isQoder || undefined}
        data-qoder-image-conjure-body={isQoder || undefined}
        className="nowheel space-y-3 overflow-y-auto pr-1"
        style={{ maxHeight: 760 }}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        <section className="p-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold">{statusTitle}</div>
            <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: statusReady ? 'rgba(34,197,94,0.16)' : 'rgba(251,191,36,0.18)', color: statusReady ? '#22c55e' : '#f59e0b' }}>
              {statusReady ? '可生成' : '需确认'}
            </span>
          </div>
          <div className="mt-1 text-xs" style={{ color: subText }}>{statusText}</div>
        </section>

        <section className="grid grid-cols-2 gap-2 p-3" style={cardStyle}>
          <label className="col-span-2 text-xs font-bold">提示词模板</label>
          <select
            className="nodrag col-span-2 px-2 py-2 text-sm font-bold outline-none"
            style={inputStyle}
            value={selectedTemplate?.id || ''}
            onChange={(event) => applyTemplate(event.currentTarget.value)}
          >
            {promptState.templates.length === 0 && <option value="">暂无系统模板</option>}
            {promptState.templates.map((template) => (
              <option key={template.id} value={template.id}>{template.category} · {template.shortTitle || template.title}</option>
            ))}
          </select>
          {isQoder ? (
            <label className="space-y-1 text-[11px] font-bold">
              <span>Qoder Agent 模型</span>
              <input className="nodrag w-full px-2 py-2 text-sm outline-none" style={inputStyle} value={String(d.codexConjureModel || '')} onChange={(event) => update({ codexConjureModel: event.currentTarget.value })} placeholder="留空使用默认模型" />
            </label>
          ) : (
            <select
              className="nodrag px-2 py-2 text-sm font-bold outline-none"
              style={inputStyle}
              value={String(d.codexConjureModel || 'gpt-5.5')}
              onChange={(event) => update({ codexConjureModel: event.currentTarget.value })}
            >
              {CODEX_CONJURE_MODELS.map((model) => <option key={model.value || 'default'} value={model.value}>{model.label}</option>)}
            </select>
          )}
          <select
            className="nodrag px-2 py-2 text-sm font-bold outline-none"
            style={inputStyle}
            value={String(d.codexConjureAspectRatio || '9:16')}
            onChange={(event) => update({ codexConjureAspectRatio: event.currentTarget.value })}
          >
            {['1:1', '4:5', '3:4', '9:16', '16:9', '3:2', '21:9'].map((ratio) => <option key={ratio}>{ratio}</option>)}
          </select>
          <label className="space-y-1 text-[11px] font-bold">
            <span>尺寸</span>
            <select className="nodrag w-full px-2 py-2 text-sm font-bold outline-none" style={inputStyle} value={String(d.codexConjureSize || '2K')} onChange={(event) => update({ codexConjureSize: event.currentTarget.value })}>
              {['1K', '2K', '4K'].map((size) => <option key={size}>{size}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-bold">
            <span>质量</span>
            <select className="nodrag w-full px-2 py-2 text-sm font-bold outline-none" style={inputStyle} value={String(d.codexConjureQuality || '高')} onChange={(event) => update({ codexConjureQuality: event.currentTarget.value })}>
              {['自动', '低', '中', '高'].map((quality) => <option key={quality}>{quality}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-bold">
            <span>数量</span>
            <input className="nodrag w-full px-2 py-2 text-sm outline-none" style={inputStyle} type="number" min={1} max={4} value={count} onChange={(event) => update({ codexConjureCount: clampNumber(event.currentTarget.value, 1, 4, 1) })} />
          </label>
          <label className="space-y-1 text-[11px] font-bold">
            <span>并发</span>
            <input className="nodrag w-full px-2 py-2 text-sm outline-none" style={inputStyle} type="number" min={1} max={4} value={concurrency} onChange={(event) => update({ codexConjureConcurrency: clampNumber(event.currentTarget.value, 1, 4, 1) })} />
          </label>
        </section>

        {(orderedInputImages.length > 0 || excludedUpstreamCount > 0) && (
          <section data-codex-image-conjure-input-materials="true" data-qoder-image-conjure-input-materials={isQoder || undefined}>
            <MaterialPreviewSection
              texts={[]}
              images={orderedInputImages}
              videos={[]}
              audios={[]}
              order={materialOrder}
              onReorder={setMaterialOrder}
              onRemoveLocal={removeGalleryMaterial}
              onExcludeUpstream={excludeUpstreamMaterial}
              excludedCount={excludedUpstreamCount}
              onRestoreExcluded={restoreExcludedMaterials}
              selected={selected}
              isDark={isDark}
              isPixel={isPixel}
              title="输入参考图"
            />
          </section>
        )}

        <section className="p-2" style={{ ...cardStyle, borderColor: accent }}>
          <MentionPromptInput
            value={prompt}
            mentions={mentions}
            materials={mentionMaterials}
            onChange={(value, nextMentions) => update({ codexConjurePrompt: value, codexConjurePromptMentions: nextMentions })}
            onSubmit={() => void handleGenerate()}
            placeholder="描述要生成的图像；可用 @ 引用上游素材，也可写 ~cinematic 片段..."
            title="输入提示词 / 对话"
            promptTemplateKind="image"
            isDark={isDark}
            isPixel={isPixel}
            expandable
            className="rounded-lg px-2 py-2 text-sm outline-none"
            style={{ color: text, background: isDark ? 'rgba(2,6,23,0.76)' : '#ffffff', minHeight: 180, height: 180 }}
          />
          <div className="mt-2 text-[11px]" style={{ color: subText }}>
            参考图 {unique(orderedInputImages.map((item) => item.url)).length} 张 · 文本 {orderedInputTexts.length} 段 · Skill imagegen
          </div>
        </section>

        <nav className="grid grid-cols-5 gap-1">
          {PANEL_TABS.map((tab) => (
            <button key={tab.key} type="button" className="nodrag px-2 py-2 text-[11px] font-bold" style={{ ...buttonStyle, background: panel === tab.key ? accent : surfaceStrong, color: panel === tab.key && !isDark ? '#fff' : text }} onClick={() => setPanel(tab.key)}>
              {tab.label}
            </button>
          ))}
        </nav>

        {renderPanel()}

        <section className="p-3" style={cardStyle}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="font-bold">完成反馈</div>
            {busy && <Loader2 size={15} className="animate-spin" />}
          </div>
          <div className="min-h-10 text-xs leading-relaxed" style={{ color: subText }}>
            {d.error || d.codexConjureLastRunSummary || '生成后会直接发布到输出素材，不在节点内显示大预览图。'}
            {streamText && <div className="mt-1 line-clamp-3">{streamText}</div>}
          </div>
          {latestUrls.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={() => void addLatestToLibrary()}>
                <PackagePlus size={14} /> 入库
              </button>
              <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold" style={buttonStyle} onClick={createVariant}>
                <Archive size={14} /> 变体
              </button>
              <a className="nodrag inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-bold no-underline" style={buttonStyle} href={latestUrls[0]} download>
                <Download size={14} /> 下载
              </a>
            </div>
          )}
        </section>
      </div>

      <footer className="mt-3 flex items-center gap-2">
        {!busy ? (
          <button type="button" className="nodrag flex flex-1 items-center justify-center gap-2 px-4 py-3 text-base font-black" style={{ ...buttonStyle, background: `linear-gradient(180deg, ${surfaceStrong}, ${accent})`, color: isDark ? '#ecfeff' : '#ffffff' }} onClick={() => void handleGenerate()} disabled={isQoder && !statusReady}>
            <Play size={18} /> 开始生成
          </button>
        ) : (
          <button type="button" className="nodrag flex flex-1 items-center justify-center gap-2 px-4 py-3 text-base font-black" style={buttonStyle} onClick={handleStop}>
            <Square size={17} /> 停止
          </button>
        )}
        <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-3 py-3 text-xs font-bold" style={buttonStyle} onClick={() => void runQueue()} disabled={busy}>
          <ListChecks size={15} /> 队列
        </button>
        <button type="button" className="nodrag inline-flex items-center justify-center gap-1 px-3 py-3 text-xs font-bold" style={buttonStyle} onClick={() => navigator.clipboard?.writeText(prompt)}>
          <Copy size={15} /> 复制
        </button>
      </footer>

      <Sparkles className="pointer-events-none absolute right-4 top-16 opacity-20" size={30} style={{ color: accent }} />
    </div>
  );
};

export default memo(CodexImageConjureNode);
