import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { UnitPanelMaterialItem } from '../../services/api';

const FIELD = 'w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';

type DraftMaterial = UnitPanelMaterialItem & { draftId: string };

interface UnitPanelMaterialEditorModalProps {
  open: boolean;
  materials: UnitPanelMaterialItem[];
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (materials: UnitPanelMaterialItem[]) => void | Promise<void>;
}

function makeDraft(item: Partial<UnitPanelMaterialItem>, index: number): DraftMaterial {
  const label = String(item.label || '').trim();
  const idBase = label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return {
    id: String(item.id || `${idBase || 'material'}-${index + 1}`),
    draftId: `${String(item.id || 'new')}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    category: String(item.category || '默认').trim() || '默认',
    label,
    description: String(item.description || '').trim(),
    texture: String(item.texture || '').trim(),
    usage: String(item.usage || '').trim(),
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
  };
}

function toSave(item: DraftMaterial, order: number): UnitPanelMaterialItem {
  return {
    id: item.id,
    category: String(item.category || '默认').trim() || '默认',
    label: item.label.trim(),
    description: String(item.description || '').trim(),
    texture: String(item.texture || '').trim(),
    usage: String(item.usage || '').trim(),
    order,
  };
}

export default function UnitPanelMaterialEditorModal({
  open,
  materials,
  saving = false,
  error = '',
  onClose,
  onSave,
}: UnitPanelMaterialEditorModalProps) {
  const [drafts, setDrafts] = useState<DraftMaterial[]>([]);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDrafts(materials.map(makeDraft));
    setLocalError('');
  }, [materials, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  const updateDraft = (draftId: string, patch: Partial<DraftMaterial>) => {
    setDrafts((items) => items.map((item) => item.draftId === draftId ? { ...item, ...patch } : item));
  };

  const addDraft = () => {
    setDrafts((items) => [...items, makeDraft({ category: '默认', label: '新材质' }, items.length)]);
  };

  const removeDraft = (draftId: string) => {
    setDrafts((items) => items.filter((item) => item.draftId !== draftId));
  };

  const save = async () => {
    const cleaned = drafts.map(toSave).filter((item) => item.label);
    if (!cleaned.length) {
      setLocalError('至少保留一个材质选项');
      return;
    }
    setLocalError('');
    await onSave(cleaned);
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-6">
      <div className="flex max-h-[86vh] w-[900px] flex-col rounded-xl border border-white/10 bg-zinc-950 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">单元板材质选项</div>
            <div className="text-[10px] text-white/45">系统管理员可维护，节点下拉会按分类显示。</div>
          </div>
          <button type="button" className={BUTTON} onClick={onClose} disabled={saving}>
            <X size={13} /> 关闭
          </button>
        </div>
        {(error || localError) && (
          <div className="mx-4 mt-3 rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[11px] text-red-200">
            {localError || error}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="space-y-2">
            {drafts.map((item, index) => (
              <div key={item.draftId} className="grid grid-cols-[90px_130px_1fr_1fr_1fr_34px] gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
                <input className={FIELD} value={item.category} disabled={saving} placeholder="分类" onChange={(e) => updateDraft(item.draftId, { category: e.target.value })} />
                <input className={FIELD} value={item.label} disabled={saving} placeholder="材质名称" onChange={(e) => updateDraft(item.draftId, { label: e.target.value })} />
                <input className={FIELD} value={item.description} disabled={saving} placeholder="描述" onChange={(e) => updateDraft(item.draftId, { description: e.target.value })} />
                <input className={FIELD} value={item.texture} disabled={saving} placeholder="肌理/工艺" onChange={(e) => updateDraft(item.draftId, { texture: e.target.value })} />
                <input className={FIELD} value={item.usage} disabled={saving} placeholder="用途" onChange={(e) => updateDraft(item.draftId, { usage: e.target.value })} />
                <button type="button" className={BUTTON} title={`删除第 ${index + 1} 项`} disabled={saving || drafts.length <= 1} onClick={() => removeDraft(item.draftId)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
          <button type="button" className={BUTTON} onClick={addDraft} disabled={saving}>
            <Plus size={13} /> 新增材质
          </button>
          <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} onClick={save} disabled={saving}>
            <Save size={13} /> {saving ? '保存中...' : '保存材质选项'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
