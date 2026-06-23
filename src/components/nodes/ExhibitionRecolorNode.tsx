import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Loader2, Palette, Play, Settings, SlidersHorizontal, X } from 'lucide-react';
import { IMAGE_MODELS } from '../../providers/models';
import {
  getCurrentUser,
  getExhibitionRecolorPromptPresets,
  updateExhibitionRecolorExcludePresets,
  updateExhibitionRecolorPalettePresets,
  type AuthUser,
  type ExhibitionRecolorExcludePresetItem,
  type ExhibitionRecolorPalettePresetItem,
} from '../../services/api';
import {
  generateExternalImage,
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
  buildExhibitionRecolorPrompt,
  EXHIBITION_RECOLOR_DEFAULT_COLORS,
  normalizeExhibitionRecolorBrightness,
  normalizeExhibitionRecolorColor,
} from '../../utils/exhibitionRecolorPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
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
  for (const key of ['imageUrls', 'urls', 'generatedImages', 'referenceImages']) {
    const list = data?.[key];
    if (Array.isArray(list)) list.forEach(push);
  }
  push(data?.firstFrameUrl);
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('原始图像加载失败'));
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.src = src;
  });
}

async function readImageNaturalRatio(imageUrl: string): Promise<number> {
  const image = await loadImage(imageUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('Invalid image dimensions');
  return width / height;
}

function ratioValue(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return width / height;
}

function closestAspectRatio(sourceRatio: number, options: string[]): string {
  const candidates = options
    .map((value) => ({ value, ratio: ratioValue(value) }))
    .filter((item): item is { value: string; ratio: number } => item.ratio !== null);
  if (candidates.length === 0) return options[0] || '1:1';
  return candidates.reduce((best, item) => (
    Math.abs(item.ratio - sourceRatio) < Math.abs(best.ratio - sourceRatio) ? item : best
  )).value;
}

function ColorControl({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 rounded border border-white/10 bg-black/15 p-2">
      <span className="block text-[10px] text-white/55">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          disabled={disabled}
          className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent p-0 disabled:cursor-not-allowed"
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className={`${FIELD} font-mono`}
          value={value}
          disabled={disabled}
          maxLength={7}
          onChange={(event) => onChange(normalizeExhibitionRecolorColor(event.target.value, value))}
        />
      </div>
    </label>
  );
}

function PaletteEditorModal({
  open,
  palettes,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  palettes: ExhibitionRecolorPalettePresetItem[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (items: ExhibitionRecolorPalettePresetItem[]) => void;
}) {
  const [drafts, setDrafts] = useState<ExhibitionRecolorPalettePresetItem[]>([]);
  useEffect(() => {
    if (open) setDrafts(palettes.map((item) => ({ ...item })));
  }, [open, palettes]);
  if (!open) return null;
  const patch = (index: number, patchValue: Partial<ExhibitionRecolorPalettePresetItem>) => {
    setDrafts((items) => items.map((item, i) => (i === index ? { ...item, ...patchValue } : item)));
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
      <div className="w-[720px] max-w-[95vw] rounded-xl border border-white/15 bg-zinc-950 p-3 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Palette size={16} className="text-cyan-200" />
          <div className="text-sm font-semibold text-white">主色调配色预设</div>
          <button type="button" className={`${BUTTON} ml-auto`} onClick={onClose} disabled={saving}><X size={12} /> 关闭</button>
        </div>
        {error && <div className="mb-2 rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{error}</div>}
        <div className="max-h-[520px] space-y-2 overflow-y-auto">
          {drafts.map((item, index) => (
            <div key={item.id || index} className="grid grid-cols-[1fr_92px_92px_92px_32px] gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
              <div className="space-y-1">
                <input className={FIELD} value={item.label} disabled={saving} placeholder="预设名称" onChange={(event) => patch(index, { label: event.target.value })} />
                <input className={FIELD} value={item.description || ''} disabled={saving} placeholder="说明" onChange={(event) => patch(index, { description: event.target.value })} />
              </div>
              {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map((key) => (
                <input
                  key={key}
                  type="color"
                  className="h-full min-h-16 w-full rounded border border-white/10 bg-transparent"
                  value={normalizeExhibitionRecolorColor(item[key], EXHIBITION_RECOLOR_DEFAULT_COLORS[key])}
                  disabled={saving}
                  onChange={(event) => patch(index, { [key]: event.target.value } as any)}
                />
              ))}
              <button
                type="button"
                className="flex h-full min-h-16 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-white/55 hover:bg-red-400/15 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={saving || drafts.length <= 1}
                title="删除预设"
                onClick={() => setDrafts((items) => items.filter((_, i) => i !== index).map((next, i) => ({ ...next, order: i })))}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between">
          <button type="button" className={BUTTON} disabled={saving} onClick={() => setDrafts((items) => [...items, {
            id: `palette-${Date.now()}`,
            label: '新配色',
            primaryColor: EXHIBITION_RECOLOR_DEFAULT_COLORS.primaryColor,
            secondaryColor: EXHIBITION_RECOLOR_DEFAULT_COLORS.secondaryColor,
            accentColor: EXHIBITION_RECOLOR_DEFAULT_COLORS.accentColor,
            description: '',
            order: items.length,
          }])}>新增预设</button>
          <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={saving} onClick={() => onSave(drafts)}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Settings size={12} />} 保存
          </button>
        </div>
      </div>
    </div>
  );
}

function ExclusionEditorModal({
  open,
  exclusions,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  exclusions: ExhibitionRecolorExcludePresetItem[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (items: ExhibitionRecolorExcludePresetItem[]) => void;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(exclusions.map((item) => item.label).join('\n'));
  }, [exclusions, open]);
  if (!open) return null;
  const parsed = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((label, index) => ({
    id: exclusions[index]?.id || `exclude-${index + 1}`,
    label,
    order: index,
  }));
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
      <div className="w-[520px] max-w-[95vw] rounded-xl border border-white/15 bg-zinc-950 p-3 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-cyan-200" />
          <div className="text-sm font-semibold text-white">保护排除项预设</div>
          <button type="button" className={`${BUTTON} ml-auto`} onClick={onClose} disabled={saving}><X size={12} /> 关闭</button>
        </div>
        {error && <div className="mb-2 rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{error}</div>}
        <textarea className={`${FIELD} min-h-[260px] resize-y`} value={text} disabled={saving} onChange={(event) => setText(event.target.value)} />
        <div className="mt-3 flex justify-end">
          <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={saving || parsed.length === 0} onClick={() => onSave(parsed)}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Settings size={12} />} 保存
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageSlot({ url }: { url: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/15 p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 原始图像</div>
      {url ? (
        <img src={url} alt="" className="h-40 w-full rounded border border-white/10 object-contain" draggable={false} />
      ) : (
        <div className="flex h-40 items-center justify-center rounded border border-dashed border-white/15 text-[10px] text-white/35">连接原始图像输入</div>
      )}
    </div>
  );
}

const ExhibitionRecolorNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const pollAbortRef = useRef(false);
  const originalImage = useInputImageByHandle(id, 'original-image');
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [palettes, setPalettes] = useState<ExhibitionRecolorPalettePresetItem[]>([]);
  const [exclusions, setExclusions] = useState<ExhibitionRecolorExcludePresetItem[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [exclusionOpen, setExclusionOpen] = useState(false);
  const [paletteSaving, setPaletteSaving] = useState(false);
  const [exclusionSaving, setExclusionSaving] = useState(false);
  const [paletteError, setPaletteError] = useState('');
  const [exclusionError, setExclusionError] = useState('');

  const status = String(d.status || 'idle');
  const busy = status === 'generating';
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const model = d.model || 'gpt-image-2';
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || '16:9';
  const sizeLevel = d.sizeLevel || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const primaryColor = normalizeExhibitionRecolorColor(d.primaryColor, EXHIBITION_RECOLOR_DEFAULT_COLORS.primaryColor);
  const secondaryColor = normalizeExhibitionRecolorColor(d.secondaryColor, EXHIBITION_RECOLOR_DEFAULT_COLORS.secondaryColor);
  const accentColor = normalizeExhibitionRecolorColor(d.accentColor, EXHIBITION_RECOLOR_DEFAULT_COLORS.accentColor);
  const brightness = normalizeExhibitionRecolorBrightness(d.brightness);
  const selectedExcludeItems = useMemo(() => (
    Array.isArray(d.excludeItems) ? d.excludeItems.map(String).filter(Boolean) : ['exhibit', 'sand-table', 'sculpture']
  ), [d.excludeItems]);
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
  const selectedPalette = palettes.find((item) => item.id === d.palettePresetId) || null;

  const prompt = useMemo(() => buildExhibitionRecolorPrompt({
    primaryColor,
    secondaryColor,
    accentColor,
    brightness,
    excludeItems: selectedExcludeItems,
    excludeItemOptions: exclusions,
    manualExclusions: d.manualExclusions,
  }), [accentColor, brightness, d.manualExclusions, exclusions, primaryColor, secondaryColor, selectedExcludeItems]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getExhibitionRecolorPromptPresets()
      .then((presets) => {
        setPalettes(presets.palettes || []);
        setExclusions(presets.exclusions || []);
      })
      .catch(() => {
        setPalettes([]);
        setExclusions([]);
      });
  }, []);

  useEffect(() => {
    if (!palettes.length || d.palettePresetId || d.palettePresetInitialized) return;
    const first = palettes[0];
    update({
      palettePresetId: first.id,
      palettePresetInitialized: true,
      primaryColor: first.primaryColor,
      secondaryColor: first.secondaryColor,
      accentColor: first.accentColor,
    });
  }, [d.palettePresetId, d.palettePresetInitialized, palettes, update]);

  useEffect(() => {
    if (!originalImage || isReadonly || busy) return;
    const ratioSourceKey = `${originalImage}|${modelDef.id}`;
    if (d.aspectRatioSource === ratioSourceKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const sourceRatio = await readImageNaturalRatio(originalImage);
        const nextRatio = closestAspectRatio(sourceRatio, modelDef.aspectRatios);
        if (!cancelled) update({ aspectRatio: nextRatio, aspectRatioSource: ratioSourceKey });
      } catch {
        if (!cancelled) update({ aspectRatioSource: ratioSourceKey });
      }
    })();
    return () => { cancelled = true; };
  }, [busy, d.aspectRatioSource, isReadonly, modelDef.aspectRatios, modelDef.id, originalImage, update]);

  useEffect(() => {
    const refs = [originalImage].filter(Boolean);
    if (d.prompt !== prompt || d.outputText !== prompt || d.text !== prompt || JSON.stringify(d.referenceImages || []) !== JSON.stringify(refs)) {
      update({ prompt, outputText: prompt, text: prompt, referenceImages: refs });
    }
  }, [d.outputText, d.prompt, d.referenceImages, d.text, originalImage, prompt, update]);

  const applyPalette = (paletteId: string) => {
    const palette = palettes.find((item) => item.id === paletteId);
    if (!palette) {
      update({ palettePresetId: '' });
      return;
    }
    update({
      palettePresetId: palette.id,
      primaryColor: palette.primaryColor,
      secondaryColor: palette.secondaryColor,
      accentColor: palette.accentColor,
    });
  };

  const toggleExclusion = (excludeId: string) => {
    const current = new Set(selectedExcludeItems);
    if (current.has(excludeId)) current.delete(excludeId);
    else current.add(excludeId);
    update({ excludeItems: Array.from(current) });
  };

  const savePalettes = async (items: ExhibitionRecolorPalettePresetItem[]) => {
    if (!canManageTeam) return;
    setPaletteSaving(true);
    setPaletteError('');
    try {
      const saved = await updateExhibitionRecolorPalettePresets(items);
      setPalettes(saved);
      setPaletteOpen(false);
    } catch (error: any) {
      setPaletteError(error?.message || '保存配色预设失败');
    } finally {
      setPaletteSaving(false);
    }
  };

  const saveExclusions = async (items: ExhibitionRecolorExcludePresetItem[]) => {
    if (!canManageTeam) return;
    setExclusionSaving(true);
    setExclusionError('');
    try {
      const saved = await updateExhibitionRecolorExcludePresets(items);
      setExclusions(saved);
      setExclusionOpen(false);
    } catch (error: any) {
      setExclusionError(error?.message || '保存保护排除项失败');
    } finally {
      setExclusionSaving(false);
    }
  };

  const runGenerate = useCallback(async () => {
    if (isReadonly) return;
    if (!originalImage) {
      const msg = '请连接原始图像';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    const runtimeReferenceImages = [originalImage];
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-recolor:${id.slice(0, 6)}`;
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'exhibition-recolor',
      seed: runSeed,
      nodeTitle: '主色调更换',
    };
    pollAbortRef.current = false;
    taskCompletionSound.primeAudio();
    update({ status: 'generating', progress: '0%', error: '', lastSeed: runSeed, usedI2I: true });
    try {
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
        logBus.info(`主色调更换提交: ${providerSelection.provider.label || providerSelection.provider.id} / ${externalProviderModel}`, src);
        let res = await generateExternalImage({
          providerId: providerSelection.provider.id,
          providerModel: externalProviderModel,
          model: externalProviderModel,
          prompt,
          size,
          aspect_ratio: aspectRatio,
          image_size: sizeLevel,
          images: runtimeReferenceImages,
          outputFormat,
          seed: runSeed,
          n: Math.max(1, Math.min(4, Number(providerParams.n || 1))),
          providerParams,
          historyContext,
          async: true,
        });
        if ((!res.imageUrls?.length) && res.taskId && (res.code === 'running' || res.status === 'running')) {
          let pollingTaskId = res.taskId;
          update({ progress: '生成中', taskId: pollingTaskId });
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
        const urls = res.imageUrls || [];
        if (!urls.length) throw new Error('扩展平台完成但未返回图片');
        update({
          status: 'success',
          progress: '100%',
          imageUrl: urls[0],
          imageUrls: urls,
          urls,
          remoteImageUrls: res.remoteImageUrls,
          lastPrompt: prompt,
          lastSeed: runSeed,
          taskId: res.taskId || d.taskId,
          usedI2I: true,
          error: '',
        });
        logBus.success(`主色调更换完成 -> ${urls[0]}`, src);
        taskCompletionSound.notifyComplete(id, 'image');
        return;
      }

      logBus.info(`主色调更换提交: model=${apiModel} ratio=${aspectRatio} size=${sizeLevel}`, src);
      const submit = await submitImageAsync({
        model: modelDef.id,
        apiModel,
        paramKind: modelDef.paramKind,
        prompt,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images: runtimeReferenceImages,
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
          urls: submit.urls,
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
        const statusText = String(q.status || '').toLowerCase();
        if (statusText === 'completed' || statusText === 'success' || statusText === 'done') {
          const url = q.urls?.[0];
          if (!url) throw new Error('任务完成但未返回图片');
          update({
            status: 'success',
            progress: '100%',
            imageUrl: url,
            imageUrls: q.urls,
            urls: q.urls,
            lastPrompt: prompt,
            lastSeed: runSeed,
            usedI2I: true,
            error: '',
          });
          logBus.success(`主色调更换完成 -> ${url}`, src);
          taskCompletionSound.notifyComplete(id, 'image');
          return;
        }
        if (statusText === 'failed' || statusText === 'failure' || statusText === 'error') {
          throw new Error(q.error || '任务失败');
        }
      }
      throw new Error('轮询超时');
    } catch (error: any) {
      const msg = error?.message || '生成失败';
      logBus.error(`主色调更换失败: ${msg}`, src);
      update({ status: 'error', error: msg });
      throw error;
    }
  }, [
    activeCanvasId,
    apiModel,
    aspectRatio,
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
    prompt,
    providerSelection.provider,
    seed,
    sizeLevel,
    update,
  ]);

  useRunTrigger(id, runGenerate, 'image');

  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      className={`relative w-[640px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle id="original-image" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-amber-300" style={{ top: '28%' }} title="输入：原始图像" />
      <Handle type="source" position={Position.Right} className="!bg-cyan-300 !border-0" title="输出：换色结果图像" />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <Palette size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">主色调更换</div>
          <div className="truncate text-[10px] text-white/45">只替换色彩与明暗度 / 保护展品与指定对象</div>
        </div>
        <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}>
          <Play size={12} /> run
        </button>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div className="nodrag nopan max-h-[760px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <ImageSlot url={originalImage} />

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><Palette size={13} /> 色调</div>
            {canManageTeam && (
              <button type="button" className={`${BUTTON} ml-auto`} disabled={busy || paletteSaving} onClick={() => setPaletteOpen(true)}>
                <Settings size={11} /> 编辑预设
              </button>
            )}
          </div>
          <select className={FIELD} value={d.palettePresetId || ''} disabled={isReadonly || busy} onChange={(event) => applyPalette(event.target.value)}>
            <option value="">自定义当前色块</option>
            {palettes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {selectedPalette?.description && <div className="rounded border border-cyan-300/15 bg-cyan-300/5 px-2 py-1 text-[10px] leading-snug text-cyan-50/70">{selectedPalette.description}</div>}
          <div className="grid grid-cols-3 gap-2">
            <ColorControl label="主色调" value={primaryColor} disabled={isReadonly || busy} onChange={(value) => update({ primaryColor: value, palettePresetId: '' })} />
            <ColorControl label="辅助色调" value={secondaryColor} disabled={isReadonly || busy} onChange={(value) => update({ secondaryColor: value, palettePresetId: '' })} />
            <ColorControl label="点缀色" value={accentColor} disabled={isReadonly || busy} onChange={(value) => update({ accentColor: value, palettePresetId: '' })} />
          </div>
          <label className="block rounded border border-white/10 bg-black/15 p-2">
            <div className="mb-1 flex items-center justify-between text-[10px] text-white/55">
              <span>明暗度</span>
              <span className="font-mono text-cyan-100">{brightness > 0 ? `+${brightness}` : brightness}</span>
            </div>
            <input
              type="range"
              min={-50}
              max={50}
              value={brightness}
              disabled={isReadonly || busy}
              className="w-full accent-cyan-300"
              onChange={(event) => update({ brightness: normalizeExhibitionRecolorBrightness(event.target.value) })}
            />
          </label>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><SlidersHorizontal size={13} /> 保护排除项</div>
            {canManageTeam && (
              <button type="button" className={`${BUTTON} ml-auto`} disabled={busy || exclusionSaving} onClick={() => setExclusionOpen(true)}>
                <Settings size={11} /> 编辑排除项
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {exclusions.map((item) => {
              const active = selectedExcludeItems.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isReadonly || busy}
                  className={`rounded border px-2 py-1 text-[10px] transition ${
                    active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                  onClick={() => toggleExclusion(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <textarea
            className={`${FIELD} min-h-[54px] resize-y`}
            value={d.manualExclusions || ''}
            disabled={isReadonly || busy}
            placeholder="手动输入需要保持不变的对象，例如：核心展柜、青铜器、入口 LOGO"
            onChange={(event) => update({ manualExclusions: event.target.value })}
          />
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生成</div>
            <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy || !originalImage} onClick={() => void runGenerate()}><Play size={13} /> 生成换色图</button>
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
                {(['jpg', 'png'] as const).map((fmt) => {
                  const active = outputFormat === fmt;
                  return (
                    <button
                      key={fmt}
                      type="button"
                      disabled={isReadonly || busy}
                      onClick={() => update({ outputFormat: fmt })}
                      className={`rounded py-1 text-[10px] font-semibold transition-all ${active ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">Seed</span>
              <input className={FIELD} type="number" min={0} value={seed || ''} disabled={isReadonly || busy} placeholder="随机" onChange={(event) => update({ seed: event.target.value })} />
            </label>
          </div>
          {d.progress && <div className="text-[10px] text-cyan-100">{d.progress}</div>}
          {d.imageUrl && <img src={d.imageUrl} alt="" className="max-h-56 w-full rounded border border-white/10 object-contain" draggable={false} />}
        </section>
      </div>

      <PaletteEditorModal
        open={paletteOpen}
        palettes={palettes}
        saving={paletteSaving || busy}
        error={paletteError}
        onClose={() => setPaletteOpen(false)}
        onSave={savePalettes}
      />
      <ExclusionEditorModal
        open={exclusionOpen}
        exclusions={exclusions}
        saving={exclusionSaving || busy}
        error={exclusionError}
        onClose={() => setExclusionOpen(false)}
        onSave={saveExclusions}
      />
    </div>
  );
};

export default memo(ExhibitionRecolorNode);
