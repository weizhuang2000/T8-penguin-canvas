import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps, type Node, type Edge } from '@xyflow/react';
import { Repeat, Play, Square, Loader2, AlertCircle, GitBranch, Layers } from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useThemeStore } from '../../stores/theme';
import { useRunBusStore } from '../../stores/runBus';
import { useUpstreamMaterials, type MaterialKind, type Material } from './useUpstreamMaterials';
import { topologicalSort } from '../../utils/topologicalSort';
import { PORT_COLOR } from '../../config/portTypes';

/**
 * LoopNode — 工具节点：循环器（v1.2.8 新增）
 *
 * 功能:
 *   1. 接收上游 N 个同类型素材 (text / image / video / audio)
 *   2. 两种模式:
 *      - serial 串联循环: 每轮把第 i 个素材注入自身 → 触发整条下游可执行子图 → 等成功/失败 → 下一轮
 *      - parallel 并联循环: 克隆 (N-1) 份完整下游子图 + 为每个克隆链建一个 supplier upload
 *        节点喂入 items[i] → 并发触发 N 条链 → 等所有完成
 *   3. 输出聚合: imageUrls / urls / videoUrls / audioUrls 数组 (失败位 null 占位)
 *
 * 重要不变量:
 *   - 不修改任何现有 16 个可执行节点
 *   - 不修改 useUpstreamMaterials / topologicalSort
 *   - 仅利用 v1.2.8 扩展的 runBus.runningIds + triggerRunMany
 */

// 循环器自身可被批量运行调起（在外面 EXECUTABLE_NODE_TYPES 集合里注册），
// 但循环器执行时调度的下游子图不能反过来再次包含自己——下面执行逻辑已用直接下游 BFS 限定子图。
const EXEC_TYPES = new Set<string>([
  'image', 'edit',
  'multi-angle-3d', 'panorama-720', 'penguin-portrait',
  'video', 'seedance', 'audio', 'llm', 'runninghub', 'runninghub-wallet',
  'resize', 'upscale', 'grid-crop', 'remove-bg', 'combine',
  'frame-extractor', 'frame-pair',
  'upload',
]);

const COLOR = '#a78bfa'; // violet-400

type LoopMode = 'serial' | 'parallel';

const KIND_LABEL: Record<MaterialKind, string> = { text: '文本', image: '图像', video: '视频', audio: '音频' };

// ===== helper: 把单条素材注入 patch =====
function buildItemPatch(kind: MaterialKind, item: string) {
  if (kind === 'image') return { imageUrl: item, imageUrls: [item] };
  if (kind === 'video') return { videoUrl: item };
  if (kind === 'audio') return { audioUrl: item };
  // text
  return { text: item, prompt: item, outputText: item };
}
// 重置 patch（开始新轮次前清空可能的旧数据）
function buildResetPatch(kind: MaterialKind) {
  if (kind === 'image') return { imageUrl: '', imageUrls: [] };
  if (kind === 'video') return { videoUrl: '' };
  if (kind === 'audio') return { audioUrl: '' };
  return { text: '', prompt: '', outputText: '' };
}

// ===== helper: 从某个节点 data 提取对应 kind 的产物 url/text =====
function extractFromNode(node: Node | undefined, kind: MaterialKind): string | null {
  if (!node) return null;
  const ud: any = node.data || {};
  if (kind === 'image') {
    if (typeof ud.imageUrl === 'string' && ud.imageUrl) return ud.imageUrl;
    if (Array.isArray(ud.imageUrls) && ud.imageUrls[0]) return ud.imageUrls[0];
    if (Array.isArray(ud.urls) && ud.urls[0]) return ud.urls[0];
    // v1.2.8.5: FramePair 节点兼容 (firstFrameUrl/lastFrameUrl 两个字段中任一表明本轮有产物)
    if (typeof ud.firstFrameUrl === 'string' && ud.firstFrameUrl) return ud.firstFrameUrl;
    if (typeof ud.lastFrameUrl === 'string' && ud.lastFrameUrl) return ud.lastFrameUrl;
  } else if (kind === 'video') {
    if (typeof ud.videoUrl === 'string' && ud.videoUrl) return ud.videoUrl;
  } else if (kind === 'audio') {
    if (typeof ud.audioUrl === 'string' && ud.audioUrl) return ud.audioUrl;
  } else {
    if (typeof ud.outputText === 'string' && ud.outputText) return ud.outputText;
    if (typeof ud.reply === 'string' && ud.reply) return ud.reply;
    if (typeof ud.text === 'string' && ud.text) return ud.text;
    if (typeof ud.prompt === 'string' && ud.prompt) return ud.prompt;
  }
  return null;
}

// ===== helper: BFS 沿出边收集可达节点 (含起点) =====
function bfsForward(allEdges: Edge[], starts: string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...starts];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const e of allEdges) {
      if (e.source === cur && !visited.has(e.target)) queue.push(e.target);
    }
  }
  return visited;
}

// ===== helper: 等待某节点 lastDone =====
// 重要 BUGFIX: 必须用 startTs 过滤上一轮遗留的 lastDone, 否则同一 nodeId 被循环复用时,
// subscribe 在 triggerRunMany() 触发的 set 第一次回调会看到 lastDone.id === nodeId (上轮的) 立刻 finish,
// 导致本轮根本没跑。
function awaitNode(nodeId: string, cancelRef: React.MutableRefObject<boolean>, timeoutMs = 5 * 60 * 1000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const startTs = Date.now();
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      off();
      window.clearTimeout(timer);
      resolve(ok);
    };
    const off = useRunBusStore.subscribe((state) => {
      if (state.lastDone && state.lastDone.id === nodeId && state.lastDone.ts >= startTs) finish(state.lastDone.ok);
      if (cancelRef.current) finish(false);
    });
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    // 用 triggerRunMany([id]) 而非 triggerRun(id) 触发——这样并联多链时 currentRunId 不会互相覆盖
    useRunBusStore.getState().triggerRunMany([nodeId]);
  });
}

// ===== helper: 等待某节点 lastDone, 但不发起触发 (并联模式各链内部已自行 trigger) =====
function awaitOnly(nodeId: string, cancelRef: React.MutableRefObject<boolean>, timeoutMs = 5 * 60 * 1000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const startTs = Date.now();
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      off();
      window.clearTimeout(timer);
      resolve(ok);
    };
    const off = useRunBusStore.subscribe((state) => {
      if (state.lastDone && state.lastDone.id === nodeId && state.lastDone.ts >= startTs) finish(state.lastDone.ok);
      if (cancelRef.current) finish(false);
    });
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    useRunBusStore.getState().triggerRunMany([nodeId]);
  });
}

const LoopNode = (p: NodeProps) => {
  const id = p.id;
  const update = useUpdateNodeData(id);
  const d = (p.data as any) || {};
  const { theme, style } = useThemeStore();
  const isPixel = style === 'pixel';
  const isDark = theme === 'dark';
  const rf = useReactFlow();

  const mode: LoopMode = (d?.mode === 'parallel' ? 'parallel' : 'serial');
  const kind: MaterialKind = (['text', 'image', 'video', 'audio'] as const).includes(d?.kind) ? d.kind : 'image';
  const status: 'idle' | 'running' | 'success' | 'error' = d?.status || 'idle';
  const progress: { done: number; total: number; ok: number; fail: number } = d?.progress || { done: 0, total: 0, ok: 0, fail: 0 };
  const outputs: Array<string | null> = Array.isArray(d?.outputs) ? d.outputs : [];

  const [error, setError] = useState<string | null>(d?.error || null);
  const cancelRef = useRef<boolean>(false);

  // 上游素材聚合 (按 kind 取对应数组)
  // v1.2.8.1: items 从 string[] 改为 Material[], 保留 sourceNodeId 供并联克隆时直连原始上游
  const upstream = useUpstreamMaterials(id);
  const items = useMemo<Material[]>(() => {
    const list = kind === 'image' ? upstream.images
      : kind === 'video' ? upstream.videos
      : kind === 'audio' ? upstream.audios
      : upstream.texts;
    return list.filter((m) => Boolean(m.url));
  }, [upstream.images, upstream.videos, upstream.audios, upstream.texts, kind]);

  // ===== 串联执行 =====
  const runSerial = useCallback(async (): Promise<void> => {
    if (items.length === 0) { setError('上游没有可循环的素材'); return; }
    setError(null);
    cancelRef.current = false;
    update({ status: 'running', error: null, outputs: [], progress: { done: 0, total: items.length, ok: 0, fail: 0 }, ...buildResetPatch(kind) });

    const allNodes = rf.getNodes();
    const allEdges = rf.getEdges();
    const directs = allEdges.filter((e) => e.source === id).map((e) => e.target);
    if (directs.length === 0) { setError('请先把循环器输出端连到下游执行节点'); update({ status: 'error', error: '未连接下游' }); return; }

    const reachable = bfsForward(allEdges, directs);
    const subNodes = allNodes.filter((n) => reachable.has(n.id));
    const subEdges = allEdges.filter((e) => reachable.has(e.source) && reachable.has(e.target));
    const order = topologicalSort(subNodes, subEdges, EXEC_TYPES);
    if (order.length === 0) { setError('下游链路上没有可执行节点'); update({ status: 'error', error: '无可执行节点' }); return; }

    // v1.2.8.3: 子图末端 OutputNode 集合（跨轮累积呈现多轮产物，避免中间节点 imageUrl 被下一轮覆盖后丢失历史输出）
    const outputNodeIds = new Set(subNodes.filter((n) => n.type === 'output').map((n) => n.id));
    if (outputNodeIds.size > 0) {
      // 开始新一轮串联前，清空这些 OutputNode 的 direct*Urls 以免混入上一次循环遗留
      rf.setNodes((prev) => prev.map((nd) => {
        if (!outputNodeIds.has(nd.id)) return nd;
        const od: any = nd.data || {};
        const next: any = { ...od };
        // v1.2.8.5: 不论当前 kind 是什么, 都一次性清掉 direct* 多产物累积池, 避免不同轮次 kind 切换遗留
        next.directImageUrls = [];
        next.directVideoUrls = [];
        next.directAudioUrls = [];
        next.directOutputText = '';
        return { ...nd, data: next };
      }));
    }

    const collected: Array<string | null> = [];
    let okCount = 0; let failCount = 0;

    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;
      // 1. 注入第 i 个素材到本节点 (同时 reset 下游上一轮产出, 避免老状态脱裤子)
      update({ ...buildResetPatch(kind), ...buildItemPatch(kind, items[i].url) });
      // 重要: rAF 一帧不够 xyflow store 落盘 + 下游 useNodesData 重渲染, 需 setTimeout(80)
      await new Promise<void>((r) => setTimeout(() => r(), 80));

      // 2. 串行触发整条下游链 (任一失败则本轮终止 → 下一轮)
      let chainOk = true;
      for (const nid of order) {
        if (cancelRef.current) { chainOk = false; break; }
        const ok = await awaitNode(nid, cancelRef);
        if (!ok) { chainOk = false; break; }
      }

      // 3. 收集本轮终点产物 (取直接下游第一个的当前 data)
      let result: string | null = null;
      if (chainOk) {
        // 子图有可能在 update 之后状态被改写，重新取最新 node
        const cur = rf.getNode(directs[0]);
        result = extractFromNode(cur, kind);
      }
      collected.push(result);
      if (result) okCount++; else failCount++;
      update({ outputs: [...collected], progress: { done: i + 1, total: items.length, ok: okCount, fail: failCount } });

      // v1.2.8.6: 本轮收尾——直接读每个 OutputNode 的上游源头节点 data（按 sourceHandle 过滤）
      //           以避免依赖 OutputNode 透传 useEffect 的异步时序 —— 上轮的 awaitNode 返回后,
      //           生成节点 (如 FramePair) 的 firstFrameUrl/lastFrameUrl 已落盘, 源头字段就是本轮产物。
      //           这样无论 OutputNode 透传是否到位, LoopNode 都能拿到本轮真实快照。
      if (outputNodeIds.size > 0) {
        // 小额等待 (40ms) 让上游节点 update() 后的 setNodes 提交到 xyflow store, rf.getNode 能读到新值
        await new Promise<void>((r) => setTimeout(() => r(), 40));
        const liveByOutput = new Map<string, string[]>();
        for (const outId of outputNodeIds) {
          const inbound = rf.getEdges().filter((e) => e.target === outId);
          const live: string[] = [];
          const pushUniq = (arr: string[], v: any) => {
            if (typeof v !== 'string') return;
            const s = v.trim();
            if (!s) return;
            if (arr.indexOf(s) === -1) arr.push(s);
          };
          for (const e of inbound) {
            const upNode = rf.getNode(e.source);
            if (!upNode) continue;
            const ud: any = upNode.data || {};
            const sh: string | null = (e as any).sourceHandle ?? null;
            // FramePair: 按 sourceHandle 过滤
            const isFramePair =
              Object.prototype.hasOwnProperty.call(ud, 'firstFrameUrl') &&
              Object.prototype.hasOwnProperty.call(ud, 'lastFrameUrl');
            if (isFramePair) {
              if (sh === 'first') pushUniq(live, ud.firstFrameUrl);
              else if (sh === 'last') pushUniq(live, ud.lastFrameUrl);
              else { pushUniq(live, ud.firstFrameUrl); pushUniq(live, ud.lastFrameUrl); }
              continue;
            }
            // 通用节点: 按 kind 读对应字段
            if (kind === 'image') {
              pushUniq(live, ud.imageUrl);
              if (Array.isArray(ud.imageUrls)) ud.imageUrls.forEach((u: any) => pushUniq(live, u));
              if (Array.isArray(ud.urls)) ud.urls.forEach((u: any) => pushUniq(live, u));
              if (Array.isArray(ud.generatedImages)) ud.generatedImages.forEach((u: any) => pushUniq(live, u));
            } else if (kind === 'video') {
              pushUniq(live, ud.videoUrl);
              if (Array.isArray(ud.videoUrls)) ud.videoUrls.forEach((u: any) => pushUniq(live, u));
            } else if (kind === 'audio') {
              pushUniq(live, ud.audioUrl);
              pushUniq(live, ud.audioUrl_1);
              if (Array.isArray(ud.audioUrls)) ud.audioUrls.forEach((u: any) => pushUniq(live, u));
            }
          }
          liveByOutput.set(outId, live);
        }
        rf.setNodes((prev) => prev.map((nd) => {
          if (!outputNodeIds.has(nd.id)) return nd;
          const live = liveByOutput.get(nd.id) || [];
          if (live.length === 0) return nd;
          const od: any = nd.data || {};
          const next: any = { ...od };
          if (kind === 'image') {
            const cur = Array.isArray(od.directImageUrls) ? od.directImageUrls.slice() : [];
            for (const u of live) if (cur.indexOf(u) === -1) cur.push(u);
            next.directImageUrls = cur;
          } else if (kind === 'video') {
            const cur = Array.isArray(od.directVideoUrls) ? od.directVideoUrls.slice() : [];
            for (const u of live) if (cur.indexOf(u) === -1) cur.push(u);
            next.directVideoUrls = cur;
          } else if (kind === 'audio') {
            const cur = Array.isArray(od.directAudioUrls) ? od.directAudioUrls.slice() : [];
            for (const u of live) if (cur.indexOf(u) === -1) cur.push(u);
            next.directAudioUrls = cur;
          } else {
            // text 入 directOutputText (拼接)
            const liveText = live.join('\n\n');
            const sep = '\n\n\u2500\u2500\u2500\u2500\u2500\u2500\n\n';
            const prev2: string = typeof od.directOutputText === 'string' ? od.directOutputText : '';
            next.directOutputText = prev2 ? prev2 + sep + liveText : liveText;
          }
          return { ...nd, data: next };
        }));
      }
    }

    // 4. 最终聚合到 imageUrls / urls / videoUrl... (取成功结果)
    const successOnly = collected.filter((x): x is string => !!x);
    const aggPatch: any = {};
    if (kind === 'image') { aggPatch.imageUrls = successOnly; aggPatch.urls = successOnly; aggPatch.imageUrl = successOnly[0] || ''; }
    else if (kind === 'video') { aggPatch.videoUrl = successOnly[0] || ''; aggPatch.videoUrls = successOnly; }
    else if (kind === 'audio') { aggPatch.audioUrl = successOnly[0] || ''; aggPatch.audioUrls = successOnly; }
    else { aggPatch.text = successOnly.join('\n\n'); aggPatch.prompt = successOnly.join('\n\n'); aggPatch.outputText = successOnly.join('\n\n'); aggPatch.texts = successOnly; }
    update({ status: cancelRef.current ? 'idle' : (failCount === items.length ? 'error' : 'success'), error: null, ...aggPatch });
  }, [id, items, kind, rf, update]);

  // ===== 并联执行 =====
  const runParallel = useCallback(async (): Promise<void> => {
    if (items.length === 0) { setError('上游没有可循环的素材'); return; }
    setError(null);
    cancelRef.current = false;
    update({ status: 'running', error: null, outputs: [], progress: { done: 0, total: items.length, ok: 0, fail: 0 } });

    const allNodes = rf.getNodes();
    const allEdges = rf.getEdges();
    const directs = allEdges.filter((e) => e.source === id).map((e) => e.target);
    if (directs.length === 0) { setError('请先把循环器输出端连到下游执行节点'); update({ status: 'error', error: '未连接下游' }); return; }

    const reachable = bfsForward(allEdges, directs);
    const subNodes = allNodes.filter((n) => reachable.has(n.id));
    const subEdges = allEdges.filter((e) => reachable.has(e.source) && reachable.has(e.target));
    const originalOrder = topologicalSort(subNodes, subEdges, EXEC_TYPES);
    if (originalOrder.length === 0) { setError('下游链路上没有可执行节点'); update({ status: 'error', error: '无可执行节点' }); return; }

    // 子图边界 (用于克隆排版)
    const minY = Math.min(...subNodes.map((n) => n.position.y));
    const maxY = Math.max(...subNodes.map((n) => n.position.y + ((n as any).measured?.height || (n as any).height || 200)));
    const blockH = (maxY - minY) + 30;

    const ts = Date.now();
    const allNewNodes: Node[] = [];
    const allNewEdges: Edge[] = [];
    const cloneIdMaps: Array<Map<string, string>> = [];

    // v1.2.8.1: 为 i=1..N-1 克隆完整下游子图, 克隆链入口节点 直接连接到 items[i].sourceNodeId (原始上游素材节点)
    // 不再创建 supplier output 节点, 避免克隆出一堆中转节点。
    for (let i = 1; i < items.length; i++) {
      const item = items[i];
      const idMap = new Map<string, string>();
      subNodes.forEach((n, idx) => idMap.set(n.id, `loop-${id}-${ts}-${i}-n${idx}`));
      const yOffset = i * blockH;
      const clonedNodes: Node[] = subNodes.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        position: { x: n.position.x, y: n.position.y + yOffset },
        data: { ...(n.data as any), status: 'idle', error: null, __loopClone: id },
        selected: false,
      } as Node));
      const clonedEdges: Edge[] = subEdges.map((e, idx) => ({
        ...e,
        id: `loop-${id}-${ts}-${i}-e${idx}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      } as Edge));

      // 克隆链入口节点 → 直接连原始上游 sourceNodeId (不再克隆中转节点)
      const entryCloneId = idMap.get(directs[0])!;
      const directEdge: Edge = {
        id: `loop-supe-${id}-${ts}-${i}`,
        source: item.sourceNodeId,
        target: entryCloneId,
        type: 'deletable',
      } as Edge;

      cloneIdMaps.push(idMap);
      allNewNodes.push(...clonedNodes);
      allNewEdges.push(...clonedEdges, directEdge);
    }

    // 写入画布
    if (allNewNodes.length > 0) rf.addNodes(allNewNodes);
    if (allNewEdges.length > 0) rf.setEdges((eds) => [...eds, ...allNewEdges]);

    // 注入 items[0] 到自身 (原版下游链使用, i=0 链仍走 LoopNode 中转)
    update(buildItemPatch(kind, items[0].url));
    await new Promise<void>((r) => setTimeout(() => r(), 120)); // 等克隆 + 数据落 store + xyflow useNodesData 重订阅

    // 计算每条链的拓扑顺序
    const chainOrders: string[][] = [originalOrder];
    for (const idMap of cloneIdMaps) {
      chainOrders.push(originalOrder.map((nid) => idMap.get(nid) || nid));
    }

    // 每条链内部串行 + 多链并发
    const collected: Array<string | null> = new Array(items.length).fill(null);
    let okCount = 0; let failCount = 0;
    const updateProgress = () => update({ progress: { done: okCount + failCount, total: items.length, ok: okCount, fail: failCount }, outputs: [...collected] });

    const runChain = async (chainIdx: number): Promise<void> => {
      const chain = chainOrders[chainIdx];
      let chainOk = true;
      for (const nid of chain) {
        if (cancelRef.current) { chainOk = false; break; }
        const ok = await awaitOnly(nid, cancelRef);
        if (!ok) { chainOk = false; break; }
      }
      // 收集
      let result: string | null = null;
      if (chainOk) {
        const targetEntry = chainIdx === 0 ? directs[0] : (cloneIdMaps[chainIdx - 1].get(directs[0]) || directs[0]);
        const cur = rf.getNode(targetEntry);
        result = extractFromNode(cur, kind);
      }
      collected[chainIdx] = result;
      if (result) okCount++; else failCount++;
      updateProgress();
    };

    await Promise.all(chainOrders.map((_, i) => runChain(i)));

    // 最终聚合
    const successOnly = collected.filter((x): x is string => !!x);
    const aggPatch: any = {};
    if (kind === 'image') { aggPatch.imageUrls = successOnly; aggPatch.urls = successOnly; aggPatch.imageUrl = successOnly[0] || ''; }
    else if (kind === 'video') { aggPatch.videoUrl = successOnly[0] || ''; aggPatch.videoUrls = successOnly; }
    else if (kind === 'audio') { aggPatch.audioUrl = successOnly[0] || ''; aggPatch.audioUrls = successOnly; }
    else { aggPatch.text = successOnly.join('\n\n'); aggPatch.prompt = successOnly.join('\n\n'); aggPatch.outputText = successOnly.join('\n\n'); aggPatch.texts = successOnly; }
    update({ status: cancelRef.current ? 'idle' : (failCount === items.length ? 'error' : 'success'), error: null, ...aggPatch });
  }, [id, items, kind, rf, update]);

  const handleRun = useCallback(async () => {
    try {
      if (mode === 'parallel') await runParallel();
      else await runSerial();
    } catch (e: any) {
      const msg = e?.message || '循环执行失败';
      setError(msg);
      update({ status: 'error', error: msg });
    }
  }, [mode, runSerial, runParallel, update]);

  const handleStop = () => {
    cancelRef.current = true;
    update({ status: 'idle' });
    useRunBusStore.getState().cancelAll();
  };

  // 接入运行总线 (供批量运行 ▶ 调起本节点)
  useRunTrigger(id, async () => {
    if (status === 'running') return;
    await handleRun();
  });

  // ===== 双主题 token =====
  // 重要: 必须固定 width 不能只设 minWidth, 否则子元素的预览图 / 视频会把节点擑到反近十倍宽
  const containerStyle: React.CSSProperties = isPixel
    ? { background: 'var(--px-surface)', border: '2px solid var(--px-ink)', borderRadius: 8, boxShadow: p.selected ? '5px 5px 0 var(--px-ink)' : '3px 3px 0 var(--px-ink)', width: 300 }
    : isDark
      ? { background: 'rgba(20,20,22,0.92)', border: `2px solid ${p.selected ? COLOR : 'rgba(255,255,255,0.15)'}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', width: 300 }
      : { background: 'rgba(255,255,255,0.95)', border: `2px solid ${p.selected ? COLOR : 'rgba(0,0,0,0.12)'}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', width: 300 };

  // 像素风 headerBg 改为 surface 白底 (与 FramePair/Upload/Pick 一致), 仅图标色块用 peach
  const headerBg = isPixel ? 'var(--px-surface)' : isDark ? 'rgba(167,139,250,0.16)' : 'rgba(167,139,250,0.12)';
  const headerColor = isPixel ? 'var(--px-ink)' : isDark ? '#ddd6fe' : '#6d28d9';
  const labelColor = isPixel ? 'var(--px-ink)' : isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
  const subLabel = isPixel ? 'rgba(0,0,0,0.55)' : isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';

  const handleColor = kind === 'image' ? PORT_COLOR.image : kind === 'video' ? PORT_COLOR.video : kind === 'audio' ? PORT_COLOR.audio : PORT_COLOR.text;

  // ===== 按钮样式 (科技风 / 像素风) =====
  const segBtn = (active: boolean): React.CSSProperties => isPixel
    ? { padding: '4px 10px', fontSize: 11, fontWeight: 700, border: '2px solid var(--px-ink)', background: active ? 'var(--px-mint)' : 'var(--px-surface)', color: 'var(--px-ink)', cursor: 'pointer', boxShadow: active ? 'inset 2px 2px 0 rgba(0,0,0,0.15)' : '2px 2px 0 var(--px-ink)' }
    : { padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', background: active ? COLOR : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'), color: active ? '#1a1a2e' : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'), cursor: 'pointer' };

  const primaryBtn: React.CSSProperties = isPixel
    ? { padding: '6px 14px', fontSize: 12, fontWeight: 700, border: '2px solid var(--px-ink)', background: 'var(--px-mint)', color: 'var(--px-ink)', cursor: 'pointer', boxShadow: '2px 2px 0 var(--px-ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }
    : { padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: COLOR, color: '#1a1a2e', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

  const stopBtn: React.CSSProperties = { ...primaryBtn, background: isPixel ? 'var(--px-peach)' : '#ef4444', color: isPixel ? 'var(--px-ink)' : '#fff' };

  return (
    <div className="relative" style={containerStyle}>
      {/* target handle (左) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: handleColor, width: 12, height: 12, top: '50%', left: -6, transform: 'translateY(-50%)', border: 'none', zIndex: 12 }}
        title={`接入上游 ${KIND_LABEL[kind]}`}
      />
      {/* source handle (右) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: handleColor, width: 12, height: 12, top: '50%', right: -6, transform: 'translateY(-50%)', border: 'none', zIndex: 12 }}
        title={`输出 ${KIND_LABEL[kind]} (循环驱动下游)`}
      />

      {/* 头部 (像素风: 白底 surface + peach 图标色块, 与 FramePair / Upload 等其他工具节点一致) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: headerBg, borderBottom: isPixel ? '2px solid var(--px-ink)' : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, borderRadius: isPixel ? '6px 6px 0 0' : '10px 10px 0 0' }}>
        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isPixel ? 'var(--px-peach, #FFCBA4)' : (isDark ? 'rgba(167,139,250,0.18)' : 'rgba(167,139,250,0.18)'), border: isPixel ? '2px solid var(--px-ink)' : 'none', borderRadius: isPixel ? 0 : 6, flexShrink: 0 }}>
          <Repeat size={13} color={isPixel ? 'var(--px-ink)' : headerColor} />
        </div>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: headerColor }}>循环器</div>
        <span style={{ fontSize: 10, color: subLabel }}>{items.length} 项 · {KIND_LABEL[kind]}</span>
      </div>

      {/* body */}
      <div className="nodrag" style={{ padding: 10 }} onMouseDown={(e) => e.stopPropagation()} onWheelCapture={(e) => e.stopPropagation()}>
        {/* 模式切换 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button
            type="button"
            style={segBtn(mode === 'serial')}
            onClick={() => update({ mode: 'serial' })}
            disabled={status === 'running'}
            title="串联：第 i 个素材跑完整条下游链 → 下一个"
          >
            <GitBranch size={11} style={{ marginRight: 4, verticalAlign: -2 }} />串联循环
          </button>
          <button
            type="button"
            style={segBtn(mode === 'parallel')}
            onClick={() => update({ mode: 'parallel' })}
            disabled={status === 'running'}
            title="并联：克隆 N 份下游子图 → 同时跑"
          >
            <Layers size={11} style={{ marginRight: 4, verticalAlign: -2 }} />并联循环
          </button>
        </div>

        {/* 类型选择 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
          {(['text', 'image', 'video', 'audio'] as MaterialKind[]).map((k) => (
            <button
              key={k}
              type="button"
              style={segBtn(kind === k)}
              onClick={() => update({ kind: k })}
              disabled={status === 'running'}
              title={`处理 ${KIND_LABEL[k]} 素材`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {/* 上游素材池预览 */}
        <div style={{ marginBottom: 8, fontSize: 10, color: subLabel }}>上游素材 ({items.length})</div>
        {/* minmax(0, 1fr) 是关键: 不加 子项的 aspect-ratio + img/video 会把列宽反向擑大 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, marginBottom: 10, minHeight: 0, width: '100%' }}>
          {items.length === 0 && (
            <div style={{ gridColumn: '1 / 4', padding: '12px 8px', textAlign: 'center', fontSize: 11, color: subLabel, border: isPixel ? '2px dashed var(--px-ink)' : `1px dashed ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`, borderRadius: 4 }}>
              请连接上游 N 个 {KIND_LABEL[kind]} 节点
            </div>
          )}
          {items.slice(0, 9).map((m, i) => (
            <div key={i} style={{ aspectRatio: '1 / 1', borderRadius: 4, overflow: 'hidden', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: isPixel ? '1px solid var(--px-ink)' : 'none', minWidth: 0 }}>
              {kind === 'image' ? (
                <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : kind === 'video' ? (
                <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} muted playsInline preload="metadata" />
              ) : kind === 'audio' ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: labelColor }}>♪ {(m.url.split('/').pop() || '').slice(0, 10)}</div>
              ) : (
                <div style={{ padding: 4, fontSize: 9, lineHeight: 1.2, color: labelColor, height: '100%', overflow: 'hidden', wordBreak: 'break-all' }}>{(m.url || '').slice(0, 40)}</div>
              )}
            </div>
          ))}
          {items.length > 9 && <div style={{ gridColumn: '1 / 4', fontSize: 10, color: subLabel, textAlign: 'right' }}>...等 {items.length} 项</div>}
        </div>

        {/* 进度条 */}
        {(status === 'running' || progress.total > 0) && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: subLabel, marginBottom: 3 }}>
              进度 {progress.done}/{progress.total} · 成功 {progress.ok} · 失败 {progress.fail}
            </div>
            <div style={{ height: 4, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`, height: '100%', background: COLOR, transition: 'width .2s' }} />
            </div>
          </div>
        )}

        {/* 错误条 */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 4, background: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: 11, marginBottom: 8 }}>
            <AlertCircle size={11} />
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

        {/* 主按钮 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {status === 'running' ? (
            <button type="button" style={stopBtn} onClick={handleStop}>
              <Square size={11} /> 取消
            </button>
          ) : (
            <button type="button" style={primaryBtn} onClick={handleRun} disabled={items.length === 0}>
              <Play size={11} />
              {mode === 'serial' ? '串联运行' : '并联运行'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {outputs.length > 0 && (
            <span style={{ fontSize: 10, color: subLabel, alignSelf: 'center' }}>已采集 {outputs.filter((x) => x).length}/{outputs.length}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(LoopNode);
