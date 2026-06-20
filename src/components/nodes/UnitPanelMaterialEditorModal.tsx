import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain, Plus, Save, Trash2, X } from 'lucide-react';
import type { UnitPanelMaterialItem } from '../../services/api';
import { generateLlm } from '../../services/generation';

const FIELD = 'w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';

type DraftMaterial = UnitPanelMaterialItem & { draftId: string };
type AiCandidateMaterial = DraftMaterial & { candidateId: string };

interface UnitPanelMaterialEditorModalProps {
  open: boolean;
  materials: UnitPanelMaterialItem[];
  saving?: boolean;
  error?: string;
  llmModel?: string;
  llmKeyId?: string;
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

function uniqueMaterialId(raw: string, used: Set<string>): string {
  const base = String(raw || 'material').trim() || 'material';
  let id = base;
  let index = 2;
  while (used.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  used.add(id);
  return id;
}

function extractJsonArray(text: string): any[] {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.materials)) return parsed.materials;
  } catch {}
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {}
  }
  return [];
}

function buildAiMaterialPrompt(existing: UnitPanelMaterialItem[]): string {
  const existingLabels = existing.map((item) => item.label).filter(Boolean).slice(0, 80).join('、');
  return [
    '请为“展陈单元板设计”生成 10 个可用于材质下拉库的材质选项。',
    '输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"materials":[{"category":"分类","label":"材质名称","description":"适合展陈单元板的简短说明","texture":"表面肌理/工艺","usage":"建议用于主材质或辅助材质的场景"}]}',
    '要求：材质应适合博物馆、历史文化陈列、城市文化展、纪念馆等展陈场景；名称要清晰可复用，避免重复、空泛和品牌名。',
    existingLabels ? `已有材质名称，尽量不要重复：${existingLabels}` : '',
  ].filter(Boolean).join('\n');
}

export default function UnitPanelMaterialEditorModal({
  open,
  materials,
  saving = false,
  error = '',
  llmModel = '',
  llmKeyId = '',
  onClose,
  onSave,
}: UnitPanelMaterialEditorModalProps) {
  const [drafts, setDrafts] = useState<DraftMaterial[]>([]);
  const [aiCandidates, setAiCandidates] = useState<AiCandidateMaterial[]>([]);
  const [selectedAiIds, setSelectedAiIds] = useState<Set<string>>(() => new Set());
  const [aiGenerating, setAiGenerating] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDrafts(materials.map(makeDraft));
    setAiCandidates([]);
    setSelectedAiIds(new Set());
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

  const generateAiMaterials = async () => {
    setAiGenerating(true);
    setLocalError('');
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId,
        temperature: 0.45,
        max_tokens: 2200,
        messages: [{ role: 'user', content: buildAiMaterialPrompt([...materials, ...drafts]) }],
      });
      const parsed = extractJsonArray(response.content || '').slice(0, 10);
      if (!parsed.length) throw new Error('AI 未返回有效材质 JSON');
      const candidates = parsed.map((item, index) => {
        const draft = makeDraft(item, drafts.length + index);
        return { ...draft, candidateId: `${draft.draftId}-candidate` };
      });
      setAiCandidates(candidates);
      setSelectedAiIds(new Set(candidates.map((item) => item.candidateId)));
    } catch (err: any) {
      setLocalError(err?.message || 'AI 自动生成材质失败');
    } finally {
      setAiGenerating(false);
    }
  };

  const toggleAiCandidate = (candidateId: string, checked: boolean) => {
    setSelectedAiIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  };

  const saveSelectedAiMaterials = async () => {
    const selected = aiCandidates.filter((item) => selectedAiIds.has(item.candidateId));
    if (!selected.length) {
      setLocalError('请至少选择一个 AI 生成材质');
      return;
    }
    const cleaned = drafts.map(toSave).filter((item) => item.label);
    const used = new Set(cleaned.map((item) => item.id).filter(Boolean));
    const additions = selected.map((item, index) => {
      const saved = toSave(item, cleaned.length + index);
      return { ...saved, id: uniqueMaterialId(saved.id, used), order: cleaned.length + index };
    });
    setLocalError('');
    await onSave([...cleaned, ...additions]);
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
          <div className="mb-4 rounded border border-cyan-300/20 bg-cyan-300/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold text-cyan-100">AI 自动添加材质</div>
                <div className="text-[10px] text-white/45">使用当前 LLM 配置生成 10 个候选，勾选后可保存到全局材质库。</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className={BUTTON} disabled={saving || aiGenerating} onClick={() => void generateAiMaterials()}>
                  <Brain size={13} /> {aiGenerating ? '生成中...' : 'AI 生成 10 个'}
                </button>
                <button type="button" className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={saving || aiGenerating || selectedAiIds.size === 0} onClick={() => void saveSelectedAiMaterials()}>
                  <Save size={13} /> 保存选中材质
                </button>
              </div>
            </div>
            {aiCandidates.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {aiCandidates.map((item) => (
                  <label key={item.candidateId} className="flex gap-2 rounded border border-white/10 bg-black/15 p-2 text-[10px] text-white/70">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-cyan-300"
                      checked={selectedAiIds.has(item.candidateId)}
                      disabled={saving || aiGenerating}
                      onChange={(event) => toggleAiCandidate(item.candidateId, event.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-cyan-100">{item.label || '未命名材质'}</span>
                      <span className="block text-white/45">{item.category}</span>
                      <span className="mt-1 block leading-relaxed text-white/60">{item.description}</span>
                      <span className="mt-1 block text-white/45">{item.texture}</span>
                      <span className="mt-1 block text-white/45">{item.usage}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
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
