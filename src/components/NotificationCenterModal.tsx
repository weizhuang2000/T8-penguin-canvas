import { useEffect, useMemo, useState } from 'react';
import { Archive, Bell, CheckCheck, Loader2, Send, X } from 'lucide-react';
import * as api from '../services/api';
import type { SystemNotification } from '../services/api';
import { useThemeStore } from '../stores/theme';

interface NotificationCenterModalProps {
  open: boolean;
  canManage: boolean;
  onClose: () => void;
  onNotificationsChanged: (items: SystemNotification[]) => void;
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

export default function NotificationCenterModal({
  open,
  canManage,
  onClose,
  onNotificationsChanged,
}: NotificationCenterModalProps) {
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === 'active' && !item.read).length,
    [items],
  );

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const next = await api.getNotifications(canManage);
      setItems(next);
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

  const publish = async () => {
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    if (!normalizedTitle || !normalizedContent) {
      setMessage('请填写通知标题和内容');
      return;
    }
    setWorking(true);
    setMessage('');
    try {
      await api.publishNotification({ title: normalizedTitle, content: normalizedContent });
      setTitle('');
      setContent('');
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
    <div
      className={`fixed inset-0 z-[95] flex items-center justify-center ${isPixel ? 'px-modal-mask' : 'bg-black/60 p-4'}`}
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className={`${panelCls} flex max-h-[min(820px,calc(100vh-32px))] w-[min(760px,calc(100vw-32px))] flex-col overflow-hidden`}
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
                <div className={`mt-0.5 text-[11px] ${isDark ? 'text-white/45' : 'text-zinc-500'}`}>发布后，所有用户会在下次打开或刷新画布时收到未读弹窗。</div>
              </div>
              <div className="space-y-2.5">
                <input
                  className={`${inputCls} w-full`}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={100}
                  placeholder="通知标题"
                />
                <textarea
                  className={`${inputCls} min-h-28 w-full resize-y leading-6`}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  maxLength={5000}
                  placeholder="请输入通知内容"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-[10px] ${isDark ? 'text-white/35' : 'text-zinc-400'}`}>{content.length}/5000</span>
                  <button
                    className={isPixel ? 'px-btn px-btn--sm px-btn--mint' : 'inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50'}
                    type="button"
                    onClick={publish}
                    disabled={working || !title.trim() || !content.trim()}
                  >
                    {working ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    发布通知
                  </button>
                </div>
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
                <div className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 ${isDark ? 'text-white/75' : 'text-zinc-700'}`}>
                  {item.content}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
