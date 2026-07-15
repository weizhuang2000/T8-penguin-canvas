import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Brain, CheckCircle2, Clapperboard, Code2, FileJson, Loader2, Play, Sparkles, Square } from 'lucide-react';
import { DEFAULT_LLM_MODEL } from '../../providers/models';
import {
  cancelRemotionGenerationJob,
  cancelRemotionJob,
  createRemotionGenerationJob,
  createRemotionJob,
  getRemotionGenerationJob,
  getRemotionJob,
  validateRemotionSpec,
  type RemotionAssetInput,
  type RemotionFps,
  type RemotionGenerationJob,
  type RemotionJob,
  type RemotionMode,
  type RemotionProfile,
  type RemotionQuality,
  type RemotionRatio,
  type RemotionResolution,
  type RemotionStylePreset,
} from '../../services/remotion';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { useThemeStore } from '../../stores/theme';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import PromptTextarea from '../PromptTextarea';
import {
  countExcludedMaterials,
  excludeMaterialId,
  filterExcludedMaterials,
  normalizeExcludedMaterialIds,
} from '../../utils/materialExclusion';
import LoopingVideo from '../LoopingVideo';
import MaterialPreviewSection from './MaterialPreviewSection';
import { useOrderedMaterials } from './useOrderedMaterials';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import { useUpdateNodeData } from './useUpdateNodeData';

const STYLE_OPTIONS: Array<{ value: RemotionStylePreset; label: string }> = [
  { value: 'auto', label: '自动风格' },
  { value: 'cinematic', label: '电影感' },
  { value: 'editorial', label: '编辑设计' },
  { value: 'tech', label: '科技感' },
  { value: 'minimal', label: '极简' },
  { value: 'playful', label: '活泼' },
];

const PHASE_LABELS: Record<string, string> = {
  queued: '等待生成',
  'preparing-assets': '暂存并分析素材',
  planning: '创意方案',
  'generating-code': '生成 TSX',
  'repairing-code': '修复源码',
  compiling: '编译检查',
  bundling: '编译 Remotion',
  'runtime-check': '检查浏览器运行时',
  'runtime-download': '下载浏览器运行时',
  'rendering-stills': '渲染关键帧',
  'rendering-review-1': '渲染第一轮关键帧',
  'rendering-review-2': '渲染第二轮关键帧',
  'reviewing-1': '第一轮视觉审片',
  'reviewing-2': '第二轮视觉审片',
  'reviewing-text-1': '第一轮文本审片',
  'reviewing-text-2': '第二轮文本审片',
  described: '描述已生成',
  validating: '校验描述',
  'waiting-renderer': '等待渲染器',
  preparing: '准备素材',
  rendering: '渲染 MP4',
  success: '已完成',
  cancelled: '已取消',
  error: '失败',
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function profileFromData(data: any): RemotionProfile {
  return {
    ratio: (['16:9', '9:16', '1:1'].includes(data.remotionRatio) ? data.remotionRatio : '16:9') as RemotionRatio,
    resolution: (data.remotionResolution === '720p' ? '720p' : '1080p') as RemotionResolution,
    fps: ([24, 30, 60].includes(Number(data.remotionFps)) ? Number(data.remotionFps) : 30) as RemotionFps,
    duration: Math.max(1, Math.min(60, Number(data.remotionDuration) || 8)),
  };
}

function RemotionAnimationNode({ id, data, selected }: NodeProps) {
  const update = useUpdateNodeData(id);
  const d = data as any;
  const upstream = useUpstreamMaterials(id);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const { theme, style } = useThemeStore();
  const [localError, setLocalError] = useState('');
  const generationPollingRef = useRef(false);
  const renderPollingRef = useRef(false);

  // 新节点会显式写入 professional；没有该字段的旧节点保持 standard。
  const quality: RemotionQuality = d.remotionQuality === 'professional' ? 'professional' : 'standard';
  const mode: RemotionMode = quality === 'professional' ? 'tsx' : (d.remotionMode === 'tsx' ? 'tsx' : 'json');
  const stylePreset = (STYLE_OPTIONS.some((item) => item.value === d.remotionStylePreset) ? d.remotionStylePreset : 'auto') as RemotionStylePreset;
  const subject = String(d.remotionSubject || '');
  const source = String(d.remotionSource || '');
  const profile = profileFromData(d);
  const materialOrder: string[] = Array.isArray(d.remotionMaterialOrder) ? d.remotionMaterialOrder : [];
  const excludedIds = normalizeExcludedMaterialIds(d.remotionExcludedMaterialIds);
  const allMaterials = useMemo(() => [...upstream.texts, ...upstream.images, ...upstream.videos, ...upstream.audios], [upstream]);
  const visibleMaterials = useMemo(() => filterExcludedMaterials(allMaterials, excludedIds), [allMaterials, excludedIds]);
  const orderedMaterials = useOrderedMaterials(visibleMaterials, materialOrder);
  const orderedTexts = orderedMaterials.filter((item) => item.kind === 'text');
  const orderedImages = orderedMaterials.filter((item) => item.kind === 'image');
  const orderedVideos = orderedMaterials.filter((item) => item.kind === 'video');
  const orderedAudios = orderedMaterials.filter((item) => item.kind === 'audio');
  const mediaMaterials = orderedMaterials.filter((item) => item.kind !== 'text');
  const assets = useMemo<RemotionAssetInput[]>(() => mediaMaterials.map((item, index) => ({
    id: `asset-${index + 1}`,
    kind: item.kind as RemotionAssetInput['kind'],
    url: item.url,
    label: item.label || `${item.kind} ${index + 1}`,
  })), [mediaMaterials]);

  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredLlmModel, isDefault: true }];
  }, [configuredLlmModel, llmConfigs]);
  const selectedLlmKeyId = String(d.llmKeyId || '').trim();
  const activeLlmConfig = llmConfigOptions.find((item) => item.id === selectedLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const reviewLlmKeyId = String(d.remotionReviewLlmKeyId || '');
  const busy = String(d.status || '') === 'generating';
  const excludedCount = countExcludedMaterials(excludedIds, allMaterials);
  const generationJobId = String(d.remotionGenerationJobId || '');
  const renderJobId = String(d.remotionJobId || '');

  const applyGenerationJob = useCallback((job: RemotionGenerationJob) => {
    const patch: Record<string, unknown> = {
      remotionGenerationJobId: job.id,
      remotionPhase: job.phase,
      remotionProgress: job.progress,
      remotionActiveOperation: 'generation',
      remotionPlan: job.plan || '',
      remotionReviews: job.reviews || [],
      remotionWarnings: job.warnings || [],
      remotionSkillVersion: job.skillVersion || '',
      remotionSkillSource: job.skillSource || null,
      remotionSkillRules: job.skillRules || [],
      remotionSkillRuleDetails: job.skillRuleDetails || [],
      status: job.status === 'error' ? 'error' : job.status === 'cancelled' ? 'idle' : job.status === 'success' ? 'idle' : 'generating',
      error: job.error || '',
    };
    if (job.source) patch.remotionSource = job.source;
    update(patch);
  }, [update]);

  const applyRenderJob = useCallback((job: RemotionJob) => {
    const patch: Record<string, unknown> = {
      remotionJobId: job.id,
      remotionPhase: job.phase,
      remotionProgress: job.progress,
      remotionActiveOperation: 'render',
      status: job.status === 'success' ? 'success' : job.status === 'error' ? 'error' : job.status === 'cancelled' ? 'idle' : 'generating',
      error: job.error || '',
    };
    if (job.videoUrl) {
      patch.videoUrl = job.videoUrl;
      patch.videoUrls = [job.videoUrl];
      patch.fileName = job.fileName || '';
      patch.remotionResult = job;
    }
    update(patch);
  }, [update]);

  const pollGenerationJob = useCallback(async (targetId: string) => {
    if (!targetId || generationPollingRef.current) return;
    generationPollingRef.current = true;
    try {
      for (;;) {
        const job = await getRemotionGenerationJob(targetId);
        applyGenerationJob(job);
        if (['success', 'error', 'cancelled'].includes(job.status)) {
          if (job.status === 'error') throw new Error(job.error || 'Remotion 描述生成失败');
          if (job.status === 'cancelled') throw Object.assign(new Error('Remotion 描述生成已取消'), { cancelled: true });
          return job;
        }
        await wait(1000);
      }
    } finally {
      generationPollingRef.current = false;
    }
  }, [applyGenerationJob]);

  const pollRenderJob = useCallback(async (targetId: string) => {
    if (!targetId || renderPollingRef.current) return;
    renderPollingRef.current = true;
    try {
      for (;;) {
        const job = await getRemotionJob(targetId);
        applyRenderJob(job);
        if (['success', 'error', 'cancelled'].includes(job.status)) {
          if (job.status === 'error') throw new Error(job.error || 'Remotion 渲染失败');
          return job;
        }
        await wait(1000);
      }
    } finally {
      renderPollingRef.current = false;
    }
  }, [applyRenderJob]);

  useEffect(() => {
    if (!busy) return;
    if (d.remotionActiveOperation === 'generation' && generationJobId) {
      void pollGenerationJob(generationJobId).catch((error) => {
        if (!error?.cancelled) setLocalError(error.message || String(error));
      });
    } else if (d.remotionActiveOperation === 'render' && renderJobId) {
      void pollRenderJob(renderJobId).catch((error) => setLocalError(error.message || String(error)));
    }
  }, [busy, d.remotionActiveOperation, generationJobId, pollGenerationJob, pollRenderJob, renderJobId]);

  const generateDescription = useCallback(async () => {
    if (!subject.trim() && orderedMaterials.length === 0) throw new Error('请输入主题/文本或连接上游素材');
    setLocalError('');
    update({ remotionPhase: 'queued', remotionProgress: 0, remotionActiveOperation: 'generation', status: 'generating', error: '' });
    const job = await createRemotionGenerationJob({
      mode,
      quality,
      stylePreset,
      llmKeyId: activeLlmConfig?.id || '',
      reviewLlmKeyId: reviewLlmKeyId || undefined,
      subject,
      texts: orderedTexts.map((item) => ({ id: item.id, label: item.label, text: item.url })),
      assets,
      profile,
      historyContext: { canvasId: activeCanvasId || '', sourceNodeId: id, sourceNodeType: 'remotion-animation' },
    });
    applyGenerationJob(job);
    const completed = await pollGenerationJob(job.id);
    const next = String(completed?.source || '').trim();
    if (!next) throw new Error('Remotion 生成作业没有返回源码');
    logBus.success(quality === 'professional' ? 'Remotion 专业描述已通过审片' : 'Remotion 描述已生成并通过校验', `remotion:${id}`);
    return next;
  }, [activeCanvasId, activeLlmConfig?.id, applyGenerationJob, assets, id, mode, orderedMaterials.length, orderedTexts, pollGenerationJob, profile, quality, reviewLlmKeyId, stylePreset, subject, update]);

  const renderDescription = useCallback(async (value?: string) => {
    let renderSource = String(value ?? source).trim();
    if (!renderSource) throw new Error('请先生成或输入 Remotion 描述');
    setLocalError('');
    update({ remotionPhase: 'validating', remotionActiveOperation: 'render', status: 'generating', error: '', videoUrl: '', videoUrls: [] });
    const validation = await validateRemotionSpec({ mode, source: renderSource, assets, profile });
    if (mode === 'tsx' && validation.source && validation.source !== renderSource) {
      renderSource = validation.source;
      const existingWarnings = Array.isArray(d.remotionWarnings) ? d.remotionWarnings : [];
      update({
        remotionSource: renderSource,
        remotionWarnings: [...new Set([...existingWarnings, ...(validation.normalizations || [])])],
      });
    }
    const job = await createRemotionJob({
      mode,
      source: renderSource,
      subject,
      assets,
      profile,
      historyContext: {
        canvasId: activeCanvasId || '',
        sourceNodeId: id,
        sourceNodeType: 'remotion-animation',
        nodeTitle: 'Remotion 动画',
        outputTitle: subject.trim().slice(0, 80) || 'Remotion 动画',
      },
    });
    applyRenderJob(job);
    const completed = await pollRenderJob(job.id);
    if (completed?.status === 'success') logBus.success('Remotion 动画渲染完成', `remotion:${id}`);
    return completed;
  }, [activeCanvasId, applyRenderJob, assets, d.remotionWarnings, id, mode, pollRenderJob, profile, source, subject, update]);

  const generateAndRender = useCallback(async () => {
    try {
      const next = await generateDescription();
      await renderDescription(next);
    } catch (error: any) {
      if (error?.cancelled) return;
      const message = error?.message || 'Remotion 生成失败';
      setLocalError(message);
      update({ remotionPhase: 'error', status: 'error', error: message });
      throw error;
    }
  }, [generateDescription, renderDescription, update]);

  useRunTrigger(id, generateAndRender, 'remotion-animation');

  const cancel = async () => {
    try {
      if (d.remotionActiveOperation === 'generation' && generationJobId) applyGenerationJob(await cancelRemotionGenerationJob(generationJobId));
      else if (renderJobId) applyRenderJob(await cancelRemotionJob(renderJobId));
    } catch (error: any) {
      setLocalError(error?.message || '取消失败');
    }
  };

  const invoke = async (fn: () => Promise<unknown>) => {
    try { await fn(); }
    catch (error: any) {
      if (error?.cancelled) return;
      const message = error?.message || '操作失败';
      setLocalError(message);
      update({ remotionPhase: 'error', status: 'error', error: message });
    }
  };

  const error = localError || String(d.error || '');
  const phase = String(d.remotionPhase || 'idle');
  const progress = Math.max(0, Math.min(100, Number(d.remotionProgress) || 0));
  const videoUrl = String(d.videoUrl || '');
  const plan = String(d.remotionPlan || '');
  const reviews = Array.isArray(d.remotionReviews) ? d.remotionReviews : [];
  const warnings = Array.isArray(d.remotionWarnings) ? d.remotionWarnings : [];
  const skillVersion = String(d.remotionSkillVersion || 't8-remotion-skill/v2');
  const skillSource = d.remotionSkillSource && typeof d.remotionSkillSource === 'object' ? d.remotionSkillSource : null;
  const skillRuleDetails = Array.isArray(d.remotionSkillRuleDetails) ? d.remotionSkillRuleDetails : [];

  return (
    <div className={`t8-node overflow-hidden ${selected ? 'ring-2' : ''}`} style={{ width: 540, borderColor: selected ? 'var(--t8-accent)' : 'var(--t8-border-strong)' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#fb7185', border: '1px solid var(--t8-bg-node)' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#fb7185', border: '1px solid var(--t8-bg-node)' }} />
      <div className="t8-node-header flex items-center gap-2 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-400 text-rose-950"><Clapperboard size={17} /></div>
        <div className="min-w-0 flex-1"><div className="text-sm font-bold">Remotion 动画</div><div className="truncate text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>{quality === 'professional' ? '专业 Skill' : '标准'} · {mode === 'tsx' ? '专家 TSX' : 'JSON DSL'} · {profile.ratio} · {profile.resolution}</div></div>
        {phase === 'success' ? <CheckCircle2 size={15} className="text-emerald-400" /> : busy ? <Loader2 size={15} className="animate-spin text-rose-300" /> : <Brain size={15} className="text-rose-300" />}
      </div>

      <div className="nodrag nowheel space-y-2 p-3" onMouseDown={(event) => event.stopPropagation()}>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="block space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
            <span>创作模型（LLM 独立配置）</span>
            <select className="t8-select w-full px-2 py-1.5 text-xs" value={activeLlmConfig?.id || 'default'} disabled={busy} onChange={(event) => update({ llmKeyId: event.target.value })}>
              {llmConfigOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
            <span>视觉审片模型</span>
            <select className="t8-select w-full px-2 py-1.5 text-xs" value={reviewLlmKeyId} disabled={busy || quality !== 'professional'} onChange={(event) => update({ remotionReviewLlmKeyId: event.target.value })}>
              <option value="">同创作模型</option>
              {llmConfigOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
            </select>
          </label>
        </div>

        <label className="block space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
          <span>主体或文本</span>
          <PromptTextarea
            title="Remotion 主体或文本"
            value={subject}
            disabled={busy}
            readOnly={busy}
            placeholder="例如：为新产品发布制作一段 8 秒高级科技感标题动画"
            onValueChange={(value) => update({ remotionSubject: value })}
            rows={3}
            className="t8-input min-h-20 w-full resize-y px-2 py-1.5 text-xs"
          />
        </label>

        <MaterialPreviewSection
          texts={orderedTexts}
          images={orderedImages}
          videos={orderedVideos}
          audios={orderedAudios}
          order={materialOrder}
          onReorder={(order) => update({ remotionMaterialOrder: order })}
          onExcludeUpstream={(material) => update({ remotionExcludedMaterialIds: excludeMaterialId(excludedIds, material.id) })}
          excludedCount={excludedCount}
          onRestoreExcluded={() => update({ remotionExcludedMaterialIds: [] })}
          selected={selected}
          isDark={theme === 'dark'}
          isPixel={style === 'pixel'}
          title="Remotion 上游素材"
        />

        <div className="grid grid-cols-4 gap-1.5">
          <select className="t8-select px-1 py-1.5 text-[10px]" value={quality} disabled={busy} onChange={(event) => {
            const next = event.target.value as RemotionQuality;
            update({ remotionQuality: next, ...(next === 'professional' ? { remotionMode: 'tsx', remotionSource: '' } : {}) });
          }}><option value="professional">专业 Skill</option><option value="standard">标准</option></select>
          <select className="t8-select px-1 py-1.5 text-[10px]" value={stylePreset} disabled={busy} onChange={(event) => update({ remotionStylePreset: event.target.value })}>{STYLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="t8-select px-1 py-1.5 text-[10px]" value={mode} disabled={busy || quality === 'professional'} onChange={(event) => update({ remotionMode: event.target.value, remotionSource: '' })}><option value="json">JSON DSL</option><option value="tsx">专家 TSX</option></select>
          <select className="t8-select px-1 py-1.5 text-[10px]" value={profile.ratio} disabled={busy} onChange={(event) => update({ remotionRatio: event.target.value })}>{['16:9', '9:16', '1:1'].map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <select className="t8-select px-1 py-1.5 text-[10px]" value={profile.resolution} disabled={busy} onChange={(event) => update({ remotionResolution: event.target.value })}>{['720p', '1080p'].map((item) => <option key={item}>{item}</option>)}</select>
          <select className="t8-select px-1 py-1.5 text-[10px]" value={profile.fps} disabled={busy} onChange={(event) => update({ remotionFps: Number(event.target.value) })}>{[24, 30, 60].map((item) => <option key={item} value={item}>{item}fps</option>)}</select>
          <input className="t8-input px-1 py-1.5 text-[10px]" type="number" min={1} max={60} value={profile.duration} disabled={busy} title="时长（秒）" onChange={(event) => update({ remotionDuration: Math.max(1, Math.min(60, Number(event.target.value) || 8)) })} />
        </div>

        {quality === 'professional' && <div className="flex items-start gap-1.5 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-200"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>专业模式会生成创意方案、编译受限 TSX，并渲染关键帧进行最多两轮视觉审片。若模型不支持图片会自动降级为文本审查。</span></div>}

        {plan && <details className="rounded border px-2 py-1.5 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}><summary className="cursor-pointer">创意方案摘要</summary><div className="mt-1 whitespace-pre-wrap">{plan}</div></details>}
        {reviews.length > 0 && <div className="flex flex-wrap gap-1">{reviews.map((review: any) => <span key={review.round} className={`rounded px-1.5 py-0.5 text-[10px] ${Number(review.score) >= 88 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'}`}>第 {review.round} 轮 · {review.score} 分</span>)}</div>}
        <details className="rounded border px-2 py-1.5 text-[10px]" style={{ borderColor: 'var(--t8-border)', color: 'var(--t8-text-muted)' }}>
          <summary className="cursor-pointer">本次 Skill · {skillVersion}{skillSource?.pluginVersion ? ` · 上游 ${skillSource.pluginVersion}` : ''}</summary>
          {skillRuleDetails.length > 0 ? <div className="mt-1.5 flex flex-wrap gap-1">
            {skillRuleDetails.map((rule: any) => <span key={rule.id} title={rule.reason || rule.phases?.join(', ')} className={`rounded px-1.5 py-0.5 ${rule.support === 'disabled' ? 'bg-amber-400/15 text-amber-200' : rule.support === 'adapted' ? 'bg-sky-400/15 text-sky-200' : 'bg-emerald-400/15 text-emerald-200'}`}>{rule.id}{rule.support === 'adapted' ? ' · 适配' : rule.support === 'disabled' ? ' · 未启用' : ''}</span>)}
          </div> : <div className="mt-1">生成后显示本次命中的内置规则和能力门控结果。</div>}
        </details>
        {warnings.length > 0 && <div className="whitespace-pre-wrap rounded border border-amber-400/25 bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-200">{warnings.join('\n')}</div>}

        <label className="block space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
          <span className="flex items-center gap-1">{mode === 'tsx' ? <Code2 size={12} /> : <FileJson size={12} />} Remotion 描述</span>
          <PromptTextarea
            title="Remotion 描述"
            value={source}
            disabled={busy}
            readOnly={busy}
            placeholder={mode === 'tsx' ? '生成或粘贴受限 Remotion TSX...' : '生成或粘贴 t8-remotion/v1 JSON...'}
            onValueChange={(value) => update({ remotionSource: value, remotionPhase: 'edited' })}
            rows={8}
            mono
            editorKind={mode === 'json' ? 'json' : 'text'}
            className="t8-input min-h-48 w-full resize-y px-2 py-1.5 font-mono text-[10px] leading-relaxed"
          />
        </label>

        <div className="grid grid-cols-3 gap-1.5">
          <button className="t8-btn px-2 py-1.5 text-[11px]" disabled={busy} onClick={() => void invoke(generateDescription)}><Brain size={13} />生成描述</button>
          <button className="t8-btn px-2 py-1.5 text-[11px]" disabled={busy || !source.trim()} onClick={() => void invoke(() => renderDescription())}><Play size={13} />渲染动画</button>
          {busy ? <button className="t8-btn px-2 py-1.5 text-[11px]" onClick={() => void cancel()}><Square size={13} />取消</button> : <button className="t8-btn t8-btn-primary px-2 py-1.5 text-[11px]" onClick={() => void invoke(generateAndRender)}><Sparkles size={13} />生成并渲染</button>}
        </div>

        {busy && <div className="space-y-1"><div className="flex justify-between text-[10px]" style={{ color: 'var(--t8-text-muted)' }}><span>{PHASE_LABELS[phase] || phase}</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded bg-black/25"><div className="h-full bg-rose-400" style={{ width: `${progress}%` }} /></div></div>}
        {error && <div className="whitespace-pre-wrap rounded border border-red-400/30 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-300">{error}</div>}
        {videoUrl && <div className="space-y-1"><LoopingVideo src={videoUrl} controls className="max-h-64 w-full rounded bg-black object-contain" /><div className="truncate text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>{String(d.fileName || videoUrl)}</div></div>}
      </div>
    </div>
  );
}

export default memo(RemotionAnimationNode);
