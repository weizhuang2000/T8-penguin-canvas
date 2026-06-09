import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Clipboard,
  Image as ImageIcon,
  Loader2,
  MoveVertical,
  Play,
  Settings,
} from 'lucide-react';
import {
  IMAGE_MODELS,
} from '../../providers/models';
import {
  generateExternalImage,
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
  type ElevationCraft,
} from '../../utils/elevationPrompt';
import {
  getCurrentUser,
  getElevationPromptPresets,
  updateElevationCraftPresets,
  type AuthUser,
  type ElevationCraftPresetItem,
} from '../../services/api';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const DEFAULT_CRAFTS = ['panel', 'dimensional-letters', 'soft-film-lightbox'];
const MAX_IMAGE_SEED = 2147483647;

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

function ImageSlot({ title, subtitle, url, top }: { title: string; subtitle: string; url: string; top: string }) {
  return (
    <>
      <Handle
        id={title.includes('结构') ? 'structure' : 'style'}
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
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
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
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [craftPresets, setCraftPresets] = useState<ElevationCraftPresetItem[]>([]);
  const [craftEditorOpen, setCraftEditorOpen] = useState(false);
  const [craftEditorValue, setCraftEditorValue] = useState('');
  const [craftSaving, setCraftSaving] = useState(false);
  const [craftError, setCraftError] = useState('');
  const busy = d.status === 'generating';
  const pollAbortRef = useRef(false);
  const craftPresetOptions = useMemo<ElevationCraft[]>(
    () => (craftPresets.length > 0 ? craftPresets : ELEVATION_CRAFTS),
    [craftPresets],
  );

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
    }),
    [craftPresets, d.colorMaterial, d.customCraft, d.density, d.dimensions, d.supplement, d.visualStyle, priorityOrder, selectedCrafts],
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
    if (!craftEditorOpen) return;
    setCraftEditorValue(craftPresetEditorText(craftPresets));
    setCraftError('');
  }, [craftEditorOpen, craftPresets]);

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
          n: Math.max(1, Math.min(4, Number(d.providerParams?.n || 1))),
          providerParams: d.providerParams || {},
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

  const firstImageAdvancedProvider = imageAdvancedProviders[0] || null;
  const providerSelectValue = isExternalSelected
    ? providerSelection.providerId
    : (allowZhenzhenFallback ? 'zhenzhen' : (firstImageAdvancedProvider?.id || ''));

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
          <ImageSlot title="空间结构示意图" subtitle="保留结构、动线、分区；标注只作理解参考" url={structureImage} top="24%" />
          <ImageSlot title="空间表现效果图" subtitle="借鉴风格、材质、光影和完成度" url={styleImage} top="39%" />
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 text-[11px] font-semibold text-cyan-100">优先级顺序</div>
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

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 text-[11px] font-semibold text-cyan-100">模型与输出</div>
          <div className="mb-1 grid grid-cols-2 gap-1">
            {imageAdvancedProviders.length > 0 ? (
              <select
                className={FIELD}
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
              >
                {allowZhenzhenFallback && <option value="zhenzhen">默认百达工坊</option>}
                {imageAdvancedProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
              </select>
            ) : (
              <input className={FIELD} disabled value="默认百达工坊" />
            )}
              {isExternalSelected ? (
                <select className={FIELD} value={externalProviderModel} disabled={isReadonly || busy} onChange={(event) => update({ providerModel: event.target.value })}>
                  {externalModelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              ) : (
                <select
                  className={FIELD}
                  value={model}
                  disabled={isReadonly || busy}
                  onChange={(event) => {
                    const next = IMAGE_MODELS.find((item) => item.id === event.target.value) || IMAGE_MODELS[0];
                    update({ model: next.id, apiModel: next.apiModel, aspectRatio: next.defaultAspectRatio, sizeLevel: next.defaultSize || '2K' });
                  }}
                >
                  {IMAGE_MODELS.filter((item) => item.paramKind !== 'mj').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              )}
          </div>
          {!isExternalSelected && (
            <select className={`${FIELD} mb-1`} value={apiModel} disabled={isReadonly || busy} onChange={(event) => update({ apiModel: event.target.value })}>
              {modelDef.apiModelOptions
                .filter((item) => !item.value.includes('-fal'))
                .map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          )}
          <div className="grid grid-cols-4 gap-1">
            <select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(event) => update({ aspectRatio: event.target.value })}>
              {(modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(event) => update({ sizeLevel: event.target.value })}>
              {(modelDef.sizes.length ? modelDef.sizes : ['1K', '2K', '4K']).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(event) => update({ outputFormat: event.target.value })}>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
            </select>
            <input className={FIELD} type="number" min={0} value={seed} disabled={isReadonly || busy} title="Seed，0 表示随机" onChange={(event) => update({ seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
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
          {busy ? `生成中 ${d.progress || ''}` : '生成展陈效果图'}
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
