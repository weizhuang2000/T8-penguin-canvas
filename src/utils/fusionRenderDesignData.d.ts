import type { ReverseIsometricDirection } from './reverseIsometricDesignData.js';

export function buildFusionRenderPrompt(options?: {
  hasPlan?: boolean;
  viewDirection?: ReverseIsometricDirection;
  hallHeightMm?: number;
  floorMaterial?: string;
  wallPlacementText?: string;
  exhibitCount?: number;
}): string;
