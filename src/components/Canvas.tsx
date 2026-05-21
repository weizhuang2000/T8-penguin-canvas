import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  ViewportPortal,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from '../stores/canvas';
import { useThemeStore } from '../stores/theme';
import { useRunBusStore } from '../stores/runBus';
import { topologicalSort } from '../utils/topologicalSort';
import * as api from '../services/api';
import CanvasToolbar from './CanvasToolbar';
import { useCanvasHistory } from '../hooks/useCanvasHistory';
import type { CanvasTemplate } from '../config/canvasTemplates';
import PlaceholderNode from './nodes/PlaceholderNode';
import TextNode from './nodes/TextNode';
import ImageNode from './nodes/ImageNode';
import LLMNode from './nodes/LLMNode';
import VideoNode from './nodes/VideoNode';
import AudioNode from './nodes/AudioNode';
import RunningHubNode from './nodes/RunningHubNode';
import RhConfigNode from './nodes/RhConfigNode';
import ResizeNode from './nodes/ResizeNode';
import UpscaleNode from './nodes/UpscaleNode';
import GridCropNode from './nodes/GridCropNode';
import CombineNode from './nodes/CombineNode';
import RemoveBgNode from './nodes/RemoveBgNode';
import ImageCompareNode from './nodes/ImageCompareNode';
import ToolboxParamNode from './nodes/ToolboxParamNode';
import IdeaNode from './nodes/IdeaNode';
import BpNode from './nodes/BpNode';
import RelayNode from './nodes/RelayNode';
import VideoOutputNode from './nodes/VideoOutputNode';
import PortraitMetadataNode from './nodes/PortraitMetadataNode';
import StoryboardGridNode from './nodes/StoryboardGridNode';
import PresetImageNode from './nodes/PresetImageNode';
import DrawingBoardNode from './nodes/DrawingBoardNode';
import BrowserNode from './nodes/BrowserNode';
import FrameExtractorNode from './nodes/FrameExtractorNode';
import UploadNode from './nodes/UploadNode';
import { NODE_REGISTRY } from '../config/nodeRegistry';
import type { NodeType } from '../types/canvas';
import { isConnectionValid, getNodeOutputs, getNodeInputs, PORT_COLOR } from '../config/portTypes';

// Phase 4 阶段:全部 24 个节点均已实现业务逻辑
const SPECIFIC_NODES: Record<string, any> = {
  // Core (8)
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  seedance: VideoNode, // 复用 VideoNode,默认 model = seedance-2.0
  audio: AudioNode,
  llm: LLMNode,
  runninghub: RunningHubNode,
  'rh-config': RhConfigNode,
  // Special (5)
  'multi-angle-3d': PresetImageNode,
  'panorama-720': PresetImageNode,
  'penguin-portrait': PresetImageNode,
  'portrait-metadata': PortraitMetadataNode,
  'storyboard-grid': StoryboardGridNode,
  // Utility (9)
  'drawing-board': DrawingBoardNode,
  browser: BrowserNode,
  'image-compare': ImageCompareNode,
  'frame-extractor': FrameExtractorNode,
  resize: ResizeNode,
  combine: CombineNode,
  'remove-bg': RemoveBgNode,
  upscale: UpscaleNode,
  'grid-crop': GridCropNode,
  // Auxiliary (5)
  edit: ImageNode, // 复用 ImageNode,默认偏向 edit 能力
  idea: IdeaNode,
  bp: BpNode,
  relay: RelayNode,
  'video-output': VideoOutputNode,
  // Toolbox (2)
  cinematic: ToolboxParamNode,
  'video-motion': ToolboxParamNode,
  // Input (1) - 上传素材
  upload: UploadNode,
};

// 节点初始 data(用于区分共享组件的 kind/preset/model 等)
const INITIAL_DATA: Record<string, Record<string, any>> = {
  seedance: { model: 'seedance-2.0' },
  cinematic: { kind: 'cinematic' },
  'video-motion': { kind: 'video-motion' },
  'multi-angle-3d': { preset: 'multi-angle-3d' },
  'panorama-720': { preset: 'panorama-720' },
  'penguin-portrait': { preset: 'penguin-portrait' },
  edit: { mode: 'edit' },
  upload: { uploadType: null },
};

// 可被“批量运行”调起的节点类型集合
const EXECUTABLE_NODE_TYPES = new Set<string>([
  'image', 'edit',
  'multi-angle-3d', 'panorama-720', 'penguin-portrait',
  'video', 'seedance', 'audio', 'llm', 'runninghub',
  'resize', 'upscale', 'grid-crop', 'remove-bg', 'combine',
  'frame-extractor',
]);

// 网格吸附步长 / 对齐阈值(世界坐标)
const SNAP_GRID: [number, number] = [20, 20];
const ALIGN_THRESHOLD = 6;

// 把所有节点类型都注册到对应组件(已实现的用业务组件,其余用 Placeholder)
const nodeTypes = NODE_REGISTRY.reduce<Record<string, any>>((acc, m) => {
  acc[m.type] = SPECIFIC_NODES[m.type] || PlaceholderNode;
  return acc;
}, {});

interface CanvasInnerProps {
  onAddNodeRef?: React.MutableRefObject<((type: NodeType) => void) | null>;
}

function CanvasInner({ onAddNodeRef }: CanvasInnerProps) {
  const { activeId } = useCanvasStore();
  const { theme, style } = useThemeStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');

  // 选中节点 / 剪贴板
  const [selectedCount, setSelectedCount] = useState(0);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [clipboardCount, setClipboardCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 吸附 + 对齐辅助线
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({
    vertical: [],
    horizontal: [],
  });

  // 批量运行状态
  const [isRunning, setIsRunning] = useState(false);
  const cancelRunRef = useRef(false);
  const batchTotal = useRunBusStore((s) => s.batchTotal);
  const batchDone = useRunBusStore((s) => s.batchDoneCount);

  // 历史栈
  const applySnapshot = useCallback((snap: { nodes: Node[]; edges: Edge[] }) => {
    setNodes(snap.nodes);
    setEdges(snap.edges);
  }, []);
  const { capture: histCapture, undo: histUndo, redo: histRedo, reset: histReset, canUndo, canRedo } =
    useCanvasHistory(applySnapshot);
  const captureTimer = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  // 节点/连线变更后,在拖拽结束 + 短暂防抖窗口内压栈一次
  const scheduleCapture = useCallback(
    (snap: { nodes: Node[]; edges: Edge[] }) => {
      if (isDraggingRef.current) return;
      if (captureTimer.current) window.clearTimeout(captureTimer.current);
      captureTimer.current = window.setTimeout(() => {
        histCapture(snap);
      }, 250);
    },
    [histCapture]
  );

  // 加载画布数据
  useEffect(() => {
    if (!activeId) {
      setNodes([]);
      setEdges([]);
      setLoaded(false);
      histReset();
      return;
    }
    setLoaded(false);
    api
      .getCanvasData(activeId)
      .then((data) => {
        const ns = data.nodes || [];
        const es = data.edges || [];
        setNodes(ns);
        setEdges(es);
        lastSavedRef.current = JSON.stringify({ nodes: ns, edges: es });
        histReset({ nodes: ns, edges: es });
        setLoaded(true);
      })
      .catch((e) => {
        console.error('加载画布失败', e);
        setNodes([]);
        setEdges([]);
        histReset();
        setLoaded(true);
      });
  }, [activeId, histReset]);

  // nodes/edges 变化后压栈(节流防止拖拽中海量入栈)
  useEffect(() => {
    if (!loaded) return;
    scheduleCapture({ nodes, edges });
  }, [nodes, edges, loaded, scheduleCapture]);

  // 自动保存(防抖 800ms,防空数据覆盖)
  useEffect(() => {
    if (!activeId || !loaded) return;
    const snapshot = JSON.stringify({ nodes, edges });
    if (snapshot === lastSavedRef.current) return;
    if (nodes.length === 0 && lastSavedRef.current !== '' && JSON.parse(lastSavedRef.current).nodes?.length > 0) {
      // 防止空数据覆盖
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await api.saveCanvasData(activeId, { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } });
        lastSavedRef.current = snapshot;
      } catch (e) {
        console.error('保存画布失败', e);
      }
    }, 800);
  }, [nodes, edges, activeId, loaded]);

  // 添加节点(供 Sidebar 调用)
  const addNode = useCallback(
    (type: NodeType) => {
      const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newNode: Node = {
        id,
        type,
        position: {
          x: 200 + Math.random() * 200,
          y: 150 + Math.random() * 200,
        },
        data: { ...(INITIAL_DATA[type] || {}) },
      };
      setNodes((prev) => [...prev, newNode]);
    },
    []
  );

  // ===== 复制 / 粘贴 / 删除 =====
  const handleCopy = useCallback(() => {
    const sel = nodes.filter((n) => n.selected);
    if (sel.length === 0) return;
    const ids = new Set(sel.map((n) => n.id));
    const selEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    clipboardRef.current = {
      nodes: JSON.parse(JSON.stringify(sel)),
      edges: JSON.parse(JSON.stringify(selEdges)),
    };
    setClipboardCount(sel.length);
  }, [nodes, edges]);

  const handlePaste = useCallback(() => {
    const cb = clipboardRef.current;
    if (!cb || cb.nodes.length === 0) return;
    const idMap = new Map<string, string>();
    const stamp = Date.now();
    const newNodes = cb.nodes.map((n, idx) => {
      const newId = `${n.type}-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        selected: true,
        position: {
          x: (n.position?.x ?? 0) + 40,
          y: (n.position?.y ?? 0) + 40,
        },
      } as Node;
    });
    const newEdges = cb.edges
      .map((e, idx) => {
        const s = idMap.get(e.source);
        const t = idMap.get(e.target);
        if (!s || !t) return null;
        return {
          ...e,
          id: `e-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
          source: s,
          target: t,
        } as Edge;
      })
      .filter(Boolean) as Edge[];
    // 取消其他节点的选中,新粘贴节点设为选中
    setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
  }, []);

  const handleDuplicate = useCallback(() => {
    handleCopy();
    // 在 copy 完成后下一帧执行 paste(由于上面的 setClipboardCount 是异步)
    setTimeout(() => handlePaste(), 0);
  }, [handleCopy, handlePaste]);

  const handleDeleteSelected = useCallback(() => {
    setNodes((prev) => {
      const removeIds = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      if (removeIds.size === 0) return prev;
      setEdges((eds) =>
        eds.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target) && !e.selected)
      );
      return prev.filter((n) => !removeIds.has(n.id));
    });
    setEdges((prev) => prev.filter((e) => !e.selected));
  }, []);

  // ===== 导入 / 导出 =====
  const handleExport = useCallback(() => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canvas-${activeId || 'export'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodes, edges, activeId]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const txt = String(reader.result || '');
          const json = JSON.parse(txt);
          const importedNodes = Array.isArray(json.nodes) ? json.nodes : [];
          const importedEdges = Array.isArray(json.edges) ? json.edges : [];
          if (!confirm(`导入将替换当前画布(${importedNodes.length} 个节点 / ${importedEdges.length} 条连线),是否继续?`)) {
            return;
          }
          setNodes(importedNodes);
          setEdges(importedEdges);
        } catch (err) {
          alert('导入失败:JSON 解析错误');
          console.error(err);
        }
      };
      reader.readAsText(file);
      // 允许重复选同一文件
      e.target.value = '';
    },
    []
  );

  // ===== 应用模板 =====
  const handleApplyTemplate = useCallback((tpl: CanvasTemplate) => {
    const built = tpl.build();
    // 偏移现有 nodes 数量,避免重叠
    setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...built.nodes.map((n) => ({ ...n, selected: true }))]);
    setEdges((prev) => [...prev, ...built.edges]);
  }, []);

  // ===== 批量运行 =====
  const handleRunAll = useCallback(async () => {
    if (isRunning) return;
    const order = topologicalSort(nodes, edges, EXECUTABLE_NODE_TYPES);
    if (order.length === 0) {
      alert('画布上没有可执行节点');
      return;
    }
    cancelRunRef.current = false;
    setIsRunning(true);
    const { triggerRun, setBatchProgress, cancelAll } = useRunBusStore.getState();
    setBatchProgress(order.length, 0);
    try {
      for (let i = 0; i < order.length; i++) {
        if (cancelRunRef.current) break;
        const id = order[i];
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            unsub();
            window.clearTimeout(timer);
            resolve();
          };
          const unsub = useRunBusStore.subscribe((state) => {
            if (state.lastDone && state.lastDone.id === id) finish();
            if (cancelRunRef.current) finish();
          });
          // 安全超时 5 分钟(轮询任务可能较长)
          const timer = window.setTimeout(finish, 5 * 60 * 1000);
          triggerRun(id, 'batch');
        });
        setBatchProgress(order.length, i + 1);
      }
    } finally {
      cancelAll();
      setIsRunning(false);
      cancelRunRef.current = false;
    }
  }, [isRunning, nodes, edges]);

  const handleCancelRun = useCallback(() => {
    cancelRunRef.current = true;
    useRunBusStore.getState().cancelAll();
  }, []);

  // ===== 智能对齐辅助线 =====
  const onNodeDrag = useCallback(
    (_e: any, node: Node) => {
      if (!snapEnabled) return;
      const w = (node as any).width || (node as any).measured?.width || 200;
      const h = (node as any).height || (node as any).measured?.height || 100;
      const tx = node.position.x;
      const ty = node.position.y;
      const targets = { L: tx, C: tx + w / 2, R: tx + w, T: ty, M: ty + h / 2, B: ty + h };
      const vGuides = new Set<number>();
      const hGuides = new Set<number>();
      let snapDX: number | null = null;
      let snapDY: number | null = null;
      let bestVDiff = ALIGN_THRESHOLD;
      let bestHDiff = ALIGN_THRESHOLD;
      for (const other of nodes) {
        if (other.id === node.id) continue;
        const ow = (other as any).width || (other as any).measured?.width || 200;
        const oh = (other as any).height || (other as any).measured?.height || 100;
        const ox = other.position.x;
        const oy = other.position.y;
        const oVals = { L: ox, C: ox + ow / 2, R: ox + ow, T: oy, M: oy + oh / 2, B: oy + oh };
        // 垂直辅助线(列对齐): L/C/R 对 L/C/R
        for (const tk of ['L', 'C', 'R'] as const) {
          for (const ok of ['L', 'C', 'R'] as const) {
            const diff = Math.abs(targets[tk] - oVals[ok]);
            if (diff < ALIGN_THRESHOLD) {
              vGuides.add(oVals[ok]);
              if (diff < bestVDiff) {
                bestVDiff = diff;
                snapDX = oVals[ok] - targets[tk];
              }
            }
          }
        }
        // 水平辅助线(行对齐): T/M/B 对 T/M/B
        for (const tk of ['T', 'M', 'B'] as const) {
          for (const ok of ['T', 'M', 'B'] as const) {
            const diff = Math.abs(targets[tk] - oVals[ok]);
            if (diff < ALIGN_THRESHOLD) {
              hGuides.add(oVals[ok]);
              if (diff < bestHDiff) {
                bestHDiff = diff;
                snapDY = oVals[ok] - targets[tk];
              }
            }
          }
        }
      }
      setGuides({ vertical: Array.from(vGuides), horizontal: Array.from(hGuides) });
      // 弱吸附:调整当前拖拽节点位置
      if (snapDX !== null || snapDY !== null) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  position: {
                    x: tx + (snapDX ?? 0),
                    y: ty + (snapDY ?? 0),
                  },
                }
              : n
          )
        );
      }
    },
    [nodes, snapEnabled]
  );

  const onNodeDragStop = useCallback(() => {
    setGuides({ vertical: [], horizontal: [] });
  }, []);

  // 暴露 addNode 给父组件
  useEffect(() => {
    if (onAddNodeRef) {
      onAddNodeRef.current = addNode;
    }
    return () => {
      if (onAddNodeRef) onAddNodeRef.current = null;
    };
  }, [onAddNodeRef, addNode]);

  // xyflow 事件
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // 检测拖拽状态,避免拖拽中频繁压栈
      for (const c of changes) {
        if (c.type === 'position') {
          if ((c as any).dragging === true) {
            isDraggingRef.current = true;
          } else if ((c as any).dragging === false) {
            isDraggingRef.current = false;
          }
        }
      }
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        // 同步选中数(用 next 计算更准确)
        const selCount = next.reduce((acc, n) => acc + (n.selected ? 1 : 0), 0);
        setSelectedCount(selCount);
        return next;
      });
    },
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect = useCallback(
    (params: Connection) => {
      // 连接有效性校验(防止绕过 isValidConnection 的底层调用)
      const src = nodes.find((n) => n.id === params.source);
      const tgt = nodes.find((n) => n.id === params.target);
      if (!isConnectionValid(src, tgt)) return;
      // 根据上游输出类型染色连线
      const outs = src ? getNodeOutputs(src) : [];
      const ins = tgt ? getNodeInputs(tgt) : [];
      const matched = outs.find((o) => ins.includes(o) || o === 'any' || ins.includes('any'));
      const color = matched && matched !== 'any' ? PORT_COLOR[matched] : undefined;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            ...(color ? { style: { stroke: color, strokeWidth: 2 } } : {}),
            data: { portType: matched ?? 'any' },
          },
          eds
        )
      );
    },
    [nodes]
  );

  // ReactFlow 拖线连接时的实时校验(在连线处于“预览”阶段就拦截不兼容连接)
  const onIsValidConnection = useCallback(
    (params: Connection | Edge) => {
      const src = nodes.find((n) => n.id === (params as Connection).source);
      const tgt = nodes.find((n) => n.id === (params as Connection).target);
      return isConnectionValid(src, tgt);
    },
    [nodes]
  );

  // ===== 全局快捷键 =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 当焦点在表单元素中时不拦截
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isEditing =
        tag === 'input' ||
        tag === 'textarea' ||
        (e.target as HTMLElement | null)?.isContentEditable;
      const ctrl = e.ctrlKey || e.metaKey;
      // Undo / Redo 全局拦截(即使在输入框,Ctrl+Z 也属于画布,但更友好的是输入框内不抢占)
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (isEditing) return;
        e.preventDefault();
        histUndo();
        return;
      }
      if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        if (isEditing) return;
        e.preventDefault();
        histRedo();
        return;
      }
      if (isEditing) return;
      if (ctrl && e.key.toLowerCase() === 'c') {
        handleCopy();
      } else if (ctrl && e.key.toLowerCase() === 'v') {
        handlePaste();
      } else if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // xyflow 内置 Backspace 删除,但在节点未选中时仍可能删除连线;
        // 我们手动处理仅删除选中,避免输入边缘情况
        if (selectedCount > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [histUndo, histRedo, handleCopy, handlePaste, handleDuplicate, handleDeleteSelected, selectedCount]);

  const isDark = theme === 'dark';
    const isPixel = style === 'pixel';
    const guideColor = isPixel ? '#FF89A7' : '#fb923c';
    const edgeStroke = isPixel ? '#1A1410' : isDark ? '#71717a' : '#a1a1aa';
    const dotColor = isPixel
      ? isDark ? '#5C4D3E' : '#C8B89A'
      : isDark ? '#27272a' : '#d4d4d8';
  const bgColor = isPixel
    ? isDark ? '#1F1A14' : '#FAF3E7'
    : isDark ? '#0a0a0b' : '#fafafa';

  const memoNodeTypes = useMemo(() => nodeTypes, []);

  if (!activeId) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: bgColor, color: isDark ? '#71717a' : '#52525b' }}
      >
        <div className="text-center">
          <div className="text-4xl mb-2">🐧</div>
          <p>请先在左侧创建或选择一个画布</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative" style={{ background: bgColor }}>
      <CanvasToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        selectedCount={selectedCount}
        clipboardCount={clipboardCount}
        onUndo={histUndo}
        onRedo={histRedo}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDeleteSelected}
        onExport={handleExport}
        onImport={handleImportClick}
        onApplyTemplate={handleApplyTemplate}
        onRunAll={handleRunAll}
        onCancelRun={handleCancelRun}
        isRunning={isRunning}
        batchTotal={batchTotal}
        batchDone={batchDone}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((v) => !v)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={memoNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={onIsValidConnection}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        snapToGrid={snapEnabled}
        snapGrid={SNAP_GRID}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: edgeStroke, strokeWidth: isPixel ? 2.5 : 2 },
          animated: false,
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={isPixel ? 1.6 : 1.2}
          color={dotColor}
        />
        {/* 对齐辅助线:在世界坐标系中随视口变换 */}
        {(guides.vertical.length > 0 || guides.horizontal.length > 0) && (
          <ViewportPortal>
            <svg
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 0,
                height: 0,
                overflow: 'visible',
                pointerEvents: 'none',
                zIndex: 5,
              }}
            >
              {guides.vertical.map((x, i) => (
                <line
                  key={`v-${i}-${x}`}
                  x1={x}
                  y1={-100000}
                  x2={x}
                  y2={100000}
                  stroke={guideColor}
                  strokeWidth={isPixel ? 1.5 : 1}
                  strokeDasharray={isPixel ? '8 4' : '6 4'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {guides.horizontal.map((y, i) => (
                <line
                  key={`h-${i}-${y}`}
                  x1={-100000}
                  y1={y}
                  x2={100000}
                  y2={y}
                  stroke={guideColor}
                  strokeWidth={isPixel ? 1.5 : 1}
                  strokeDasharray={isPixel ? '8 4' : '6 4'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </ViewportPortal>
        )}
        <Controls
          style={{
            background: isDark ? 'rgba(20,20,22,.9)' : 'rgba(255,255,255,.9)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)'}`,
            borderRadius: 8,
          }}
        />
        <MiniMap
          pannable
          zoomable
          style={{
            background: isDark ? 'rgba(20,20,22,.9)' : 'rgba(255,255,255,.9)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)'}`,
            borderRadius: 8,
          }}
          maskColor={isDark ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.6)'}
          nodeColor={() => (isDark ? '#a1a1aa' : '#52525b')}
        />
      </ReactFlow>
    </div>
  );
}

interface CanvasProps {
  onAddNodeRef?: React.MutableRefObject<((type: NodeType) => void) | null>;
}

export default function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
