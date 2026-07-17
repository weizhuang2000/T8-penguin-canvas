import { memo, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, Brush, Crop, Edit3, Grid3x3, Image as ImageIcon, Layers, Loader2, Paintbrush, type LucideIcon } from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
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
  { mode: 'crop', label: '裁剪', icon: Crop },
  { mode: 'mask', label: '遮罩', icon: Brush },
  { mode: 'brush', label: '画板', icon: Paintbrush },
  { mode: 'grid', label: '宫格切分', icon: Grid3x3 },
  { mode: 'compose', label: '组合', icon: Layers },
];

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
          <span className="min-w-0 break-all">{d.error || '修改生成中...'}</span>
        </div>
      )}

      {editingMode && sourceImage && (
        <ImageEditModal
          srcUrl={sourceImage}
          initialMode={editingMode}
          initialDraft={activeDraft}
          onDraftSave={saveDraft}
          onClose={() => setEditingMode(null)}
          onProduce={handleProduce}
          onModifyRunningChange={(running, error) => {
            if (running) {
              update({ status: 'generating', error: null });
            } else if (error) {
              update({ status: 'error', error });
            } else {
              update({ error: null });
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
