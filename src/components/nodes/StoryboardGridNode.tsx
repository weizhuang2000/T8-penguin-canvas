import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, Brain, Clapperboard, Download, FileDown, Images, LayoutGrid, Loader2, Scissors, Sparkles, Square } from 'lucide-react';
import {
  DEFAULT_MJ_RATIO,
  DEFAULT_MJ_SPEED,
  DEFAULT_MJ_VERSION,
  FAL_REGISTRY,
  GPT_FAL_SIZES,
  IMAGE_MODELS,
  MJ_RATIOS,
  MJ_SPEEDS,
  MJ_VERSIONS,
  NBPRO_FAL_RATIOS,
  NBPRO_FAL_RESOLUTIONS,
  gptImage2ZhenzhenVariantSize,
  isFalModel,
} from '../../providers/models';
import { generateLlm, type MjSpeed } from '../../services/generation';
import { runConfiguredImageGeneration, type ImageGenerationMode } from '../../services/imageGenerationRunner';
import { opGridCrop } from '../../services/imageOps';
import {
  downloadStoryboardExport,
  exportStoryboardDocument,
  type StoryboardExportFormat,
  type StoryboardExportLayout,
  type StoryboardPptShotsPerSlide,
} from '../../services/storyboardExport';
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
  buildStoryboardImagePrompt,
  buildStoryboardRepairMessages,
  buildStoryboardScriptMessages,
  derivedStoryboardCellRatio,
  formatStoryboardScript,
  legacyFramesToStoryboard,
  normalizeStoryboardDimension,
  normalizeStoryboardTotalDuration,
  parseStoryboardScript,
  storyboardTextSegments,
  STORYBOARD_VIDEO_STYLES,
  resolveStoryboardVideoStyle,
  type StoryboardScript,
  type StoryboardShot,
} from '../../utils/storyboardScript';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import { useCanvasRuntime } from './canvasRuntimeContext';
import SmartImage from '../SmartImage';
import NodeHelpButton from './NodeHelpButton';

const COLOR = '#818cf8';
const FIELD = 'nodrag nowheel w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-300/60';
const TEXTAREA = `${FIELD} resize-y`;
const EXTERNAL_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
const SIZE_LEVELS = ['1K', '2K', '4K'];
const MAX_REFERENCE_IMAGES = 12;

function falSheetRatio(size: string, width: number, height: number, fallback: string): string {
  if (size === 'square' || size === 'square_hd') return '1:1';
  if (size === 'portrait_4_3') return '3:4';
  if (size === 'portrait_16_9') return '9:16';
  if (size === 'landscape_4_3') return '4:3';
  if (size === 'landscape_16_9') return '16:9';
  if (size === 'custom' && width > 0 && height > 0) return `${width}:${height}`;
  return fallback;
}

function storedScript(value: unknown, legacyFrames: unknown): StoryboardScript | null {
  if (value && typeof value === 'object' && Array.isArray((value as StoryboardScript).shots)) {
    return value as StoryboardScript;
  }
  return legacyFramesToStoryboard(legacyFrames);
}

const StoryboardGridNode = ({ id, data, selected }: NodeProps) => {
  const d = (data as any) || {};
  const update = useUpdateNodeData(id);
  const { loadedCanvasId } = useCanvasRuntime();
  const upstream = useUpstreamMaterials(id);
  const abortRef = useRef<AbortController | null>(null);
  const [localError, setLocalError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [openShotIndex, setOpenShotIndex] = useState(0);

  const rows = normalizeStoryboardDimension(d.storyboardRows ?? d.rows, 2);
  const cols = normalizeStoryboardDimension(d.storyboardCols ?? d.cols, 3);
  const expectedCount = rows * cols;
  const totalDurationSeconds = normalizeStoryboardTotalDuration(d.storyboardTotalDuration, expectedCount, 90);
  const cropGap = Math.max(0, Math.min(240, Number.parseInt(String(d.storyboardCropGap ?? d.gap ?? 0), 10) || 0));
  const videoStyle = resolveStoryboardVideoStyle(d.storyboardVideoStyle);
  const outline = useMemo(() => upstream.texts.map((item) => item.url.trim()).filter(Boolean).join('\n\n'), [upstream.texts]);
  const referenceMaterials = useMemo(() => upstream.images.slice(0, MAX_REFERENCE_IMAGES), [upstream.images]);
  const referenceImages = useMemo(() => referenceMaterials.map((item) => item.url), [referenceMaterials]);
  const referenceOverflow = upstream.images.length > MAX_REFERENCE_IMAGES;
  const script = useMemo(() => storedScript(d.storyboardScript, d.frames), [d.frames, d.storyboardScript]);
  const scriptStale = !script
    || script.shots.length !== expectedCount
    || Number(d.storyboardScriptRows) !== rows
    || Number(d.storyboardScriptCols) !== cols
    || Number(d.storyboardScriptTotalDuration || expectedCount * 5) !== totalDurationSeconds
    || String(d.storyboardScriptVideoStyle || 'auto') !== videoStyle.id
    || String(d.storyboardSourceText || '') !== outline;

  const settings = useApiKeysStore((state) => state.settings);
  const llmConfigs = settings.llmConfigs || settings.llmApiKeys || [];
  const llmOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length ? saved : [{ id: 'default', label: '默认 LLM', model: settings.llmModel, isDefault: true }];
  }, [llmConfigs, settings.llmModel]);
  const activeLlm = llmOptions.find((item) => item.id === String(d.llmKeyId || ''))
    || llmOptions.find((item) => item.isDefault)
    || llmOptions[0];
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
  const providerSelectValue = isExternal ? providerSelection.providerId : (allowZhenzhen ? 'zhenzhen' : (imageProviders[0]?.id || ''));

  useEffect(() => {
    if (allowZhenzhen || isExternal || !firstImageProvider) return;
    const models = advancedProviderModelOptions(firstImageProvider, 'image');
    update({
      providerSource: firstImageProvider.protocol,
      providerId: firstImageProvider.id,
      providerModel: models[0] || '',
    });
  }, [allowZhenzhen, firstImageProvider, isExternal, update]);

  const modelId = String(d.model || 'gpt-image-2');
  const modelDef = IMAGE_MODELS.find((item) => item.id === modelId) || IMAGE_MODELS[0];
  const savedApiModel = String(d.apiModel || '');
  const apiModel = modelDef.apiModelOptions.some((item) => item.value === savedApiModel) ? savedApiModel : modelDef.apiModel;
  const isMj = !isExternal && modelDef.paramKind === 'mj';
  const isFal = !isExternal && isFalModel(apiModel);
  const falKind = isFal ? FAL_REGISTRY[apiModel]?.paramKind : undefined;
  const aspectRatio = String(d.aspectRatio || modelDef.defaultAspectRatio || '1:1');
  const sizeLevel = String(d.sizeLevel || modelDef.defaultSize || '2K');
  const mjVersion = String(d.mjVersion || DEFAULT_MJ_VERSION);
  const mjAr = String(d.mjAr || DEFAULT_MJ_RATIO);
  const mjSpeed = (d.mjSpeed || DEFAULT_MJ_SPEED) as MjSpeed;
  const nbAspect = String(d.nbAspect || 'auto');
  const nbResolution = String(d.nbResolution || '2K');
  const falSize = String(d.falSize || 'auto');
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const activeSheetRatio = isMj
    ? mjAr
    : isFal && falKind === 'nbpro-fal'
      ? nbAspect
      : isFal && falKind === 'gpt-fal'
        ? falSheetRatio(falSize, Number(d.falCustomW) || 1280, Number(d.falCustomH) || 1280, aspectRatio)
        : aspectRatio;
  const cellRatio = derivedStoryboardCellRatio(activeSheetRatio, rows, cols);
  const status = String(d.status || 'idle');
  const busy = ['writing-script', 'generating-image', 'splitting-image'].includes(status);
  const error = localError || String(d.error || '');
  const sheetUrl = String(d.storyboardSheetUrl || '');
  const shotUrls: string[] = Array.isArray(d.imageUrls) ? d.imageUrls.filter((url: unknown) => typeof url === 'string') : [];
  const exportFormat: StoryboardExportFormat = ['docx', 'pdf', 'pptx'].includes(String(d.storyboardExportFormat))
    ? d.storyboardExportFormat
    : 'docx';
  const exportLayout: StoryboardExportLayout = d.storyboardExportLayout === 'shot-card-table'
    ? 'shot-card-table'
    : 'production-table';
  const pptShotsPerSlide: StoryboardPptShotsPerSlide = [1, 2, 4].includes(Number(d.storyboardPptShotsPerSlide))
    ? Number(d.storyboardPptShotsPerSlide) as StoryboardPptShotsPerSlide
    : 2;

  const setScript = (next: StoryboardScript, patch: Record<string, unknown> = {}) => {
    const textSegments = storyboardTextSegments(next);
    const outputText = formatStoryboardScript(next);
    update({
      storyboardScript: next,
      textSegments,
      outputText,
      text: outputText,
      prompt: outputText,
      ...patch,
    });
  };

  const patchShot = (position: number, patch: Partial<StoryboardShot>) => {
    if (!script) return;
    setScript({
      ...script,
      shots: script.shots.map((shot, index) => index === position ? { ...shot, ...patch, index: position + 1 } : shot),
    });
  };

  const handleError = (errorValue: any) => {
    const message = errorValue?.name === 'AbortError' ? '任务已停止' : (errorValue?.message || '运行失败');
    setLocalError(message);
    update({ status: 'error', error: message, progress: '' });
    logBus.error(message, `storyboard:${id.slice(-6)}`);
  };

  const createController = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLocalError('');
    return controller;
  };

  const writeScript = async (controller: AbortController): Promise<StoryboardScript> => {
    if (!outline) throw new Error('请先连接文本大纲');
    if (!llmModel) throw new Error('请先配置 LLM 独立配置');
    update({ status: 'writing-script', progress: `正在撰写 ${expectedCount} 个镜头…`, error: '' });
    const request = {
      model: llmModel,
      llmKeyId: activeLlm?.id && activeLlm.id !== 'default' ? activeLlm.id : undefined,
      sourceNodeType: 'storyboard-grid',
      temperature: 0.3,
      max_tokens: Math.min(32000, 1800 + expectedCount * 720),
    };
    const promptOptions = { videoStyle, totalDurationSeconds };
    const first = await generateLlm({ ...request, messages: buildStoryboardScriptMessages(outline, rows, cols, promptOptions) });
    if (controller.signal.aborted) throw new DOMException('任务已取消', 'AbortError');
    let next: StoryboardScript;
    try {
      next = parseStoryboardScript(first.content, expectedCount, totalDurationSeconds);
    } catch (parseError: any) {
      update({ progress: `正在修复脚本结构：${parseError?.message || '格式错误'}` });
      const repaired = await generateLlm({
        ...request,
        temperature: 0.1,
        messages: buildStoryboardRepairMessages(first.content, outline, rows, cols, promptOptions),
      });
      if (controller.signal.aborted) throw new DOMException('任务已取消', 'AbortError');
      next = parseStoryboardScript(repaired.content, expectedCount, totalDurationSeconds);
    }
    setScript(next, {
      storyboardSourceText: outline,
      storyboardScriptRows: rows,
      storyboardScriptCols: cols,
      storyboardScriptTotalDuration: totalDurationSeconds,
      storyboardScriptVideoStyle: videoStyle.id,
      llmKeyId: activeLlm?.id || '',
      llmModel,
      status: 'script-ready',
      progress: '',
      error: '',
    });
    logBus.success(`分镜脚本完成，共 ${next.shots.length} 镜`, `storyboard:${id.slice(-6)}`);
    return next;
  };

  const splitSheet = async (url: string) => {
    update({ status: 'splitting-image', progress: `正在拆分 ${expectedCount} 个镜头…`, error: '' });
    const result = await opGridCrop(url, rows, cols, cropGap, undefined, {
      orderMode: 'row',
      uniformTiles: true,
      detectGridLines: true,
    });
    if (result.urls.length !== expectedCount) throw new Error(`拆分得到 ${result.urls.length} 张图片，预期 ${expectedCount} 张`);
    update({
      status: 'success',
      progress: '100%',
      imageUrl: result.urls[0],
      imageUrls: result.urls,
      storyboardCropLayout: result.layout,
      error: '',
    });
    taskCompletionSound.notifyComplete(id, 'storyboard-grid');
    return result.urls;
  };

  const generateImage = async (activeScript: StoryboardScript, controller: AbortController) => {
    if (activeScript.shots.length !== expectedCount) throw new Error(`脚本镜头数必须为 ${expectedCount}`);
    if (!isExternal && !allowZhenzhen) throw new Error('贞贞工坊已关闭，请选择扩展图像 Provider');
    if (isExternal && (!providerSelection.provider || !externalModel)) throw new Error('扩展平台未配置可用图像模型');
    const imagePrompt = buildStoryboardImagePrompt(activeScript, rows, cols, {
      sheetAspectRatio: activeSheetRatio,
      cellAspectRatio: cellRatio,
      referenceImageCount: referenceImages.length,
      videoStyle,
    });
    const mode: ImageGenerationMode = isExternal ? 'external' : isMj ? 'mj' : isFal ? 'fal' : 'standard';
    const seed = Math.max(0, Math.floor(Number(isMj ? d.mjSeed : isFal ? d.nbSeed : d.seed) || 0));
    update({
      status: 'generating-image',
      progress: '0%',
      error: '',
      storyboardImagePrompt: imagePrompt,
      referenceImages,
    });
    const result = await runConfiguredImageGeneration({
      mode,
      prompt: imagePrompt,
      images: referenceImages,
      outputFormat,
      historyContext: {
        canvasId: loadedCanvasId,
        sourceNodeId: id,
        sourceNodeType: 'storyboard-grid',
        nodeTitle: '分镜脚本',
        outputTitle: `${activeScript.title} 分镜宫格`,
        prompt: imagePrompt,
        seed,
      },
      signal: controller.signal,
      model: modelDef.id,
      apiModel,
      paramKind: modelDef.paramKind,
      aspectRatio,
      sizeLevel,
      seed,
      n: 1,
      providerParams: { ...(d.providerParams || {}), n: 1 },
      external: isExternal && providerSelection.provider ? {
        providerId: providerSelection.provider.id,
        providerModel: externalModel,
        size: externalImageSizeFor(aspectRatio, sizeLevel),
        negativePrompt: String(d.providerParams?.negativePrompt || d.providerParams?.negative || '').trim(),
      } : undefined,
      fal: isFal && falKind ? {
        kind: falKind,
        mode: referenceImages.length > 0 ? 'edit' : 'gen',
        size: falSize,
        customW: Math.max(256, Number(d.falCustomW) || 1280),
        customH: Math.max(256, Number(d.falCustomH) || 1280),
        quality: d.falQuality || 'medium',
        format: d.falFormat || 'png',
        sync: d.falSync === true,
        aspectRatio: nbAspect,
        resolution: nbResolution,
        safetyTolerance: String(d.nbSafety || '4'),
        systemPrompt: String(d.nbSysPrompt || ''),
        enableWebSearch: d.nbWebSearch === true,
        imageMode: d.nbImgMode || 'image_url',
      } : undefined,
      mj: isMj ? {
        version: mjVersion,
        aspectRatio: mjAr,
        speed: mjSpeed,
        chaos: Number(d.mjC) || 0,
        stylize: Number(d.mjS) || 0,
        negativePrompt: String(d.mjNo || ''),
        seed,
        pollIntervalSeconds: Number(d.mjPollInt) || 3,
        maxPolls: Number(d.mjMaxPoll) || 1200,
      } : undefined,
      onProgress: ({ progress, taskId, meta }) => update({ progress, ...(taskId ? { taskId } : {}), ...(meta || {}) }),
      onWarning: (message) => logBus.warn(message, `storyboard:${id.slice(-6)}`),
    });
    const generatedSheet = result.urls[0] || result.primaryUrl;
    if (!generatedSheet) throw new Error('生图模型未返回分镜整图');
    if (result.urls.length > 1) logBus.warn(`模型返回 ${result.urls.length} 张候选，使用第一张作为分镜整图`, `storyboard:${id.slice(-6)}`);
    update({
      storyboardSheetUrl: generatedSheet,
      storyboardSheetCandidates: result.urls,
      storyboardImagePrompt: imagePrompt,
      taskId: result.taskId || d.taskId,
    });
    await splitSheet(generatedSheet);
    logBus.success(`分镜整图已拆分为 ${expectedCount} 个镜头`, `storyboard:${id.slice(-6)}`);
  };

  const runScriptOnly = async () => {
    const controller = createController();
    try {
      await writeScript(controller);
    } catch (errorValue) {
      handleError(errorValue);
      throw errorValue;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const runImageOnly = async () => {
    const controller = createController();
    try {
      if (!script || scriptStale) throw new Error('脚本已过期，请先重新生成脚本');
      await generateImage(script, controller);
    } catch (errorValue) {
      handleError(errorValue);
      throw errorValue;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const runAll = async () => {
    const controller = createController();
    taskCompletionSound.primeAudio();
    try {
      const next = await writeScript(controller);
      await generateImage(next, controller);
    } catch (errorValue) {
      handleError(errorValue);
      throw errorValue;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const retrySplit = async () => {
    if (!sheetUrl) return;
    setLocalError('');
    try {
      await splitSheet(sheetUrl);
    } catch (errorValue) {
      handleError(errorValue);
    }
  };

  const runExport = async () => {
    if (!script || exporting || busy) return;
    setExportError('');
    setExporting(true);
    try {
      const result = await exportStoryboardDocument({
        format: exportFormat,
        layout: exportLayout,
        pptShotsPerSlide,
        script,
        imageUrls: shotUrls.slice(0, script.shots.length),
        sourceNodeType: 'storyboard-grid',
      });
      downloadStoryboardExport(result);
    } catch (errorValue: any) {
      const message = errorValue?.message || '分镜脚本导出失败';
      setExportError(message);
      logBus.error(message, `storyboard-export:${id.slice(-6)}`);
    } finally {
      setExporting(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    update({ status: 'error', error: '任务已停止', progress: '' });
  };

  const switchModel = (nextId: string) => {
    const next = IMAGE_MODELS.find((item) => item.id === nextId) || IMAGE_MODELS[0];
    update({
      model: next.id,
      apiModel: next.apiModel,
      aspectRatio: next.defaultAspectRatio,
      sizeLevel: next.defaultSize,
      ...(next.paramKind === 'mj' ? { mjVersion: DEFAULT_MJ_VERSION, mjAr: DEFAULT_MJ_RATIO, mjSpeed: DEFAULT_MJ_SPEED } : {}),
    });
  };

  useRunTrigger(id, runAll, 'storyboard-grid');

  return (
    <div
      className="relative rounded-lg border transition-shadow"
      style={{ width: 520, background: 'var(--t8-bg-panel, rgba(20,20,24,.96))', borderColor: selected ? COLOR : 'var(--t8-border)' }}
    >
      <Handle id="outline" type="target" position={Position.Left} style={{ top: 92, background: PORT_COLOR.text, border: 0 }} />
      <Handle id="references" type="target" position={Position.Left} style={{ top: 142, background: PORT_COLOR.image, border: 0 }} title="输入：人物、服饰、道具、建筑和场景参考图" />
      <Handle id="shots" type="source" position={Position.Right} style={{ top: '42%', background: PORT_COLOR.image, border: 0 }} />
      <Handle id="script" type="source" position={Position.Right} style={{ top: '65%', background: PORT_COLOR.text, border: 0 }} />

      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--t8-border)' }}>
        <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-500/20 text-indigo-200"><Clapperboard size={15} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--t8-text-main)' }}>分镜脚本</div>
          <div className="text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>{rows} × {cols} · {expectedCount} 镜 · 总时长 {totalDurationSeconds}s · 单格约 {cellRatio}</div>
        </div>
        <NodeHelpButton nodeType="storyboard-grid" />
        {(busy || exporting) && <Loader2 size={15} className="animate-spin text-indigo-300" />}
      </div>

      <div className="nodrag nowheel space-y-2.5 p-3" onMouseDown={(event) => event.stopPropagation()}>
        <div className="grid grid-cols-5 gap-2">
          <label className="space-y-1 text-[10px] text-white/55"><span>行数</span><input className={FIELD} type="number" min={1} max={6} value={rows} disabled={busy} onChange={(event) => update({ storyboardRows: normalizeStoryboardDimension(event.target.value, rows) })} /></label>
          <label className="space-y-1 text-[10px] text-white/55"><span>列数</span><input className={FIELD} type="number" min={1} max={6} value={cols} disabled={busy} onChange={(event) => update({ storyboardCols: normalizeStoryboardDimension(event.target.value, cols) })} /></label>
          <label className="space-y-1 text-[10px] text-white/55"><span>总时长（秒）</span><input className={FIELD} type="number" min={expectedCount} max={expectedCount * 60} value={totalDurationSeconds} disabled={busy} onChange={(event) => update({ storyboardTotalDuration: normalizeStoryboardTotalDuration(event.target.value, expectedCount, totalDurationSeconds) })} /></label>
          <label className="space-y-1 text-[10px] text-white/55"><span>去缝 px</span><input className={FIELD} type="number" min={0} max={240} value={cropGap} disabled={busy} onChange={(event) => update({ storyboardCropGap: Math.max(0, Math.min(240, Number(event.target.value) || 0)) })} /></label>
          <div className="space-y-1 text-[10px] text-white/55"><span>大纲</span><div className="truncate rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70" title={outline}>{outline ? `${outline.length} 字` : '未连接'}</div></div>
        </div>

        {expectedCount > 16 && <div className="rounded border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">超过 16 镜时，图像模型对严格宫格和镜头内容的遵循度可能下降。</div>}

        <div className="space-y-1.5 rounded border border-white/10 bg-black/15 p-2">
          <div className="flex items-center justify-between text-[10px] text-white/55"><span className="flex items-center gap-1"><Images size={12} />视觉参考</span><span>{upstream.images.length} / {MAX_REFERENCE_IMAGES}</span></div>
          {referenceMaterials.length > 0 ? (
            <div className="grid grid-cols-6 gap-1">
              {referenceMaterials.map((material, index) => <SmartImage key={material.id} src={material.url} alt={material.label || `参考图 ${index + 1}`} title={material.label || `参考图 ${index + 1}`} className="h-14 w-full rounded border border-white/10 bg-black/20 object-contain" thumbSize={160} />)}
            </div>
          ) : <div className="rounded bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/35">未连接</div>}
          {referenceOverflow && <div className="flex items-center gap-1 text-[10px] text-amber-200"><AlertCircle size={11} />仅使用前 {MAX_REFERENCE_IMAGES} 张参考图</div>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1 text-[10px] text-white/55"><span>脚本模型（LLM 独立配置）</span><select className={FIELD} value={activeLlm?.id || 'default'} disabled={busy} onChange={(event) => update({ llmKeyId: event.target.value, llmModel: llmOptions.find((item) => item.id === event.target.value)?.model || '' })}>{llmOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}</select></label>
          <label className="space-y-1 text-[10px] text-white/55"><span>生图来源</span><select className={FIELD} value={providerSelectValue} disabled={busy} onChange={(event) => {
            if (event.target.value === 'zhenzhen') update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
            else {
              const provider = imageProviders.find((item) => item.id === event.target.value);
              const models = provider ? advancedProviderModelOptions(provider, 'image') : [];
              if (provider) update({ providerSource: provider.protocol, providerId: provider.id, providerModel: models[0] || '' });
            }
          }}><option value="zhenzhen" disabled={!allowZhenzhen}>贞贞工坊</option>{imageProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}</select></label>
          <label className="space-y-1 text-[10px] text-white/55"><span>视频动画风格</span><select className={FIELD} value={videoStyle.id} disabled={busy} onChange={(event) => update({ storyboardVideoStyle: event.target.value })}>{STORYBOARD_VIDEO_STYLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </div>

        {isExternal ? (
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-1 space-y-1 text-[10px] text-white/55"><span>扩展模型</span><select className={FIELD} value={externalModel} disabled={busy} onChange={(event) => update({ providerModel: event.target.value })}>{externalModels.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="space-y-1 text-[10px] text-white/55"><span>整图比例</span><select className={FIELD} value={aspectRatio} disabled={busy} onChange={(event) => update({ aspectRatio: event.target.value })}>{EXTERNAL_RATIOS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="space-y-1 text-[10px] text-white/55"><span>分辨率</span><select className={FIELD} value={sizeLevel} disabled={busy} onChange={(event) => update({ sizeLevel: event.target.value })}>{SIZE_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[10px] text-white/55"><span>模型</span><select className={FIELD} value={modelDef.id} disabled={busy} onChange={(event) => switchModel(event.target.value)}>{IMAGE_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              {!isMj && <label className="space-y-1 text-[10px] text-white/55"><span>具体模型</span><select className={FIELD} value={apiModel} disabled={busy} onChange={(event) => {
                const nextSize = gptImage2ZhenzhenVariantSize(event.target.value);
                update(nextSize ? { apiModel: event.target.value, sizeLevel: nextSize } : { apiModel: event.target.value });
              }}>{modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
            </div>
            {isMj ? (
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-[10px] text-white/55"><span>MJ 版本</span><select className={FIELD} value={mjVersion} disabled={busy} onChange={(event) => update({ mjVersion: event.target.value })}>{MJ_VERSIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="space-y-1 text-[10px] text-white/55"><span>整图比例</span><select className={FIELD} value={mjAr} disabled={busy} onChange={(event) => update({ mjAr: event.target.value })}>{MJ_RATIOS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="space-y-1 text-[10px] text-white/55"><span>速度</span><select className={FIELD} value={mjSpeed} disabled={busy} onChange={(event) => update({ mjSpeed: event.target.value })}>{MJ_SPEEDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              </div>
            ) : isFal ? (
              <div className="grid grid-cols-3 gap-2">
                {falKind === 'gpt-fal' ? <>
                  <label className="space-y-1 text-[10px] text-white/55"><span>整图尺寸</span><select className={FIELD} value={falSize} disabled={busy} onChange={(event) => update({ falSize: event.target.value })}>{GPT_FAL_SIZES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="space-y-1 text-[10px] text-white/55"><span>质量</span><select className={FIELD} value={d.falQuality || 'medium'} disabled={busy} onChange={(event) => update({ falQuality: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="auto">Auto</option></select></label>
                  {falSize === 'custom' && <>
                    <label className="space-y-1 text-[10px] text-white/55"><span>宽度</span><input className={FIELD} type="number" min={256} max={3840} step={16} value={Number(d.falCustomW) || 1280} disabled={busy} onChange={(event) => update({ falCustomW: Number(event.target.value) || 1280 })} /></label>
                    <label className="space-y-1 text-[10px] text-white/55"><span>高度</span><input className={FIELD} type="number" min={256} max={3840} step={16} value={Number(d.falCustomH) || 1280} disabled={busy} onChange={(event) => update({ falCustomH: Number(event.target.value) || 1280 })} /></label>
                  </>}
                </> : <>
                  <label className="space-y-1 text-[10px] text-white/55"><span>整图比例</span><select className={FIELD} value={nbAspect} disabled={busy} onChange={(event) => update({ nbAspect: event.target.value })}>{NBPRO_FAL_RATIOS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label className="space-y-1 text-[10px] text-white/55"><span>分辨率</span><select className={FIELD} value={nbResolution} disabled={busy} onChange={(event) => update({ nbResolution: event.target.value })}>{NBPRO_FAL_RESOLUTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                </>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[10px] text-white/55"><span>整图比例</span><select className={FIELD} value={aspectRatio} disabled={busy} onChange={(event) => update({ aspectRatio: event.target.value })}>{modelDef.aspectRatios.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                {!!modelDef.sizes.length && <label className="space-y-1 text-[10px] text-white/55"><span>分辨率</span><select className={FIELD} value={sizeLevel} disabled={busy} onChange={(event) => update({ sizeLevel: event.target.value })}>{modelDef.sizes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[10px] text-white/55"><span>输出格式</span><select className={FIELD} value={outputFormat} disabled={busy || isMj} onChange={(event) => update({ outputFormat: event.target.value })}><option value="jpg">JPG</option><option value="png">PNG</option></select></label>
          <label className="space-y-1 text-[10px] text-white/55"><span>种子（0 随机）</span><input className={FIELD} type="number" min={0} value={Number(isMj ? d.mjSeed : isFal ? d.nbSeed : d.seed) || 0} disabled={busy} onChange={(event) => update(isMj ? { mjSeed: Number(event.target.value) || 0 } : isFal ? { nbSeed: Number(event.target.value) || 0 } : { seed: Number(event.target.value) || 0 })} /></label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button className="flex items-center justify-center gap-1 rounded bg-emerald-500/15 px-2 py-2 text-xs text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40" disabled={busy || !outline} onClick={() => { void runScriptOnly().catch(() => undefined); }}><Brain size={13} />生成脚本</button>
          <button className="flex items-center justify-center gap-1 rounded bg-amber-500/15 px-2 py-2 text-xs text-amber-200 hover:bg-amber-500/25 disabled:opacity-40" disabled={busy || scriptStale} onClick={() => { void runImageOnly().catch(() => undefined); }}><LayoutGrid size={13} />生成分镜图</button>
          {busy ? <button className="flex items-center justify-center gap-1 rounded bg-red-500/15 px-2 py-2 text-xs text-red-200 hover:bg-red-500/25" onClick={stop}><Square size={12} />停止</button> : <button className="flex items-center justify-center gap-1 rounded bg-indigo-500/25 px-2 py-2 text-xs font-medium text-indigo-100 hover:bg-indigo-500/35 disabled:opacity-40" disabled={!outline} onClick={() => { void runAll().catch(() => undefined); }}><Sparkles size={13} />一键生成</button>}
        </div>

        <div className="space-y-2 border-t border-white/10 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 text-[10px] text-white/55"><span>导出格式</span><select className={FIELD} value={exportFormat} disabled={busy || exporting} onChange={(event) => update({ storyboardExportFormat: event.target.value })}><option value="docx">DOCX</option><option value="pdf">PDF</option><option value="pptx">PPT</option></select></label>
            <label className="space-y-1 text-[10px] text-white/55"><span>表格排版</span><select className={FIELD} value={exportLayout} disabled={busy || exporting} onChange={(event) => update({ storyboardExportLayout: event.target.value })}><option value="production-table">标准制片表</option><option value="shot-card-table">镜头大卡表</option></select></label>
            <label className="space-y-1 text-[10px] text-white/55"><span>PPT 每页镜头</span><select className={FIELD} value={pptShotsPerSlide} disabled={busy || exporting || exportFormat !== 'pptx'} onChange={(event) => update({ storyboardPptShotsPerSlide: Number(event.target.value) })}><option value={1}>1</option><option value={2}>2</option><option value={4}>4</option></select></label>
          </div>
          <button className="flex w-full items-center justify-center gap-1.5 rounded bg-sky-500/15 px-2 py-2 text-xs font-medium text-sky-100 hover:bg-sky-500/25 disabled:opacity-40" disabled={!script || busy || exporting} onClick={() => { void runExport(); }}>
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}{exporting ? '正在导出' : `导出 ${exportFormat === 'pptx' ? 'PPT' : exportFormat.toUpperCase()}`}
          </button>
          {exportError && <div className="flex items-start gap-1.5 rounded border border-red-400/25 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200"><AlertCircle size={12} className="mt-0.5 shrink-0" /><span>{exportError}</span></div>}
        </div>

        {!!d.progress && <div className="rounded bg-indigo-500/10 px-2 py-1.5 text-[10px] text-indigo-200">{d.progress}</div>}
        {script && scriptStale && <div className="flex items-center gap-1.5 rounded border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200"><AlertCircle size={12} />大纲或宫格数量已变化，请重新生成脚本。</div>}
        {error && <div className="flex items-start gap-1.5 rounded border border-red-400/25 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200"><AlertCircle size={12} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

        {script && (
          <div className="space-y-2 rounded border border-white/10 bg-white/[0.03] p-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[10px] text-white/55"><span>片名</span><input className={FIELD} value={script.title} disabled={busy} onChange={(event) => setScript({ ...script, title: event.target.value })} /></label>
              <label className="space-y-1 text-[10px] text-white/55"><span>视觉连续性</span><textarea className={TEXTAREA} rows={2} value={script.visualContinuity} disabled={busy} onChange={(event) => setScript({ ...script, visualContinuity: event.target.value })} /></label>
            </div>
            <div className="nowheel max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {script.shots.map((shot, index) => (
                <details
                  key={`${shot.index}-${index}`}
                  className="rounded border border-white/10 bg-black/15"
                  open={openShotIndex === index}
                  onToggle={(event) => {
                    if (event.currentTarget.open) setOpenShotIndex(index);
                    else if (openShotIndex === index) setOpenShotIndex(-1);
                  }}
                >
                  <summary className="cursor-pointer px-2 py-1.5 text-xs text-white/80">{shot.index}. {shot.title} · {shot.durationSeconds}s · {shot.shotSize}</summary>
                  <div className="grid grid-cols-3 gap-2 border-t border-white/10 p-2">
                    <label className="col-span-2 space-y-1 text-[10px] text-white/50"><span>标题</span><input className={FIELD} value={shot.title} disabled={busy} onChange={(event) => patchShot(index, { title: event.target.value })} /></label>
                    <label className="space-y-1 text-[10px] text-white/50"><span>时长</span><input className={FIELD} type="number" min={1} max={60} value={shot.durationSeconds} disabled={busy} onChange={(event) => patchShot(index, { durationSeconds: Math.max(1, Math.min(60, Number(event.target.value) || 1)) })} /></label>
                    <label className="space-y-1 text-[10px] text-white/50"><span>景别</span><input className={FIELD} value={shot.shotSize} disabled={busy} onChange={(event) => patchShot(index, { shotSize: event.target.value })} /></label>
                    <label className="space-y-1 text-[10px] text-white/50"><span>机位</span><input className={FIELD} value={shot.cameraAngle} disabled={busy} onChange={(event) => patchShot(index, { cameraAngle: event.target.value })} /></label>
                    <label className="space-y-1 text-[10px] text-white/50"><span>运镜</span><input className={FIELD} value={shot.cameraMovement} disabled={busy} onChange={(event) => patchShot(index, { cameraMovement: event.target.value })} /></label>
                    <label className="col-span-3 space-y-1 text-[10px] text-white/50"><span>画面</span><textarea className={TEXTAREA} rows={2} value={shot.visual} disabled={busy} onChange={(event) => patchShot(index, { visual: event.target.value })} /></label>
                    <label className="col-span-3 space-y-1 text-[10px] text-white/50"><span>动作</span><textarea className={TEXTAREA} rows={2} value={shot.action} disabled={busy} onChange={(event) => patchShot(index, { action: event.target.value })} /></label>
                    <label className="col-span-3 space-y-1 text-[10px] text-white/50"><span>对白</span><textarea className={TEXTAREA} rows={2} value={shot.dialogue} disabled={busy} onChange={(event) => patchShot(index, { dialogue: event.target.value })} /></label>
                    <label className="col-span-3 space-y-1 text-[10px] text-white/50"><span>旁白</span><textarea className={TEXTAREA} rows={2} value={shot.voiceOver} disabled={busy} onChange={(event) => patchShot(index, { voiceOver: event.target.value })} /></label>
                    <label className="col-span-3 space-y-1 text-[10px] text-white/50"><span>生图提示词</span><textarea className={TEXTAREA} rows={3} value={shot.imagePrompt} disabled={busy} onChange={(event) => patchShot(index, { imagePrompt: event.target.value })} /></label>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {sheetUrl && (
          <div className="space-y-2 rounded border border-white/10 bg-black/20 p-2">
            <div className="flex items-center justify-between text-[10px] text-white/55"><span>分镜整图（仅节点内）</span><div className="flex gap-1"><a className="rounded p-1 text-white/65 hover:bg-white/10" href={sheetUrl} download title="下载整图"><Download size={13} /></a><button className="rounded p-1 text-white/65 hover:bg-white/10" disabled={busy} onClick={() => { void retrySplit(); }} title="重新拆分"><Scissors size={13} /></button></div></div>
            <SmartImage src={sheetUrl} alt="分镜整图" className="max-h-72 w-full rounded object-contain" thumbSize={720} />
          </div>
        )}

        {shotUrls.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-white/55"><span>镜头文件</span><span>{shotUrls.length} / {expectedCount}</span></div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 4)}, minmax(0, 1fr))` }}>
              {shotUrls.map((url, index) => <div key={`${url}-${index}`} className="relative overflow-hidden rounded border border-white/10 bg-black/20"><SmartImage src={url} alt={`镜头 ${index + 1}`} className="h-24 w-full object-contain" thumbSize={240} /><span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] text-white">{index + 1}</span></div>)}
            </div>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute -left-1 top-[92px] -translate-x-full -translate-y-1/2 pr-2 text-[9px] text-yellow-300">大纲</div>
      <div className="pointer-events-none absolute -left-1 top-[142px] -translate-x-full -translate-y-1/2 pr-2 text-[9px] text-blue-300">参考图</div>
      <div className="pointer-events-none absolute -right-1 top-[42%] -translate-y-1/2 translate-x-full pl-2 text-[9px] text-blue-300">镜头</div>
      <div className="pointer-events-none absolute -right-1 top-[65%] -translate-y-1/2 translate-x-full pl-2 text-[9px] text-yellow-300">脚本</div>
    </div>
  );
};

export default memo(StoryboardGridNode);
