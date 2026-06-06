import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GalleryHorizontalEnd, Library, Loader2, Save, X } from 'lucide-react';
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
  getExhibitionPromptPresets,
  listExhibitionPromptLibrary,
  updateExhibitionPromptPresets,
  type AuthUser,
  type ExhibitionPromptLibraryItem,
  type ExhibitionPromptPresetItem,
  type ExhibitionPromptPresetMap,
} from '../../services/api';
import { useThemeStore } from '../../stores/theme';
import { useCanvasStore } from '../../stores/canvas';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
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
  return custom || preset;
}

function selectedTextWithPresets(data: any, id: ExhibitionPromptDimension, presetMap: ExhibitionPromptPresetMap): string {
  const custom = String(data?.[`${id}Custom`] || '').trim();
  const presetId = String(data?.[`${id}Preset`] || '');
  const configuredPreset = (presetMap[id] || []).find((preset) => preset.id === presetId)?.text || '';
  const preset = configuredPreset || presetTextForDimension(id, presetId);
  return custom || preset;
}

function presetTextFromList(presets: Array<Pick<ExhibitionPromptPresetItem, 'id' | 'text'>>, presetId: string): string {
  return presets.find((preset) => preset.id === presetId)?.text || '';
}

function valuesFromData(data: any, upstreamText: string, hasReferenceImages: boolean, presetMap: ExhibitionPromptPresetMap) {
  const values: Record<string, string | boolean> = {
    supplement: String(data?.supplement || ''),
    upstreamText,
    hasReferenceImages,
  };
  for (const dimension of EXHIBITION_DIMENSIONS) {
    values[dimension.id] = selectedTextWithPresets(data, dimension.id, presetMap);
  }
  return values as any;
}

function presetEditorText(presets: Array<Pick<ExhibitionPromptPresetItem, 'label' | 'text'>>): string {
  return presets.map((preset) => `${preset.label}｜${preset.text}`).join('\n');
}

function parsePresetEditorText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const raw = line.trim();
      if (!raw) return null;
      const [labelRaw, ...rest] = raw.split(/[｜|]/);
      const label = String(labelRaw || '').trim();
      const body = rest.join('｜').trim();
      if (!label || !body) return null;
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').slice(0, 40) || 'preset'}-${index + 1}`,
        label,
        text: body,
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; text: string; order: number }>;
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
  const upstream = useUpstreamMaterials(id);
  const materialOrder: string[] = Array.isArray(d.materialOrder) ? d.materialOrder : [];
  const orderedImages = useOrderedMaterials(upstream.images, materialOrder);
  const orderedTexts = useOrderedMaterials(upstream.texts, materialOrder);
  const upstreamText = orderedTexts.map((item) => item.url).filter(Boolean).join('\n');
  const outputImageUrls = orderedImages.map((item) => item.url).filter(Boolean);
  const [presetMap, setPresetMap] = useState<ExhibitionPromptPresetMap>({});
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);
  const [presetEditorValue, setPresetEditorValue] = useState('');
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetError, setPresetError] = useState('');
  const prompt = useMemo(
    () => buildExhibitionPrompt(valuesFromData(d, upstreamText, outputImageUrls.length > 0, presetMap)),
    [d, presetMap, upstreamText, outputImageUrls.length],
  );

  const [libraryItems, setLibraryItems] = useState<ExhibitionPromptLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryDeleteMode, setLibraryDeleteMode] = useState(false);
  const scopeFilter: ScopeFilter = d.libraryScopeFilter === 'allPersonal' ? 'allPersonal' : d.libraryScopeFilter === 'personal' ? 'personal' : 'team';
  const activeDimension: ExhibitionPromptDimension = EXHIBITION_DIMENSIONS.some((dimension) => dimension.id === d.activeDimension)
    ? d.activeDimension
    : EXHIBITION_DIMENSIONS[0].id;
  const activeDimensionMeta = EXHIBITION_DIMENSIONS.find((dimension) => dimension.id === activeDimension) || EXHIBITION_DIMENSIONS[0];
  const activePresets = presetMap[activeDimension]?.length ? presetMap[activeDimension] : activeDimensionMeta.presets;

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    getExhibitionPromptPresets().then(setPresetMap).catch(() => setPresetMap({}));
  }, []);

  useEffect(() => {
    if (!presetEditorOpen) return;
    setPresetEditorValue(presetEditorText(presetMap[activeDimension] || activeDimensionMeta.presets));
    setPresetError('');
  }, [presetEditorOpen, activeDimension, activeDimensionMeta.presets, presetMap]);

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
      const items = await listExhibitionPromptLibrary({
        dimension: activeDimension,
        includePersonal: scopeFilter === 'allPersonal',
      });
      setLibraryItems(items);
    } catch (e: any) {
      setLibraryError(e?.message || '读取词库失败');
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    void loadLibrary();
  }, [scopeFilter, activeDimension]);

  useEffect(() => {
    setLibraryDeleteMode(false);
  }, [scopeFilter, activeDimension]);

  const patchDimension = (dimension: ExhibitionPromptDimension, patch: Record<string, string>) => {
    if (isReadonly) return;
    update(patch);
  };

  const saveCurrentToLibrary = async (dimension: ExhibitionPromptDimension, scope: 'team' | 'personal') => {
    if (isReadonly) return;
    const text = selectedTextWithPresets(d, dimension, presetMap);
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

  const canDeleteLibraryItem = (item: ExhibitionPromptLibraryItem) => {
    if (isReadonly) return false;
    if (item.scope === 'team') return canManageTeam;
    if (item.scope === 'personal') return canManageTeam || item.ownerUserId === currentUser?.id;
    return false;
  };

  const visibleLibrary = libraryItems.filter((item) => {
    if (scopeFilter === 'team') return item.scope === 'team';
    if (scopeFilter === 'personal') return item.scope === 'personal';
    return canManageTeam && item.scope === 'personal';
  });
  const hasDeletableLibrary = visibleLibrary.some(canDeleteLibraryItem);

  const saveActivePresets = async () => {
    if (!canManageTeam) return;
    const presets = parsePresetEditorText(presetEditorValue);
    if (presets.length === 0) {
      setPresetError('请至少保留一条“标签｜内容”格式的预设。');
      return;
    }
    setPresetSaving(true);
    setPresetError('');
    try {
      const saved = await updateExhibitionPromptPresets(activeDimension, presets);
      setPresetMap((prev) => ({ ...prev, [activeDimension]: saved }));
      setPresetEditorOpen(false);
    } catch (e: any) {
      setPresetError(e?.message || '保存预设失败');
    } finally {
      setPresetSaving(false);
    }
  };

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
            当前画布为只读，不能修改提示词或维护词库。
          </div>
        )}

        <div className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-2 grid grid-cols-3 gap-1">
            {EXHIBITION_DIMENSIONS.map((dimension) => {
              const hasValue = !!selectedText(d, dimension.id);
              const isActive = activeDimension === dimension.id;
              return (
                <button
                  key={dimension.id}
                  type="button"
                  className={`min-w-0 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                    isActive
                      ? 'border-cyan-300/60 bg-cyan-300/15 text-cyan-100'
                      : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  }`}
                  onClick={() => update({ activeDimension: dimension.id })}
                  title={dimension.label}
                >
                  <span className="block truncate">{dimension.label}</span>
                  {hasValue && <span className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-cyan-200" />}
                </button>
              );
            })}
          </div>

          <div className="rounded border border-cyan-300/15 bg-black/20 p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-cyan-100">{activeDimensionMeta.label}</span>
              {canManageTeam && (
                <button
                  type="button"
                  className="text-[10px] text-white/45 hover:text-white"
                  onClick={() => setPresetEditorOpen((value) => !value)}
                >
                  设置预设
                </button>
              )}
              <button
                type="button"
                className="ml-auto text-[10px] text-white/45 hover:text-white disabled:opacity-40"
                disabled={isReadonly}
                onClick={() => saveCurrentToLibrary(activeDimension, 'personal')}
              >
                存个人
              </button>
              <button
                type="button"
                className="text-[10px] text-white/45 hover:text-white disabled:opacity-40"
                disabled={isReadonly || !canManageTeam}
                onClick={() => saveCurrentToLibrary(activeDimension, 'team')}
              >
                存团队
              </button>
            </div>
            <select
              className={FIELD_CLASS}
              value={d?.[`${activeDimension}Preset`] || ''}
              disabled={isReadonly}
              onChange={(event) => {
                const nextPresetId = event.target.value;
                const nextPresetText = presetTextFromList(activePresets, nextPresetId);
                patchDimension(activeDimension, {
                  [`${activeDimension}Preset`]: nextPresetId,
                  ...(nextPresetText ? { [`${activeDimension}Custom`]: nextPresetText } : {}),
                });
              }}
            >
              <option value="">不使用预设</option>
              {activePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
            {canManageTeam && presetEditorOpen && (
              <div className="mt-1.5 rounded border border-white/10 bg-white/[0.035] p-2">
                <div className="mb-1 text-[10px] text-white/45">每行一个预设：标签｜内容</div>
                <textarea
                  className={`${FIELD_CLASS} min-h-[96px] resize-y font-mono`}
                  value={presetEditorValue}
                  disabled={presetSaving}
                  onChange={(event) => setPresetEditorValue(event.target.value)}
                />
                {presetError && <div className="mt-1 text-[10px] text-red-300">{presetError}</div>}
                <div className="mt-1.5 flex justify-end gap-1">
                  <button
                    type="button"
                    className={BTN_CLASS}
                    disabled={presetSaving}
                    onClick={() => setPresetEditorOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={BTN_CLASS}
                    disabled={presetSaving}
                    onClick={saveActivePresets}
                  >
                    {presetSaving ? '保存中' : '保存预设'}
                  </button>
                </div>
              </div>
            )}
            <textarea
              className={`${FIELD_CLASS} mt-1.5 min-h-[58px] resize-y`}
              value={d?.[`${activeDimension}Custom`] || ''}
              disabled={isReadonly}
              placeholder={`自定义${activeDimensionMeta.label}`}
              onChange={(event) => patchDimension(activeDimension, { [`${activeDimension}Custom`]: event.target.value })}
            />
          </div>
        </div>

        <div className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 text-[11px] font-semibold text-cyan-100">特别补充</div>
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
          isDark={isDark}
          isPixel={isPixel}
          groups={['text', 'image']}
          title={`上游参考 · 输出参考 ${outputImageUrls.length}`}
        />

        <div className="rounded border border-white/10 bg-black/20 p-2">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-cyan-100">
            <Library size={13} />
            <span>提示词库 · {activeDimensionMeta.label}</span>
            {libraryLoading && <Loader2 size={12} className="animate-spin" />}
            <button
              type="button"
              className={`ml-auto h-6 rounded border px-2 text-[10px] font-normal ${
                libraryDeleteMode
                  ? 'border-red-300/50 bg-red-400/15 text-red-100'
                  : 'border-white/10 text-white/55 hover:bg-white/10 hover:text-white'
              } disabled:cursor-not-allowed disabled:opacity-35`}
              disabled={!hasDeletableLibrary}
              onClick={() => setLibraryDeleteMode((value) => !value)}
            >
              删除
            </button>
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
          <div className="grid max-h-36 grid-cols-4 gap-1 overflow-y-auto">
            {visibleLibrary.length === 0 ? (
              <div className="col-span-4 text-[10px] text-white/35">暂无词条</div>
            ) : visibleLibrary.map((item) => (
              <div key={item.id} className="relative min-w-0">
                <button
                  type="button"
                  className={`h-[44px] w-full min-w-0 rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-left text-[10px] text-white/70 hover:bg-white/[0.08] disabled:cursor-not-allowed ${
                    isReadonly ? 'disabled:opacity-55' : ''
                  }`}
                  title={`${item.label}\n${item.text}`}
                  disabled={isReadonly || libraryDeleteMode}
                  onClick={() => applyLibraryItem(item)}
                >
                  <span className="block truncate">{item.label}</span>
                  {canManageTeam && (
                    <span className="block truncate text-white/35">{item.ownerName || (item.scope === 'team' ? '团队' : '个人')}</span>
                  )}
                </button>
                {libraryDeleteMode && canDeleteLibraryItem(item) && (
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-red-200/70 bg-red-500 text-white shadow shadow-red-950/40 hover:bg-red-400"
                    onClick={() => removeLibraryItem(item)}
                    title="删除词条"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                )}
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

      </div>
    </div>
  );
};

export default memo(ExhibitionPromptNode);
