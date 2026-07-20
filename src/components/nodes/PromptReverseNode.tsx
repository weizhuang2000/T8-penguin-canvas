import { memo, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, type NodeProps } from '@xyflow/react';
import { BrainCircuit, Copy, ImagePlus, Loader2, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { DEFAULT_LLM_MODEL } from '../../providers/models';
import { fileToDataUrl, generateLlm } from '../../services/generation';
import { useApiKeysStore } from '../../stores/apiKeys';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { PORT_COLOR } from '../../config/portTypes';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useThemeStore } from '../../stores/theme';
import {
  buildPromptReverseContentSwapMessages,
  buildPromptReverseMessages,
  cleanPromptReverseOutput,
  normalizePromptReverseLanguage,
  normalizePromptReverseStrength,
  PROMPT_REVERSE_STRENGTHS,
  type PromptReverseLanguage,
  type PromptReverseStrength,
} from '../../utils/promptReverse';
import PromptTextarea from '../PromptTextarea';
import MaterialPreviewSection from './MaterialPreviewSection';
import NodeHelpButton from './NodeHelpButton';
import { useOrderedMaterials } from './useOrderedMaterials';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';

const FIELD = 'nodrag w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-[var(--t8-text-main)] outline-none focus:border-emerald-400/60 disabled:opacity-50';
type RunningAction = 'reverse' | 'swap' | null;

const PromptReverseNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const d = data as any;
  const fileRef = useRef<HTMLInputElement>(null);
  const [localImages, setLocalImages] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [copyLabel, setCopyLabel] = useState('复制');
  const [runningAction, setRunningAction] = useState<RunningAction>(null);
  const configuredModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const { theme, style } = useThemeStore();
  const upstream = useUpstreamMaterials(id);
  const inputConnections = useNodeConnections({ id, handleType: 'target' });
  const imageSourceIds = useMemo(() => new Set(inputConnections
    .filter((connection: any) => !connection.targetHandle || connection.targetHandle === 'image')
    .map((connection) => connection.source)), [inputConnections]);
  const contentSourceIds = useMemo(() => new Set(inputConnections
    .filter((connection: any) => connection.targetHandle === 'content-text')
    .map((connection) => connection.source)), [inputConnections]);
  const upstreamImages = useMemo(
    () => upstream.images.filter((item) => imageSourceIds.has(item.sourceNodeId)),
    [imageSourceIds, upstream.images],
  );
  const contentMaterials = useMemo(
    () => upstream.texts.filter((item) => contentSourceIds.has(item.sourceNodeId)),
    [contentSourceIds, upstream.texts],
  );
  const contentText = useMemo(
    () => contentMaterials.map((item) => item.url.trim()).filter(Boolean).join('\n\n'),
    [contentMaterials],
  );
  const materialOrder: string[] = Array.isArray(d.materialOrder) ? d.materialOrder : [];
  const localMaterials: Material[] = useMemo(() => localImages.map((item, index) => ({
    id: `local::prompt-reverse:${index}:${item.name}`,
    kind: 'image' as const,
    url: item.dataUrl,
    sourceNodeId: id,
    origin: 'local' as const,
    label: item.name || `本地图 ${index + 1}`,
  })), [id, localImages]);
  const orderedImages = useOrderedMaterials([...localMaterials, ...upstreamImages], materialOrder);
  const strength = normalizePromptReverseStrength(d.detailStrength);
  const language = normalizePromptReverseLanguage(d.outputLanguage);
  const status = String(d.status || 'idle');
  const busy = status === 'generating';
  const output = String(d.outputText || d.prompt || '');
  const instruction = String(d.instruction || '');
  const contentSwapEnabled = d.contentSwapEnabled === true;

  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length ? saved : [{ id: 'default', label: '默认 LLM', model: configuredModel, isDefault: true }];
  }, [configuredModel, llmConfigs]);
  const activeConfig = llmConfigOptions.find((item) => item.id === String(d.llmKeyId || ''))
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const model = String(activeConfig?.model || configuredModel).trim() || DEFAULT_LLM_MODEL;
  const strengthConfig = PROMPT_REVERSE_STRENGTHS.find((item) => item.value === strength)!;
  const src = `提示词反推·${model}·#${id.slice(-4)}`;

  const requestContentSwap = async (basePrompt: string, nextContentText: string) => {
    const response = await generateLlm({
      model,
      llmKeyId: activeConfig?.id && activeConfig.id !== 'default' ? activeConfig.id : undefined,
      sourceNodeType: 'prompt-reverse',
      temperature: 0.2,
      max_tokens: strengthConfig.maxTokens,
      messages: buildPromptReverseContentSwapMessages({
        prompt: basePrompt,
        contentText: nextContentText,
        language,
      }),
    });
    const swappedPrompt = cleanPromptReverseOutput(response.content);
    if (!swappedPrompt) throw new Error('LLM 未返回有效的换内容提示词。');
    return swappedPrompt;
  };

  const pickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: Array<{ name: string; dataUrl: string }> = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        next.push({ name: file.name, dataUrl: await fileToDataUrl(file) });
      } catch (error: any) {
        logBus.warn(`图片读取失败：${error?.message || '未知错误'}`, src);
      }
    }
    if (next.length) setLocalImages((current) => [...current, ...next].slice(0, 10));
    if (fileRef.current) fileRef.current.value = '';
  };

  const runReverse = async (rethrow = false) => {
    if (busy) return;
    const imageUrls = orderedImages.map((item) => item.url).filter(Boolean).slice(0, 10);
    if (!imageUrls.length) {
      update({ status: 'error', error: '请连接或上传至少一张需要反推的图片。' });
      return;
    }
    if (contentSwapEnabled && !contentText) {
      update({ status: 'error', error: '“换内容”已开启，请先连接内容文本。' });
      return;
    }
    taskCompletionSound.primeAudio();
    setRunningAction('reverse');
    update({ status: 'generating', error: '', progress: '正在反推提示词…', llmKeyId: activeConfig?.id || '', llmModel: model });
    logBus.info(`开始反推 · ${strengthConfig.label} · ${imageUrls.length} 图`, src);
    let reversePrompt = '';
    try {
      const response = await generateLlm({
        model,
        llmKeyId: activeConfig?.id && activeConfig.id !== 'default' ? activeConfig.id : undefined,
        sourceNodeType: 'prompt-reverse',
        temperature: 0.2,
        max_tokens: strengthConfig.maxTokens,
        messages: buildPromptReverseMessages({ imageUrls, strength, language, instruction }),
      });
      reversePrompt = cleanPromptReverseOutput(response.content);
      if (!reversePrompt) throw new Error('识图模型未返回有效提示词。');
      let prompt = reversePrompt;
      if (contentSwapEnabled) {
        setRunningAction('swap');
        update({ progress: '正在替换提示词内容…' });
        logBus.info(`反推完成，开始换内容 · ${contentText.length} 字`, src);
        prompt = await requestContentSwap(reversePrompt, contentText);
      }
      update({
        status: 'success',
        error: '',
        progress: '',
        prompt,
        outputText: prompt,
        text: prompt,
        lastReversePrompt: reversePrompt,
        lastContentText: contentSwapEnabled ? contentText : '',
        sourceImageUrls: imageUrls,
        lastDetailStrength: strength,
        lastOutputLanguage: language,
        llmKeyId: activeConfig?.id || '',
        llmModel: model,
      });
      logBus.success(`${contentSwapEnabled ? '反推并换内容完成' : '反推完成'} · ${prompt.length} 字`, src);
      taskCompletionSound.notifyComplete(id, 'llm');
    } catch (error: any) {
      const message = error?.message || '提示词反推失败';
      update({
        status: 'error',
        error: message,
        progress: '',
        ...(reversePrompt ? {
          prompt: reversePrompt,
          outputText: reversePrompt,
          text: reversePrompt,
          lastReversePrompt: reversePrompt,
        } : {}),
      });
      logBus.error(message, src);
      if (rethrow) throw error;
    } finally {
      setRunningAction(null);
    }
  };

  const runContentSwap = async () => {
    if (busy) return;
    if (!output.trim()) {
      update({ status: 'error', error: '请先生成反推结果，再执行换内容。' });
      return;
    }
    if (!contentText) {
      update({ status: 'error', error: '请先连接内容文本。' });
      return;
    }
    taskCompletionSound.primeAudio();
    setRunningAction('swap');
    update({ status: 'generating', error: '', progress: '正在替换提示词内容…', llmKeyId: activeConfig?.id || '', llmModel: model });
    logBus.info(`开始换内容 · ${contentText.length} 字`, src);
    try {
      const prompt = await requestContentSwap(output, contentText);
      update({
        status: 'success',
        error: '',
        progress: '',
        prompt,
        outputText: prompt,
        text: prompt,
        lastContentText: contentText,
        llmKeyId: activeConfig?.id || '',
        llmModel: model,
      });
      logBus.success(`换内容完成 · ${prompt.length} 字`, src);
      taskCompletionSound.notifyComplete(id, 'llm');
    } catch (error: any) {
      const message = error?.message || '换内容失败';
      update({ status: 'error', error: message, progress: '' });
      logBus.error(message, src);
    } finally {
      setRunningAction(null);
    }
  };

  useRunTrigger(id, () => runReverse(true), 'llm');

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyLabel('已复制');
      window.setTimeout(() => setCopyLabel('复制'), 1200);
    } catch {
      setCopyLabel('复制失败');
    }
  };

  return (
    <div className="w-[380px] overflow-hidden rounded-xl border border-emerald-400/30 bg-[var(--t8-node-bg)] text-[var(--t8-text-main)] shadow-xl">
      <Handle type="target" position={Position.Left} style={{ background: PORT_COLOR.image, top: '34%' }} title="输入图像" />
      <Handle id="content-text" type="target" position={Position.Left} style={{ background: PORT_COLOR.text, top: '68%' }} title="输入内容文本" />
      <Handle type="source" position={Position.Right} style={{ background: PORT_COLOR.text }} title="输出 GPT Image 2 提示词" />

      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <BrainCircuit size={16} className="text-emerald-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-emerald-100">提示词反推</div>
          <div className="truncate text-[10px] text-white/45">LLM 识图 · GPT Image 2 专用提示词</div>
        </div>
        <NodeHelpButton
          nodeType="prompt-reverse"
          title="查看提示词反推节点帮助"
          size={16}
          className="relative z-[70] !h-6 !w-6 shrink-0 !border-emerald-300/70 !bg-emerald-400/15 !text-emerald-100 hover:!bg-emerald-400/30"
        />
      </header>

      <div className="nodrag space-y-2.5 p-3" onMouseDown={(event) => event.stopPropagation()}>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => void pickImages(event.target.files)} />
        <MaterialPreviewSection
          images={orderedImages}
          order={materialOrder}
          onReorder={(next) => update({ materialOrder: next })}
          onRemoveLocal={(material) => setLocalImages((items) => items.filter((item) => item.dataUrl !== material.url))}
          groups={['image']}
          imageUploadAction={{ onClick: () => fileRef.current?.click(), title: '上传识图素材', remaining: Math.max(0, 10 - orderedImages.length) }}
          title="识图素材（图 1 为主体）"
          selected={selected}
          isDark={theme === 'dark'}
          isPixel={style === 'pixel'}
        />
        {orderedImages.length === 0 && (
          <button type="button" className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-emerald-300/30 py-5 text-xs text-emerald-200/75 hover:bg-emerald-400/10" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={15} /> 连接上游图片或点击上传
          </button>
        )}

        <div className="space-y-1.5 rounded border border-amber-300/20 bg-amber-300/[0.05] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-amber-100/85">内容文本</div>
              <div className="truncate text-[9px] text-white/40" title={contentText || '未连接'}>
                {contentText ? `已接入 ${contentMaterials.length} 段` : '未连接'}
              </div>
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-white/65">
              <span>换内容</span>
              <button
                type="button"
                role="switch"
                aria-checked={contentSwapEnabled}
                disabled={busy}
                title="开启后，运行反推时自动完成内容替换"
                className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${contentSwapEnabled ? 'border-amber-300/60 bg-amber-300/25' : 'border-white/15 bg-white/10'} disabled:cursor-not-allowed disabled:opacity-45`}
                onClick={() => update({ contentSwapEnabled: !contentSwapEnabled })}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${contentSwapEnabled ? 'translate-x-4.5 bg-amber-200' : 'translate-x-0.5 bg-white/50'}`} />
              </button>
            </label>
          </div>
          {contentText && <div className="max-h-16 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/55">{contentText}</div>}
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] text-white/55">识图 LLM（来自独立配置）</span>
          <select className={FIELD} value={activeConfig?.id || 'default'} disabled={busy} onChange={(event) => {
            const next = llmConfigOptions.find((item) => item.id === event.target.value);
            update({ llmKeyId: event.target.value, llmModel: next?.model || configuredModel });
          }}>
            {llmConfigOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}{item.model ? ` · ${item.model}` : ''}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[10px] text-white/55">细节强度</span>
            <select className={FIELD} value={strength} disabled={busy} onChange={(event) => update({ detailStrength: event.target.value as PromptReverseStrength })}>
              {PROMPT_REVERSE_STRENGTHS.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.description}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-white/55">输出语言</span>
            <select className={FIELD} value={language} disabled={busy} onChange={(event) => update({ outputLanguage: event.target.value as PromptReverseLanguage })}>
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <div className="text-[10px] leading-relaxed text-white/40">{strengthConfig.description}，{strengthConfig.lengthGuide}。</div>

        <PromptTextarea
          title="提示词反推补充要求"
          value={instruction}
          onValueChange={(value) => update({ instruction: value })}
          disabled={busy}
          readOnly={busy}
          placeholder="可选：例如保留画面文字、强调镜头语言、忽略水印"
          rows={2}
          className={`${FIELD} resize-y leading-relaxed`}
          promptTemplateKind={false}
        />

        <button
          type="button"
          disabled={busy || orderedImages.length === 0 || (contentSwapEnabled && !contentText)}
          title={contentSwapEnabled && !contentText ? '请先连接内容文本' : undefined}
          onClick={() => void runReverse()}
          className="flex w-full items-center justify-center gap-2 rounded bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {busy
            ? (runningAction === 'swap' ? `正在用 ${model} 换内容…` : `正在用 ${model} 识图…`)
            : (contentSwapEnabled ? '反推并换内容' : '反推 GPT Image 2 提示词')}
        </button>

        {(output || d.error) && (
          <section className="space-y-1.5 rounded border border-white/10 bg-black/20 p-2">
            <div className="flex items-center justify-between text-[10px] text-white/55">
              <span>{output ? '反推结果' : '运行信息'}</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={!output} onClick={() => void copyOutput()} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-white/10 disabled:opacity-40"><Copy size={11} />{copyLabel}</button>
                <button type="button" disabled={!output || !contentText || busy} onClick={() => void runContentSwap()} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-amber-300/10 disabled:opacity-40" title={contentText ? '用接入文本替换当前提示词的内容' : '请先连接内容文本'}><RefreshCw size={11} />换内容</button>
                <button type="button" disabled={!output || busy} onClick={() => update({ prompt: '', outputText: '', text: '', error: '', progress: '', status: 'idle', lastReversePrompt: '', lastContentText: '' })} className="rounded p-1 hover:bg-white/10 disabled:opacity-40" title="清空结果"><RotateCcw size={11} /></button>
              </div>
            </div>
            {d.error && <div className="text-[11px] leading-relaxed text-rose-300">{String(d.error)}</div>}
            {output && (
              <PromptTextarea
                title="GPT Image 2 提示词"
                value={output}
                onValueChange={(value) => update({ prompt: value, outputText: value, text: value })}
                disabled={busy}
                readOnly={busy}
                rows={7}
                className={`${FIELD} resize-y leading-relaxed`}
                promptTemplateKind="image"
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default memo(PromptReverseNode);
