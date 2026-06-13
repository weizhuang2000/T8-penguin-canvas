import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock3,
  Copy,
  Eye,
  Image as ImageIcon,
  Info,
  Music,
  Pencil,
  Search,
  Send,
  Star,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useThemeStore } from '../stores/theme';
import * as api from '../services/api';
import type { GenerationHistoryItem, GenerationHistoryKind, GenerationHistoryProject } from '../services/api';
import type { GenerationHistoryUserSummary } from '../services/api';
import LoopingVideo from './LoopingVideo';

interface GenerationHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  userRole?: string;
}

const KIND_META: Record<GenerationHistoryKind | 'all', { label: string; icon: typeof ImageIcon; accent: string }> = {
  all: { label: '全部', icon: Clock3, accent: '#38bdf8' },
  image: { label: '图片', icon: ImageIcon, accent: '#fbbf24' },
  video: { label: '视频', icon: Video, accent: '#fb7185' },
  audio: { label: '音频', icon: Music, accent: '#a78bfa' },
};

const HISTORY_GRID_COLUMN_STORAGE_KEY = 'penguin:generation-history-columns';
const HISTORY_GRID_COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const HISTORY_PAGE_SIZE = 60;
type HistoryGridColumnCount = (typeof HISTORY_GRID_COLUMN_OPTIONS)[number];

function normalizeHistoryGridColumns(value: unknown): HistoryGridColumnCount {
  const n = Number(value);
  return HISTORY_GRID_COLUMN_OPTIONS.includes(n as HistoryGridColumnCount)
    ? (n as HistoryGridColumnCount)
    : 2;
}

function readHistoryGridColumns(): HistoryGridColumnCount {
  if (typeof window === 'undefined') return 2;
  try {
    return normalizeHistoryGridColumns(window.localStorage?.getItem(HISTORY_GRID_COLUMN_STORAGE_KEY));
  } catch {
    return 2;
  }
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '';
  return new Date(value).toLocaleString();
}

function resultData<T>(r: api.Result<T> | any): T | null {
  return r?.success ? (r.data as T) : null;
}

function validSeed(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function dragKindForHistoryItem(item: GenerationHistoryItem): GenerationHistoryKind {
  return item.kind;
}

function dragSourceNodeId(item: GenerationHistoryItem): string {
  return item.sourceNodeId || `generation-history-${item.id}`;
}

export default function GenerationHistoryDrawer({ open, onClose, userRole }: GenerationHistoryDrawerProps) {
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const [projects, setProjects] = useState<GenerationHistoryProject[]>([]);
  const [items, setItems] = useState<GenerationHistoryItem[]>([]);
  const [projectId, setProjectId] = useState('');
  const [kind, setKind] = useState<GenerationHistoryKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [historyUsers, setHistoryUsers] = useState<GenerationHistoryUserSummary[]>([]);
  const [userId, setUserId] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [sourceNodeType, setSourceNodeType] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState<GenerationHistoryItem | null>(null);
  const [infoItem, setInfoItem] = useState<GenerationHistoryItem | null>(null);
  const [gridColumns, setGridColumns] = useState<HistoryGridColumnCount>(() => readHistoryGridColumns());
  const isAdmin = userRole === 'admin' || userRole === 'manager';
  const itemsRef = useRef<GenerationHistoryItem[]>([]);
  const projectsRef = useRef<GenerationHistoryProject[]>([]);
  const skipAutoProjectReloadRef = useRef('');

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const load = useCallback(async (append = false) => {
    if (!open) return;
    if (!append && skipAutoProjectReloadRef.current && skipAutoProjectReloadRef.current === projectId) {
      skipAutoProjectReloadRef.current = '';
      return;
    }
    setLoading(true);
    setMsg('');
    let projectRes: api.Result<GenerationHistoryProject[]> = { success: true, data: projectsRef.current };
    let nextProjects = projectsRef.current;
    if (!append) {
      projectRes = await api.getGenerationHistoryProjects();
      nextProjects = resultData<GenerationHistoryProject[]>(projectRes) || [];
      if (isAdmin) {
        const usersRes = await api.getGenerationHistoryUsers();
        if (usersRes.success) setHistoryUsers(usersRes.data || []);
      }
      setProjects(nextProjects);
    }
    const nextProjectId = projectId || nextProjects.find((project) => project.counts.total > 0)?.id || nextProjects[0]?.id || '';
    if (!projectId && nextProjectId) {
      skipAutoProjectReloadRef.current = nextProjectId;
      setProjectId(nextProjectId);
    }
    const itemRes = await api.getGenerationHistoryItems({
      canvasId: nextProjectId || undefined,
      kind,
      q: debouncedQ,
      favorite: favoriteOnly,
      includeHidden,
      userId: isAdmin ? userId : undefined,
      provider: isAdmin ? provider : undefined,
      model: isAdmin ? model : undefined,
      sourceNodeType: isAdmin ? sourceNodeType : undefined,
      limit: HISTORY_PAGE_SIZE,
      offset: append ? itemsRef.current.length : 0,
    });
    const nextItems = resultData<GenerationHistoryItem[]>(itemRes) || [];
    setHasMore(nextItems.length === HISTORY_PAGE_SIZE);
    if (itemRes.success) {
      setItems((prev) => {
        if (!append) return nextItems;
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...nextItems.filter((item) => !seen.has(item.id))];
      });
    }
    if (!projectRes.success || !itemRes.success) setMsg((projectRes as any).error || (itemRes as any).error || '加载历史失败');
    setLoading(false);
  }, [debouncedQ, favoriteOnly, includeHidden, isAdmin, kind, model, open, projectId, provider, sourceNodeType, userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onChanged = () => load();
    window.addEventListener('penguin:generation-history-changed', onChanged);
    return () => window.removeEventListener('penguin:generation-history-changed', onChanged);
  }, [load, open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage?.setItem(HISTORY_GRID_COLUMN_STORAGE_KEY, String(gridColumns));
    } catch {
      // Ignore private browsing or storage quota failures.
    }
  }, [gridColumns]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === projectId) || null,
    [projectId, projects],
  );

  const updateItem = async (item: GenerationHistoryItem, patch: Parameters<typeof api.updateGenerationHistoryItem>[1]) => {
    const r = await api.updateGenerationHistoryItem(item.id, patch);
    if (r.success) {
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? r.data : entry)));
      window.dispatchEvent(new CustomEvent('penguin:generation-history-changed'));
    } else {
      setMsg(r.error || '更新历史失败');
    }
  };

  const renameItem = async (item: GenerationHistoryItem) => {
    const title = window.prompt('历史名称', item.title);
    if (!title?.trim() || title.trim() === item.title) return;
    await updateItem(item, { title: title.trim() });
  };

  const hideItem = async (item: GenerationHistoryItem) => {
    const nextHidden = !item.hidden;
    if (!nextHidden || window.confirm(`仅从历史中隐藏“${item.title}”？文件仍会保留。`)) {
      await updateItem(item, { hidden: nextHidden });
    }
  };

  const deleteFile = async (item: GenerationHistoryItem) => {
    if (!isAdmin) return;
    if (!window.confirm(`彻底删除文件“${item.title}”？这可能影响画布中仍引用它的节点。`)) return;
    const r = await api.deleteGenerationHistoryItem(item.id, 'delete-file');
    if (r.success) {
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      setMsg('文件已彻底删除');
      window.dispatchEvent(new CustomEvent('penguin:generation-history-changed'));
    } else {
      setMsg(r.error || '删除文件失败');
    }
  };

  const addToResources = async (item: GenerationHistoryItem) => {
    const r = await api.addGenerationHistoryItemToResources(item.id, {
      title: item.title,
      tags: item.tags,
    });
    setMsg(r.success ? '已加入资源库' : r.error || '加入资源库失败');
    if (r.success) window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
  };

  const sendItem = (item: GenerationHistoryItem) => {
    window.dispatchEvent(new CustomEvent('penguin:open-send-materials', {
      detail: {
        materials: [{
          id: item.id,
          kind: item.kind,
          url: item.url,
          name: item.title,
          sourceNodeId: item.sourceNodeId || 'generation-history',
          sourceCanvasId: item.canvasId,
          previewUrl: item.url,
        }],
        sourceLabel: `历史生成 · ${item.title}`,
        defaultMode: 'upload',
      },
    }));
  };

  const reuseSeed = (item: GenerationHistoryItem) => {
    const seed = validSeed(item.seed);
    if (!seed) return;
    window.dispatchEvent(new CustomEvent('penguin:reuse-generation-seed', {
      detail: {
        seed,
        prompt: item.prompt || '',
        model: item.model || '',
        provider: item.provider || '',
        imageUrl: item.url,
        title: item.title,
      },
    }));
    setMsg(`已发送 seed: ${seed}`);
  };

  const copyPrompt = async (item: GenerationHistoryItem) => {
    const prompt = String(item.prompt || '').trim();
    if (!prompt || typeof navigator === 'undefined' || !navigator.clipboard) {
      setMsg('没有可复制的提示词');
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      setMsg('已复制提示词');
    } catch {
      setMsg('复制提示词失败');
    }
  };

  if (!open) return null;

  const panelCls = isPixel
    ? 'bg-[var(--px-surface)] text-[var(--px-ink)] border-l-2 border-[var(--px-ink)]'
    : isDark
      ? 'bg-zinc-950 text-zinc-100 border-l border-white/10'
      : 'bg-white text-zinc-900 border-l border-black/10';
  const subtle = isPixel ? 'text-[var(--px-ink-soft)]' : isDark ? 'text-white/45' : 'text-zinc-500';
  const inputCls = isPixel
    ? 'px-input h-9 text-sm'
    : `h-9 px-3 rounded-md border text-sm outline-none ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-black/5 border-black/10 text-zinc-900'}`;
  const activeMeta = KIND_META[kind];
  const drawerWidth = `min(calc(100vw - 18px), ${Math.max(520, 188 + gridColumns * 180)}px)`;

  return (
    <div
      className={`generation-history-drawer fixed top-0 right-0 z-50 h-screen shadow-2xl flex flex-col ${panelCls}`}
      style={{ width: drawerWidth }}
    >
      <div className={`h-[52px] px-4 py-3 flex items-center justify-between shrink-0 ${isPixel ? 'border-b-2 border-[var(--px-ink)] bg-[var(--px-muted)]' : isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Clock3 size={18} style={{ color: activeMeta.accent }} />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-none">历史生成</div>
            <div className={`text-[11px] mt-1 ${subtle}`}>{activeProject?.name || '选择项目'} · {items.length} 个媒体</div>
          </div>
        </div>
        <div className="ml-2 flex items-center gap-1 shrink-0 min-w-0">
          <div
            className={isPixel ? 'flex max-w-[240px] items-center gap-0.5 overflow-x-auto' : `flex max-w-[240px] items-center overflow-x-auto rounded-md border p-0.5 ${isDark ? 'border-white/10 bg-white/5' : 'border-black/10 bg-black/5'}`}
            title="Columns"
          >
            {HISTORY_GRID_COLUMN_OPTIONS.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setGridColumns(count)}
                className={
                  isPixel
                    ? `px-btn px-btn--sm min-w-7 ${gridColumns === count ? 'px-btn--yellow' : 'px-btn--ghost'}`
                    : `h-7 min-w-7 rounded text-[11px] font-semibold transition ${
                        gridColumns === count
                          ? isDark
                            ? 'bg-cyan-400 text-zinc-950'
                            : 'bg-cyan-500 text-white'
                          : isDark
                            ? 'text-white/60 hover:bg-white/10'
                            : 'text-zinc-500 hover:bg-black/10'
                      }`
                }
                title={`${count} columns`}
              >
                {count}
              </button>
            ))}
          </div>
          <button onClick={onClose} className={isPixel ? 't8-mini-icon-button px-btn px-btn--icon px-btn--ghost' : `t8-mini-icon-button h-9 w-9 p-0 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className={`px-3 py-2 flex items-center gap-1.5 shrink-0 ${isPixel ? 'border-b-2 border-[var(--px-ink)]' : isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
        {(Object.keys(KIND_META) as Array<GenerationHistoryKind | 'all'>).map((entryKind) => {
          const meta = KIND_META[entryKind];
          const Icon = meta.icon;
          const active = kind === entryKind;
          return (
            <button
              key={entryKind}
              onClick={() => setKind(entryKind)}
              className={isPixel ? `px-btn px-btn--sm ${active ? 'px-btn--yellow' : ''}` : `flex-1 h-8 rounded-md text-xs flex items-center justify-center gap-1.5 ${active ? 'text-zinc-950' : subtle}`}
              style={!isPixel && active ? { background: meta.accent } : undefined}
            >
              <Icon size={13} /> {meta.label}
            </button>
          );
        })}
      </div>

      <div className={`px-3 py-2 shrink-0 flex items-center gap-2 ${isPixel ? 'border-b-2 border-[var(--px-ink)]' : isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
        <div className="relative flex-1">
          <Search size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${subtle}`} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称 / 提示词 / 模型" className={`${inputCls} w-full pl-8`} />
        </div>
        <button onClick={() => setFavoriteOnly((v) => !v)} className={isPixel ? `px-btn px-btn--icon ${favoriteOnly ? 'px-btn--yellow' : 'px-btn--ghost'}` : `h-9 w-9 rounded-md border flex items-center justify-center ${favoriteOnly ? 'text-amber-300 border-amber-400/50 bg-amber-400/10' : isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`} title="收藏">
          <Star size={15} fill={favoriteOnly ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => setIncludeHidden((v) => !v)} className={isPixel ? `px-btn px-btn--icon ${includeHidden ? 'px-btn--yellow' : 'px-btn--ghost'}` : `h-9 w-9 rounded-md border flex items-center justify-center ${includeHidden ? 'text-cyan-300 border-cyan-400/50 bg-cyan-400/10' : isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`} title="显示隐藏">
          <Eye size={15} />
        </button>
      </div>

      {isAdmin && (
        <div className={`grid grid-cols-2 gap-2 px-3 py-2 shrink-0 ${isPixel ? 'border-b-2 border-[var(--px-ink)]' : isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${inputCls} w-full text-xs`}>
            <option value="">全部用户</option>
            {historyUsers.map((user) => (
              <option key={user.userId} value={user.userId}>
                {(user.name || user.username || user.userId)} · {user.counts.total}
              </option>
            ))}
          </select>
          <input value={sourceNodeType} onChange={(e) => setSourceNodeType(e.target.value)} className={`${inputCls} w-full text-xs`} placeholder="工具类型 image / video" />
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className={`${inputCls} w-full text-xs`} placeholder="平台 provider" />
          <input value={model} onChange={(e) => setModel(e.target.value)} className={`${inputCls} w-full text-xs`} placeholder="模型 model" />
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <aside className={`w-40 shrink-0 overflow-y-auto p-2 space-y-1 ${isPixel ? 'border-r-2 border-[var(--px-ink)] bg-[var(--px-muted)]' : isDark ? 'border-r border-white/10 bg-white/[0.02]' : 'border-r border-black/10 bg-black/[0.02]'}`}>
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setProjectId(project.id)}
              className={`w-full text-left px-2 py-1.5 text-xs rounded ${projectId === project.id ? (isPixel ? 'bg-[var(--px-yellow)] border-2 border-[var(--px-ink)]' : 'bg-cyan-500/15 text-cyan-300') : isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
              title={project.name}
            >
              <span className="block truncate font-medium">{project.name}</span>
              <span className={`block text-[10px] ${subtle}`}>{project.counts.total} 个 · 图{project.counts.image} 视{project.counts.video} 音{project.counts.audio}</span>
            </button>
          ))}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto p-3">
          {msg && <div className={`mb-2 text-[11px] px-2 py-1 rounded ${isPixel ? 'bg-[var(--px-yellow)] border-2 border-[var(--px-ink)]' : isDark ? 'bg-white/10 text-white/70' : 'bg-black/5 text-zinc-600'}`}>{msg}</div>}
          {loading && <div className={`text-xs ${subtle}`}>加载中...</div>}
          {!loading && items.length === 0 && <div className={`h-56 flex items-center justify-center text-xs ${subtle}`}>暂无历史媒体</div>}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
          >
            {items.map((item) => {
              const Icon = KIND_META[item.kind].icon;
              const seed = validSeed(item.seed);
              return (
                <article
                  key={item.id}
                  data-drag-source
                  data-drag-direct="true"
                  data-drag-kind={dragKindForHistoryItem(item)}
                  data-drag-url={item.url}
                  data-drag-preview={item.url}
                  data-drag-node-id={dragSourceNodeId(item)}
                  data-resource-title={item.title}
                  title={`${item.title}\n拖拽到画布可直接插入`}
                  className={`overflow-hidden ${isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-surface)] shadow-[3px_3px_0_var(--px-ink)]' : isDark ? 'rounded-lg border border-white/10 bg-white/[0.04]' : 'rounded-lg border border-black/10 bg-black/[0.03]'}`}
                >
                  <div className="relative h-32 overflow-hidden bg-black/80">
                    {item.kind === 'image' && <img src={item.url} alt={item.title} className="h-full w-full object-cover" draggable={false} />}
                    {item.kind === 'video' && <LoopingVideo src={item.url} muted className="h-full w-full object-cover" />}
                    {item.kind === 'audio' && <div className="h-full w-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#312e81,#7c3aed,#db2777)' }}><Music size={34} className="text-white" /></div>}
                    {item.hidden && <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">已隐藏</span>}
                    <button onClick={() => updateItem(item, { favorite: !item.favorite })} className="absolute right-1.5 top-1.5 h-7 w-7 rounded-full bg-black/55 text-amber-300 flex items-center justify-center" title="收藏">
                      <Star size={13} fill={item.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoItem(item);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute right-1.5 top-9 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center"
                      title="Info"
                    >
                      <Info size={13} />
                    </button>
                    {item.kind === 'image' && (
                      <button
                        onClick={() => copyPrompt(item)}
                        disabled={!String(item.prompt || '').trim()}
                        className="absolute right-1.5 top-[66px] h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-45"
                        title={String(item.prompt || '').trim() ? '复制提示词' : '没有可复制的提示词'}
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                  <div className="p-2 space-y-1.5">
                    <div className="flex items-center gap-1 text-xs font-medium">
                      <Icon size={12} style={{ color: KIND_META[item.kind].accent }} />
                      <span className="truncate" title={item.title}>{item.title}</span>
                    </div>
                    <div className={`text-[10px] truncate ${subtle}`}>{item.provider || item.model || item.fileName}</div>
                    {item.kind === 'audio' && <audio src={item.url} controls className="w-full h-8" />}
                    <div className="flex items-center justify-center gap-1.5 pt-0.5">
                      <button onClick={() => setPreview(item)} className="h-7 w-7 rounded-full border flex items-center justify-center" title="预览"><Eye size={13} /></button>
                      {seed > 0 && item.kind === 'image' && <button onClick={() => reuseSeed(item)} className="h-7 w-7 rounded-full border flex items-center justify-center text-amber-300" title="使用 seed">#</button>}
                      <button onClick={() => sendItem(item)} className="h-7 w-7 rounded-full border flex items-center justify-center" title="发送到画布"><Send size={13} /></button>
                      <button onClick={() => addToResources(item)} className="h-7 w-7 rounded-full border flex items-center justify-center" title="加入资源库"><Star size={13} /></button>
                      {item.access?.canManage && <button onClick={() => renameItem(item)} className="h-7 w-7 rounded-full border flex items-center justify-center" title="重命名"><Pencil size={13} /></button>}
                      {item.access?.canManage && <button onClick={() => hideItem(item)} className="h-7 w-7 rounded-full border flex items-center justify-center text-red-500" title={item.hidden ? '恢复显示' : '隐藏'}><Trash2 size={13} /></button>}
                      {isAdmin && <button onClick={() => deleteFile(item)} className="h-7 w-7 rounded-full border flex items-center justify-center text-red-700" title="彻底删除文件"><X size={13} /></button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => load(true)}
              disabled={loading}
              className={isPixel ? 'px-btn mt-3 w-full' : `mt-3 h-9 w-full rounded-md border text-xs ${isDark ? 'border-white/10 hover:bg-white/10 disabled:text-white/35' : 'border-black/10 hover:bg-black/5 disabled:text-zinc-400'}`}
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
        </main>
      </div>

      {infoItem && (
        <div className="fixed inset-0 z-[60] bg-black/55 flex items-center justify-center p-4" onClick={() => setInfoItem(null)}>
          <div
            className={`${isPixel ? 'bg-[var(--px-surface)] text-[var(--px-ink)] border-2 border-[var(--px-ink)]' : isDark ? 'bg-zinc-950 text-white border-white/10' : 'bg-white text-zinc-900 border-black/10'} w-[360px] max-w-[86vw] rounded-lg border p-3 shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">生成信息</div>
                <div className={`text-[11px] truncate ${subtle}`}>{infoItem.title}</div>
              </div>
              <button
                type="button"
                onClick={() => setInfoItem(null)}
                className={isPixel ? 't8-mini-icon-button px-btn px-btn--icon px-btn--ghost' : `h-8 w-8 rounded-md flex items-center justify-center ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                title="关闭"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-3">
                <span className={`w-16 shrink-0 ${subtle}`}>生成用户</span>
                <span className="min-w-0 flex-1 break-words">{infoItem.createdByUserName || infoItem.createdByUserId || '未知用户'}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`w-16 shrink-0 ${subtle}`}>Seed</span>
                <span className="min-w-0 flex-1 break-words">{validSeed(infoItem.seed) > 0 ? validSeed(infoItem.seed) : '-'}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className={`w-16 shrink-0 ${subtle}`}>时间</span>
                <span className="min-w-0 flex-1 break-words">{formatTime(infoItem.createdAt) || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className={`${isDark ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900'} max-h-[88vh] max-w-[86vw] overflow-auto rounded-lg border p-3`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold truncate">{preview.title}</div>
              <button onClick={() => setPreview(null)} className="h-8 w-8 rounded-md flex items-center justify-center"><X size={16} /></button>
            </div>
            {preview.kind === 'image' && <img src={preview.url} alt={preview.title} className="max-h-[72vh] max-w-[80vw] object-contain" />}
            {preview.kind === 'video' && <video src={preview.url} controls className="max-h-[72vh] max-w-[80vw]" />}
            {preview.kind === 'audio' && <audio src={preview.url} controls className="w-[420px] max-w-[80vw]" />}
            {validSeed(preview.seed) > 0 && <div className={`mt-2 text-xs ${subtle}`}>Seed: {validSeed(preview.seed)}</div>}
            {preview.prompt && <div className={`mt-2 max-w-[720px] whitespace-pre-wrap text-xs ${subtle}`}>{preview.prompt}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
