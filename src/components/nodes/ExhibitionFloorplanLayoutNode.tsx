import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Handle, Position, useNodeConnections, useNodesData, type NodeProps } from '@xyflow/react';
import { Download, Image as ImageIcon, LayoutDashboard, Loader2, Lock, LockOpen, Play, RotateCw, Upload } from 'lucide-react';
import { generateImage, generateLlm } from '../../services/generation';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { buildFloorplanSvg, svgDataUrl } from '../../utils/floorplanSvg';
import type { FloorplanArchitecture, FloorplanCandidate, FloorplanRequirement, FloorplanValidation } from '../../types/floorplan';

const FIELD = 'nodrag w-full rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/60';
const BUTTON = 'nodrag inline-flex h-7 items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.07] px-2 text-[10px] text-white/80 hover:bg-white/[0.14] disabled:opacity-40';
const DEFAULT_REQUIREMENT: FloorplanRequirement = { projectType: '综合主题展厅', capacity: 80, zones: [{ name: '序厅', areaRatio: .15 }, { name: '核心展区', areaRatio: .55 }, { name: '互动区', areaRatio: .3 }], facilities: [{ type: '展柜', quantity: 6, size: [1200, 600], clearance: 1200 }, { type: '互动屏', quantity: 3, size: [1600, 800], clearance: 1500 }], style: { keywords: ['克制', '清晰'], materials: [] }, routePreference: 'loop' };

async function jsonRequest<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await res.json();
  if (!res.ok || !payload.success) throw new Error(payload.error || `HTTP ${res.status}`);
  return payload.data as T;
}

function downloadText(name: string, content: string, type: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function parseJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM 未返回有效 JSON');
  return JSON.parse(match[0]);
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error || new Error('读取图片失败')); reader.readAsDataURL(file); });
}

function ExhibitionFloorplanLayoutNode({ id, data }: NodeProps) {
  const d = data as any;
  const update = useUpdateNodeData(id);
  const architecture = d.architecture as FloorplanArchitecture | undefined;
  const candidates = (d.candidates || []) as FloorplanCandidate[];
  const activeId = d.activeCandidateId || candidates[0]?.id;
  const active = candidates.find((c) => c.id === activeId) || candidates[0];
  const [busy, setBusy] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const requirement: FloorplanRequirement = d.requirement || DEFAULT_REQUIREMENT;
  const connections = useNodeConnections({ id, handleType: 'target' });
  const upstreamIds = useMemo(() => [...new Set(connections.map((c) => c.source).filter(Boolean))], [connections]);
  const upstreamData = useNodesData(upstreamIds);
  const upstream = useMemo(() => (Array.isArray(upstreamData) ? upstreamData : [upstreamData]).filter(Boolean).map((node: any) => node.data || {}), [upstreamData]);
  const upstreamText = useMemo(() => upstream.map((value) => value.text || value.outputText || value.prompt || '').filter(Boolean).join('\n\n'), [upstream]);
  const upstreamImages = useMemo(() => [...new Set(upstream.flatMap((value) => [value.imageUrl, ...(value.imageUrls || []), ...(value.urls || [])]).filter((url) => typeof url === 'string' && url))] as string[], [upstream]);
  const sourceText = String(d.sourceText || upstreamText || '');
  const locked = !!d.architectureLocked;
  const svg = useMemo(() => architecture ? buildFloorplanSvg(architecture, active) : '', [architecture, active]);

  const patchCandidate = useCallback((next: FloorplanCandidate, validation?: FloorplanValidation) => {
    const version = `layout-v${Math.max(1, Number((next.layoutVersion || '').match(/\d+/)?.[0] || 1) + 1)}`;
    const changed = { ...next, layoutVersion: version, validation: validation || next.validation, confirmed: next.confirmed === true };
    update({ candidates: candidates.map((c) => c.id === next.id ? changed : c), activeCandidateId: next.id, render: d.render ? { ...d.render, stale: true } : null, imageUrl: svgDataUrl(buildFloorplanSvg(architecture!, changed)), outputText: JSON.stringify({ requirement, candidate: changed }, null, 2), text: JSON.stringify({ requirement, candidate: changed }, null, 2) });
  }, [architecture, candidates, d.render, requirement, update]);

  const validate = useCallback(async (candidate: FloorplanCandidate) => {
    const result = await jsonRequest<FloorplanValidation>('/api/floorplan/validate-layout', { architecture, candidate, constraints: { minimumPathWidth: d.minimumPathWidth || 1200 } });
    patchCandidate(candidate, result);
  }, [architecture, d.minimumPathWidth, patchCandidate]);

  const importDxf = async (file: File) => {
    setBusy('解析 DXF');
    try {
      const form = new FormData(); form.append('file', file);
      const res = await fetch('/api/floorplan/parse-dxf', { method: 'POST', body: form }); const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'DXF 解析失败');
      update({ source: { type: 'dxf', name: file.name }, architecture: payload.data.architecture, architectureLocked: false, candidates: [], activeCandidateId: '', render: null, status: 'idle', error: '' });
    } catch (e: any) { update({ status: 'error', error: e.message }); } finally { setBusy(''); }
  };

  const analyzeImage = async (file: File) => {
    const widthMm = Number(d.calibrationWidthMm || 24000), heightMm = Number(d.calibrationHeightMm || 12000);
    setBusy('分析截图');
    try {
      const dataUrl = await fileDataUrl(file);
      let analysis: any = null;
      try {
        const vision = await generateLlm({ model: d.llmModel || 'gpt-4o-mini', temperature: .1, messages: [{ role: 'system', content: `识别建筑平面截图并只返回 JSON。坐标映射到 0..${widthMm} 和 0..${heightMm} 毫米。结构：{confidence,walls:[{polyline:[[x,y]],thickness,confidence}],columns:[{shape,x,y,width,height,confidence}],openings:[{type:"entrance"|"exit",position:[x,y],width,confidence}]}。只标注图中有证据的结构，不猜测施工尺寸。` }, { role: 'user', content: [{ type: 'text', text: '识别墙体、柱和出入口。所有结果仍需人工确认。' }, { type: 'image_url', image_url: { url: dataUrl } }] }] });
        analysis = parseJsonObject(vision.content);
      } catch { analysis = null; }
      const result = await jsonRequest<{ architecture: FloorplanArchitecture }>('/api/floorplan/analyze-image', { widthMm, heightMm, fileName: file.name, analysis });
      update({ source: { type: 'image', name: file.name }, sourceImageUrl: dataUrl, architecture: result.architecture, architectureLocked: false, candidates: [], render: null, status: 'idle', error: analysis ? '' : '视觉识别不可用，已生成校准外框，请人工核验并补充结构' });
    } catch (e: any) { update({ status: 'error', error: e.message }); } finally { setBusy(''); }
  };

  const importLayoutJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const importedArchitecture = parsed.architecture as FloorplanArchitecture | undefined;
      const importedCandidate = parsed.candidate as FloorplanCandidate | undefined;
      if (!importedArchitecture?.bounds || !importedCandidate?.items) throw new Error('JSON 缺少 architecture 或 candidate');
      const validation = await jsonRequest<FloorplanValidation>('/api/floorplan/validate-layout', { architecture: importedArchitecture, candidate: importedCandidate, constraints: { minimumPathWidth: d.minimumPathWidth || 1200 } });
      const next = { ...importedCandidate, validation };
      update({ architecture: importedArchitecture, architectureLocked: true, requirement: parsed.requirement || requirement, candidates: [next], activeCandidateId: next.id, render: null, imageUrl: svgDataUrl(buildFloorplanSvg(importedArchitecture, next)), outputText: JSON.stringify(parsed, null, 2), text: JSON.stringify(parsed, null, 2), error: '' });
    } catch (e: any) { update({ status: 'error', error: `布局 JSON 导入失败：${e.message}` }); }
  };

  const extractRequirement = async () => {
    if (!sourceText.trim()) return requirement;
    setBusy('AI 提炼需求');
    const result = await generateLlm({ model: d.llmModel || 'gpt-4o-mini', temperature: .2, messages: [{ role: 'system', content: '你是展陈空间规划助手。只返回 JSON：projectType,capacity,zones[{name,areaRatio,priority}],facilities[{type,quantity,size:[宽,深],clearance,priority}],style{keywords,materials},routePreference。尺寸单位毫米。' }, { role: 'user', content: sourceText }] });
    const parsed = parseJsonObject(result.content) as FloorplanRequirement;
    update({ requirement: parsed }); return parsed;
  };

  const runLayout = useCallback(async () => {
    if (!architecture || !locked) throw new Error('请先导入、核验并锁定建筑底图');
    setBusy('生成布局'); update({ status: 'running', error: '' });
    try {
      let req = requirement;
      if (sourceText.trim()) { try { req = await extractRequirement(); } catch { req = requirement; } }
      const result = await jsonRequest<{ requirement: FloorplanRequirement; constraintsVersion: string; candidates: FloorplanCandidate[] }>('/api/floorplan/generate-layouts', { architecture, requirement: req, constraints: { minimumPathWidth: d.minimumPathWidth || 1200 } });
      const best = result.candidates[0]; const text = JSON.stringify({ requirement: result.requirement, candidates: result.candidates }, null, 2);
      update({ requirement: result.requirement, constraintsVersion: result.constraintsVersion, candidates: result.candidates, activeCandidateId: best?.id, imageUrl: best ? svgDataUrl(buildFloorplanSvg(architecture, best)) : '', outputText: text, text, status: 'success', error: '' });
    } catch (e: any) { update({ status: 'error', error: e.message }); throw e; } finally { setBusy(''); }
  }, [architecture, d.minimumPathWidth, locked, requirement, sourceText, update]);
  useRunTrigger(id, runLayout, 'image');

  const renderAi = async () => {
    if (!architecture || !active) return;
    setBusy('生成 AI 表现图');
    try {
      const prompt = `根据参考图和布局 JSON 生成展厅正交俯视平面表现图。严格保持墙体、柱、入口、出口的位置和比例，不得新增、删除或移动建筑结构，不得添加 JSON 中不存在的展项。主通道连续清晰。布局 JSON：${JSON.stringify(active.items)}。风格：${JSON.stringify(requirement.style)}`;
      const result = await generateImage({ model: 'gpt-image-2', apiModel: 'gpt-image-2-all', prompt, images: [svgDataUrl(svg), ...upstreamImages.slice(0, 4)], aspectRatio: '16:9', image_size: '2K', n: 1 });
      const imageUrl = result.urls[0]; update({ render: { provider: 'gpt-image-2', imageUrl, layoutVersion: active.layoutVersion, promptVersion: 'prompt-v1', stale: false }, imageUrls: [svgDataUrl(svg), imageUrl], urls: [svgDataUrl(svg), imageUrl] });
    } catch (e: any) { update({ status: 'error', error: `AI 表现图失败：${e.message}` }); } finally { setBusy(''); }
  };

  const pointerPoint = (e: React.PointerEvent<SVGElement>) => {
    const p = svgRef.current!.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const out = p.matrixTransform(svgRef.current!.getScreenCTM()!.inverse()); return { x: out.x, y: out.y };
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || !active) return; const p = pointerPoint(e); const grid = 100;
    const items = active.items.map((item) => item.id === drag.id ? { ...item, x: Math.round((p.x - drag.dx) / grid) * grid, y: Math.round((p.y - drag.dy) / grid) * grid } : item);
    update({ candidates: candidates.map((c) => c.id === active.id ? { ...c, items } : c) });
  };
  const finishDrag = () => { if (!drag || !active) return; setDrag(null); void validate(active); };
  const selected = active?.items.find((i) => i.id === selectedItem);

  return <div className="relative w-full rounded-xl border border-cyan-400/25 bg-slate-950/95 text-white shadow-xl">
    <Handle id="text" type="target" position={Position.Left} style={{ top: 42, background: '#a78bfa' }} /><Handle id="image" type="target" position={Position.Left} style={{ top: 74, background: '#38bdf8' }} />
    <Handle id="image-output" type="source" position={Position.Right} style={{ top: 42, background: '#38bdf8' }} /><Handle id="text-output" type="source" position={Position.Right} style={{ top: 74, background: '#a78bfa' }} />
    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><div className="flex items-center gap-2 text-sm font-semibold"><LayoutDashboard size={16} className="text-cyan-300"/>展陈平面布局</div><span className="text-[9px] text-white/45">几何数据层 ≠ AI 表现层</span></div>
    <div className="grid grid-cols-[230px_1fr] gap-2 p-2">
      <div className="space-y-2">
        <div className="rounded border border-white/10 p-2"><div className="mb-1 text-[10px] text-cyan-200">1. 建筑底图（强制确认）</div><div className="flex gap-1"><button className={BUTTON} onClick={() => fileRef.current?.click()}><Upload size={12}/>DXF</button><button className={BUTTON} onClick={() => imageRef.current?.click()}><ImageIcon size={12}/>截图</button></div>
          <input ref={fileRef} className="hidden" type="file" accept=".dxf" onChange={(e) => e.target.files?.[0] && void importDxf(e.target.files[0])}/><input ref={imageRef} className="hidden" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void analyzeImage(e.target.files[0])}/>
          <div className="mt-1 grid grid-cols-2 gap-1"><input className={FIELD} type="number" value={d.calibrationWidthMm || 24000} onChange={(e) => update({ calibrationWidthMm: Number(e.target.value) })}/><input className={FIELD} type="number" value={d.calibrationHeightMm || 12000} onChange={(e) => update({ calibrationHeightMm: Number(e.target.value) })}/></div>
          <div className="mt-1 text-[9px] text-white/50">校准宽 × 高（mm） · {d.source?.name || '未导入'}</div>
          <button className={`${BUTTON} mt-1 w-full ${locked ? 'border-emerald-400/40' : ''}`} disabled={!architecture} onClick={() => update({ architectureLocked: !locked, candidates: locked ? [] : candidates, render: locked ? null : d.render })}>{locked ? <><Lock size={12}/>底图已锁定（点击解锁）</> : <><LockOpen size={12}/>确认并锁定底图</>}</button>
        </div>
        <div className="rounded border border-white/10 p-2"><div className="mb-1 text-[10px] text-cyan-200">2. 展陈需求</div><textarea className={`${FIELD} h-24 resize-none`} value={sourceText} placeholder="粘贴展陈大纲；运行时由 LLM 提炼结构化需求" onChange={(e) => update({ sourceText: e.target.value })}/><label className="mt-1 block text-[9px] text-white/50">最小通道宽度（mm）</label><input className={FIELD} type="number" min={600} value={d.minimumPathWidth || 1200} onChange={(e) => update({ minimumPathWidth: Number(e.target.value) })}/></div>
        <button className={`${BUTTON} w-full border-cyan-400/30`} disabled={!locked || !!busy} onClick={() => void runLayout()}>{busy ? <Loader2 size={12} className="animate-spin"/> : <Play size={12}/>}生成 3 套布局</button>
        {active && <div className="rounded border border-white/10 p-2 text-[9px] text-white/65"><div>评分 {active.score} · {active.validation.status === 'passed' ? '规则通过' : active.validation.status === 'warning' ? '存在风险' : '规则未通过'}</div><div>利用率 {(active.validation.metrics.areaUtilization * 100).toFixed(1)}% · 拥堵 {active.validation.metrics.congestionPoints} · 最小通道 {active.validation.metrics.minimumPathWidth}mm</div><div className="mt-1 max-h-16 overflow-auto text-red-300">{active.validation.errors.join('；')}</div></div>}
        <div className="text-[9px] leading-4 text-amber-200/70">仅进行方案级校验；最终设计须由具备资质的建筑、消防和展陈设计人员审核。</div>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex gap-1">{candidates.map((c) => <button key={c.id} className={`${BUTTON} ${c.id === active?.id ? 'border-cyan-300 bg-cyan-400/15' : ''}`} onClick={() => update({ activeCandidateId: c.id, imageUrl: svgDataUrl(buildFloorplanSvg(architecture!, c)) })}>{c.name} {c.score}</button>)}</div>
        <div className="relative h-[430px] overflow-hidden rounded border border-white/10 bg-slate-900">{architecture ? <svg ref={svgRef} className="h-full w-full touch-none" viewBox={`${architecture.bounds.x - 500} ${architecture.bounds.y - 500} ${architecture.bounds.width + 1000} ${architecture.bounds.height + 1000}`} onPointerMove={onMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
          <rect x={architecture.bounds.x - 500} y={architecture.bounds.y - 500} width={architecture.bounds.width + 1000} height={architecture.bounds.height + 1000} fill="#0f172a"/>
          <g>{architecture.walls.map((w) => <polyline key={w.id} points={w.polyline.map((p) => p.join(',')).join(' ')} fill="none" stroke="#64748b" strokeWidth={w.thickness}/>)}</g>
          <g>{architecture.columns.map((c) => <rect key={c.id} {...c} fill="#64748b"/>)}{architecture.openings.map((o) => <circle key={o.id} cx={o.position[0]} cy={o.position[1]} r={180} fill={o.type === 'exit' ? '#22c55e' : '#eab308'}/>)}</g>
          <g>{active?.items.map((item) => <g key={item.id} transform={`rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.depth / 2})`} onPointerDown={(e) => { e.stopPropagation(); const p = pointerPoint(e); setSelectedItem(item.id); setDrag({ id: item.id, dx: p.x - item.x, dy: p.y - item.y }); e.currentTarget.setPointerCapture(e.pointerId); }}><rect x={item.x} y={item.y} width={item.width} height={item.depth} rx={80} fill={active.validation.conflicts.includes(item.id) ? '#ef4444' : '#2563eb'} stroke={selectedItem === item.id ? '#67e8f9' : '#bfdbfe'} strokeWidth={selectedItem === item.id ? 80 : 35}/><text x={item.x + 70} y={item.y + Math.min(300, item.depth - 40)} fontSize={240} fill="white">{item.type}</text></g>)}</g>
        </svg> : <div className="flex h-full items-center justify-center text-xs text-white/35">导入 DXF 或校准截图后显示精确布局</div>}</div>
        {selected && <div className="flex items-center gap-1 rounded border border-white/10 p-1 text-[9px]"><span className="px-1">{selected.id}</span><input className={`${FIELD} w-20`} type="number" value={selected.width} onChange={(e) => patchCandidate({ ...active!, items: active!.items.map((i) => i.id === selected.id ? { ...i, width: Number(e.target.value) } : i) })}/><input className={`${FIELD} w-20`} type="number" value={selected.depth} onChange={(e) => patchCandidate({ ...active!, items: active!.items.map((i) => i.id === selected.id ? { ...i, depth: Number(e.target.value) } : i) })}/><button className={BUTTON} onClick={() => patchCandidate({ ...active!, items: active!.items.map((i) => i.id === selected.id ? { ...i, rotation: (i.rotation + 90) % 360 } : i) })}><RotateCw size={11}/>旋转</button><button className={BUTTON} onClick={() => active && void validate(active)}>重新校验</button></div>}
        <div className="flex flex-wrap gap-1"><button className={BUTTON} disabled={!active} onClick={() => downloadText(`floorplan-${active?.id}.json`, JSON.stringify({ version: 1, architecture, requirement, candidate: active }, null, 2), 'application/json')}><Download size={11}/>导出 JSON</button><button className={BUTTON} onClick={() => jsonRef.current?.click()}><Upload size={11}/>导入 JSON</button><input ref={jsonRef} className="hidden" type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void importLayoutJson(e.target.files[0])}/><button className={BUTTON} disabled={!svg} onClick={() => downloadText(`floorplan-${active?.id}.svg`, svg, 'image/svg+xml')}><Download size={11}/>SVG</button><button className={BUTTON} disabled={!active || !!busy} onClick={() => void renderAi()}><ImageIcon size={11}/>生成 AI 表现图</button><button className={BUTTON} disabled={!active} onClick={() => patchCandidate({ ...active!, confirmed: true })}>人工确认方案</button></div>
        {d.render?.imageUrl && <div className="rounded border border-white/10 p-1"><div className="mb-1 text-[9px] text-white/55">AI 表现层 {d.render.stale ? '（布局已变化，当前预览已过期）' : ''}</div><img className={`max-h-48 w-full rounded object-contain ${d.render.stale ? 'opacity-40' : ''}`} src={d.render.imageUrl}/></div>}
      </div>
    </div>
    {d.error && <div className="border-t border-red-400/20 px-3 py-1 text-[10px] text-red-300">{d.error}</div>}
  </div>;
}

export default memo(ExhibitionFloorplanLayoutNode);
