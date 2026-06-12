import { useReactFlow } from '@xyflow/react';
import { useCallback, useRef } from 'react';
import * as api from '../../services/api';
import { useCanvasStore } from '../../stores/canvas';
import { isCanvasNodeDeleted } from '../../utils/deletedNodeRegistry';
import { useCanvasRuntime } from './canvasRuntimeContext';

const offscreenPatchQueues = new Map<string, Promise<void>>();

function enqueueOffscreenCanvasPatch(
  canvasId: string,
  nodeId: string,
  patch: Record<string, any>,
) {
  const key = `${canvasId}::${nodeId}`;
  const prev = offscreenPatchQueues.get(key) || Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      if (isCanvasNodeDeleted(canvasId, nodeId)) return;
      const data = await api.patchCanvasNodeData(canvasId, nodeId, patch);
      if (isCanvasNodeDeleted(canvasId, nodeId)) return;
      const payload = {
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        edges: Array.isArray(data.edges) ? data.edges : [],
        viewport: data.viewport || { x: 0, y: 0, zoom: 1 },
        nextNodeSerialId: data.nextNodeSerialId,
      };
      api.autoSaveCanvasData(canvasId, payload).catch((e) => {
        console.warn('离屏画布自动保存到本地路径失败', e);
      });
    });
  const queued = next.finally(() => {
    if (offscreenPatchQueues.get(key) === queued) {
      offscreenPatchQueues.delete(key);
    }
  });
  offscreenPatchQueues.set(key, queued);
}

/**
 * 更新节点自身 data。
 *
 * 异步任务会捕获触发时实际加载的画布 id。若任务完成时用户已经切到其他画布，
 * 只 patch 原画布的目标节点，避免把结果写进当前画布或用旧整图覆盖他人改动。
 */
export function useUpdateNodeData(nodeId: string) {
  const { setNodes } = useReactFlow();
  const { loadedCanvasId } = useCanvasRuntime();
  const originCanvasIdRef = useRef<string | null>(loadedCanvasId || useCanvasStore.getState().activeId);

  if (loadedCanvasId && originCanvasIdRef.current !== loadedCanvasId) {
    originCanvasIdRef.current = loadedCanvasId;
  }

  const originCanvasId = originCanvasIdRef.current;

  return useCallback(
    (patch: Record<string, any>) => {
      const activeCanvasId = useCanvasStore.getState().activeId;
      const queueKey = originCanvasId ? `${originCanvasId}::${nodeId}` : '';
      const hasPendingOffscreenPatch = queueKey ? offscreenPatchQueues.has(queueKey) : false;
      if (originCanvasId && (activeCanvasId !== originCanvasId || hasPendingOffscreenPatch)) {
        enqueueOffscreenCanvasPatch(originCanvasId, nodeId, patch);
        if (activeCanvasId !== originCanvasId) return;
      }
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...(n.data as any), ...patch } }
            : n
        )
      );
    },
    [nodeId, originCanvasId, setNodes]
  );
}
