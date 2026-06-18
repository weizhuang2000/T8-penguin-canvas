import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, FolderPlus, Plus, Save, Square, Trash2, X } from 'lucide-react';
import type { ElevationColorMaterialPresetItem } from '../../services/api';

const DEFAULT_CATEGORY = '默认';
const FIELD = 'w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';

type DraftPreset = ElevationColorMaterialPresetItem & { draftId: string };

interface ColorMaterialPresetEditorModalProps {
  open: boolean;
  presets: ElevationColorMaterialPresetItem[];
  saving?: boolean;
  error?: string;
  title?: string;
  paletteLabel?: string;
  texturesLabel?: string;
  onClose: () => void;
  onSave: (presets: ElevationColorMaterialPresetItem[]) => void | Promise<void>;
}

function normalizeCategory(value: unknown): string {
  const text = String(value || '').trim();
  return text || DEFAULT_CATEGORY;
}

function presetInfo(preset: Pick<ElevationColorMaterialPresetItem, 'core' | 'features' | 'usage' | 'info'>): string {
  const core = String(preset.core || '').trim();
  const features = String(preset.features || '').trim();
  const usage = String(preset.usage || '').trim();
  if (core || features || usage) {
    return [
      core && `核心：${core}`,
      features && `特征：${features}`,
      usage && `适用：${usage}`,
    ].filter(Boolean).join('');
  }
  return String(preset.info || '').trim();
}

function makeDraft(preset: Partial<ElevationColorMaterialPresetItem>, index: number): DraftPreset {
  const label = String(preset.label || '').trim();
  return {
    id: String(preset.id || `preset_${Date.now()}_${index}`),
    draftId: `${String(preset.id || 'new')}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    category: normalizeCategory(preset.category),
    label,
    core: String(preset.core || '').trim(),
    features: String(preset.features || '').trim(),
    usage: String(preset.usage || '').trim(),
    info: String(preset.info || '').trim(),
    order: Number.isFinite(Number(preset.order)) ? Number(preset.order) : index,
  };
}

function toSaveItem(preset: DraftPreset, order: number): ElevationColorMaterialPresetItem {
  return {
    id: preset.id,
    category: normalizeCategory(preset.category),
    label: preset.label.trim(),
    core: String(preset.core || '').trim(),
    features: String(preset.features || '').trim(),
    usage: String(preset.usage || '').trim(),
    info: presetInfo(preset),
    order,
  };
}

export default function ColorMaterialPresetEditorModal({
  open,
  presets,
  saving = false,
  error = '',
  title = '色彩与材质预设管理',
  paletteLabel = '核心 / Color palette',
  texturesLabel = '特征 / Materials',
  onClose,
  onSave,
}: ColorMaterialPresetEditorModalProps) {
  const [drafts, setDrafts] = useState<DraftPreset[]>([]);
  const [categories, setCategories] = useState<string[]>([DEFAULT_CATEGORY]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [newCategory, setNewCategory] = useState('');
  const [renameCategory, setRenameCategory] = useState('');
  const [moveTarget, setMoveTarget] = useState(DEFAULT_CATEGORY);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    const nextDrafts = presets.map(makeDraft);
    const nextCategories = Array.from(new Set([DEFAULT_CATEGORY, ...nextDrafts.map((item) => normalizeCategory(item.category))]));
    setDrafts(nextDrafts);
    setCategories(nextCategories);
    setActiveCategory('all');
    setNewCategory('');
    setRenameCategory('');
    setMoveTarget(nextCategories[0] || DEFAULT_CATEGORY);
    setSelectedIds(new Set());
    setLocalError('');
  }, [open, presets]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  const groupedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) counts.set(category, 0);
    for (const preset of drafts) {
      const category = normalizeCategory(preset.category);
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return counts;
  }, [categories, drafts]);

  const visibleDrafts = useMemo(
    () => activeCategory === 'all' ? drafts : drafts.filter((preset) => normalizeCategory(preset.category) === activeCategory),
    [activeCategory, drafts],
  );

  const allVisibleSelected = visibleDrafts.length > 0 && visibleDrafts.every((preset) => selectedIds.has(preset.draftId));
  const selectedCount = selectedIds.size;

  const updateDraft = (draftId: string, patch: Partial<DraftPreset>) => {
    setDrafts((items) => items.map((item) => item.draftId === draftId ? { ...item, ...patch } : item));
  };

  const addCategory = () => {
    const name = normalizeCategory(newCategory);
    if (!name) return;
    setCategories((items) => items.includes(name) ? items : [...items, name]);
    setActiveCategory(name);
    setMoveTarget(name);
    setNewCategory('');
  };

  const confirmRenameCategory = () => {
    if (activeCategory === 'all') return;
    const nextName = normalizeCategory(renameCategory);
    if (!nextName || nextName === activeCategory) return;
    setDrafts((items) => items.map((item) => normalizeCategory(item.category) === activeCategory ? { ...item, category: nextName } : item));
    setCategories((items) => Array.from(new Set(items.map((item) => item === activeCategory ? nextName : item))));
    setSelectedIds(new Set());
    setActiveCategory(nextName);
    setMoveTarget(nextName);
    setRenameCategory('');
  };

  const deleteActiveCategory = () => {
    if (activeCategory === 'all' || activeCategory === DEFAULT_CATEGORY) return;
    setDrafts((items) => items.map((item) => normalizeCategory(item.category) === activeCategory ? { ...item, category: DEFAULT_CATEGORY } : item));
    setCategories((items) => items.filter((item) => item !== activeCategory));
    setSelectedIds(new Set());
    setActiveCategory(DEFAULT_CATEGORY);
    setMoveTarget(DEFAULT_CATEGORY);
  };

  const addPreset = () => {
    const category = activeCategory === 'all' ? moveTarget || DEFAULT_CATEGORY : activeCategory;
    const draft = makeDraft({ category, label: '新预设' }, drafts.length);
    setDrafts((items) => [...items, draft]);
    setCategories((items) => items.includes(category) ? items : [...items, category]);
    setActiveCategory(category);
    setSelectedIds(new Set([draft.draftId]));
  };

  const toggleVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const preset of visibleDrafts) next.delete(preset.draftId);
      } else {
        for (const preset of visibleDrafts) next.add(preset.draftId);
      }
      return next;
    });
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    setDrafts((items) => items.filter((item) => !selectedIds.has(item.draftId)));
    setSelectedIds(new Set());
  };

  const moveSelected = () => {
    const target = normalizeCategory(moveTarget);
    if (selectedIds.size === 0 || !target) return;
    setCategories((items) => items.includes(target) ? items : [...items, target]);
    setDrafts((items) => items.map((item) => selectedIds.has(item.draftId) ? { ...item, category: target } : item));
    setActiveCategory(target);
  };

  const save = async () => {
    const next = drafts
      .map((item, index) => toSaveItem(item, index))
      .filter((item) => item.label);
    if (next.length === 0) {
      setLocalError('请至少保留一个有效预设。');
      return;
    }
    if (next.length !== drafts.length) {
      setLocalError('存在未填写名称的预设，请补全名称或删除。');
      return;
    }
    setLocalError('');
    await onSave(next);
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm nodrag nopan"
      onMouseDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <section className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/12 bg-zinc-950 text-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-cyan-100">{title}</div>
            <div className="text-[10px] text-white/45">分类、预设和批量操作会在点击保存后写入团队预设。</div>
          </div>
          <button type="button" className={BUTTON} onClick={addPreset} disabled={saving}>
            <Plus size={12} /> 新增预设
          </button>
          <button type="button" className={BUTTON} onClick={save} disabled={saving}>
            <Save size={12} /> {saving ? '保存中' : '保存'}
          </button>
          <button type="button" className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white" onClick={onClose} disabled={saving} title="关闭">
            <X size={16} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-white/[0.025] p-3">
            <button
              type="button"
              className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ${activeCategory === 'all' ? 'bg-cyan-300/15 text-cyan-100' : 'text-white/65 hover:bg-white/[0.08]'}`}
              onClick={() => setActiveCategory('all')}
            >
              <span>全部分类</span>
              <span className="text-[10px] text-white/40">{drafts.length}</span>
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ${activeCategory === category ? 'bg-cyan-300/15 text-cyan-100' : 'text-white/65 hover:bg-white/[0.08]'}`}
                onClick={() => {
                  setActiveCategory(category);
                  setMoveTarget(category);
                  setRenameCategory(category);
                }}
              >
                <span className="truncate">{category}</span>
                <span className="text-[10px] text-white/40">{groupedCounts.get(category) || 0}</span>
              </button>
            ))}

            <div className="mt-3 space-y-1.5 rounded border border-white/10 bg-black/20 p-2">
              <div className="text-[10px] font-semibold text-white/55">新增分类</div>
              <input className={FIELD} value={newCategory} disabled={saving} placeholder="分类名称" onChange={(event) => setNewCategory(event.target.value)} />
              <button type="button" className={BUTTON} onClick={addCategory} disabled={saving || !newCategory.trim()}>
                <FolderPlus size={12} /> 添加分类
              </button>
            </div>

            {activeCategory !== 'all' && (
              <div className="mt-2 space-y-1.5 rounded border border-white/10 bg-black/20 p-2">
                <div className="text-[10px] font-semibold text-white/55">当前分类</div>
                <input className={FIELD} value={renameCategory || activeCategory} disabled={saving} onChange={(event) => setRenameCategory(event.target.value)} />
                <div className="flex gap-1">
                  <button type="button" className={BUTTON} onClick={confirmRenameCategory} disabled={saving || !renameCategory.trim() || renameCategory === activeCategory}>
                    重命名
                  </button>
                  <button type="button" className={BUTTON} onClick={deleteActiveCategory} disabled={saving || activeCategory === DEFAULT_CATEGORY}>
                    删除分类
                  </button>
                </div>
                <div className="text-[9px] leading-snug text-white/35">删除分类会把其中预设移到“默认”。</div>
              </div>
            )}
          </aside>

          <main className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
              <button type="button" className={BUTTON} onClick={toggleVisible} disabled={visibleDrafts.length === 0 || saving}>
                {allVisibleSelected ? <CheckSquare size={12} /> : <Square size={12} />} 选择当前列表
              </button>
              <span className="text-[10px] text-white/45">已选 {selectedCount} 项</span>
              <select className="h-7 rounded border border-white/10 bg-black/25 px-2 text-[10px] text-white outline-none" value={moveTarget} disabled={saving} onChange={(event) => setMoveTarget(event.target.value)}>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <button type="button" className={BUTTON} onClick={moveSelected} disabled={saving || selectedCount === 0}>
                批量移动
              </button>
              <button type="button" className={BUTTON} onClick={deleteSelected} disabled={saving || selectedCount === 0}>
                <Trash2 size={12} /> 批量删除
              </button>
              {(localError || error) && <span className="text-[10px] text-red-300">{localError || error}</span>}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="min-w-[880px] overflow-hidden rounded border border-white/10">
                <div className="grid grid-cols-[34px_140px_150px_1fr_1fr_1fr_36px] border-b border-white/10 bg-white/[0.06] text-[10px] font-semibold text-white/55">
                  <div className="px-2 py-2">选</div>
                  <div className="px-2 py-2">分类</div>
                  <div className="px-2 py-2">名称</div>
                  <div className="px-2 py-2">{paletteLabel}</div>
                  <div className="px-2 py-2">{texturesLabel}</div>
                  <div className="px-2 py-2">适用</div>
                  <div className="px-2 py-2" />
                </div>
                {visibleDrafts.length === 0 ? (
                  <div className="px-3 py-10 text-center text-[11px] text-white/35">当前分类暂无预设。</div>
                ) : visibleDrafts.map((preset) => {
                  const selected = selectedIds.has(preset.draftId);
                  return (
                    <div key={preset.draftId} className={`grid grid-cols-[34px_140px_150px_1fr_1fr_1fr_36px] items-start gap-1 border-b border-white/5 p-1.5 ${selected ? 'bg-cyan-300/[0.08]' : 'bg-black/10'}`}>
                      <label className="flex h-8 items-center justify-center">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-cyan-300"
                          checked={selected}
                          disabled={saving}
                          onChange={(event) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (event.target.checked) next.add(preset.draftId);
                              else next.delete(preset.draftId);
                              return next;
                            });
                          }}
                        />
                      </label>
                      <select className={FIELD} value={normalizeCategory(preset.category)} disabled={saving} onChange={(event) => updateDraft(preset.draftId, { category: normalizeCategory(event.target.value) })}>
                        {categories.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                      <input className={FIELD} value={preset.label} disabled={saving} onChange={(event) => updateDraft(preset.draftId, { label: event.target.value })} />
                      <textarea className={`${FIELD} min-h-[58px] resize-y`} value={preset.core || ''} disabled={saving} onChange={(event) => updateDraft(preset.draftId, { core: event.target.value })} />
                      <textarea className={`${FIELD} min-h-[58px] resize-y`} value={preset.features || ''} disabled={saving} onChange={(event) => updateDraft(preset.draftId, { features: event.target.value })} />
                      <textarea className={`${FIELD} min-h-[58px] resize-y`} value={preset.usage || ''} disabled={saving} onChange={(event) => updateDraft(preset.draftId, { usage: event.target.value })} />
                      <button type="button" className="mt-0.5 rounded p-1.5 text-white/45 hover:bg-rose-400/15 hover:text-rose-200" disabled={saving} onClick={() => setDrafts((items) => items.filter((item) => item.draftId !== preset.draftId))} title="删除">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </main>
        </div>
      </section>
    </div>,
    document.body,
  );
}
