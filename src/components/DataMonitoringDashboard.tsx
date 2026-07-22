import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Image as ImageIcon,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import * as api from '../services/api';
import type { MonitoringModelRow, MonitoringSummary, MonitoringUserRow } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function presetRange(preset: Preset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let from = new Date(today);
  let to = new Date(today);
  to.setDate(to.getDate() + 1);
  if (preset === 'yesterday') {
    from.setDate(from.getDate() - 1);
    to = new Date(today);
  } else if (preset === '7d') from.setDate(from.getDate() - 6);
  else if (preset === '30d') from.setDate(from.getDate() - 29);
  else if (preset === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: dateInputValue(from), to: dateInputValue(new Date(to.getTime() - 1)) };
}

function rangeIso(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function formatRate(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '--';
}

function formatTime(value: number | string | null | undefined) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '--';
}

function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(name: string, rows: unknown[][]) {
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function TrendBars({ summary, kind }: { summary: Pick<MonitoringSummary, 'trend'> & { meta: Pick<MonitoringSummary['meta'], 'granularity'> }; kind: 'online' | 'generation' }) {
  const values = summary.trend.map((item) => kind === 'online' ? item.activeSeconds / 3600 : Math.max(item.imageOutputs, item.calls));
  const max = Math.max(1, ...values);
  if (!summary.trend.length) return <div className="flex h-44 items-center justify-center text-xs opacity-50">暂无趋势数据</div>;
  return (
    <div className="flex h-44 items-end gap-1.5 pt-5" aria-label={kind === 'online' ? '在线时长趋势' : '生图与调用趋势'}>
      {summary.trend.map((item, index) => {
        const value = values[index];
        const label = new Date(item.start).toLocaleString([], summary.meta.granularity === 'day'
          ? { month: 'numeric', day: 'numeric' }
          : { month: 'numeric', day: 'numeric', hour: '2-digit' });
        return (
          <div key={item.start} className="group relative flex min-w-0 flex-1 items-end justify-center gap-[2px]" title={kind === 'online'
            ? `${label} · ${formatDuration(item.activeSeconds)}`
            : `${label} · 生图 ${item.imageOutputs} · 调用 ${item.calls}`}>
            {kind === 'online' ? (
              <div className="w-full max-w-8 rounded-t bg-cyan-500/75 transition group-hover:bg-cyan-400" style={{ height: `${Math.max(3, (value / max) * 132)}px` }} />
            ) : (
              <>
                <div className="w-1/2 max-w-4 rounded-t bg-violet-500/80" style={{ height: `${Math.max(3, (item.imageOutputs / max) * 132)}px` }} />
                <div className="w-1/2 max-w-4 rounded-t bg-amber-500/80" style={{ height: `${Math.max(3, (item.calls / max) * 132)}px` }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModelMiniTable({ rows }: { rows: MonitoringModelRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--t8-border)] bg-black/[0.025] p-2">
      <table className="w-full min-w-[720px] text-left text-[11px]">
        <thead className="opacity-55"><tr><th>Provider / 模型</th><th>调用</th><th>成功</th><th>上游失败</th><th>未纳入</th><th>生图</th><th>成功率</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.provider}\u0000${row.model}`} className="border-t border-[var(--t8-border)]">
          <td className="py-2"><span className="opacity-60">{row.provider}</span> / {row.model}</td><td>{row.calls}</td><td>{row.successes}</td><td>{row.upstreamFailures}</td><td>{row.excluded}</td><td>{row.outputs}</td><td>{formatRate(row.successRate)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

export default function DataMonitoringDashboard({ open, onClose }: Props) {
  const initial = presetRange('7d');
  const [preset, setPreset] = useState<Preset>('7d');
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [userId, setUserId] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!open || !fromDate || !toDate) return;
    setLoading(true);
    setError('');
    const range = rangeIso(fromDate, toDate);
    const result = await api.getMonitoringSummary({ ...range, userId, provider, model });
    if (result.success) setSummary(result.data);
    else setError(result.error || '读取统计失败');
    setLoading(false);
  }, [fromDate, model, open, provider, toDate, userId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === 'custom') return;
    const range = presetRange(next);
    setFromDate(range.from);
    setToDate(range.to);
  };

  const allProviders = useMemo(() => Array.from(new Set([...(summary?.filters.providers || []), ...((summary?.models || []).map((item) => item.provider))])).sort(), [summary]);
  const allModels = useMemo(() => Array.from(new Set([...(summary?.filters.models || []), ...((summary?.models || []).map((item) => item.model))])).sort(), [summary]);
  const card = 'rounded-2xl border border-[var(--t8-border)] bg-[var(--t8-bg-panel)] p-4 shadow-sm';

  if (!open || typeof document === 'undefined') return null;
  const ui = (
    <div className="fixed inset-0 z-[10100] flex flex-col bg-[var(--t8-bg-app)] text-[var(--t8-text-main)]" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--t8-border)] bg-[var(--t8-bg-panel)] px-5 py-3">
        <div><div className="flex items-center gap-2 text-lg font-black"><BarChart3 className="text-cyan-500" /> 数据监控大屏</div><div className="mt-0.5 text-[11px] opacity-55">管理员专属 · 60 秒自动刷新</div></div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <select value={preset} onChange={(event) => applyPreset(event.target.value as Preset)} className="rounded-lg border border-[var(--t8-border)] bg-[var(--t8-input-bg)] px-2 py-2">
            <option value="today">今天</option><option value="yesterday">昨天</option><option value="7d">近 7 天</option><option value="30d">近 30 天</option><option value="month">本月</option><option value="custom">自定义</option>
          </select>
          <input type="date" value={fromDate} max={toDate} onChange={(event) => { setPreset('custom'); setFromDate(event.target.value); }} className="rounded-lg border border-[var(--t8-border)] bg-[var(--t8-input-bg)] px-2 py-1.5" />
          <span className="opacity-45">至</span>
          <input type="date" value={toDate} min={fromDate} onChange={(event) => { setPreset('custom'); setToDate(event.target.value); }} className="rounded-lg border border-[var(--t8-border)] bg-[var(--t8-input-bg)] px-2 py-1.5" />
          <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-[var(--t8-border)] p-2 hover:bg-black/5" title="刷新"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={onClose} className="rounded-lg border border-[var(--t8-border)] p-2 hover:bg-red-500/10" title="关闭"><X size={16} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <select value={userId} onChange={(event) => setUserId(event.target.value)} className="min-w-44 rounded-lg border border-[var(--t8-border)] bg-[var(--t8-input-bg)] px-3 py-2"><option value="">全部用户</option>{summary?.users.map((row) => <option key={row.user.id} value={row.user.id}>{row.user.name || row.user.username}</option>)}</select>
            <select value={provider} onChange={(event) => { setProvider(event.target.value); setModel(''); }} className="min-w-40 rounded-lg border border-[var(--t8-border)] bg-[var(--t8-input-bg)] px-3 py-2"><option value="">全部 Provider</option>{allProviders.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select value={model} onChange={(event) => setModel(event.target.value)} className="min-w-48 rounded-lg border border-[var(--t8-border)] bg-[var(--t8-input-bg)] px-3 py-2"><option value="">全部模型</option>{allModels.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <div className="ml-auto flex gap-2">
              <button disabled={!summary} onClick={() => summary && downloadCsv(`monitoring-users-${fromDate}-${toDate}.csv`, [['用户ID', '用户', '角色', '在线', '有效时长(秒)', '生图数', '调用数', '成功', '上游失败', '未纳入', '成功率'], ...summary.users.map((row) => [row.user.id, row.user.name, row.user.role, row.online ? '是' : '否', Math.round(row.activeSeconds), row.outputs, row.calls, row.successes, row.upstreamFailures, row.excluded, formatRate(row.successRate)])])} className="flex items-center gap-1 rounded-lg border border-[var(--t8-border)] px-3 py-2 disabled:opacity-40"><Download size={13} /> 用户 CSV</button>
              <button disabled={!summary} onClick={() => summary && downloadCsv(`monitoring-models-${fromDate}-${toDate}.csv`, [['Provider', '模型', '调用数', '成功', '上游失败', '未纳入', '生图数', '成功率'], ...summary.models.map((row) => [row.provider, row.model, row.calls, row.successes, row.upstreamFailures, row.excluded, row.outputs, formatRate(row.successRate)])])} className="flex items-center gap-1 rounded-lg border border-[var(--t8-border)] px-3 py-2 disabled:opacity-40"><Download size={13} /> 模型 CSV</button>
            </div>
          </div>

          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}
          {summary?.meta && <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-600 dark:text-amber-300">历史记录仅回填生图数量；在线时长、调用次数与成功率从 {formatTime(summary.meta.trackedFrom)} 开始统计。历史回填 {summary.meta.historyBackfilledItems} 张。</div>}

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: '当前在线', value: summary?.totals.currentOnline ?? 0, unit: '人', icon: Users, color: 'text-emerald-500' },
              { label: '有效在线时长', value: formatDuration(summary?.totals.activeSeconds ?? 0), unit: '', icon: Clock3, color: 'text-cyan-500' },
              { label: '生图数量', value: summary?.totals.outputs ?? 0, unit: '张', icon: ImageIcon, color: 'text-violet-500' },
              { label: '模型调用', value: summary?.totals.calls ?? 0, unit: '次', icon: Activity, color: 'text-amber-500' },
              { label: '模型成功率', value: formatRate(summary?.totals.successRate), unit: '', icon: BarChart3, color: 'text-sky-500' },
            ].map((item) => <div key={item.label} className={card}><div className="flex items-center justify-between text-xs opacity-55"><span>{item.label}</span><item.icon size={17} className={item.color} /></div><div className="mt-3 text-2xl font-black">{item.value}<span className="ml-1 text-xs font-medium opacity-50">{item.unit}</span></div></div>)}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={card}><div className="font-bold">有效在线时长趋势</div><TrendBars summary={summary || { trend: [], meta: { granularity: 'day' } }} kind="online" /></div>
            <div className={card}><div className="flex items-center gap-4 font-bold"><span>生图与调用趋势</span><span className="text-[10px] font-normal text-violet-500">■ 生图</span><span className="text-[10px] font-normal text-amber-500">■ 调用</span></div><TrendBars summary={summary || { trend: [], meta: { granularity: 'day' } }} kind="generation" /></div>
          </section>

          <section className={card}>
            <div className="mb-3 flex items-center justify-between"><div className="font-bold">用户统计</div><span className="text-[11px] opacity-50">{summary?.users.length || 0} 位用户</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-xs"><thead className="border-b border-[var(--t8-border)] opacity-55"><tr><th className="pb-2">用户</th><th>状态</th><th>有效时长</th><th>生图</th><th>调用</th><th>成功</th><th>上游失败</th><th>未纳入</th><th>成功率</th><th>最后活跃</th></tr></thead><tbody>
              {(summary?.users || []).map((row: MonitoringUserRow) => { const expanded = expandedUsers.has(row.user.id); return [
                <tr key={row.user.id} className="border-b border-[var(--t8-border)] hover:bg-black/[0.025]"><td className="py-3"><button className="flex items-center gap-2 text-left" onClick={() => setExpandedUsers((current) => { const next = new Set(current); if (expanded) next.delete(row.user.id); else next.add(row.user.id); return next; })}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span><b>{row.user.name || row.user.username}</b><small className="block opacity-45">{row.user.role} · {row.user.id}</small></span></button></td><td>{row.online ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-500">在线</span> : <span className="opacity-45">离线</span>}</td><td>{formatDuration(row.activeSeconds)}</td><td>{row.outputs}</td><td>{row.calls}</td><td>{row.successes}</td><td>{row.upstreamFailures}</td><td>{row.excluded}</td><td>{formatRate(row.successRate)}</td><td>{formatTime(row.lastActiveAt)}</td></tr>,
                expanded && <tr key={`${row.user.id}-models`}><td colSpan={10} className="p-3"><ModelMiniTable rows={row.models} /></td></tr>,
              ]; })}
              {!loading && summary?.users.length === 0 && <tr><td colSpan={10} className="py-10 text-center opacity-45">当前条件下暂无用户数据</td></tr>}
            </tbody></table></div>
          </section>

          <section className={card}>
            <div className="mb-3 font-bold">模型统计</div>
            <ModelMiniTable rows={summary?.models || []} />
          </section>
        </div>
      </main>
    </div>
  );
  return createPortal(ui, document.body);
}
