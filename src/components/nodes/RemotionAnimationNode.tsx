import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Brain, CheckCircle2, Clapperboard, Code2, FileJson, Loader2, Play, Sparkles, Square } from 'lucide-react';
import { DEFAULT_LLM_MODEL, LLM_MODELS } from '../../providers/models';
import { generateExternalLlm, generateLlm, type LlmContentPart, type LlmMessage } from '../../services/generation';
import {
  cancelRemotionJob,
  createRemotionJob,
  getRemotionJob,
  validateRemotionSpec,
  type RemotionAssetInput,
  type RemotionFps,
  type RemotionJob,
  type RemotionMode,
  type RemotionProfile,
  type RemotionRatio,
  type RemotionResolution,
} from '../../services/remotion';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { useThemeStore } from '../../stores/theme';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import {
  countExcludedMaterials,
  excludeMaterialId,
  filterExcludedMaterials,
  normalizeExcludedMaterialIds,
} from '../../utils/materialExclusion';
import LoopingVideo from '../LoopingVideo';
import MaterialPreviewSection from './MaterialPreviewSection';
import { useOrderedMaterials } from './useOrderedMaterials';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import { useUpdateNodeData } from './useUpdateNodeData';

const JSON_SCHEMA_GUIDE = `输出严格 JSON，不要 Markdown 代码块。结构：
{
  "version":"t8-remotion/v1",
  "assets":[{"id":"asset-1","kind":"image|video|audio","label":"..."}],
  "scenes":[{
    "id":"scene-1","start":0,"duration":8,"background":"#09090b","transition":"none|fade|slide-left|slide-right|wipe",
    "layers":[
      {"id":"title","type":"text","start":0,"duration":4,"x":0,"y":0,"width":0.8,"height":0.3,"text":"标题","color":"#fff","fontSize":84,"fontWeight":700,"textAlign":"center","lineHeight":1.2,"enter":{"type":"fade|slide-up|scale|typewriter","duration":0.6,"delay":0}},
      {"id":"visual","type":"image|video","assetId":"asset-1","start":0,"duration":8,"x":0,"y":0,"width":1,"height":1,"objectFit":"cover","opacity":1,"rotation":0,"scale":1},
      {"id":"music","type":"audio","assetId":"asset-2","start":0,"duration":8,"volume":0.8,"loop":true,"trimStart":0},
      {"id":"shape","type":"shape","start":0,"duration":8,"x":0,"y":0,"width":1,"height":1,"shape":"rect","fill":"#111827"}
    ]
  }]
}
坐标 x/y 范围 -1..1，width/height 是画面比例 0..2；场景不得超出总时长，图像/视频/音频只能引用给定素材 ID。`;

const TSX_GUIDE = `输出单个 TSX 模块，不要 Markdown 代码块。必须命名导出：
export const GeneratedComposition: React.FC<any> = ({assets, profile, subject}) => { ... };
仅可导入 react、remotion、@remotion/media、@remotion/transitions 及其官方转场子路径。
素材用 assets.find(a=>a.id==='asset-1') 获取，并用 staticFile('assets/'+asset.src) 转为地址；图片必须用 Remotion Img，视频/音频用 @remotion/media。
所有动画必须通过 useCurrentFrame() 与 useVideoConfig() 按帧计算，Sequence 必须设置 premountFor={fps}。禁止 CSS animation/transition、网络请求、浏览器存储、动态 import、eval、进程或文件系统 API。`;

function stripFence(value: string) {
  return String(value || '').trim().replace(/^```(?:json|tsx|typescript|ts|jsx)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function probeDuration(material: Material): Promise<number | null> {
  if (material.kind !== 'video' && material.kind !== 'audio') return Promise.resolve(null);
  return new Promise((resolve) => {
    const media = document.createElement(material.kind) as HTMLMediaElement;
    const timer = window.setTimeout(() => finish(null), 8000);
    const finish = (value: number | null) => {
      window.clearTimeout(timer);
      media.removeAttribute('src');
      media.load();
      resolve(value);
    };
    media.preload = 'metadata';
    media.onloadedmetadata = () => finish(Number.isFinite(media.duration) ? media.duration : null);
    media.onerror = () => finish(null);
    media.src = material.url;
  });
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
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const { theme, style } = useThemeStore();
  const [localError, setLocalError] = useState('');
  const pollingRef = useRef(false);

  const mode: RemotionMode = d.remotionMode === 'tsx' ? 'tsx' : 'json';
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

  const llmProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'llm'), [advancedProviders]);
  const selection = useMemo(() => resolveAdvancedProviderSelection(advancedProviders, 'llm', {
    providerSource: d.providerSource,
    providerId: d.providerId,
    providerModel: d.providerModel,
  }), [advancedProviders, d.providerId, d.providerModel, d.providerSource]);
  const isExternal = selection.available && selection.providerSource !== 'zhenzhen';
  const externalModels = selection.provider ? advancedProviderModelOptions(selection.provider, 'llm') : [];
  const externalModel = selection.providerModel || externalModels[0] || '';
  const model = String(d.model || DEFAULT_LLM_MODEL);
  const busy = ['describing', 'validating', 'queued', 'preparing', 'bundling', 'runtime-check', 'runtime-download', 'rendering'].includes(String(d.remotionPhase || ''));
  const excludedCount = countExcludedMaterials(excludedIds, allMaterials);
  const jobId = String(d.remotionJobId || '');

  useEffect(() => {
    if (allowZhenzhenFallback || isExternal || !llmProviders[0]) return;
    const provider = llmProviders[0];
    update({ providerSource: provider.protocol, providerId: provider.id, providerModel: advancedProviderModelOptions(provider, 'llm')[0] || '' });
  }, [allowZhenzhenFallback, isExternal, llmProviders, update]);

  const applyJob = useCallback((job: RemotionJob) => {
    const patch: Record<string, unknown> = {
      remotionJobId: job.id,
      remotionPhase: job.phase,
      remotionProgress: job.progress,
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

  const pollJob = useCallback(async (targetId: string) => {
    if (!targetId || pollingRef.current) return;
    pollingRef.current = true;
    try {
      for (;;) {
        const job = await getRemotionJob(targetId);
        applyJob(job);
        if (['success', 'error', 'cancelled'].includes(job.status)) {
          if (job.status === 'error') throw new Error(job.error || 'Remotion 渲染失败');
          return job;
        }
        await wait(1000);
      }
    } finally {
      pollingRef.current = false;
    }
  }, [applyJob]);

  useEffect(() => {
    if (jobId && ['queued', 'preparing', 'bundling', 'runtime-check', 'runtime-download', 'rendering'].includes(String(d.remotionPhase || ''))) {
      void pollJob(jobId).catch((error) => setLocalError(error.message || String(error)));
    }
  }, [d.remotionPhase, jobId, pollJob]);

  const callLlm = useCallback(async (messages: LlmMessage[]) => {
    if (isExternal && selection.provider) {
      if (!externalModel) throw new Error('请选择外部 LLM 模型');
      return generateExternalLlm({
        providerId: selection.provider.id,
        providerModel: externalModel,
        model: externalModel,
        messages,
        temperature: 0.3,
        max_tokens: mode === 'tsx' ? 32000 : 16000,
        providerParams: d.providerParams || {},
        llmVideoMode: 'frames',
        videoFrameCount: 8,
      });
    }
    return generateLlm({ model, messages, temperature: 0.3, max_tokens: mode === 'tsx' ? 32000 : 16000, llmVideoMode: 'frames', videoFrameCount: 8 });
  }, [d.providerParams, externalModel, isExternal, mode, model, selection.provider]);

  const buildMessages = useCallback(async (): Promise<LlmMessage[]> => {
    const durations = await Promise.all(mediaMaterials.map((item) => probeDuration(item)));
    const manifest = assets.map((asset, index) => ({
      id: asset.id,
      kind: asset.kind,
      label: asset.label,
      durationSeconds: durations[index] == null ? undefined : Number(durations[index]!.toFixed(3)),
      format: asset.url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || 'unknown',
    }));
    const textContext = orderedTexts.map((item) => item.url).join('\n\n');
    const guide = mode === 'tsx' ? TSX_GUIDE : JSON_SCHEMA_GUIDE;
    const prompt = `为 Remotion 生成一段可直接渲染的动画描述。\n\n主题/文案：\n${subject || '(未填写，依据上游素材创作)'}\n\n上游文本：\n${textContext || '(无)'}\n\n输出配置：${profile.ratio}，${profile.resolution}，${profile.fps}fps，总时长 ${profile.duration} 秒。\n\n素材清单：\n${JSON.stringify(manifest, null, 2)}\n\n${guide}`;
    const content: LlmContentPart[] = [{ type: 'text', text: prompt }];
    orderedImages.slice(0, 12).forEach((item) => content.push({ type: 'image_url', image_url: { url: item.url } }));
    orderedVideos.slice(0, 4).forEach((item) => content.push({ type: 'video_url', video_url: { url: item.url } }));
    return [
      { role: 'system', content: '你是 Remotion 动画编排专家。严格遵守输出契约，只返回目标 JSON 或 TSX 源码。所有动画必须确定性地按帧渲染。' },
      { role: 'user', content },
    ];
  }, [assets, mediaMaterials, mode, orderedImages, orderedTexts, orderedVideos, profile, subject]);

  const generateDescription = useCallback(async () => {
    if (!subject.trim() && orderedMaterials.length === 0) throw new Error('请输入主题/文本或连接上游素材');
    setLocalError('');
    update({ remotionPhase: 'describing', remotionProgress: 0, status: 'generating', error: '' });
    const response = await callLlm(await buildMessages());
    let next = stripFence(response.content);
    update({ remotionSource: next, remotionPhase: 'validating', remotionProgress: 0 });
    try {
      await validateRemotionSpec({ mode, source: next, assets, profile });
    } catch (firstError: any) {
      const repair = await callLlm([
        { role: 'system', content: '修复下面的 Remotion 描述。只返回修复后的完整 JSON 或 TSX，不要解释。' },
        { role: 'user', content: `模式：${mode}\n校验错误：\n${firstError.message}\n\n待修复内容：\n${next}` },
      ]);
      next = stripFence(repair.content);
      update({ remotionSource: next });
      await validateRemotionSpec({ mode, source: next, assets, profile });
    }
    update({ remotionSource: next, remotionPhase: 'described', remotionProgress: 0, status: 'idle', error: '' });
    logBus.success('Remotion 描述已生成并通过校验', `remotion:${id}`);
    return next;
  }, [assets, buildMessages, callLlm, id, mode, orderedMaterials.length, profile, subject, update]);

  const renderDescription = useCallback(async (value?: string) => {
    const renderSource = String(value ?? source).trim();
    if (!renderSource) throw new Error('请先生成或输入 Remotion 描述');
    setLocalError('');
    update({ remotionPhase: 'validating', status: 'generating', error: '', videoUrl: '', videoUrls: [] });
    await validateRemotionSpec({ mode, source: renderSource, assets, profile });
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
    applyJob(job);
    const completed = await pollJob(job.id);
    if (completed?.status === 'success') logBus.success('Remotion 动画渲染完成', `remotion:${id}`);
    return completed;
  }, [activeCanvasId, applyJob, assets, id, mode, pollJob, profile, source, subject, update]);

  const generateAndRender = useCallback(async () => {
    try {
      const next = await generateDescription();
      await renderDescription(next);
    } catch (error: any) {
      const message = error?.message || 'Remotion 生成失败';
      setLocalError(message);
      update({ remotionPhase: 'error', status: 'error', error: message });
      throw error;
    }
  }, [generateDescription, renderDescription, update]);

  useRunTrigger(id, generateAndRender, 'remotion-animation');

  const cancel = async () => {
    if (!jobId) return;
    try { applyJob(await cancelRemotionJob(jobId)); }
    catch (error: any) { setLocalError(error?.message || '取消失败'); }
  };

  const invoke = async (fn: () => Promise<unknown>) => {
    try { await fn(); }
    catch (error: any) {
      const message = error?.message || '操作失败';
      setLocalError(message);
      update({ remotionPhase: 'error', status: 'error', error: message });
    }
  };

  const error = localError || String(d.error || '');
  const phase = String(d.remotionPhase || 'idle');
  const progress = Math.max(0, Math.min(100, Number(d.remotionProgress) || 0));
  const videoUrl = String(d.videoUrl || '');

  return (
    <div className={`t8-node overflow-hidden ${selected ? 'ring-2' : ''}`} style={{ width: 520, borderColor: selected ? 'var(--t8-accent)' : 'var(--t8-border-strong)' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#fb7185', border: '1px solid var(--t8-bg-node)' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#fb7185', border: '1px solid var(--t8-bg-node)' }} />
      <div className="t8-node-header flex items-center gap-2 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-400 text-rose-950"><Clapperboard size={17} /></div>
        <div className="min-w-0 flex-1"><div className="text-sm font-bold">Remotion 动画</div><div className="truncate text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>{mode === 'tsx' ? '专家 TSX' : 'JSON DSL'} · {profile.ratio} · {profile.resolution} · {profile.fps}fps</div></div>
        {phase === 'success' ? <CheckCircle2 size={15} className="text-emerald-400" /> : busy ? <Loader2 size={15} className="animate-spin text-rose-300" /> : <Brain size={15} className="text-rose-300" />}
      </div>

      <div className="nodrag nowheel space-y-2 p-3" onMouseDown={(event) => event.stopPropagation()}>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}><span>LLM 来源</span><select className="t8-select w-full px-2 py-1.5 text-xs" value={isExternal ? selection.providerId : 'zhenzhen'} disabled={busy} onChange={(event) => {
            if (event.target.value === 'zhenzhen') update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
            else {
              const provider = llmProviders.find((item) => item.id === event.target.value);
              if (provider) update({ providerSource: provider.protocol, providerId: provider.id, providerModel: advancedProviderModelOptions(provider, 'llm')[0] || '' });
            }
          }}>
            {allowZhenzhenFallback && <option value="zhenzhen">LLM 独立 Key</option>}
            {llmProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label || provider.id}</option>)}
          </select></label>
          <label className="space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}><span>LLM 模型</span>{isExternal ? <select className="t8-select w-full px-2 py-1.5 text-xs" value={externalModel} disabled={busy} onChange={(event) => update({ providerModel: event.target.value })}>{externalModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <select className="t8-select w-full px-2 py-1.5 text-xs" value={model} disabled={busy} onChange={(event) => update({ model: event.target.value })}>{LLM_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}</label>
        </div>

        <label className="block space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}><span>主体或文本</span><textarea className="t8-input min-h-20 w-full resize-y px-2 py-1.5 text-xs" value={subject} disabled={busy} placeholder="例如：为新产品发布制作一段 8 秒科技感标题动画" onChange={(event) => update({ remotionSubject: event.target.value })} /></label>

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

        <div className="grid grid-cols-5 gap-1.5">
          <select className="t8-select col-span-1 px-1 py-1.5 text-[10px]" value={mode} disabled={busy} onChange={(event) => update({ remotionMode: event.target.value, remotionSource: '' })}><option value="json">JSON DSL</option><option value="tsx">专家 TSX</option></select>
          <select className="t8-select px-1 py-1.5 text-[10px]" value={profile.ratio} disabled={busy} onChange={(event) => update({ remotionRatio: event.target.value })}>{['16:9', '9:16', '1:1'].map((item) => <option key={item}>{item}</option>)}</select>
          <select className="t8-select px-1 py-1.5 text-[10px]" value={profile.resolution} disabled={busy} onChange={(event) => update({ remotionResolution: event.target.value })}>{['720p', '1080p'].map((item) => <option key={item}>{item}</option>)}</select>
          <select className="t8-select px-1 py-1.5 text-[10px]" value={profile.fps} disabled={busy} onChange={(event) => update({ remotionFps: Number(event.target.value) })}>{[24, 30, 60].map((item) => <option key={item} value={item}>{item}fps</option>)}</select>
          <input className="t8-input px-1 py-1.5 text-[10px]" type="number" min={1} max={60} value={profile.duration} disabled={busy} title="时长（秒）" onChange={(event) => update({ remotionDuration: Math.max(1, Math.min(60, Number(event.target.value) || 8)) })} />
        </div>

        {mode === 'tsx' && <div className="flex items-start gap-1.5 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-200"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>专家模式会编译受限 TSX。仅允许白名单 Remotion API，并在独立子进程中限时渲染。</span></div>}

        <label className="block space-y-1 text-[10px]" style={{ color: 'var(--t8-text-muted)' }}><span className="flex items-center gap-1">{mode === 'tsx' ? <Code2 size={12} /> : <FileJson size={12} />} Remotion 描述</span><textarea className="t8-input min-h-48 w-full resize-y px-2 py-1.5 font-mono text-[10px] leading-relaxed" value={source} disabled={busy} placeholder={mode === 'tsx' ? '生成或粘贴受限 Remotion TSX...' : '生成或粘贴 t8-remotion/v1 JSON...'} onChange={(event) => update({ remotionSource: event.target.value, remotionPhase: 'edited' })} /></label>

        <div className="grid grid-cols-3 gap-1.5">
          <button className="t8-btn px-2 py-1.5 text-[11px]" disabled={busy} onClick={() => void invoke(generateDescription)}><Brain size={13} />生成描述</button>
          <button className="t8-btn px-2 py-1.5 text-[11px]" disabled={busy || !source.trim()} onClick={() => void invoke(() => renderDescription())}><Play size={13} />渲染动画</button>
          {busy ? <button className="t8-btn px-2 py-1.5 text-[11px]" onClick={() => void cancel()}><Square size={13} />取消</button> : <button className="t8-btn t8-btn-primary px-2 py-1.5 text-[11px]" onClick={() => void invoke(generateAndRender)}><Sparkles size={13} />生成并渲染</button>}
        </div>

        {busy && <div className="space-y-1"><div className="flex justify-between text-[10px]" style={{ color: 'var(--t8-text-muted)' }}><span>{phase === 'runtime-download' ? '首次下载 Remotion 浏览器运行时' : phase}</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded bg-black/25"><div className="h-full bg-rose-400" style={{ width: `${progress}%` }} /></div></div>}
        {error && <div className="whitespace-pre-wrap rounded border border-red-400/30 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-300">{error}</div>}
        {videoUrl && <div className="space-y-1"><LoopingVideo src={videoUrl} controls className="max-h-64 w-full rounded bg-black object-contain" /><div className="truncate text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>{String(d.fileName || videoUrl)}</div></div>}
      </div>
    </div>
  );
}

export default memo(RemotionAnimationNode);
