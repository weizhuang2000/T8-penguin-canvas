import { createContext, useContext } from 'react';

export interface CanvasRuntimeContextValue {
  loadedCanvasId: string | null;
}

const CanvasRuntimeContext = createContext<CanvasRuntimeContextValue>({
  loadedCanvasId: null,
});

export const CanvasRuntimeProvider = CanvasRuntimeContext.Provider;

export function useCanvasRuntime() {
  return useContext(CanvasRuntimeContext);
}
