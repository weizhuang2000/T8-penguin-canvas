import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Plus, Save, Trash2, X } from 'lucide-react';
import type { DesignOptionPresetItem } from '../../services/api';
import { mergeDesignOptionBatchItems, parseDesignOptionBatchText, type DesignOptionBatchError } from '../../utils/designOptionBatchImport.js';

const FIELD = 'w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:opacity-40';
type Draft = DesignOptionPresetItem & { draftId: string };

interface Props {
  open: boolean;
  title: string;
  groups: Array<{ id: string; label: string }>;
  presets: Record<string, DesignOptionPresetItem[]>;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (group: string, presets: DesignOptionPresetItem[]) => void | Promise<void>;
}

const sanitizeId = (value: string) => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
const makeDraft = (item: Partial<DesignOptionPresetItem>, index: number): Draft => ({
  id: sanitizeId(String(item.id || `option_${index + 1}`)) || `option_${index + 1}`,
  label: String(item.label || '').trim(), prompt: String(item.prompt || '').trim(), order: index,
  draftId: `${item.id || 'new'}-${index}-${Math.random().toString(36).slice(2, 7)}`,
});

export default function DesignOptionEditorModal({ open, title, groups, presets, saving = false, error = '', onClose, onSave }: Props) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.id || '');
  const [draftMap, setDraftMap] = useState<Record<string, Draft[]>>({});
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; errors: DesignOptionBatchError[] } | null>(null);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraftMap(Object.fromEntries(groups.map((group) => [group.id, (presets[group.id] || []).map(makeDraft)])));
    setActiveGroup(groups[0]?.id || ''); setBatchOpen(false); setBatchText(''); setFeedback(null); setLocalError('');
  }, [groups, open, presets]);

  const activeDrafts = draftMap[activeGroup] || [];
  const activeLabel = useMemo(() => groups.find((item) => item.id === activeGroup)?.label || '', [activeGroup, groups]);
  const setDrafts = (next: (items: Draft[]) => Draft[]) => setDraftMap((current) => ({ ...current, [activeGroup]: next(current[activeGroup] || []) }));
  const updateDraft = (draftId: string, patch: Partial<Draft>) => setDrafts((items) => items.map((item) => item.draftId === draftId ? { ...item, ...patch } : item));
  const moveDraft = (draftId: string, offset: number) => setDrafts((items) => {
    const from = items.findIndex((item) => item.draftId === draftId); const to = from + offset;
    if (from < 0 || to < 0 || to >= items.length) return items;
    const next = items.slice(); const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
  });
  const applyBatch = () => {
    const parsed = parseDesignOptionBatchText(batchText);
    if (!parsed.items.length) { setFeedback({ message: `未找到有效选项，跳过 ${parsed.errors.length} 行。`, errors: parsed.errors }); return; }
    const merged = mergeDesignOptionBatchItems(activeDrafts, parsed.items.map((item, index) => makeDraft(item, activeDrafts.length + index)));
    setDrafts(() => merged.items);
    setFeedback({ message: `导入完成：新增 ${merged.added} 项，更新 ${merged.updated} 项，跳过 ${parsed.errors.length} 行。`, errors: parsed.errors });
    if (!parsed.errors.length) { setBatchText(''); setBatchOpen(false); }
  };
  const save = async () => {
    const used = new Set<string>();
    const normalized = activeDrafts.map((item, index) => {
      let id = sanitizeId(item.id) || `option_${index + 1}`; while (used.has(id)) id = `${id}_${index + 1}`; used.add(id);
      return { id, label: item.label.trim(), prompt: item.prompt.trim(), order: index };
    }).filter((item) => item.label && item.prompt);
    if (!normalized.length) { setLocalError(`${activeLabel}至少需要一个有效选项`); return; }
    setLocalError(''); await onSave(activeGroup, normalized);
  };
  if (!open) return null;
  return createPortal(<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4">
    <div className="max-h-[88vh] w-[900px] overflow-hidden rounded-lg border border-white/12 bg-zinc-950 text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="text-sm font-semibold">{title}</div><div className="text-[10px] text-white/45">系统管理员维护，节点下拉和生成 Prompt 会同步使用。</div></div><button className={BUTTON} onClick={onClose}><X size={13} />关闭</button></div>
      <div className="flex gap-3 p-3"><div className="w-32 shrink-0 space-y-1">{groups.map((group) => <button key={group.id} className={`w-full rounded px-2 py-2 text-left text-[11px] ${activeGroup === group.id ? 'bg-cyan-300/15 text-cyan-100' : 'text-white/65 hover:bg-white/10'}`} onClick={() => { setActiveGroup(group.id); setBatchOpen(false); setFeedback(null); }}>{group.label}</button>)}</div>
        <div className="min-w-0 flex-1 space-y-2">{(error || localError) && <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{localError || error}</div>}
          <div className="flex items-center justify-between"><div className="text-[11px] font-semibold text-cyan-100">{activeLabel}</div><div className="flex gap-1"><button className={BUTTON} disabled={saving} onClick={() => setDrafts((items) => [...items, makeDraft({ label: '新选项', prompt: '请填写生成 Prompt' }, items.length)])}><Plus size={13} />新增</button><button className={BUTTON} disabled={saving} onClick={() => setBatchOpen((value) => !value)}><FileText size={13} />批量导入</button><button className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={saving} onClick={() => void save()}><Save size={13} />保存当前分类</button></div></div>
          {feedback && <div className="rounded border border-amber-300/25 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100"><div>{feedback.message}</div>{feedback.errors.map((item) => <div key={`${item.line}-${item.source}`}>第 {item.line} 行：{item.message}</div>)}</div>}
          {batchOpen && <div className="space-y-2 rounded border border-white/10 bg-black/20 p-2"><div className="text-[10px] text-white/55">每行一个选项：英文 ID + 名称 + Prompt。支持空格、Tab、全角空格和 Markdown 粗体字段。</div><textarea className={`${FIELD} min-h-[120px] resize-y font-mono`} value={batchText} onChange={(event) => setBatchText(event.target.value)} placeholder="historical-restoration  历史复原场景  restore a historically accurate exhibition scene" /><div className="flex justify-end gap-1"><button className={BUTTON} onClick={() => setBatchOpen(false)}>取消</button><button className={BUTTON} disabled={!batchText.trim()} onClick={applyBatch}>导入有效行</button></div></div>}
          <div className={`${batchOpen ? 'max-h-[38vh]' : 'max-h-[60vh]'} space-y-2 overflow-y-auto pr-1`}>{activeDrafts.map((item, index) => <div key={item.draftId} className="grid grid-cols-[120px_150px_1fr_88px] gap-2 rounded border border-white/10 bg-white/[0.035] p-2"><input className={FIELD} value={item.id} onChange={(event) => updateDraft(item.draftId, { id: event.target.value })} /><input className={FIELD} value={item.label} onChange={(event) => updateDraft(item.draftId, { label: event.target.value })} /><textarea className={`${FIELD} min-h-[58px] resize-y`} value={item.prompt} onChange={(event) => updateDraft(item.draftId, { prompt: event.target.value })} /><div className="flex flex-col gap-1"><button className={BUTTON} disabled={index === 0} onClick={() => moveDraft(item.draftId, -1)}>上移</button><button className={BUTTON} disabled={index === activeDrafts.length - 1} onClick={() => moveDraft(item.draftId, 1)}>下移</button><button className={`${BUTTON} text-red-200`} disabled={activeDrafts.length <= 1} onClick={() => setDrafts((items) => items.filter((draft) => draft.draftId !== item.draftId))}><Trash2 size={12} />删除</button></div></div>)}</div>
        </div></div>
    </div></div>, document.body);
}
