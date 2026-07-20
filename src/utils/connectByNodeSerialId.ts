import type { Connection, Edge, Node } from '@xyflow/react';
import { arePortsCompatible, isConnectionValid } from '../config/portTypes.ts';
import { getNodePortTypesForHandle, resolveConnectionPickerHandleId } from './connectionHandles.ts';
import { findNodeBySerialId, parseNodeSerialInput } from './nodeSerialIds.ts';

export type ConnectByNodeSerialFailureReason =
  | 'invalid-id'
  | 'from-not-found'
  | 'not-found'
  | 'self'
  | 'duplicate'
  | 'incompatible';

export type ConnectByNodeSerialResult =
  | {
      ok: true;
      connection: Connection;
      reason?: never;
      message?: never;
    }
  | {
      ok: false;
      reason: ConnectByNodeSerialFailureReason;
      message: string;
      connection?: never;
    };

export interface ResolveConnectionByNodeSerialIdOptions {
  nodes: Node[];
  edges: Edge[];
  fromNodeId: string;
  fromHandleType: 'source' | 'target';
  fromHandleId?: string | null;
  nodeSerialInput: unknown;
}

function fail(reason: ConnectByNodeSerialFailureReason, message: string): ConnectByNodeSerialResult {
  return { ok: false, reason, message };
}

function hasDuplicateEdge(edges: Edge[], connection: Connection): boolean {
  return edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.target === connection.target &&
      (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
      (edge.targetHandle ?? null) === (connection.targetHandle ?? null),
  );
}

export function resolveConnectionByNodeSerialId(
  options: ResolveConnectionByNodeSerialIdOptions,
): ConnectByNodeSerialResult {
  const serialId = parseNodeSerialInput(options.nodeSerialInput);
  if (!serialId) return fail('invalid-id', '请输入有效的节点 ID 数字');

  const fromNode = options.nodes.find((node) => node.id === options.fromNodeId) || null;
  if (!fromNode) return fail('from-not-found', '连线起点节点不存在');

  const targetNode = findNodeBySerialId(options.nodes, serialId);
  if (!targetNode) return fail('not-found', `没有找到 ID 为 ${serialId} 的节点`);
  if (targetNode.id === fromNode.id) return fail('self', '不能连接到当前节点自身');

  const sourceNode = options.fromHandleType === 'source' ? fromNode : targetNode;
  const finalTargetNode = options.fromHandleType === 'source' ? targetNode : fromNode;
  if (!isConnectionValid(sourceNode, finalTargetNode)) {
    return fail('incompatible', `ID ${serialId} 与当前端口类型不兼容`);
  }

  const sourcePorts = options.fromHandleType === 'source'
    ? getNodePortTypesForHandle(sourceNode, 'source', options.fromHandleId)
    : getNodePortTypesForHandle(sourceNode, 'source', null);
  const targetPorts = options.fromHandleType === 'target'
    ? getNodePortTypesForHandle(finalTargetNode, 'target', options.fromHandleId)
    : getNodePortTypesForHandle(finalTargetNode, 'target', null);
  const matched = sourcePorts.find((port) => (
    targetPorts.includes(port) || port === 'any' || targetPorts.includes('any')
  ));
  if (!matched || !arePortsCompatible(sourcePorts, targetPorts)) {
    return fail('incompatible', `ID ${serialId} 与当前端口类型不兼容`);
  }

  const connection: Connection = {
    source: sourceNode.id,
    sourceHandle: options.fromHandleType === 'source'
      ? (options.fromHandleId ?? null)
      : resolveConnectionPickerHandleId(sourceNode.type, 'source', matched),
    target: finalTargetNode.id,
    targetHandle: options.fromHandleType === 'target'
      ? (options.fromHandleId ?? null)
      : resolveConnectionPickerHandleId(finalTargetNode.type, 'target', matched),
  };
  if (hasDuplicateEdge(options.edges, connection)) {
    return fail('duplicate', `已经存在到 ID ${serialId} 的连接`);
  }

  return { ok: true, connection };
}
