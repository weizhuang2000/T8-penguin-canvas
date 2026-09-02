import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  Box,
  Brain,
  CheckCircle2,
  Download,
  FileArchive,
  FileCode2,
  Loader2,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import { DEFAULT_LLM_MODEL } from '../../providers/models';
import {
  cancelBlenderJob,
  createBlenderJob,
  getBlenderJob,
  getBlenderRuntimeStatus,
  type BlenderJob,
  type BlenderRenderPreset,
  type BlenderRuntimeStatus,
} from '../../services/blender';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { useThemeStore } from '../../stores/theme';
import { PORT_COLOR } from '../../config/portTypes';
import PromptTextarea from '../PromptTextarea';
import MaterialPreviewSection from './MaterialPreviewSection';
import { useOrderedMaterials } from './useOrderedMaterials';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import { useUpdateNodeData } from './useUpdateNodeData';
import {
  countExcludedMaterials,
  excludeMaterialId,
  filterExcludedMaterials,
  normalizeExcludedMaterialIds,
} from '../../utils/materialExclusion';

const PHASE_LABELS: Record<string, string> = {
  queued: '等待执行',
  'detecting-runtime': '检测 Blender',
  'preparing-references': '暂存参考素材',
  researching: '联网检索真实参考',
  'researching-fallback': '分析输入参考',
  planning: '结构与资产规划',
  'generating-structure': '生成结构模块',
  'building-structure': '构建结构',
  'reviewing-structure': '结构渲染检查',
  'generating-materials': '生成材质模块',
  'building-materials': '应用材质与磨损',
  'reviewing-materials': '材质渲染检查',
  'generating-lighting': '生成灯光模块',
  'building-lighting': '应用灯光与相机',
  'reviewing-lighting': '灯光渲染检查',
  'repairing-module': '返修阶段模块',
  'final-review': '最终四视图审片',
  packaging: '打包 Blender 工程',
  success: '已完成',
  cancelled: '已取消',
  error: '失败',
};

function phaseLabel(phase: string) {
  if (PHASE_LABELS[phase]) return PHASE_LABELS[phase];
  if (phase.startsWith('generating-assets-')) return '生成资产批次';
  if (phase.startsWith('building-assets-')) return '构建资产批次';
  if (phase.startsWith('reviewing-assets-')) return '资产渲染检查';
  if (phase.startsWith('generating-final-revision-')) return '生成最终返修';
  if (phase.startsWith('building-final-revision-')) return '应用最终返修';
  return phase || '待命';
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function BlenderModelNode({ id, data, selected }: NodeProps) {
  const update = useUpdateNodeData(id);
  const d = (data || {}) as any;
  const upstream = useUpstreamMaterials(id);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const settings = useApiKeysStore((state) => state.settings);
  const { theme, style } = useThemeStore();
  const [runtime, setRuntime] = useState<BlenderRuntimeStatus | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const pollingRef = useRef(false);

  const prompt = String(d.blenderPrompt || '');
  const blenderPath = String(d.blenderExecutablePath || '');
  const renderPreset: BlenderRenderPreset = d.blenderRenderPreset === 'draft' ? 'draft' : 'final';
  const busy = String(d.status || '') === 'generating';
  const jobId = String(d.blenderJobId || '');
  const materialOrder: string[] = Array.isArray(d.blenderMaterialOrder) ? d.blenderMaterialOrder : [];
  const excludedIds = normalizeExcludedMaterialIds(d.blenderExcludedMaterialIds);
  const allMaterials = useMemo(() => [...upstream.texts, ...upstream.images], [upstream.images, upstream.texts]);
  const visibleMaterials = useMemo(() => filterExcludedMaterials(allMaterials, excludedIds), [allMaterials, excludedIds]);
  const ordered = useOrderedMaterials(visibleMaterials, materialOrder);
  const orderedTexts = ordered.filter((item) => item.kind === 'text');
  const orderedImages = ordered.filter((item) => item.kind === 'image').slice(0, 12);
  const excludedCount = countExcludedMaterials(excludedIds, allMaterials);

  const configuredModel = settings.llmModel?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = settings.llmConfigs || settings.llmApiKeys || [];
  const llmOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredModel, isDefault: true }];
  }, [configuredModel, llmConfigs]);
  const selectedLlmId = String(d.llmKeyId || '');
  const activeLlm = llmOptions.find((item) => item.id === selectedLlmId)
    || llmOptions.find((item) => item.isDefault)
    || llmOptions[0];

  const refreshRuntime = useCallback(async () => {
    setRuntimeLoading(true);
    try {
      const result = await getBlenderRuntimeStatus(blenderPath);
      setRuntime(result);
      if (!result.installed) setLocalError(result.error || '未检测到 Blender');
      else setLocalError('');
    } catch (error: any) {
      setLocalError(error?.message || 'Blender 检测失败');
    } finally {
      setRuntimeLoading(false);
    }
  }, [blenderPath]);

  useEffect(() => { void refreshRuntime(); }, []);

  const applyJob = useCallback((job: BlenderJob) => {
    const patch: Record<string, unknown> = {
      blenderJobId: job.id,
      blenderPhase: job.phase,
      blenderProgress: job.progress,
      blenderWarnings: job.warnings || [],
      blenderReviews: job.reviews || [],
      blenderRepairsUsed: job.repairsUsed || 0,
      blenderResearchMode: job.researchMode || '',
      blenderPlanSummary: job.planSummary || '',
      status: job.status === 'error' ? 'error' : job.status === 'success' ? 'success' : job.status === 'cancelled' ? 'idle' : 'generating',
      error: job.error || '',
    };
    if (job.artifacts) {
      const hero = job.artifacts.previewUrls?.[0] || '';
      patch.modelUrl = job.artifacts.glbUrl;
      patch.modelUrls = [job.artifacts.glbUrl];
      patch.imageUrl = hero;
      patch.imageUrls = hero ? [hero] : [];
      patch.blenderPreviewUrls = job.artifacts.previewUrls || [];
      patch.blenderBlendUrl = job.artifacts.blendUrl;
      patch.blenderGlbUrl = job.artifacts.glbUrl;
      patch.blenderProjectZipUrl = job.artifacts.zipUrl;
      patch.blenderReportUrl = job.artifacts.reportUrl;
      patch.outputText = job.planSummary || `Blender 模型已完成，返修 ${job.repairsUsed || 0} 轮`;
      patch.text = patch.outputText;
      patch.prompt = patch.outputText;
    }
    update(patch);
  }, [update]);

  const pollJob = useCallback(async (targetId: string) => {
    if (!targetId || pollingRef.current) return null;
    pollingRef.current = true;
    try {
      for (;;) {
        const job = await getBlenderJob(targetId);
        applyJob(job);
        if (['success', 'error', 'cancelled'].includes(job.status)) {
          if (job.status === 'error') throw new Error(job.error || 'Blender 模型生成失败');
          return job;
        }
        await wait(1200);
      }
    } finally {
      pollingRef.current = false;
    }
  }, [applyJob]);

  useEffect(() => {
    if (!busy || !jobId) return;
    void pollJob(jobId).catch((error: any) => setLocalError(error?.message || 'Blender 作业轮询失败'));
  }, [busy, jobId, pollJob]);

  const execute = useCallback(async () => {
    if (!prompt.trim() && orderedTexts.length === 0 && orderedImages.length === 0) throw new Error('请输入建模要求或连接上游文本/参考图');
    setLocalError('');
    update({ status: 'generating', error: '', blenderPhase: 'queued', blenderProgress: 0, imageUrl: '', imageUrls: [], modelUrl: '', modelUrls: [] });
    try {
      const job = await createBlenderJob({
        llmKeyId: activeLlm?.id || '',
        prompt,
        texts: orderedTexts.map((item) => ({ id: item.id, label: item.label, text: item.url })),
        images: orderedImages.map((item) => ({ id: item.id, label: item.label, url: item.url })),
        renderPreset,
        blenderPath: blenderPath || undefined,
        historyContext: {
          canvasId: activeCanvasId || '', sourceNodeId: id, sourceNodeType: 'blender-model',
          nodeTitle: 'Blender 模型', outputTitle: prompt.trim().slice(0, 80) || 'Blender 模型',
        },
      });
      applyJob(job);
      const complete = await pollJob(job.id);
      if (complete?.status === 'success') logBus.success('Blender 模型工程生成完成', `blender:${id}`);
    } catch (error: any) {
      const message = error?.message || 'Blender 模型生成失败';
      setLocalError(message);
      update({ status: 'error', error: message, blenderPhase: 'error' });
      throw error;
    }
  }, [activeCanvasId, activeLlm?.id, applyJob, blenderPath, id, orderedImages, orderedTexts, pollJob, prompt, renderPreset, update]);

  useRunTrigger(id, execute, 'blender-model');

  const cancel = async () => {
    if (!jobId) return;
    try { applyJob(await cancelBlenderJob(jobId)); }
    catch (error: any) { setLocalError(error?.message || '取消 Blender 作业失败'); }
  };

  const invoke = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch { /* execute 已写入节点错误状态 */ }
  };

  const phase = String(d.blenderPhase || 'idle');
  const progress = Math.max(0, Math.min(100, Number(d.blenderProgress) || 0));
  const reviews = Array.isArray(d.blenderReviews) ? d.blenderReviews : [];
  const warnings = Array.isArray(d.blenderWarnings) ? d.blenderWarnings : [];
  const latestReview = reviews[reviews.length - 1];
  const previewUrls: string[] = Array.isArray(d.blenderPreviewUrls) ? d.blenderPreviewUrls : [];
  const error = localError || String(d.error || '');
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';

  return (
    <div className={`t8-node overflow-hidden ${selected ? 'ring-2' : ''}`} style={{ width: 540, borderColor: selected ? 'var(--t8-accent)' : 'var(--t8-border-strong)' }}>
      <Handle id="text" type="target" position={Position.Left} style={{ top: 112, background: PORT_COLOR.text, border: 0 }} title="输入文字" />
      <Handle id="images" type="target" position={Position.Left} style={{ top: 162, background: PORT_COLOR.image, border: 0 }} title="输入参考图" />
      <Handle id="model" type="source" position={Position.Right} style={{ top: '35%', background: PORT_COLOR.model3d, border: 0 }} title="输出 GLB 模型" />
      <Handle id="render" type="source" position={Position.Right} style={{ top: '52%', background: PORT_COLOR.image, border: 0 }} title="输出主渲染图" />
      <Handle id="report" type="source" position={Position.Right} style={{ top: '69%', background: PORT_COLOR.text, border: 0 }} title="输出建模报告" />

      <div className="t8-node-header flex items-center gap-2 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-400 text-zinc-950"><Box size={17} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Blender 模型</div>
          <div className="truncate text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
            {renderPreset === 'final' ? 'Cycles 成片' : 'Eevee 草稿'} · 最多 3 轮返修
          </div>
        </div>
        {String(d.status) === 'success' ? <CheckCircle2 size={15} className="text-emerald-400" /> : busy ? <Loader2 size={15} className="animate-spin text-orange-300" /> : <Brain size={15} className="text-orange-300" />}
      </div>

      <div className="nodrag nowheel space-y-2 p-3" onMouseDown={(event) => event.stopPropagation()}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
            <span>LLM 推理模型</span>
            <select className="t8-select w-full px-2 py-1.5 text-xs" value={activeLlm?.id || 'default'} disabled={busy} onChange={(event) => update({ llmKeyId: event.target.value })}>
              {llmOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
            </select>
          </label>
          <div className="space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
            <span className="block">渲染档位</span>
            <div className="flex h-[30px] overflow-hidden rounded border" style={{ borderColor: 'var(--t8-border)' }}>
              {(['draft', 'final'] as BlenderRenderPreset[]).map((value) => (
                <button key={value} type="button" className="px-2 text-[10px] font-semibold" disabled={busy} onClick={() => update({ blenderRenderPreset: value })} style={{ background: renderPreset === value ? 'var(--t8-accent)' : 'var(--t8-bg-subtle)', color: renderPreset === value ? '#111827' : 'var(--t8-text-main)' }}>
                  {value === 'draft' ? 'Eevee' : 'Cycles'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
          <span>建模要求</span>
          <PromptTextarea
            title="Blender 建模要求"
            value={prompt}
            disabled={busy}
            readOnly={busy}
            placeholder="例如：根据参考图建立一组具有真实比例、统一色调和经年磨损的日式街区场景"
            onValueChange={(value) => update({ blenderPrompt: value })}
            rows={4}
            className="t8-input min-h-24 w-full resize-y px-2 py-1.5 text-xs"
          />
        </label>

        <MaterialPreviewSection
          texts={orderedTexts}
          images={orderedImages}
          order={materialOrder}
          onReorder={(order) => update({ blenderMaterialOrder: order })}
          onExcludeUpstream={(material) => update({ blenderExcludedMaterialIds: excludeMaterialId(excludedIds, material.id) })}
          excludedCount={excludedCount}
          onRestoreExcluded={() => update({ blenderExcludedMaterialIds: [] })}
          selected={selected}
          isDark={isDark}
          isPixel={isPixel}
          groups={['text', 'image']}
          title={`建模输入 · 参考图 ${orderedImages.length}/12`}
        />

        <details className="text-[10px]" open={!!blenderPath}>
          <summary className="cursor-pointer select-none" style={{ color: 'var(--t8-text-muted)' }}>Blender 运行时</summary>
          <div className="mt-1 flex gap-1.5">
            <input className="t8-input min-w-0 flex-1 px-2 py-1.5 text-[10px]" value={blenderPath} disabled={busy} placeholder="自动检测，或填写 blender.exe 完整路径" onChange={(event) => update({ blenderExecutablePath: event.target.value })} />
            <button type="button" className="t8-btn-secondary inline-flex h-7 w-8 items-center justify-center" disabled={runtimeLoading || busy} onClick={() => void refreshRuntime()} title="重新检测 Blender">
              <RefreshCw size={12} className={runtimeLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="mt-1 truncate" title={runtime?.executable || runtime?.error} style={{ color: runtime?.installed ? '#34d399' : '#f87171' }}>
            {runtimeLoading ? '检测中...' : runtime?.installed ? `Blender ${runtime.version} · ${runtime.executable}` : runtime?.error || '等待检测'}
          </div>
        </details>

        <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: 'rgba(245,158,11,.10)', color: 'var(--t8-text-muted)', border: '1px solid rgba(245,158,11,.25)' }}>
          <div className="flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" /><span>会自动执行经静态限制的 LLM bpy 脚本。静态检查不能提供完整系统沙箱，请仅使用可信模型配置。</span></div>
        </div>

        {(busy || phase === 'success') && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]"><span>{phaseLabel(phase)}</span><span>{progress}%</span></div>
            <div className="h-1.5 overflow-hidden rounded bg-black/20"><div className="h-full bg-orange-400 transition-all" style={{ width: `${progress}%` }} /></div>
            <div className="flex gap-3 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
              <span>{d.blenderResearchMode === 'web-search' ? '联网参考' : d.blenderResearchMode === 'knowledge-fallback' ? '知识降级' : '等待研究'}</span>
              <span>返修 {Number(d.blenderRepairsUsed) || 0}/3</span>
              {latestReview && <span>最近审片 {latestReview.score}/100</span>}
            </div>
          </div>
        )}

        {previewUrls.length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {previewUrls.slice(0, 4).map((url, index) => <img key={url} src={url} alt={`Blender 质检视图 ${index + 1}`} className="aspect-square w-full rounded object-cover" />)}
          </div>
        )}

        {(d.blenderBlendUrl || d.blenderProjectZipUrl) && (
          <div className="grid grid-cols-4 gap-1.5">
            {[
              [d.blenderBlendUrl, 'BLEND', Box],
              [d.blenderGlbUrl, 'GLB', Box],
              [d.blenderProjectZipUrl, '工程包', FileArchive],
              [d.blenderReportUrl, '报告', FileCode2],
            ].map(([url, label, Icon]: any) => url && (
              <a key={label} href={url} download target="_blank" rel="noreferrer" className="t8-btn-secondary inline-flex items-center justify-center gap-1 px-1 py-1.5 text-[10px]" title={`下载 ${label}`}>
                <Icon size={11} /><span>{label}</span><Download size={10} />
              </a>
            ))}
          </div>
        )}

        {warnings.length > 0 && <div className="max-h-16 overflow-auto text-[10px] text-amber-300">{warnings.map((item: string, index: number) => <div key={`${item}-${index}`}>· {item}</div>)}</div>}
        {error && <div className="max-h-20 overflow-auto rounded bg-red-500/10 px-2 py-1.5 text-[10px] text-red-300">{error}</div>}

        <div className="flex gap-1.5">
          {busy ? (
            <button type="button" className="t8-btn-secondary inline-flex flex-1 items-center justify-center gap-1.5 py-2 text-xs" onClick={() => void cancel()}><Square size={13} />停止</button>
          ) : (
            <button type="button" className="t8-btn-primary inline-flex flex-1 items-center justify-center gap-1.5 py-2 text-xs" onClick={() => void invoke(execute)}><Play size={13} />生成 Blender 工程</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(BlenderModelNode);
