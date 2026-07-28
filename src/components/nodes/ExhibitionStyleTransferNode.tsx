import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, useReactFlow, type NodeProps } from '@xyflow/react';
import SmartImage from '../SmartImage';
import { EXHIBITION_IMAGE_HANDLE_COLOR } from '../../config/portTypes';
import { Image as ImageIcon, Palette, Play, Settings, Shuffle } from 'lucide-react';
import { IMAGE_MODELS } from '../../providers/models';
import {
  getCurrentUser,
  getElevationPromptPresets,
  getUnitPanelMaterials,
  updateElevationColorMaterialPresets,
  updateUnitPanelMaterials,
  type AuthUser,
  type ElevationColorMaterialPresetItem,
  type UnitPanelMaterialItem,
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
  buildExhibitionStyleTransferPrompt,
  normalizeExhibitionStyleTransferMode,
  type ExhibitionStyleTransferMode,
} from '../../utils/exhibitionStyleTransferPrompt';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { FhlImageModuleControls } from './FhlImageModule';
import ColorMaterialPresetEditorModal from './ColorMaterialPresetEditorModal';
import ColorMaterialPresetSelect from './ColorMaterialPresetSelect';
import UnitPanelMaterialEditorModal from './UnitPanelMaterialEditorModal';
import UnitPanelMaterialSelect from './UnitPanelMaterialSelect';
import NodeHelpButton from './NodeHelpButton';
import MentionPromptInput from './MentionPromptInput';
import { materialMentionKey, resolveMediaMentions, tokenForMaterial, type MediaMention } from './mediaMentions';
import type { Material } from './useUpstreamMaterials';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const STYLE_REFERENCE_HANDLE_COLOR = '#f472b6';
const MAX_IMAGE_SEED = 2147483647;
const EXTERNAL_IMAGE_MAX_POLLS = 300;
const EXTERNAL_IMAGE_POLL_INTERVAL_MS = 3000;

const STYLE_MODES: Array<{ id: ExhibitionStyleTransferMode; label: string; hint: string }> = [
  { id: 'style-reference', label: '设计风格参考图', hint: '从参考图提取风格、色彩、材质和光泽' },
  { id: 'color-material-preset', label: '色彩与材质预设', hint: '使用展陈图生图共享色材预设' },
  { id: 'material-replacement', label: '主/辅材质替换', hint: '使用单元板共享材质库' },
];

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
    image.onerror = () => reject(new Error('图像加载失败，无法读取尺寸'));
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

function colorMaterialTextFromPreset(preset: ElevationColorMaterialPresetItem | null): string {
  if (!preset) return '';
  return [preset.label, preset.core, preset.features, preset.usage, preset.info].map((item) => String(item || '').trim()).filter(Boolean).join('；');
}

function colorPaletteTextFromPreset(preset: ElevationColorMaterialPresetItem | null): string {
  return String(preset?.core || preset?.info || preset?.label || '').trim();
}

function materialTexturesTextFromPreset(preset: ElevationColorMaterialPresetItem | null): string {
  return String(preset?.features || preset?.info || preset?.core || preset?.label || '').trim();
}

function buildColorMaterialPresetPayload(presets: ElevationColorMaterialPresetItem[]) {
  return presets.map((preset, index) => ({
    id: preset.id,
    category: preset.category,
    label: preset.label,
    core: preset.core || '',
    features: preset.features || '',
    usage: preset.usage || '',
    negativePrompt: preset.negativePrompt || '',
    info: preset.info || '',
    order: index,
  }));
}

function mediaMentions(value: unknown): MediaMention[] {
  return Array.isArray(value) ? (value as MediaMention[]) : [];
}

function buildMentionMaterials(originalImage: string, styleReferenceImage: string, mode: ExhibitionStyleTransferMode): Material[] {
  const items: Material[] = [];
  if (originalImage) {
    items.push({
      id: 'style-transfer-original-image',
      kind: 'image',
      url: originalImage,
      sourceNodeId: 'style-transfer-original-image',
      origin: 'upstream',
      label: '原始图像',
      mentionKey: 'exhibition-style-transfer:original-image',
      mentionToken: '@img1',
    } as Material & { mentionKey: string; mentionToken: string });
  }
  if (mode === 'style-reference' && styleReferenceImage) {
    items.push({
      id: 'style-transfer-style-reference',
      kind: 'image',
      url: styleReferenceImage,
      sourceNodeId: 'style-transfer-style-reference',
      origin: 'upstream',
      label: '设计风格参考图',
      mentionKey: 'exhibition-style-transfer:style-reference',
      mentionToken: '@img2',
    } as Material & { mentionKey: string; mentionToken: string });
  }
  return items;
}

function buildPromptMentions(text: string, materials: Material[]): MediaMention[] {
  const mentions: MediaMention[] = [];
  for (const material of materials) {
    const token = tokenForMaterial(material, materials);
    if (!token || token === '@material') continue;
    let start = text.indexOf(token);
    while (start >= 0) {
      mentions.push({
        id: `${materialMentionKey(material)}:${start}`,
        kind: material.kind as MediaMention['kind'],
        materialKey: materialMentionKey(material),
        url: material.url,
        label: material.label,
        token,
        start,
        end: start + token.length,
      });
      start = text.indexOf(token, start + token.length);
    }
  }
  return mentions.sort((a, b) => a.start - b.start);
}

function ImageSlot({ title, subtitle, url }: { title: string; subtitle: string; url: string }) {
  return (
    <div className="relative rounded border border-white/10 bg-black/15 p-2">
      <div className="mb-1 text-[11px] font-semibold text-cyan-100">{title}</div>
      <div className="mb-2 text-[10px] leading-snug text-white/45">{subtitle}</div>
      {url ? (
        <SmartImage src={url} alt="" className="h-28 w-full rounded border border-white/10 object-contain" draggable={false} thumbSize={360} />
      ) : (
        <div className="flex h-28 items-center justify-center rounded border border-dashed border-white/15 text-[10px] text-white/35">连接图像输入</div>
      )}
    </div>
  );
}

const ExhibitionStyleTransferNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const pollAbortRef = useRef(false);
  const originalImage = useInputImageByHandle(id, 'original-image');
  const styleReferenceImage = useInputImageByHandle(id, 'style-reference');
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);
  const [colorMaterialOpen, setColorMaterialOpen] = useState(false);
  const [colorMaterialSaving, setColorMaterialSaving] = useState(false);
  const [colorMaterialError, setColorMaterialError] = useState('');
  const [materials, setMaterials] = useState<UnitPanelMaterialItem[]>([]);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [materialsError, setMaterialsError] = useState('');

  const mode = normalizeExhibitionStyleTransferMode(d.styleTransferMode) as ExhibitionStyleTransferMode;
  const status = String(d.status || 'idle');
  const busy = status === 'generating';
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const canManageMaterials = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const model = d.model || 'gpt-image-2';
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === model) || IMAGE_MODELS[0], [model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || '16:9';
  const sizeLevel = d.sizeLevel || '2K';
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
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

  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );
  const selectedPrimaryMaterial = useMemo(
    () => materials.find((item) => item.id === d.primaryMaterialId) || null,
    [d.primaryMaterialId, materials],
  );
  const selectedSecondaryMaterials = useMemo(() => {
    const ids = Array.isArray(d.secondaryMaterialIds) ? d.secondaryMaterialIds.map(String) : [];
    return materials.filter((item) => ids.includes(item.id));
  }, [d.secondaryMaterialIds, materials]);
  const supplementMentions = mediaMentions(d.supplementMentions);
  const mentionMaterials = useMemo(
    () => buildMentionMaterials(originalImage, styleReferenceImage, mode),
    [mode, originalImage, styleReferenceImage],
  );
  const resolvedSupplement = useMemo(
    () => resolveMediaMentions(String(d.supplement || ''), supplementMentions, mentionMaterials),
    [d.supplement, mentionMaterials, supplementMentions],
  );

  const rawPrompt = useMemo(() => buildExhibitionStyleTransferPrompt({
    mode,
    colorMaterial: colorMaterialTextFromPreset(selectedColorMaterialPreset),
    colorMaterialPalette: colorPaletteTextFromPreset(selectedColorMaterialPreset),
    colorMaterialTextures: materialTexturesTextFromPreset(selectedColorMaterialPreset),
    primaryMaterial: selectedPrimaryMaterial,
    secondaryMaterials: selectedSecondaryMaterials,
    supplement: resolvedSupplement,
  }), [mode, resolvedSupplement, selectedColorMaterialPreset, selectedPrimaryMaterial, selectedSecondaryMaterials]);
  const promptMentions = useMemo(() => buildPromptMentions(rawPrompt, mentionMaterials), [mentionMaterials, rawPrompt]);
  const prompt = useMemo(
    () => resolveMediaMentions(rawPrompt, promptMentions, mentionMaterials),
    [mentionMaterials, promptMentions, rawPrompt],
  );

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getElevationPromptPresets().then((presets) => setColorMaterialPresets(presets.colorMaterial || [])).catch(() => setColorMaterialPresets([]));
    getUnitPanelMaterials().then(setMaterials).catch(() => setMaterials([]));
  }, []);

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
    if (mode === 'style-reference') return;
    if (styleReferenceImage) {
      rf.setEdges((eds) => eds.filter((edge: any) => edge.target !== id || (edge.targetHandle || '') !== 'style-reference'));
    }
  }, [id, mode, rf, styleReferenceImage]);

  useEffect(() => {
    const refs = [originalImage, mode === 'style-reference' ? styleReferenceImage : ''].filter(Boolean);
    if (
      d.prompt !== prompt
      || d.outputText !== prompt
      || d.text !== prompt
      || JSON.stringify(d.referenceImages || []) !== JSON.stringify(refs)
      || JSON.stringify(mediaMentions(d.promptMentions)) !== JSON.stringify(promptMentions)
    ) {
      update({ prompt, outputText: prompt, text: prompt, referenceImages: refs, promptMentions });
    }
  }, [d.outputText, d.prompt, d.promptMentions, d.referenceImages, d.text, mode, originalImage, prompt, promptMentions, styleReferenceImage, update]);

  const saveColorMaterialPresetItems = async (presets: ElevationColorMaterialPresetItem[]) => {
    if (!canManageTeam) return;
    if (presets.length === 0) {
      setColorMaterialError('请至少保留一条色彩与材质预设。');
      return;
    }
    setColorMaterialSaving(true);
    setColorMaterialError('');
    try {
      const saved = await updateElevationColorMaterialPresets(buildColorMaterialPresetPayload(presets));
      setColorMaterialPresets(saved);
      setColorMaterialOpen(false);
    } catch (error: any) {
      setColorMaterialError(error?.message || '保存色彩与材质预设失败');
    } finally {
      setColorMaterialSaving(false);
    }
  };

  const saveMaterials = async (next: UnitPanelMaterialItem[]) => {
    if (!canManageMaterials) return;
    setMaterialsSaving(true);
    setMaterialsError('');
    try {
      const saved = await updateUnitPanelMaterials(next);
      setMaterials(saved);
      setMaterialsOpen(false);
    } catch (error: any) {
      setMaterialsError(error?.message || '材质保存失败');
    } finally {
      setMaterialsSaving(false);
    }
  };

  const setMode = (nextMode: ExhibitionStyleTransferMode) => {
    if (isReadonly || busy || nextMode === mode) return;
    const patch: Record<string, any> = { styleTransferMode: nextMode };
    if (nextMode !== 'style-reference') {
      rf.setEdges((eds) => eds.filter((edge: any) => edge.target !== id || (edge.targetHandle || '') !== 'style-reference'));
    }
    if (nextMode !== 'color-material-preset') patch.colorMaterialPreset = '';
    if (nextMode !== 'material-replacement') patch.primaryMaterialId = '', patch.secondaryMaterialIds = [];
    update(patch);
  };

  const runGenerate = useCallback(async () => {
    if (isReadonly) return;
    if (!originalImage) {
      const msg = '请连接原始图像';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    if (mode === 'style-reference' && !styleReferenceImage) {
      const msg = '请连接设计风格参考图';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    if (mode === 'color-material-preset' && !selectedColorMaterialPreset) {
      const msg = '请选择色彩与材质预设';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    if (mode === 'material-replacement' && !selectedPrimaryMaterial && selectedSecondaryMaterials.length === 0) {
      const msg = '请选择主材质或至少一个辅助材质';
      update({ status: 'error', error: msg });
      throw new Error(msg);
    }
    const runtimeReferenceImages = [originalImage, mode === 'style-reference' ? styleReferenceImage : ''].filter(Boolean);
    const runSeed = seed > 0 ? seed : randomImageSeed();
    const src = `exhibition-style-transfer:${id.slice(0, 6)}`;
    const historyContext = {
      canvasId: activeCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'exhibition-style-transfer',
      seed: runSeed,
      nodeTitle: '风格迁移',
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
        logBus.info(`风格迁移提交: ${providerSelection.provider.label || providerSelection.provider.id} · ${externalProviderModel} · refs=${runtimeReferenceImages.length}`, src);
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
          remoteImageUrls: res.remoteImageUrls,
          lastPrompt: prompt,
          lastSeed: runSeed,
          taskId: res.taskId || d.taskId,
          usedI2I: true,
          error: '',
        });
        logBus.success(`风格迁移完成 → ${urls[0]}`, src);
        taskCompletionSound.notifyComplete(id, 'image');
        return;
      }

      logBus.info(`风格迁移提交: model=${apiModel} ratio=${aspectRatio} size=${sizeLevel} refs=${runtimeReferenceImages.length}`, src);
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
            lastPrompt: prompt,
            lastSeed: runSeed,
            usedI2I: true,
            error: '',
          });
          logBus.success(`风格迁移完成 → ${url}`, src);
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
      logBus.error(`风格迁移失败: ${msg}`, src);
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
    mode,
    modelDef.id,
    modelDef.paramKind,
    originalImage,
    outputFormat,
    prompt,
    providerSelection.provider,
    seed,
    selectedColorMaterialPreset,
    selectedPrimaryMaterial,
    selectedSecondaryMaterials.length,
    sizeLevel,
    styleReferenceImage,
    update,
  ]);

  useRunTrigger(id, runGenerate, 'image');

  const availableModelDefs = IMAGE_MODELS.filter((item) => item.paramKind !== 'mj');

  return (
    <div
      data-exhibition-compact-node-type="exhibition-style-transfer"
      className={`relative w-[680px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle id="original-image" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '24%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：原始图像" />
      <Handle id="style-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--pink" style={{ top: '39%', background: STYLE_REFERENCE_HANDLE_COLOR }} title="输入：设计风格参考图" />
      <Handle type="source" position={Position.Right} className="!border-0 t8-exhibition-handle--image" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：风格迁移结果（图像）" />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <Shuffle size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">风格迁移</div>
          <div className="truncate text-[10px] text-white/45">原图结构不变 / 风格色材迁移 / 图生图输出</div>
        </div>
        <NodeHelpButton nodeType="exhibition-style-transfer" />
      </div>

      <div className="nodrag nopan max-h-[760px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
        {isReadonly && <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">当前画布为只读，仅可查看结果。</div>}
        {d.error && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{d.error}</div>}

        <section data-exhibition-compact-section="input" data-exhibition-compact-item="main" className="grid grid-cols-2 gap-2">
          <ImageSlot title="原始图像" subtitle="空间、展品、文字、展示手段和构图唯一依据" url={originalImage} />
          <ImageSlot title="设计风格参考图" subtitle={mode === 'style-reference' ? '只提取风格、色彩、材质、肌理和灯光氛围' : '当前模式会自动断开并清空此输入'} url={mode === 'style-reference' ? styleReferenceImage : ''} />
        </section>

        <section data-exhibition-compact-section="style" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
            <Palette size={13} /> 风格控制
          </div>
          <div className="grid grid-cols-3 gap-1">
            {STYLE_MODES.map((item) => {
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isReadonly || busy}
                  className={`min-h-14 rounded border px-2 py-1 text-left transition ${
                    active ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                  onClick={() => setMode(item.id)}
                >
                  <span className="block text-[10px] font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-[9px] leading-snug opacity-70">{item.hint}</span>
                </button>
              );
            })}
          </div>

          {mode === 'color-material-preset' && (
            <div className="space-y-2 rounded border border-white/10 bg-black/15 p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-cyan-100">色彩与材质预设</span>
                {currentUser && (
                  <button type="button" className={`${BUTTON} ml-auto`} disabled={colorMaterialSaving || busy} onClick={() => setColorMaterialOpen(true)}>
                    <Settings size={11} /> 编辑
                  </button>
                )}
              </div>
              <ColorMaterialPresetSelect
                className={FIELD}
                presets={colorMaterialPresets}
                value={d.colorMaterialPreset || ''}
                disabled={isReadonly || busy}
                onChange={(presetId) => update({ colorMaterialPreset: presetId })}
              />
              {selectedColorMaterialPreset?.info && <div className="rounded border border-cyan-300/15 bg-cyan-300/5 px-2 py-1 text-[10px] leading-snug text-cyan-50/70">{selectedColorMaterialPreset.info}</div>}
            </div>
          )}

          {mode === 'material-replacement' && (
            <div className="space-y-2 rounded border border-white/10 bg-black/15 p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-cyan-100">主材质和辅助材质替换</span>
                {canManageMaterials && (
                  <button type="button" className={`${BUTTON} ml-auto`} disabled={materialsSaving || busy} onClick={() => setMaterialsOpen(true)}>
                    <Settings size={11} /> 编辑材质
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-white/55">主材质</span>
                  <UnitPanelMaterialSelect materials={materials} value={d.primaryMaterialId || ''} disabled={isReadonly || busy} className={FIELD} placeholder="选择主材质" onChange={(next) => update({ primaryMaterialId: next })} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-white/55">辅助材质</span>
                  <UnitPanelMaterialSelect materials={materials} multiple values={Array.isArray(d.secondaryMaterialIds) ? d.secondaryMaterialIds : []} disabled={isReadonly || busy} className={FIELD} placeholder="选择辅助材质" onChange={(next) => update({ secondaryMaterialIds: next })} />
                </label>
              </div>
            </div>
          )}
        </section>

        <section data-exhibition-compact-section="model" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <FhlImageModuleControls compact nodeId={id} data={d} update={update} busy={busy} isReadonly={isReadonly} referenceCount={2} />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} /> 生成</div>
            <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy} onClick={() => void runGenerate()}><Play size={13} /> 生成风格迁移</button>
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
            <label className="space-y-1">
              <span className="text-[10px] text-white/55">补充要求</span>
              <MentionPromptInput
                value={d.supplement || ''}
                mentions={supplementMentions}
                materials={mentionMaterials}
                onChange={(value, mentions) => update({ supplement: value, supplementMentions: mentions })}
                placeholder="仅补充风格/材质要求，可用 @ 引用原始图像或风格参考图"
                className={`${FIELD} min-h-[36px]`}
                isDark
                isPixel={false}
                disabled={isReadonly || busy}
                expandable={false}
              />
            </label>
          </div>
          {d.progress && <div className="text-[10px] text-cyan-100">{d.progress}</div>}
          {d.imageUrl && <SmartImage src={d.imageUrl} alt="" className="max-h-56 w-full rounded border border-white/10 object-contain" draggable={false} thumbSize={360} />}
        </section>
      </div>

      <ColorMaterialPresetEditorModal
        open={colorMaterialOpen}
        presets={colorMaterialPresets}
        saving={colorMaterialSaving || busy}
        error={colorMaterialError}
        title="风格迁移色彩与材质预设管理"
        onClose={() => setColorMaterialOpen(false)}
        onSave={saveColorMaterialPresetItems}
        canManageSystem={canManageTeam}
        onRefresh={setColorMaterialPresets}
      />
      <UnitPanelMaterialEditorModal
        open={materialsOpen}
        materials={materials}
        saving={materialsSaving || busy}
        error={materialsError}
        onClose={() => setMaterialsOpen(false)}
        onSave={saveMaterials}
      />
    </div>
  );
};

export default memo(ExhibitionStyleTransferNode);
