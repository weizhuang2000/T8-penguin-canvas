import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Brain, FileText, Image as ImageIcon, Loader2, Map, Play, Route, Upload } from 'lucide-react';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
import {
  extractDocument,
  getCurrentUser,
  getExhibitionPlanLayoutPromptPresets,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_MB,
  updateExhibitionPlanLayoutExcludePresets,
  updateExhibitionPlanLayoutInsertPresets,
  type AuthUser,
  type ExhibitionPlanLayoutExcludePresetItem,
  type ExhibitionPlanLayoutInsertPresetItem,
  type ExtractedDocument,
} from '../../services/api';
import { generateExternalImage, generateLlm, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import { uploadDataUrl } from '../../services/imageOps';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS,
  EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS,
  EXHIBITION_PLAN_LAYOUT_PRESETS,
  buildExhibitionPlanLayoutPrompt,
  buildExhibitionPlanOutlinePrompt,
  formatExhibitionPlanOutline,
  normalizeExhibitionPlanLayoutExcludeItems,
  normalizeExhibitionPlanLayoutInsertItems,
  normalizeExhibitionPlanLayoutPresetId,
  parseExhibitionPlanOutlineJson,
  type ExhibitionPlanLayoutChoiceItem,
  type ExhibitionPlanLayoutPreset,
} from '../../utils/exhibitionPlanLayoutPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

async function composeStructureLockedPlan(baseUrl: string, overlayUrl: string): Promise<string> {
  const [base, overlay] = await Promise.all([loadImageElement(baseUrl), loadImageElement(overlayUrl)]);
  const width = base.naturalWidth || base.width;
  const height = base.naturalHeight || base.height;
  if (!width || !height) throw new Error('原始平面图尺寸无效');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建平面布局合成画布');
  ctx.drawImage(base, 0, 0, width, height);
  ctx.drawImage(overlay, 0, 0, width, height);
  return uploadDataUrl(canvas.toDataURL('image/png'), 'exhibition-plan-layout');
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

function llmErrorMessage(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/no available accounts/i.test(message)) return '当前 LLM 没有可用账号，请切换可用的 LLM 配置后重试。';
  return message || 'LLM 请求失败';
}

function presetEditorText(presets: ExhibitionPlanLayoutChoiceItem[]) {
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

function ImageSlot({ title, subtitle, url }: { title: string; subtitle: string; url: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/15 p-2">
      <div className="mb-1 text-[11px] font-semibold text-cyan-100">{title}</div>
      <div className="mb-2 text-[10px] leading-snug text-white/45">{subtitle}</div>
      {url ? (
        <img src={url} alt="" className="h-32 w-full rounded border border-white/10 object-contain" draggable={false} />
      ) : (
        <div className="flex h-32 items-center justify-center rounded border border-dashed border-white/15 text-[10px] text-white/35">连接图像输入</div>
      )}
    </div>
  );
}

const ExhibitionPlanLayoutNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [insertPresets, setInsertPresets] = useState<ExhibitionPlanLayoutInsertPresetItem[]>([]);
  const [excludePresets, setExcludePresets] = useState<ExhibitionPlanLayoutExcludePresetItem[]>([]);
  const [insertEditorOpen, setInsertEditorOpen] = useState(false);
  const [excludeEditorOpen, setExcludeEditorOpen] = useState(false);
  const [insertEditorValue, setInsertEditorValue] = useState('');
  const [excludeEditorValue, setExcludeEditorValue] = useState('');
  const [insertSaving, setInsertSaving] = useState(false);
  const [excludeSaving, setExcludeSaving] = useState(false);
  const [insertError, setInsertError] = useState('');
  const [excludeError, setExcludeError] = useState('');
  const planImage = useInputImageByHandle(id, 'plan-image');
  const upstream = useUpstreamMaterials(id);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
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
  const status = String(d.status || 'idle');
  const busy = ['extracting', 'outlining', 'generating'].includes(status);
  const sourceText = String(d.sourceText || '');
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const useUpstream = d.useUpstream !== false;
  const effectiveSourceText = [useUpstream ? upstreamText : '', sourceText].filter((item) => item.trim()).join('\n\n');
  const layoutPresetId = normalizeExhibitionPlanLayoutPresetId(d.layoutPresetId);
  const layoutOutlineText = String(d.layoutOutlineText || '').trim();
  const structureLock = d.structureLock !== false;
  const showRoute = d.showRoute !== false;
  const showLabels = d.showLabels !== false;
  const showDescriptions = d.showDescriptions !== false;
  const insertOptions = useMemo<ExhibitionPlanLayoutChoiceItem[]>(
    () => (insertPresets.length > 0 ? insertPresets : EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS),
    [insertPresets],
  );
  const excludeOptions = useMemo<ExhibitionPlanLayoutChoiceItem[]>(
    () => (excludePresets.length > 0 ? excludePresets : EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS),
    [excludePresets],
  );
  const selectedInsertItems = useMemo(
    () => normalizeExhibitionPlanLayoutInsertItems(d.insertItems, insertOptions),
    [d.insertItems, insertOptions],
  );
  const selectedInsertIds = useMemo(() => selectedInsertItems.map((item) => item.id), [selectedInsertItems]);
  const selectedExcludeItems = useMemo(
    () => normalizeExhibitionPlanLayoutExcludeItems(d.excludeItems, excludeOptions),
    [d.excludeItems, excludeOptions],
  );
  const selectedExcludeIds = useMemo(() => selectedExcludeItems.map((item) => item.id), [selectedExcludeItems]);
  const allExcludeSelected = excludeOptions.length > 0 && selectedExcludeIds.length === excludeOptions.length;

  const buildPrompt = useCallback((outlineText: string) => buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: outlineText,
    planInterpretation: d.planInterpretation,
    layoutRequirement: d.layoutRequirement,
    layoutPresetId,
    showRoute,
    showLabels,
    showDescriptions,
    structureLock,
    insertItems: selectedInsertIds,
    excludeItems: selectedExcludeIds,
    insertItemOptions: insertOptions,
    excludeItemOptions: excludeOptions,
  }), [d.layoutRequirement, d.planInterpretation, excludeOptions, insertOptions, layoutPresetId, selectedExcludeIds, selectedInsertIds, showDescriptions, showLabels, showRoute, structureLock]);

  const pickDocument = useCallback(async (file?: File) => {
    if (!file || isReadonly || busy) return;
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      update({ status: 'error', error: `文档不能超过 ${MAX_DOCUMENT_FILE_SIZE_MB}MB`, progress: '' });
      return;
    }
    update({ status: 'extracting', progress: '文档解析中...', error: '' });
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

  const runOutline = useCallback(async (): Promise<string> => {
    const text = effectiveSourceText.trim();
    if (!text) {
      update({ status: 'error', error: '请先导入、粘贴或连接上游资料文本。', progress: '' });
      throw new Error('请先提供资料文本');
    }
    update({ status: 'outlining', progress: 'LLM 提炼平面布局大纲中...', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.25,
        max_tokens: 2400,
        messages: [
          { role: 'system', content: '你是资深展陈策划与空间规划专家。你只输出严格 JSON。' },
          { role: 'user', content: buildExhibitionPlanOutlinePrompt({ sourceText: text, insertItems: selectedInsertIds, excludeItems: selectedExcludeIds, insertItemOptions: insertOptions, excludeItemOptions: excludeOptions }) },
        ],
      });
      const formatted = formatExhibitionPlanOutline(parseExhibitionPlanOutlineJson(response.content || ''));
      if (!formatted) throw new Error('LLM 未返回有效大纲');
      update({ layoutOutlineText: formatted, outputText: formatted, text: formatted, prompt: formatted, status: 'idle', progress: '', error: '' });
      return formatted;
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      throw error;
    }
  }, [activeLlmConfig?.id, effectiveSourceText, excludeOptions, insertOptions, llmModel, selectedExcludeIds, selectedInsertIds, update]);

  const runGenerate = useCallback(async () => {
    if (isReadonly) return;
    if (!planImage) {
      update({ status: 'error', error: '请先连接原始建筑平面图。', progress: '' });
      return;
    }
    let outlineText = layoutOutlineText;
    if (!outlineText && effectiveSourceText.trim()) {
      outlineText = await runOutline();
    }
    const imagePrompt = buildPrompt(outlineText);
    const refs = [planImage].filter(Boolean);
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-plan-layout:${id.slice(0, 6)}`;
    const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType: 'exhibition-plan-layout', seed: runSeed, nodeTitle: '平面自动布局' };
    update({ status: 'generating', progress: '提交平面布局生图...', error: '', imageUrls: [], lastPrompt: imagePrompt, lastSeed: runSeed, referenceImages: refs });
    try {
      logBus.info(`平面自动布局提交 seed=${runSeed}`, src);
      const generationOutputFormat = structureLock ? 'png' : outputFormat;
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
          images: refs,
          outputFormat: generationOutputFormat,
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
              outputFormat: generationOutputFormat,
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
          images: refs,
          n: 1,
          outputFormat: generationOutputFormat,
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
            const q = await queryImageStatus(submit.taskId, apiModel, generationOutputFormat, historyContext);
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
      const overlayUrls = urls;
      if (structureLock) {
        update({ progress: '合成结构锁定底图...' });
        const composedUrl = await composeStructureLockedPlan(planImage, overlayUrls[0]);
        urls = [composedUrl];
      }
      update({
        status: 'success',
        progress: '100%',
        imageUrl: urls[0],
        imageUrls: urls,
        urls,
        overlayUrl: structureLock ? overlayUrls[0] : '',
        overlayUrls: structureLock ? overlayUrls : [],
        structureLockedBaseUrl: structureLock ? planImage : '',
        prompt: imagePrompt,
        outputText: imagePrompt,
        text: imagePrompt,
        referenceImages: refs,
        error: '',
      });
      logBus.success(`平面自动布局完成 ${urls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`平面自动布局失败: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, aspectRatio, buildPrompt, d.providerParams, effectiveSourceText, externalProviderModel, id, isExternalSelected, isReadonly, layoutOutlineText, modelDef.id, modelDef.paramKind, outputFormat, planImage, providerSelection.provider, runOutline, seed, sizeLevel, structureLock, update]);

  useRunTrigger(id, runGenerate, 'image');

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getExhibitionPlanLayoutPromptPresets()
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
    setInsertEditorValue(presetEditorText(insertOptions));
    setInsertError('');
  }, [insertEditorOpen, insertOptions]);

  useEffect(() => {
    if (!excludeEditorOpen) return;
    setExcludeEditorValue(presetEditorText(excludeOptions));
    setExcludeError('');
  }, [excludeEditorOpen, excludeOptions]);

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
      const saved = await updateExhibitionPlanLayoutInsertPresets(presets);
      setInsertPresets(saved);
      update({ insertItems: normalizeExhibitionPlanLayoutInsertItems(selectedInsertIds, saved).map((item) => item.id) });
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
      const saved = await updateExhibitionPlanLayoutExcludePresets(presets);
      setExcludePresets(saved);
      update({ excludeItems: normalizeExhibitionPlanLayoutExcludeItems(selectedExcludeIds, saved).map((item) => item.id) });
      setExcludeEditorOpen(false);
    } catch (error: any) {
      setExcludeError(error?.message || '保存排除项失败');
    } finally {
      setExcludeSaving(false);
    }
  };

  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      className={`relative w-[720px] rounded-xl border-2 transition-all ${selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'}`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle id="plan-image" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-amber-300" style={{ top: '22%' }} title="输入：原始建筑平面图" />
      <Handle id="outline-text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-sky-300" style={{ top: '42%' }} title="输入：大纲/资料文本" />
      <Handle type="source" position={Position.Right} className="!bg-cyan-300 !border-0" title="输出：展陈平面布局图" />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200"><Map size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">平面自动布局</div>
          <div className="truncate text-[10px] text-white/45">平面图约束 / 大纲提炼 / 动线与标注控制</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[780px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section className="grid grid-cols-2 gap-2">
          <ImageSlot title="原始建筑平面图" subtitle="图1，唯一建筑结构依据，必须连接" url={planImage} />
          <div className="rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 text-[11px] font-semibold text-cyan-100">平面图解析</div>
            <div className="mb-2 text-[10px] leading-snug text-white/45">定义图1的比例、尺寸、颜色、墙体、柱子和不可移动结构</div>
            <textarea
              className={`${FIELD} h-32 resize-y`}
              value={d.planInterpretation || ''}
              disabled={isReadonly || busy}
              placeholder="例如：总体宽30米，长40米，蓝色线条代表墙体，灰色方块代表柱子，都不可移动"
              onChange={(event) => update({ planInterpretation: event.target.value })}
            />
          </div>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5">
            <FileText size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">资料与大纲</span>
            <button type="button" className={`${BUTTON} ml-auto`} disabled={isReadonly || busy} onClick={() => fileRef.current?.click()}>
              <Upload size={12} /> 导入
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
          <textarea
            className={`${FIELD} min-h-[72px] resize-y`}
            value={sourceText}
            disabled={isReadonly || busy}
            placeholder="导入 DOCX/PDF/TXT，或粘贴展陈资料原文；也可从左侧连接上游大纲文本"
            onChange={(event) => update({ sourceText: event.target.value })}
          />
          <label className="flex items-center gap-1.5 text-[10px] text-white/60">
            <input
              type="checkbox"
              className="h-3 w-3 accent-cyan-300"
              checked={useUpstream}
              disabled={isReadonly || busy}
              onChange={(event) => update({ useUpstream: event.target.checked })}
            />
            合并左侧上游文本作为资料/大纲
          </label>
          <div className="grid grid-cols-2 gap-2">
            <select
              className={FIELD}
              disabled={isReadonly || busy}
              value={`llm-key:${activeLlmConfig?.id || 'default'}`}
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId.startsWith('llm-key:')) update({ llmKeyId: nextId.slice(8), llmModel: '' });
              }}
            >
              {llmConfigOptions.map((item) => (
                <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>
              ))}
            </select>
            <input className={FIELD} disabled value={llmModel} title="模型由所选 LLM 配置决定" />
          </div>
          <button type="button" className="t8-btn min-h-8 w-full px-2 text-[11px]" disabled={isReadonly || busy} onClick={() => void runOutline()}>
            {status === 'outlining' ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
            提炼大纲
          </button>
          <textarea
            className={`${FIELD} min-h-[112px] resize-y`}
            value={d.layoutOutlineText || ''}
            disabled={isReadonly || busy}
            placeholder="这里会生成或填写展区大纲目录；生成平面布局时会作为展区划分依据"
            onChange={(event) => update({ layoutOutlineText: event.target.value })}
          />
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><Route size={13} /> 布局要求</div>
          <select className={FIELD} value={layoutPresetId} disabled={isReadonly || busy} onChange={(event) => update({ layoutPresetId: normalizeExhibitionPlanLayoutPresetId(event.target.value) })}>
            {EXHIBITION_PLAN_LAYOUT_PRESETS.map((preset: ExhibitionPlanLayoutPreset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <textarea
            className={`${FIELD} min-h-[64px] resize-y`}
            value={d.layoutRequirement || ''}
            disabled={isReadonly || busy}
            placeholder="补充布局要求：例如入口方向、必须保留的房间、重点展项位置、团队参观、消防通道等"
            onChange={(event) => update({ layoutRequirement: event.target.value })}
          />
          <label className="flex items-center gap-1.5 rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1.5 text-[10px] text-cyan-50">
            <input
              type="checkbox"
              className="h-3 w-3 accent-cyan-300"
              checked={structureLock}
              disabled={isReadonly || busy}
              onChange={(event) => update({ structureLock: event.target.checked })}
            />
            结构锁定模式：只生成透明展陈叠加层，最终保留图1原始墙柱底图合成
          </label>
          <div className="grid grid-cols-3 gap-1">
            {[
              ['showRoute', '显示动线', showRoute],
              ['showLabels', '显示标注文字', showLabels],
              ['showDescriptions', '显示说明文字', showDescriptions],
            ].map(([key, label, checked]) => (
              <label key={String(key)} className="flex min-h-8 items-center justify-center gap-1 rounded border border-white/10 bg-black/15 px-1 text-[10px] text-white/70">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-cyan-300"
                  checked={Boolean(checked)}
                  disabled={isReadonly || busy}
                  onChange={(event) => update({ [String(key)]: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 rounded border border-white/10 bg-black/15 p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-cyan-100">植入项</span>
                <button
                  type="button"
                  className={`${BUTTON} ml-auto h-6 px-1.5`}
                  disabled={isReadonly || busy}
                  onClick={() => update({ insertItems: insertOptions.map((item) => item.id) })}
                >
                  全选
                </button>
              </div>
              {canManageTeam && (
                <div className="space-y-1 rounded border border-cyan-300/20 bg-cyan-300/10 p-1.5">
                  <button
                    type="button"
                    className={`${BUTTON} h-6 px-1.5`}
                    disabled={busy || insertSaving}
                    onClick={() => setInsertEditorOpen((open) => !open)}
                  >
                    {insertEditorOpen ? '收起编辑' : '编辑植入项'}
                  </button>
                  {insertEditorOpen && (
                    <>
                      <textarea
                        className={`${FIELD} min-h-[88px] resize-y`}
                        value={insertEditorValue}
                        disabled={insertSaving}
                        placeholder="每行一个植入项"
                        onChange={(event) => setInsertEditorValue(event.target.value)}
                      />
                      {insertError && <div className="text-[9px] text-red-200">{insertError}</div>}
                      <div className="flex justify-end gap-1">
                        <button type="button" className={`${BUTTON} h-6 px-1.5`} disabled={insertSaving} onClick={() => setInsertEditorOpen(false)}>取消</button>
                        <button type="button" className={`${BUTTON} h-6 border-cyan-300/30 bg-cyan-300/15 px-1.5 text-cyan-100`} disabled={insertSaving} onClick={() => void saveInsertPresets()}>
                          {insertSaving ? '保存中' : '保存'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-1">
                {insertOptions.map((item: ExhibitionPlanLayoutChoiceItem) => {
                  const checked = selectedInsertIds.includes(item.id);
                  return (
                    <label key={item.id} className="flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-1 text-[9px] text-white/65">
                      <input
                        type="checkbox"
                        className="h-3 w-3 accent-cyan-300"
                        checked={checked}
                        disabled={isReadonly || busy}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? Array.from(new Set([...selectedInsertIds, item.id]))
                            : selectedInsertIds.filter((itemId) => itemId !== item.id);
                          update({ insertItems: next });
                        }}
                      />
                      {item.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1 rounded border border-white/10 bg-black/15 p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-cyan-100">排除项</span>
                <button
                  type="button"
                  className={`${BUTTON} ml-auto h-6 px-1.5`}
                  disabled={isReadonly || busy}
                  onClick={() => update({ excludeItems: allExcludeSelected ? [] : excludeOptions.map((item) => item.id) })}
                >
                  {allExcludeSelected ? '清空' : '全选'}
                </button>
              </div>
              {canManageTeam && (
                <div className="space-y-1 rounded border border-cyan-300/20 bg-cyan-300/10 p-1.5">
                  <button
                    type="button"
                    className={`${BUTTON} h-6 px-1.5`}
                    disabled={busy || excludeSaving}
                    onClick={() => setExcludeEditorOpen((open) => !open)}
                  >
                    {excludeEditorOpen ? '收起编辑' : '编辑排除项'}
                  </button>
                  {excludeEditorOpen && (
                    <>
                      <textarea
                        className={`${FIELD} min-h-[88px] resize-y`}
                        value={excludeEditorValue}
                        disabled={excludeSaving}
                        placeholder="每行一个排除项"
                        onChange={(event) => setExcludeEditorValue(event.target.value)}
                      />
                      {excludeError && <div className="text-[9px] text-red-200">{excludeError}</div>}
                      <div className="flex justify-end gap-1">
                        <button type="button" className={`${BUTTON} h-6 px-1.5`} disabled={excludeSaving} onClick={() => setExcludeEditorOpen(false)}>取消</button>
                        <button type="button" className={`${BUTTON} h-6 border-cyan-300/30 bg-cyan-300/15 px-1.5 text-cyan-100`} disabled={excludeSaving} onClick={() => void saveExcludePresets()}>
                          {excludeSaving ? '保存中' : '保存'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-1">
                {excludeOptions.map((item: ExhibitionPlanLayoutChoiceItem) => {
                  const checked = selectedExcludeIds.includes(item.id);
                  return (
                    <label key={item.id} className="flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-1 text-[9px] text-white/65">
                      <input
                        type="checkbox"
                        className="h-3 w-3 accent-cyan-300"
                        checked={checked}
                        disabled={isReadonly || busy}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? Array.from(new Set([...selectedExcludeIds, item.id]))
                            : selectedExcludeIds.filter((itemId) => itemId !== item.id);
                          update({ excludeItems: next });
                        }}
                      />
                      {item.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生图</div>
            <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成平面布局</button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
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
            <label className="space-y-1">
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
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">基础模型</span>
              <select className={FIELD} value={modelDef.id} disabled={isReadonly || busy || isExternalSelected} onChange={(event) => update({ model: event.target.value, apiModel: (availableModelDefs.find((item) => item.id === event.target.value) || modelDef).apiModel })}>
                {availableModelDefs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">画面比例</span>
              <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
                {modelDef.aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">分辨率</span>
              <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">输出格式</span>
              <div className="grid grid-cols-2 gap-0.5 rounded bg-white/5 p-0.5">
                {(['jpg', 'png'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    disabled={isReadonly || busy}
                    onClick={() => update({ outputFormat: fmt })}
                    className={`rounded py-1 text-[10px] font-semibold transition-all ${outputFormat === fmt ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">Seed</span>
              <input className={FIELD} type="number" min={0} value={seed || ''} disabled={isReadonly || busy} placeholder="随机" onChange={(event) => update({ seed: event.target.value })} />
            </label>
          </div>
          {d.progress && <div className="text-[10px] text-cyan-100">{d.progress}</div>}
          {d.imageUrl && <img src={d.imageUrl} alt="" className="max-h-64 w-full rounded border border-white/10 object-contain" draggable={false} />}
        </section>
      </div>
    </div>
  );
};

export default memo(ExhibitionPlanLayoutNode);
