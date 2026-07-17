import { create } from 'zustand';
import type { CanvasAllUsersShare, CanvasListItem } from '../types/canvas';
import * as api from '../services/api';

interface CanvasStoreState {
  canvases: CanvasListItem[];
  activeId: string | null;
  userId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;

  loadCanvases: (options?: { force?: boolean; userId?: string | null }) => Promise<void>;
  createCanvas: (name?: string) => Promise<CanvasListItem | null>;
  deleteCanvas: (id: string) => Promise<void>;
  renameCanvas: (id: string, name: string) => Promise<void>;
  updateCanvasShares: (id: string, sharedWith: CanvasListItem['sharedWith'], allUsersShare?: Partial<CanvasAllUsersShare>) => Promise<void>;
  setActive: (id: string) => void;
}

const ACTIVE_CANVAS_STORAGE_PREFIX = 't8pc:active-canvas:v1:';

function activeCanvasStorageKey(userId: string) {
  return `${ACTIVE_CANVAS_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function readStoredActiveCanvas(userId: string | null | undefined) {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(activeCanvasStorageKey(userId));
  } catch {
    return null;
  }
}

function writeStoredActiveCanvas(userId: string | null | undefined, canvasId: string | null) {
  if (!userId || typeof window === 'undefined') return;
  try {
    if (canvasId) window.localStorage.setItem(activeCanvasStorageKey(userId), canvasId);
    else window.localStorage.removeItem(activeCanvasStorageKey(userId));
  } catch {
    /* localStorage failures must not block canvas switching. */
  }
}

export const useCanvasStore = create<CanvasStoreState>((set, get) => ({
  canvases: [],
  activeId: null,
  userId: null,
  loading: false,
  loaded: false,
  error: null,

  async loadCanvases(options) {
    const state = get();
    const userId = options?.userId ?? state.userId;
    const sameUser = state.userId === userId;
    if (!options?.force && state.loaded && sameUser) return;
    if (!options?.force && state.loading && sameUser) return;
    set({
      loading: true,
      error: null,
      userId,
      ...(sameUser ? {} : { canvases: [], activeId: null, loaded: false }),
    });
    try {
      const list = await api.listCanvases();
      const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      const currentActiveId = sameUser ? get().activeId : null;
      const storedActiveId = readStoredActiveCanvas(userId);
      const preferredActiveId = currentActiveId || storedActiveId;
      const activeId = preferredActiveId && sorted.some((canvas) => canvas.id === preferredActiveId)
        ? preferredActiveId
        : sorted[0]?.id || null;
      set({
        canvases: sorted,
        loading: false,
        loaded: true,
        activeId,
      });
      writeStoredActiveCanvas(userId, activeId);
    } catch (e: any) {
      set({ loading: false, error: e?.message || '加载画布列表失败' });
    }
  },

  async createCanvas(name) {
    try {
      const item = await api.createCanvas(name);
      set((s) => ({ canvases: [item, ...s.canvases], activeId: item.id }));
      writeStoredActiveCanvas(get().userId, item.id);
      return item;
    } catch (e: any) {
      set({ error: e?.message || '创建画布失败' });
      return null;
    }
  },

  async deleteCanvas(id) {
    try {
      await api.deleteCanvas(id);
      set((s) => {
        const list = s.canvases.filter((x) => x.id !== id);
        const activeId = s.activeId === id ? list[0]?.id || null : s.activeId;
        writeStoredActiveCanvas(s.userId, activeId);
        return { canvases: list, activeId };
      });
    } catch (e: any) {
      set({ error: e?.message || '删除失败' });
    }
  },

  async renameCanvas(id, name) {
    try {
      const updated = await api.renameCanvas(id, name);
      set((s) => ({
        canvases: s.canvases.map((x) => (x.id === id ? updated : x)),
      }));
    } catch (e: any) {
      set({ error: e?.message || '重命名失败' });
    }
  },

  async updateCanvasShares(id, sharedWith, allUsersShare) {
    try {
      const updated = await api.updateCanvasShares(id, sharedWith || [], allUsersShare);
      set((s) => ({
        canvases: s.canvases.map((x) => (x.id === id ? { ...x, sharedWith: updated.sharedWith, allUsersShare: updated.allUsersShare } : x)),
      }));
    } catch (e: any) {
      set({ error: e?.message || '更新共享失败' });
      throw e;
    }
  },

  setActive(id) {
    set({ activeId: id });
    writeStoredActiveCanvas(get().userId, id);
  },
}));
