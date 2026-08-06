import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useRunBusStore } from '../stores/runBus';
import { defaultSizeOf, placeSingleNode } from './nodePlacement';

const SEEDVR2_NODE_TYPE = 'seedvr2-upscale';

export function insertAndRunSeedvr2Node(
  reactFlow: ReactFlowInstance,
  sourceNodeId: string,
): string | null {
  const sourceNode = reactFlow.getNode(sourceNodeId);
  if (!sourceNode) return null;

  const existingNodes = reactFlow.getNodes();
  const sourceWidth = (sourceNode as any).measured?.width
    || (sourceNode as any).width
    || defaultSizeOf(sourceNode.type || 'output').w;
  const position = placeSingleNode(
    sourceNode.position.x + sourceWidth + 80,
    sourceNode.position.y,
    SEEDVR2_NODE_TYPE,
    existingNodes,
    { source: `placement:seedvr2-quick:${sourceNodeId}` },
  );
  const timestamp = Date.now();
  const nodeId = `${SEEDVR2_NODE_TYPE}-quick-${sourceNodeId}-${timestamp}-${Math.random().toString(36).slice(2, 6)}`;
  const node: Node = {
    id: nodeId,
    type: SEEDVR2_NODE_TYPE,
    position,
    selected: true,
    data: {
      seedvr2SizeMode: 'scale',
      seedvr2Scale: 2,
      seedvr2Seed: 42,
      seedvr2ColorCorrection: 'wavelet',
      seedvr2ResizeMethod: 'lanczos',
      seedvr2Prompt: 'Upscale this image',
      seedvr2OutputFormat: 'jpg',
      status: 'idle',
      imageUrl: '',
      imageUrls: [],
      urls: [],
      error: '',
    },
  };
  const edge: Edge = {
    id: `e-seedvr2-quick-${sourceNodeId}-${nodeId}`,
    source: sourceNodeId,
    target: nodeId,
    type: 'deletable',
  };

  reactFlow.setNodes((nodes) => [
    ...nodes.map((item) => ({ ...item, selected: false })),
    node,
  ]);
  reactFlow.setEdges((edges) => [...edges, edge]);

  // Wait for the new node to mount and subscribe to the run bus before dispatching.
  window.setTimeout(() => useRunBusStore.getState().triggerRun(nodeId), 0);
  return nodeId;
}
