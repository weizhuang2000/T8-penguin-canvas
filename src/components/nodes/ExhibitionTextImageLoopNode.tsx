import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Handle, Position, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { AlertCircle, GitBranch, Image as ImageIcon, Layers, Loader2, Play, Repeat2, Square, Type } from 'lucide-react';
import { useCompactAttrs } from '../../stores/exhibitionCompact';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useRunBusStore } from '../../stores/runBus';
import { useThemeStore } from '../../stores/theme';
import { PORT_COLOR } from '../../config/portTypes';
import { topologicalSort } from '../../utils/topologicalSort';
import { placeBatchNodes, rectOf, type Rect as PlacementRect } from '../../utils/nodePlacement';
import SmartImage from '../SmartImage';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';

type LoopMode = 'serial' | 'parallel';
type PairingMode = 'zip' | 'cycle-shorter' | 'matrix';
type LoopStatus = 'idle' | 'running' | 'success' | 'error';

interface TextImagePair {
  id: string;
  text: Material;
  image: Material;
}

interface ExecAcc {
  images: string[];
  texts: string[];
}

const EXEC_TYPES = new Set<string>([
  'image', 'edit',
  'multi-angle-3d', 'panorama-720', 'penguin-portrait',
  'video', 'seedance', 'audio', 'llm', 'runninghub', 'runninghub-wallet',
  'rh-tools', 'rh-toolbox', 'fal-toolbox', 'comfyui-store',
  'grok-oauth-agent', 'codex-cli-agent',
  'resize', 'upscale', 'grid-crop', 'grid-editor', 'remove-bg', 'combine', 'image-compare', 'drawing-board',
  'panorama-3d',
  'frame-extractor', 'frame-pair',
  'elevation-prompt',
  'exhibition-img2img',
  'exhibition-style-transfer',
  'exhibition-recolor',
  'exhibition-lighting-heatmap',
  'exhibition-creative-image',
  'exhibition-outline-split',
  'exhibition-plan-layout',
  'unit-panel-design',
  'showcase-interior-design',
]);

const LOOP_NODE_WAIT_TIMEOUT_MS = 60 * 60 * 1000;
const COLOR = '#22d3ee';

function buildPairPatch(pair: TextImagePair) {
  return {
    text: pair.text.url,
    prompt: pair.text.url,
    outputText: pair.text.url,
    texts: [pair.text.url],
    textSegments: [pair.text.url],
    segments: [pair.text.url],
    imageUrl: pair.image.url,
    imageUrls: [pair.image.url],
    urls: [pair.image.url],
    pairedTextSourceNodeId: pair.text.sourceNodeId,
    pairedImageSourceNodeId: pair.image.sourceNodeId,
  };
}

function buildResetPatch() {
  return {
    text: '',
    prompt: '',
    outputText: '',
    texts: [],
    textSegments: [],
    segments: [],
    imageUrl: '',
    imageUrls: [],
    urls: [],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function dataHasPair(data: any, pair: TextImagePair): boolean {
  const textValue = pair.text.url;
  const imageValue = pair.image.url;
  const hasText =
    data?.text === textValue ||
    data?.prompt === textValue ||
    data?.outputText === textValue ||
    (Array.isArray(data?.texts) && data.texts.includes(textValue)) ||
    (Array.isArray(data?.textSegments) && data.textSegments.includes(textValue)) ||
    (Array.isArray(data?.segments) && data.segments.includes(textValue));
  const hasImage =
    data?.imageUrl === imageValue ||
    (Array.isArray(data?.imageUrls) && data.imageUrls.includes(imageValue)) ||
    (Array.isArray(data?.urls) && data.urls.includes(imageValue));
  return hasText && hasImage;
}

async function waitForPairData(
  getNode: () => Node | undefined,
  pair: TextImagePair,
  timeoutMs = 1500,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (dataHasPair((getNode()?.data as any) || {}, pair)) {
      await nextFrame();
      await nextFrame();
      return true;
    }
    await sleep(40);
  }
  return false;
}

function buildPairs(texts: Material[], images: Material[], mode: PairingMode): TextImagePair[] {
  if (texts.length === 0 || images.length === 0) return [];
  const pairs: TextImagePair[] = [];
  if (mode === 'matrix') {
    texts.forEach((text, textIndex) => {
      images.forEach((image, imageIndex) => {
        pairs.push({ id: `matrix-${textIndex}-${imageIndex}`, text, image });
      });
    });
    return pairs;
  }
  const total = mode === 'cycle-shorter'
    ? Math.max(texts.length, images.length)
    : Math.min(texts.length, images.length);
  for (let index = 0; index < total; index++) {
    const text = texts[index % texts.length];
    const image = images[index % images.length];
    pairs.push({ id: `${mode}-${index}`, text, image });
  }
  return pairs;
}

function bfsForward(allEdges: Edge[], starts: string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...starts];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const edge of allEdges) {
      if (edge.source === cur && !visited.has(edge.target)) queue.push(edge.target);
    }
  }
  return visited;
}

function pushUnique(arr: string[], value: unknown) {
  if (typeof value !== 'string') return;
  const text = value.trim();
  if (!text || arr.includes(text)) return;
  arr.push(text);
}

function collectNodeResult(node: Node | undefined): string | null {
  const data: any = node?.data || {};
  if (typeof data.imageUrl === 'string' && data.imageUrl) return data.imageUrl;
  if (Array.isArray(data.imageUrls) && data.imageUrls[0]) return data.imageUrls[0];
  if (Array.isArray(data.urls) && data.urls[0]) return data.urls[0];
  if (typeof data.outputText === 'string' && data.outputText) return data.outputText;
  if (typeof data.text === 'string' && data.text) return data.text;
  return null;
}

function awaitNode(nodeId: string, cancelRef: React.MutableRefObject<boolean>, timeoutMs = LOOP_NODE_WAIT_TIMEOUT_MS): Promise<boolean> {
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

const PAIRING_OPTIONS: Array<{ id: PairingMode; label: string; title: string }> = [
  { id: 'zip', label: '一一配对', title: '第 1 段文本配第 1 张图，长度不一致时只运行完整配对' },
  { id: 'cycle-shorter', label: '短集循环', title: '以较长素材集为准，较短的一侧按顺序循环复用' },
  { id: 'matrix', label: '全组合', title: '每段文本和每张图都组合运行' },
];

const ExhibitionTextImageLoopNode = ({ id, data, selected }: NodeProps) => {
  const d = (data || {}) as any;
  const update = useUpdateNodeData(id);
  const compactAttrs = useCompactAttrs(id, 'exhibition-text-image-loop');
  const rf = useReactFlow();
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const upstream = useUpstreamMaterials(id);
  const cancelRef = useRef(false);
  const [error, setError] = useState<string | null>(d.error || null);

  const mode: LoopMode = d.mode === 'parallel' ? 'parallel' : 'serial';
  const pairingMode: PairingMode = d.pairingMode === 'cycle-shorter' || d.pairingMode === 'matrix' ? d.pairingMode : 'zip';
  const status: LoopStatus = d.status || 'idle';
  const progress = d.progress || { done: 0, total: 0, ok: 0, fail: 0 };
  const outputs: Array<string | null> = Array.isArray(d.outputs) ? d.outputs : [];
  const texts = upstream.texts;
  const images = upstream.images;
  const pairs = useMemo(() => buildPairs(texts, images, pairingMode), [texts, images, pairingMode]);

  const discoverOutputNodeIds = useCallback((execSubIds: Set<string>): Set<string> => {
    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    const found = new Set<string>();
    const visited = new Set<string>();
    const queue = Array.from(execSubIds);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const edge of edges) {
        if (edge.source !== cur) continue;
        const target = nodes.find((node) => node.id === edge.target);
        if (!target) continue;
        if (target.type === 'output') found.add(target.id);
        if (!visited.has(target.id)) queue.push(target.id);
      }
    }
    return found;
  }, [rf]);

  const harvestFromExec = useCallback((execSubIds: Set<string>, execAccumulator: Map<string, ExecAcc>) => {
    const nodes = rf.getNodes();
    const ensureAcc = (nodeId: string) => {
      let acc = execAccumulator.get(nodeId);
      if (!acc) {
        acc = { images: [], texts: [] };
        execAccumulator.set(nodeId, acc);
      }
      return acc;
    };
    for (const nodeId of execSubIds) {
      const node = nodes.find((entry) => entry.id === nodeId);
      const nodeData: any = node?.data || {};
      const acc = ensureAcc(nodeId);
      pushUnique(acc.images, nodeData.imageUrl);
      if (Array.isArray(nodeData.imageUrls)) nodeData.imageUrls.forEach((url: unknown) => pushUnique(acc.images, url));
      if (Array.isArray(nodeData.urls)) nodeData.urls.forEach((url: unknown) => pushUnique(acc.images, url));
      if (Array.isArray(nodeData.generatedImages)) nodeData.generatedImages.forEach((url: unknown) => pushUnique(acc.images, url));
      if (Array.isArray(nodeData.textSegments)) nodeData.textSegments.forEach((text: unknown) => pushUnique(acc.texts, text));
      if (Array.isArray(nodeData.texts)) nodeData.texts.forEach((text: unknown) => pushUnique(acc.texts, text));
      pushUnique(acc.texts, nodeData.outputText);
      pushUnique(acc.texts, nodeData.reply);
      pushUnique(acc.texts, nodeData.text);
    }
  }, [rf]);

  const writeFreshToOutputs = useCallback((execSubIds: Set<string>, execAccumulator: Map<string, ExecAcc>, knownOutputs: Set<string>) => {
    const targets = discoverOutputNodeIds(execSubIds);
    if (targets.size === 0) return;
    rf.setNodes((nodes) => nodes.map((node) => {
      if (!targets.has(node.id)) return node;
      const isNewOut = !knownOutputs.has(node.id);
      const inEdges = rf.getEdges().filter((edge) => edge.target === node.id && execSubIds.has(edge.source));
      const imagesOut: string[] = [];
      const textsOut: string[] = [];
      for (const edge of inEdges) {
        const acc = execAccumulator.get(edge.source);
        if (!acc) continue;
        acc.images.forEach((url) => pushUnique(imagesOut, url));
        acc.texts.forEach((text) => pushUnique(textsOut, text));
      }
      if (imagesOut.length === 0 && textsOut.length === 0) return node;
      const oldData: any = node.data || {};
      const curImages = isNewOut ? [] : (Array.isArray(oldData.directImageUrls) ? oldData.directImageUrls : []);
      const curTexts = isNewOut ? [] : (Array.isArray(oldData.directTextSegments)
        ? oldData.directTextSegments
        : typeof oldData.directOutputText === 'string' && oldData.directOutputText
          ? oldData.directOutputText.split('\n\n').map((item: string) => item.trim()).filter(Boolean)
          : []);
      const mergedImages = curImages.slice();
      const mergedTexts = curTexts.slice();
      imagesOut.forEach((url) => pushUnique(mergedImages, url));
      textsOut.forEach((text) => pushUnique(mergedTexts, text));
      return {
        ...node,
        data: {
          ...oldData,
          directImageUrls: mergedImages,
          directOutputText: mergedTexts.join('\n\n'),
          directTextSegments: mergedTexts,
        },
      };
    }));
    targets.forEach((targetId) => knownOutputs.add(targetId));
  }, [discoverOutputNodeIds, rf]);

  const runSerial = useCallback(async () => {
    if (pairs.length === 0) {
      setError('请同时连接文本素材集和图像素材集');
      return;
    }
    setError(null);
    cancelRef.current = false;
    update({
      status: 'running',
      error: '',
      outputs: [],
      progress: { done: 0, total: pairs.length, ok: 0, fail: 0 },
      ...buildResetPatch(),
    });

    const allNodes = rf.getNodes();
    const allEdges = rf.getEdges();
    const directEdges = allEdges.filter((edge) => edge.source === id);
    const directs = Array.from(new Set(directEdges.map((edge) => edge.target)));
    if (directs.length === 0) {
      const msg = '请先把图文循环器连接到下游展陈节点';
      setError(msg);
      update({ status: 'error', error: msg });
      return;
    }

    const reachable = bfsForward(allEdges, directs);
    const subNodes = allNodes.filter((node) => reachable.has(node.id));
    const subEdges = allEdges.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target));
    const order = topologicalSort(subNodes, subEdges, EXEC_TYPES);
    if (order.length === 0) {
      const msg = '下游链路上没有可执行展陈节点';
      setError(msg);
      update({ status: 'error', error: msg });
      return;
    }

    const execSubIds = new Set(subNodes.filter((node) => node.type && EXEC_TYPES.has(node.type)).map((node) => node.id));
    const knownOutputs = new Set(subNodes.filter((node) => node.type === 'output').map((node) => node.id));
    const execAccumulator = new Map<string, ExecAcc>();
    rf.setNodes((nodes) => nodes.map((node) => {
      const isExec = execSubIds.has(node.id);
      const isOut = knownOutputs.has(node.id);
      if (!isExec && !isOut) return node;
      const oldData: any = node.data || {};
      const nextData: any = { ...oldData };
      if (isExec) nextData.__loopAccumulate = id;
      if (isOut) {
        nextData.directImageUrls = [];
        nextData.directOutputText = '';
        nextData.directTextSegments = [];
      }
      return { ...node, data: nextData };
    }));

    const collected: Array<string | null> = [];
    let okCount = 0;
    let failCount = 0;
    try {
      for (let index = 0; index < pairs.length; index++) {
        if (cancelRef.current) break;
        const pair = pairs[index];
        update({ ...buildResetPatch(), ...buildPairPatch(pair) });
        const pairReady = await waitForPairData(() => rf.getNode(id), pair);
        let chainOk = true;
        if (!pairReady) chainOk = false;
        for (const nodeId of order) {
          if (!chainOk) break;
          if (cancelRef.current) {
            chainOk = false;
            break;
          }
          const ok = await awaitNode(nodeId, cancelRef);
          if (!ok) {
            chainOk = false;
            break;
          }
        }
        let result: string | null = null;
        if (chainOk) {
          await sleep(40);
          harvestFromExec(execSubIds, execAccumulator);
          writeFreshToOutputs(execSubIds, execAccumulator, knownOutputs);
          result = collectNodeResult(rf.getNode(directs[0]));
        }
        collected.push(result);
        if (chainOk) okCount += 1;
        else failCount += 1;
        update({ outputs: [...collected], progress: { done: index + 1, total: pairs.length, ok: okCount, fail: failCount } });
      }
    } finally {
      rf.setNodes((nodes) => nodes.map((node) => {
        if (!execSubIds.has(node.id)) return node;
        const oldData: any = node.data || {};
        if (!oldData.__loopAccumulate) return node;
        const nextData = { ...oldData };
        delete nextData.__loopAccumulate;
        return { ...node, data: nextData };
      }));
      await sleep(200);
      harvestFromExec(execSubIds, execAccumulator);
      writeFreshToOutputs(execSubIds, execAccumulator, knownOutputs);
    }

    const finalImages: string[] = [];
    const finalTexts: string[] = [];
    execAccumulator.forEach((acc) => {
      acc.images.forEach((url) => pushUnique(finalImages, url));
      acc.texts.forEach((text) => pushUnique(finalTexts, text));
    });
    update({
      status: cancelRef.current ? 'idle' : (okCount > 0 ? 'success' : 'error'),
      error: '',
      imageUrl: finalImages[0] || '',
      imageUrls: finalImages,
      urls: finalImages,
      text: finalTexts.join('\n\n'),
      prompt: finalTexts.join('\n\n'),
      outputText: finalTexts.join('\n\n'),
      texts: finalTexts,
      textSegments: finalTexts,
      segments: finalTexts,
    });
  }, [discoverOutputNodeIds, harvestFromExec, id, pairs, rf, update, writeFreshToOutputs]);

  const runParallel = useCallback(async () => {
    if (pairs.length === 0) {
      setError('请同时连接文本素材集和图像素材集');
      return;
    }
    setError(null);
    cancelRef.current = false;
    update({ status: 'running', error: '', outputs: [], progress: { done: 0, total: pairs.length, ok: 0, fail: 0 } });

    const allNodes = rf.getNodes();
    const allEdges = rf.getEdges();
    const entryEdges = allEdges.filter((edge) => edge.source === id);
    const directs = Array.from(new Set(entryEdges.map((edge) => edge.target)));
    if (directs.length === 0) {
      const msg = '请先把图文循环器连接到下游展陈节点';
      setError(msg);
      update({ status: 'error', error: msg });
      return;
    }

    const reachable = bfsForward(allEdges, directs);
    const subNodes = allNodes.filter((node) => reachable.has(node.id));
    const subEdges = allEdges.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target));
    const originalOrder = topologicalSort(subNodes, subEdges, EXEC_TYPES);
    if (originalOrder.length === 0) {
      const msg = '下游链路上没有可执行展陈节点';
      setError(msg);
      update({ status: 'error', error: msg });
      return;
    }

    const minY = Math.min(...subNodes.map((node) => node.position.y));
    const maxY = Math.max(...subNodes.map((node) => node.position.y + ((node as any).measured?.height || (node as any).height || 220)));
    const blockH = (maxY - minY) + 40;
    const ts = Date.now();
    const allNewNodes: Node[] = [];
    const allNewEdges: Edge[] = [];
    const cloneIdMaps: Array<Map<string, string>> = [];
    const subNodeIds = new Set(subNodes.map((node) => node.id));
    const desiredClones: PlacementRect[] = [];
    for (let pairIndex = 1; pairIndex < pairs.length; pairIndex++) {
      const yOffset = pairIndex * blockH;
      for (const node of subNodes) {
        const rect = rectOf(node);
        desiredClones.push({ x: rect.x, y: rect.y + yOffset, w: rect.w, h: rect.h });
      }
    }
    const cloneOffset = pairs.length > 1
      ? placeBatchNodes(desiredClones, allNodes, { excludeIds: subNodeIds, source: `placement:exhibition-text-image-loop:${id}` })
      : { dx: 0, dy: 0 };

    for (let pairIndex = 1; pairIndex < pairs.length; pairIndex++) {
      const idMap = new Map<string, string>();
      subNodes.forEach((node, nodeIndex) => idMap.set(node.id, `exhibition-text-image-loop-${id}-${ts}-${pairIndex}-n${nodeIndex}`));
      const yOffset = pairIndex * blockH;
      const clonedNodes: Node[] = subNodes.map((node) => ({
        ...node,
        id: idMap.get(node.id)!,
        position: { x: node.position.x + cloneOffset.dx, y: node.position.y + yOffset + cloneOffset.dy },
        data: { ...(node.data as any), status: 'idle', error: '', __loopClone: id },
        selected: false,
      } as Node));
      const clonedEdges: Edge[] = subEdges.map((edge, edgeIndex) => ({
        ...edge,
        id: `exhibition-text-image-loop-${id}-${ts}-${pairIndex}-e${edgeIndex}`,
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
      } as Edge));
      const carrierId = `exhibition-text-image-loop-${id}-${ts}-${pairIndex}-carrier`;
      const carrier: Node = {
        id: carrierId,
        type: 'relay',
        hidden: true,
        position: { x: (allNodes.find((node) => node.id === id)?.position.x || 0) + cloneOffset.dx, y: minY + yOffset + cloneOffset.dy },
        data: { ...buildPairPatch(pairs[pairIndex]), status: 'success' },
        selected: false,
      } as Node;
      const carrierEdges: Edge[] = entryEdges.map((edge, edgeIndex) => ({
        id: `exhibition-text-image-loop-${id}-${ts}-${pairIndex}-carrier-e${edgeIndex}`,
        source: carrierId,
        sourceHandle: (edge as any).sourceHandle,
        target: idMap.get(edge.target)!,
        targetHandle: (edge as any).targetHandle,
        type: 'deletable',
      } as Edge));
      cloneIdMaps.push(idMap);
      allNewNodes.push(carrier, ...clonedNodes);
      allNewEdges.push(...clonedEdges, ...carrierEdges);
    }

    if (allNewNodes.length > 0) rf.addNodes(allNewNodes);
    if (allNewEdges.length > 0) rf.setEdges((edges) => [...edges, ...allNewEdges]);

    update(buildPairPatch(pairs[0]));
    const firstPairReady = await waitForPairData(() => rf.getNode(id), pairs[0]);
    const carrierReady = await Promise.all(
      cloneIdMaps.map((_, index) => {
        const pairIndex = index + 1;
        const carrierId = `exhibition-text-image-loop-${id}-${ts}-${pairIndex}-carrier`;
        return waitForPairData(() => rf.getNode(carrierId), pairs[pairIndex]);
      }),
    );

    const chainOrders = [originalOrder, ...cloneIdMaps.map((idMap) => originalOrder.map((nodeId) => idMap.get(nodeId) || nodeId))];
    const collected: Array<string | null> = new Array(pairs.length).fill(null);
    let okCount = 0;
    let failCount = 0;
    const updateProgress = () => update({ outputs: [...collected], progress: { done: okCount + failCount, total: pairs.length, ok: okCount, fail: failCount } });

    const runChain = async (chainIndex: number) => {
      if (chainIndex === 0 ? !firstPairReady : !carrierReady[chainIndex - 1]) {
        collected[chainIndex] = null;
        failCount += 1;
        updateProgress();
        return;
      }
      const chain = chainOrders[chainIndex];
      let chainOk = true;
      for (const nodeId of chain) {
        if (cancelRef.current) {
          chainOk = false;
          break;
        }
        const ok = await awaitNode(nodeId, cancelRef);
        if (!ok) {
          chainOk = false;
          break;
        }
      }
      const targetEntry = chainIndex === 0 ? directs[0] : (cloneIdMaps[chainIndex - 1].get(directs[0]) || directs[0]);
      collected[chainIndex] = chainOk ? collectNodeResult(rf.getNode(targetEntry)) : null;
      if (chainOk) okCount += 1;
      else failCount += 1;
      updateProgress();
    };

    await Promise.all(chainOrders.map((_, index) => runChain(index)));
    update({
      status: cancelRef.current ? 'idle' : (okCount > 0 ? 'success' : 'error'),
      error: '',
      outputs: collected,
    });
  }, [id, pairs, rf, update]);

  const handleRun = useCallback(async () => {
    try {
      if (mode === 'parallel') await runParallel();
      else await runSerial();
    } catch (err: any) {
      const msg = err?.message || '图文循环执行失败';
      setError(msg);
      update({ status: 'error', error: msg });
    }
  }, [mode, runParallel, runSerial, update]);

  const handleStop = () => {
    cancelRef.current = true;
    update({ status: 'idle' });
    useRunBusStore.getState().cancelAll();
  };

  useRunTrigger(id, async () => {
    if (status === 'running') return;
    await handleRun();
  });

  const containerStyle: CSSProperties = isPixel
    ? { background: 'var(--px-surface)', border: '2px solid var(--px-ink)', borderRadius: 8, boxShadow: selected ? '5px 5px 0 var(--px-ink)' : '3px 3px 0 var(--px-ink)', width: 330 }
    : isDark
      ? { background: 'rgba(15,23,42,0.94)', border: `2px solid ${selected ? COLOR : 'rgba(255,255,255,0.16)'}`, borderRadius: 12, boxShadow: '0 12px 28px rgba(0,0,0,0.42)', width: 330 }
      : { background: 'rgba(255,255,255,0.96)', border: `2px solid ${selected ? COLOR : 'rgba(15,23,42,0.12)'}`, borderRadius: 12, boxShadow: '0 10px 26px rgba(15,23,42,0.14)', width: 330 };
  const panelBorder = isPixel ? '2px solid var(--px-ink)' : `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'}`;
  const textColor = isPixel ? 'var(--px-ink)' : isDark ? 'rgba(255,255,255,0.86)' : 'rgba(15,23,42,0.82)';
  const subColor = isPixel ? 'rgba(0,0,0,0.58)' : isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)';
  const activeButton = (active: boolean): CSSProperties => isPixel
    ? { border: '2px solid var(--px-ink)', background: active ? 'var(--px-mint)' : 'var(--px-surface)', color: 'var(--px-ink)', boxShadow: active ? 'inset 2px 2px 0 rgba(0,0,0,0.16)' : '2px 2px 0 var(--px-ink)' }
    : { border: 'none', background: active ? COLOR : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)'), color: active ? '#06202a' : textColor };
  const buttonBase: CSSProperties = { height: 28, padding: '0 9px', borderRadius: isPixel ? 0 : 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: status === 'running' ? 'default' : 'pointer' };
  const primaryButton: CSSProperties = { ...buttonBase, border: isPixel ? '2px solid var(--px-ink)' : 'none', background: isPixel ? 'var(--px-mint)' : COLOR, color: isPixel ? 'var(--px-ink)' : '#06202a' };
  const stopButton: CSSProperties = { ...primaryButton, background: isPixel ? 'var(--px-peach)' : '#ef4444', color: isPixel ? 'var(--px-ink)' : '#fff' };

  return (
    <div {...compactAttrs} className="relative" style={containerStyle}>
      <Handle id="text" type="target" position={Position.Left} className="!h-3 !w-3 !border-0" style={{ top: '34%', left: -6, background: PORT_COLOR.text }} title="输入：文本素材集" />
      <Handle id="image" type="target" position={Position.Left} className="!h-3 !w-3 !border-0" style={{ top: '58%', left: -6, background: PORT_COLOR.image }} title="输入：图像素材集" />
      <Handle id="text" type="source" position={Position.Right} className="!h-3 !w-3 !border-0" style={{ top: '38%', right: -6, background: PORT_COLOR.text }} title="输出：文本" />
      <Handle id="image" type="source" position={Position.Right} className="!h-3 !w-3 !border-0" style={{ top: '62%', right: -6, background: PORT_COLOR.image }} title="输出：图像" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: panelBorder, background: isPixel ? 'var(--px-surface)' : isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.1)', borderRadius: isPixel ? '6px 6px 0 0' : '10px 10px 0 0' }}>
        <div style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: isPixel ? 0 : 7, border: isPixel ? '2px solid var(--px-ink)' : 'none', background: isPixel ? 'var(--px-mint)' : 'rgba(34,211,238,0.18)' }}>
          <Repeat2 size={15} color={isPixel ? 'var(--px-ink)' : COLOR} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: textColor, fontSize: 13, fontWeight: 800 }}>图文循环器</div>
          <div style={{ color: subColor, fontSize: 10 }}>{pairs.length} 组 · 文本 {texts.length} · 图像 {images.length}</div>
        </div>
        {status === 'running' && <Loader2 size={15} color={COLOR} className="animate-spin" />}
      </div>

      <div className="nodrag nopan" style={{ padding: 10 }} onMouseDown={(event) => event.stopPropagation()} onWheelCapture={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" style={{ ...buttonBase, ...activeButton(mode === 'serial') }} disabled={status === 'running'} onClick={() => update({ mode: 'serial' })} title="逐组运行同一条下游链路">
            <GitBranch size={12} />串联
          </button>
          <button type="button" style={{ ...buttonBase, ...activeButton(mode === 'parallel') }} disabled={status === 'running'} onClick={() => update({ mode: 'parallel' })} title="克隆下游链路并发运行">
            <Layers size={12} />并联
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5, marginBottom: 9 }}>
          {PAIRING_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              style={{ ...buttonBase, minWidth: 0, padding: '0 6px', ...activeButton(pairingMode === option.id) }}
              disabled={status === 'running'}
              title={option.title}
              onClick={() => update({ pairingMode: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
          <div style={{ border: panelBorder, borderRadius: 6, padding: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: subColor, fontSize: 10, marginBottom: 5 }}><Type size={11} />文本</div>
            <div style={{ maxHeight: 92, overflow: 'hidden', color: textColor, fontSize: 10, lineHeight: 1.35 }}>
              {texts.length === 0 ? <span style={{ color: subColor }}>等待文本素材集</span> : texts.slice(0, 3).map((item) => <div key={item.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.url}</div>)}
            </div>
          </div>
          <div style={{ border: panelBorder, borderRadius: 6, padding: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: subColor, fontSize: 10, marginBottom: 5 }}><ImageIcon size={11} />图像</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
              {images.length === 0 ? <span style={{ gridColumn: '1 / 4', color: subColor, fontSize: 10 }}>等待图像素材集</span> : images.slice(0, 6).map((item) => (
                <div key={item.id} style={{ aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: 4, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)' }}>
                  <SmartImage src={item.url} alt="" thumbSize={120} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {(status === 'running' || progress.total > 0) && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: subColor, fontSize: 10, marginBottom: 3 }}>进度 {progress.done}/{progress.total} · 成功 {progress.ok} · 失败 {progress.fail}</div>
            <div style={{ height: 4, borderRadius: 999, overflow: 'hidden', background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)' }}>
              <div style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`, height: '100%', background: COLOR, transition: 'width .2s' }} />
            </div>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '6px 8px', borderRadius: 6, background: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: 11 }}>
            <AlertCircle size={12} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {status === 'running' ? (
            <button type="button" style={stopButton} onClick={handleStop}><Square size={12} />取消</button>
          ) : (
            <button type="button" style={primaryButton} disabled={pairs.length === 0} onClick={handleRun}><Play size={12} />{mode === 'serial' ? '串联运行' : '并联运行'}</button>
          )}
          <div style={{ flex: 1 }} />
          {outputs.length > 0 && <span style={{ color: subColor, fontSize: 10 }}>已记录 {outputs.filter(Boolean).length}/{outputs.length}</span>}
        </div>
      </div>
    </div>
  );
};

export default memo(ExhibitionTextImageLoopNode);
