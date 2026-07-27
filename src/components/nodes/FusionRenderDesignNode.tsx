import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import SmartImage from '../SmartImage';
import { Image as ImageIcon, Loader2, Play, Sparkles } from 'lucide-react';
import { EXHIBITION_IMAGE_HANDLE_COLOR } from '../../config/portTypes';
import { IMAGE_MODELS } from '../../providers/models';
import { generateExternalImage, queryExternalImageStatus, queryImageStatus, submitImageAsync } from '../../services/generation';
import { advancedProviderModelOptions, advancedProvidersForNode, externalImageSizeFor, resolveAdvancedProviderSelection } from '../../utils/advancedProviders';
import { FUSION_RENDER_AUTO_CEILING_CRAFT, FUSION_RENDER_AUTO_FLOOR_MATERIAL, FUSION_RENDER_CEILING_CRAFTS, FUSION_RENDER_VENUE_TYPES, buildFusionRenderPrompt } from '../../utils/fusionRenderDesignData.js';
import {
  REVERSE_ISOMETRIC_FLOOR_MATERIALS,
} from '../../utils/reverseIsometricDesignData.js';
import { getElevationPromptPresets, type ElevationColorMaterialPresetItem } from '../../services/api';
import { useApiKeysStore } from '../../stores/apiKeys';
import { useCanvasStore } from '../../stores/canvas';
import { logBus } from '../../stores/logs';
import { taskCompletionSound } from '../../stores/taskCompletionSound';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import NodeHelpButton from './NodeHelpButton';
import ColorMaterialPresetSelect from './ColorMaterialPresetSelect';
import { useHandleImages } from './ReverseIsometricDesignNode';

const FIELD = 'w-full rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60 disabled:opacity-55';
const BUTTON = 'inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.06] px-2 text-[10px] text-white/75 hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
const MAX_POLLS = 300;
const POLL_INTERVAL = 3000;

function colorMaterialTextFromPreset(preset: ElevationColorMaterialPresetItem): string {
  return [preset.label, String(preset.core || '').trim(), String(preset.features || '').trim(), String(preset.usage || '').trim()].filter(Boolean).join('；');
}

const FusionRenderDesignNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const pollAbortRef = useRef(false);
  const activeCanvas = useCanvasStore((state) => state.canvases.find((canvas) => canvas.id === state.activeId) || null);
  const activeCanvasId = useCanvasStore((state) => state.activeId);
  const isReadonly = activeCanvas?.access?.canEdit === false;
  const advancedProviders = useApiKeysStore((state) => state.settings.advancedProviders);
  const allowZhenzhenFallback = useApiKeysStore((state) => state.settings.enableZhenzhenFallback !== false);
  const spaceReferenceImage = useHandleImages(id, 'space-reference', true)[0]?.url || '';
  const exhibitImages = useHandleImages(id, 'exhibit-reference');
  const venueType = FUSION_RENDER_VENUE_TYPES.includes(d.venueType) ? d.venueType : FUSION_RENDER_VENUE_TYPES[0];
  const hallSubject = typeof d.hallSubject === 'string' ? d.hallSubject : '';
  const [colorMaterialPresets, setColorMaterialPresets] = useState<ElevationColorMaterialPresetItem[]>([]);
  const selectedColorMaterialPreset = useMemo(() => colorMaterialPresets.find((preset) => preset.id === d.colorMaterialPreset) || null, [colorMaterialPresets, d.colorMaterialPreset]);
  const colorMaterialPresetText = selectedColorMaterialPreset ? colorMaterialTextFromPreset(selectedColorMaterialPreset) : '';
  const applyColorMaterialToExhibits = d.applyColorMaterialToExhibits === true;
  const imageProviders = useMemo(() => advancedProvidersForNode(advancedProviders, 'image'), [advancedProviders]);
  const providerSelection = useMemo(() => resolveAdvancedProviderSelection(advancedProviders, 'image', { providerSource: d.providerSource, providerId: d.providerId, providerModel: d.providerModel }), [advancedProviders, d.providerId, d.providerModel, d.providerSource]);
  const isExternal = providerSelection.available && providerSelection.providerSource !== 'zhenzhen';
  const externalModels = providerSelection.provider ? advancedProviderModelOptions(providerSelection.provider, 'image') : [];
  const externalModel = providerSelection.providerModel || externalModels[0] || '';
  const providerValue = isExternal ? providerSelection.providerId : (allowZhenzhenFallback ? 'zhenzhen' : (imageProviders[0]?.id || ''));
  const modelDef = useMemo(() => IMAGE_MODELS.find((item) => item.id === (d.model || 'gpt-image-2')) || IMAGE_MODELS[0], [d.model]);
  const apiModel = d.apiModel || modelDef.apiModel;
  const aspectRatio = d.aspectRatio || '1:1';
  const sizeLevel = d.sizeLevel || '2K';
  const hallHeightMm = Math.min(12000, Math.max(2400, Math.round(Number(d.hallHeightMm) || 4200)));
  const floorMaterial = REVERSE_ISOMETRIC_FLOOR_MATERIALS.includes(d.floorMaterial) ? d.floorMaterial : FUSION_RENDER_AUTO_FLOOR_MATERIAL;
  const ceilingCraft = FUSION_RENDER_CEILING_CRAFTS.includes(d.ceilingCraft) ? d.ceilingCraft : FUSION_RENDER_AUTO_CEILING_CRAFT;
  const outputFormat: 'jpg' | 'png' = d.outputFormat === 'png' ? 'png' : 'jpg';
  const seed = Math.max(0, Math.floor(Number(d.seed) || 0));
  const busy = d.status === 'generating';
  const previewPrompt = useMemo(() => buildFusionRenderPrompt({ hasSpaceReference: Boolean(spaceReferenceImage), venueType, hallSubject, hallHeightMm, floorMaterial, ceilingCraft, colorMaterialPresetText, colorMaterial: String(d.colorMaterial || ''), applyColorMaterialToExhibits, exhibitCount: exhibitImages.length }), [applyColorMaterialToExhibits, ceilingCraft, colorMaterialPresetText, d.colorMaterial, exhibitImages.length, floorMaterial, hallHeightMm, hallSubject, spaceReferenceImage, venueType]);

  useEffect(() => {
    getElevationPromptPresets().then((presets) => setColorMaterialPresets(presets.colorMaterial || [])).catch(() => setColorMaterialPresets([]));
  }, []);

  const generateCandidate = useCallback(async (prompt: string, references: string[], runSeed: number): Promise<string> => {
    const historyContext = { canvasId: activeCanvasId, sourceNodeId: id, sourceNodeType: 'fusion-render-design', nodeTitle: '融合效果图', outputTitle: '融合效果图', seed: runSeed };
    if (isExternal) {
      if (!providerSelection.provider || !externalModel) throw new Error('扩展平台未配置可用图像模型');
      let response = await generateExternalImage({ providerId: providerSelection.provider.id, providerModel: externalModel, model: externalModel, prompt, size: externalImageSizeFor(aspectRatio, sizeLevel), aspect_ratio: aspectRatio, image_size: sizeLevel, images: references, outputFormat, seed: runSeed, n: 1, providerParams: { ...(d.providerParams || {}), n: 1, aspect_ratio: aspectRatio, image_size: sizeLevel }, historyContext, async: true });
      for (let index = 0; !response.imageUrls?.length && response.taskId && index < MAX_POLLS; index += 1) {
        if (pollAbortRef.current) throw new Error('任务已取消');
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        response = await queryExternalImageStatus({ providerId: providerSelection.provider.id, providerModel: externalModel, taskId: response.taskId, outputFormat, historyContext });
        update({ progress: `生成中 ${Math.min(99, Math.round((index + 1) / MAX_POLLS * 100))}%` });
        if (response.code && response.code !== 'running' && !response.imageUrls?.length) break;
      }
      if (!response.imageUrls?.[0]) throw new Error(response.error || '扩展平台完成但未返回图片');
      return response.imageUrls[0];
    }
    const submit = await submitImageAsync({ model: modelDef.id, apiModel, paramKind: modelDef.paramKind, prompt, aspect_ratio: aspectRatio, image_size: sizeLevel, images: references, n: 1, outputFormat, seed: runSeed, historyContext });
    if (submit.urls?.[0]) return submit.urls[0];
    if (!submit.taskId) throw new Error('未获取到生图任务 ID');
    for (let index = 0; index < 1800; index += 1) {
      if (pollAbortRef.current) throw new Error('任务已取消');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = await queryImageStatus(submit.taskId, apiModel, outputFormat, historyContext);
      update({ progress: result.progress || `生成中 ${index + 1}` });
      const status = String(result.status || '').toLowerCase();
      if (['completed', 'success', 'done'].includes(status)) {
        if (!result.urls?.[0]) throw new Error('任务完成但未返回图片');
        return result.urls[0];
      }
      if (['failed', 'failure', 'error'].includes(status)) throw new Error(result.error || '生图任务失败');
    }
    throw new Error('生图任务超时');
  }, [activeCanvasId, apiModel, aspectRatio, d.providerParams, externalModel, id, isExternal, modelDef.id, modelDef.paramKind, outputFormat, providerSelection.provider, sizeLevel, update]);

  const runGenerate = useCallback(async () => {
    if (busy || isReadonly) return;
    if (!exhibitImages.length) throw new Error('请至少连接一张展项效果图');
    pollAbortRef.current = false;
    const runSeed = seed || Math.floor(Math.random() * 2147483646) + 1;
    const previousOutput = { imageUrl: d.imageUrl || '', imageUrls: d.imageUrls || [], urls: d.urls || [] };
    update({ status: 'generating', progress: '正在组织展厅与展项参考...', error: '' });
    try {
      const references = spaceReferenceImage ? [spaceReferenceImage, ...exhibitImages.map((item) => item.url)] : exhibitImages.map((item) => item.url);
      update({ status: 'generating', progress: '正在生成融合效果图...' });
      const candidate = await generateCandidate(previewPrompt, references, runSeed);
      update({ status: 'success', progress: '100%', error: '', imageUrl: candidate, imageUrls: [candidate], urls: [candidate], outputText: previewPrompt, text: previewPrompt, prompt: previewPrompt, lastPrompt: previewPrompt, lastSeed: runSeed, referenceImages: references });
      logBus.success('融合效果图生成完成', `fusion-render:${id.slice(0, 6)}`);
      taskCompletionSound.notifyComplete(id, 'image');
    } catch (error: any) {
      update({ ...previousOutput, status: 'error', progress: '', error: error?.message || '融合效果图生成失败' });
      logBus.error(`融合效果图生成失败：${error?.message || error}`, `fusion-render:${id.slice(0, 6)}`);
      throw error;
    }
  }, [busy, d.imageUrl, d.imageUrls, d.urls, exhibitImages, generateCandidate, id, isReadonly, previewPrompt, seed, spaceReferenceImage, update]);

  useRunTrigger(id, runGenerate, 'image');

  return <div data-exhibition-compact-node-type="fusion-render-design" className={`relative w-[520px] rounded-xl border bg-zinc-950 text-white shadow-2xl ${selected ? 'border-cyan-300/70' : 'border-white/10'}`}>
    <Handle id="space-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '24%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：空间参考图（可选、排他）" />
    <Handle id="exhibit-reference" type="target" position={Position.Left} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ top: '48%', background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输入：展项效果图（可多图）" />
    <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-0 t8-exhibition-handle--image" style={{ background: EXHIBITION_IMAGE_HANDLE_COLOR }} title="输出：融合效果图" />
    <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2"><Sparkles size={16} className="text-cyan-300" /><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-cyan-100">融合效果图</div><div className="truncate text-[10px] text-white/45">空间参考 · 展项融合 · 写实效果图</div></div><NodeHelpButton nodeType="fusion-render-design" /></header>
    <div className="nodrag nopan max-h-[780px] space-y-2 overflow-y-auto p-2.5" onMouseDown={(event) => event.stopPropagation()}>
      <section data-exhibition-compact-section="inputs" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-100"><ImageIcon size={13} />参考素材</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-white/10 bg-black/20 p-1.5"><div className="mb-1 text-[9px] text-white/45">空间参考图（可选、单图排他）</div>{spaceReferenceImage ? <SmartImage src={spaceReferenceImage} alt="空间参考" className="h-24 w-full rounded object-contain" thumbSize={360} /> : <div className="flex h-24 items-center justify-center rounded border border-dashed border-white/15 text-[10px] text-white/30">等待连接</div>}</div>
          <div className="rounded border border-white/10 bg-black/20 p-1.5"><div className="mb-1 text-[9px] text-white/45">展项效果图（{exhibitImages.length}）</div><div className="grid h-24 grid-cols-3 gap-1 overflow-y-auto">{exhibitImages.map((item) => <SmartImage key={item.id + item.url} src={item.url} alt="展项效果" className="h-10 w-full rounded object-cover" thumbSize={180} />)}</div></div>
        </div>
      </section>
      <section data-exhibition-compact-section="view" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <label className="block space-y-1"><span className="text-[10px] text-white/55">展馆类型</span><select className={FIELD} value={venueType} disabled={isReadonly || busy} onChange={(e) => update({ venueType: e.target.value })}>{FUSION_RENDER_VENUE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="block space-y-1"><span className="text-[10px] text-white/55">展厅主体（留空则根据展项定义）</span><textarea className={`${FIELD} min-h-16 resize-y`} value={hallSubject} disabled={isReadonly || busy} placeholder="例如：未来能源科技互动体验；留空自动归纳" onChange={(e) => update({ hallSubject: e.target.value })} /></label>
        <label className="block space-y-1"><span className="text-[10px] text-white/55">顶部工艺</span><select className={FIELD} value={ceilingCraft} disabled={isReadonly || busy} onChange={(e) => update({ ceilingCraft: e.target.value })}><option value={FUSION_RENDER_AUTO_CEILING_CRAFT}>{FUSION_RENDER_AUTO_CEILING_CRAFT}</option>{FUSION_RENDER_CEILING_CRAFTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="block space-y-1"><span className="text-[10px] text-white/55">展厅净高 mm</span><input className={FIELD} type="number" min={2400} max={12000} step={100} value={hallHeightMm} disabled={isReadonly || busy} onChange={(e) => update({ hallHeightMm: Math.min(12000, Math.max(2400, Math.round(Number(e.target.value) || 4200))) })} /></label>
        <label className="block space-y-1"><span className="text-[10px] text-white/55">地面材质</span><select className={FIELD} value={floorMaterial} disabled={isReadonly || busy} onChange={(e) => update({ floorMaterial: e.target.value })}><option value={FUSION_RENDER_AUTO_FLOOR_MATERIAL}>{FUSION_RENDER_AUTO_FLOOR_MATERIAL}</option>{REVERSE_ISOMETRIC_FLOOR_MATERIALS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </section>
      <section data-exhibition-compact-section="color-material" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <div className="text-[11px] font-semibold text-cyan-100">色彩与材质预设</div>
        <ColorMaterialPresetSelect className={FIELD} presets={colorMaterialPresets} value={d.colorMaterialPreset || ''} disabled={isReadonly || busy} onChange={(presetId, preset) => update({ colorMaterialPreset: presetId, colorMaterial: preset ? colorMaterialTextFromPreset(preset) : '' })} />
        {selectedColorMaterialPreset?.info && <div className="rounded border border-cyan-300/15 bg-cyan-300/5 px-2 py-1 text-[10px] leading-snug text-cyan-50/70">{selectedColorMaterialPreset.info}</div>}
        <textarea className={`${FIELD} min-h-[50px] resize-y`} value={d.colorMaterial || ''} disabled={isReadonly || busy} placeholder="手动色彩与材质补充" onChange={(event) => update({ colorMaterial: event.target.value, colorMaterialPreset: '' })} />
        <div className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/15 p-2">
          <div><div className="text-[10px] font-semibold text-cyan-100">同时影响展项色调</div><div className="text-[9px] text-white/40">开启后，预设同步影响展项冷暖、明暗与材质观感</div></div>
          <button type="button" role="switch" aria-checked={applyColorMaterialToExhibits} disabled={isReadonly || busy} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${applyColorMaterialToExhibits ? 'border-cyan-300/60 bg-cyan-300/25' : 'border-white/15 bg-white/10'} disabled:cursor-not-allowed disabled:opacity-45`} onClick={() => update({ applyColorMaterialToExhibits: !applyColorMaterialToExhibits })}><span className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${applyColorMaterialToExhibits ? 'translate-x-4.5 bg-cyan-200' : 'translate-x-0.5 bg-white/50'}`} /></button>
        </div>
      </section>
      <section data-exhibition-compact-section="model" data-exhibition-compact-item="main" className="space-y-2 rounded border border-white/10 bg-white/[0.035] p-2">
        <div className="flex items-center justify-between"><div className="text-[11px] font-semibold text-cyan-100">模型与尺寸</div><button className={`${BUTTON} border-cyan-300/30 bg-cyan-300/15 text-cyan-100`} disabled={isReadonly || busy || !exhibitImages.length} onClick={() => void runGenerate()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}生成</button></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-[10px] text-white/55">生图平台</span><select className={FIELD} value={providerValue} disabled={isReadonly || busy} onChange={(e) => { const provider = imageProviders.find((item) => item.id === e.target.value); if (e.target.value === 'zhenzhen') update({ providerSource: 'zhenzhen', providerId: '', providerModel: '' }); else if (provider) update({ providerSource: provider.protocol, providerId: provider.id, providerModel: advancedProviderModelOptions(provider, 'image')[0] || '' }); }}>{allowZhenzhenFallback && <option value="zhenzhen">内置生图平台</option>}{imageProviders.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">生图模型</span>{isExternal ? <select className={FIELD} value={externalModel} disabled={isReadonly || busy} onChange={(e) => update({ providerModel: e.target.value })}>{externalModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <select className={FIELD} value={apiModel} disabled={isReadonly || busy} onChange={(e) => update({ apiModel: e.target.value })}>{modelDef.apiModelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}</label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">比例</span><select className={FIELD} value={aspectRatio} disabled={isReadonly || busy} onChange={(e) => update({ aspectRatio: e.target.value })}>{(modelDef.aspectRatios.length ? modelDef.aspectRatios : ['1:1', '16:9', '9:16']).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">尺寸</span><select className={FIELD} value={sizeLevel} disabled={isReadonly || busy} onChange={(e) => update({ sizeLevel: e.target.value })}>{(modelDef.sizes.length ? modelDef.sizes : ['1K', '2K', '4K']).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">Seed</span><input className={FIELD} type="number" min={0} value={seed} disabled={isReadonly || busy} onChange={(e) => update({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></label>
          <label className="space-y-1"><span className="text-[10px] text-white/55">输出格式</span><select className={FIELD} value={outputFormat} disabled={isReadonly || busy} onChange={(e) => update({ outputFormat: e.target.value })}><option value="jpg">JPG</option><option value="png">PNG</option></select></label>
        </div>
      </section>
      {(d.progress || d.error) && <section data-exhibition-compact-section="status" data-exhibition-compact-item="main" className="space-y-1 rounded border border-cyan-300/20 bg-cyan-300/10 p-2">{d.progress && <div className="text-[10px] text-cyan-100">{d.progress}</div>}{d.error && <div className="text-[10px] text-rose-200">{d.error}</div>}</section>}
      {d.imageUrl && <section data-exhibition-compact-section="result" data-exhibition-compact-item="main" className="rounded border border-white/10 bg-black/20 p-2"><SmartImage src={d.imageUrl} alt="融合效果图" className="max-h-64 w-full rounded object-contain" thumbSize={360} /></section>}
      <section data-exhibition-compact-section="prompt" data-exhibition-compact-item="main" className="rounded border border-white/10 bg-white/[0.03] p-2"><div className="mb-1 text-[10px] font-semibold text-cyan-100">生成约束 Prompt</div><div className="max-h-36 overflow-y-auto whitespace-pre-wrap text-[9px] leading-relaxed text-white/55">{previewPrompt}</div></section>
    </div>
  </div>;
};

export default memo(FusionRenderDesignNode);
