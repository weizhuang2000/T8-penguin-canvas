import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Brain, FileText, Image as ImageIcon, Loader2, Map, Play, Route, Sparkles, Upload } from 'lucide-react';
import { EXHIBITION_IMAGE_HANDLE_COLOR, EXHIBITION_TEXT_HANDLE_COLOR } from '../../config/portTypes';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
import {
  extractDocument,
  getCurrentUser,
  getExhibitionAiPlanLayoutPromptPresets,
  getExhibitionPlanLayoutPromptPresets,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE_MB,
  updateExhibitionAiPlanLayoutRequirementPresets,
  updateExhibitionAiPlanLayoutStylePresets,
  updateExhibitionPlanLayoutExcludePresets,
  updateExhibitionPlanLayoutInsertPresets,
  type AuthUser,
  type ExhibitionAiPlanLayoutPresetItem,
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
  buildExhibitionAiPlanInterpretationPrompt,
  buildExhibitionAiPlanLayoutPrompt,
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
import NodeHelpButton from './NodeHelpButton';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const TRANSIENT_GENERATION_RETRIES = 3;
const TRANSIENT_GENERATION_RETRY_DELAYS = [2200, 5200, 9000];

const OUTLINE_AND_LAYOUT_REQUIREMENT = [
  '参考图是一张建筑平面布局图，墙体、柱子、入口和出口都必须作为不可移动的原始建筑结构。',
  '总体宽30米，长40米，蓝色线条代表墙体，灰色方块代表柱子，都不可移动。',
  '在原始建筑平面图上规划展陈分区、参观动线和展陈设施。',
  '围着原建筑墙的内侧建一圈连续展陈空间，避免展陈设施穿墙或压住柱子。',
  '不能移动或删除参考图中的墙体、柱子、外轮廓、门洞、入口、出口和既有房间边界。',
  '用一条从入口开始、最后到出口的连续参观动线串联每个空间，动线只有一条且没有分叉。',
  '所有柱子要与新建展墙、展柜、展台、展区边界或装置形成明确关系，不要孤零零漂浮。',
  '只显示展陈设施的俯视图，不要生成室内透视、立面或鸟瞰效果图。',
].join('\n');

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
  const pages = meta.pageCount ? ` / ${meta.pageCount} 页` : '';
  return `${meta.name} / ${meta.charCount} 字${pages}`;
}

function randomImageSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return (values[0] % MAX_IMAGE_SEED) + 1;
  }
  return Math.floor(Math.random() * MAX_IMAGE_SEED) + 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGenerationError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '');
  return /接口返回非 JSON|鎺ュ彛杩斿洖闈?JSON|HTTP\s*502|502\.3|Bad Gateway|gateway|上游|代理临时错误|涓婃父|浠ｇ悊涓存椂閿欒|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(message);
}

async function retryTransientGeneration<T>(
  action: () => Promise<T>,
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_GENERATION_RETRIES; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= TRANSIENT_GENERATION_RETRIES || !isTransientGenerationError(error)) throw error;
      const delayMs = TRANSIENT_GENERATION_RETRY_DELAYS[Math.min(attempt, TRANSIENT_GENERATION_RETRY_DELAYS.length - 1)];
      onRetry?.(attempt + 1, delayMs, error);
      await sleep(delayMs);
    }
  }
  throw lastError;
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

function labelPresetEditorText(presets: ExhibitionPlanLayoutChoiceItem[]) {
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

function promptPresetEditorText(presets: ExhibitionAiPlanLayoutPresetItem[]) {
  return presets.map((preset) => `${preset.label}｜${preset.prompt}`).join('\n');
}

function parsePromptPresetEditorText(text: string, fallbackId: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const raw = line.trim();
      if (!raw) return null;
      const parts = raw.split(/[|｜]/);
      const label = (parts.shift() || '').trim();
      const prompt = (parts.join('｜') || label).trim();
      if (!label || !prompt) return null;
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallbackId}-${index + 1}`,
        label,
        prompt,
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; prompt: string; order: number }>;
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
  const isAiPlanLayout = d.aiPlanLayoutMode === true;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [insertPresets, setInsertPresets] = useState<ExhibitionPlanLayoutInsertPresetItem[]>([]);
  const [excludePresets, setExcludePresets] = useState<ExhibitionPlanLayoutExcludePresetItem[]>([]);
  const [stylePresets, setStylePresets] = useState<ExhibitionAiPlanLayoutPresetItem[]>([]);
  const [requirementPresets, setRequirementPresets] = useState<ExhibitionAiPlanLayoutPresetItem[]>([]);
  const [insertEditorOpen, setInsertEditorOpen] = useState(false);
  const [excludeEditorOpen, setExcludeEditorOpen] = useState(false);
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [requirementEditorOpen, setRequirementEditorOpen] = useState(false);
  const [insertEditorValue, setInsertEditorValue] = useState('');
  const [excludeEditorValue, setExcludeEditorValue] = useState('');
  const [styleEditorValue, setStyleEditorValue] = useState('');
  const [requirementEditorValue, setRequirementEditorValue] = useState('');
  const [insertSaving, setInsertSaving] = useState(false);
  const [excludeSaving, setExcludeSaving] = useState(false);
  const [styleSaving, setStyleSaving] = useState(false);
  const [requirementSaving, setRequirementSaving] = useState(false);
  const [insertError, setInsertError] = useState('');
  const [excludeError, setExcludeError] = useState('');
  const [styleError, setStyleError] = useState('');
  const [requirementError, setRequirementError] = useState('');

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
  const busy = ['extracting', 'outlining', 'analyzing', 'generating'].includes(status);
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

  const buildPrompt = useCallback((outlineText: string, extraLayoutRequirement = '', planAiInterpretation = '') => {
    const values = {
      layoutOutlineText: outlineText,
      planInterpretation: d.planInterpretation,
      planAiInterpretation: planAiInterpretation || d.planAiInterpretation,
      styleRequirement: d.styleRequirement,
      specialRequirement: [d.specialRequirement, extraLayoutRequirement].map((item) => String(item || '').trim()).filter(Boolean).join('\n\n'),
      layoutRequirement: isAiPlanLayout ? d.layoutRequirement : [d.layoutRequirement, extraLayoutRequirement].map((item) => String(item || '').trim()).filter(Boolean).join('\n\n'),
      layoutPresetId,
      showRoute,
      showLabels,
      showDescriptions,
      structureLock,
      insertItems: selectedInsertIds,
      excludeItems: selectedExcludeIds,
      insertItemOptions: insertOptions,
      excludeItemOptions: excludeOptions,
    };
    return isAiPlanLayout ? buildExhibitionAiPlanLayoutPrompt(values) : buildExhibitionPlanLayoutPrompt(values);
  }, [d.layoutRequirement, d.planAiInterpretation, d.planInterpretation, d.specialRequirement, d.styleRequirement, excludeOptions, insertOptions, isAiPlanLayout, layoutPresetId, selectedExcludeIds, selectedInsertIds, showDescriptions, showLabels, showRoute, structureLock]);

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

  const runAnalyzePlan = useCallback(async (outlineText = ''): Promise<string> => {
    if (!planImage) {
      update({ status: 'error', error: '请先连接原始建筑平面图。', progress: '' });
      throw new Error('请先连接原始建筑平面图');
    }
    const text = String(outlineText || layoutOutlineText || effectiveSourceText || '').trim();
    update({ status: 'analyzing', progress: 'LLM 正在读取原始建筑平面图...', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.15,
        max_tokens: 2200,
        messages: [
          { role: 'system', content: '你是资深展陈空间规划师和建筑平面图识图专家。必须把原建筑墙体、柱子、门洞、外轮廓和入口出口视为不可动结构。' },
          {
            role: 'user',
            content: [
              { type: 'text', text: buildExhibitionAiPlanInterpretationPrompt({ outlineText: text, planInterpretation: d.planInterpretation }) },
              { type: 'image_url', image_url: { url: planImage } },
            ],
          },
        ],
      });
      const interpretation = String(response.content || '').trim();
      if (!interpretation) throw new Error('LLM 未返回有效平面解析');
      update({
        planAiInterpretation: interpretation,
        outputText: interpretation,
        text: interpretation,
        prompt: interpretation,
        status: 'idle',
        progress: '',
        error: '',
      });
      return interpretation;
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      throw error;
    }
  }, [activeLlmConfig?.id, d.planInterpretation, effectiveSourceText, layoutOutlineText, llmModel, planImage, update]);

  const runGenerateWithOptions = useCallback(async (options: { outlineText?: string; extraLayoutRequirement?: string; forceAnalyze?: boolean } = {}) => {
    if (isReadonly) return;
    if (!planImage) {
      update({ status: 'error', error: '请先连接原始建筑平面图。', progress: '' });
      return;
    }
    let outlineText = String(options.outlineText || layoutOutlineText || (isAiPlanLayout ? effectiveSourceText : '') || '').trim();
    if (!isAiPlanLayout && !outlineText && effectiveSourceText.trim()) {
      outlineText = await runOutline();
    }
    let planAiInterpretation = String(d.planAiInterpretation || '').trim();
    if (isAiPlanLayout && (options.forceAnalyze || !planAiInterpretation)) {
      planAiInterpretation = await runAnalyzePlan(outlineText);
    }
    const imagePrompt = buildPrompt(outlineText, options.extraLayoutRequirement || '', planAiInterpretation);
    const refs = [planImage].filter(Boolean);
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const sourceNodeType = isAiPlanLayout ? 'exhibition-ai-plan-layout' : 'exhibition-plan-layout';
    const src = `${sourceNodeType}:${id.slice(0, 6)}`;
    const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType, seed: runSeed, nodeTitle: isAiPlanLayout ? '平面AI布局' : '平面自动布局' };
    update({ status: 'generating', progress: isAiPlanLayout ? '提交平面AI布局生图...' : '提交平面布局生图...', error: '', imageUrls: [], lastPrompt: imagePrompt, lastSeed: runSeed, referenceImages: refs });
    try {
      logBus.info(`${historyContext.nodeTitle}提交 seed=${runSeed}`, src);
      const generationOutputFormat = structureLock ? 'png' : outputFormat;
      const onTransientRetry = (attempt: number, delayMs: number, error: unknown) => {
        const reason = String((error as any)?.message || error || '').replace(/\s+/g, ' ').slice(0, 90);
        update({
          progress: `上游临时错误，${Math.round(delayMs / 1000)} 秒后重试 ${attempt}/${TRANSIENT_GENERATION_RETRIES}`,
          error: reason,
        });
      };
      let urls: string[] = [];
      if (isExternalSelected && providerSelection.provider) {
        const selectedProvider = providerSelection.provider;
        if (!externalProviderModel) throw new Error('扩展平台未配置可用图像模型');
        const size = externalImageSizeFor(aspectRatio, sizeLevel);
        let res = await retryTransientGeneration(() => generateExternalImage({
          providerId: selectedProvider.id,
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
        }), onTransientRetry);
        if ((!res.imageUrls?.length) && res.taskId && (res.code === 'running' || res.status === 'running')) {
          let pollingTaskId = res.taskId;
          for (let index = 0; index < EXTERNAL_IMAGE_MAX_POLLS; index += 1) {
            if (pollAbortRef.current) throw new Error('任务已取消');
            await sleep(EXTERNAL_IMAGE_POLL_INTERVAL_MS);
            res = await retryTransientGeneration(() => queryExternalImageStatus({
              providerId: selectedProvider.id,
              providerModel: externalProviderModel,
              taskId: pollingTaskId,
              outputFormat: generationOutputFormat,
              historyContext,
            }), onTransientRetry);
            pollingTaskId = res.taskId || pollingTaskId;
            update({ taskId: pollingTaskId, progress: `${Math.min(99, Math.round(((index + 1) / EXTERNAL_IMAGE_MAX_POLLS) * 100))}%` });
            if (res.imageUrls?.length || (res.code && res.code !== 'running')) break;
          }
        }
        urls = res.imageUrls || [];
      } else {
        const submit = await retryTransientGeneration(() => submitImageAsync({
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
        }), onTransientRetry);
        urls = submit.urls || [];
        if (!submit.sync) {
          if (!submit.taskId) throw new Error('未获取到任务 ID');
          const pollingTaskId = submit.taskId;
          let lastProgress = submit.progress || '5%';
          update({ taskId: pollingTaskId, progress: lastProgress });
          for (let index = 0; index < 1800; index += 1) {
            if (pollAbortRef.current) throw new Error('任务已取消');
            await sleep(2000);
            const q = await retryTransientGeneration(() => queryImageStatus(pollingTaskId, apiModel, generationOutputFormat, historyContext), onTransientRetry);
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
        planAiInterpretation: isAiPlanLayout ? planAiInterpretation : d.planAiInterpretation,
        prompt: imagePrompt,
        outputText: imagePrompt,
        text: imagePrompt,
        referenceImages: refs,
        error: '',
      });
      logBus.success(`${historyContext.nodeTitle}完成 ${urls.length} 张`, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`${historyContext.nodeTitle}失败: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, aspectRatio, buildPrompt, d.planAiInterpretation, d.providerParams, effectiveSourceText, externalProviderModel, id, isAiPlanLayout, isExternalSelected, isReadonly, layoutOutlineText, modelDef.id, modelDef.paramKind, outputFormat, planImage, providerSelection.provider, runAnalyzePlan, runOutline, seed, sizeLevel, structureLock, update]);

  const runGenerate = useCallback(async () => {
    await runGenerateWithOptions();
  }, [runGenerateWithOptions]);

  const runOutlineAndLayout = useCallback(async () => {
    if (isReadonly || busy) return;
    if (!planImage) {
      update({ status: 'error', error: '请先连接原始建筑平面图。', progress: '' });
      return;
    }
    if (isAiPlanLayout) {
      await runGenerateWithOptions({ forceAnalyze: true });
      return;
    }
    const outlineText = await runOutline();
    await runGenerateWithOptions({ outlineText, extraLayoutRequirement: OUTLINE_AND_LAYOUT_REQUIREMENT });
  }, [busy, isAiPlanLayout, isReadonly, planImage, runGenerateWithOptions, runOutline, update]);

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
    getExhibitionAiPlanLayoutPromptPresets()
      .then((presets) => {
        setStylePresets(presets.styles || []);
        setRequirementPresets(presets.requirements || []);
      })
      .catch(() => {
        setStylePresets([]);
        setRequirementPresets([]);
      });
  }, []);

  useEffect(() => {
    if (!insertEditorOpen) return;
    setInsertEditorValue(labelPresetEditorText(insertOptions));
    setInsertError('');
  }, [insertEditorOpen, insertOptions]);

  useEffect(() => {
    if (!excludeEditorOpen) return;
    setExcludeEditorValue(labelPresetEditorText(excludeOptions));
    setExcludeError('');
  }, [excludeEditorOpen, excludeOptions]);

  useEffect(() => {
    if (!styleEditorOpen) return;
    setStyleEditorValue(promptPresetEditorText(stylePresets));
    setStyleError('');
  }, [styleEditorOpen, stylePresets]);

  useEffect(() => {
    if (!requirementEditorOpen) return;
    setRequirementEditorValue(promptPresetEditorText(requirementPresets));
    setRequirementError('');
  }, [requirementEditorOpen, requirementPresets]);

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

  const saveStylePresets = async () => {
    if (!canManageTeam) return;
    const presets = parsePromptPresetEditorText(styleEditorValue, 'style');
    if (presets.length === 0) {
      setStyleError('请至少保留一项风格预设。');
      return;
    }
    setStyleSaving(true);
    setStyleError('');
    try {
      const saved = await updateExhibitionAiPlanLayoutStylePresets(presets);
      setStylePresets(saved);
      setStyleEditorOpen(false);
    } catch (error: any) {
      setStyleError(error?.message || '保存风格预设失败');
    } finally {
      setStyleSaving(false);
    }
  };

  const saveRequirementPresets = async () => {
    if (!canManageTeam) return;
    const presets = parsePromptPresetEditorText(requirementEditorValue, 'requirement');
    if (presets.length === 0) {
      setRequirementError('请至少保留一项特殊要求预设。');
      return;
    }
    setRequirementSaving(true);
    setRequirementError('');
    try {
      const saved = await updateExhibitionAiPlanLayoutRequirementPresets(presets);
      setRequirementPresets(saved);
      setRequirementEditorOpen(false);
    } catch (error: any) {
      setRequirementError(error?.message || '保存特殊要求预设失败');
    } finally {
      setRequirementSaving(false);
    }
  };

  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      data-exhibition-compact-node-type={isAiPlanLayout ? 'exhibition-ai-plan-layout' : 'exhibition-plan-layout'}
      className={`relative w-[720px] rounded-xl border-2 transition-all ${selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'}`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle id="plan-image" type="target" position={Position.Left} className="!h-3 !w-3 !border-0" style={{ top: '22%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：原始建筑平面图" />
      <Handle id="outline-text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0" style={{ top: '42%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="输入：文本大纲" />
      <Handle type="source" position={Position.Right} className="!border-0" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：展陈平面布局图" />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">{isAiPlanLayout ? <Sparkles size={16} /> : <Map size={16} />}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{isAiPlanLayout ? '平面AI布局' : '平面自动布局'}</div>
          <div className="truncate text-[10px] text-white/45">{isAiPlanLayout ? 'AI读取建筑平面 / 结构锁定 / 展陈布局叠加' : '平面图约束 / 大纲提炼 / 动线与标注控制'}</div>
        </div>
        <NodeHelpButton nodeType={isAiPlanLayout ? 'exhibition-ai-plan-layout' : 'exhibition-plan-layout'} />
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[780px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section data-exhibition-compact-section="input" data-exhibition-compact-item="main" className="grid grid-cols-2 gap-2">
          <ImageSlot title="原始建筑平面图" subtitle="图1，唯一建筑结构依据；墙体和柱子不可动" url={planImage} />
          <div className="rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 text-[11px] font-semibold text-cyan-100">平面图解析</div>
            <div className="mb-2 text-[10px] leading-snug text-white/45">补充比例、颜色含义、入口出口、墙体、柱子和不可动结构</div>
            <textarea
              className={`${FIELD} h-32 resize-y`}
              value={d.planInterpretation || ''}
              disabled={isReadonly || busy}
              placeholder="例如：蓝色线条代表墙体，灰色方块代表柱子，红色箭头为入口/出口，均不可移动"
              onChange={(event) => update({ planInterpretation: event.target.value })}
            />
          </div>
        </section>

        <section data-exhibition-compact-section="layout" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
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
            placeholder="导入 DOCX/PDF/TXT，或粘贴展陈资料/文本大纲；也可连接上游文本节点"
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
                <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` / ${item.model}` : ''}</option>
              ))}
            </select>
            <input className={FIELD} disabled value={llmModel} title="模型由所选 LLM 配置决定" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" disabled={isReadonly || busy} onClick={() => void runOutline()}>
              {status === 'outlining' ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              提炼大纲
            </button>
            <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" disabled={isReadonly || busy} onClick={() => void runOutlineAndLayout()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Route size={14} />}
              {isAiPlanLayout ? 'AI布局生成' : '提炼加布局'}
            </button>
          </div>
          <textarea
            className={`${FIELD} min-h-[112px] resize-y`}
            value={d.layoutOutlineText || ''}
            disabled={isReadonly || busy}
            placeholder="这里会生成或填写展区大纲目录；生成平面布局时会作为展区划分依据"
            onChange={(event) => update({ layoutOutlineText: event.target.value })}
          />
        </section>

        <section data-exhibition-compact-section="model" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><Route size={13} /> 布局要求</div>
          {isAiPlanLayout && (
            <div className="space-y-2 rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-cyan-100">风格预设</span>
                  <select
                    className={FIELD}
                    value={d.stylePresetId || ''}
                    disabled={isReadonly || busy}
                    onChange={(event) => {
                      const preset = stylePresets.find((item) => item.id === event.target.value);
                      update({ stylePresetId: event.target.value, styleRequirement: preset?.prompt || d.styleRequirement || '' });
                    }}
                  >
                    <option value="">手动填写风格</option>
                    {stylePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-cyan-100">特殊要求预设</span>
                  <select
                    className={FIELD}
                    value={d.requirementPresetId || ''}
                    disabled={isReadonly || busy}
                    onChange={(event) => {
                      const preset = requirementPresets.find((item) => item.id === event.target.value);
                      update({ requirementPresetId: event.target.value, specialRequirement: preset?.prompt || d.specialRequirement || '' });
                    }}
                  >
                    <option value="">手动填写要求</option>
                    {requirementPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                  </select>
                </label>
              </div>
              <textarea
                className={`${FIELD} min-h-[58px] resize-y`}
                value={d.styleRequirement || ''}
                disabled={isReadonly || busy}
                placeholder="风格要求，例如：科技馆蓝白线稿汇报风、极简博物馆风、儿童研学明亮风"
                onChange={(event) => update({ styleRequirement: event.target.value, stylePresetId: '' })}
              />
              <textarea
                className={`${FIELD} min-h-[72px] resize-y`}
                value={d.specialRequirement || ''}
                disabled={isReadonly || busy}
                placeholder="特殊要求，例如：入口右侧设置接待区、保留消防通道、主展项靠近中庭、动线单向无分叉"
                onChange={(event) => update({ specialRequirement: event.target.value, requirementPresetId: '' })}
              />
              <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" disabled={isReadonly || busy || !planImage} onClick={() => void runAnalyzePlan()}>
                {status === 'analyzing' ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                AI读取平面
              </button>
              {d.planAiInterpretation && (
                <textarea
                  className={`${FIELD} min-h-[88px] resize-y`}
                  value={d.planAiInterpretation || ''}
                  disabled={isReadonly || busy}
                  placeholder="AI平面解析会显示在这里"
                  onChange={(event) => update({ planAiInterpretation: event.target.value })}
                />
              )}
              {canManageTeam && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 rounded border border-white/10 bg-black/15 p-2">
                    <button type="button" className={`${BUTTON} h-6 px-1.5`} disabled={busy || styleSaving} onClick={() => setStyleEditorOpen((open) => !open)}>
                      {styleEditorOpen ? '收起风格预设' : '编辑风格预设'}
                    </button>
                    {styleEditorOpen && (
                      <>
                        <textarea className={`${FIELD} min-h-[88px] resize-y`} value={styleEditorValue} disabled={styleSaving} placeholder="每行：名称｜提示词" onChange={(event) => setStyleEditorValue(event.target.value)} />
                        {styleError && <div className="text-[9px] text-red-200">{styleError}</div>}
                        <button type="button" className={`${BUTTON} h-6 border-cyan-300/30 bg-cyan-300/15 px-1.5 text-cyan-100`} disabled={styleSaving} onClick={() => void saveStylePresets()}>
                          {styleSaving ? '保存中' : '保存'}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="space-y-1 rounded border border-white/10 bg-black/15 p-2">
                    <button type="button" className={`${BUTTON} h-6 px-1.5`} disabled={busy || requirementSaving} onClick={() => setRequirementEditorOpen((open) => !open)}>
                      {requirementEditorOpen ? '收起要求预设' : '编辑要求预设'}
                    </button>
                    {requirementEditorOpen && (
                      <>
                        <textarea className={`${FIELD} min-h-[88px] resize-y`} value={requirementEditorValue} disabled={requirementSaving} placeholder="每行：名称｜提示词" onChange={(event) => setRequirementEditorValue(event.target.value)} />
                        {requirementError && <div className="text-[9px] text-red-200">{requirementError}</div>}
                        <button type="button" className={`${BUTTON} h-6 border-cyan-300/30 bg-cyan-300/15 px-1.5 text-cyan-100`} disabled={requirementSaving} onClick={() => void saveRequirementPresets()}>
                          {requirementSaving ? '保存中' : '保存'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <select className={FIELD} value={layoutPresetId} disabled={isReadonly || busy} onChange={(event) => update({ layoutPresetId: normalizeExhibitionPlanLayoutPresetId(event.target.value) })}>
            {EXHIBITION_PLAN_LAYOUT_PRESETS.map((preset: ExhibitionPlanLayoutPreset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <textarea
            className={`${FIELD} min-h-[64px] resize-y`}
            value={d.layoutRequirement || ''}
            disabled={isReadonly || busy}
            placeholder="补充布局要求：入口方向、必须保留的房间、重点展项位置、团队参观、消防通道等"
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
            结构锁定模式：只生成透明展陈叠加层，最终保留图1原始墙体和柱子底图合成
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
                <button type="button" className={`${BUTTON} ml-auto h-6 px-1.5`} disabled={isReadonly || busy} onClick={() => update({ insertItems: insertOptions.map((item) => item.id) })}>全选</button>
              </div>
              {canManageTeam && (
                <div className="space-y-1 rounded border border-cyan-300/20 bg-cyan-300/10 p-1.5">
                  <button type="button" className={`${BUTTON} h-6 px-1.5`} disabled={busy || insertSaving} onClick={() => setInsertEditorOpen((open) => !open)}>
                    {insertEditorOpen ? '收起编辑' : '编辑植入项'}
                  </button>
                  {insertEditorOpen && (
                    <>
                      <textarea className={`${FIELD} min-h-[88px] resize-y`} value={insertEditorValue} disabled={insertSaving} placeholder="每行一个植入项" onChange={(event) => setInsertEditorValue(event.target.value)} />
                      {insertError && <div className="text-[9px] text-red-200">{insertError}</div>}
                      <button type="button" className={`${BUTTON} h-6 border-cyan-300/30 bg-cyan-300/15 px-1.5 text-cyan-100`} disabled={insertSaving} onClick={() => void saveInsertPresets()}>
                        {insertSaving ? '保存中' : '保存'}
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-1">
                {insertOptions.map((item) => {
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
                <button type="button" className={`${BUTTON} ml-auto h-6 px-1.5`} disabled={isReadonly || busy} onClick={() => update({ excludeItems: allExcludeSelected ? [] : excludeOptions.map((item) => item.id) })}>
                  {allExcludeSelected ? '清空' : '全选'}
                </button>
              </div>
              {canManageTeam && (
                <div className="space-y-1 rounded border border-cyan-300/20 bg-cyan-300/10 p-1.5">
                  <button type="button" className={`${BUTTON} h-6 px-1.5`} disabled={busy || excludeSaving} onClick={() => setExcludeEditorOpen((open) => !open)}>
                    {excludeEditorOpen ? '收起编辑' : '编辑排除项'}
                  </button>
                  {excludeEditorOpen && (
                    <>
                      <textarea className={`${FIELD} min-h-[88px] resize-y`} value={excludeEditorValue} disabled={excludeSaving} placeholder="每行一个排除项" onChange={(event) => setExcludeEditorValue(event.target.value)} />
                      {excludeError && <div className="text-[9px] text-red-200">{excludeError}</div>}
                      <button type="button" className={`${BUTTON} h-6 border-cyan-300/30 bg-cyan-300/15 px-1.5 text-cyan-100`} disabled={excludeSaving} onClick={() => void saveExcludePresets()}>
                        {excludeSaving ? '保存中' : '保存'}
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-1">
                {excludeOptions.map((item) => {
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

        <section data-exhibition-compact-section="result" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生图</div>
            <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> {isAiPlanLayout ? '生成平面AI布局' : '生成平面布局'}</button>
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
