import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Plus, Save, Trash2, X } from 'lucide-react';
import type { ScienceExhibitPresetGroup, ScienceExhibitPromptPresetMap, ScienceExhibitOptionPresetItem } from '../../services/api';
import {
  mergeScienceExhibitOptionBatchItems,
  parseScienceExhibitOptionBatchText,
  type ScienceExhibitOptionBatchError,
} from '../../utils/scienceExhibitOptionBatchImport.js';

const FIELD = 'w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';

type DraftOption = ScienceExhibitOptionPresetItem & { draftId: string };
type BatchFeedback = {
  tone: 'success' | 'warning' | 'error';
  message: string;
  errors: ScienceExhibitOptionBatchError[];
};

const GROUPS: Array<{ id: ScienceExhibitPresetGroup; label: string }> = [
  { id: 'domains', label: '科学领域' },
  { id: 'types', label: '展项类型' },
  { id: 'interactions', label: '互动方式' },
  { id: 'audiences', label: '目标观众' },
  { id: 'scales', label: '空间尺度' },
];

interface ScienceExhibitOptionEditorModalProps {
  open: boolean;
  presets: ScienceExhibitPromptPresetMap;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (group: ScienceExhibitPresetGroup, presets: ScienceExhibitOptionPresetItem[]) => void | Promise<void>;
}

function sanitizeId(value: string) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}

function makeDraft(item: Partial<ScienceExhibitOptionPresetItem>, index: number): DraftOption {
  return {
    id: sanitizeId(String(item.id || `option_${index + 1}`)) || `option_${index + 1}`,
    draftId: `${String(item.id || 'new')}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    label: String(item.label || '').trim(),
    prompt: String(item.prompt || '').trim(),
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
  };
}

function normalizeDrafts(items: DraftOption[]): ScienceExhibitOptionPresetItem[] {
  const used = new Set<string>();
  return items
    .map((item, index) => {
      const label = String(item.label || '').trim();
      const prompt = String(item.prompt || '').trim();
      if (!label || !prompt) return null;
      let id = sanitizeId(item.id) || `option_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      return { id, label, prompt, order: index };
    })
    .filter(Boolean) as ScienceExhibitOptionPresetItem[];
}

export default function ScienceExhibitOptionEditorModal({
  open,
  presets,
  saving = false,
  error = '',
  onClose,
  onSave,
}: ScienceExhibitOptionEditorModalProps) {
  const [activeGroup, setActiveGroup] = useState<ScienceExhibitPresetGroup>('domains');
  const [draftMap, setDraftMap] = useState<Record<ScienceExhibitPresetGroup, DraftOption[]>>({
    domains: [],
    types: [],
    interactions: [],
    audiences: [],
    scales: [],
  });
  const [localError, setLocalError] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchFeedback, setBatchFeedback] = useState<BatchFeedback | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftMap({
      domains: (presets.domains || []).map(makeDraft),
      types: (presets.types || []).map(makeDraft),
      interactions: (presets.interactions || []).map(makeDraft),
      audiences: (presets.audiences || []).map(makeDraft),
      scales: (presets.scales || []).map(makeDraft),
    });
    setActiveGroup('domains');
    setLocalError('');
    setBatchOpen(false);
    setBatchText('');
    setBatchFeedback(null);
  }, [open, presets]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  const activeDrafts = draftMap[activeGroup] || [];
  const activeLabel = useMemo(() => GROUPS.find((item) => item.id === activeGroup)?.label || '', [activeGroup]);

  const setGroupDrafts = (updater: (items: DraftOption[]) => DraftOption[]) => {
    setDraftMap((current) => ({ ...current, [activeGroup]: updater(current[activeGroup] || []) }));
  };

  const addOption = () => {
    setGroupDrafts((items) => [...items, makeDraft({ label: '新选项', prompt: 'describe the science exhibit option' }, items.length)]);
  };

  const updateDraft = (draftId: string, patch: Partial<DraftOption>) => {
    setGroupDrafts((items) => items.map((item) => item.draftId === draftId ? { ...item, ...patch } : item));
  };

  const moveDraft = (draftId: string, offset: number) => {
    setGroupDrafts((items) => {
      const index = items.findIndex((item) => item.draftId === draftId);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
      const next = items.slice();
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const deleteDraft = (draftId: string) => {
    setGroupDrafts((items) => items.filter((item) => item.draftId !== draftId));
  };

  const selectGroup = (group: ScienceExhibitPresetGroup) => {
    setActiveGroup(group);
    setBatchOpen(false);
    setBatchText('');
    setBatchFeedback(null);
  };

  const closeBatchImport = () => {
    setBatchOpen(false);
    setBatchText('');
    setBatchFeedback(null);
  };

  const applyBatchImport = () => {
    const parsed = parseScienceExhibitOptionBatchText(batchText);
    if (parsed.items.length === 0) {
      setBatchFeedback({
        tone: 'error',
        message: `未找到有效选项，已跳过 ${parsed.errors.length} 行`,
        errors: parsed.errors,
      });
      return;
    }
    const importedDrafts = parsed.items.map((item, index) => makeDraft(item, activeDrafts.length + index));
    const merged = mergeScienceExhibitOptionBatchItems(activeDrafts, importedDrafts) as {
      items: DraftOption[];
      added: number;
      updated: number;
    };
    setGroupDrafts(() => merged.items);
    const skipped = parsed.errors.length;
    setBatchFeedback({
      tone: skipped > 0 ? 'warning' : 'success',
      message: `批量导入完成：新增 ${merged.added} 项，更新 ${merged.updated} 项，跳过 ${skipped} 行。请检查后点击“保存当前分类”。`,
      errors: parsed.errors,
    });
    if (skipped === 0) {
      setBatchText('');
      setBatchOpen(false);
    }
  };

  const saveActive = async () => {
    const normalized = normalizeDrafts(activeDrafts);
    if (normalized.length === 0) {
      setLocalError(`${activeLabel} 至少需要 1 个有效选项`);
      return;
    }
    setLocalError('');
    await onSave(activeGroup, normalized);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-[86vh] w-[860px] overflow-hidden rounded-xl border border-white/12 bg-zinc-950 text-white shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">科技展项设计选项管理</div>
            <div className="text-[10px] text-white/45">系统管理员维护，节点下拉和 LLM 提炼/生图 prompt 会同步使用。</div>
          </div>
          <button type="button" className={BUTTON} onClick={onClose} disabled={saving}><X size={13} /> 关闭</button>
        </div>

        <div className="flex gap-3 p-3">
          <div className="w-32 shrink-0 space-y-1">
            {GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`w-full rounded px-2 py-2 text-left text-[11px] ${activeGroup === group.id ? 'bg-cyan-300/15 text-cyan-100' : 'text-white/65 hover:bg-white/10'}`}
                onClick={() => selectGroup(group.id)}
                disabled={saving}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            {(error || localError) && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{localError || error}</div>}
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-cyan-100">{activeLabel}</div>
              <div className="flex gap-1">
                <button type="button" className={BUTTON} onClick={addOption} disabled={saving}><Plus size={13} /> 新增</button>
                <button type="button" className={BUTTON} onClick={() => setBatchOpen((value) => !value)} disabled={saving}><FileText size={13} /> 批量导入</button>
                <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} onClick={() => void saveActive()} disabled={saving}><Save size={13} /> 保存当前分类</button>
              </div>
            </div>

            {batchFeedback && (
              <div className={`rounded border px-2 py-1.5 text-[10px] ${batchFeedback.tone === 'error' ? 'border-red-300/25 bg-red-400/10 text-red-200' : batchFeedback.tone === 'warning' ? 'border-amber-300/25 bg-amber-300/10 text-amber-100' : 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'}`}>
                <div>{batchFeedback.message}</div>
                {batchFeedback.errors.length > 0 && (
                  <div className="mt-1 max-h-24 space-y-0.5 overflow-y-auto font-mono text-[9px]">
                    {batchFeedback.errors.map((item) => <div key={`${item.line}:${item.source}`}>第 {item.line} 行：{item.message}</div>)}
                  </div>
                )}
              </div>
            )}

            {batchOpen && (
              <div className="space-y-2 rounded border border-white/10 bg-black/20 p-2">
                <div className="text-[10px] leading-relaxed text-white/55">
                  每行一个选项：英文 ID + 中文名称 + 英文 Prompt。支持普通空格、Tab、全角空格，ID 和名称可使用 **粗体**。
                </div>
                <textarea
                  className={`${FIELD} min-h-[132px] resize-y font-mono`}
                  value={batchText}
                  disabled={saving}
                  placeholder={'**slider-control**　**滑杆调节**　visitor moves physical sliders to adjust variables and observes immediate changes in the exhibit\n**knob-control**　**旋钮调节**　visitor rotates knobs to fine-tune parameters such as frequency, intensity, temperature or scale'}
                  onChange={(event) => {
                    setBatchText(event.target.value);
                    setBatchFeedback(null);
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[9px] text-white/35">同 ID 更新原项，新 ID 追加；错误行会跳过并显示行号。</div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className={BUTTON} disabled={saving} onClick={closeBatchImport}>取消</button>
                    <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={saving || !batchText.trim()} onClick={applyBatchImport}>导入有效行</button>
                  </div>
                </div>
              </div>
            )}

            <div className={`${batchOpen ? 'max-h-[38vh]' : 'max-h-[60vh]'} space-y-2 overflow-y-auto pr-1`}>
              {activeDrafts.map((item, index) => (
                <div key={item.draftId} className="grid grid-cols-[120px_150px_1fr_88px] gap-2 rounded border border-white/10 bg-white/[0.035] p-2">
                  <label className="space-y-1">
                    <span className="text-[10px] text-white/45">ID</span>
                    <input className={FIELD} value={item.id} disabled={saving} onChange={(event) => updateDraft(item.draftId, { id: event.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-white/45">名称</span>
                    <input className={FIELD} value={item.label} disabled={saving} onChange={(event) => updateDraft(item.draftId, { label: event.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-white/45">Prompt 定义</span>
                    <textarea className={`${FIELD} min-h-[58px] resize-y`} value={item.prompt} disabled={saving} onChange={(event) => updateDraft(item.draftId, { prompt: event.target.value })} />
                  </label>
                  <div className="flex flex-col justify-end gap-1">
                    <button type="button" className={BUTTON} disabled={saving || index === 0} onClick={() => moveDraft(item.draftId, -1)}>上移</button>
                    <button type="button" className={BUTTON} disabled={saving || index >= activeDrafts.length - 1} onClick={() => moveDraft(item.draftId, 1)}>下移</button>
                    <button type="button" className={`${BUTTON} text-red-200`} disabled={saving || activeDrafts.length <= 1} onClick={() => deleteDraft(item.draftId)}><Trash2 size={12} /> 删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
