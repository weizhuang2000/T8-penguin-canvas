import { create } from 'zustand';
import type { CanvasListItem } from '../types/canvas';
import * as api from '../services/api';

interface CanvasStoreState {
  canvases: CanvasListItem[];
  activeId: string | null;
  loading: boolean;
  error: string | null;

  loadCanvases: () => Promise<void>;
  createCanvas: (name?: string) => Promise<CanvasListItem | null>;
  deleteCanvas: (id: string) => Promise<void>;
  renameCanvas: (id: string, name: string) => Promise<void>;
  updateCanvasShares: (id: string, sharedWith: CanvasListItem['sharedWith']) => Promise<void>;
  setActive: (id: string) => void;
}

export const useCanvasStore = create<CanvasStoreState>((set, get) => ({
  canvases: [],
  activeId: null,
  loading: false,
  error: null,

  async loadCanvases() {
    set({ loading: true, error: null });
    try {
      const list = await api.listCanvases();
      const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      const currentActiveId = get().activeId;
      set({
        canvases: sorted,
        loading: false,
        activeId: currentActiveId && sorted.some((canvas) => canvas.id === currentActiveId)
          ? currentActiveId
          : sorted[0]?.id || null,
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '加载画布列表失败' });
    }
  },

  async createCanvas(name) {
    try {
      const item = await api.createCanvas(name);
      set((s) => ({ canvases: [item, ...s.canvases], activeId: item.id }));
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

  async updateCanvasShares(id, sharedWith) {
    try {
      const updatedShares = await api.updateCanvasShares(id, sharedWith || []);
      set((s) => ({
        canvases: s.canvases.map((x) => (x.id === id ? { ...x, sharedWith: updatedShares } : x)),
      }));
    } catch (e: any) {
      set({ error: e?.message || '更新共享失败' });
      throw e;
    }
  },

  setActive(id) {
    set({ activeId: id });
  },
}));
