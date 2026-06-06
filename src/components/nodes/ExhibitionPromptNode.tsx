import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GalleryHorizontalEnd, ImagePlus, Library, Loader2, Save, Trash2 } from 'lucide-react';
import {
  buildExhibitionPrompt,
  EXHIBITION_DIMENSIONS,
  presetTextForDimension,
  type ExhibitionPromptDimension,
} from '../../utils/exhibitionPrompt';
import {
  createExhibitionPromptLibraryItem,
  deleteExhibitionPromptLibraryItem,
  getCurrentUser,
  listExhibitionPromptLibrary,
  type AuthUser,
  type ExhibitionPromptLibraryItem,
} from '../../services/api';
import { uploadFile } from '../../services/generation';
import { useThemeStore } from '../../stores/theme';
import { useCanvasStore } from '../../stores/canvas';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import { useOrderedMaterials } from './useOrderedMaterials';
import MaterialPreviewSection from './MaterialPreviewSection';

type ScopeFilter = 'team' | 'personal' | 'allPersonal';

const FIELD_CLASS = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60';
const BTN_CLASS = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45';
const LIBRARY_SCOPE_TABS: Array<{ value: ScopeFilter; label: string }> = [
  { value: 'team', label: '团队' },
  { value: 'personal', label: '我的' },
  { value: 'allPersonal', label: '成员个人' },
];

function selectedText(data: any, id: ExhibitionPromptDimension): string {
  const custom = String(data?.[`${id}Custom`] || '').trim();
  const preset = presetTextForDimension(id, data?.[`${id}Preset`]);
  return [preset, custom].filter(Boolean).join('；');
}

function valuesFromData(data: any, upstreamText: string, hasReferenceImages: boolean) {
  const values: Record<string, string | boolean> = {
    supplement: String(data?.supplement || ''),
    upstreamText,
    hasReferenceImages,
  };
  for (const dimension of EXHIBITION_DIMENSIONS) {
    values[dimension.id] = selectedText(data, dimension.id);
  }
  return values as any;
}

const ExhibitionPromptNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const { theme, style } = useThemeStore();
  const activeCanvas = useCanvasStore((s) => s.canvases.find((canvas) => canvas.id === s.activeId) || null);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const upstream = useUpstreamMaterials(id);
  const localRefs: string[] = Array.isArray(d.referenceImages) ? d.referenceImages : [];
  const materialOrder: string[] = Array.isArray(d.materialOrder) ? d.materialOrder : [];
  const localImageMaterials: Material[] = useMemo(
    () => localRefs.map((url, index) => ({
      id: `local::exhibition:${url}`,
      kind: 'image' as const,
      url,
      sourceNodeId: id,
      origin: 'local' as const,
      label: `本地参考${index + 1}`,
    })),
    [id, localRefs],
  );
  const allImages = useMemo(() => [...localImageMaterials, ...upstream.images], [localImageMaterials, upstream.images]);
  const orderedImages = useOrderedMaterials(allImages, materialOrder);
  const orderedTexts = useOrderedMaterials(upstream.texts, materialOrder);
  const upstreamText = orderedTexts.map((item) => item.url).filter(Boolean).join('\n');
  const outputImageUrls = orderedImages.map((item) => item.url).filter(Boolean);
  const prompt = useMemo(
    () => buildExhibitionPrompt(valuesFromData(d, upstreamText, outputImageUrls.length > 0)),
    [d, upstreamText, outputImageUrls.length],
  );

  const [libraryItems, setLibraryItems] = useState<ExhibitionPromptLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const scopeFilter: ScopeFilter = d.libraryScopeFilter === 'allPersonal' ? 'allPersonal' : d.libraryScopeFilter === 'personal' ? 'personal' : 'team';

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!canManageTeam && scopeFilter === 'allPersonal') {
      update({ libraryScopeFilter: 'team' });
    }
  }, [canManageTeam, scopeFilter, update]);

  useEffect(() => {
    if (d.prompt === prompt && JSON.stringify(d.imageUrls || []) === JSON.stringify(outputImageUrls)) return;
    update({ prompt, outputText: prompt, text: prompt, imageUrls: outputImageUrls, imageUrl: outputImageUrls[0] || '' });
  }, [d.prompt, d.imageUrls, outputImageUrls, prompt, update]);

  const loadLibrary = async () => {
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const items = await listExhibitionPromptLibrary({ includePersonal: scopeFilter === 'allPersonal' });
      setLibraryItems(items);
    } catch (e: any) {
      setLibraryError(e?.message || '读取词库失败');
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    void loadLibrary();
  }, [scopeFilter]);

  const patchDimension = (dimension: ExhibitionPromptDimension, patch: Record<string, string>) => {
    if (isReadonly) return;
    update(patch);
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || isReadonly) return;
    try {
      const uploaded: string[] = [];
      for (const file of files.slice(0, 9 - localRefs.length)) {
        const result = await uploadFile(file);
        uploaded.push(result.url);
      }
      update({ referenceImages: [...localRefs, ...uploaded] });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeLocal = (material: Material) => {
    if (isReadonly || material.origin !== 'local') return;
    update({ referenceImages: localRefs.filter((url) => url !== material.url) });
  };

  const saveCurrentToLibrary = async (dimension: ExhibitionPromptDimension, scope: 'team' | 'personal') => {
    if (isReadonly) return;
    const text = selectedText(d, dimension);
    if (!text.trim()) return;
    if (scope === 'team' && !canManageTeam) return;
    const label = window.prompt('词条名称', text.slice(0, 18));
    if (!label?.trim()) return;
    try {
      await createExhibitionPromptLibraryItem({ scope, dimension, label: label.trim(), text });
      await loadLibrary();
    } catch (e: any) {
      setLibraryError(e?.message || '保存词条失败');
    }
  };

  const applyLibraryItem = (item: ExhibitionPromptLibraryItem) => {
    if (isReadonly) return;
    update({ [`${item.dimension}Custom`]: item.text, [`${item.dimension}Preset`]: '' });
  };

  const removeLibraryItem = async (item: ExhibitionPromptLibraryItem) => {
    if (isReadonly) return;
    if (item.scope === 'team' && !canManageTeam) return;
    if (item.scope === 'personal' && !canManageTeam && item.ownerUserId !== currentUser?.id) return;
    try {
      await deleteExhibitionPromptLibraryItem(item.id);
      await loadLibrary();
    } catch (e: any) {
      setLibraryError(e?.message || '删除词条失败');
    }
  };

  const visibleLibrary = libraryItems.filter((item) => {
    if (scopeFilter === 'team') return item.scope === 'team';
    if (scopeFilter === 'personal') return item.scope === 'personal';
    return canManageTeam && item.scope === 'personal';
  });

  return (
    <div
      className={`relative w-[360px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.94)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="target" position={Position.Left} className="!bg-cyan-300 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-cyan-300 !border-0" />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <GalleryHorizontalEnd size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">展陈提示词</div>
          <div className="truncate text-[10px] text-white/45">空间 / 功能 / 工艺 / 色彩 / 灯光 / 材质 / 构图</div>
        </div>
      </div>

      <div className="nodrag nopan max-h-[720px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(e) => e.stopPropagation()}>
        {isReadonly && (
          <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">
            当前画布为只读，不能修改提示词、上传参考图或维护词库。
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          {EXHIBITION_DIMENSIONS.map((dimension) => (
            <div key={dimension.id} className="rounded border border-white/10 bg-white/[0.035] p-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-cyan-100">{dimension.label}</span>
                <button
                  type="button"
                  className="ml-auto text-[10px] text-white/45 hover:text-white disabled:opacity-40"
                  disabled={isReadonly}
                  onClick={() => saveCurrentToLibrary(dimension.id, 'personal')}
                >
                  存个人
                </button>
                <button
                  type="button"
                  className="text-[10px] text-white/45 hover:text-white disabled:opacity-40"
                  disabled={isReadonly || !canManageTeam}
                  onClick={() => saveCurrentToLibrary(dimension.id, 'team')}
                >
                  存团队
                </button>
              </div>
              <select
                className={FIELD_CLASS}
                value={d?.[`${dimension.id}Preset`] || ''}
                disabled={isReadonly}
                onChange={(event) => patchDimension(dimension.id, { [`${dimension.id}Preset`]: event.target.value })}
              >
                <option value="">不使用预设</option>
                {dimension.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
              <textarea
                className={`${FIELD_CLASS} mt-1.5 min-h-[44px] resize-y`}
                value={d?.[`${dimension.id}Custom`] || ''}
                disabled={isReadonly}
                placeholder={`自定义${dimension.label}`}
                onChange={(event) => patchDimension(dimension.id, { [`${dimension.id}Custom`]: event.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 text-[11px] font-semibold text-cyan-100">用户补充</div>
          <textarea
            className={`${FIELD_CLASS} min-h-[54px] resize-y`}
            value={d.supplement || ''}
            disabled={isReadonly}
            placeholder="项目主题、展品内容、品牌语气、特殊限制等"
            onChange={(event) => update({ supplement: event.target.value })}
          />
        </div>

        <MaterialPreviewSection
          texts={orderedTexts}
          images={orderedImages}
          order={materialOrder}
          onReorder={(next) => !isReadonly && update({ materialOrder: next })}
          onRemoveLocal={removeLocal}
          isDark={isDark}
          isPixel={isPixel}
          groups={['text', 'image']}
          title={`上游与参考图 · 输出参考 ${outputImageUrls.length}`}
          imageUploadAction={isReadonly ? undefined : {
            onClick: () => fileInputRef.current?.click(),
            title: '上传参考图',
            remaining: Math.max(0, 9 - localRefs.length),
          }}
        />
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

        <div className="rounded border border-white/10 bg-black/20 p-2">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-cyan-100">
            <Library size={13} />
            <span>提示词库</span>
            {libraryLoading && <Loader2 size={12} className="animate-spin" />}
          </div>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {LIBRARY_SCOPE_TABS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`${BTN_CLASS} ${scopeFilter === value ? 'border-cyan-300/50 text-cyan-100' : ''}`}
                disabled={value === 'allPersonal' && !canManageTeam}
                onClick={() => update({ libraryScopeFilter: value })}
              >
                {label}
              </button>
            ))}
          </div>
          {libraryError && <div className="mb-1 text-[10px] text-red-300">{libraryError}</div>}
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {visibleLibrary.length === 0 ? (
              <div className="text-[10px] text-white/35">暂无词条</div>
            ) : visibleLibrary.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_24px] items-center gap-1">
                <button
                  type="button"
                  className="min-w-0 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-left text-[10px] text-white/70 hover:bg-white/[0.08]"
                  title={`${item.label}\n${item.text}`}
                  disabled={isReadonly}
                  onClick={() => applyLibraryItem(item)}
                >
                  <span className="block truncate">{item.label}</span>
                  <span className="block truncate text-white/35">{item.ownerName || item.scope}</span>
                </button>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded border border-white/10 text-white/45 hover:text-red-200 disabled:opacity-35"
                  disabled={isReadonly || (item.scope === 'team' && !canManageTeam) || (item.scope === 'personal' && !canManageTeam && item.ownerUserId !== currentUser?.id)}
                  onClick={() => removeLibraryItem(item)}
                  title="删除词条"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100">
            <Save size={13} />
            <span>输出到下游 prompt</span>
            <button
              type="button"
              className="ml-auto flex h-6 items-center gap-1 rounded border border-white/10 px-2 text-[10px] text-white/65 hover:bg-white/10"
              disabled={!prompt}
              onClick={() => navigator.clipboard?.writeText(prompt).catch(() => {})}
            >
              复制
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">
            {prompt}
          </div>
        </div>

        <button
          type="button"
          className={`${BTN_CLASS} w-full`}
          disabled={isReadonly || localRefs.length >= 9}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={13} />
          上传参考图
        </button>
      </div>
    </div>
  );
};

export default memo(ExhibitionPromptNode);
