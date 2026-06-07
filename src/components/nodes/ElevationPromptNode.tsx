import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Check,
  Clipboard,
  FileText,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  extractDocument,
  getCurrentUser,
  getElevationPromptPresets,
  updateElevationColorMaterialPresets,
  type AuthUser,
  type ElevationColorMaterialPresetItem,
  type ExtractedDocument,
} from '../../services/api';
import { generateExternalLlm, generateLlm } from '../../services/generation';
import { DEFAULT_LLM_MODEL, LLM_MODELS } from '../../providers/models';
import {
  buildElevationAnalysisMessages,
  buildElevationOutputs,
  ELEVATION_CRAFTS,
  normalizeElevationAnalysis,
  parseElevationAnalysisResponse,
  wallsFromAnalysis,
  type ElevationAnalysis,
  type ElevationCraft,
  type ElevationWall,
} from '../../utils/elevationPrompt';
import {
  advancedProviderModelOptions,
  advancedProvidersForNode,
  resolveAdvancedProviderSelection,
} from '../../utils/advancedProviders';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const DEFAULT_CRAFTS = ['panel', 'dimensional-letters', 'soft-film-lightbox'];

function same(valueA: unknown, valueB: unknown) {
  return JSON.stringify(valueA) === JSON.stringify(valueB);
}

function documentLabel(meta?: Omit<ExtractedDocument, 'text'> | null) {
  if (!meta) return '未选择文档';
  const pages = meta.pageCount ? ` · ${meta.pageCount} 页` : '';
  return `${meta.name} · ${meta.charCount} 字${pages}`;
}

function colorPresetEditorText(presets: ElevationColorMaterialPresetItem[]): string {
  return presets.map((preset) => (preset.info ? `${preset.label}｜${preset.info}` : preset.label)).join('\n');
}

function parseColorPresetEditorText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const raw = line.trim();
      if (!raw) return null;
      const [labelRaw, ...rest] = raw.split(/[｜|]/);
      const label = String(labelRaw || '').trim();
      if (!label) return null;
      return {
        id: `${label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'preset'}-${index + 1}`,
        label,
        info: rest.join('｜').trim(),
        order: index,
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; info: string; order: number }>;
}

const ElevationPromptNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const [analysisDraft, setAnalysisDraft] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);
  const [presetEditorValue, setPresetEditorValue] = useState('');
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetError, setPresetError] = useState('');

  const sourceText = String(d.sourceText || '');
  const wallMode: 'single' | 'multi' = d.wallMode === 'single' ? 'single' : 'multi';
  const wallCount = Math.max(1, Math.min(12, Number(d.wallCount) || 3));
  const analysis = useMemo(
    () => normalizeElevationAnalysis(d.analysis) as ElevationAnalysis,
    [d.analysis],
  );
  const selectedCrafts: string[] = Array.isArray(d.selectedCrafts) ? d.selectedCrafts : DEFAULT_CRAFTS;
  const selectedColorMaterialPreset = useMemo(
    () => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null,
    [colorMaterialPresets, d.colorMaterialPreset],
  );
  const status = String(d.status || 'idle');
  const busy = status === 'extracting' || status === 'refining';

  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const configuredLlmModel = useApiKeysStore((state) => state.settings.llmModel)?.trim() || DEFAULT_LLM_MODEL;
  const llmProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'llm'), [advancedProviders]);
  const providerSelection = useMemo(
    () => resolveAdvancedProviderSelection(advancedProviders, 'llm', {
      providerSource: d.providerSource,
      providerId: d.providerId,
      providerModel: d.providerModel,
    }),
    [advancedProviders, d.providerSource, d.providerId, d.providerModel],
  );
  const externalSelected = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const externalModels = providerSelection.provider
    ? advancedProviderModelOptions(providerSelection.provider, 'llm')
    : [];
  const externalModel = providerSelection.providerModel || externalModels[0] || '';
  const savedModel = String(d.model || '').trim();
  const shouldUseConfiguredDefault = savedModel === DEFAULT_LLM_MODEL && configuredLlmModel !== DEFAULT_LLM_MODEL && !d.modelMigratedFromDefault;
  const model = shouldUseConfiguredDefault ? configuredLlmModel : (savedModel || configuredLlmModel);
  const llmModelOptions = useMemo(() => {
    const options = LLM_MODELS.filter((item) => {
      if (item.imageOutput) return false;
      return configuredLlmModel === DEFAULT_LLM_MODEL || item.id !== DEFAULT_LLM_MODEL;
    });
    if (!options.some((item) => item.id === model)) {
      return [
        {
          id: model,
          label: `${model}（设置默认）`,
          provider: 'llm-direct' as const,
          vision: true,
        },
        ...options,
      ];
    }
    return options;
  }, [model]);

  const outputs = useMemo(
    () => buildElevationOutputs({
      analysis,
      walls: Array.isArray(d.walls) ? d.walls : [],
      wallMode,
      wallCount,
      outputMode: d.outputMode === 'overview' ? 'overview' : 'segments',
      downstreamContent: d.downstreamContent || 'concept',
      selectedCrafts,
      customCraft: d.customCraft,
      aspectRatio: d.aspectRatio,
      dimensions: d.dimensions,
      density: d.density,
      colorMaterial: d.colorMaterial,
      visualStyle: d.visualStyle,
      supplement: d.supplement,
      layoutScheduleOverride: d.layoutScheduleOverride,
    }),
    [
      analysis,
      d.walls,
      wallMode,
      wallCount,
      d.outputMode,
      d.downstreamContent,
      selectedCrafts,
      d.customCraft,
      d.aspectRatio,
      d.dimensions,
      d.density,
      d.colorMaterial,
      d.visualStyle,
      d.supplement,
      d.layoutScheduleOverride,
    ],
  );

  useEffect(() => {
    const patch = {
      prompt: outputs.mainOutput,
      outputText: outputs.mainOutput,
      text: outputs.mainOutput,
      textSegments: outputs.textSegments,
      segments: outputs.textSegments,
      conceptPrompts: outputs.conceptPrompts,
      overviewPrompt: outputs.overviewPrompt,
      layoutSchedule: outputs.layoutSchedule,
    };
    if (
      d.prompt !== patch.prompt ||
      d.outputText !== patch.outputText ||
      d.text !== patch.text ||
      !same(d.textSegments || [], patch.textSegments) ||
      !same(d.segments || [], patch.segments) ||
      !same(d.conceptPrompts || [], patch.conceptPrompts) ||
      d.overviewPrompt !== patch.overviewPrompt ||
      d.layoutSchedule !== patch.layoutSchedule
    ) {
      update(patch);
    }
  }, [d.conceptPrompts, d.layoutSchedule, d.outputText, d.prompt, d.textSegments, outputs, update]);

  useEffect(() => {
    setAnalysisDraft(JSON.stringify(analysis, null, 2));
  }, [analysis]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
    getElevationPromptPresets()
      .then((presets) => setColorMaterialPresets(presets.colorMaterial || []))
      .catch(() => setColorMaterialPresets([]));
  }, []);

  useEffect(() => {
    if (!presetEditorOpen) return;
    setPresetEditorValue(colorPresetEditorText(colorMaterialPresets));
    setPresetError('');
  }, [colorMaterialPresets, presetEditorOpen]);

  useEffect(() => {
    if (savedModel === DEFAULT_LLM_MODEL && configuredLlmModel !== DEFAULT_LLM_MODEL && !d.modelMigratedFromDefault) {
      update({ model: configuredLlmModel, modelMigratedFromDefault: true });
    }
  }, [configuredLlmModel, d.modelMigratedFromDefault, savedModel, update]);

  const refineText = useCallback(async (textOverride?: string, rethrow = false) => {
    if (isReadonly) return;
    const text = String(textOverride ?? sourceText).trim();
    if (!text) {
      update({ status: 'error', error: '请先上传文档或填写原文' });
      return;
    }
    update({ status: 'refining', error: '' });
    try {
      const messages = buildElevationAnalysisMessages(text, wallMode, wallCount);
      const response = externalSelected && providerSelection.provider
        ? await generateExternalLlm({
            providerId: providerSelection.provider.id,
            providerModel: externalModel,
            model: externalModel,
            messages: messages as any,
            temperature: 0.2,
            max_tokens: 8192,
            providerParams: d.providerParams || {},
          })
        : await generateLlm({
            model,
            messages: messages as any,
            temperature: 0.2,
            max_tokens: 8192,
          });
      const nextAnalysis = parseElevationAnalysisResponse(response.content) as ElevationAnalysis;
      const nextWalls = wallsFromAnalysis(nextAnalysis, wallMode, wallCount) as ElevationWall[];
      update({
        analysis: nextAnalysis,
        walls: nextWalls,
        status: 'success',
        error: '',
        analyzedAt: Date.now(),
      });
    } catch (error: any) {
      update({
        status: 'error',
        error: error?.message || 'AI 提炼失败',
      });
      if (rethrow) throw error;
    }
  }, [
    d.providerParams,
    externalModel,
    externalSelected,
    isReadonly,
    model,
    providerSelection.provider,
    sourceText,
    update,
    wallCount,
    wallMode,
  ]);

  useRunTrigger(id, () => refineText(undefined, true), 'elevation-prompt');

  const pickDocument = async (file?: File) => {
    if (!file || isReadonly) return;
    if (file.size > 10 * 1024 * 1024) {
      update({ status: 'error', error: '文档不能超过 10MB' });
      return;
    }
    update({ status: 'extracting', error: '' });
    try {
      const extracted = await extractDocument(file);
      const { text, ...documentMeta } = extracted;
      update({
        documentMeta,
        sourceText: text,
        analysis: null,
        walls: [],
        status: 'refining',
        error: '',
      });
      await refineText(text);
    } catch (error: any) {
      update({ status: 'error', error: error?.message || '文档解析失败' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const rebuildWalls = () => {
    if (isReadonly) return;
    update({ walls: wallsFromAnalysis(analysis, wallMode, wallCount) });
  };

  const patchWall = (index: number, patch: Partial<ElevationWall>) => {
    if (isReadonly) return;
    const next = outputs.walls.map((wall: ElevationWall, wallIndex: number) => (
      wallIndex === index ? { ...wall, ...patch } : wall
    ));
    update({ walls: next });
  };

  const applyAnalysisDraft = () => {
    if (isReadonly) return;
    try {
      const next = parseElevationAnalysisResponse(analysisDraft) as ElevationAnalysis;
      update({ analysis: next, walls: wallsFromAnalysis(next, wallMode, wallCount), error: '' });
      setDraftMessage('已应用');
    } catch (error: any) {
      setDraftMessage(error?.message || 'JSON 无法解析');
    }
  };

  const toggleCraft = (craftId: string) => {
    if (isReadonly) return;
    const next = selectedCrafts.includes(craftId)
      ? selectedCrafts.filter((idValue) => idValue !== craftId)
      : [...selectedCrafts, craftId];
    update({ selectedCrafts: next });
  };

  const saveColorMaterialPresets = async () => {
    if (!canManageTeam) return;
    const presets = parseColorPresetEditorText(presetEditorValue);
    if (presets.length === 0) {
      setPresetError('请至少保留一条“名称｜信息提示”格式的预设。');
      return;
    }
    setPresetSaving(true);
    setPresetError('');
    try {
      const saved = await updateElevationColorMaterialPresets(presets);
      setColorMaterialPresets(saved);
      setPresetEditorOpen(false);
    } catch (error: any) {
      setPresetError(error?.message || '保存预设失败');
    } finally {
      setPresetSaving(false);
    }
  };

  return (
    <div
      className={`relative w-[430px] rounded-xl border-2 transition-all ${
        selected ? 'border-cyan-300 shadow-2xl shadow-cyan-500/15' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(17,24,39,.96)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="source" position={Position.Right} className="!bg-cyan-300 !border-0" />
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-300/15 text-cyan-200">
          <FileText size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">立面提示词</div>
          <div className="truncate text-[10px] text-white/45">文档提炼 / 彩立面排版 / 展陈工艺</div>
        </div>
        {busy && <Loader2 size={15} className="animate-spin text-cyan-200" />}
      </div>

      <div
        className="nodrag nopan max-h-[760px] space-y-2 overflow-y-auto p-2.5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {isReadonly && (
          <div className="rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1.5 text-[10px] text-amber-100">
            当前画布为只读，仅可查看和复制结果。
          </div>
        )}
        {d.error && (
          <div className="rounded border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">
            {d.error}
          </div>
        )}

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-cyan-100">1. 导入文档</span>
            <button
              type="button"
              className={`${BUTTON} ml-auto`}
              disabled={busy || isReadonly}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={12} />
              选择文件
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
          {Array.isArray(d.documentMeta?.warnings) && d.documentMeta.warnings.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-200/80">{d.documentMeta.warnings.join('；')}</div>
          )}
          <textarea
            className={`${FIELD} mt-2 min-h-[90px] resize-y`}
            value={sourceText}
            disabled={isReadonly || busy}
            placeholder="上传 DOCX、文本型 PDF、TXT，或直接粘贴项目文案"
            onChange={(event) => update({ sourceText: event.target.value })}
          />
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-cyan-100">2. AI 提炼</span>
            <button
              type="button"
              className={`${BUTTON} ml-auto`}
              disabled={busy || isReadonly || !sourceText.trim()}
              onClick={() => void refineText()}
            >
              {status === 'refining' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              重新提炼
            </button>
          </div>
          <div className="mb-1.5 grid grid-cols-2 gap-1">
              <select
                className={FIELD}
                disabled={isReadonly || busy}
                value={externalSelected ? providerSelection.providerId : 'zhenzhen'}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId === 'zhenzhen') {
                    update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' });
                    return;
                  }
                  const provider = llmProviders.find((item) => item.id === nextId);
                  if (!provider) return;
                  const models = advancedProviderModelOptions(provider, 'llm');
                  update({ providerSource: provider.protocol, providerId: provider.id, providerModel: models[0] || '' });
                }}
              >
                <option value="zhenzhen">默认 LLM Key</option>
                {llmProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
              </select>
              {externalSelected ? (
                <select
                  className={FIELD}
                  disabled={isReadonly || busy}
                  value={externalModel}
                  onChange={(event) => update({ providerModel: event.target.value })}
                >
                  {externalModels.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              ) : (
                <select
                  className={FIELD}
                  disabled={isReadonly || busy}
                  value={model}
                  onChange={(event) => update({ model: event.target.value })}
                >
                  {llmModelOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              )}
          </div>
          <input
            className={FIELD}
            value={analysis.projectTheme}
            disabled={isReadonly}
            placeholder="项目主题"
            onChange={(event) => update({ analysis: { ...analysis, projectTheme: event.target.value } })}
          />
          <textarea
            className={`${FIELD} mt-1 min-h-[52px] resize-y`}
            value={analysis.coreMessage}
            disabled={isReadonly}
            placeholder="核心信息"
            onChange={(event) => update({ analysis: { ...analysis, coreMessage: event.target.value } })}
          />
          <details className="mt-1.5 text-[10px] text-white/55">
            <summary className="cursor-pointer select-none">编辑结构化分析 JSON</summary>
            <textarea
              className={`${FIELD} mt-1 min-h-[150px] resize-y font-mono`}
              value={analysisDraft}
              disabled={isReadonly}
              onChange={(event) => {
                setAnalysisDraft(event.target.value);
                setDraftMessage('');
              }}
            />
            <div className="mt-1 flex items-center justify-end gap-2">
              {draftMessage && <span className={draftMessage === '已应用' ? 'text-emerald-300' : 'text-red-300'}>{draftMessage}</span>}
              <button type="button" className={BUTTON} disabled={isReadonly} onClick={applyAnalysisDraft}>
                <Check size={11} />应用 JSON
              </button>
            </div>
          </details>
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-cyan-100">3. 立面组织</span>
            <button type="button" className={`${BUTTON} ml-auto`} disabled={isReadonly} onClick={rebuildWalls}>
              <RefreshCw size={11} />按分析重建
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <select
              className={FIELD}
              disabled={isReadonly}
              value={wallMode}
              onChange={(event) => {
                const nextMode = event.target.value === 'single' ? 'single' : 'multi';
                update({
                  wallMode: nextMode,
                  walls: wallsFromAnalysis(analysis, nextMode, nextMode === 'single' ? 1 : wallCount),
                });
              }}
            >
              <option value="single">单立面</option>
              <option value="multi">多立面</option>
            </select>
            <input
              className={FIELD}
              type="number"
              min={1}
              max={12}
              disabled={isReadonly || wallMode === 'single'}
              value={wallMode === 'single' ? 1 : wallCount}
              onChange={(event) => {
                const nextCount = Math.max(1, Math.min(12, Number(event.target.value) || 1));
                update({ wallCount: nextCount, walls: wallsFromAnalysis(analysis, 'multi', nextCount) });
              }}
              title="立面数量"
            />
            <select
              className={FIELD}
              disabled={isReadonly || wallMode === 'single'}
              value={d.outputMode === 'overview' ? 'overview' : 'segments'}
              onChange={(event) => update({ outputMode: event.target.value })}
            >
              <option value="segments">逐面集合</option>
              <option value="overview">整套总览</option>
            </select>
          </div>
          <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
            {outputs.walls.map((wall: ElevationWall, index: number) => (
              <div key={wall.id || index} className="rounded border border-white/10 bg-black/15 p-1.5">
                <input
                  className={FIELD}
                  value={wall.title || ''}
                  disabled={isReadonly}
                  placeholder={`立面 ${index + 1} 标题`}
                  onChange={(event) => patchWall(index, { title: event.target.value })}
                />
                <textarea
                  className={`${FIELD} mt-1 min-h-[48px] resize-y`}
                  value={wall.content || ''}
                  disabled={isReadonly}
                  placeholder="展示重点与内容摘要"
                  onChange={(event) => patchWall(index, { content: event.target.value })}
                />
                <textarea
                  className={`${FIELD} mt-1 min-h-[42px] resize-y`}
                  value={(wall.exactText || []).join('\n')}
                  disabled={isReadonly}
                  placeholder="准确上墙文案，每行一条"
                  onChange={(event) => patchWall(index, {
                    exactText: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
                  })}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-white/10 bg-white/[0.035] p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-cyan-100">4. 工艺与版式</span>
            {canManageTeam && (
              <button
                type="button"
                className={`${BUTTON} ml-auto`}
                disabled={presetSaving}
                onClick={() => setPresetEditorOpen((value) => !value)}
              >
                <Settings size={11} />
                设置色材预设
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {ELEVATION_CRAFTS.map((craft: ElevationCraft) => {
              const active = selectedCrafts.includes(craft.id);
              return (
                <button
                  key={craft.id}
                  type="button"
                  disabled={isReadonly}
                  className={`min-w-0 rounded border px-1.5 py-1 text-[10px] ${
                    active
                      ? 'border-cyan-300/55 bg-cyan-300/15 text-cyan-100'
                      : 'border-white/10 bg-black/15 text-white/55 hover:bg-white/[0.08]'
                  } disabled:opacity-50`}
                  onClick={() => toggleCraft(craft.id)}
                  title={craft.prompt}
                >
                  <span className="block truncate">{craft.label}</span>
                </button>
              );
            })}
          </div>
          <input className={`${FIELD} mt-1.5`} value={d.customCraft || ''} disabled={isReadonly} placeholder="自定义工艺" onChange={(event) => update({ customCraft: event.target.value })} />
          <div className="mt-1 grid grid-cols-2 gap-1">
            <select className={FIELD} value={d.aspectRatio || '3:1'} disabled={isReadonly} onChange={(event) => update({ aspectRatio: event.target.value })}>
              <option value="3:1">横向 3:1</option>
              <option value="2:1">横向 2:1</option>
              <option value="16:9">横向 16:9</option>
              <option value="1:1">方形 1:1</option>
              <option value="9:16">竖向 9:16</option>
            </select>
            <input className={FIELD} value={d.dimensions || ''} disabled={isReadonly} placeholder="实际尺寸，如 6m × 3m" onChange={(event) => update({ dimensions: event.target.value })} />
            <select className={FIELD} value={d.density || '适中'} disabled={isReadonly} onChange={(event) => update({ density: event.target.value })}>
              <option value="疏朗，强调大图与留白">疏朗</option>
              <option value="适中，图文层级均衡">适中</option>
              <option value="信息丰富，采用严谨网格">丰富</option>
            </select>
            <input className={FIELD} value={d.visualStyle || ''} disabled={isReadonly} placeholder="视觉风格" onChange={(event) => update({ visualStyle: event.target.value })} />
          </div>
          <select
            className={`${FIELD} mt-1`}
            value={d.colorMaterialPreset || ''}
            disabled={isReadonly}
            onChange={(event) => {
              const presetId = event.target.value;
              const preset = colorMaterialPresets.find((item) => item.id === presetId);
              update({
                colorMaterialPreset: presetId,
                ...(preset ? { colorMaterial: preset.label } : {}),
              });
            }}
          >
            <option value="">不使用色彩与材质预设</option>
            {colorMaterialPresets.map((preset) => (
              <option key={preset.id} value={preset.id} title={preset.info}>
                {preset.label}
              </option>
            ))}
          </select>
          {selectedColorMaterialPreset?.info && (
            <div className="mt-1 rounded border border-cyan-300/15 bg-cyan-300/10 px-2 py-1 text-[10px] leading-relaxed text-cyan-50/75">
              {selectedColorMaterialPreset.info}
            </div>
          )}
          {canManageTeam && presetEditorOpen && (
            <div className="mt-1.5 rounded border border-white/10 bg-white/[0.035] p-2">
              <div className="mb-1 text-[10px] text-white/45">每行一个预设：名称｜信息提示。选择预设时仅把名称写入输入框。</div>
              <textarea
                className={`${FIELD} min-h-[120px] resize-y font-mono`}
                value={presetEditorValue}
                disabled={presetSaving}
                onChange={(event) => setPresetEditorValue(event.target.value)}
              />
              {presetError && <div className="mt-1 text-[10px] text-red-300">{presetError}</div>}
              <div className="mt-1.5 flex justify-end gap-1">
                <button
                  type="button"
                  className={BUTTON}
                  disabled={presetSaving}
                  onClick={() => setPresetEditorOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className={BUTTON}
                  disabled={presetSaving}
                  onClick={saveColorMaterialPresets}
                >
                  {presetSaving ? '保存中' : '保存预设'}
                </button>
              </div>
            </div>
          )}
          <textarea className={`${FIELD} mt-1 min-h-[46px] resize-y`} value={d.colorMaterial || ''} disabled={isReadonly} placeholder="色彩与材质体系" onChange={(event) => update({ colorMaterial: event.target.value, colorMaterialPreset: '' })} />
          <textarea className={`${FIELD} mt-1 min-h-[46px] resize-y`} value={d.supplement || ''} disabled={isReadonly} placeholder="特殊限制、品牌语气、施工要求等" onChange={(event) => update({ supplement: event.target.value })} />
        </section>

        <section className="rounded border border-cyan-300/20 bg-cyan-300/10 p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-cyan-100">5. 下游输出</span>
            <select className={`${FIELD} ml-auto !w-auto`} disabled={isReadonly} value={d.downstreamContent || 'concept'} onChange={(event) => update({ downstreamContent: event.target.value })}>
              <option value="concept">概念 Prompt</option>
              <option value="schedule">准确排版清单</option>
              <option value="combined">两者组合</option>
            </select>
            <button type="button" className={BUTTON} onClick={() => navigator.clipboard?.writeText(outputs.mainOutput).catch(() => {})}>
              <Clipboard size={11} />复制
            </button>
          </div>
          <div className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/72">
            {outputs.mainOutput}
          </div>
          <details className="mt-1.5 text-[10px] text-white/55">
            <summary className="cursor-pointer select-none">编辑准确排版清单</summary>
            <textarea
              className={`${FIELD} mt-1 min-h-[150px] resize-y`}
              value={d.layoutScheduleOverride || outputs.generatedLayoutSchedule}
              disabled={isReadonly}
              onChange={(event) => update({ layoutScheduleOverride: event.target.value })}
            />
            {d.layoutScheduleOverride && (
              <div className="mt-1 flex justify-end">
                <button type="button" className={BUTTON} disabled={isReadonly} onClick={() => update({ layoutScheduleOverride: '' })}>
                  恢复自动生成
                </button>
              </div>
            )}
          </details>
          {outputs.textSegments.length > 0 && (
            <div className="mt-1.5 text-[10px] text-cyan-100/70">
              已输出 {outputs.textSegments.length} 条逐面文本，可连接循环器批量出图。
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default memo(ElevationPromptNode);
