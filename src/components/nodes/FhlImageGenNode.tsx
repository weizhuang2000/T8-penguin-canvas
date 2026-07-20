import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Download, Images, Loader2, Play, RotateCcw, Square, Upload, X } from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { uploadFile } from '../../services/generation';
import { cancelFhlJob, createFhlJob, getFhlConfig, getFhlJob, resumeFhlJob } from '../../services/fhlImage';
import type { FhlConfigSummary, FhlJobMode, FhlJobRequest, FhlJobSnapshot } from '../../types/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useThemeStore } from '../../stores/theme';
import PromptTextarea from '../PromptTextarea';
import SmartImage from '../SmartImage';
import { useCanvasRuntime } from './canvasRuntimeContext';
import NodeHelpButton from './NodeHelpButton';
import { useUpdateNodeData } from './useUpdateNodeData';

const GENERATE_2K = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '2:1', '1:2', '7:4', '4:7'];
const EDIT_2K = ['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '7:4', '4:7'];
const FOUR_K = ['1:1', '3:2', '2:3', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '7:4', '4:7'];
const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled', 'interrupted']);

type Panel = 'quick' | 'batch' | 'batch-edit' | 'workflow';

function unique(values: string[]) {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)));
}

function imageValues(data: any): string[] {
  const out: string[] = [];
  if (typeof data?.imageUrl === 'string') out.push(data.imageUrl);
  for (const field of ['imageUrls', 'urls', 'generatedImages'] as const) {
    if (Array.isArray(data?.[field])) out.push(...data[field].filter((item: unknown) => typeof item === 'string'));
  }
  if (Array.isArray(data?.materialSetItems)) {
    data.materialSetItems.forEach((item: any) => {
      if (item?.kind === 'image' && typeof (item.url || item.dataUrl) === 'string') out.push(item.url || item.dataUrl);
    });
  }
  return unique(out);
}

function textValues(data: any): string[] {
  for (const field of ['textSegments', 'segments', 'texts'] as const) {
    if (Array.isArray(data?.[field])) return unique(data[field].filter((item: unknown) => typeof item === 'string'));
  }
  return unique([data?.outputText, data?.reply, data?.promptResolved, data?.prompt, data?.text].filter((item) => typeof item === 'string'));
}

function useHandleInputs(nodeId: string) {
  const connections = useNodeConnections({ id: nodeId, handleType: 'target' });
  const sourceIds = useMemo(() => unique(connections.map((item) => item.source)), [connections]);
  const sourceNodes = useNodesData(sourceIds);
  return useMemo(() => {
    const nodeMap = new Map((Array.isArray(sourceNodes) ? sourceNodes : []).filter(Boolean).map((node) => [node!.id, node]));
    const texts: string[] = [];
    const fixed: string[] = [];
    const items: string[] = [];
    for (const connection of connections) {
      const node = nodeMap.get(connection.source);
      if (!node) continue;
      const handle = String((connection as any).targetHandle || '');
      if (handle === 'text') texts.push(...textValues(node.data));
      if (handle === 'fixed') fixed.push(...imageValues(node.data));
      if (handle === 'items') items.push(...imageValues(node.data));
    }
    return { texts: unique(texts), fixed: unique(fixed), items: unique(items) };
  }, [connections, sourceNodes]);
}

function splitPrompts(value: string) {
  return unique(String(value || '').split(/\r?\n/).map((item) => item.trim())).slice(0, 20);
}

function splitTemplates(value: string) {
  return String(value || '').split(/\n\s*---+\s*\n/g).map((prompt, index) => ({ key: `scene_${index + 1}`, label: `场景 ${index + 1}`, prompt: prompt.trim() })).filter((item) => item.prompt).slice(0, 20);
}

function summaryText(job: FhlJobSnapshot) {
  return [`FHL Images · ${job.mode}`, `状态：${job.status}`, `完成：${job.success}/${job.total}`, `失败：${job.failed}`, `任务：${job.id}`].join('\n');
}

const FhlImageGenNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const { loadedCanvasId } = useCanvasRuntime();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const upstream = useHandleInputs(id);
  const [job, setJob] = useState<FhlJobSnapshot | null>(null);
  const [config, setConfig] = useState<FhlConfigSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const pollVersionRef = useRef(0);
  const fixedInputRef = useRef<HTMLInputElement>(null);
  const itemsInputRef = useRef<HTMLInputElement>(null);

  const panel: Panel = ['batch', 'batch-edit', 'workflow'].includes(d.fhlPanel) ? d.fhlPanel : 'quick';
  const quality: '2K' | '4K' = d.fhlQuality === '4K' ? '4K' : '2K';
  const outputFormat: 'jpg' | 'png' = d.fhlOutputFormat === 'png' ? 'png' : 'jpg';
  const quickKind = d.fhlQuickKind === 'repeat' ? 'repeat' : 'count';
  const localFixed: string[] = Array.isArray(d.fhlFixedImages) ? d.fhlFixedImages : [];
  const localItems: string[] = Array.isArray(d.fhlItemImages) ? d.fhlItemImages : [];
  const fixedImages = useMemo(() => unique([...upstream.fixed, ...localFixed]).slice(0, 10), [localFixed, upstream.fixed]);
  const itemImages = useMemo(() => unique([...upstream.items, ...localItems]), [localItems, upstream.items]);
  const isEdit = panel === 'batch-edit' || panel === 'workflow' || (panel === 'quick' && fixedImages.length > 0);
  const aspectOptions = quality === '4K' ? FOUR_K : (isEdit ? EDIT_2K : GENERATE_2K);
  const aspect = aspectOptions.includes(String(d.fhlAspect || '1:1')) ? String(d.fhlAspect || '1:1') : aspectOptions[0];
  const prompt = String(d.fhlPrompt || '').trim() || upstream.texts.join('\n\n');
  const batchPrompts = upstream.texts.length ? upstream.texts.slice(0, 20) : splitPrompts(String(d.fhlBatchPrompts || ''));
  const terminalJob = job && TERMINAL.has(job.status);

  useEffect(() => {
    void getFhlConfig().then(setConfig).catch((error) => update({ fhlConfigError: error?.message || 'FHL 配置加载失败' }));
    const onConfigUpdated = (event: Event) => setConfig((event as CustomEvent<FhlConfigSummary>).detail);
    window.addEventListener('t8:fhl-config-updated', onConfigUpdated);
    return () => window.removeEventListener('t8:fhl-config-updated', onConfigUpdated);
  }, [update]);

  useEffect(() => {
    if (d.fhlAspect && d.fhlAspect !== aspect) update({ fhlAspect: aspect });
  }, [aspect, d.fhlAspect, update]);

  useEffect(() => {
    const jobId = String(d.fhlJobId || '');
    if (!jobId) return;
    void getFhlJob(jobId).then(setJob).catch(() => undefined);
  }, [d.fhlJobId]);

  useEffect(() => () => { pollVersionRef.current += 1; }, []);

  const pollJob = useCallback(async (jobId: string) => {
    const version = ++pollVersionRef.current;
    setBusy(true);
    try {
      while (version === pollVersionRef.current) {
        const next = await getFhlJob(jobId);
        setJob(next);
        update({
          fhlJobId: next.id,
          fhlLastStatus: next.status,
          fhlLastProgress: next.progress,
          fhlLastSummary: summaryText(next),
          status: TERMINAL.has(next.status) ? (next.success > 0 ? 'success' : 'error') : 'generating',
          ...(TERMINAL.has(next.status) ? {
            imageUrl: next.outputUrls[0] || '',
            imageUrls: next.outputUrls,
            outputText: summaryText(next),
            error: next.success > 0 ? '' : (next.error || next.tasks.find((item) => item.error)?.error || 'FHL 任务失败'),
          } : {}),
        });
        if (TERMINAL.has(next.status)) {
          if (next.success > 0) taskCompletionSound.notifyComplete(id, 'fhl-image-gen');
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      if (version === pollVersionRef.current) setBusy(false);
    }
  }, [id, update]);

  const buildRequest = useCallback((): FhlJobRequest => {
    let mode: FhlJobMode = 'generate';
    if (panel === 'quick' && fixedImages.length) mode = 'edit';
    if (panel === 'batch') mode = 'batch-generate';
    if (panel === 'batch-edit') mode = 'batch-edit';
    if (panel === 'workflow') mode = 'workflow-batch-edit';
    const preset = d.fhlPreset === 'nail-tryon' ? 'nail-tryon' : '';
    return {
      mode,
      prompt,
      prompts: batchPrompts,
      fixedImages,
      itemImages: panel === 'batch-edit' ? itemImages.slice(0, 10) : itemImages,
      templates: splitTemplates(String(d.fhlTemplatesText || '')),
      preset,
      quality,
      outputFormat,
      aspect: preset ? '9:16' : aspect,
      count: mode === 'edit' ? Math.max(1, Math.min(4, Number(d.fhlCount) || 1)) : Math.max(1, Math.min(9, Number(d.fhlCount) || 1)),
      repeat: panel === 'quick' && mode === 'generate' && quickKind === 'repeat' ? Math.max(1, Math.min(50, Number(d.fhlRepeat) || 10)) : undefined,
      concurrency: Math.max(1, Math.min(10, Number(d.fhlConcurrency) || 1)),
      repairPasses: Math.max(0, Math.min(5, Number(d.fhlRepairPasses) || 2)),
      limit: Math.max(1, Number(d.fhlLimit) || Math.min(100, Math.max(1, itemImages.length))),
      adaptive: d.fhlAdaptive !== false,
      resize: Boolean(d.fhlResize),
      dryRun: Boolean(d.fhlDryRun),
      historyContext: { canvasId: loadedCanvasId, sourceNodeId: id, sourceNodeType: 'fhl-image-gen', nodeTitle: String(d.label || 'FHL 生图'), prompt },
    };
  }, [aspect, batchPrompts, d.fhlAdaptive, d.fhlConcurrency, d.fhlCount, d.fhlDryRun, d.fhlLimit, d.fhlPreset, d.fhlRepeat, d.fhlRepairPasses, d.fhlResize, d.fhlTemplatesText, d.label, fixedImages, id, itemImages, loadedCanvasId, outputFormat, panel, prompt, quality, quickKind]);

  const handleRun = useCallback(async () => {
    if (busy) return;
    const request = buildRequest();
    if ((request.mode === 'generate' || request.mode === 'edit' || request.mode === 'batch-edit') && !request.prompt) {
      update({ status: 'error', error: '请输入提示词，或连接上游文本节点。' }); return;
    }
    if (request.mode === 'batch-generate' && !request.prompts?.length) {
      update({ status: 'error', error: '请逐行填写批量提示词，或连接上游文本素材。' }); return;
    }
    if (request.mode === 'batch-edit' && !request.itemImages?.length) {
      update({ status: 'error', error: '请向 items 端口连接变量图片素材集。' }); return;
    }
    if (request.mode === 'workflow-batch-edit' && (!request.fixedImages?.length || !request.itemImages?.length)) {
      update({ status: 'error', error: '工作流批改需要 fixed 固定参考图和 items 变量图片。' }); return;
    }
    taskCompletionSound.primeAudio();
    update({ status: 'generating', error: '', fhlLastSummary: '正在创建 FHL 任务…' });
    try {
      const created = await createFhlJob(request);
      setJob(created); update({ fhlJobId: created.id });
      logBus.info(`FHL 任务已创建：${created.id}`, `fhl:${id}`);
      await pollJob(created.id);
    } catch (error: any) {
      setBusy(false); update({ status: 'error', error: error?.message || 'FHL 任务创建失败' });
    }
  }, [buildRequest, busy, id, pollJob, update]);

  useRunTrigger(id, handleRun, 'fhl-image-gen');

  const handleStop = useCallback(async () => {
    const jobId = job?.id || String(d.fhlJobId || '');
    if (!jobId) return;
    pollVersionRef.current += 1;
    try { const stopped = await cancelFhlJob(jobId); setJob(stopped); update({ status: 'idle', fhlLastStatus: stopped.status, fhlLastSummary: 'FHL 任务已停止' }); }
    catch (error: any) { update({ error: error?.message || '停止失败' }); }
    finally { setBusy(false); }
  }, [d.fhlJobId, job?.id, update]);

  const handleResume = useCallback(async () => {
    const jobId = job?.id || String(d.fhlJobId || '');
    if (!jobId) return;
    try { await resumeFhlJob(jobId); await pollJob(jobId); }
    catch (error: any) { update({ status: 'error', error: error?.message || '恢复失败' }); }
  }, [d.fhlJobId, job?.id, pollJob, update]);

  const uploadImages = useCallback(async (files: FileList | null, target: 'fixed' | 'items') => {
    if (!files?.length) return;
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) urls.push((await uploadFile(file)).url);
      if (target === 'fixed') update({ fhlFixedImages: unique([...localFixed, ...urls]).slice(0, 10) });
      else update({ fhlItemImages: unique([...localItems, ...urls]) });
    } catch (error: any) { update({ error: error?.message || '图片上传失败' }); }
  }, [localFixed, localItems, update]);

  const rootStyle = { width: 520, color: isDark ? '#e2e8f0' : '#172033', background: isDark ? 'rgba(5,15,28,.96)' : 'rgba(255,255,255,.98)', border: `1px solid ${selected ? '#22d3ee' : (isDark ? '#24445a' : '#cbd5e1')}`, borderRadius: 16, boxShadow: selected ? '0 0 0 2px rgba(34,211,238,.18)' : '0 14px 40px rgba(15,23,42,.18)' };
  const fieldStyle = { color: isDark ? '#e2e8f0' : '#172033', background: isDark ? '#071827' : '#f8fafc', border: `1px solid ${isDark ? '#29485c' : '#cbd5e1'}`, borderRadius: 8 };
  const hint = isDark ? '#94a3b8' : '#64748b';

  return (
    <div className="relative p-4 text-sm" style={rootStyle} data-fhl-image-gen-root>
      <Handle type="target" id="text" position={Position.Left} style={{ top: 120, background: PORT_COLOR.text }} />
      <Handle type="target" id="fixed" position={Position.Left} style={{ top: 170, background: PORT_COLOR.image }} />
      <Handle type="target" id="items" position={Position.Left} style={{ top: 220, background: PORT_COLOR.image }} />
      <Handle type="source" id="image" position={Position.Right} style={{ top: 150, background: PORT_COLOR.image }} />
      <Handle type="source" id="text" position={Position.Right} style={{ top: 200, background: PORT_COLOR.text }} />

      <header className="flex cursor-grab items-center gap-3 pb-3 active:cursor-grabbing">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-slate-950"><Images size={21} /></div>
        <div className="min-w-0 flex-1"><div className="font-black">FHL 生图</div><div className="text-[11px]" style={{ color: hint }}>Images API · gpt-image-2 · worker {config?.enabledWorkerCount || 0}/{config?.workerCount || 0}</div></div>
        <NodeHelpButton nodeType="fhl-image-gen" title="查看 FHL 生图节点帮助" size={16} />
        {busy ? <Loader2 size={18} className="animate-spin text-cyan-400" /> : null}
      </header>

      <div className="nowheel max-h-[760px] space-y-3 overflow-y-auto pr-1" onWheelCapture={(event) => event.stopPropagation()}>
        <div className="grid grid-cols-4 gap-1 rounded-xl p-1" style={{ background: isDark ? '#071827' : '#eef2f7' }}>
          {([['quick', '快速'], ['batch', '批量提示词'], ['batch-edit', '逐图编辑'], ['workflow', '工作流']] as Array<[Panel, string]>).map(([value, label]) => (
            <button key={value} type="button" className="nodrag rounded-lg px-1 py-2 text-[11px] font-bold" style={{ background: panel === value ? '#06b6d4' : 'transparent', color: panel === value ? '#001018' : hint }} onClick={() => update({ fhlPanel: value })}>{label}</button>
          ))}
        </div>

        {(panel === 'quick' || panel === 'batch-edit') && (
          <PromptTextarea
            title="FHL 提示词"
            className="nodrag nowheel h-28 w-full resize-none p-2 text-xs outline-none"
            style={fieldStyle}
            value={String(d.fhlPrompt || '')}
            placeholder={upstream.texts.length ? `已接入 ${upstream.texts.length} 段上游文本；留空时自动使用` : '输入生图或编辑提示词'}
            onValueChange={(value) => update({ fhlPrompt: value })}
          />
        )}
        {panel === 'batch' && (
          <PromptTextarea
            title="FHL 批量提示词"
            className="nodrag nowheel h-32 w-full resize-none p-2 text-xs outline-none"
            style={fieldStyle}
            value={String(d.fhlBatchPrompts || '')}
            placeholder="每行一条提示词，最多 20 条；连接上游文本时优先使用上游"
            onValueChange={(value) => update({ fhlBatchPrompts: value })}
          />
        )}
        {panel === 'workflow' && (
          <>
            <label className="grid gap-1 text-[11px]" style={{ color: hint }}>工作流预设
              <select className="nodrag p-2 text-xs" style={fieldStyle} value={d.fhlPreset === 'nail-tryon' ? 'nail-tryon' : ''} onChange={(event) => update({ fhlPreset: event.target.value, ...(event.target.value === 'nail-tryon' ? { fhlAspect: '9:16' } : {}) })}>
                <option value="">通用模板</option><option value="nail-tryon">nail-tryon 美甲试戴</option>
              </select>
            </label>
            {d.fhlPreset !== 'nail-tryon' && (
              <PromptTextarea
                title="FHL 工作流场景模板"
                className="nodrag nowheel h-36 w-full resize-none p-2 text-xs outline-none"
                style={fieldStyle}
                value={String(d.fhlTemplatesText || '')}
                placeholder="输入场景模板；多个模板用单独一行 --- 分隔"
                onValueChange={(value) => update({ fhlTemplatesText: value })}
              />
            )}
          </>
        )}

        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-2" style={fieldStyle} data-fhl-fixed-input>
            <div className="flex items-center justify-between text-[11px] font-bold"><span>fixed 固定参考 · {fixedImages.length}</span><button type="button" className="nodrag" onClick={() => fixedInputRef.current?.click()}><Upload size={13} /></button></div>
            <input ref={fixedInputRef} className="hidden" type="file" accept="image/*" multiple onChange={(event) => { void uploadImages(event.target.files, 'fixed'); event.currentTarget.value = ''; }} />
            <div className="mt-2 flex min-h-10 gap-1 overflow-x-auto">{fixedImages.slice(0, 6).map((url) => <SmartImage key={url} src={url} alt="fixed" className="h-10 w-10 shrink-0 rounded object-cover" />)}</div>
            {localFixed.length > 0 && <button type="button" className="nodrag mt-1 inline-flex items-center gap-1 text-[10px] text-rose-400" onClick={() => update({ fhlFixedImages: [] })}><X size={11} />清空本地</button>}
          </div>
          <div className="rounded-xl p-2" style={fieldStyle} data-fhl-items-input>
            <div className="flex items-center justify-between text-[11px] font-bold"><span>items 变量图片 · {itemImages.length}</span><button type="button" className="nodrag" onClick={() => itemsInputRef.current?.click()}><Upload size={13} /></button></div>
            <input ref={itemsInputRef} className="hidden" type="file" accept="image/*" multiple onChange={(event) => { void uploadImages(event.target.files, 'items'); event.currentTarget.value = ''; }} />
            <div className="mt-2 flex min-h-10 gap-1 overflow-x-auto">{itemImages.slice(0, 6).map((url) => <SmartImage key={url} src={url} alt="item" className="h-10 w-10 shrink-0 rounded object-cover" />)}</div>
            {localItems.length > 0 && <button type="button" className="nodrag mt-1 inline-flex items-center gap-1 text-[10px] text-rose-400" onClick={() => update({ fhlItemImages: [] })}><X size={11} />清空本地</button>}
          </div>
        </section>

        {panel === 'quick' && fixedImages.length > 5 && <div className="flex gap-2 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-400"><AlertTriangle size={14} />6–10 张组合参考属于实验性重负载范围，将强制串行。</div>}

        <section className="grid grid-cols-5 gap-2">
          <label className="grid gap-1 text-[10px]" style={{ color: hint }}>规格<select className="nodrag p-1.5 text-xs" style={fieldStyle} value={quality} onChange={(event) => update({ fhlQuality: event.target.value })}><option>2K</option><option>4K</option></select></label>
          <label className="grid gap-1 text-[10px]" style={{ color: hint }}>比例<select className="nodrag p-1.5 text-xs" style={fieldStyle} value={aspect} disabled={d.fhlPreset === 'nail-tryon'} onChange={(event) => update({ fhlAspect: event.target.value })}>{aspectOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-[10px]" style={{ color: hint }}>保存格式<select className="nodrag p-1.5 text-xs" style={fieldStyle} value={outputFormat} onChange={(event) => update({ fhlOutputFormat: event.target.value })}><option value="jpg">JPG</option><option value="png">PNG</option></select></label>
          <label className="grid gap-1 text-[10px]" style={{ color: hint }}>并发<input className="nodrag min-w-0 p-1.5 text-xs" style={fieldStyle} type="number" min={1} max={10} value={Number(d.fhlConcurrency) || 1} onChange={(event) => update({ fhlConcurrency: Number(event.target.value) })} /></label>
          {panel === 'quick' ? <label className="grid gap-1 text-[10px]" style={{ color: hint }}>{isEdit ? '变体' : quickKind === 'repeat' ? '连续' : '张数'}<input className="nodrag min-w-0 p-1.5 text-xs" style={fieldStyle} type="number" min={1} max={isEdit ? 4 : quickKind === 'repeat' ? 50 : 9} value={isEdit ? (Number(d.fhlCount) || 1) : quickKind === 'repeat' ? (Number(d.fhlRepeat) || 10) : (Number(d.fhlCount) || 1)} onChange={(event) => update(!isEdit && quickKind === 'repeat' ? { fhlRepeat: Number(event.target.value) } : { fhlCount: Number(event.target.value) })} /></label> : <label className="grid gap-1 text-[10px]" style={{ color: hint }}>{panel === 'workflow' ? '修复轮数' : '任务数'}<input className="nodrag min-w-0 p-1.5 text-xs" style={fieldStyle} type="number" min={panel === 'workflow' ? 0 : 1} max={panel === 'workflow' ? 5 : 20} disabled={panel !== 'workflow'} value={panel === 'workflow' ? (Number(d.fhlRepairPasses) || 2) : (panel === 'batch' ? batchPrompts.length : Math.min(10, itemImages.length))} onChange={(event) => panel === 'workflow' && update({ fhlRepairPasses: Number(event.target.value) })} /></label>}
        </section>

        {panel === 'quick' && !isEdit && <div className="flex items-center gap-3 text-[11px]"><button type="button" className="nodrag" onClick={() => update({ fhlQuickKind: 'count' })}>◉ 同提示词 1–9</button><button type="button" className="nodrag" onClick={() => update({ fhlQuickKind: 'repeat' })}>◉ 连续 1–50</button></div>}
        {panel === 'workflow' && <div className="grid grid-cols-2 gap-2 text-[11px]"><label>处理上限<input className="nodrag ml-2 w-20 p-1" style={fieldStyle} type="number" min={1} value={Number(d.fhlLimit) || Math.min(100, Math.max(1, itemImages.length))} onChange={(event) => update({ fhlLimit: Number(event.target.value) })} /></label><label><input className="nodrag mr-1" type="checkbox" checked={Boolean(d.fhlDryRun)} onChange={(event) => update({ fhlDryRun: event.target.checked })} />仅预检，不调用 FHL</label></div>}

        <div className="flex gap-2">
          <button type="button" className="nodrag inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-3 py-2.5 font-black text-slate-950 disabled:opacity-50" disabled={busy || !config?.enabledWorkerCount} onClick={() => void handleRun()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}运行</button>
          {busy && <button type="button" className="nodrag inline-flex items-center gap-1 rounded-xl bg-rose-500/20 px-3 text-rose-300" onClick={() => void handleStop()}><Square size={14} />停止</button>}
          {terminalJob && job && ['partial', 'failed', 'cancelled', 'interrupted'].includes(job.status) && <button type="button" className="nodrag inline-flex items-center gap-1 rounded-xl bg-amber-500/20 px-3 text-amber-300" onClick={() => void handleResume()}><RotateCcw size={14} />恢复</button>}
        </div>

        <section className="rounded-xl p-3" style={fieldStyle} data-fhl-job-status>
          <div className="flex items-center justify-between text-xs font-bold"><span>{job ? `${job.status} · ${job.success}/${job.total}` : (d.fhlConfigError || '等待运行')}</span><span>{job?.progress || 0}%</span></div>
          {job && <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-500/20"><div className="h-full bg-cyan-400" style={{ width: `${job.progress}%` }} /></div>}
          {job?.tasks?.length ? <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-[10px]">{job.tasks.slice(-12).map((task) => <div key={task.id}><div className="flex gap-2"><span className={task.status === 'success' ? 'text-emerald-400' : task.status === 'failed' ? 'text-rose-400' : 'text-cyan-400'}>{task.status}</span><span className="min-w-0 flex-1 truncate">{task.templateLabel || task.id}</span><span>{task.workerName || ''}</span><span>{task.attempts ? `×${task.attempts}` : ''}</span></div>{task.error && <div className="mt-0.5 break-words text-rose-400" title={task.error}>{task.error}</div>}</div>)}</div> : null}
          {job?.error && <div className="mt-2 text-[11px] text-rose-400">{job.error}</div>}
          {job?.artifactUrls && Object.keys(job.artifactUrls).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{Object.entries(job.artifactUrls).map(([name, url]) => <a key={name} href={url} download className="nodrag inline-flex items-center gap-1 text-[10px] text-cyan-400"><Download size={11} />{name}</a>)}</div>}
        </section>
      </div>
    </div>
  );
};

export default memo(FhlImageGenNode);
