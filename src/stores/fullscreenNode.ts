import { create } from 'zustand';

interface FullscreenNodeState {
  fullscreenNodeId: string | null;
  setFullscreenNode: (id: string | null) => void;
}

export const useFullscreenNodeStore = create<FullscreenNodeState>((set) => ({
  fullscreenNodeId: null,
  setFullscreenNode: (id) => set({ fullscreenNodeId: id }),
}));
