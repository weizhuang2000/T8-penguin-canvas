import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bell,
  CheckCheck,
  History,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import * as api from '../services/api';
import type {
  GenerationHistoryItem,
  NotificationContentBlock,
  NotificationDraft,
  NotificationImageBlock,
  NotificationTextBlock,
  SystemNotification,
} from '../services/api';
import { useThemeStore } from '../stores/theme';

interface NotificationCenterModalProps {
  open: boolean;
  canManage: boolean;
  onClose: () => void;
  onNotificationsChanged: (items: SystemNotification[]) => void;
}

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40];
const TEXT_COLORS = [
  { value: '', label: '默认颜色' },
  { value: '#dc2626', label: '红色' },
  { value: '#ea580c', label: '橙色' },
  { value: '#ca8a04', label: '黄色' },
  { value: '#16a34a', label: '绿色' },
  { value: '#0284c7', label: '蓝色' },
  { value: '#7c3aed', label: '紫色' },
  { value: '#111827', label: '黑色' },
  { value: '#ffffff', label: '白色' },
];
const MAX_TEXT_LENGTH = 5000;
const MAX_IMAGES = 12;

type NotificationBlockPatch = Partial<Pick<NotificationTextBlock, 'text' | 'fontSize' | 'color'>>
  & Partial<Pick<NotificationImageBlock, 'url' | 'alt' | 'width' | 'height'>>;

function blockId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newTextBlock(): NotificationTextBlock {
  return { id: blockId(), type: 'text', text: '', fontSize: 14, color: '' };
}

function formatPublishedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function NotificationBody({ item, isDark }: { item: SystemNotification; isDark: boolean }) {
  const blocks = item.contentBlocks?.length
    ? item.contentBlocks
    : [{ id: `${item.id}-legacy`, type: 'text' as const, text: item.content, fontSize: 14, color: '' }];
  return (
    <div className="mt-3 space-y-3">
      {blocks.map((block) => block.type === 'text' ? (
        <div
          key={block.id}
          className={`whitespace-pre-wrap break-words ${isDark ? 'text-white/75' : 'text-zinc-700'}`}
          style={{ fontSize: `${block.fontSize}px`, color: block.color || undefined, lineHeight: 1.7 }}
        >
          {block.text}
        </div>
      ) : (
        <img
          key={block.id}
          src={block.url}
          alt={block.alt || '通知图片'}
          className="max-h-[520px] max-w-full rounded-lg border border-black/10 object-contain"
          loading="lazy"
        />
      ))}
    </div>
  );
}

export default function NotificationCenterModal({
  open,
  canManage,
  onClose,
  onNotificationsChanged,
}: NotificationCenterModalProps) {
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const localImageInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [title, setTitle] = useState('');
  const [contentBlocks, setContentBlocks] = useState<NotificationContentBlock[]>([newTextBlock()]);
  const [drafts, setDrafts] = useState<NotificationDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState('');
  const [draftWorking, setDraftWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<GenerationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');
  const [importingHistoryId, setImportingHistoryId] = useState('');

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === 'active' && !item.read).length,
    [items],
  );
  const totalTextLength = useMemo(
    () => contentBlocks.reduce((sum, block) => sum + (block.type === 'text' ? block.text.length : 0), 0),
    [contentBlocks],
  );
  const imageCount = useMemo(
    () => contentBlocks.filter((block) => block.type === 'image').length,
    [contentBlocks],
  );
  const hasContent = contentBlocks.some((block) => block.type === 'image' || block.text.trim());

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [next, nextDrafts] = await Promise.all([
        api.getNotifications(canManage),
        canManage ? api.getNotificationDrafts() : Promise.resolve([]),
      ]);
      setItems(next);
      setDrafts(nextDrafts);
      onNotificationsChanged(next);
    } catch (error: any) {
      setMessage(error?.message || '读取通知失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, canManage]);

  if (!open) return null;

  const patchBlock = (id: string, patch: NotificationBlockPatch) => {
    setContentBlocks((current) => current.map((block) => (
      block.id === id ? { ...block, ...patch } as NotificationContentBlock : block
    )));
  };

  const removeBlock = (id: string) => {
    setContentBlocks((current) => {
      const next = current.filter((block) => block.id !== id);
      return next.length > 0 ? next : [newTextBlock()];
    });
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    setContentBlocks((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const resetEditor = () => {
    setActiveDraftId('');
    setTitle('');
    setContentBlocks([newTextBlock()]);
  };

  const selectDraft = (id: string) => {
    if (!id) {
      resetEditor();
      return;
    }
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return;
    setActiveDraftId(draft.id);
    setTitle(draft.title);
    setContentBlocks(draft.contentBlocks.length > 0
      ? draft.contentBlocks.map((block) => ({ ...block, id: block.id || blockId() }))
      : [newTextBlock()]);
    setMessage(`已打开草稿“${draft.title || '未命名草稿'}”`);
  };

  const saveDraft = async () => {
    if (!title.trim() && !hasContent) {
      setMessage('草稿标题和内容不能同时为空');
      return;
    }
    if (totalTextLength > MAX_TEXT_LENGTH) {
      setMessage(`通知文本不能超过 ${MAX_TEXT_LENGTH} 字`);
      return;
    }
    setDraftWorking(true);
    setMessage('');
    try {
      const saved = await api.saveNotificationDraft({
        id: activeDraftId || undefined,
        title: title.trim(),
        contentBlocks,
      });
      setActiveDraftId(saved.id);
      setDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)]);
      setMessage(activeDraftId ? '草稿已更新' : '草稿已保存');
    } catch (error: any) {
      setMessage(error?.message || '保存草稿失败');
    } finally {
      setDraftWorking(false);
    }
  };

  const deleteDraft = async () => {
    if (!activeDraftId) return;
    const draft = drafts.find((item) => item.id === activeDraftId);
    if (!window.confirm(`确定删除草稿“${draft?.title || '未命名草稿'}”吗？`)) return;
    setDraftWorking(true);
    try {
      await api.deleteNotificationDraft(activeDraftId);
      setDrafts((current) => current.filter((item) => item.id !== activeDraftId));
      resetEditor();
      setMessage('草稿已删除');
    } catch (error: any) {
      setMessage(error?.message || '删除草稿失败');
    } finally {
      setDraftWorking(false);
    }
  };

  const appendUploadedImage = async (blob: Blob, filename: string, alt: string) => {
    const asset = await api.uploadNotificationImage(blob, filename);
    setContentBlocks((current) => [
      ...current,
      {
        id: blockId(),
        type: 'image',
        url: asset.url,
        alt: alt || '通知图片',
        width: asset.width,
        height: asset.height,
      },
    ]);
  };

  const uploadLocalImage = async (file: File) => {
    if (imageCount >= MAX_IMAGES) {
      setMessage(`每条通知最多插入 ${MAX_IMAGES} 张图片`);
      return;
    }
    setUploadingImage(true);
    setMessage('');
    try {
      await appendUploadedImage(file, file.name, file.name.replace(/\.[^.]+$/, '') || '通知图片');
      setMessage('图片已上传并插入正文');
    } catch (error: any) {
      setMessage(error?.message || '上传图片失败');
    } finally {
      setUploadingImage(false);
      if (localImageInputRef.current) localImageInputRef.current.value = '';
    }
  };

  const loadHistoryPage = async (offset: number) => {
    setHistoryLoading(true);
    setHistoryMessage('');
    try {
      const result = await api.getGenerationHistoryItems({ kind: 'image', limit: 60, offset });
      if (!result.success) throw new Error(result.error || '读取历史生成失败');
      const next = result.data || [];
      setHistoryItems((current) => offset === 0
        ? next
        : [...current, ...next.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setHistoryHasMore(next.length === 60);
    } catch (error: any) {
      setHistoryMessage(error?.message || '读取历史生成失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = async () => {
    if (imageCount >= MAX_IMAGES) {
      setMessage(`每条通知最多插入 ${MAX_IMAGES} 张图片`);
      return;
    }
    setHistoryOpen(true);
    setHistoryItems([]);
    setHistoryHasMore(false);
    await loadHistoryPage(0);
  };

  const importHistoryImage = async (item: GenerationHistoryItem) => {
    if (imageCount >= MAX_IMAGES) {
      setHistoryMessage(`每条通知最多插入 ${MAX_IMAGES} 张图片`);
      return;
    }
    setImportingHistoryId(item.id);
    setHistoryMessage('');
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`读取历史图片失败：HTTP ${response.status}`);
      const blob = await response.blob();
      await appendUploadedImage(blob, item.fileName || `${item.id}.png`, item.title || item.fileName || '历史生成图片');
      setHistoryMessage('图片已复制到通知资源并插入正文');
    } catch (error: any) {
      setHistoryMessage(error?.message || '插入历史图片失败');
    } finally {
      setImportingHistoryId('');
    }
  };

  const publish = async () => {
    const normalizedTitle = title.trim();
    const normalizedBlocks = contentBlocks
      .map((block) => block.type === 'text' ? { ...block, text: block.text.trim() } : block)
      .filter((block) => block.type === 'image' || block.text.length > 0);
    if (!normalizedTitle || normalizedBlocks.length === 0) {
      setMessage('请填写通知标题和内容');
      return;
    }
    if (totalTextLength > MAX_TEXT_LENGTH) {
      setMessage(`通知文本不能超过 ${MAX_TEXT_LENGTH} 字`);
      return;
    }
    setWorking(true);
    setMessage('');
    try {
      await api.publishNotification({ title: normalizedTitle, contentBlocks: normalizedBlocks, draftId: activeDraftId || undefined });
      const publishedDraftId = activeDraftId;
      resetEditor();
      if (publishedDraftId) setDrafts((current) => current.filter((draft) => draft.id !== publishedDraftId));
      await load();
      setMessage('通知已发布，用户下次打开或刷新画布时将看到此消息');
    } catch (error: any) {
      setMessage(error?.message || '发布通知失败');
    } finally {
      setWorking(false);
    }
  };

  const markRead = async (id: string) => {
    setWorking(true);
    try {
      await api.markNotificationRead(id);
      const next = items.map((item) => (item.id === id ? { ...item, read: true } : item));
      setItems(next);
      onNotificationsChanged(next);
    } catch (error: any) {
      setMessage(error?.message || '更新通知状态失败');
    } finally {
      setWorking(false);
    }
  };

  const markAllRead = async () => {
    setWorking(true);
    try {
      await api.markAllNotificationsRead();
      const next = items.map((item) => (item.status === 'active' ? { ...item, read: true } : item));
      setItems(next);
      onNotificationsChanged(next);
    } catch (error: any) {
      setMessage(error?.message || '更新通知状态失败');
    } finally {
      setWorking(false);
    }
  };

  const archive = async (item: SystemNotification) => {
    if (!window.confirm(`确定撤回通知“${item.title}”吗？撤回后普通用户将不再看到它。`)) return;
    setWorking(true);
    try {
      await api.archiveNotification(item.id);
      await load();
    } catch (error: any) {
      setMessage(error?.message || '撤回通知失败');
    } finally {
      setWorking(false);
    }
  };

  const panelCls = isPixel
    ? 'px-card'
    : `rounded-xl border shadow-2xl ${isDark ? 'border-white/10 bg-zinc-950 text-white' : 'border-black/10 bg-white text-zinc-900'}`;
  const inputCls = isPixel
    ? 'px-input'
    : `rounded-md border px-3 py-2 text-sm outline-none transition-colors ${isDark ? 'border-white/10 bg-white/5 text-white focus:border-sky-400/60' : 'border-black/10 bg-black/[0.03] focus:border-sky-500/50'}`;
  const buttonCls = isPixel
    ? 'px-btn px-btn--sm'
    : `inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`;

  return (
    <>
      <div
        className={`fixed inset-0 z-[95] flex items-center justify-center ${isPixel ? 'px-modal-mask' : 'bg-black/60 p-4'}`}
        onMouseDown={onClose}
        role="presentation"
      >
        <div
          className={`${panelCls} flex max-h-[min(900px,calc(100vh-32px))] w-[min(900px,calc(100vw-32px))] flex-col overflow-hidden`}
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-center-title"
        >
          <header className={`flex items-center gap-3 px-5 py-4 ${isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${isDark ? 'bg-sky-400/15 text-sky-300' : 'bg-sky-50 text-sky-600'}`}>
              <Bell size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="notification-center-title" className="text-sm font-bold">系统通知</h2>
              <p className={`text-[11px] ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>
                {unreadCount > 0 ? `${unreadCount} 条未读消息` : '暂无未读消息'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button className={buttonCls} type="button" onClick={markAllRead} disabled={working}>
                <CheckCheck size={14} /> 全部已读
              </button>
            )}
            <button className={buttonCls} type="button" onClick={onClose} aria-label="关闭通知窗口">
              <X size={14} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {canManage && (
              <section className={`mb-5 rounded-lg border p-4 ${isDark ? 'border-sky-400/20 bg-sky-400/[0.06]' : 'border-sky-200 bg-sky-50/70'}`}>
                <div className="mb-3">
                  <div className="text-sm font-semibold">发布通知</div>
                  <div className={`mt-0.5 text-[11px] ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>文字段可分别设置字号和颜色；上传及历史图片都会复制到服务器，确保所有用户可见。</div>
                </div>
                <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 ${isDark ? 'border-white/10 bg-black/15' : 'border-black/10 bg-white'}`}>
                  <span className="text-xs font-semibold">草稿</span>
                  <select
                    className={`${inputCls} min-w-48 flex-1 !py-1.5 text-xs`}
                    value={activeDraftId}
                    onChange={(event) => selectDraft(event.target.value)}
                  >
                    <option value="">新建通知（未保存）</option>
                    {drafts.map((draft) => (
                      <option key={draft.id} value={draft.id}>
                        {draft.title || '未命名草稿'} · {formatPublishedAt(draft.updatedAt)}
                      </option>
                    ))}
                  </select>
                  <button className={buttonCls} type="button" onClick={resetEditor} disabled={draftWorking}>
                    <Plus size={13} /> 新建
                  </button>
                  <button className={buttonCls} type="button" onClick={() => void saveDraft()} disabled={draftWorking || uploadingImage || (!title.trim() && !hasContent) || totalTextLength > MAX_TEXT_LENGTH}>
                    {draftWorking ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存草稿
                  </button>
                  {activeDraftId && (
                    <button className={buttonCls} type="button" onClick={() => void deleteDraft()} disabled={draftWorking}>
                      <Trash2 size={13} /> 删除草稿
                    </button>
                  )}
                </div>
                <input
                  className={`${inputCls} mb-3 w-full`}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={100}
                  placeholder="通知标题"
                />

                <div className={`overflow-hidden rounded-lg border ${isDark ? 'border-white/10 bg-black/15' : 'border-black/10 bg-white'}`}>
                  <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
                    <span className="mr-auto text-xs font-semibold">通知正文</span>
                    <button className={buttonCls} type="button" onClick={() => setContentBlocks((current) => [...current, newTextBlock()])}>
                      <Plus size={13} /> 添加文本段
                    </button>
                    <input
                      ref={localImageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadLocalImage(file);
                      }}
                    />
                    <button className={buttonCls} type="button" onClick={() => localImageInputRef.current?.click()} disabled={uploadingImage || imageCount >= MAX_IMAGES}>
                      {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} 本地图像
                    </button>
                    <button className={buttonCls} type="button" onClick={() => void openHistory()} disabled={imageCount >= MAX_IMAGES}>
                      <History size={13} /> 历史生成
                    </button>
                  </div>

                  <div className="space-y-3 p-3">
                    {contentBlocks.map((block, index) => (
                      <div key={block.id} className={`rounded-md border p-3 ${isDark ? 'border-white/10 bg-white/[0.025]' : 'border-black/10 bg-black/[0.015]'}`}>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-semibold ${isDark ? 'text-white/45' : 'text-zinc-400'}`}>
                            {block.type === 'text' ? `文本段 ${index + 1}` : `图片 ${index + 1}`}
                          </span>
                          {block.type === 'text' && (
                            <>
                              <select className={`${inputCls} !px-2 !py-1 text-xs`} value={block.fontSize} onChange={(event) => patchBlock(block.id, { fontSize: Number(event.target.value) })}>
                                {FONT_SIZES.map((size) => <option key={size} value={size}>{size}px</option>)}
                              </select>
                              <select className={`${inputCls} !px-2 !py-1 text-xs`} value={block.color} onChange={(event) => patchBlock(block.id, { color: event.target.value })}>
                                {TEXT_COLORS.map((color) => <option key={color.value || 'default'} value={color.value}>{color.label}</option>)}
                              </select>
                              <input
                                type="color"
                                className="h-7 w-8 cursor-pointer rounded border border-black/15 bg-transparent p-0.5"
                                value={block.color || '#0284c7'}
                                onChange={(event) => patchBlock(block.id, { color: event.target.value })}
                                title="自定义文字颜色"
                              />
                            </>
                          )}
                          <span className="flex-1" />
                          <button className={buttonCls} type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} title="上移"><ArrowUp size={12} /></button>
                          <button className={buttonCls} type="button" onClick={() => moveBlock(index, 1)} disabled={index === contentBlocks.length - 1} title="下移"><ArrowDown size={12} /></button>
                          <button className={buttonCls} type="button" onClick={() => removeBlock(block.id)} title="删除"><Trash2 size={12} /></button>
                        </div>
                        {block.type === 'text' ? (
                          <textarea
                            className={`${inputCls} min-h-24 w-full resize-y`}
                            style={{ fontSize: `${block.fontSize}px`, color: block.color || undefined, lineHeight: 1.6 }}
                            value={block.text}
                            onChange={(event) => patchBlock(block.id, { text: event.target.value })}
                            placeholder="请输入通知内容"
                          />
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                            <img src={block.url} alt={block.alt} className="max-h-40 w-full rounded-md object-contain" />
                            <div>
                              <label className="mb-1 block text-[11px] opacity-60">图片说明</label>
                              <input className={`${inputCls} w-full`} value={block.alt} maxLength={200} onChange={(event) => patchBlock(block.id, { alt: event.target.value })} />
                              <div className="mt-2 text-[10px] opacity-40">{block.width} × {block.height}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={`text-[10px] ${totalTextLength > MAX_TEXT_LENGTH ? 'text-red-500' : isDark ? 'text-white/35' : 'text-zinc-400'}`}>
                    文本 {totalTextLength}/{MAX_TEXT_LENGTH} · 图片 {imageCount}/{MAX_IMAGES}
                  </span>
                  <button
                    className={isPixel ? 'px-btn px-btn--sm px-btn--mint' : 'inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50'}
                    type="button"
                    onClick={publish}
                    disabled={working || draftWorking || uploadingImage || !!importingHistoryId || !title.trim() || !hasContent || totalTextLength > MAX_TEXT_LENGTH}
                  >
                    {working ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    发布通知
                  </button>
                </div>
              </section>
            )}

            {message && (
              <div className={`mb-4 rounded-md px-3 py-2 text-xs ${isDark ? 'bg-white/10 text-white/70' : 'bg-black/5 text-zinc-600'}`}>
                {message}
              </div>
            )}

            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold">通知记录</h3>
              {loading && <Loader2 size={14} className="animate-spin opacity-60" />}
            </div>
            <div className="space-y-3">
              {!loading && items.length === 0 && (
                <div className={`rounded-lg border border-dashed px-4 py-10 text-center text-sm ${isDark ? 'border-white/10 text-white/40' : 'border-black/10 text-zinc-400'}`}>
                  暂无系统通知
                </div>
              )}
              {items.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-lg border p-4 ${
                    item.status === 'archived'
                      ? isDark ? 'border-white/5 bg-white/[0.02] opacity-55' : 'border-black/5 bg-black/[0.02] opacity-55'
                      : !item.read
                        ? isDark ? 'border-sky-400/35 bg-sky-400/[0.08]' : 'border-sky-200 bg-sky-50/60'
                        : isDark ? 'border-white/10 bg-white/[0.025]' : 'border-black/10 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold">{item.title}</h4>
                        {item.status === 'archived' ? (
                          <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] opacity-70">已撤回</span>
                        ) : !item.read ? (
                          <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold text-white">未读</span>
                        ) : null}
                      </div>
                      <div className={`mt-1 text-[10px] ${isDark ? 'text-white/40' : 'text-zinc-400'}`}>
                        {formatPublishedAt(item.publishedAt)} · {item.publishedBy.name || '系统管理员'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.status === 'active' && !item.read && (
                        <button className={buttonCls} type="button" onClick={() => markRead(item.id)} disabled={working}>标为已读</button>
                      )}
                      {canManage && item.status === 'active' && (
                        <button className={buttonCls} type="button" onClick={() => archive(item)} disabled={working} title="撤回通知">
                          <Archive size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <NotificationBody item={item} isDark={isDark} />
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setHistoryOpen(false)}>
          <div className={`${panelCls} flex max-h-[min(760px,calc(100vh-32px))] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden`} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择历史生成图片">
            <header className={`flex items-center gap-3 px-4 py-3 ${isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
              <ImagePlus size={17} />
              <div className="flex-1">
                <div className="text-sm font-semibold">从历史生成插入图片</div>
                <div className="text-[10px] opacity-45">选择后会复制到通知专用目录，不受原历史文件权限或删除影响</div>
              </div>
              <button className={buttonCls} type="button" onClick={() => setHistoryOpen(false)}><X size={14} /></button>
            </header>
            {historyMessage && <div className={`mx-4 mt-3 rounded-md px-3 py-2 text-xs ${isDark ? 'bg-white/10' : 'bg-black/5'}`}>{historyMessage}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {historyLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm opacity-55"><Loader2 size={16} className="animate-spin" /> 正在读取历史图片</div>
              ) : historyItems.length === 0 ? (
                <div className="py-16 text-center text-sm opacity-45">暂无可用的历史生成图片</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {historyItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`group overflow-hidden rounded-lg border text-left transition ${isDark ? 'border-white/10 bg-white/[0.03] hover:border-sky-400/60' : 'border-black/10 bg-white hover:border-sky-400'}`}
                        onClick={() => void importHistoryImage(item)}
                        disabled={!!importingHistoryId || imageCount >= MAX_IMAGES}
                      >
                        <div className="relative aspect-square bg-black/10">
                          <img src={item.url} alt={item.title || item.fileName} className="h-full w-full object-cover" loading="lazy" />
                          {importingHistoryId === item.id && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white"><Loader2 size={20} className="animate-spin" /></span>}
                        </div>
                        <div className="truncate px-2 py-2 text-[11px] font-medium">{item.title || item.fileName}</div>
                      </button>
                    ))}
                  </div>
                  {historyHasMore && (
                    <div className="mt-4 flex justify-center">
                      <button className={buttonCls} type="button" onClick={() => void loadHistoryPage(historyItems.length)} disabled={historyLoading || !!importingHistoryId}>
                        {historyLoading && <Loader2 size={13} className="animate-spin" />} 加载更多
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
