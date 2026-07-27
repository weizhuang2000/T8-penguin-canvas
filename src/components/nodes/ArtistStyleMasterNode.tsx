import { Handle, Position, useNodeConnections, useNodesData, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import SmartImage from '../SmartImage';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileText,
  Filter,
  Image as ImageIcon,
  Images,
  Loader2,
  Palette,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { PORT_COLOR } from '../../config/portTypes';
import {
  ARTIST_STYLE_MASTER_ITEMS,
  ARTIST_STYLE_MASTER_MOVEMENTS,
} from '../../data/artistStyleMasterManifest';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { IMAGE_MODELS } from '../../providers/models';
import { generateExternalImage, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import { defaultSizeOf, placeSingleNode } from '../../utils/nodePlacement';
import {
  ARTIST_STYLE_MASTER_STORAGE_KEY,
  buildArtistStyleOutputPayload,
  buildArtistStylePrompt,
  buildArtistStyleRedrawPrompt,
  createArtistStyleExport,
  importArtistStyleExport,
  mergeArtistStyleLibraries,
  normalizeArtistStyleItem,
  normalizeArtistStyleLibrary,
  searchArtistStyles,
  slugifyArtistStyle,
  upsertArtistStyleInLibrary,
  type ArtistStyleCategory,
  type ArtistStyleItem,
  type ArtistStyleOutputMode,
  type ArtistStyleUserLibrary,
} from '../../utils/artistStyleMaster';
import { useUpdateNodeData } from './useUpdateNodeData';

const EMPTY_LIBRARY: ArtistStyleUserLibrary = { categories: [], styles: [] };
const EMPTY_CUSTOM_DRAFT = {
  name: '',
  chineseName: '',
  imageUrl: '',
  cue: '',
  category: '',
  tags: '',
};

const handleStyle = {
  width: 12,
  height: 12,
  border: '2px solid var(--asm-handle-border, #0f172a)',
  boxShadow: '0 0 0 2px var(--asm-bg, #fff7ed)',
};
const TEXT_INPUT_HANDLE_TITLE = '输入：上游文本会作为检索/创作语境';
const TEXT_OUTPUT_HANDLE_TITLE = '输出：风格提示词文本';
const ORIGINAL_IMAGE_HANDLE_TITLE = '输入：需要按所选艺术风格重绘的原始图像';
const IMAGE_OUTPUT_HANDLE_TITLE = '输出：风格参考图像或艺术风格重绘结果';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;

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
  push(data?.directImageUrl);
  for (const key of ['imageUrls', 'urls', 'generatedImages', 'directImageUrls', 'referenceImages']) {
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

function readLibrary(): ArtistStyleUserLibrary {
  if (typeof window === 'undefined') return EMPTY_LIBRARY;
  try {
    const raw = window.localStorage.getItem(ARTIST_STYLE_MASTER_STORAGE_KEY);
    if (!raw) return EMPTY_LIBRARY;
    return normalizeArtistStyleLibrary(JSON.parse(raw));
  } catch {
    return EMPTY_LIBRARY;
  }
}

function writeLibrary(library: ArtistStyleUserLibrary) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ARTIST_STYLE_MASTER_STORAGE_KEY, JSON.stringify(normalizeArtistStyleLibrary(library)));
}

function toSelectOptions(items: readonly { id: string; label?: string; labelZh?: string; name?: string }[]) {
  return items.map((item) => ({
    value: item.id,
    label: item.labelZh && item.label ? `${item.labelZh} / ${item.label}` : item.name || item.label || item.id,
  }));
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function stopCanvasWheel(event: React.WheelEvent) {
  event.stopPropagation();
}

function ArtistStyleMasterNode({ id, data, selected }: NodeProps) {
  const d = (data || {}) as any;
  const rf = useReactFlow();
  const update = useUpdateNodeData(id);
  const importRef = useRef<HTMLInputElement | null>(null);
  const customImageUploadRef = useRef<HTMLInputElement | null>(null);
  const pollAbortRef = useRef(false);
  const originalImage = useInputImageByHandle(id, 'original-image');
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const [library, setLibrary] = useState<ArtistStyleUserLibrary>(() => readLibrary());
  const [query, setQuery] = useState(String(d.artistStyleQuery || ''));
  const [movement, setMovement] = useState(String(d.artistStyleMovement || 'all'));
  const [category, setCategory] = useState(String(d.artistStyleCategory || 'all'));
  const [outputMode, setOutputMode] = useState<ArtistStyleOutputMode>(
    d.artistStyleOutputMode === 'image' ? 'image' : 'prompt',
  );
  const [selectedId, setSelectedId] = useState(String(d.artistStyleSelectedId || ARTIST_STYLE_MASTER_ITEMS[0]?.id || ''));
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renameCategoryId, setRenameCategoryId] = useState('');
  const [renameCategoryName, setRenameCategoryName] = useState('');
  const [customDraft, setCustomDraft] = useState(EMPTY_CUSTOM_DRAFT);
  const [editingStyleId, setEditingStyleId] = useState('');
  const [status, setStatus] = useState('选择一个风格，运行后输出提示词或参考图。');

  const nodeStatus = String(d.status || 'idle');
  const busy = nodeStatus === 'generating';
  const model = d.model || 'gpt-image-2';
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || '1:1';
  const sizeLevel = d.sizeLevel || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const beautify = d.artistStyleBeautify === true;
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

  useEffect(() => {
    writeLibrary(library);
  }, [library]);

  useEffect(() => {
    const onLibraryChanged = () => setLibrary(readLibrary());
    window.addEventListener('penguin:artist-style-master-changed', onLibraryChanged);
    return () => window.removeEventListener('penguin:artist-style-master-changed', onLibraryChanged);
  }, []);

  const allStyles = useMemo(() => {
    return [...ARTIST_STYLE_MASTER_ITEMS, ...library.styles] as ArtistStyleItem[];
  }, [library.styles]);

  const categoryOptions = useMemo(() => {
    const merged = new Map<string, { id: string; label: string; labelZh: string }>();
    library.categories.forEach((item) => {
      if (item.id) merged.set(item.id, { id: item.id, label: item.name, labelZh: item.name });
    });
    library.styles.forEach((item) => {
      const label = item.categoryZh || item.category;
      if (item.category) merged.set(item.category, { id: item.category, label, labelZh: label });
    });
    return Array.from(merged.values()).sort((a, b) => a.labelZh.localeCompare(b.labelZh, 'zh-Hans-CN'));
  }, [library.categories, library.styles]);

  const movementOptions = useMemo(() => {
    const custom = library.styles.map((item) => ({ id: item.movement, label: item.movement, labelZh: item.movementZh }));
    const merged = new Map<string, { id: string; label: string; labelZh: string }>();
    [...ARTIST_STYLE_MASTER_MOVEMENTS, ...custom].forEach((item) => {
      if (item.id) merged.set(item.id, item);
    });
    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [library.styles]);

  const filteredStyles = useMemo(() => {
    return searchArtistStyles(allStyles, { query, movement, category, limit: galleryOpen ? undefined : 12 });
  }, [allStyles, category, galleryOpen, movement, query]);

  useEffect(() => {
    if (category !== 'all' && !categoryOptions.some((item) => item.id === category)) {
      setCategory('all');
    }
  }, [category, categoryOptions]);

  const selectedStyle = useMemo(() => {
    return allStyles.find((item) => item.id === selectedId) || filteredStyles[0] || allStyles[0];
  }, [allStyles, filteredStyles, selectedId]);

  useEffect(() => {
    if (selectedStyle && selectedStyle.id !== selectedId) {
      setSelectedId(selectedStyle.id);
    }
  }, [selectedId, selectedStyle]);

  useEffect(() => {
    update({
      artistStyleQuery: query,
      artistStyleMovement: movement,
      artistStyleCategory: category,
      artistStyleOutputMode: outputMode,
      artistStyleSelectedId: selectedStyle?.id,
    });
  }, [category, movement, outputMode, query, selectedStyle?.id, update]);

  const openLightbox = useCallback((item: ArtistStyleItem) => {
    const index = filteredStyles.findIndex((style) => style.id === item.id);
    setSelectedId(item.id);
    setLightboxIndex(Math.max(0, index));
  }, [filteredStyles]);

  const moveLightbox = useCallback((delta: number) => {
    setLightboxIndex((current) => {
      const total = filteredStyles.length;
      if (current === null || total < 1) return current;
      return (current + delta + total) % total;
    });
  }, [filteredStyles.length]);

  useEffect(() => {
    if (lightboxIndex === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxIndex(null);
      if (event.key === 'ArrowRight') moveLightbox(1);
      if (event.key === 'ArrowLeft') moveLightbox(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, moveLightbox]);

  const copyPrompt = useCallback(async (style = selectedStyle) => {
    if (!style) return;
    const prompt = buildArtistStylePrompt(style);
    await navigator.clipboard?.writeText(prompt);
    setStatus('已复制画家名称提示词。');
  }, [selectedStyle]);

  const saveCurrentStyle = useCallback(() => {
    if (!selectedStyle) return;
    const saved = normalizeArtistStyleItem({
      ...selectedStyle,
      id: `saved-${selectedStyle.id}`,
      userCreated: true,
    });
    setLibrary((current) => upsertArtistStyleInLibrary(current, saved, { id: saved.category, name: saved.categoryZh }));
    setStatus('已保存到艺术风格大师。');
  }, [selectedStyle]);

  const addCategory = useCallback(() => {
    const name = newCategoryName.trim();
    if (!name) return;
    const next: ArtistStyleCategory = { id: slugifyArtistStyle(name), name };
    setLibrary((current) => mergeArtistStyleLibraries(current, { categories: [next], styles: [] }));
    setNewCategoryName('');
    setStatus('新增分类已保存。');
  }, [newCategoryName]);

  const renameCategory = useCallback(() => {
    if (!renameCategoryId || !renameCategoryName.trim()) return;
    const name = renameCategoryName.trim();
    setLibrary((current) => ({
      categories: current.categories.map((item) => (item.id === renameCategoryId ? { ...item, name } : item)),
      styles: current.styles.map((style) => (
        style.category === renameCategoryId
          ? { ...style, categoryZh: name }
          : style
      )),
    }));
    setStatus('分类已重命名。');
  }, [renameCategoryId, renameCategoryName]);

  const deleteCategory = useCallback(() => {
    if (!renameCategoryId) return;
    setLibrary((current) => ({
      categories: current.categories.filter((item) => item.id !== renameCategoryId),
      styles: current.styles.map((style) => (
        style.category === renameCategoryId
          ? { ...style, category: 'User', categoryZh: '未分类' }
          : style
      )),
    }));
    setRenameCategoryId('');
    setRenameCategoryName('');
    setStatus('分类已删除，相关风格已移动到未分类。');
  }, [renameCategoryId]);

  const saveCustomStyle = useCallback(() => {
    if (!customDraft.name.trim() || !customDraft.imageUrl.trim()) {
      setStatus('新增风格至少需要名称和图片地址。');
      return;
    }
    const categoryName = customDraft.category.trim() || '未分类';
    const existingStyle = editingStyleId ? library.styles.find((item) => item.id === editingStyleId) : undefined;
    const style = normalizeArtistStyleItem({
      id: editingStyleId || undefined,
      name: customDraft.name,
      chineseName: customDraft.chineseName || customDraft.name,
      category: slugifyArtistStyle(categoryName),
      categoryZh: categoryName,
      movement: 'User',
      movementZh: '自定义风格',
      cue: customDraft.cue,
      imageUrl: customDraft.imageUrl,
      tags: customDraft.tags.split(/[,\s，、]+/).filter(Boolean),
      sourceOrder: existingStyle?.sourceOrder,
      userCreated: true,
    });
    setLibrary((current) => upsertArtistStyleInLibrary(current, style, { id: style.category, name: categoryName }));
    setCustomDraft(EMPTY_CUSTOM_DRAFT);
    setEditingStyleId('');
    setSelectedId(style.id);
    setStatus(editingStyleId ? '自定义风格已更新。' : '自定义风格已保存。');
  }, [customDraft, editingStyleId, library.styles]);

  const editUserStyle = useCallback((style: ArtistStyleItem) => {
    if (!style.userCreated) return;
    setCustomDraft({
      name: style.name,
      chineseName: style.chineseName,
      imageUrl: style.imageUrl,
      cue: style.cue,
      category: style.categoryZh || style.category,
      tags: [...style.tags].join(', '),
    });
    setEditingStyleId(style.id);
    setSelectedId(style.id);
    setStatus('正在编辑自定义风格。');
  }, []);

  const cancelCustomEdit = useCallback(() => {
    setCustomDraft(EMPTY_CUSTOM_DRAFT);
    setEditingStyleId('');
    setStatus('已取消编辑自定义风格。');
  }, []);

  const deleteUserStyle = useCallback((styleId: string) => {
    setLibrary((current) => ({
      ...current,
      styles: current.styles.filter((item) => item.id !== styleId),
    }));
    if (editingStyleId === styleId) {
      setCustomDraft(EMPTY_CUSTOM_DRAFT);
      setEditingStyleId('');
    }
    if (selectedId === styleId) {
      setSelectedId(ARTIST_STYLE_MASTER_ITEMS[0]?.id || '');
    }
    setStatus('自定义风格已删除。');
  }, [editingStyleId, selectedId]);

  const exportLibrary = useCallback(() => {
    downloadJson(`artist-style-master-${Date.now()}.json`, createArtistStyleExport(library));
    setStatus('已导出艺术风格大师配置。');
  }, [library]);

  const importLibrary = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = importArtistStyleExport(parsed);
      setLibrary((current) => mergeArtistStyleLibraries(current, imported));
      setStatus('导入完成。');
    } catch (error: any) {
      setStatus(error?.message || '导入失败。');
    }
  }, []);

  const handleCustomImageUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('请选择图片文件。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl) {
        setStatus('读取图片失败，请重试。');
        return;
      }
      const nameFromFile = file.name.replace(/\.[^.]+$/, '');
      setCustomDraft((draft) => ({
        ...draft,
        name: draft.name || nameFromFile,
        chineseName: draft.chineseName || nameFromFile,
        imageUrl,
      }));
      setStatus('已上传风格图，保存后会进入对应自定义分类。');
    };
    reader.onerror = () => setStatus('读取图片失败，请重试。');
    reader.readAsDataURL(file);
  }, []);

  const runArtistStyleRedraw = useCallback(async () => {
    if (isReadonly) return;
    if (!selectedStyle) {
      const msg = '请先选择一个艺术风格';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    if (!originalImage) {
      const msg = '请先连接原始图像';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    const styleImage = selectedStyle.imageUrl;
    if (!styleImage) {
      const msg = '当前艺术风格缺少参考图像';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }

    const prompt = buildArtistStyleRedrawPrompt(selectedStyle, { beautify });
    const referenceImages = [originalImage, styleImage];
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `artist-style-master:${id.slice(0, 6)}`;
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'artist-style-master',
      seed: runSeed,
      nodeTitle: '艺术风格大师',
      outputTitle: `${selectedStyle.chineseName} 风格重绘`,
    };
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    update({
      status: 'generating',
      progress: '0%',
      error: '',
      imageUrl: '',
      imageUrls: [],
      urls: [],
      directImageUrl: '',
      directImageUrls: [],
      prompt,
      outputText: prompt,
      text: prompt,
      lastPrompt: prompt,
      lastSeed: runSeed,
      referenceImages,
      artistStyleOriginalImageUrl: originalImage,
      artistStyleReferenceImageUrl: styleImage,
      artistStyleSelectedId: selectedStyle.id,
      artistStyleBeautify: beautify,
    });
    setStatus('正在按所选艺术风格重绘原始图像...');

    try {
      let urls: string[] = [];
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
        logBus.info(`艺术风格大师重绘提交: ${providerSelection.provider.label || providerSelection.provider.id} · ${externalProviderModel} · refs=${referenceImages.length}`, src);
        let res = await generateExternalImage({
          providerId: providerSelection.provider.id,
          providerModel: externalProviderModel,
          model: externalProviderModel,
          prompt,
          size,
          aspect_ratio: aspectRatio,
          image_size: sizeLevel,
          images: referenceImages,
          outputFormat,
          seed: runSeed,
          n: Math.max(1, Math.min(4, Number(providerParams.n || 1))),
          providerParams,
          historyContext,
          async: true,
        });
        if (!res.imageUrls?.length && res.taskId && (res.code === 'running' || res.status === 'running')) {
          let pollingTaskId = res.taskId;
          update({ progress: '生成中...', taskId: pollingTaskId });
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
        urls = res.imageUrls || [];
        if (!urls.length) throw new Error('扩展平台完成但未返回图片');
        update({ remoteImageUrls: res.remoteImageUrls, taskId: res.taskId || d.taskId });
      } else {
        logBus.info(`艺术风格大师重绘提交: model=${apiModel} ratio=${aspectRatio} size=${sizeLevel} refs=${referenceImages.length}`, src);
        const submit = await submitImageAsync({
          model: modelDef.id,
          apiModel,
          paramKind: modelDef.paramKind,
          prompt,
          aspect_ratio: aspectRatio,
          image_size: sizeLevel,
          images: referenceImages,
          n: 1,
          outputFormat,
          seed: runSeed,
          historyContext,
        });
        if (submit.sync && submit.urls?.length) {
          urls = submit.urls;
        } else {
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
        directImageUrl: urls[0],
        directImageUrls: urls,
        prompt,
        outputText: prompt,
        text: prompt,
        lastPrompt: prompt,
        lastSeed: runSeed,
        referenceImages,
        artistStyleOriginalImageUrl: originalImage,
        artistStyleReferenceImageUrl: styleImage,
        artistStyleBeautify: beautify,
        lastArtistStyleOutputMode: 'redraw',
        lastArtistStyleText: prompt,
        lastArtistStyleImageUrl: urls[0],
        error: '',
      });
      setStatus('艺术风格重绘完成。');
      logBus.success(`艺术风格大师重绘完成 → ${urls[0]}`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const message = error?.message || '艺术风格重绘失败';
      update({ status: 'error', error: message, progress: '' });
      setStatus(message);
      logBus.error(message, src);
      throw error;
    }
  }, [
    activeCanvasId,
    apiModel,
    aspectRatio,
    beautify,
    d.providerParams,
    d.taskId,
    externalProviderModel,
    id,
    isExternalSelected,
    isReadonly,
    modelDef.id,
    modelDef.paramKind,
    originalImage,
    outputFormat,
    providerSelection.provider,
    seed,
    selectedStyle,
    sizeLevel,
    update,
  ]);

  const runArtistStyleOutput = useCallback(async (mode: ArtistStyleOutputMode = outputMode) => {
    if (!selectedStyle) throw new Error('请先选择一个艺术风格');
    const payload = buildArtistStyleOutputPayload(selectedStyle, mode);
    const nodes = rf.getNodes();
    const me = rf.getNode(id);
    const mySize = defaultSizeOf('artist-style-master');
    const baseX = (me?.position.x ?? 0) + ((me as any)?.measured?.width || mySize.w) + 80;
    const baseY = me?.position.y ?? 0;
    const position = placeSingleNode(baseX, baseY, 'output', nodes, { source: `placement:artist-style-master-output:${id}` });
    const outputNode: Node = {
      id: `artist-style-output-${mode}-${Date.now()}`,
      type: 'output',
      position,
      data: {
        ...payload.data,
        title: mode === 'image' ? `${selectedStyle.chineseName} 风格图` : `${selectedStyle.chineseName} 风格提示词`,
        artistStyleOutputMode: mode,
        sourceNodeId: id,
      },
    };
    rf.addNodes(outputNode);
    update({
      lastArtistStyleOutputMode: mode,
      lastArtistStyleText: payload.data.directOutputText,
      lastArtistStyleImageUrl: payload.data.directImageUrl || '',
    });
    setStatus(mode === 'image' ? '已输出风格图片。' : '已输出风格提示词。');
  }, [id, outputMode, rf, selectedStyle, update]);

  const handleRun = useCallback(() => (
    originalImage ? runArtistStyleRedraw() : runArtistStyleOutput(outputMode)
  ), [originalImage, outputMode, runArtistStyleOutput, runArtistStyleRedraw]);

  useRunTrigger(id, handleRun, 'artist-style-master');

  const activeLightboxStyle = lightboxIndex === null ? null : filteredStyles[lightboxIndex] || filteredStyles[0];

  const galleryModal = galleryOpen ? createPortal(
    <div className="artist-style-master-modal-backdrop nodrag nopan" onWheelCapture={(event) => event.stopPropagation()}>
      <section
        className="artist-style-master-modal"
        data-artist-style-gallery-modal
        onWheelCapture={stopCanvasWheel}
      >
        <header className="artist-style-master-modal-header">
          <div>
            <div className="artist-style-master-kicker">灵感之源</div>
            <h2>艺术风格大师</h2>
            <p>搜索画家、流派和风格标签，保存你的常用参考。</p>
          </div>
          <button type="button" className="asm-icon-button" aria-label="关闭艺术风格库" onClick={() => setGalleryOpen(false)}>
            <X size={18} />
          </button>
        </header>

        <div className="artist-style-master-modal-tools">
          <label className="artist-style-master-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索英文名 / 中文名 / 风格标签" />
          </label>
          <select value={movement} onChange={(event) => setMovement(event.target.value)}>
            <option value="all">全部流派</option>
            {toSelectOptions(movementOptions).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">全部收藏分类</option>
            {toSelectOptions(categoryOptions).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button type="button" onClick={exportLibrary}><Download size={15} /> 导出</button>
          <button type="button" onClick={() => importRef.current?.click()}><Upload size={15} /> 导入</button>
          <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={importLibrary} />
        </div>

        <div className="artist-style-master-modal-layout">
          <div className="artist-style-master-gallery" onWheelCapture={stopCanvasWheel}>
            {filteredStyles.map((style) => (
              <article key={style.id} className={`artist-style-master-card ${selectedStyle?.id === style.id ? 'is-selected' : ''}`}>
                <button type="button" className="artist-style-master-thumb-button" onClick={() => openLightbox(style)}>
                  <img src={style.thumbnailUrl || style.imageUrl} alt={`${style.name} ${style.chineseName}`} loading="lazy" />
                </button>
                <div className="artist-style-master-card-body">
                  <strong>{style.chineseName}</strong>
                  <span>{style.name}</span>
                  <small>{style.movementZh} / {style.movement}</small>
                  <p>{style.cue}</p>
                  <div className="artist-style-master-card-actions">
                    <button type="button" onClick={() => setSelectedId(style.id)}>选用</button>
                    <button type="button" onClick={() => void copyPrompt(style)}>复制画家提示词</button>
                    {style.userCreated ? <button type="button" onClick={() => editUserStyle(style)}>编辑</button> : null}
                    {style.userCreated ? <button type="button" className="danger" onClick={() => deleteUserStyle(style.id)}>删除</button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className="artist-style-master-manager" onWheelCapture={stopCanvasWheel}>
            <h3><Save size={16} /> 保存到艺术风格大师</h3>
            <button type="button" className="artist-style-master-wide-button" onClick={saveCurrentStyle}>保存当前选中风格</button>

            <h3><Plus size={16} /> 新增分类</h3>
            <div className="artist-style-master-inline-form">
              <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="分类名称，例如：电商海报" />
              <button type="button" onClick={addCategory}>新增分类</button>
            </div>

            <h3><Edit3 size={16} /> 重命名分类</h3>
            <select value={renameCategoryId} onChange={(event) => {
              setRenameCategoryId(event.target.value);
              const item = library.categories.find((categoryItem) => categoryItem.id === event.target.value);
              setRenameCategoryName(item?.name || '');
            }}>
              <option value="">选择自定义分类</option>
              {library.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <div className="artist-style-master-inline-form">
              <input value={renameCategoryName} onChange={(event) => setRenameCategoryName(event.target.value)} placeholder="新分类名" />
              <button type="button" onClick={renameCategory}>重命名分类</button>
              <button type="button" className="danger" onClick={deleteCategory}>删除分类</button>
            </div>

            <h3><Palette size={16} /> {editingStyleId ? '编辑自定义风格' : '新增自定义风格'}</h3>
            <input value={customDraft.name} onChange={(event) => setCustomDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="原始风格名 / 英文名" />
            <input value={customDraft.chineseName} onChange={(event) => setCustomDraft((draft) => ({ ...draft, chineseName: event.target.value }))} placeholder="中文翻译" />
            <input value={customDraft.category} onChange={(event) => setCustomDraft((draft) => ({ ...draft, category: event.target.value }))} placeholder="分类" />
            <input value={customDraft.imageUrl} onChange={(event) => setCustomDraft((draft) => ({ ...draft, imageUrl: event.target.value }))} placeholder="图片地址" />
            <div className="artist-style-master-custom-upload">
              {customDraft.imageUrl ? (
                <img src={customDraft.imageUrl} alt="自定义风格预览" />
              ) : (
                <div className="artist-style-master-custom-upload-placeholder">未上传</div>
              )}
              <div>
                <button type="button" onClick={() => customImageUploadRef.current?.click()}>
                  <Upload size={15} /> 上传风格图
                </button>
                <small>可直接上传本地图片，保存后进入对应自定义分类。</small>
              </div>
              <input type="file" accept="image/*" ref={customImageUploadRef} className="hidden" onChange={handleCustomImageUpload} />
            </div>
            <textarea value={customDraft.cue} onChange={(event) => setCustomDraft((draft) => ({ ...draft, cue: event.target.value }))} placeholder="属性信息 / 风格描述" />
            <input value={customDraft.tags} onChange={(event) => setCustomDraft((draft) => ({ ...draft, tags: event.target.value }))} placeholder="标签，用逗号分隔" />
            <div className="artist-style-master-custom-actions">
              <button type="button" className="artist-style-master-wide-button" onClick={saveCustomStyle}>
                {editingStyleId ? '更新自定义风格' : '保存自定义风格'}
              </button>
              {editingStyleId ? (
                <button type="button" className="artist-style-master-wide-button" onClick={cancelCustomEdit}>
                  取消编辑
                </button>
              ) : null}
            </div>

            <div className="artist-style-master-status">{status}</div>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  const lightbox = activeLightboxStyle ? createPortal(
    <div className="artist-style-master-lightbox-backdrop nodrag nopan" data-artist-style-lightbox onWheelCapture={(event) => event.stopPropagation()}>
      <button type="button" className="asm-icon-button lightbox-close" aria-label="关闭预览" onClick={() => setLightboxIndex(null)}>
        <X size={18} />
      </button>
      <button type="button" className="asm-icon-button lightbox-prev" aria-label="上一张" onClick={() => moveLightbox(-1)}>
        <ChevronLeft size={22} />
      </button>
      <figure className="artist-style-master-lightbox">
        <img src={activeLightboxStyle.imageUrl} alt={`${activeLightboxStyle.name} ${activeLightboxStyle.chineseName}`} />
        <figcaption>
          <strong>{activeLightboxStyle.chineseName}</strong>
          <span>{activeLightboxStyle.name} · {activeLightboxStyle.movement}</span>
          <p>{activeLightboxStyle.cue}</p>
          <button type="button" onClick={() => void copyPrompt(activeLightboxStyle)}>复制画家提示词</button>
        </figcaption>
      </figure>
      <button type="button" className="asm-icon-button lightbox-next" aria-label="下一张" onClick={() => moveLightbox(1)}>
        <ChevronRight size={22} />
      </button>
    </div>,
    document.body,
  ) : null;

  return (
    <div
      className={`artist-style-master-node ${selected ? 'is-selected' : ''}`}
      data-artist-style-master-root
      onWheelCapture={(event) => event.stopPropagation()}
    >
      <Handle id="text" type="target" position={Position.Left} style={{ ...handleStyle, background: PORT_COLOR.text, top: 148 }} title={TEXT_INPUT_HANDLE_TITLE} />
      <Handle id="original-image" type="target" position={Position.Left} style={{ ...handleStyle, background: PORT_COLOR.image, top: 196 }} title={ORIGINAL_IMAGE_HANDLE_TITLE} />
      <Handle id="text" type="source" position={Position.Right} style={{ ...handleStyle, background: PORT_COLOR.text, top: 152 }} title={TEXT_OUTPUT_HANDLE_TITLE} />
      <Handle id="image" type="source" position={Position.Right} style={{ ...handleStyle, background: PORT_COLOR.image, top: 190 }} title={IMAGE_OUTPUT_HANDLE_TITLE} />

      <header className="artist-style-master-header" data-artist-style-master-drag-surface>
        <div className="artist-style-master-icon"><Palette size={22} /></div>
        <div>
          <h3>艺术风格大师</h3>
          <p>搜索画家 / 流派 / 风格标签</p>
        </div>
        <button type="button" className="asm-icon-button nodrag nopan" aria-label="打开艺术风格库" onClick={() => setGalleryOpen(true)}>
          <Images size={18} />
        </button>
      </header>

      <section className="artist-style-master-section nodrag nopan">
        <div className="artist-style-master-selected">
          {selectedStyle ? <SmartImage src={selectedStyle.thumbnailUrl || selectedStyle.imageUrl} alt={selectedStyle.name || '艺术风格'} thumbSize={180} /> : <div />}
          <div>
            <strong>{selectedStyle?.chineseName || '请选择风格'}</strong>
            <span>{selectedStyle?.name || 'No style selected'}</span>
            <small>{selectedStyle?.movementZh || '打开风格库选择'}</small>
          </div>
        </div>
        <p className="artist-style-master-cue">{selectedStyle?.cue}</p>
      </section>

      <section className="artist-style-master-section nodrag nopan">
        <div className="artist-style-master-section-title">
          <span><ImageIcon size={14} /> 重绘原图</span>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        </div>
        <div className="artist-style-master-redraw-grid">
          <div className="artist-style-master-redraw-slot">
            {originalImage ? <SmartImage src={originalImage} alt="原始图像" thumbSize={360} /> : <div>连接原始图像</div>}
            <span>原始图像</span>
          </div>
          <div className="artist-style-master-redraw-slot">
            {selectedStyle ? <SmartImage src={selectedStyle.thumbnailUrl || selectedStyle.imageUrl} alt="艺术风格参考" thumbSize={180} /> : <div>选择风格</div>}
            <span>艺术风格</span>
          </div>
        </div>
        <button
          type="button"
          className={`artist-style-master-beautify-toggle ${beautify ? 'active' : ''}`}
          role="switch"
          aria-checked={beautify}
          disabled={isReadonly || busy}
          onClick={() => update({ artistStyleBeautify: !beautify })}
        >
          <span><Sparkles size={14} /> 美化</span>
          <small>{beautify ? '开启：允许轻微微调主体姿态和位置' : '关闭：严格保留主体姿态和位置'}</small>
        </button>
        <small className="artist-style-master-redraw-note">
          连接原始图像后点击运行，会保留构图和主要内容，只迁移笔触、色彩、光影和细节风格。
        </small>
        {d.error ? <div className="artist-style-master-error">{d.error}</div> : null}
        {d.progress ? <div className="artist-style-master-status">{d.progress}</div> : null}
        {d.imageUrl ? <SmartImage className="artist-style-master-redraw-result" src={d.imageUrl} alt="艺术风格重绘结果" draggable={false} thumbSize={360} /> : null}
      </section>

      <section className="artist-style-master-section nodrag nopan">
        <label>
          <span><Search size={14} /> 搜索</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="画家英文名、中文名或风格标签" />
        </label>
        <div className="artist-style-master-two-cols">
          <label>
            <span><Filter size={14} /> 流派</span>
            <select value={movement} onChange={(event) => setMovement(event.target.value)}>
              <option value="all">全部流派</option>
              {toSelectOptions(movementOptions).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span><BookOpen size={14} /> 收藏分类</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">全部收藏分类</option>
              {toSelectOptions(categoryOptions).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="artist-style-master-mode">
          <button
            type="button"
            className={outputMode === 'prompt' ? 'active' : ''}
            onClick={() => {
              setOutputMode('prompt');
              void runArtistStyleOutput('prompt');
            }}
          >
            <FileText size={15} /> 输出风格提示词
          </button>
          <button
            type="button"
            className={outputMode === 'image' ? 'active' : ''}
            onClick={() => {
              setOutputMode('image');
              void runArtistStyleOutput('image');
            }}
          >
            <ImageIcon size={15} /> 输出风格图片
          </button>
        </div>
      </section>

      <section className="artist-style-master-section nodrag nopan">
        <div className="artist-style-master-section-title">
          <span><ImageIcon size={14} /> 生图模型</span>
        </div>
        <div className="artist-style-master-model-grid">
          <label>
            <span>生图平台</span>
            <select
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
          <label>
            <span>生图模型</span>
            {isExternalSelected ? (
              <select value={externalProviderModel} disabled={isReadonly || busy || externalModelOptions.length === 0} onChange={(event) => update({ providerModel: event.target.value })}>
                {externalModelOptions.length > 0
                  ? externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>)
                  : <option value="">未配置图像模型</option>}
              </select>
            ) : (
              <select value={apiModel} disabled={isReadonly || busy} onChange={(event) => update({ apiModel: event.target.value })}>
                {modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            )}
          </label>
          <label>
            <span>画面比例</span>
            <select value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
              {modelDef.aspectRatios.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>分辨率</span>
            <select value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
              <option value="1K">1K</option>
              <option value="2K">2K</option>
              <option value="4K">4K</option>
            </select>
          </label>
          <label>
            <span>输出格式</span>
            <select value={outputFormat} disabled={isReadonly || busy} onChange={(event) => update({ outputFormat: event.target.value })}>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
            </select>
          </label>
          <label>
            <span>Seed（0 随机）</span>
            <input type="number" min={0} value={seed} disabled={isReadonly || busy} onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
          </label>
        </div>
      </section>

      <section className="artist-style-master-section nodrag nopan">
        <div className="artist-style-master-mini-grid" onWheelCapture={stopCanvasWheel}>
          {filteredStyles.map((style) => (
            <button key={style.id} type="button" className={selectedStyle?.id === style.id ? 'active' : ''} onClick={() => setSelectedId(style.id)}>
              <SmartImage src={style.thumbnailUrl || style.imageUrl} alt={style.chineseName} thumbSize={180} />
              <span>{style.chineseName}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="artist-style-master-actions nodrag nopan">
        <button type="button" onClick={() => setGalleryOpen(true)}><Images size={16} /> 打开风格库</button>
        <button type="button" onClick={() => void copyPrompt()}><Copy size={16} /> 复制画家提示词</button>
        <button type="button" onClick={saveCurrentStyle}><Save size={16} /> 保存到艺术风格大师</button>
      </section>

      <footer className="artist-style-master-footer nodrag nopan">
        <span>{filteredStyles.length} 个匹配 · {library.styles.length} 个自定义</span>
        <button type="button" disabled={isReadonly || busy} onClick={() => void handleRun()}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : originalImage ? <ImageIcon size={17} /> : outputMode === 'image' ? <ImageIcon size={17} /> : <FileText size={17} />}
          {originalImage ? '重绘原图' : '运行'}
        </button>
      </footer>

      {galleryModal}
      {lightbox}
    </div>
  );
}

export default ArtistStyleMasterNode;
