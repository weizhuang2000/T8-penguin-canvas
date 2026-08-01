import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ImagePlus,
  Images,
  Library,
  LibraryBig,
  Loader2,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { IMAGE_MODELS, DEFAULT_LLM_MODEL, gptImage2ZhenzhenVariantSize } from '../providers/models';
import { generateLlm, uploadFile } from '../services/generation';
import { runConfiguredImageGeneration } from '../services/imageGenerationRunner';
import * as api from '../services/api';
import type { AuthUser, GenerationHistoryItem, ResourceCategory, ResourceItem } from '../services/api';
import { useApiKeysStore } from '../stores/apiKeys';
import { useCanvasStore } from '../stores/canvas';
import { logBus } from '../stores/logs';
import { taskCompletionSound } from '../stores/taskCompletionSound';
import { useThemeStore } from '../stores/theme';
import {
  mergeImageEditorGallery,
  paginateImageEditorGallery,
  replaceImageEditorSelectionId,
  toggleImageEditorSelection,
  type ImageEditorGalleryAsset,
  type ImageEditorGallerySource,
} from '../utils/imageEditorGallery';
import {
  buildImageEditorReverseMessages,
  cleanPromptReverseOutput,
  normalizePromptReverseLanguage,
  normalizePromptReverseStrength,
  PROMPT_REVERSE_STRENGTHS,
  type PromptReverseLanguage,
  type PromptReverseStrength,
} from '../utils/promptReverse';
import SmartImage from './SmartImage';

const GPT_IMAGE = IMAGE_MODELS.find((item) => item.id === 'gpt-image-2') || IMAGE_MODELS[0];
const GPT_VARIANTS = GPT_IMAGE.apiModelOptions.filter((item) => !item.value.toLowerCase().includes('fal'));
const PAGE_SIZES = [12, 24, 48, 96] as const;
const MAX_REFERENCES = 9;

type RunStage = 'idle' | 'reversing' | 'generating' | 'success' | 'error';

interface ImageEditorPageProps {
  user: AuthUser;
  onBack: () => void;
}

function resultData<T>(result: api.Result<T>): T | null {
  return result.success ? result.data : null;
}

function pageSizeStorageKey(userId: string) {
  return `t8pc:image-editor:page-size:v1:${encodeURIComponent(userId)}`;
}

function readPageSize(userId: string): number {
  try {
    const value = Number(window.localStorage.getItem(pageSizeStorageKey(userId)) || 24);
    return PAGE_SIZES.includes(value as (typeof PAGE_SIZES)[number]) ? value : 24;
  } catch {
    return 24;
  }
}

export default function ImageEditorPage({ user, onBack }: ImageEditorPageProps) {
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const settings = useApiKeysStore((state) => state.settings);
  const { activeId, loadCanvases } = useCanvasStore();
  const uploadRef = useRef<HTMLInputElement>(null);

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [publishingId, setPublishingId] = useState('');
  const [message, setMessage] = useState('');
  const [source, setSource] = useState<ImageEditorGallerySource>('all');
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => readPageSize(user.id));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [stage, setStage] = useState<RunStage>('idle');
  const [progress, setProgress] = useState('');
  const [runError, setRunError] = useState('');
  const [reversedPrompt, setReversedPrompt] = useState('');
  const [llmKeyId, setLlmKeyId] = useState('');
  const [strength, setStrength] = useState<PromptReverseStrength>('standard');
  const [language, setLanguage] = useState<PromptReverseLanguage>('zh');
  const [apiModel, setApiModel] = useState('gpt-image-2-all');
  const [aspectRatio, setAspectRatio] = useState('Auto');
  const [sizeLevel, setSizeLevel] = useState('2K');
  const [count, setCount] = useState(1);
  const [outputFormat, setOutputFormat] = useState<'jpg' | 'png'>('jpg');

  const llmConfigs = useMemo(() => {
    const configured = settings.llmConfigs || settings.llmApiKeys || [];
    const saved = configured.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length ? saved : [{ id: 'default', label: '默认 LLM', model: settings.llmModel || DEFAULT_LLM_MODEL, isDefault: true }];
  }, [settings.llmApiKeys, settings.llmConfigs, settings.llmModel]);
  const activeLlm = llmConfigs.find((item) => item.id === llmKeyId)
    || llmConfigs.find((item) => item.isDefault)
    || llmConfigs[0];
  const llmModel = String(activeLlm?.model || settings.llmModel || DEFAULT_LLM_MODEL).trim();

  const reloadGallery = async () => {
    const [resourceResult, categoryResult, historyResult] = await Promise.all([
      api.getResourceItems({ kind: 'image' }),
      api.getResourceCategories('image'),
      api.getGenerationHistoryItems({ kind: 'image' }),
    ]);
    const nextResources = resultData(resourceResult);
    const nextCategories = resultData(categoryResult);
    const nextHistory = resultData(historyResult);
    if (nextResources) setResources(nextResources);
    if (nextCategories) setCategories(nextCategories);
    if (nextHistory) {
      setHistory((current) => {
        const fetchedUrls = new Set(nextHistory.map((item) => item.url));
        const pendingLocal = current.filter((item) => item.id.startsWith('image-editor-local-') && !fetchedUrls.has(item.url));
        return [...pendingLocal, ...nextHistory];
      });
    }
    const errors = [resourceResult, categoryResult, historyResult]
      .filter((item) => !item.success)
      .map((item) => item.error)
      .filter(Boolean);
    if (errors.length) setMessage(errors.join('；'));
    return { resources: nextResources || resources, history: nextHistory || history };
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingGallery(true);
    void loadCanvases({ userId: user.id }).then(() => reloadGallery()).finally(() => {
      if (!cancelled) setLoadingGallery(false);
    });
    return () => { cancelled = true; };
    // reloadGallery intentionally runs once on page mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCanvases, user.id]);

  useEffect(() => {
    const onChanged = () => void reloadGallery();
    window.addEventListener('penguin:resources-changed', onChanged);
    window.addEventListener('penguin:generation-history-changed', onChanged);
    return () => {
      window.removeEventListener('penguin:resources-changed', onChanged);
      window.removeEventListener('penguin:generation-history-changed', onChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assets = useMemo(
    () => mergeImageEditorGallery(resources, history, user.id),
    [history, resources, user.id],
  );
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectedAssets = selectedIds.map((id) => assetsById.get(id)).filter(Boolean) as ImageEditorGalleryAsset[];
  const galleryPage = useMemo(() => paginateImageEditorGallery(assets, {
    source,
    keyword,
    categoryId: source === 'mine' ? 'all' : categoryId,
    page,
    pageSize,
  }), [assets, categoryId, keyword, page, pageSize, source]);

  useEffect(() => {
    if (galleryPage.page !== page) setPage(galleryPage.page);
  }, [galleryPage.page, page]);

  const setPageSizePreference = (next: number) => {
    setPageSize(next);
    setPage(1);
    try { window.localStorage.setItem(pageSizeStorageKey(user.id), String(next)); } catch { /* ignore */ }
  };

  const selectAsset = (asset: ImageEditorGalleryAsset) => {
    const next = toggleImageEditorSelection(selectedIds, asset.id, MAX_REFERENCES);
    if (next === selectedIds) setMessage(`最多选择 ${MAX_REFERENCES} 张参考图`);
    setSelectedIds(next);
  };

  const finishedCategoryId = useMemo(
    () => categories.find((item) => item.kind === 'image' && item.name === '成品')?.id || 'image_uncategorized',
    [categories],
  );

  const addFilesToLibrary = async (files: FileList | null) => {
    const images = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!images.length || uploading) return;
    setUploading(true);
    setMessage('');
    let saved = 0;
    const failures: string[] = [];
    for (const file of images) {
      try {
        const uploaded = await uploadFile(file);
        const result = await api.addResourceItem({
          url: uploaded.url,
          kind: 'image',
          categoryId: finishedCategoryId,
          title: file.name.replace(/\.[^.]+$/, ''),
          sourceNodeId: 'web-image-editor-upload',
          sourceCanvasId: activeId || undefined,
        });
        if (!result.success) throw new Error(result.error || '加入资源库失败');
        saved += 1;
      } catch (error: any) {
        failures.push(`${file.name}: ${error?.message || '上传失败'}`);
      }
    }
    await reloadGallery();
    window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
    setMessage(failures.length ? `已入库 ${saved} 张，失败 ${failures.length} 张：${failures[0]}` : `已上传并共享 ${saved} 张图片`);
    setUploading(false);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const publishAsset = async (asset: ImageEditorGalleryAsset) => {
    if (asset.inResourceLibrary || publishingId) return;
    setPublishingId(asset.id);
    setMessage('');
    const result = await api.addResourceItem({
      url: asset.url,
      kind: 'image',
      categoryId: finishedCategoryId,
      title: asset.title,
      tags: ['网页版改图'],
      sourceNodeId: 'web-image-editor',
      sourceCanvasId: activeId || undefined,
    });
    if (result.success) {
      setResources((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      setSelectedIds((ids) => replaceImageEditorSelectionId(ids, asset.id, `resource:${result.data.id}`));
      setMessage(result.data.duplicate ? '该图片已在资源图库中' : '已加入共享资源图库');
      window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
    } else {
      setMessage(result.error || '加入资源库失败');
    }
    setPublishingId('');
  };

  const generateFromPrompt = async (prompt: string) => {
    const refs = selectedAssets.map((asset) => asset.url).slice(0, MAX_REFERENCES);
    if (!refs.length) throw new Error('请至少选择一张参考图');
    const forcedSize = gptImage2ZhenzhenVariantSize(apiModel);
    const result = await runConfiguredImageGeneration({
      mode: 'standard',
      prompt,
      images: refs,
      outputFormat,
      model: GPT_IMAGE.id,
      apiModel,
      paramKind: GPT_IMAGE.paramKind,
      aspectRatio,
      sizeLevel: forcedSize || sizeLevel,
      n: count,
      historyContext: {
        canvasId: activeId,
        sourceNodeId: `web-image-editor-${user.id}`,
        sourceNodeType: 'image-editor',
        nodeTitle: '网页版改图',
        prompt,
      },
      onProgress: ({ progress: next }) => setProgress(next),
      onWarning: (warning) => logBus.warn(warning, '网页版改图'),
    });
    const existingUrls = new Set(history.map((item) => item.url));
    const optimistic: GenerationHistoryItem[] = result.urls
      .filter((url) => !existingUrls.has(url))
      .map((url, index) => ({
        id: `image-editor-local-${Date.now()}-${index}`,
        kind: 'image',
        url,
        fileName: url.split('/').pop() || `网页版改图-${index + 1}.jpg`,
        title: `网页版改图 ${new Date().toLocaleString()}`,
        canvasId: activeId || '',
        sourceNodeId: `web-image-editor-${user.id}`,
        sourceNodeType: 'image-editor',
        prompt,
        model: apiModel,
        createdAt: Date.now() + index,
        createdByUserId: user.id,
        createdByUserName: user.name || user.username,
        createdByUserRole: user.role,
        hidden: false,
        favorite: false,
        tags: [],
      }));
    if (optimistic.length) setHistory((current) => [...optimistic, ...current]);
    void reloadGallery();
    window.dispatchEvent(new CustomEvent('penguin:generation-history-changed'));
    return result;
  };

  const runWorkflow = async () => {
    if (stage === 'reversing' || stage === 'generating') return;
    if (!selectedAssets.length) {
      setRunError('请先从图库选择至少一张参考图');
      return;
    }
    taskCompletionSound.primeAudio();
    setRunError('');
    setProgress('');
    setStage('reversing');
    logBus.info(`开始网页版改图 · ${selectedAssets.length} 张参考图`, '网页版改图');
    try {
      const detail = PROMPT_REVERSE_STRENGTHS.find((item) => item.value === strength)!;
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlm?.id && activeLlm.id !== 'default' ? activeLlm.id : undefined,
        sourceNodeType: 'prompt-reverse',
        temperature: 0.2,
        max_tokens: detail.maxTokens,
        messages: buildImageEditorReverseMessages({
          imageUrls: selectedAssets.map((asset) => asset.url),
          editInstruction: instruction,
          strength: normalizePromptReverseStrength(strength),
          language: normalizePromptReverseLanguage(language),
        }),
      });
      const prompt = cleanPromptReverseOutput(response.content);
      if (!prompt) throw new Error('识图模型未返回有效提示词');
      setReversedPrompt(prompt);
      setStage('generating');
      setProgress('0%');
      await generateFromPrompt(prompt);
      setStage('success');
      setProgress('100%');
      logBus.success('网页版改图完成', '网页版改图');
      taskCompletionSound.notifyComplete('web-image-editor', 'image');
    } catch (error: any) {
      const text = error?.message || '改图失败';
      setRunError(text);
      setStage('error');
      logBus.error(text, '网页版改图');
    }
  };

  const retryGeneration = async () => {
    if (!reversedPrompt.trim() || stage === 'reversing' || stage === 'generating') return;
    setRunError('');
    setStage('generating');
    setProgress('0%');
    try {
      await generateFromPrompt(reversedPrompt.trim());
      setStage('success');
      setProgress('100%');
      taskCompletionSound.notifyComplete('web-image-editor', 'image');
    } catch (error: any) {
      setRunError(error?.message || '生图失败');
      setStage('error');
    }
  };

  const surface = isPixel
    ? 'px-card'
    : isDark ? 'border-white/10 bg-zinc-900/90' : 'border-black/10 bg-white';
  const field = isPixel
    ? 'px-input'
    : `rounded-lg border px-3 py-2 outline-none ${isDark ? 'border-white/10 bg-black/20 text-white' : 'border-black/10 bg-white text-zinc-900'}`;
  const busy = stage === 'reversing' || stage === 'generating';

  return (
    <main className={`flex-1 overflow-y-auto ${isDark ? 'bg-zinc-950 text-white' : 'bg-[#f5f2ed] text-zinc-900'}`}>
      <input ref={uploadRef} type="file" accept="image/*" multiple hidden onChange={(event) => void addFilesToLibrary(event.target.files)} />
      <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className={`${field} flex items-center gap-2 text-sm font-semibold`}><ArrowLeft size={16} /> 返回无限画布</button>
          <div className="text-right">
            <h2 className="text-lg font-black">网页版改图</h2>
            <p className="text-xs opacity-55">共享资源参考 · 提示词反推 · GPT Image 2</p>
          </div>
        </div>

        <section className={`mb-4 overflow-hidden rounded-2xl border shadow-sm ${surface}`}>
          <div className="flex items-center gap-3 border-b border-current/10 px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400"><BrainCircuit size={20} /></span>
            <div>
              <div className="font-bold">参考图反推生图</div>
              <div className="text-xs opacity-55">选择共享资源或自己的生成图，输入改图要求后一键运行</div>
            </div>
          </div>
          <div className="bg-gradient-to-r from-emerald-500/15 via-cyan-500/10 to-sky-500/15 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
              <textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void runWorkflow();
                  }
                }}
                rows={3}
                disabled={busy}
                placeholder="描述想怎样修改，可留空直接复现参考图。Enter 运行，Shift+Enter 换行。"
                className={`${field} min-h-[86px] flex-1 resize-y text-sm leading-relaxed`}
              />
              <button
                type="button"
                disabled={busy || selectedAssets.length === 0}
                onClick={() => void runWorkflow()}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-7 font-bold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {stage === 'reversing' ? '正在反推' : stage === 'generating' ? `正在生图 ${progress}` : '运行'}
              </button>
            </div>
            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="mt-3 flex items-center gap-1 text-xs font-semibold opacity-70 hover:opacity-100">
              {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 高级设置
            </button>
            {advancedOpen && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-current/10 bg-black/5 p-3 md:grid-cols-4 lg:grid-cols-7">
                <label className="col-span-2 text-xs">识图 LLM<select className={`${field} mt-1 w-full text-xs`} value={activeLlm?.id || 'default'} onChange={(event) => setLlmKeyId(event.target.value)}>{llmConfigs.map((item) => <option key={item.id} value={item.id}>{item.label || item.id} · {item.model}</option>)}</select></label>
                <label className="text-xs">细节<select className={`${field} mt-1 w-full text-xs`} value={strength} onChange={(event) => setStrength(normalizePromptReverseStrength(event.target.value))}>{PROMPT_REVERSE_STRENGTHS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="text-xs">语言<select className={`${field} mt-1 w-full text-xs`} value={language} onChange={(event) => setLanguage(normalizePromptReverseLanguage(event.target.value))}><option value="zh">中文</option><option value="en">English</option></select></label>
                <label className="col-span-2 text-xs">GPT Image 2<select className={`${field} mt-1 w-full text-xs`} value={apiModel} onChange={(event) => setApiModel(event.target.value)}>{GPT_VARIANTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="text-xs">比例<select className={`${field} mt-1 w-full text-xs`} value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>{GPT_IMAGE.aspectRatios.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="text-xs">尺寸<select className={`${field} mt-1 w-full text-xs`} value={sizeLevel} disabled={!!gptImage2ZhenzhenVariantSize(apiModel)} onChange={(event) => setSizeLevel(event.target.value)}>{GPT_IMAGE.sizes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="text-xs">数量<select className={`${field} mt-1 w-full text-xs`} value={count} onChange={(event) => setCount(Math.max(1, Math.min(4, Number(event.target.value))))}>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>{item} 张</option>)}</select></label>
                <label className="text-xs">格式<select className={`${field} mt-1 w-full text-xs`} value={outputFormat} onChange={(event) => setOutputFormat(event.target.value === 'png' ? 'png' : 'jpg')}><option value="jpg">JPG</option><option value="png">PNG</option></select></label>
              </div>
            )}
          </div>
          {(reversedPrompt || runError) && (
            <div className="border-t border-current/10 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setPromptOpen((value) => !value)} className="flex items-center gap-1 text-xs font-bold">{promptOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 中间提示词</button>
                <button type="button" disabled={!reversedPrompt.trim() || busy} onClick={() => void retryGeneration()} className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-400 disabled:opacity-40">仅重试生图</button>
              </div>
              {runError && <div className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{runError}</div>}
              {promptOpen && <textarea value={reversedPrompt} onChange={(event) => setReversedPrompt(event.target.value)} rows={6} className={`${field} mt-2 w-full resize-y text-xs leading-relaxed`} />}
            </div>
          )}
        </section>

        {selectedAssets.length > 0 && (
          <section className={`mb-4 rounded-2xl border p-3 ${surface}`}>
            <div className="mb-2 flex items-center justify-between text-xs"><span className="font-bold">已选参考图 {selectedAssets.length}/{MAX_REFERENCES}</span><button type="button" onClick={() => setSelectedIds([])} className="opacity-60 hover:opacity-100">清空</button></div>
            <div className="flex gap-2 overflow-x-auto pb-1">{selectedAssets.map((asset, index) => <button key={asset.id} type="button" onClick={() => selectAsset(asset)} className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-emerald-400/50 bg-black"><SmartImage src={asset.previewUrl} alt={asset.title} className="h-full w-full object-cover" thumbSize={160} /><span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-black text-black">{index + 1}</span><X size={13} className="absolute right-1 top-1 rounded-full bg-black/60 text-white" /></button>)}</div>
          </section>
        )}

        <section className={`rounded-2xl border shadow-sm ${surface}`}>
          <div className="space-y-3 border-b border-current/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><LibraryBig size={18} className="text-cyan-400" /><div><div className="font-bold">参考图片库</div><div className="text-[11px] opacity-50">共享资源与我的历史生成</div></div></div>
              <button type="button" disabled={uploading} onClick={() => uploadRef.current?.click()} className="flex items-center gap-2 rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-400 disabled:opacity-45">{uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 上传并共享</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([
                ['all', '全部', Images],
                ['resources', '资源图库', Library],
                ['mine', '我的生成', ImagePlus],
              ] as const).map(([value, label, Icon]) => <button key={value} type="button" onClick={() => { setSource(value); setPage(1); }} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${source === value ? 'bg-cyan-500 text-black' : 'bg-current/5'}`}><Icon size={14} />{label}</button>)}
              <div className={`${field} flex min-w-[190px] flex-1 items-center gap-2 py-1.5`}><Search size={14} className="opacity-50" /><input value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} placeholder="搜索标题或提示词" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></div>
              {source !== 'mine' && <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }} className={`${field} text-xs`}><option value="all">全部分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
              <select value={pageSize} onChange={(event) => setPageSizePreference(Number(event.target.value))} className={`${field} text-xs`}>{PAGE_SIZES.map((value) => <option key={value} value={value}>每页 {value}</option>)}</select>
            </div>
            {message && <div className="rounded-lg bg-cyan-500/10 px-3 py-2 text-xs text-cyan-400">{message}</div>}
          </div>

          <div className="p-4">
            {loadingGallery ? (
              <div className="flex min-h-52 items-center justify-center gap-2 text-sm opacity-60"><Loader2 size={18} className="animate-spin" /> 正在加载图库</div>
            ) : galleryPage.items.length === 0 ? (
              <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-sm opacity-60"><Images size={36} /><span>没有符合条件的图片</span></div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {galleryPage.items.map((asset) => {
                  const selectionIndex = selectedIds.indexOf(asset.id);
                  return (
                    <article key={asset.id} onClick={() => selectAsset(asset)} className={`group cursor-pointer overflow-hidden rounded-xl border transition ${selectionIndex >= 0 ? 'border-emerald-400 ring-2 ring-emerald-400/40' : isDark ? 'border-white/10 bg-white/[0.03] hover:border-white/25' : 'border-black/10 bg-white hover:border-black/25'}`}>
                      <div className="relative aspect-[4/3] overflow-hidden bg-black/80">
                        <SmartImage src={asset.previewUrl} alt={asset.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" thumbSize={520} />
                        <span className={`absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${selectionIndex >= 0 ? 'bg-emerald-500 text-black' : 'bg-black/60 text-white'}`}>{selectionIndex >= 0 ? selectionIndex + 1 : <Check size={14} className="opacity-45" />}</span>
                        <button
                          type="button"
                          disabled={asset.inResourceLibrary || publishingId === asset.id}
                          onClick={(event) => { event.stopPropagation(); void publishAsset(asset); }}
                          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full ${asset.inResourceLibrary ? 'bg-cyan-500 text-black' : 'bg-black/65 text-white hover:bg-cyan-500 hover:text-black'} disabled:cursor-default`}
                          title={asset.inResourceLibrary ? '已在共享资源图库' : '加入共享资源图库'}
                        >
                          {publishingId === asset.id ? <Loader2 size={15} className="animate-spin" /> : <Library size={15} fill={asset.inResourceLibrary ? 'currentColor' : 'none'} />}
                        </button>
                        <div className="absolute bottom-2 left-2 flex gap-1">{asset.inResourceLibrary && <span className="rounded bg-black/65 px-2 py-1 text-[10px] text-white">资源图库</span>}{asset.fromMyGeneration && <span className="rounded bg-black/65 px-2 py-1 text-[10px] text-white">我的生成</span>}</div>
                      </div>
                      <div className="p-3"><div className="truncate text-sm font-bold" title={asset.title}>{asset.title}</div><div className="mt-1 flex items-center justify-between text-[10px] opacity-50"><span>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : '图片素材'}</span><span>{new Date(asset.createdAt).toLocaleDateString()}</span></div></div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-current/10 pt-4 text-xs">
              <span className="opacity-55">共 {galleryPage.total} 张 · 第 {galleryPage.page}/{galleryPage.pageCount} 页</span>
              <div className="flex items-center gap-2"><button type="button" disabled={galleryPage.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className={`${field} flex items-center gap-1 py-1.5 disabled:opacity-35`}><ChevronLeft size={14} />上一页</button><button type="button" disabled={galleryPage.page >= galleryPage.pageCount} onClick={() => setPage((value) => Math.min(galleryPage.pageCount, value + 1))} className={`${field} flex items-center gap-1 py-1.5 disabled:opacity-35`}>下一页<ChevronRight size={14} /></button></div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
