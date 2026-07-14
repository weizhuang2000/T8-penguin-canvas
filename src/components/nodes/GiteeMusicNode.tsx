import { memo, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Music2, Sparkles } from 'lucide-react';
import { generateExternalMusic } from '../../services/generation';
import { PORT_COLOR } from '../../config/portTypes';
import { useThemeStore } from '../../stores/theme';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import { useOrderedMaterials } from './useOrderedMaterials';
import MentionPromptInput from './MentionPromptInput';
import MaterialPreviewSection from './MaterialPreviewSection';
import type { MediaMention } from './mediaMentions';

const MODEL = 'ACE-Step-v1-3.5B';
const PROVIDER_ID = 'gitee-flux';

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

const inputClass = 'w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-violet-300/60 placeholder:text-white/30';

const GiteeMusicNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const { theme, style: themeStyle } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = themeStyle === 'pixel';
  const d = data as any;
  const upstream = useUpstreamMaterials(id);
  const materialOrder: string[] = Array.isArray(d.materialOrder) ? d.materialOrder : [];
  const orderedTexts = useOrderedMaterials(upstream.texts, materialOrder);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const src = `gitee-music:${id.slice(0, 6)}`;

  const prompt = typeof d.prompt === 'string' ? d.prompt : '';
  const lyrics = typeof d.lyrics === 'string' ? d.lyrics : '';
  const promptMentions: MediaMention[] = Array.isArray(d.promptMentions) ? d.promptMentions : [];
  const status: 'idle' | 'generating' | 'success' | 'error' = d.status || 'idle';
  const busy = status === 'generating';
  const duration = clamp(d.duration, 60, 30, 240);
  const seed = Math.max(0, Math.floor(clamp(d.seed, 0, 0, Number.MAX_SAFE_INTEGER)));
  const inferSteps = Math.round(clamp(d.inferSteps, 60, 1, 60));
  const guidanceScale = clamp(d.guidanceScale, 15, 0, 200);
  const loraName = d.loraName === 'ACE-Step-v1-chinese-rap-LoRA' ? d.loraName : 'None';
  const schedulerType = d.schedulerType === 'heun' ? 'heun' : 'euler';
  const cfgType = ['cfg', 'apg', 'cfg_star'].includes(d.cfgType) ? d.cfgType : 'apg';

  const mentionMaterials = useMemo(() => [], []);
  const finalPrompt = orderedTexts.map((item) => item.url).filter(Boolean).join('\n').trim() || prompt.trim();

  const handleGenerate = async () => {
    setError(null);
    if (!finalPrompt && !lyrics.trim()) {
      const message = '请填写英文音乐风格提示词或歌词。';
      setError(message);
      throw new Error(message);
    }
    taskCompletionSound.primeAudio();
    update({ status: 'generating', error: null, audioUrl: '', audioUrls: [] });
    try {
      logBus.info(`提交 Gitee ACE-Step · ${duration}s · ${inferSteps} steps`, src);
      const result = await generateExternalMusic({
        providerId: PROVIDER_ID,
        providerModel: MODEL,
        model: MODEL,
        prompt: finalPrompt,
        lyrics: lyrics.trim(),
        duration,
        reference_audio_strength: clamp(d.referenceAudioStrength, 0.3, 0, 1),
        lora_name: loraName,
        infer_steps: inferSteps,
        guidance_scale: guidanceScale,
        guidance_scale_text: clamp(d.guidanceScaleText, 0, 0, 200),
        guidance_scale_lyric: clamp(d.guidanceScaleLyric, 0, 0, 200),
        scheduler_type: schedulerType,
        cfg_type: cfgType,
        seeds: seed > 0 ? [seed] : undefined,
        omega_scale: clamp(d.omegaScale, 10, -100, 100),
        guidance_interval: clamp(d.guidanceInterval, 0.5, 0, 1),
        guidance_interval_decay: clamp(d.guidanceIntervalDecay, 0, 0, 1),
        min_guidance_scale: clamp(d.minGuidanceScale, 3, 0, 200),
        use_erg_tag: d.useErgTag !== false,
        use_erg_lyric: d.useErgLyric !== false,
        use_erg_diffusion: d.useErgDiffusion !== false,
        historyContext: {
          canvasId: activeCanvasId,
          sourceNodeId: id,
          sourceNodeType: 'gitee-music',
          nodeTitle: 'Gitee ACE-Step 音乐生成',
          outputTitle: 'ACE-Step 音乐',
          prompt: finalPrompt,
          seed: seed || undefined,
        },
      });
      if (!result.audioUrl) throw new Error('任务完成但没有返回音频文件。');
      update({
        status: 'success',
        audioUrl: result.audioUrl,
        audioUrls: result.audioUrls,
        taskId: result.taskId,
        lastPrompt: finalPrompt,
        error: null,
      });
      logBus.success(`ACE-Step 音乐生成完成 · ${result.audioUrl}`, src);
      taskCompletionSound.notifyComplete(id, 'audio');
    } catch (caught: any) {
      const message = caught?.message || 'Gitee ACE-Step 音乐生成失败';
      setError(message);
      update({ status: 'error', error: message });
      logBus.error(message, src);
      throw caught;
    }
  };

  useRunTrigger(id, async () => {
    if (busy) return;
    await handleGenerate();
  }, 'audio');

  return (
    <div
      className={`relative w-[360px] rounded-xl border-2 transition-all ${selected ? 'border-violet-400 shadow-2xl shadow-violet-500/20' : 'border-white/15 hover:border-white/30'}`}
      style={{ background: 'rgba(20,20,22,.94)', backdropFilter: 'blur(8px)' }}
      data-prompt-template-category="video-music-audio"
      data-prompt-template-value={prompt}
    >
      <Handle type="target" position={Position.Left} style={{ background: PORT_COLOR.text, border: 0 }} />
      <Handle type="source" position={Position.Right} style={{ background: PORT_COLOR.audio, border: 0 }} />

      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-violet-500/20 text-violet-200 ring-1 ring-violet-300/30">
          <Music2 size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">ACE-Step 音乐</div>
          <div className="truncate text-[10px] text-white/45">Gitee AI · {MODEL} · 30–240 秒</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-violet-200" />}
      </div>

      <div className="space-y-2.5 p-3" onMouseDown={(event) => event.stopPropagation()}>
        {orderedTexts.length > 0 && (
          <MaterialPreviewSection
            texts={orderedTexts}
            order={materialOrder}
            onReorder={(nextOrder) => update({ materialOrder: nextOrder })}
            isDark={isDark}
            isPixel={isPixel}
            groups={['text']}
            title="上游音乐描述"
          />
        )}

        <label className="block space-y-1">
          <span className="text-[10px] text-white/55">音乐风格提示词（仅英文）</span>
          <MentionPromptInput
            title="ACE-Step 音乐风格提示词"
            value={prompt}
            mentions={promptMentions}
            materials={mentionMaterials}
            onChange={(value, mentions) => update({ prompt: value, promptMentions: mentions })}
            placeholder="pop, synth, drums, 120 bpm, upbeat, female vocals"
            isDark={isDark}
            isPixel={isPixel}
            promptTemplateKind="video"
            className={`${inputClass} min-h-[72px]`}
          />
          {orderedTexts.length > 0 && <span className="block text-[10px] text-amber-200/80">运行时优先使用上游文本。</span>}
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] text-white/55">歌词</span>
          <textarea
            value={lyrics}
            onChange={(event) => update({ lyrics: event.target.value })}
            placeholder={'[Verse]\n...\n[Chorus]\n...\n\n纯音乐请填写 [instrumental]'}
            rows={7}
            className={`${inputClass} nodrag resize-y leading-relaxed`}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] text-white/55">时长（30–240 秒）</span>
            <input type="number" min={30} max={240} value={duration} onChange={(event) => update({ duration: Number(event.target.value) })} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/55">随机种子（0=随机）</span>
            <input type="number" min={0} value={seed} onChange={(event) => update({ seed: Number(event.target.value) })} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/55">LoRA</span>
            <select value={loraName} onChange={(event) => update({ loraName: event.target.value })} className={inputClass}>
              <option value="None" className="bg-zinc-900">无</option>
              <option value="ACE-Step-v1-chinese-rap-LoRA" className="bg-zinc-900">中文说唱</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-white/55">推理步数</span>
            <input type="number" min={1} max={60} value={inferSteps} onChange={(event) => update({ inferSteps: Number(event.target.value) })} className={inputClass} />
          </label>
        </div>

        <button type="button" className="flex w-full items-center justify-between rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/60 hover:bg-white/[0.08]" onClick={() => setShowAdvanced((value) => !value)}>
          <span>高级推理参数</span>
          {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-2 rounded border border-violet-300/15 bg-violet-400/[0.04] p-2">
            <label className="space-y-1"><span className="text-[10px] text-white/50">Guidance</span><input type="number" min={0} max={200} value={guidanceScale} onChange={(event) => update({ guidanceScale: Number(event.target.value) })} className={inputClass} /></label>
            <label className="space-y-1"><span className="text-[10px] text-white/50">最小 Guidance</span><input type="number" min={0} max={200} value={clamp(d.minGuidanceScale, 3, 0, 200)} onChange={(event) => update({ minGuidanceScale: Number(event.target.value) })} className={inputClass} /></label>
            <label className="space-y-1"><span className="text-[10px] text-white/50">调度器</span><select value={schedulerType} onChange={(event) => update({ schedulerType: event.target.value })} className={inputClass}><option value="euler" className="bg-zinc-900">euler</option><option value="heun" className="bg-zinc-900">heun</option></select></label>
            <label className="space-y-1"><span className="text-[10px] text-white/50">CFG 类型</span><select value={cfgType} onChange={(event) => update({ cfgType: event.target.value })} className={inputClass}><option value="apg" className="bg-zinc-900">apg</option><option value="cfg" className="bg-zinc-900">cfg</option><option value="cfg_star" className="bg-zinc-900">cfg_star</option></select></label>
            <label className="space-y-1"><span className="text-[10px] text-white/50">Omega Scale</span><input type="number" min={-100} max={100} value={clamp(d.omegaScale, 10, -100, 100)} onChange={(event) => update({ omegaScale: Number(event.target.value) })} className={inputClass} /></label>
            <label className="space-y-1"><span className="text-[10px] text-white/50">Guidance 区间</span><input type="number" min={0} max={1} step={0.1} value={clamp(d.guidanceInterval, 0.5, 0, 1)} onChange={(event) => update({ guidanceInterval: Number(event.target.value) })} className={inputClass} /></label>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded border border-red-400/25 bg-red-500/10 p-2 text-[11px] text-red-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleGenerate().catch(() => undefined)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/20 hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {busy ? '生成中（异步任务轮询）' : '生成音乐'}
        </button>
        <div className="text-center text-[10px] leading-relaxed text-white/35">使用 API 设置 → 扩展平台 → Gitee Flux 中的 Token</div>
      </div>
    </div>
  );
};

export default memo(GiteeMusicNode);
