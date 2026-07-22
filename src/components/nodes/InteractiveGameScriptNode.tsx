import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, Brain, Download, Gamepad2, Grid2X2, Images, Loader2, MousePointer2, Play, RefreshCcw, Sparkles, Square, X } from 'lucide-react';
import {
  DEFAULT_MJ_SPEED,
  DEFAULT_MJ_VERSION,
  FAL_REGISTRY,
  IMAGE_MODELS,
  gptImage2ZhenzhenVariantSize,
  isFalModel,
} from '../../providers/models';
import { generateLlmStream, type MjSpeed } from '../../services/generation';
import { runConfiguredImageGeneration, type ImageGenerationMode } from '../../services/imageGenerationRunner';
import { opGridCompose } from '../../services/imageOps';
import { downloadGameUiExport, exportGameUiDocument, type GameUiExportFormat } from '../../services/gameUiExport';
import { useApiKeysStore } from '../../stores/apiKeys';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { PORT_COLOR } from '../../config/portTypes';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  externalImageSizeFor,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  buildGameUiImagePrompt,
  buildGameUiRepairMessages,
  buildGameUiScriptMessages,
  formatGameUiScript,
  gameUiGridLayout,
  gameUiTextSegments,
  gameUiVisualFingerprint,
  GAME_UI_DEMO_MODES,
  GAME_UI_FLOW_MODES,
  parseGameUiScript,
  type GameUiCondition,
  type GameUiDemoMode,
  type GameUiEffect,
  type GameUiFlowMode,
  type GameUiHotspot,
  type GameUiInteraction,
  type GameUiScreen,
  type GameUiScript,
} from '../../utils/interactiveGameScript';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import { useCanvasRuntime } from './canvasRuntimeContext';
import SmartImage from '../SmartImage';
import NodeHelpButton from './NodeHelpButton';

const COLOR = '#22d3ee';
const FIELD = 'nodrag nowheel w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-300/60';
const TEXTAREA = `${FIELD} resize-y`;
const MAX_REFERENCES = 12;

interface ScreenImageRecord {
  screenId: string;
  url: string;
  fingerprint: string;
  error?: string;
}

function storedScript(value: unknown): GameUiScript | null {
  return value && typeof value === 'object' && Array.isArray((value as GameUiScript).screens) ? value as GameUiScript : null;
}

function storedImages(value: unknown): ScreenImageRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ScreenImageRecord => (
    !!item && typeof item === 'object' && typeof item.screenId === 'string' && typeof item.url === 'string' && typeof item.fingerprint === 'string'
  )) : [];
}

function compareCondition(actual: unknown, condition: GameUiCondition): boolean {
  if (condition.operator === 'truthy') return Boolean(actual);
  if (condition.operator === 'falsy') return !actual;
  if (condition.operator === 'eq') return actual === condition.value;
  if (condition.operator === 'ne') return actual !== condition.value;
  const left = Number(actual);
  const right = Number(condition.value);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (condition.operator === 'gt') return left > right;
  if (condition.operator === 'gte') return left >= right;
  if (condition.operator === 'lt') return left < right;
  return left <= right;
}

function applyEffects(values: Record<string, boolean | number | string>, effects: GameUiEffect[]) {
  const next = { ...values };
  for (const effect of effects) {
    if (effect.operation === 'toggle') next[effect.variableId] = !Boolean(next[effect.variableId]);
    else if (effect.operation === 'increment') next[effect.variableId] = Number(next[effect.variableId] || 0) + Number(effect.value || 0);
    else if (effect.operation === 'decrement') next[effect.variableId] = Number(next[effect.variableId] || 0) - Number(effect.value || 0);
    else if (effect.value !== undefined) next[effect.variableId] = effect.value;
  }
  return next;
}

function PrototypeModal({ script, imageByScreen, onClose }: { script: GameUiScript; imageByScreen: Map<string, string>; onClose: () => void }) {
  const initialValues = () => Object.fromEntries(script.variables.map((item) => [item.id, item.initialValue]));
  const [screenId, setScreenId] = useState(script.initialScreenId);
  const [values, setValues] = useState<Record<string, boolean | number | string>>(initialValues);
  const [feedback, setFeedback] = useState('');
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const screen = script.screens.find((item) => item.id === screenId) || script.screens[0];
  const run = (interaction: GameUiInteraction) => {
    if (!interaction.conditions.every((item) => compareCondition(values[item.variableId], item))) {
      setFeedback('当前条件尚未满足');
      return;
    }
    setValues((current) => applyEffects(current, interaction.effects));
    setFeedback(interaction.feedback.message || '');
    if (interaction.targetScreenId) setScreenId(interaction.targetScreenId);
  };
  useEffect(() => {
    const timeout = screen.interactions.find((item) => item.trigger === 'timeout');
    if (!timeout) return undefined;
    const timer = window.setTimeout(() => run(timeout), 1800);
    return () => window.clearTimeout(timer);
  // Deliberately restart timeout when the active screen changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id]);
  const reset = () => { setScreenId(script.initialScreenId); setValues(initialValues()); setFeedback(''); };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const delta = event.clientX - start.x;
    if (Math.abs(delta) < 60) return;
    const trigger = delta < 0 ? 'swipe-left' : 'swipe-right';
    const interaction = screen.interactions.find((item) => item.trigger === trigger);
    if (interaction) run(interaction);
  };
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-6xl rounded-xl border border-white/15 bg-zinc-950 p-3 shadow-2xl">
        <div className="mb-3 flex items-center justify-between text-sm text-white"><span>{script.title} · {screen.title}</span><div className="flex gap-2"><button className="rounded bg-white/10 px-3 py-1 text-xs" onClick={reset}>重置</button><button onClick={onClose}><X size={18} /></button></div></div>
        <div
          className="relative mx-auto aspect-video w-full overflow-hidden rounded-lg bg-black"
          onPointerDown={(event) => { swipeStart.current = { x: event.clientX, y: event.clientY }; }}
          onPointerUp={onPointerUp}
        >
          <img src={imageByScreen.get(screen.id)} alt={screen.title} className="h-full w-full object-contain" draggable={false} />
          {screen.interactions.filter((item) => item.trigger === 'tap').map((interaction) => (
            <button
              key={interaction.id}
              className="absolute border border-cyan-300/70 bg-cyan-300/10 opacity-35 transition hover:opacity-100"
              style={{ left: `${interaction.hotspot.x}%`, top: `${interaction.hotspot.y}%`, width: `${interaction.hotspot.width}%`, height: `${interaction.hotspot.height}%` }}
              title={interaction.label}
              onClick={() => run(interaction)}
            />
          ))}
          {feedback && <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded bg-black/75 px-4 py-2 text-sm text-white shadow">{feedback}</div>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/50">{Object.entries(values).map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)}</div>
      </div>
    </div>,
    document.body,
  );
}

function HotspotModal({ screen, imageUrl, interactionIndex, onSave, onClose }: {
  screen: GameUiScreen;
  imageUrl: string;
  interactionIndex: number;
  onSave: (value: GameUiHotspot) => void;
  onClose: () => void;
}) {
  const interaction = screen.interactions[interactionIndex];
  const stageRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [value, setValue] = useState<GameUiHotspot>(interaction.hotspot);
  const point = (event: ReactPointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)) };
  };
  const move = (event: ReactPointerEvent) => {
    if (!startRef.current) return;
    const current = point(event);
    const start = startRef.current;
    setValue({ x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.max(0.5, Math.abs(current.x - start.x)), height: Math.max(0.5, Math.abs(current.y - start.y)) });
  };
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-6">
      <div className="w-full max-w-5xl rounded-xl border border-white/15 bg-zinc-950 p-3">
        <div className="mb-3 flex items-center justify-between text-sm text-white"><span>框选热点 · {interaction.label}</span><button onClick={onClose}><X size={18} /></button></div>
        <div
          ref={stageRef}
          className="relative aspect-video w-full touch-none overflow-hidden rounded bg-black"
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); startRef.current = point(event); move(event); }}
          onPointerMove={move}
          onPointerUp={() => { startRef.current = null; }}
        >
          <img src={imageUrl} alt={screen.title} className="h-full w-full select-none object-contain" draggable={false} />
          <div className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/15" style={{ left: `${value.x}%`, top: `${value.y}%`, width: `${value.width}%`, height: `${value.height}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-white/60"><span>x {value.x.toFixed(1)} · y {value.y.toFixed(1)} · w {value.width.toFixed(1)} · h {value.height.toFixed(1)}</span><div className="flex gap-2"><button className="rounded bg-white/10 px-3 py-1.5" onClick={onClose}>取消</button><button className="rounded bg-cyan-500/30 px-3 py-1.5 text-cyan-100" onClick={() => { onSave(value); onClose(); }}>保存热点</button></div></div>
      </div>
    </div>,
    document.body,
  );
}

const InteractiveGameScriptNode = ({ id, data, selected }: NodeProps) => {
  const d = (data as any) || {};
  const update = useUpdateNodeData(id);
  const { loadedCanvasId } = useCanvasRuntime();
  const upstream = useUpstreamMaterials(id);
  const abortRef = useRef<AbortController | null>(null);
  const [localError, setLocalError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [openScreenIndex, setOpenScreenIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hotspotEditor, setHotspotEditor] = useState<{ screenIndex: number; interactionIndex: number } | null>(null);

  const flowMode = (GAME_UI_FLOW_MODES.some((item) => item.id === d.gameUiFlowMode) ? d.gameUiFlowMode : 'state-graph') as GameUiFlowMode;
  const demoMode = (GAME_UI_DEMO_MODES.some((item) => item.id === d.gameUiDemoMode) ? d.gameUiDemoMode : 'static') as GameUiDemoMode;
  const brief = useMemo(() => upstream.texts.map((item) => item.url.trim()).filter(Boolean).join('\n\n'), [upstream.texts]);
  const references = useMemo(() => upstream.images.slice(0, MAX_REFERENCES), [upstream.images]);
  const referenceImages = useMemo(() => references.map((item) => item.url), [references]);
  const script = useMemo(() => storedScript(d.gameUiScript), [d.gameUiScript]);
  const scriptStale = !script || String(d.gameUiSourceText || '') !== brief || String(d.gameUiScriptFlowMode || '') !== flowMode;
  const records = useMemo(() => storedImages(d.gameUiScreenImages), [d.gameUiScreenImages]);
  const imageRecordById = useMemo(() => new Map(records.map((item) => [item.screenId, item])), [records]);

  const settings = useApiKeysStore((state) => state.settings);
  const llmConfigs = settings.llmConfigs || settings.llmApiKeys || [];
  const llmOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length ? saved : [{ id: 'default', label: '默认 LLM', model: settings.llmModel, isDefault: true }];
  }, [llmConfigs, settings.llmModel]);
  const activeLlm = llmOptions.find((item) => item.id === String(d.llmKeyId || '')) || llmOptions.find((item) => item.isDefault) || llmOptions[0];
  const llmModel = String(activeLlm?.model || settings.llmModel || '').trim();

  const advancedProviders = settings.advancedProviders || [];
  const imageProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const providerSelection = useMemo(() => resolveAdvancedProviderSelection(advancedProviders, 'image', {
    providerSource: d.providerSource,
    providerId: d.providerId,
    providerModel: d.providerModel,
  }), [advancedProviders, d.providerId, d.providerModel, d.providerSource]);
  const isExternal = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const externalModels = providerSelection.provider ? advancedProviderModelOptions(providerSelection.provider, 'image') : [];
  const externalModel = providerSelection.providerModel || externalModels[0] || '';
  const allowZhenzhen = settings.enableZhenzhenFallback !== false;
  const firstImageProvider = imageProviders[0] || null;
  const providerSelectValue = isExternal ? providerSelection.providerId : (allowZhenzhen ? 'zhenzhen' : (firstImageProvider?.id || ''));

  useEffect(() => {
    if (d.gameUiImageProviderInitialized === true) return;
    if (firstImageProvider) {
      const models = advancedProviderModelOptions(firstImageProvider, 'image');
      update({
        gameUiImageProviderInitialized: true,
        providerSource: firstImageProvider.protocol,
        providerId: firstImageProvider.id,
        providerModel: models[0] || '',
      });
      return;
    }
    update({ gameUiImageProviderInitialized: true, providerSource: 'zhenzhen', providerId: '', providerModel: '' });
  }, [d.gameUiImageProviderInitialized, firstImageProvider, update]);

  const modelDef = IMAGE_MODELS.find((item) => item.id === String(d.model || 'gpt-image-2')) || IMAGE_MODELS[0];
  const apiModel = modelDef.apiModelOptions.some((item) => item.value === String(d.apiModel || '')) ? String(d.apiModel) : modelDef.apiModel;
  const isMj = !isExternal && modelDef.paramKind === 'mj';
  const isFal = !isExternal && isFalModel(apiModel);
  const falKind = isFal ? FAL_REGISTRY[apiModel]?.paramKind : undefined;
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const status = String(d.status || 'idle');
  const busy = ['writing-script', 'generating-screens', 'composing-grid'].includes(status);
  const exportFormat = (['pptx', 'pdf', 'docx'].includes(String(d.gameUiExportFormat)) ? d.gameUiExportFormat : 'pptx') as GameUiExportFormat;

  const currentImageRecords = useMemo(() => script ? script.screens.map((screen) => {
    const record = imageRecordById.get(screen.id);
    const fingerprint = gameUiVisualFingerprint(script, screen, referenceImages);
    return { screen, record, fingerprint, fresh: !!record?.url && !record.error && record.fingerprint === fingerprint };
  }) : [], [imageRecordById, referenceImages, script]);
  const allFresh = !!script && currentImageRecords.length === script.screens.length && currentImageRecords.every((item) => item.fresh);
  const imageByScreen = useMemo(() => new Map(currentImageRecords.filter((item) => item.fresh).map((item) => [item.screen.id, item.record!.url])), [currentImageRecords]);

  const setScript = (next: GameUiScript, patch: Record<string, unknown> = {}) => {
    const outputText = formatGameUiScript(next);
    update({ gameUiScript: next, textSegments: gameUiTextSegments(next), outputText, text: outputText, prompt: outputText, ...patch });
  };
  const patchScreen = (position: number, patch: Partial<GameUiScreen>) => {
    if (!script) return;
    setScript({ ...script, screens: script.screens.map((screen, index) => index === position ? { ...screen, ...patch, index: position + 1 } : screen) });
  };
  const patchInteraction = (screenPosition: number, interactionPosition: number, patch: Partial<GameUiInteraction>) => {
    if (!script) return;
    const screen = script.screens[screenPosition];
    patchScreen(screenPosition, { interactions: screen.interactions.map((item, index) => index === interactionPosition ? { ...item, ...patch } : item) });
  };
  const handleError = (error: any) => {
    const message = error?.name === 'AbortError' ? '任务已停止' : (error?.message || '运行失败');
    setLocalError(message);
    update({ status: 'error', error: message, progress: '' });
    logBus.error(message, `game-ui:${id.slice(-6)}`);
  };
  const controller = () => { abortRef.current?.abort(); const next = new AbortController(); abortRef.current = next; setLocalError(''); return next; };

  const writeScript = async (activeController: AbortController) => {
    if (!brief) throw new Error('请先连接游戏需求文本');
    if (!llmModel) throw new Error('请先配置 LLM 独立配置');
    update({ status: 'writing-script', progress: '正在规划互动界面与逻辑…', error: '' });
    const request = {
      model: llmModel,
      llmKeyId: activeLlm?.id && activeLlm.id !== 'default' ? activeLlm.id : undefined,
      sourceNodeType: 'interactive-game-script',
      temperature: 0.3,
      max_tokens: Math.min(32000, 1800 + 8 * 720),
    };
    const first = await generateLlmStream(
      { ...request, messages: buildGameUiScriptMessages(brief, flowMode) },
      { signal: activeController.signal },
    );
    if (activeController.signal.aborted) throw new DOMException('任务已取消', 'AbortError');
    let next: GameUiScript;
    try { next = parseGameUiScript(first.content, flowMode); }
    catch (parseError: any) {
      update({ progress: `正在修复脚本：${parseError?.message || '结构错误'}` });
      const repaired = await generateLlmStream(
        { ...request, temperature: 0.1, messages: buildGameUiRepairMessages(first.content, brief, flowMode, parseError?.message || '结构错误') },
        { signal: activeController.signal },
      );
      if (activeController.signal.aborted) throw new DOMException('任务已取消', 'AbortError');
      next = parseGameUiScript(repaired.content, flowMode);
    }
    setScript(next, { gameUiSourceText: brief, gameUiScriptFlowMode: flowMode, llmKeyId: activeLlm?.id || '', llmModel, status: 'script-ready', progress: '', error: '' });
    return next;
  };

  const runImage = async (activeScript: GameUiScript, screen: GameUiScreen, signal: AbortSignal) => {
    if (!isExternal && !allowZhenzhen) throw new Error('贞贞工坊已关闭，请选择扩展图像 Provider');
    if (isExternal && (!providerSelection.provider || !externalModel)) throw new Error('扩展平台未配置可用图像模型');
    const mode: ImageGenerationMode = isExternal ? 'external' : isMj ? 'mj' : isFal ? 'fal' : 'standard';
    return runConfiguredImageGeneration({
      mode,
      prompt: buildGameUiImagePrompt(activeScript, screen, referenceImages.length),
      images: referenceImages,
      outputFormat,
      signal,
      historyContext: { canvasId: loadedCanvasId, sourceNodeId: id, sourceNodeType: 'interactive-game-script', nodeTitle: '互动游戏脚本', outputTitle: `${activeScript.title} · ${screen.title}` },
      model: modelDef.id,
      apiModel,
      paramKind: modelDef.paramKind,
      aspectRatio: '16:9',
      sizeLevel: '2K',
      seed: 0,
      n: 1,
      providerParams: { ...(d.providerParams || {}), n: 1 },
      external: isExternal && providerSelection.provider ? {
        providerId: providerSelection.provider.id,
        providerModel: externalModel,
        size: externalImageSizeFor('16:9', '2K'),
        negativePrompt: String(d.providerParams?.negativePrompt || '').trim(),
      } : undefined,
      fal: isFal && falKind ? {
        kind: falKind,
        mode: referenceImages.length ? 'edit' : 'gen',
        size: 'landscape_16_9',
        quality: d.falQuality || 'medium',
        format: outputFormat === 'jpg' ? 'jpeg' : 'png',
        aspectRatio: '16:9',
        resolution: '2K',
        safetyTolerance: '4',
        imageMode: 'image_url',
      } : undefined,
      mj: isMj ? {
        version: String(d.mjVersion || DEFAULT_MJ_VERSION),
        aspectRatio: '16:9',
        speed: (d.mjSpeed || DEFAULT_MJ_SPEED) as MjSpeed,
        seed: 0,
        pollIntervalSeconds: 3,
        maxPolls: 1200,
      } : undefined,
    });
  };

  const composeGrid = async (activeScript: GameUiScript, imageMap: Map<string, ScreenImageRecord>) => {
    const layout = gameUiGridLayout(activeScript.screens.length);
    update({ status: 'composing-grid', progress: '正在拼接 UI 概览宫格…' });
    const result = await opGridCompose({
      rows: layout.rows, cols: layout.cols, width: layout.width, height: layout.height, gap: layout.gap,
      background: '#111827', fit: 'contain', showIndexes: false, showCaptions: false, captionHeight: 56, captionTextColor: '#ffffff', captionBackground: '#111827',
      cells: Array.from({ length: layout.rows * layout.cols }, (_, index) => {
        const screen = activeScript.screens[index];
        const image = screen ? imageMap.get(screen.id) : null;
        return image?.url ? { imageUrl: image.url, fit: 'contain' as const } : null;
      }),
    });
    update({ gameUiSheetUrl: result.imageUrl });
  };

  const generateScreens = async (activeScript: GameUiScript, activeController: AbortController, onlyFailed = false) => {
    const map = new Map(storedImages(d.gameUiScreenImages).map((item) => [item.screenId, item]));
    const targets = activeScript.screens.filter((screen) => {
      const fingerprint = gameUiVisualFingerprint(activeScript, screen, referenceImages);
      const existing = map.get(screen.id);
      return !onlyFailed || !existing?.url || !!existing.error || existing.fingerprint !== fingerprint;
    });
    if (!targets.length) { await composeGrid(activeScript, map); update({ status: 'success', progress: '100%' }); return; }
    update({ status: 'generating-screens', progress: `正在生成 0 / ${targets.length} 个界面…`, error: '' });
    let cursor = 0;
    let completed = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const screen = targets[cursor++];
        const fingerprint = gameUiVisualFingerprint(activeScript, screen, referenceImages);
        try {
          const result = await runImage(activeScript, screen, activeController.signal);
          const url = result.urls[0] || result.primaryUrl;
          if (!url) throw new Error('图像模型未返回界面图');
          map.set(screen.id, { screenId: screen.id, url, fingerprint });
        } catch (error: any) {
          if (error?.name === 'AbortError') throw error;
          map.set(screen.id, { screenId: screen.id, url: map.get(screen.id)?.url || '', fingerprint, error: error?.message || '生成失败' });
        }
        completed += 1;
        const ordered = activeScript.screens.map((item) => map.get(item.id)).filter(Boolean) as ScreenImageRecord[];
        const freshUrls = activeScript.screens.map((item) => map.get(item.id)).filter((item) => item?.url && !item.error && item.fingerprint === gameUiVisualFingerprint(activeScript, activeScript.screens.find((screen) => screen.id === item.screenId)!, referenceImages)).map((item) => item!.url);
        update({ gameUiScreenImages: ordered, imageUrls: freshUrls, imageUrl: freshUrls[0] || '', progress: `正在生成 ${completed} / ${targets.length} 个界面…` });
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, worker));
    const failed = activeScript.screens.filter((screen) => {
      const item = map.get(screen.id);
      return !item?.url || !!item.error || item.fingerprint !== gameUiVisualFingerprint(activeScript, screen, referenceImages);
    });
    if (failed.length) {
      update({ status: 'error', progress: '', error: `${failed.length} 个界面生成失败，可点击重试失败界面` });
      throw new Error(`${failed.length} 个界面生成失败`);
    }
    await composeGrid(activeScript, map);
    update({ status: 'success', progress: '100%', error: '' });
    taskCompletionSound.notifyComplete(id, 'interactive-game-script');
  };

  const execute = async (kind: 'script' | 'images' | 'all' | 'retry') => {
    const activeController = controller();
    taskCompletionSound.primeAudio();
    try {
      if (kind === 'script') await writeScript(activeController);
      else if (kind === 'all') { const next = await writeScript(activeController); await generateScreens(next, activeController); }
      else {
        if (!script || scriptStale) throw new Error('脚本已过期，请先重新生成脚本');
        await generateScreens(script, activeController, kind === 'retry');
      }
    } catch (error: any) {
      if (!(kind === 'retry' && String(error?.message || '').includes('界面生成失败'))) handleError(error);
    } finally { if (abortRef.current === activeController) abortRef.current = null; }
  };
  const stop = () => { abortRef.current?.abort(); abortRef.current = null; update({ status: 'error', error: '任务已停止', progress: '' }); };
  const regenerateOne = async (screen: GameUiScreen) => {
    if (!script || scriptStale) return;
    const activeController = controller();
    const map = new Map(storedImages(d.gameUiScreenImages).map((item) => [item.screenId, item]));
    const fingerprint = gameUiVisualFingerprint(script, screen, referenceImages);
    update({ status: 'generating-screens', progress: `正在重新生成“${screen.title}”…`, error: '' });
    try {
      const result = await runImage(script, screen, activeController.signal);
      const url = result.urls[0] || result.primaryUrl;
      if (!url) throw new Error('图像模型未返回界面图');
      map.set(screen.id, { screenId: screen.id, url, fingerprint });
      const ordered = script.screens.map((item) => map.get(item.id)).filter(Boolean) as ScreenImageRecord[];
      const freshUrls = script.screens.map((item) => map.get(item.id)).filter((item, index) => item?.url && !item.error && item.fingerprint === gameUiVisualFingerprint(script, script.screens[index], referenceImages)).map((item) => item!.url);
      update({ gameUiScreenImages: ordered, imageUrls: freshUrls, imageUrl: freshUrls[0] || '' });
      const complete = script.screens.every((item) => { const record = map.get(item.id); return !!record?.url && !record.error && record.fingerprint === gameUiVisualFingerprint(script, item, referenceImages); });
      if (complete) await composeGrid(script, map);
      update({ status: complete ? 'success' : 'script-ready', progress: complete ? '100%' : '', error: '' });
    } catch (error) { handleError(error); }
    finally { if (abortRef.current === activeController) abortRef.current = null; }
  };
  const runExport = async (format: GameUiExportFormat | 'prototype-zip') => {
    if (!script || exporting) return;
    if (!allFresh) { setLocalError('请先完成所有界面图生成'); return; }
    setExporting(true);
    try {
      const result = await exportGameUiDocument({ format, script, imageUrls: script.screens.map((screen) => imageByScreen.get(screen.id) || ''), sourceNodeType: 'interactive-game-script' });
      downloadGameUiExport(result);
    } catch (error: any) { setLocalError(error?.message || '导出失败'); }
    finally { setExporting(false); }
  };

  useRunTrigger(id, () => execute('all'), 'interactive-game-script');

  return (
    <div className="relative rounded-lg border transition-shadow" style={{ width: 540, background: 'var(--t8-bg-panel, rgba(20,20,24,.96))', borderColor: selected ? COLOR : 'var(--t8-border)' }}>
      <Handle id="brief" type="target" position={Position.Left} style={{ top: 92, background: PORT_COLOR.text, border: 0 }} />
      <Handle id="references" type="target" position={Position.Left} style={{ top: 142, background: PORT_COLOR.image, border: 0 }} />
      <Handle id="screens" type="source" position={Position.Right} style={{ top: '42%', background: PORT_COLOR.image, border: 0 }} />
      <Handle id="script" type="source" position={Position.Right} style={{ top: '66%', background: PORT_COLOR.text, border: 0 }} />
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Gamepad2 size={17} color={COLOR} /><span className="text-sm font-semibold" style={{ color: 'var(--t8-text-main)' }}>互动游戏脚本</span></div><NodeHelpButton nodeType="interactive-game-script" /></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[10px] text-white/55"><span>流程模式</span><select className={FIELD} disabled={busy} value={flowMode} onChange={(event) => update({ gameUiFlowMode: event.target.value })}>{GAME_UI_FLOW_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="space-y-1 text-[10px] text-white/55"><span>演示模式</span><select className={FIELD} disabled={busy} value={demoMode} onChange={(event) => update({ gameUiDemoMode: event.target.value })}>{GAME_UI_DEMO_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </div>
        <div className="rounded bg-white/[0.03] p-2 text-[10px] text-white/45">16:9 大屏触控 · AI 自动规划 4–8 个界面 · 逐界面 2K 生成 · 最多并发 2</div>
        <div className="space-y-1.5"><div className="flex justify-between text-[10px] text-white/55"><span>游戏需求</span><span>{brief ? `${brief.length} 字` : '未连接'}</span></div><div className="max-h-20 overflow-y-auto rounded bg-black/20 p-2 text-[10px] text-white/60">{brief || '从左侧黄色端口连接游戏需求文本'}</div></div>
        <div className="space-y-1.5"><div className="flex justify-between text-[10px] text-white/55"><span className="flex items-center gap-1"><Images size={11} />视觉参考</span><span>{upstream.images.length} / {MAX_REFERENCES}</span></div>{references.length ? <div className="grid grid-cols-6 gap-1">{references.map((item) => <SmartImage key={item.id} src={item.url} alt={item.label || '参考图'} className="h-12 rounded border border-white/10 object-contain" thumbSize={120} />)}</div> : <div className="rounded bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/35">未连接</div>}</div>
        <label className="block space-y-1 text-[10px] text-white/55"><span>脚本模型</span><select className={FIELD} value={activeLlm?.id || 'default'} disabled={busy} onChange={(event) => update({ llmKeyId: event.target.value, llmModel: llmOptions.find((item) => item.id === event.target.value)?.model || '' })}>{llmOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[10px] text-white/55"><span>生图来源</span><select className={FIELD} value={providerSelectValue} disabled={busy} onChange={(event) => {
            if (event.target.value === 'zhenzhen') update({ gameUiImageProviderInitialized: true, providerSource: 'zhenzhen', providerId: '', providerModel: '' });
            else {
              const provider = imageProviders.find((item) => item.id === event.target.value);
              const models = provider ? advancedProviderModelOptions(provider, 'image') : [];
              if (provider) update({ gameUiImageProviderInitialized: true, providerSource: provider.protocol, providerId: provider.id, providerModel: models[0] || '' });
            }
          }}><option value="zhenzhen" disabled={!allowZhenzhen}>贞贞工坊</option>{imageProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}</select></label>
          {isExternal ? <label className="space-y-1 text-[10px] text-white/55"><span>扩展模型</span><select className={FIELD} value={externalModel} disabled={busy} onChange={(event) => update({ providerModel: event.target.value })}>{externalModels.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : <label className="space-y-1 text-[10px] text-white/55"><span>图像模型</span><select className={FIELD} value={modelDef.id} disabled={busy} onChange={(event) => { const next = IMAGE_MODELS.find((item) => item.id === event.target.value) || IMAGE_MODELS[0]; update({ model: next.id, apiModel: next.apiModel, aspectRatio: '16:9', sizeLevel: '2K' }); }}>{IMAGE_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        </div>
        {!isExternal && !isMj && <label className="block space-y-1 text-[10px] text-white/55"><span>具体模型</span><select className={FIELD} value={apiModel} disabled={busy} onChange={(event) => { const nextSize = gptImage2ZhenzhenVariantSize(event.target.value); update(nextSize ? { apiModel: event.target.value, sizeLevel: nextSize } : { apiModel: event.target.value }); }}>{modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
        <div className="grid grid-cols-4 gap-2">
          <button className="flex items-center justify-center gap-1 rounded bg-emerald-500/15 px-2 py-2 text-xs text-emerald-200 disabled:opacity-40" disabled={busy || !brief} onClick={() => void execute('script')}><Brain size={12} />生成脚本</button>
          <button className="flex items-center justify-center gap-1 rounded bg-amber-500/15 px-2 py-2 text-xs text-amber-200 disabled:opacity-40" disabled={busy || scriptStale} onClick={() => void execute('images')}><Images size={12} />生成界面</button>
          <button className="flex items-center justify-center gap-1 rounded bg-cyan-500/20 px-2 py-2 text-xs text-cyan-100 disabled:opacity-40" disabled={busy || !brief} onClick={() => void execute('all')}><Sparkles size={12} />一键生成</button>
          {busy ? <button className="flex items-center justify-center gap-1 rounded bg-red-500/15 px-2 py-2 text-xs text-red-200" onClick={stop}><Square size={12} />停止</button> : <button className="flex items-center justify-center gap-1 rounded bg-white/10 px-2 py-2 text-xs text-white/70 disabled:opacity-40" disabled={!script || allFresh} onClick={() => void execute('retry')}><RefreshCcw size={12} />重试失败</button>}
        </div>
        {!!d.progress && <div className="rounded bg-cyan-500/10 px-2 py-1.5 text-[10px] text-cyan-100">{d.progress}</div>}
        {script && scriptStale && <div className="flex gap-1 rounded border border-amber-400/20 bg-amber-500/10 p-2 text-[10px] text-amber-200"><AlertCircle size={12} />需求或流程模式已变化，请重新生成脚本。</div>}
        {(localError || d.error) && <div className="flex gap-1 rounded border border-red-400/20 bg-red-500/10 p-2 text-[10px] text-red-200"><AlertCircle size={12} />{localError || d.error}</div>}
        {script && <div className="space-y-2 rounded border border-white/10 bg-white/[0.02] p-2">
          <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-[10px] text-white/50"><span>项目名</span><input className={FIELD} value={script.title} onChange={(event) => setScript({ ...script, title: event.target.value })} /></label><label className="space-y-1 text-[10px] text-white/50"><span>全局视觉</span><textarea className={TEXTAREA} rows={2} value={script.globalVisual} onChange={(event) => setScript({ ...script, globalVisual: event.target.value })} /></label></div>
          <label className="block space-y-1 text-[10px] text-white/50"><span>项目概念</span><textarea className={TEXTAREA} rows={2} value={script.concept} onChange={(event) => setScript({ ...script, concept: event.target.value })} /></label>
          <label className="block space-y-1 text-[10px] text-white/50"><span>状态变量 JSON</span><textarea className={TEXTAREA} rows={2} value={JSON.stringify(script.variables)} onChange={(event) => { try { const next = JSON.parse(event.target.value); if (Array.isArray(next)) setScript({ ...script, variables: next }); } catch { /* keep last valid value */ } }} /></label>
          <div className="nowheel max-h-[520px] space-y-1.5 overflow-y-auto pr-1">{script.screens.map((screen, screenIndex) => {
            const imageState = currentImageRecords[screenIndex];
            return <details key={screen.id} open={openScreenIndex === screenIndex} className="rounded border border-white/10 bg-black/15" onToggle={(event) => { if (event.currentTarget.open) setOpenScreenIndex(screenIndex); else if (openScreenIndex === screenIndex) setOpenScreenIndex(-1); }}>
              <summary className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs text-white/80"><span>{screen.index}. {screen.title}</span><span className={imageState?.fresh ? 'text-emerald-300' : imageState?.record?.error ? 'text-red-300' : 'text-amber-300'}>{imageState?.fresh ? '界面已就绪' : imageState?.record?.error || '待生成'}</span></summary>
              <div className="space-y-2 border-t border-white/10 p-2">
                {imageState?.record?.url && <SmartImage src={imageState.record.url} alt={screen.title} className="aspect-video w-full rounded object-contain" thumbSize={720} />}
                <button className="flex w-full items-center justify-center gap-1 rounded bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100 disabled:opacity-40" disabled={busy || scriptStale} onClick={() => void regenerateOne(screen)}><RefreshCcw size={11} />重新生成此界面</button>
                <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-[10px] text-white/50"><span>标题</span><input className={FIELD} value={screen.title} onChange={(event) => patchScreen(screenIndex, { title: event.target.value })} /></label><label className="space-y-1 text-[10px] text-white/50"><span>用途</span><input className={FIELD} value={screen.purpose} onChange={(event) => patchScreen(screenIndex, { purpose: event.target.value })} /></label></div>
                <label className="block space-y-1 text-[10px] text-white/50"><span>布局</span><textarea className={TEXTAREA} rows={2} value={screen.layout} onChange={(event) => patchScreen(screenIndex, { layout: event.target.value })} /></label>
                <label className="block space-y-1 text-[10px] text-white/50"><span>状态说明</span><textarea className={TEXTAREA} rows={2} value={screen.stateSummary} onChange={(event) => patchScreen(screenIndex, { stateSummary: event.target.value })} /></label>
                <label className="block space-y-1 text-[10px] text-white/50"><span>UI 元素 JSON</span><textarea className={TEXTAREA} rows={3} value={JSON.stringify(screen.elements)} onChange={(event) => { try { const next = JSON.parse(event.target.value); if (Array.isArray(next)) patchScreen(screenIndex, { elements: next }); } catch { /* keep last valid value */ } }} /></label>
                <label className="block space-y-1 text-[10px] text-white/50"><span>生图提示词</span><textarea className={TEXTAREA} rows={4} value={screen.imagePrompt} onChange={(event) => patchScreen(screenIndex, { imagePrompt: event.target.value })} /></label>
                <div className="space-y-1"><div className="text-[10px] text-white/50">互动逻辑</div>{screen.interactions.map((interaction, interactionIndex) => <div key={interaction.id} className="space-y-1.5 rounded border border-white/10 p-2">
                  <div className="grid grid-cols-3 gap-1"><input className={FIELD} value={interaction.label} onChange={(event) => patchInteraction(screenIndex, interactionIndex, { label: event.target.value })} /><select className={FIELD} value={interaction.trigger} onChange={(event) => patchInteraction(screenIndex, interactionIndex, { trigger: event.target.value as GameUiInteraction['trigger'] })}><option value="tap">点击</option><option value="swipe-left">左滑</option><option value="swipe-right">右滑</option><option value="timeout">超时</option></select><select className={FIELD} value={interaction.targetScreenId || ''} onChange={(event) => patchInteraction(screenIndex, interactionIndex, { targetScreenId: event.target.value || null })}><option value="">结束</option>{script.screens.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-1"><textarea className={TEXTAREA} rows={2} value={JSON.stringify(interaction.conditions)} onChange={(event) => { try { const next = JSON.parse(event.target.value); if (Array.isArray(next)) patchInteraction(screenIndex, interactionIndex, { conditions: next }); } catch { /* keep */ } }} /><textarea className={TEXTAREA} rows={2} value={JSON.stringify(interaction.effects)} onChange={(event) => { try { const next = JSON.parse(event.target.value); if (Array.isArray(next)) patchInteraction(screenIndex, interactionIndex, { effects: next }); } catch { /* keep */ } }} /></div>
                  <div className="flex items-center gap-1"><input className={FIELD} value={interaction.feedback.message} placeholder="反馈文案" onChange={(event) => patchInteraction(screenIndex, interactionIndex, { feedback: { ...interaction.feedback, message: event.target.value } })} /><button className="shrink-0 rounded bg-cyan-500/15 px-2 py-1.5 text-[10px] text-cyan-100 disabled:opacity-40" disabled={!imageState?.record?.url} onClick={() => setHotspotEditor({ screenIndex, interactionIndex })}><MousePointer2 size={11} className="inline" /> 热点</button></div>
                </div>)}</div>
              </div>
            </details>;
          })}</div>
        </div>}
        {d.gameUiSheetUrl && <div className="space-y-1 rounded border border-white/10 bg-black/20 p-2"><div className="flex items-center justify-between text-[10px] text-white/55"><span className="flex items-center gap-1"><Grid2X2 size={11} />UI 概览宫格</span><a href={d.gameUiSheetUrl} download><Download size={12} /></a></div><SmartImage src={d.gameUiSheetUrl} alt="UI 概览宫格" className="max-h-72 w-full rounded object-contain" thumbSize={720} /></div>}
        <div className="space-y-2 border-t border-white/10 pt-2"><div className="grid grid-cols-3 gap-2"><select className={FIELD} value={exportFormat} onChange={(event) => update({ gameUiExportFormat: event.target.value })}><option value="pptx">PPTX</option><option value="pdf">PDF</option><option value="docx">DOCX</option></select><button className="flex items-center justify-center gap-1 rounded bg-sky-500/15 px-2 py-2 text-xs text-sky-100 disabled:opacity-40" disabled={!allFresh || exporting} onClick={() => void runExport(exportFormat)}>{exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}导出文档</button><button className="flex items-center justify-center gap-1 rounded bg-violet-500/15 px-2 py-2 text-xs text-violet-100 disabled:opacity-40" disabled={demoMode !== 'prototype' || !allFresh || exporting} onClick={() => void runExport('prototype-zip')}><Download size={12} />原型 ZIP</button></div>{demoMode === 'prototype' && <button className="flex w-full items-center justify-center gap-1 rounded bg-cyan-500/20 px-2 py-2 text-xs text-cyan-100 disabled:opacity-40" disabled={!allFresh} onClick={() => setPreviewOpen(true)}><Play size={12} />预览交互原型</button>}</div>
      </div>
      <div className="pointer-events-none absolute -left-1 top-[92px] -translate-x-full -translate-y-1/2 pr-2 text-[9px] text-yellow-300">需求</div><div className="pointer-events-none absolute -left-1 top-[142px] -translate-x-full -translate-y-1/2 pr-2 text-[9px] text-blue-300">参考图</div><div className="pointer-events-none absolute -right-1 top-[42%] translate-x-full pl-2 text-[9px] text-blue-300">界面</div><div className="pointer-events-none absolute -right-1 top-[66%] translate-x-full pl-2 text-[9px] text-yellow-300">脚本</div>
      {previewOpen && script && <PrototypeModal script={script} imageByScreen={imageByScreen} onClose={() => setPreviewOpen(false)} />}
      {hotspotEditor && script && <HotspotModal screen={script.screens[hotspotEditor.screenIndex]} imageUrl={imageRecordById.get(script.screens[hotspotEditor.screenIndex].id)?.url || ''} interactionIndex={hotspotEditor.interactionIndex} onSave={(value) => patchInteraction(hotspotEditor.screenIndex, hotspotEditor.interactionIndex, { hotspot: value })} onClose={() => setHotspotEditor(null)} />}
    </div>
  );
};

export default memo(InteractiveGameScriptNode);
