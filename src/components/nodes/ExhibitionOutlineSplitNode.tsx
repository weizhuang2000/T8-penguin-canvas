import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { Brain, Clipboard, FileText, Image as ImageIcon, Layers3, Loader2, Play, Sparkles, Upload } from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { DEFAULT_LLM_MODEL } from '../../providers/models';
import { extractDocument, MAX_DOCUMENT_FILE_SIZE, MAX_DOCUMENT_FILE_SIZE_MB, type ExtractedDocument } from '../../services/api';
import { generateLlm } from '../../services/generation';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';
import { materialSetItemsToData, type MaterialSetItem } from '../../utils/materialSet';
import { placeSingleNode } from '../../utils/nodePlacement';
import {
  buildExhibitionOutlineSplitPrompt,
  cleanOutlineText,
  fallbackOutlineSplit,
  formatOutlineSegments,
  MAX_OUTLINE_SEGMENT_COUNT,
  normalizeOutlineLevel,
  normalizeOutlineSegmentCount,
  normalizeOutlineSegments,
  normalizeOutlineSplitMode,
  parseExhibitionOutlineSplitJson,
  splitOutlineByHeadingLevel,
  type ExhibitionOutlineSegment,
} from '../../utils/exhibitionOutlineSplit';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const OUTLINE_TEXT_HANDLE = 'outline-text';
const OUTLINE_IMAGE_HANDLE = 'outline-image';

function documentLabel(meta?: Omit<ExtractedDocument, 'text'> | null) {
  if (!meta) return '未选择文档';
  const pages = meta.pageCount ? ` · ${meta.pageCount} 页` : '';
  return `${meta.name} · ${meta.charCount} 字${pages}`;
}

function llmErrorMessage(error: any) {
  const message = String(error?.message || error || '').trim();
  if (/no available accounts/i.test(message)) return '当前 LLM 没有可用账号，请切换可用的 LLM 配置后重试。';
  return message || '大纲拆分失败';
}

function segmentsFromData(value: unknown): ExhibitionOutlineSegment[] {
  return normalizeOutlineSegments(value);
}

function formatOneSegment(segment: ExhibitionOutlineSegment, index: number) {
  const lines = [`单元 ${index + 1}：${segment.title}（权重 ${segment.weightPercent}%）`, segment.summary];
  if (segment.keywords.length > 0) lines.push(`关键词：${segment.keywords.join('、')}`);
  if (segment.sourceHint) lines.push(`依据：${segment.sourceHint}`);
  return lines.join('\n');
}

function clampOutputSegmentIndex(value: unknown, count: number) {
  if (count <= 0) return 0;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(count - 1, n));
}

function segmentIndexForDocumentImage(imageIndex: number, imageCount: number, segmentCount: number) {
  if (segmentCount <= 0 || imageCount <= 0) return 0;
  return Math.min(segmentCount - 1, Math.floor((imageIndex * segmentCount) / Math.max(1, imageCount)));
}

const ExhibitionOutlineSplitNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const fileRef = useRef<HTMLInputElement>(null);
  const upstream = useUpstreamMaterials(id);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmConfigs = useApiKeysStore((state) => state.settings.llmConfigs || state.settings.llmApiKeys) || [];
  const llmConfigOptions = useMemo(() => {
    const saved = llmConfigs.filter((item) => item && (item.hasApiKey || item.apiKey || item.baseUrl || item.model));
    return saved.length > 0 ? saved : [{ id: 'default', label: '默认 LLM', model: configuredLlmModel }];
  }, [configuredLlmModel, llmConfigs]);
  const selectedLlmKeyId = String(d.llmKeyId || d.documentLlmKeyId || '').trim();
  const activeLlmConfig = llmConfigOptions.find((item) => item.id === selectedLlmKeyId)
    || llmConfigOptions.find((item) => item.isDefault)
    || llmConfigOptions[0];
  const llmModel = activeLlmConfig?.model || String(d.llmModel || d.documentLlmModel || '').trim() || configuredLlmModel;

  const splitMode = normalizeOutlineSplitMode(d.splitMode);
  const segmentCount = normalizeOutlineSegmentCount(d.segmentCount);
  const outlineLevel = normalizeOutlineLevel(d.outlineLevel);
  const sourceText = String(d.sourceText || '');
  const upstreamText = useMemo(() => upstream.texts.map((item) => item.url).join('\n\n'), [upstream.texts]);
  const useUpstream = d.useUpstream !== false;
  const effectiveSourceText = [useUpstream ? upstreamText : '', sourceText].filter((item) => item.trim()).join('\n\n');
  const projectTheme = String(d.projectTheme || '').trim();
  const extraInstruction = String(d.extraInstruction || '').trim();
  const segments = useMemo(() => segmentsFromData(d.outlineSegments), [d.outlineSegments]);
  const outputText = useMemo(() => formatOutlineSegments(segments), [segments]);
  const status = String(d.status || 'idle');
  const busy = status === 'extracting' || status === 'splitting';

  const documentImages = useMemo(
    () => (Array.isArray(d.documentImages) ? d.documentImages : []),
    [d.documentImages],
  );
  const outputSegmentIndex = clampOutputSegmentIndex(d.outputSegmentIndex, segments.length);
  const selectedSegment = segments[outputSegmentIndex] || null;
  const selectedSegmentText = useMemo(
    () => selectedSegment ? formatOneSegment(selectedSegment, outputSegmentIndex) : '',
    [outputSegmentIndex, selectedSegment],
  );
  const selectedSegmentImages = useMemo(
    () => documentImages
      .filter((image: any, index: number) => segmentIndexForDocumentImage(index, documentImages.length, segments.length) === outputSegmentIndex)
      .map((image: any) => (typeof image?.url === 'string' ? image.url.trim() : ''))
      .filter(Boolean),
    [documentImages, outputSegmentIndex, segments.length],
  );

  useEffect(() => {
    const textSegments = segments.map((segment, index) => {
      return formatOneSegment(segment, index);
    });
    const nextStatus = segments.length > 0 ? 'success' : (status === 'error' ? 'error' : 'idle');
    const nextOutputSegmentIndex = clampOutputSegmentIndex(d.outputSegmentIndex, segments.length);
    const nextOutputText = textSegments[nextOutputSegmentIndex] || '';
    const nextImageUrls = documentImages
      .filter((image: any, index: number) => segmentIndexForDocumentImage(index, documentImages.length, segments.length) === nextOutputSegmentIndex)
      .map((image: any) => (typeof image?.url === 'string' ? image.url.trim() : ''))
      .filter(Boolean);
    const changed =
      JSON.stringify(d.textSegments || []) !== JSON.stringify(textSegments) ||
      d.outputSegmentIndex !== nextOutputSegmentIndex ||
      (d.text || '') !== nextOutputText ||
      (d.outputText || '') !== nextOutputText ||
      (d.prompt || '') !== nextOutputText ||
      JSON.stringify(d.imageUrls || []) !== JSON.stringify(nextImageUrls) ||
      (d.imageUrl || '') !== (nextImageUrls[0] || '') ||
      JSON.stringify(d.urls || []) !== JSON.stringify(nextImageUrls) ||
      d.status !== nextStatus && !busy;
    if (changed && !busy) {
      update({
        textSegments,
        segments: textSegments,
        outputSegmentIndex: nextOutputSegmentIndex,
        text: nextOutputText,
        outputText: nextOutputText,
        prompt: nextOutputText,
        imageUrl: nextImageUrls[0] || '',
        imageUrls: nextImageUrls,
        urls: nextImageUrls,
        status: nextStatus,
      });
    }
  }, [busy, d.imageUrl, d.imageUrls, d.outputSegmentIndex, d.outputText, d.prompt, d.segments, d.status, d.text, d.textSegments, d.urls, documentImages, segments, status, update]);

  const createOutlineMaterialSets = useCallback((segmentsForItems: ExhibitionOutlineSegment[]) => {
    if (isReadonly) return;
    const normalizedSegments = normalizeOutlineSegments(segmentsForItems);
    if (normalizedSegments.length === 0) return;

    const stamp = Date.now();
    const namePrefix = (segment: ExhibitionOutlineSegment, index: number) => {
      const title = cleanOutlineText(segment.title || `单元 ${index + 1}`, 48);
      return `${String(index + 1).padStart(2, '0')}-${title}`;
    };

    const textItems = normalizedSegments.map((segment, index): MaterialSetItem => ({
      id: `ms-outline-text-${stamp}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'text',
      text: formatOneSegment(segment, index),
      name: namePrefix(segment, index),
      mime: 'text/plain',
    }));

    const imageItems = documentImages
      .map((image: any, index: number): MaterialSetItem | null => {
        const url = typeof image?.url === 'string' ? image.url.trim() : '';
        if (!url) return null;
        const segmentIndex = segmentIndexForDocumentImage(index, documentImages.length, normalizedSegments.length);
        const segment = normalizedSegments[segmentIndex];
        const ext = String(image.filename || image.name || '').match(/\.[a-z0-9]+$/i)?.[0] || '.png';
        return {
          id: `ms-outline-image-${stamp}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          kind: 'image',
          url,
          name: `${namePrefix(segment, segmentIndex)}-${String(index + 1).padStart(2, '0')}${ext}`,
          size: typeof image.size === 'number' ? image.size : undefined,
          mime: typeof image.mime === 'string' ? image.mime : 'image/*',
        };
      })
      .filter(Boolean) as MaterialSetItem[];

    const nodes = rf.getNodes();
    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 620;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = (me?.position?.y ?? 0) + 300;

    const upsertMaterialSet = (
      role: 'outline-text' | 'outline-image',
      dataPatch: Record<string, any>,
      yOffset: number,
      legacyImage = false,
    ) => {
      const existing = nodes.find((node) => {
        if (node.type !== 'material-set') return false;
        const nd = (node.data as any) || {};
        if (nd.sourceOutlineNodeId !== id) return false;
        if (nd.outlineMaterialSetRole === role) return true;
        return legacyImage && nd.autoFromOutlineDocumentImages === true;
      });
      if (existing) {
        rf.setNodes((current) => current.map((node) => (
          node.id === existing.id
            ? { ...node, data: { ...(node.data as any), ...dataPatch } }
            : node
        )));
        return;
      }
      const pos = placeSingleNode(baseX, baseY + yOffset, 'material-set', nodes, { source: `placement:outline-material-set:${id}:${role}` });
      const newNode: Node = {
        id: `material-set-${role}-${id}-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'material-set',
        position: pos,
        selected: false,
        data: dataPatch,
      };
      rf.addNodes(newNode);
    };

    upsertMaterialSet('outline-text', {
      ...materialSetItemsToData('text', textItems),
      label: '大纲文本素材集',
      sourceDocumentName: d.documentMeta?.name || '',
      sourceOutlineNodeId: id,
      outlineMaterialSetRole: 'outline-text',
      autoFromOutlineSegments: true,
    }, 0);

    if (imageItems.length > 0) {
      upsertMaterialSet('outline-image', {
        ...materialSetItemsToData('image', imageItems),
        label: '大纲图片素材集',
        sourceDocumentName: d.documentMeta?.name || '',
        sourceOutlineNodeId: id,
        outlineMaterialSetRole: 'outline-image',
        autoFromOutlineDocumentImages: true,
      }, 250, true);
    }
  }, [d.documentMeta?.name, documentImages, id, isReadonly, rf]);

  const runSplit = useCallback(async () => {
    if (isReadonly || busy) return;
    const text = effectiveSourceText.trim();
    if (splitMode === 'heading' && text) {
      update({ status: 'splitting', progress: `按 ${outlineLevel} 级目录拆分中...`, error: '' });
      const nextSegments = splitOutlineByHeadingLevel(text, outlineLevel);
      if (nextSegments.length === 0) {
        update({ status: 'error', error: `未识别到 ${outlineLevel} 级目录标题，请调整目录级别或使用自动/指定数量拆分`, progress: '' });
        throw new Error('未识别到指定目录级别');
      }
      const textSegments = nextSegments.map((segment, index) => formatOneSegment(segment, index));
      update({
        outlineSegments: nextSegments,
        resolvedSegmentCount: nextSegments.length,
        outputSegmentIndex: 0,
        textSegments,
        segments: textSegments,
        text: textSegments[0] || '',
        outputText: textSegments[0] || '',
        prompt: textSegments[0] || '',
        status: 'success',
        progress: '',
        error: '',
        splitAt: Date.now(),
      });
      createOutlineMaterialSets(nextSegments);
      return;
    }
    if (!text) {
      update({ status: 'error', error: '请先导入文档、粘贴资料，或连接上游文本。', progress: '' });
      throw new Error('请先提供资料文本');
    }
    update({ status: 'splitting', progress: splitMode === 'auto' ? '自动判断单元中...' : `拆分为 ${segmentCount} 个单元中...`, error: '' });
    try {
      const response = await generateLlm({
        model: llmModel,
        llmKeyId: activeLlmConfig?.id,
        temperature: splitMode === 'auto' ? 0.28 : 0.2,
        max_tokens: splitMode === 'auto' ? 3200 : Math.min(32000, 1200 + segmentCount * 260),
        messages: [
          {
            role: 'system',
            content: '你是资深展陈策划与内容大纲整理专家。你只输出严格 JSON，擅长把资料拆成展陈叙事单元并提炼可落地总结。',
          },
          {
            role: 'user',
            content: buildExhibitionOutlineSplitPrompt({
              sourceText: text,
              mode: splitMode,
              segmentCount,
              projectTheme,
              extraInstruction,
            }),
          },
        ],
      });
      const parsed = parseExhibitionOutlineSplitJson(response.content || '');
      const nextSegments = parsed.segments;
      const textSegments = nextSegments.map((segment, index) => {
        return formatOneSegment(segment, index);
      });
      update({
        outlineSegments: nextSegments,
        resolvedSegmentCount: nextSegments.length,
        outputSegmentIndex: 0,
        textSegments,
        segments: textSegments,
        text: textSegments[0] || '',
        outputText: textSegments[0] || '',
        prompt: textSegments[0] || '',
        status: 'success',
        progress: '',
        error: '',
        splitAt: Date.now(),
      });
      createOutlineMaterialSets(nextSegments);
    } catch (error: any) {
      const fallback = fallbackOutlineSplit(text, segmentCount);
      if (fallback.length > 0) {
        const textSegments = fallback.map((segment, index) => formatOneSegment(segment, index));
        update({
          outlineSegments: fallback,
          resolvedSegmentCount: fallback.length,
          outputSegmentIndex: 0,
          textSegments,
          segments: textSegments,
          text: textSegments[0] || '',
          outputText: textSegments[0] || '',
          prompt: textSegments[0] || '',
          status: 'success',
          progress: '',
          error: `LLM 拆分失败，已使用规则分块：${llmErrorMessage(error)}`,
          splitAt: Date.now(),
        });
        createOutlineMaterialSets(fallback);
        return;
      }
      update({ status: 'error', error: llmErrorMessage(error), progress: '' });
      throw error;
    }
  }, [activeLlmConfig?.id, busy, createOutlineMaterialSets, effectiveSourceText, extraInstruction, isReadonly, llmModel, outlineLevel, projectTheme, segmentCount, splitMode, update]);

  const pickDocument = useCallback(async (file?: File) => {
    if (!file || isReadonly || busy) return;
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      update({ status: 'error', error: `文档不能超过 ${MAX_DOCUMENT_FILE_SIZE_MB}MB`, progress: '' });
      return;
    }
    update({ status: 'extracting', progress: '文档解析中...', error: '' });
    try {
      const extracted = await extractDocument(file);
      const { text, ...documentMeta } = extracted;
      update({
        documentMeta,
        documentImages: extracted.images || [],
        sourceText: text,
        outlineSegments: [],
        textSegments: [],
        segments: [],
        outputSegmentIndex: 0,
        imageUrl: '',
        imageUrls: [],
        urls: [],
        text: '',
        outputText: '',
        prompt: '',
        status: 'idle',
        progress: '',
        error: '',
      });
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '文档解析失败', progress: '' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [busy, isReadonly, update]);

  const copyOutput = async () => {
    if (!selectedSegmentText) return;
    await navigator.clipboard?.writeText(selectedSegmentText);
  };

  useRunTrigger(id, runSplit, 'text');

  return (
    <div className={`t8-node relative w-[620px] transition-all ${selected ? 'ring-2 ring-cyan-300' : ''}`}>
      <Handle type="target" position={Position.Left} className="!border-0" style={{ background: PORT_COLOR.text }} />
      <Handle id={OUTLINE_TEXT_HANDLE} type="source" position={Position.Right} className="!border-0" style={{ top: '42%', background: PORT_COLOR.text }} />
      <Handle id={OUTLINE_IMAGE_HANDLE} type="source" position={Position.Right} className="!border-0" style={{ top: '58%', background: PORT_COLOR.image }} />
      <div className="pointer-events-none absolute right-2 top-[42%] z-10 -translate-y-1/2 text-[9px] font-semibold text-white/45">文本</div>
      <div className="pointer-events-none absolute right-2 top-[58%] z-10 -translate-y-1/2 text-[9px] font-semibold text-white/45">图片</div>

      <div className="t8-node-header flex items-center gap-2 rounded-t-[inherit] px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-current/10">
          <Layers3 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black leading-tight">展陈大纲拆分</div>
          <div className="text-[10px] leading-tight opacity-70">
            {segments.length || 0} 个单元 · {effectiveSourceText.trim().length} 字资料
          </div>
        </div>
        {busy ? <Loader2 size={15} className="animate-spin opacity-80" /> : <Brain size={15} className="opacity-70" />}
      </div>

      <div className="space-y-3 p-3 text-xs">
        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5">
            <FileText size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">创意资料文档</span>
            <button type="button" className={`${BUTTON} ml-auto`} disabled={isReadonly || busy} onClick={() => fileRef.current?.click()}>
              <Upload size={12} />
              导入
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".docx,.pdf,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => void pickDocument(event.target.files?.[0])}
            />
          </div>
          <div className="truncate text-[10px] text-white/55" title={documentLabel(d.documentMeta)}>
            {documentLabel(d.documentMeta)}
          </div>
          {documentImages.length > 0 && (
            <div className="text-[10px] text-cyan-100/70">已提取 {documentImages.length} 张文档图片，拆分后会生成图片素材集</div>
          )}
          {Array.isArray(d.documentMeta?.warnings) && d.documentMeta.warnings.length > 0 && (
            <div className="text-[10px] text-amber-200/80">{d.documentMeta.warnings.join('；')}</div>
          )}
          <textarea
            className={`${FIELD} min-h-[96px] resize-y`}
            value={sourceText}
            disabled={isReadonly || busy}
            placeholder="导入 DOCX、文本型 PDF、TXT，或直接粘贴展陈资料原文"
            onChange={(event) => update({ sourceText: event.target.value })}
          />
          <label className="flex items-center gap-1.5 text-[10px] text-white/60">
            <input
              type="checkbox"
              className="h-3 w-3 accent-cyan-300"
              checked={useUpstream}
              disabled={isReadonly || busy}
              onChange={(event) => update({ useUpstream: event.target.checked })}
            />
            合并左侧上游文本作为资料补充
          </label>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">拆分设置</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-white/65">模式</span>
              <select
                className={FIELD}
                value={splitMode}
                disabled={isReadonly || busy}
                onChange={(event) => update({ splitMode: event.target.value })}
              >
                <option value="manual">指定单元数</option>
                <option value="auto">自动判断</option>
                <option value="heading">按目录级别</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-white/65">单元数</span>
              <input
                className={FIELD}
                type="number"
                min={1}
                max={MAX_OUTLINE_SEGMENT_COUNT}
                value={segmentCount}
                disabled={isReadonly || busy || splitMode !== 'manual'}
                onChange={(event) => update({ segmentCount: normalizeOutlineSegmentCount(event.target.value) })}
              />
            </label>
          </div>
          {splitMode === 'heading' && (
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-white/65">目录级别</span>
              <input
                className={FIELD}
                type="number"
                min={1}
                max={6}
                value={outlineLevel}
                disabled={isReadonly || busy}
                onChange={(event) => update({ outlineLevel: normalizeOutlineLevel(event.target.value) })}
              />
            </label>
          )}
          <input
            className={FIELD}
            value={projectTheme}
            disabled={isReadonly || busy}
            placeholder="项目主题 / 展览关键词（可选）"
            onChange={(event) => update({ projectTheme: event.target.value })}
          />
          <textarea
            className={`${FIELD} min-h-[56px] resize-y`}
            value={extraInstruction}
            disabled={isReadonly || busy}
            placeholder="额外拆分要求：例如按时间线、按展厅动线、突出产业成果等（可选）"
            onChange={(event) => update({ extraInstruction: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-1">
            <select
              className={FIELD}
              disabled={isReadonly || busy}
              value={`llm-key:${activeLlmConfig?.id || 'default'}`}
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId.startsWith('llm-key:')) update({ llmKeyId: nextId.slice(8), llmModel: '' });
              }}
            >
              {llmConfigOptions.map((item) => (
                <option key={item.id} value={`llm-key:${item.id}`}>
                  {item.label || item.id}{item.model ? ` · ${item.model}` : ''}
                </option>
              ))}
            </select>
            <input className={FIELD} disabled value={llmModel} title="模型由所选 LLM 配置决定" />
          </div>
          <button type="button" className="t8-btn min-h-8 w-full px-2 text-[11px]" disabled={isReadonly || busy} onClick={() => void runSplit()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {busy ? (d.progress || '处理中...') : '拆分并总结'}
          </button>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5">
            <ImageIcon size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">输出单元</span>
            <span className="ml-auto text-[10px] text-white/45">
              {segments.length > 0 ? `文本 1 条 · 图片 ${selectedSegmentImages.length} 张` : '等待拆分'}
            </span>
          </div>
          <select
            className={FIELD}
            value={outputSegmentIndex}
            disabled={isReadonly || busy || segments.length === 0}
            onChange={(event) => update({ outputSegmentIndex: clampOutputSegmentIndex(event.target.value, segments.length) })}
          >
            {segments.length > 0 ? segments.map((segment, index) => (
              <option key={`${segment.title}-${index}`} value={index}>
                {`单元 ${index + 1} · ${segment.title}`}
              </option>
            )) : (
              <option value={0}>暂无可输出单元</option>
            )}
          </select>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-white/55">
            <div className="rounded border border-white/10 bg-black/15 px-2 py-1.5">文本口输出当前单元摘要</div>
            <div className="rounded border border-white/10 bg-black/15 px-2 py-1.5">图片口输出当前单元图片素材集</div>
          </div>
        </section>

        <section className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="flex items-center gap-1.5">
            <Clipboard size={13} className="text-cyan-200" />
            <span className="text-[11px] font-semibold text-cyan-100">分段输出</span>
            <button type="button" className={`${BUTTON} ml-auto`} disabled={!outputText} onClick={() => void copyOutput()}>
              复制
            </button>
          </div>
          {d.error && <div className={`text-[10px] ${status === 'success' ? 'text-amber-200/80' : 'text-red-200'}`}>{d.error}</div>}
          {segments.length > 0 ? (
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {segments.map((segment, index) => (
                <div key={`${segment.title}-${index}`} className="rounded border border-cyan-300/15 bg-cyan-300/[0.06] p-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-[11px] font-semibold text-cyan-100">单元 {index + 1}：{segment.title}</div>
                    <div className="shrink-0 rounded border border-cyan-300/25 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100">
                      {segment.weightPercent}%
                    </div>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-white/78">{segment.summary}</div>
                  {segment.keywords.length > 0 && (
                    <div className="mt-1 text-[10px] text-white/45">关键词：{segment.keywords.join('、')}</div>
                  )}
                  {segment.sourceHint && (
                    <div className="mt-1 text-[10px] text-white/35">依据：{segment.sourceHint}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-white/15 py-8 text-center text-[10px] text-white/35">
              拆分后会在这里生成展陈单元大纲，并从右侧输出文本集合。
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default memo(ExhibitionOutlineSplitNode);
