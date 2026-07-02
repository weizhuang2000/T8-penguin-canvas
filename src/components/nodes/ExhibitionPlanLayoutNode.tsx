import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { EXHIBITION_IMAGE_HANDLE_COLOR, EXHIBITION_TEXT_HANDLE_COLOR } from '../../config/portTypes';
import { Brain, FileText, Image as ImageIcon, Loader2, Map, Play, Route, Sparkles, Upload } from 'lucide-react';
import { DEFAULT_LLM_MODEL, IMAGE_MODELS } from '../../providers/models';
import {
  extractDocument,
  getExhibitionAiPlanLayoutPromptPresets,
  getCurrentUser,
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

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;
const OUTLINE_AND_LAYOUT_REQUIREMENT = [
  '鍙傝€冨浘鏄竴寮犲缓绛戝钩闈㈠竷灞€鍥撅紝瀹?4绫冲乏鍙筹紝闀?8绫冲乏鍙筹紝钃濊壊绾挎槸澧欎綋锛屽疄蹇冩柟鍧楁槸鏌卞瓙锛岀敤鏂囧瓧鏍囨敞浜嗕竴涓叆鍙ｅ拰涓€涓嚭鍙ｃ€?,
  '浣犳槸涓€浣嶅睍鍘呰璁″笀锛屽湪鍙傝€冨浘涓婅繘琛屽垎鍖哄竷灞€瑙勫垝鍙傝鍔ㄧ嚎锛屽厖鍒嗗埄鐢ㄦ煴瀛愬垝鍒嗙┖闂达紝鏃笉鎷ユ尋涔熶笉绌烘椃锛屽悇绌洪棿澶у皬鏈夊埆锛屽舰寮忓鏍枫€?,
  '鍏蜂綋鏄湪鍙傝€冨浘娣诲姞鏂板缓澧欎綋銆傚己鍒惰姹傦細涓嶈兘绉诲姩鎴栧垹闄ゅ弬鑰冨浘涓婄殑鏌卞瓙銆?,
  '棣栧厛鍥寸潃鍘熷缓绛戝鐨勫唴渚у缓涓€鍦堬紝鏂板缓澧欎綋鍜屽師澧欎綋涔嬮棿涓嶈鐣欒繃澶ц窛绂伙紝閬垮厤娴垂绌洪棿銆?,
  '鐒跺悗鍦ㄥ睍鍘呭唴閮ㄧ敤鏂板缓鍙岄潰澧欎綋闅旀垚杩為€氱殑灏忕┖闂达紝灏忕┖闂翠箣闂翠笉瑕佹湁绌洪殭锛屾墍鏈夋煴瀛愯鍜屾柊寤哄浣撹繛鎺ュ湪涓€璧凤紝涓嶈瀛樺湪鍗曠嫭涓€鏍规煴瀛愮殑鎯呭喌銆?,
  '鐢ㄤ竴鏉′粠鍏ュ彛寮€濮嬨€佹渶鍚庡埌鍑哄彛鐨勮繛缁笉闂存柇鐨勫弬瑙傚姩绾夸覆鑱旇捣姣忎釜绌洪棿锛涚┖闂翠笉鑳藉お灏忥紝涓嶈兘鏈夋瑙掞紝瓒呰繃10骞崇背鐨勫皬绌洪棿蹇呴』璁╁姩绾跨┛杩囥€?,
  '鍔ㄧ嚎涓婄殑绠ご娌跨潃铏氱嚎濮嬬粓鎸囧悜鍑哄彛鏂瑰悜銆傚己鍒惰姹傦細鍔ㄧ嚎鍙湁涓€鏉′笖娌℃湁鍒嗗弶銆?,
  '鏂板缓澧欎綋鏃舵敞鎰忎笉瑕佹湁闂悎鐨勫尯鍩燂紝鍐呴儴澧欎綋鍜岃竟娌垮浣撲箣闂存渶濂戒互鈥滀竵鈥濆瓧鍨嬬浉杩炪€?,
  '鍦ㄥ叆鍙ｅ拰鍑哄彛澶勫浣撹鏂紑3绫冲乏鍙筹紝鍏ュ彛杩涙潵鐨勭┖闂磋澶т竴浜涳紝闄ゅ叆鍙ｅ鍙湁涓€涓彲浠ョ户缁繘鍏ュ睍鍘呯殑鍙ｃ€?,
  '鎬荤粨鏂板缓澧欎綋鍘熷垯锛氱敤澧欎綋鍒嗛殧鍑轰竴涓糠瀹紝浠庡叆鍙ｈ蛋鍚戝嚭鍙ｏ紝姣忎釜绌洪棿鍙蛋涓€閬嶈€屼笖蹇呴』璧板埌锛岃矾绾垮彧鏈変竴鏉′笖涓嶈兘鍒嗗弶銆?,
  '椤虹潃鏂板缓澧欎綋娣诲姞涓€浜涘睍闄堣鏂斤紝姣斿灞曟煖銆佽Е鎽稿睆銆佸睍鍙般€佸満鏅瓑鐨勪刊瑙嗗浘锛屽畬鎴愬睍闄堝钩闈㈠竷灞€鍥撅紱鍙樉绀哄睍闄堣鏂界殑淇鍥撅紝涓嶈绔嬮潰銆?,
].join('\n');

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('鍥剧墖鍔犺浇澶辫触'));
    img.src = src;
  });
}

async function composeStructureLockedPlan(baseUrl: string, overlayUrl: string): Promise<string> {
  const [base, overlay] = await Promise.all([loadImageElement(baseUrl), loadImageElement(overlayUrl)]);
  const width = base.naturalWidth || base.width;
  const height = base.naturalHeight || base.height;
  if (!width || !height) throw new Error('鍘熷骞抽潰鍥惧昂瀵告棤鏁?);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('鏃犳硶鍒涘缓骞抽潰甯冨眬鍚堟垚鐢诲竷');
  ctx.drawImage(base, 0, 0, width, height);
  ctx.drawImage(overlay, 0, 0, width, height);
  return uploadDataUrl(canvas.toDataURL('image/png'), 'exhibition-plan-layout');
}

function documentLabel(meta?: Omit<ExtractedDocument, 'text'> | null) {
  if (!meta) return '鏈€夋嫨鏂囨。';
  const pages = meta.pageCount ? ` 路 ${meta.pageCount} 椤礰 : '';
  return `${meta.name} 路 ${meta.charCount} 瀛?{pages}`;
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
  if (/no available accounts/i.test(message)) return '褰撳墠 LLM 娌℃湁鍙敤璐﹀彿锛岃鍒囨崲鍙敤鐨?LLM 閰嶇疆鍚庨噸璇曘€?;
  return message || 'LLM 璇锋眰澶辫触';
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

function promptPresetEditorText(presets: ExhibitionAiPlanLayoutPresetItem[]) {
  return presets.map((preset) => `${preset.label}锝?{preset.prompt}`).join('\n');
}

function parsePromptPresetEditorText(text: string, fallbackId: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const raw = line.trim();
      if (!raw) return null;
      const parts = raw.split(/[|锝淽/);
      const label = (parts.shift() || '').trim();
      const prompt = (parts.join('锝?) || label).trim();
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
        <div className="flex h-32 items-center justify-center rounded border border-dashed border-white/15 text-[10px] text-white/35">杩炴帴鍥惧儚杈撳叆</div>
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
  const [insertEditorOpen, setInsertEditorOpen] = useState(false);
  const [excludeEditorOpen, setExcludeEditorOpen] = useState(false);
  const [insertEditorValue, setInsertEditorValue] = useState('');
  const [excludeEditorValue, setExcludeEditorValue] = useState('');
  const [stylePresets, setStylePresets] = useState<ExhibitionAiPlanLayoutPresetItem[]>([]);
  const [requirementPresets, setRequirementPresets] = useState<ExhibitionAiPlanLayoutPresetItem[]>([]);
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [requirementEditorOpen, setRequirementEditorOpen] = useState(false);
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
    return saved.length > 0 ? saved : [{ id: 'default', label: '榛樿 LLM', model: configuredLlmModel }];
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
      update({ status: 'error', error: `鏂囨。涓嶈兘瓒呰繃 ${MAX_DOCUMENT_FILE_SIZE_MB}MB`, progress: '' });
      return;
    }
    update({ status: 'extracting', progress: '鏂囨。瑙ｆ瀽涓?..', error: '' });
    try {
      const extracted = await extractDocument(file);
      const { text, ...documentMeta } = extracted;
      update({ documentMeta, sourceText: text, status: 'idle', progress: '', error: '' });
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '鏂囨。瑙ｆ瀽澶辫触', progress: '' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [busy, isReadonly, update]);

  const runOutline = useCallback(async (): Promise<string> => {
    const text = effectiveSourceText.trim();
    if (!text) {
      update({ status: 'error', error: '璇峰厛瀵煎叆銆佺矘璐存垨杩炴帴涓婃父璧勬枡鏂囨湰銆?, progress: '' });
      throw new Error('璇峰厛鎻愪緵璧勬枡鏂囨湰');
    }
    update({ status: 'outlining', progress: 'LLM 鎻愮偧骞抽潰甯冨眬澶х翰涓?..', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.25,
        max_tokens: 2400,
        messages: [
          { role: 'system', content: '浣犳槸璧勬繁灞曢檲绛栧垝涓庣┖闂磋鍒掍笓瀹躲€備綘鍙緭鍑轰弗鏍?JSON銆? },
          { role: 'user', content: buildExhibitionPlanOutlinePrompt({ sourceText: text, insertItems: selectedInsertIds, excludeItems: selectedExcludeIds, insertItemOptions: insertOptions, excludeItemOptions: excludeOptions }) },
        ],
      });
      const formatted = formatExhibitionPlanOutline(parseExhibitionPlanOutlineJson(response.content || ''));
      if (!formatted) throw new Error('LLM 鏈繑鍥炴湁鏁堝ぇ绾?);
      update({ layoutOutlineText: formatted, outputText: formatted, text: formatted, prompt: formatted, status: 'idle', progress: '', error: '' });
      return formatted;
    } catch (error: any) {
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      throw error;
    }
  }, [activeLlmConfig?.id, effectiveSourceText, excludeOptions, insertOptions, llmModel, selectedExcludeIds, selectedInsertIds, update]);

  const runAnalyzePlan = useCallback(async (outlineText = ''): Promise<string> => {
    if (!planImage) {
      update({ status: 'error', error: '璇峰厛杩炴帴鍘熷寤虹瓚骞抽潰鍥俱€?, progress: '' });
      throw new Error('璇峰厛杩炴帴鍘熷寤虹瓚骞抽潰鍥?);
    }
    const text = String(outlineText || layoutOutlineText || effectiveSourceText || '').trim();
    update({ status: 'analyzing', progress: 'LLM 姝ｅ湪璇诲彇鍘熷寤虹瓚骞抽潰鍥?..', error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: 0.15,
        max_tokens: 2200,
        messages: [
          { role: 'system', content: '浣犳槸璧勬繁灞曢檲绌洪棿瑙勫垝甯堝拰寤虹瓚骞抽潰鍥捐瘑鍥句笓瀹躲€傚繀椤绘妸鍘熷缓绛戝浣撱€佹煴瀛愩€侀棬娲炪€佸杞粨鍜屽叆鍙ｅ嚭鍙ｈ涓轰笉鍙姩缁撴瀯銆? },
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
      if (!interpretation) throw new Error('LLM 鏈繑鍥炴湁鏁堝钩闈㈣В鏋?);
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
      update({ status: 'error', error: '璇峰厛杩炴帴鍘熷寤虹瓚骞抽潰鍥俱€?, progress: '' });
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
    const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType, seed: runSeed, nodeTitle: isAiPlanLayout ? '骞抽潰AI甯冨眬' : '骞抽潰鑷姩甯冨眬' };
    update({ status: 'generating', progress: isAiPlanLayout ? '鎻愪氦骞抽潰AI甯冨眬鐢熷浘...' : '鎻愪氦骞抽潰甯冨眬鐢熷浘...', error: '', imageUrls: [], lastPrompt: imagePrompt, lastSeed: runSeed, referenceImages: refs });
    try {
      logBus.info(`骞抽潰鑷姩甯冨眬鎻愪氦 seed=${runSeed}`, src);
      const generationOutputFormat = structureLock ? 'png' : outputFormat;
      let urls: string[] = [];
      if (isExternalSelected && providerSelection.provider) {
        if (!externalProviderModel) throw new Error('鎵╁睍骞冲彴鏈厤缃彲鐢ㄥ浘鍍忔ā鍨?);
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
            if (pollAbortRef.current) throw new Error('浠诲姟宸插彇娑?);
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
          if (!submit.taskId) throw new Error('鏈幏鍙栧埌浠诲姟 ID');
          let lastProgress = submit.progress || '5%';
          update({ taskId: submit.taskId, progress: lastProgress });
          for (let index = 0; index < 1800; index += 1) {
            if (pollAbortRef.current) throw new Error('浠诲姟宸插彇娑?);
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
              throw new Error(q.error || '浠诲姟澶辫触');
            }
          }
        }
      }
      if (!urls.length) throw new Error('浠诲姟瀹屾垚浣嗘湭杩斿洖鍥剧墖');
      const overlayUrls = urls;
      if (structureLock) {
        update({ progress: '鍚堟垚缁撴瀯閿佸畾搴曞浘...' });
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
      logBus.success(`骞抽潰鑷姩甯冨眬瀹屾垚 ${urls.length} 寮燻, src);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      const msg = error?.message || '鐢熸垚澶辫触';
      update({ status: 'error', error: msg, progress: '' });
      logBus.error(`骞抽潰鑷姩甯冨眬澶辫触: ${msg}`, src);
      throw error;
    }
  }, [activeCanvasId, apiModel, aspectRatio, buildPrompt, d.planAiInterpretation, d.providerParams, effectiveSourceText, externalProviderModel, id, isAiPlanLayout, isExternalSelected, isReadonly, layoutOutlineText, modelDef.id, modelDef.paramKind, outputFormat, planImage, providerSelection.provider, runAnalyzePlan, runOutline, seed, sizeLevel, structureLock, update]);

  const runGenerate = useCallback(async () => {
    await runGenerateWithOptions();
  }, [runGenerateWithOptions]);

  const runOutlineAndLayout = useCallback(async () => {
    if (isReadonly || busy) return;
    if (!planImage) {
      update({ status: 'error', error: '璇峰厛杩炴帴鍘熷寤虹瓚骞抽潰鍥俱€?, progress: '' });
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
    setInsertEditorValue(presetEditorText(insertOptions));
    setInsertError('');
  }, [insertEditorOpen, insertOptions]);

  useEffect(() => {
    if (!excludeEditorOpen) return;
    setExcludeEditorValue(presetEditorText(excludeOptions));
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
      setInsertError('璇疯嚦灏戜繚鐣欎竴椤规鍏ュ唴瀹广€?);
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
      setInsertError(error?.message || '淇濆瓨妞嶅叆椤瑰け璐?);
    } finally {
      setInsertSaving(false);
    }
  };

  const saveExcludePresets = async () => {
    if (!canManageTeam) return;
    const presets = parseLabelPresetEditorText(excludeEditorValue, 'exclude');
    if (presets.length === 0) {
      setExcludeError('璇疯嚦灏戜繚鐣欎竴椤规帓闄ゅ唴瀹广€?);
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
      setExcludeError(error?.message || '淇濆瓨鎺掗櫎椤瑰け璐?);
    } finally {
      setExcludeSaving(false);
    }
  };

  const saveStylePresets = async () => {
    if (!canManageTeam) return;
    const presets = parsePromptPresetEditorText(styleEditorValue, 'style');
    if (presets.length === 0) {
      setStyleError('璇疯嚦灏戜繚鐣欎竴椤归鏍奸璁俱€?);
      return;
    }
    setStyleSaving(true);
    setStyleError('');
    try {
      const saved = await updateExhibitionAiPlanLayoutStylePresets(presets);
      setStylePresets(saved);
      setStyleEditorOpen(false);
    } catch (error: any) {
      setStyleError(error?.message || '淇濆瓨椋庢牸棰勮澶辫触');
    } finally {
      setStyleSaving(false);
    }
  };

  const saveRequirementPresets = async () => {
    if (!canManageTeam) return;
    const presets = parsePromptPresetEditorText(requirementEditorValue, 'requirement');
    if (presets.length === 0) {
      setRequirementError('璇疯嚦灏戜繚鐣欎竴椤圭壒娈婅姹傞璁俱€?);
      return;
    }
    setRequirementSaving(true);
    setRequirementError('');
    try {
      const saved = await updateExhibitionAiPlanLayoutRequirementPresets(presets);
      setRequirementPresets(saved);
      setRequirementEditorOpen(false);
    } catch (error: any) {
      setRequirementError(error?.message || '淇濆瓨鐗规畩瑕佹眰棰勮澶辫触');
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
      <Handle id="plan-image" type="target" position={Position.Left} className="!h-3 !w-3 !border-0" style={{ top: '22%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="杈撳叆锛氬師濮嬪缓绛戝钩闈㈠浘" />
      <Handle id="outline-text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0" style={{ top: '42%', background: EXHIBITION_TEXT_HANDLE_COLOR }} title="杈撳叆锛氬ぇ绾?璧勬枡鏂囨湰" />
      <Handle type="source" position={Position.Right} className="!border-0" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="杈撳嚭锛氬睍闄堝钩闈㈠竷灞€鍥? />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">{isAiPlanLayout ? <Sparkles size={16} /> : <Map size={16} />}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{isAiPlanLayout ? '平面AI布局' : '平面自动布局'}</div>
          <div className="truncate text-[10px] text-white/45">骞抽潰鍥剧害鏉?/ 澶х翰鎻愮偧 / 鍔ㄧ嚎涓庢爣娉ㄦ帶鍒?/div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[780px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">褰撳墠鐢诲竷涓哄彧璇伙紝浠呭彲鏌ョ湅缁撴灉銆?/div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section data-exhibition-compact-section="input" data-exhibition-compact-item="main" className="grid grid-cols-2 gap-2">
          <ImageSlot title="鍘熷寤虹瓚骞抽潰鍥? subtitle="鍥?锛屽敮涓€寤虹瓚缁撴瀯渚濇嵁锛屽繀椤昏繛鎺? url={planImage} />
          <div className="rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 text-[11px] font-semibold text-cyan-100">骞抽潰鍥捐В鏋?/div>
            <div className="mb-2 text-[10px] leading-snug text-white/45">瀹氫箟鍥?鐨勬瘮渚嬨€佸昂瀵搞€侀鑹层€佸浣撱€佹煴瀛愬拰涓嶅彲绉诲姩缁撴瀯</div>
            <textarea
              className={`${FIELD} h-32 resize-y`}
              value={d.planInterpretation || ''}
              disabled={isReadonly || busy}
              placeholder="渚嬪锛氭€讳綋瀹?0绫筹紝闀?0绫筹紝钃濊壊绾挎潯浠ｈ〃澧欎綋锛岀伆鑹叉柟鍧椾唬琛ㄦ煴瀛愶紝閮戒笉鍙Щ鍔?
              onChange={(event) => update({ planInterpretation: event.target.value })}
            />
          </div>
        </section>

        <section data-exhibition-compact-section="layout" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5">
            <FileText size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">璧勬枡涓庡ぇ绾?/span>
            <button type="button" className={`${BUTTON} ml-auto`} disabled={isReadonly || busy} onClick={() => fileRef.current?.click()}>
              <Upload size={12} /> 瀵煎叆
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
            placeholder="瀵煎叆 DOCX/PDF/TXT锛屾垨绮樿创灞曢檲璧勬枡鍘熸枃锛涗篃鍙粠宸︿晶杩炴帴涓婃父澶х翰鏂囨湰"
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
            鍚堝苟宸︿晶涓婃父鏂囨湰浣滀负璧勬枡/澶х翰
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
                <option key={item.id} value={`llm-key:${item.id}`}>{item.label || item.id}{item.model ? ` 路 ${item.model}` : ''}</option>
              ))}
            </select>
            <input className={FIELD} disabled value={llmModel} title="妯″瀷鐢辨墍閫?LLM 閰嶇疆鍐冲畾" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" disabled={isReadonly || busy} onClick={() => void runOutline()}>
              {status === 'outlining' ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              鎻愮偧澶х翰
            </button>
            <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" disabled={isReadonly || busy} onClick={() => void runOutlineAndLayout()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Route size={14} />}
              鎻愮偧鍔犲竷灞€
            </button>
          </div>
          <textarea
            className={`${FIELD} min-h-[112px] resize-y`}
            value={d.layoutOutlineText || ''}
            disabled={isReadonly || busy}
            placeholder="杩欓噷浼氱敓鎴愭垨濉啓灞曞尯澶х翰鐩綍锛涚敓鎴愬钩闈㈠竷灞€鏃朵細浣滀负灞曞尯鍒掑垎渚濇嵁"
            onChange={(event) => update({ layoutOutlineText: event.target.value })}
          />
        </section>

        <section data-exhibition-compact-section="model" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><Route size={13} /> 甯冨眬瑕佹眰</div>
          <select className={FIELD} value={layoutPresetId} disabled={isReadonly || busy} onChange={(event) => update({ layoutPresetId: normalizeExhibitionPlanLayoutPresetId(event.target.value) })}>
            {EXHIBITION_PLAN_LAYOUT_PRESETS.map((preset: ExhibitionPlanLayoutPreset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <textarea
            className={`${FIELD} min-h-[64px] resize-y`}
            value={d.layoutRequirement || ''}
            disabled={isReadonly || busy}
            placeholder="琛ュ厖甯冨眬瑕佹眰锛氫緥濡傚叆鍙ｆ柟鍚戙€佸繀椤讳繚鐣欑殑鎴块棿銆侀噸鐐瑰睍椤逛綅缃€佸洟闃熷弬瑙傘€佹秷闃查€氶亾绛?
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
            缁撴瀯閿佸畾妯″紡锛氬彧鐢熸垚閫忔槑灞曢檲鍙犲姞灞傦紝鏈€缁堜繚鐣欏浘1鍘熷澧欐煴搴曞浘鍚堟垚
          </label>
          <div className="grid grid-cols-3 gap-1">
            {[
              ['showRoute', '鏄剧ず鍔ㄧ嚎', showRoute],
              ['showLabels', '鏄剧ず鏍囨敞鏂囧瓧', showLabels],
              ['showDescriptions', '鏄剧ず璇存槑鏂囧瓧', showDescriptions],
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
                <span className="text-[10px] font-semibold text-cyan-100">妞嶅叆椤?/span>
                <button
                  type="button"
                  className={`${BUTTON} ml-auto h-6 px-1.5`}
                  disabled={isReadonly || busy}
                  onClick={() => update({ insertItems: insertOptions.map((item) => item.id) })}
                >
                  鍏ㄩ€?                </button>
              </div>
              {canManageTeam && (
                <div className="space-y-1 rounded border border-cyan-300/20 bg-cyan-300/10 p-1.5">
                  <button
                    type="button"
                    className={`${BUTTON} h-6 px-1.5`}
                    disabled={busy || insertSaving}
                    onClick={() => setInsertEditorOpen((open) => !open)}
                  >
                    {insertEditorOpen ? '鏀惰捣缂栬緫' : '缂栬緫妞嶅叆椤?}
                  </button>
                  {insertEditorOpen && (
                    <>
                      <textarea
                        className={`${FIELD} min-h-[88px] resize-y`}
                        value={insertEditorValue}
                        disabled={insertSaving}
                        placeholder="姣忚涓€涓鍏ラ」"
                        onChange={(event) => setInsertEditorValue(event.target.value)}
                      />
                      {insertError && <div className="text-[9px] text-red-200">{insertError}</div>}
                      <div className="flex justify-end gap-1">
                        <button type="button" className={`${BUTTON} h-6 px-1.5`} disabled={insertSaving} onClick={() => setInsertEditorOpen(false)}>鍙栨秷</button>
                        <button type="button" className={`${BUTTON} h-6 border-cyan-300/30 bg-cyan-300/15 px-1.5 text-cyan-100`} disabled={insertSaving} onClick={() => void saveInsertPresets()}>
                          {insertSaving ? '淇濆瓨涓? : '淇濆瓨'}
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
                <span className="text-[10px] font-semibold text-cyan-100">鎺掗櫎椤?/span>
                <button
                  type="button"
                  className={`${BUTTON} ml-auto h-6 px-1.5`}
                  disabled={isReadonly || busy}
                  onClick={() => update({ excludeItems: allExcludeSelected ? [] : excludeOptions.map((item) => item.id) })}
                >
                  {allExcludeSelected ? '娓呯┖' : '鍏ㄩ€?}
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
                    {excludeEditorOpen ? '鏀惰捣缂栬緫' : '缂栬緫鎺掗櫎椤?}
                  </button>
                  {excludeEditorOpen && (
                    <>
                      <textarea
                        className={`${FIELD} min-h-[88px] resize-y`}
                        value={excludeEditorValue}
                        disabled={excludeSaving}
                        placeholder="姣忚涓€涓帓闄ら」"
                        onChange={(event) => setExcludeEditorValue(event.target.value)}
                      />
                      {excludeError && <div className="text-[9px] text-red-200">{excludeError}</div>}
                      <div className="flex justify-end gap-1">
                        <button type="button" className={`${BUTTON} h-6 px-1.5`} disabled={excludeSaving} onClick={() => setExcludeEditorOpen(false)}>鍙栨秷</button>
                        <button type="button" className={`${BUTTON} h-6 border-cyan-300/30 bg-cyan-300/15 px-1.5 text-cyan-100`} disabled={excludeSaving} onClick={() => void saveExcludePresets()}>
                          {excludeSaving ? '淇濆瓨涓? : '淇濆瓨'}
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

        <section data-exhibition-compact-section="result" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 鐢熷浘</div>
            <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 鐢熸垚骞抽潰甯冨眬</button>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">鐢熷浘骞冲彴</span>
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
                {allowZhenzhenFallback && <option value="zhenzhen">鍐呯疆鐢熷浘骞冲彴</option>}
                {imageAdvancedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">鐢熷浘妯″瀷</span>
              {isExternalSelected ? (
                <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy || externalModelOptions.length === 0} onChange={(event) => update({ providerModel: event.target.value })}>
                  {externalModelOptions.length > 0 ? externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>) : <option value="">鏈厤缃浘鍍忔ā鍨?/option>}
                </select>
              ) : (
                <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(event) => update({ apiModel: event.target.value })}>
                  {modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              )}
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">鍩虹妯″瀷</span>
              <select className={FIELD} value={modelDef.id} disabled={isReadonly || busy || isExternalSelected} onChange={(event) => update({ model: event.target.value, apiModel: (availableModelDefs.find((item) => item.id === event.target.value) || modelDef).apiModel })}>
                {availableModelDefs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">鐢婚潰姣斾緥</span>
              <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
                {modelDef.aspectRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">鍒嗚鲸鐜?/span>
              <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">杈撳嚭鏍煎紡</span>
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
              <input className={FIELD} type="number" min={0} value={seed || ''} disabled={isReadonly || busy} placeholder="闅忔満" onChange={(event) => update({ seed: event.target.value })} />
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
