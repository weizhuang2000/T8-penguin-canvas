import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from 'lucide-react';
import type { ExhibitionCreativeConstraintPresetItem } from '../../services/api';

const FIELD = 'w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';

type Draft = ExhibitionCreativeConstraintPresetItem & { draftKey: string };

interface Props {
  open: boolean;
  presets: ExhibitionCreativeConstraintPresetItem[];
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (presets: ExhibitionCreativeConstraintPresetItem[]) => void | Promise<void>;
}

function sanitizeId(value: string) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}

function makeDraft(item: Partial<ExhibitionCreativeConstraintPresetItem>, index: number): Draft {
  return {
    id: sanitizeId(item.id || `constraint_${index + 1}`) || `constraint_${index + 1}`,
    label: String(item.label || '').trim(),
    text: String(item.text || '').trim(),
    order: index,
    draftKey: `${item.id || 'new'}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export default function PromptConstraintPresetEditorModal({
  open,
  presets,
  saving = false,
  error = '',
  onClose,
  onSave,
}: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDrafts(presets.map(makeDraft));
    setLocalError('');
  }, [open, presets]);

  const updateDraft = (draftKey: string, patch: Partial<Draft>) => {
    setDrafts((items) => items.map((item) => (item.draftKey === draftKey ? { ...item, ...patch } : item)));
  };

  const moveDraft = (draftKey: string, offset: number) => {
    setDrafts((items) => {
      const from = items.findIndex((item) => item.draftKey === draftKey);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= items.length) return items;
      const next = items.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const save = async () => {
    const used = new Set<string>();
    const normalized = drafts.map((item, index) => {
      let id = sanitizeId(item.id) || `constraint_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      return {
        id,
        label: item.label.trim(),
        text: item.text.trim(),
        order: index,
      };
    }).filter((item) => item.label && item.text);
    if (!normalized.length) {
      setLocalError('至少保留一个名称和约束正文完整的预设。');
      return;
    }
    if (normalized.length !== drafts.length) {
      setLocalError('每条预设都必须填写名称和约束正文。');
      return;
    }
    setLocalError('');
    await onSave(normalized);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-[900px] flex-col overflow-hidden rounded-lg border border-white/12 bg-zinc-950 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">提示词创作约束预设管理</div>
            <div className="text-[10px] text-white/45">系统管理员维护；节点每次生成 LLM 创意描述时会同时执行所选约束。</div>
          </div>
          <button type="button" className={BUTTON} disabled={saving} onClick={onClose}><X size={13} />关闭</button>
        </div>

        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <span className="text-[10px] text-white/45">预设名称用于节点选择，约束正文会发送给 LLM。</span>
          <div className="flex gap-1">
            <button
              type="button"
              className={BUTTON}
              disabled={saving || drafts.length >= 80}
              onClick={() => setDrafts((items) => [...items, makeDraft({ label: '新约束', text: '请填写提示词创作约束。' }, items.length)])}
            >
              <Plus size={13} />新增
            </button>
            <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={saving} onClick={() => void save()}>
              <Save size={13} />{saving ? '保存中' : '保存'}
            </button>
          </div>
        </div>

        {(error || localError) && (
          <div className="mx-4 mt-3 rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">
            {localError || error}
          </div>
        )}

        <div className="space-y-2 overflow-y-auto p-4">
          {drafts.map((item, index) => (
            <div key={item.draftKey} className="grid grid-cols-[160px_minmax(0,1fr)_88px] gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
              <div className="space-y-1">
                <label className="block text-[9px] text-white/40">预设名称</label>
                <input
                  className={FIELD}
                  value={item.label}
                  maxLength={120}
                  disabled={saving}
                  onChange={(event) => updateDraft(item.draftKey, { label: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] text-white/40">约束正文</label>
                <textarea
                  className={`${FIELD} min-h-[72px] resize-y`}
                  value={item.text}
                  maxLength={4000}
                  disabled={saving}
                  onChange={(event) => updateDraft(item.draftKey, { text: event.target.value })}
                />
              </div>
              <div className="flex flex-col justify-end gap-1">
                <button type="button" className={BUTTON} disabled={saving || index === 0} onClick={() => moveDraft(item.draftKey, -1)}><ArrowUp size={12} />上移</button>
                <button type="button" className={BUTTON} disabled={saving || index === drafts.length - 1} onClick={() => moveDraft(item.draftKey, 1)}><ArrowDown size={12} />下移</button>
                <button
                  type="button"
                  className={`${BUTTON} text-red-200`}
                  disabled={saving || drafts.length <= 1}
                  onClick={() => setDrafts((items) => items.filter((draft) => draft.draftKey !== item.draftKey))}
                >
                  <Trash2 size={12} />删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
