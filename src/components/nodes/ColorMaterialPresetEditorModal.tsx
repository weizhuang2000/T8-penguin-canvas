import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe2, Lock, Plus, Save, Trash2, X } from 'lucide-react';
import type { ElevationColorMaterialPresetItem, ElevationColorMaterialUserPresetPayload } from '../../services/api';
import {
  createElevationColorMaterialUserPreset,
  deleteElevationColorMaterialUserPreset,
  updateElevationColorMaterialUserPreset,
} from '../../services/api';

const DEFAULT_CATEGORY = '默认';
const DEFAULT_NEGATIVE_PROMPT = '可读错字、乱码文字、不符合物理特性的结构和光线';
const FIELD = 'w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';

type DraftPreset = ElevationColorMaterialPresetItem & {
  draftId: string;
  source: 'system' | 'user';
  scope: 'personal' | 'team';
  isNew?: boolean;
};

interface ColorMaterialPresetEditorModalProps {
  open: boolean;
  presets: ElevationColorMaterialPresetItem[];
  saving?: boolean;
  error?: string;
  title?: string;
  paletteLabel?: string;
  texturesLabel?: string;
  canManageSystem?: boolean;
  onClose: () => void;
  onSave: (presets: ElevationColorMaterialPresetItem[]) => void | Promise<void>;
  onRefresh?: (presets: ElevationColorMaterialPresetItem[]) => void;
}

function normalizeCategory(value: unknown): string {
  const text = String(value || '').trim();
  return text || DEFAULT_CATEGORY;
}

function normalizeScope(value: unknown): 'personal' | 'team' {
  return value === 'team' ? 'team' : 'personal';
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
  const source = preset.source === 'user' ? 'user' : 'system';
  const scope = normalizeScope(preset.scope);
  return {
    id: String(preset.id || `preset_${Date.now()}_${index}`),
    draftId: `${String(preset.id || 'new')}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    scope,
    ownerUserId: String(preset.ownerUserId || ''),
    ownerName: String(preset.ownerName || ''),
    canEdit: preset.canEdit === true,
    canDelete: preset.canDelete === true,
    category: normalizeCategory(preset.category),
    label: String(preset.label || '').trim(),
    core: String(preset.core || '').trim(),
    features: String(preset.features || '').trim(),
    usage: String(preset.usage || '').trim(),
    negativePrompt: String(preset.negativePrompt || DEFAULT_NEGATIVE_PROMPT).trim(),
    info: String(preset.info || '').trim(),
    order: Number.isFinite(Number(preset.order)) ? Number(preset.order) : index,
  };
}

function toPresetItem(preset: DraftPreset, order: number): ElevationColorMaterialPresetItem {
  return {
    id: preset.id,
    source: preset.source,
    scope: preset.scope,
    ownerUserId: preset.ownerUserId,
    ownerName: preset.ownerName,
    canEdit: preset.canEdit,
    canDelete: preset.canDelete,
    category: normalizeCategory(preset.category),
    label: preset.label.trim(),
    core: String(preset.core || '').trim(),
    features: String(preset.features || '').trim(),
    usage: String(preset.usage || '').trim(),
    negativePrompt: String(preset.negativePrompt || DEFAULT_NEGATIVE_PROMPT).trim(),
    info: presetInfo(preset),
    order,
  };
}

function toUserPayload(preset: DraftPreset, order: number): ElevationColorMaterialUserPresetPayload {
  return {
    scope: preset.scope,
    category: normalizeCategory(preset.category),
    label: preset.label.trim(),
    core: String(preset.core || '').trim(),
    features: String(preset.features || '').trim(),
    usage: String(preset.usage || '').trim(),
    negativePrompt: String(preset.negativePrompt || DEFAULT_NEGATIVE_PROMPT).trim(),
    info: presetInfo(preset),
    order,
  };
}

function splitPresets(presets: ElevationColorMaterialPresetItem[]) {
  const system = presets.filter((preset) => preset.source !== 'user');
  const user = presets.filter((preset) => preset.source === 'user');
  return { system, user };
}

export default function ColorMaterialPresetEditorModal({
  open,
  presets,
  saving = false,
  error = '',
  title = '色彩与材质预设管理',
  paletteLabel = '核心 / Color palette',
  texturesLabel = '特征 / Materials',
  canManageSystem = false,
  onClose,
  onSave,
  onRefresh,
}: ColorMaterialPresetEditorModalProps) {
  const [drafts, setDrafts] = useState<DraftPreset[]>([]);
  const [activeSource, setActiveSource] = useState<'user' | 'system'>('user');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [localSavingId, setLocalSavingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    const nextDrafts = presets.map(makeDraft);
    setDrafts(nextDrafts);
    setActiveSource('user');
    setActiveCategory('all');
    setLocalError('');
    setLocalSavingId('');
    setDeletingId('');
  }, [open, presets]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  const sourceDrafts = useMemo(
    () => drafts.filter((preset) => preset.source === activeSource),
    [activeSource, drafts],
  );

  const categories = useMemo(
    () => Array.from(new Set([DEFAULT_CATEGORY, ...sourceDrafts.map((item) => normalizeCategory(item.category))])),
    [sourceDrafts],
  );

  const visibleDrafts = useMemo(
    () => activeCategory === 'all' ? sourceDrafts : sourceDrafts.filter((preset) => normalizeCategory(preset.category) === activeCategory),
    [activeCategory, sourceDrafts],
  );

  const userPresetCount = drafts.filter((preset) => preset.source === 'user').length;
  const systemPresetCount = drafts.filter((preset) => preset.source === 'system').length;
  const busy = saving || !!localSavingId || !!deletingId;

  const updateDraft = (draftId: string, patch: Partial<DraftPreset>) => {
    setDrafts((items) => items.map((item) => item.draftId === draftId ? { ...item, ...patch } : item));
  };

  const replaceDraft = (draftId: string, preset: ElevationColorMaterialPresetItem) => {
    setDrafts((items) => items.map((item, index) => item.draftId === draftId ? makeDraft(preset, index) : item));
  };

  const emitRefresh = (nextDrafts: DraftPreset[]) => {
    onRefresh?.(nextDrafts.map((preset, index) => toPresetItem(preset, index)));
  };

  const addUserPreset = () => {
    const category = activeCategory === 'all' ? DEFAULT_CATEGORY : activeCategory;
    const draft = makeDraft({
      source: 'user',
      scope: 'personal',
      category,
      label: '新预设',
      canEdit: true,
      canDelete: true,
    }, drafts.length);
    draft.isNew = true;
    setDrafts((items) => [...items, draft]);
    setActiveSource('user');
    setActiveCategory(category);
  };

  const saveUserPreset = async (preset: DraftPreset) => {
    if (!preset.label.trim()) {
      setLocalError('请填写预设名称。');
      return;
    }
    setLocalError('');
    setLocalSavingId(preset.draftId);
    try {
      const order = drafts.filter((item) => item.source === 'user').findIndex((item) => item.draftId === preset.draftId);
      const payload = toUserPayload(preset, Math.max(0, order));
      const saved = preset.isNew
        ? await createElevationColorMaterialUserPreset(payload)
        : await updateElevationColorMaterialUserPreset(preset.id, payload);
      replaceDraft(preset.draftId, saved);
      const nextDrafts = drafts.map((item, index) => item.draftId === preset.draftId ? makeDraft(saved, index) : item);
      emitRefresh(nextDrafts);
    } catch (err: any) {
      setLocalError(err?.message || '保存用户预设失败');
    } finally {
      setLocalSavingId('');
    }
  };

  const deleteUserPreset = async (preset: DraftPreset) => {
    if (preset.isNew) {
      const nextDrafts = drafts.filter((item) => item.draftId !== preset.draftId);
      setDrafts(nextDrafts);
      emitRefresh(nextDrafts);
      return;
    }
    setLocalError('');
    setDeletingId(preset.draftId);
    try {
      await deleteElevationColorMaterialUserPreset(preset.id);
      const nextDrafts = drafts.filter((item) => item.draftId !== preset.draftId);
      setDrafts(nextDrafts);
      emitRefresh(nextDrafts);
    } catch (err: any) {
      setLocalError(err?.message || '删除用户预设失败');
    } finally {
      setDeletingId('');
    }
  };

  const saveSystemPresets = async () => {
    if (!canManageSystem) return;
    const systemPresets = drafts
      .filter((preset) => preset.source === 'system')
      .map((preset, index) => toPresetItem(preset, index))
      .filter((preset) => preset.label);
    if (systemPresets.length === 0) {
      setLocalError('请至少保留一条系统预设。');
      return;
    }
    setLocalError('');
    await onSave(systemPresets);
  };

  const renderRow = (preset: DraftPreset) => {
    const editable = preset.source === 'user' ? preset.canEdit !== false : canManageSystem;
    const removable = preset.source === 'user' ? preset.canDelete !== false : canManageSystem;
    const rowBusy = localSavingId === preset.draftId || deletingId === preset.draftId;
    return (
      <div key={preset.draftId} className="grid grid-cols-[92px_120px_140px_1fr_1fr_1fr_1fr_90px] items-start gap-1 border-b border-white/5 bg-black/10 p-1.5">
        <select
          className={FIELD}
          value={preset.source === 'user' ? preset.scope : 'team'}
          disabled={!editable || busy || preset.source === 'system'}
          onChange={(event) => updateDraft(preset.draftId, { scope: normalizeScope(event.target.value) })}
          title={preset.scope === 'team' ? '所有人可见' : '仅自己可见'}
        >
          <option value="personal">仅自己</option>
          <option value="team">所有人</option>
        </select>
        <input className={FIELD} value={preset.category} disabled={!editable || busy} onChange={(event) => updateDraft(preset.draftId, { category: event.target.value })} />
        <input className={FIELD} value={preset.label} disabled={!editable || busy} onChange={(event) => updateDraft(preset.draftId, { label: event.target.value })} />
        <textarea className={`${FIELD} min-h-[58px] resize-y`} value={preset.core || ''} disabled={!editable || busy} onChange={(event) => updateDraft(preset.draftId, { core: event.target.value })} />
        <textarea className={`${FIELD} min-h-[58px] resize-y`} value={preset.features || ''} disabled={!editable || busy} onChange={(event) => updateDraft(preset.draftId, { features: event.target.value })} />
        <textarea className={`${FIELD} min-h-[58px] resize-y`} value={preset.usage || ''} disabled={!editable || busy} onChange={(event) => updateDraft(preset.draftId, { usage: event.target.value })} />
        <textarea className={`${FIELD} min-h-[58px] resize-y`} value={preset.negativePrompt || DEFAULT_NEGATIVE_PROMPT} disabled={!editable || busy} onChange={(event) => updateDraft(preset.draftId, { negativePrompt: event.target.value })} />
        <div className="flex flex-col gap-1">
          <div className="truncate text-[9px] text-white/35" title={preset.ownerName || (preset.source === 'system' ? '系统公共预设' : '')}>
            {preset.source === 'system' ? '系统' : (preset.ownerName || '个人')}
          </div>
          {preset.source === 'user' ? (
            <div className="flex gap-1">
              <button type="button" className={BUTTON} disabled={!editable || busy || !preset.label.trim()} onClick={() => void saveUserPreset(preset)}>
                <Save size={11} /> {rowBusy && localSavingId === preset.draftId ? '保存中' : '保存'}
              </button>
              <button type="button" className="rounded p-1.5 text-white/45 hover:bg-rose-400/15 hover:text-rose-200 disabled:opacity-35" disabled={!removable || busy} onClick={() => void deleteUserPreset(preset)} title="删除">
                <Trash2 size={13} />
              </button>
            </div>
          ) : (
            <div className="text-[9px] text-white/35">{canManageSystem ? '保存系统时生效' : '只读'}</div>
          )}
        </div>
      </div>
    );
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
            <div className="text-[10px] text-white/45">用户预设独立保存，不会改写系统公共预设。所有人可见的条款仅创建者和管理员可修改删除。</div>
          </div>
          <button type="button" className={BUTTON} onClick={addUserPreset} disabled={busy}>
            <Plus size={12} /> 新增个人预设
          </button>
          {canManageSystem && activeSource === 'system' && (
            <button type="button" className={BUTTON} onClick={() => void saveSystemPresets()} disabled={busy || saving}>
              <Save size={12} /> {saving ? '保存中' : '保存系统预设'}
            </button>
          )}
          <button type="button" className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white" onClick={onClose} disabled={busy} title="关闭">
            <X size={16} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-white/[0.025] p-3">
            <button
              type="button"
              className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ${activeSource === 'user' ? 'bg-cyan-300/15 text-cyan-100' : 'text-white/65 hover:bg-white/[0.08]'}`}
              onClick={() => { setActiveSource('user'); setActiveCategory('all'); }}
            >
              <span className="inline-flex items-center gap-1"><Lock size={11} /> 用户预设</span>
              <span className="text-[10px] text-white/40">{userPresetCount}</span>
            </button>
            <button
              type="button"
              className={`mb-3 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ${activeSource === 'system' ? 'bg-cyan-300/15 text-cyan-100' : 'text-white/65 hover:bg-white/[0.08]'}`}
              onClick={() => { setActiveSource('system'); setActiveCategory('all'); }}
            >
              <span className="inline-flex items-center gap-1"><Globe2 size={11} /> 系统公共预设</span>
              <span className="text-[10px] text-white/40">{systemPresetCount}</span>
            </button>

            <button
              type="button"
              className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ${activeCategory === 'all' ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/[0.08]'}`}
              onClick={() => setActiveCategory('all')}
            >
              <span>全部分类</span>
              <span className="text-[10px] text-white/40">{sourceDrafts.length}</span>
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ${activeCategory === category ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/[0.08]'}`}
                onClick={() => setActiveCategory(category)}
              >
                <span className="truncate">{category}</span>
                <span className="text-[10px] text-white/40">{sourceDrafts.filter((item) => normalizeCategory(item.category) === category).length}</span>
              </button>
            ))}
          </aside>

          <main className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
              <span className="text-[10px] text-white/45">
                {activeSource === 'user' ? '用户预设可逐条保存；系统公共预设不会被改写。' : canManageSystem ? '管理员可维护系统公共预设。' : '系统公共预设为只读。'}
              </span>
              {(localError || error) && <span className="text-[10px] text-red-300">{localError || error}</span>}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="min-w-[1120px] overflow-hidden rounded border border-white/10">
                <div className="grid grid-cols-[92px_120px_140px_1fr_1fr_1fr_1fr_90px] border-b border-white/10 bg-white/[0.06] text-[10px] font-semibold text-white/55">
                  <div className="px-2 py-2">可见性</div>
                  <div className="px-2 py-2">分类</div>
                  <div className="px-2 py-2">名称</div>
                  <div className="px-2 py-2">{paletteLabel}</div>
                  <div className="px-2 py-2">{texturesLabel}</div>
                  <div className="px-2 py-2">适用</div>
                  <div className="px-2 py-2">负面提示词</div>
                  <div className="px-2 py-2">操作</div>
                </div>
                {visibleDrafts.length === 0 ? (
                  <div className="px-3 py-10 text-center text-[11px] text-white/35">当前列表暂无预设。</div>
                ) : visibleDrafts.map(renderRow)}
              </div>
            </div>
          </main>
        </div>
      </section>
    </div>,
    document.body,
  );
}
