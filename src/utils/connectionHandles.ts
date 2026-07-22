import type { Node } from '@xyflow/react';
import { getNodeInputs, getNodeOutputs, type PortType } from '../config/portTypes.ts';

export type ConnectionHandleType = 'source' | 'target';

type HandlePortMap = Partial<Record<ConnectionHandleType, Record<string, PortType>>>;
type DefaultHandleMap = Partial<Record<ConnectionHandleType, Partial<Record<PortType, string>>>>;

const HANDLE_PORT_TYPES: Record<string, HandlePortMap> = {
  'prompt-reverse': {
    target: { 'content-text': 'text' },
  },
  'fhl-image-gen': {
    source: { image: 'image', text: 'text' },
    target: { text: 'text', fixed: 'image', items: 'image' },
  },
  'storyboard-grid': {
    source: { shots: 'image', script: 'text' },
    target: { outline: 'text' },
  },
};

const DEFAULT_HANDLE_IDS: Record<string, DefaultHandleMap> = {
  'prompt-reverse': {
    target: { text: 'content-text' },
  },
  'fhl-image-gen': {
    source: { image: 'image', text: 'text' },
    target: { text: 'text', image: 'fixed' },
  },
  'storyboard-grid': {
    source: { image: 'shots', text: 'script' },
    target: { text: 'outline' },
  },
};

export function getNodePortTypesForHandle(
  node: Node | null | undefined,
  handleType: ConnectionHandleType,
  handleId: string | null | undefined,
): PortType[] {
  const ports = handleType === 'source' ? getNodeOutputs(node) : getNodeInputs(node);
  if (!node?.type) return ports;
  if (!handleId) {
    if (node.type === 'prompt-reverse' && handleType === 'target' && ports.includes('image')) return ['image'];
    return ports;
  }

  const configuredPort = HANDLE_PORT_TYPES[node.type]?.[handleType]?.[handleId];
  if (configuredPort && ports.includes(configuredPort)) return [configuredPort];
  return ports;
}

export function resolveConnectionPickerHandleId(
  nodeType: string | null | undefined,
  handleType: ConnectionHandleType,
  portType: PortType | null | undefined,
): string | null {
  if (!nodeType || !portType) return null;
  return DEFAULT_HANDLE_IDS[nodeType]?.[handleType]?.[portType] || null;
}
