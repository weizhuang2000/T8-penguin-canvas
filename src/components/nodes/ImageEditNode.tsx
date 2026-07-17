import { memo, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, Brush, Edit3, Image as ImageIcon, Loader2, Paintbrush, Sparkles, type LucideIcon } from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { generateExternalImage, queryExternalImageStatus } from '../../services/generation';
import { useApiKeysStore } from '../../stores/apiKeys';
import { advancedProviderModelOptions, advancedProvidersForNode, externalImageSizeFor } from '../../utils/advancedProviders';
import { useCanvasRuntime } from './canvasRuntimeContext';
import ImageEditModal, {
  type EditMode,
  type ImageEditDraft,
  type ImageEditProduceMeta,
} from './ImageEditModal';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';

type ImageEditDraftMap = Record<string, ImageEditDraft>;

const MODE_BUTTONS: Array<{ mode: EditMode; label: string; icon: LucideIcon }> = [
  { mode: 'mask', label: '遮罩', icon: Brush },
  { mode: 'brush', label: '画板', icon: Paintbrush },
];

const DENOISE_DEFAULT_THRESHOLD_PX = 4;
const DENOISE_IMAGE_SIZE = '4K';
const DENOISE_POLL_INTERVAL_MS = 3000;
const DENOISE_TIMEOUT_MS = 8 * 60 * 1000;
const DENOISE_ASPECT_RATIOS = [
  { value: '1:1', ratio: 1 },
  { value: '4:3', ratio: 4 / 3 },
  { value: '3:4', ratio: 3 / 4 },
  { value: '16:9', ratio: 16 / 9 },
  { value: '9:16', ratio: 9 / 16 },
  { value: '3:2', ratio: 3 / 2 },
  { value: '2:3', ratio: 2 / 3 },
  { value: '21:9', ratio: 21 / 9 },
];

function sanitizeDenoiseThreshold(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DENOISE_DEFAULT_THRESHOLD_PX;
  return Math.max(1, Math.min(20, Math.round(n)));
}

function buildDenoisePrompt(thresholdPx: number) {
  return `重绘画面。主题、构图层次和细节保持不变，按照物理光线进行重绘，色调保持不变。要求边缘自然，阴影和透视合理。画面方法：去掉噪点、细小杂物、污点、破损，降噪阈值控制在${thresholdPx}像素以下。保持真实阴影和纹理，保留原图的光影特效产生的细小光斑。质量标准：主体清楚、构图高级、空间层次明确、材质和光线可信，适合直接用于节点生成或作为参考图。`;
}

function readImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

async function inferAspectRatioForImage(url: string) {
  try {
    const size = await readImageSize(url);
    const ratio = size.w > 0 && size.h > 0 ? size.w / size.h : 1;
    return DENOISE_ASPECT_RATIOS.reduce((best, item) =>
      Math.abs(item.ratio - ratio) < Math.abs(best.ratio - ratio) ? item : best,
    ).value;
  } catch {
    return '1:1';
  }
}

function hashSourceUrl(url: string) {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash) ^ url.charCodeAt(i);
  }
  return `src_${(hash >>> 0).toString(36)}`;
}

function asDraftMap(value: unknown): ImageEditDraftMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ImageEditDraftMap)
    : {};
}

const ImageEditNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const upstream = useUpstreamMaterials(id);
  const { loadedCanvasId } = useCanvasRuntime();
  const [editingMode, setEditingMode] = useState<EditMode | null>(null);
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const imageAdvancedProviders = useMemo(
    () => advancedProvidersForNode(advancedProviders, 'image'),
    [advancedProviders],
  );
  const firstImageAdvancedProvider = imageAdvancedProviders[0] || null;
  const firstImageProviderModel = firstImageAdvancedProvider
    ? advancedProviderModelOptions(firstImageAdvancedProvider, 'image')[0] || ''
    : '';

  const sourceImage = upstream.images[0]?.url || '';
  const sourceKey = sourceImage ? hashSourceUrl(sourceImage) : '';
  const drafts = useMemo(() => asDraftMap(d.imageEditDrafts), [d.imageEditDrafts]);
  const activeDraft = sourceKey ? drafts[sourceKey] || null : null;
  const resultUrls = Array.isArray(d.directImageUrls) && d.directImageUrls.length
    ? d.directImageUrls.filter(Boolean)
    : Array.isArray(d.imageUrls)
    ? d.imageUrls.filter(Boolean)
    : [];
  const resultUrl = String(d.directImageUrl || d.imageUrl || resultUrls[0] || '');
  const isRunning = d.status === 'generating';
  const hasSource = Boolean(sourceImage);
  const denoiseThresholdPx = sanitizeDenoiseThreshold(d.denoiseThresholdPx ?? DENOISE_DEFAULT_THRESHOLD_PX);
  const canDenoise = hasSource && !isRunning && Boolean(firstImageAdvancedProvider && firstImageProviderModel);

  const saveDraft = (draft: ImageEditDraft) => {
    if (!sourceKey) return;
    const nextDrafts = {
      ...drafts,
      [sourceKey]: {
        ...draft,
        sourceUrl: sourceImage,
        updatedAt: Date.now(),
      },
    };
    update({ imageEditDrafts: nextDrafts, lastImageEditSourceKey: sourceKey });
  };

  const handleProduce = async (urls: string[], meta: ImageEditProduceMeta) => {
    const cleanUrls = (Array.isArray(urls) ? urls : [])
      .map((url) => String(url || '').trim())
      .filter(Boolean);
    if (!cleanUrls.length) return;
    const first = cleanUrls[0];
    update({
      imageUrl: first,
      imageUrls: cleanUrls,
      directImageUrl: first,
      directImageUrls: cleanUrls,
      outputImageUrl: first,
      status: 'success',
      error: null,
      imageEditRunningLabel: null,
      imageEditLastMeta: meta,
      imageEditLastSourceUrl: sourceImage,
      imageEditLastSourceKey: sourceKey,
      ...(meta.type === 'annotation-modify' || meta.type === 'mask-modify'
        ? {
            prompt: meta.prompt,
            directOutputText: '修改结果',
            annotationModifyPrompt: meta.prompt,
            annotationModifyProviderId: meta.providerId,
            annotationModifyProviderModel: meta.providerModel,
          }
        : {}),
    });
  };

  const openEditor = (mode: EditMode) => {
    if (!hasSource || isRunning) return;
    setEditingMode(mode);
  };

  const runDenoise = async () => {
    if (!sourceImage || isRunning) return;
    if (!firstImageAdvancedProvider) {
      update({ status: 'error', error: '未配置可用的图像扩展平台' });
      return;
    }
    if (!firstImageProviderModel) {
      update({ status: 'error', error: '扩展平台未配置可用图像模型' });
      return;
    }

    const prompt = buildDenoisePrompt(denoiseThresholdPx);
    const historyContext = {
      canvasId: loadedCanvasId,
      sourceNodeId: id,
      sourceNodeType: 'image-edit',
      nodeTitle: String(d.label || '编辑图片'),
      outputTitle: '降噪结果',
    };

    update({
      status: 'generating',
      error: null,
      imageEditRunningLabel: '降噪生成中...',
      denoisePrompt: prompt,
      denoiseProviderId: firstImageAdvancedProvider.id,
      denoiseProviderModel: firstImageProviderModel,
    });

    try {
      const aspectRatio = await inferAspectRatioForImage(sourceImage);
      let result = await generateExternalImage({
        providerId: firstImageAdvancedProvider.id,
        providerModel: firstImageProviderModel,
        model: firstImageProviderModel,
        prompt,
        size: externalImageSizeFor(aspectRatio, DENOISE_IMAGE_SIZE),
        aspect_ratio: aspectRatio,
        image_size: DENOISE_IMAGE_SIZE,
        images: [sourceImage],
        n: 1,
        historyContext,
        async: true,
      });

      const maxPoll = Math.ceil(DENOISE_TIMEOUT_MS / DENOISE_POLL_INTERVAL_MS);
      const runningStatuses = new Set(['running', 'pending', 'submitted', 'in_progress', 'processing', 'queued']);
      if ((!result.imageUrls?.length) && result.taskId && runningStatuses.has(String(result.code || result.status || '').toLowerCase())) {
        let taskId = result.taskId;
        for (let i = 0; i < maxPoll; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, DENOISE_POLL_INTERVAL_MS));
          result = await queryExternalImageStatus({
            providerId: firstImageAdvancedProvider.id,
            providerModel: firstImageProviderModel,
            taskId,
            historyContext,
          });
          taskId = result.taskId || taskId;
          if (result.imageUrls?.length) break;
          const status = String(result.code || result.status || '').toLowerCase();
          if (status && !runningStatuses.has(status)) break;
        }
      }

      const urls = (result.imageUrls || []).filter(Boolean);
      if (!urls.length) throw new Error(result.error || '扩展平台完成但未返回图片');
      const first = urls[0];
      update({
        imageUrl: first,
        imageUrls: urls,
        directImageUrl: first,
        directImageUrls: urls,
        outputImageUrl: first,
        status: 'success',
        error: null,
        imageEditRunningLabel: null,
        imageEditLastMeta: {
          type: 'denoise',
          prompt,
          thresholdPx: denoiseThresholdPx,
          providerId: firstImageAdvancedProvider.id,
          providerModel: firstImageProviderModel,
        },
        imageEditLastSourceUrl: sourceImage,
        imageEditLastSourceKey: sourceKey,
        prompt,
        directOutputText: '降噪结果',
        denoisePrompt: prompt,
        denoiseThresholdPx,
        denoiseProviderId: firstImageAdvancedProvider.id,
        denoiseProviderModel: firstImageProviderModel,
      });
    } catch (e: any) {
      update({
        status: 'error',
        error: e?.message || '降噪失败',
        imageEditRunningLabel: null,
      });
    }
  };

  return (
    <div
      className={`t8-node-shell min-w-[320px] max-w-[320px] rounded-lg border p-3 shadow-sm ${
        selected ? 'ring-2 ring-orange-400/70' : ''
      }`}
      style={{
        background: 'var(--t8-bg-panel)',
        borderColor: selected ? 'rgba(251,146,60,.75)' : 'var(--t8-border)',
        color: 'var(--t8-text-main)',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: PORT_COLOR.image, borderColor: PORT_COLOR.image }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: PORT_COLOR.image, borderColor: PORT_COLOR.image }}
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500 text-white">
          <Edit3 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{String(d.label || '编辑图片')}</div>
          <div className="truncate text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>
            {hasSource ? (activeDraft ? '已保存草稿，可继续编辑' : '已接入原始图') : '接入图像后开始编辑'}
          </div>
        </div>
        {isRunning && <Loader2 size={15} className="animate-spin text-orange-400" />}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--t8-border)' }}>
          <div className="border-b px-2 py-1 text-[10px] font-semibold" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
            原图
          </div>
          <div className="flex aspect-video items-center justify-center bg-black/5">
            {sourceImage ? (
              <img src={sourceImage} alt="原图" className="h-full w-full object-contain" draggable={false} />
            ) : (
              <ImageIcon size={24} className="opacity-35" />
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--t8-border)' }}>
          <div className="border-b px-2 py-1 text-[10px] font-semibold" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
            最新结果
          </div>
          <div className="flex aspect-video items-center justify-center bg-black/5">
            {resultUrl ? (
              <img src={resultUrl} alt="最新结果" className="h-full w-full object-contain" draggable={false} />
            ) : (
              <span className="px-2 text-center text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>
                暂无结果
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MODE_BUTTONS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.mode}
              type="button"
              className="nodrag flex min-h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                borderColor: 'var(--t8-border)',
                background: 'var(--t8-bg-soft)',
                color: 'var(--t8-text-main)',
              }}
              disabled={!hasSource || isRunning}
              onClick={() => openEditor(item.mode)}
              title={hasSource ? `打开${item.label}` : '请先接入图像'}
            >
              <Icon size={13} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-md border p-2" style={{ borderColor: 'var(--t8-border)', background: 'var(--t8-bg-soft)' }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--t8-text-muted)' }}>
            降噪阈值
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              className="nodrag h-7 w-14 rounded border px-1.5 text-right text-xs outline-none"
              style={{
                borderColor: 'var(--t8-border)',
                background: 'var(--t8-bg-panel)',
                color: 'var(--t8-text-main)',
              }}
              min={1}
              max={20}
              step={1}
              value={denoiseThresholdPx}
              disabled={isRunning}
              onChange={(event) => update({ denoiseThresholdPx: sanitizeDenoiseThreshold(event.target.value) })}
            />
            <span className="text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>px</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className="nodrag min-w-0 flex-1"
            min={1}
            max={20}
            step={1}
            value={denoiseThresholdPx}
            disabled={isRunning}
            onChange={(event) => update({ denoiseThresholdPx: sanitizeDenoiseThreshold(event.target.value) })}
          />
          <button
            type="button"
            className="nodrag flex h-8 min-w-[76px] items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              borderColor: 'rgba(251,146,60,.45)',
              background: 'rgba(251,146,60,.15)',
              color: 'var(--t8-text-main)',
            }}
            disabled={!canDenoise}
            onClick={runDenoise}
            title={
              !hasSource
                ? '请先接入图像'
                : !firstImageAdvancedProvider
                ? '未配置可用的图像扩展平台'
                : !firstImageProviderModel
                ? '扩展平台未配置可用图像模型'
                : '使用当前原图进行图出图降噪'
            }
          >
            {isRunning && d.imageEditRunningLabel === '降噪生成中...' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            降噪
          </button>
        </div>
      </div>

      {(isRunning || d.error) && (
        <div
          className="mt-3 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px]"
          style={{
            borderColor: d.error ? 'rgba(239,68,68,.45)' : 'rgba(251,146,60,.45)',
            color: d.error ? '#ef4444' : 'var(--t8-text-main)',
            background: d.error ? 'rgba(239,68,68,.08)' : 'rgba(251,146,60,.08)',
          }}
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <AlertCircle size={12} />}
          <span className="min-w-0 break-all">{d.error || d.imageEditRunningLabel || '修改生成中...'}</span>
        </div>
      )}

      {editingMode && sourceImage && (
        <ImageEditModal
          srcUrl={sourceImage}
          initialMode={editingMode}
          initialDraft={activeDraft}
          enableModifyGeneration
          availableModes={['mask', 'brush']}
          onDraftSave={saveDraft}
          onClose={() => setEditingMode(null)}
          onProduce={handleProduce}
          onModifyRunningChange={(running, error) => {
            if (running) {
              update({ status: 'generating', error: null, imageEditRunningLabel: '修改生成中...' });
            } else if (error) {
              update({ status: 'error', error, imageEditRunningLabel: null });
            } else {
              update({ error: null, imageEditRunningLabel: null });
            }
          }}
          historyContext={{
            canvasId: loadedCanvasId,
            sourceNodeId: id,
            sourceNodeType: 'image-edit',
            nodeTitle: String(d.label || '编辑图片'),
            outputTitle: '修改结果',
          }}
        />
      )}
    </div>
  );
};

export default memo(ImageEditNode);
