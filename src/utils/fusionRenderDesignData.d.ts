import type { ReverseIsometricDirection } from './reverseIsometricDesignData.js';

export const FUSION_RENDER_AUTO_CEILING_CRAFT: string;
export const FUSION_RENDER_CEILING_CRAFTS: string[];

export function buildFusionRenderPrompt(options?: {
  hasPlan?: boolean;
  viewDirection?: ReverseIsometricDirection;
  hallLengthMm?: number;
  hallWidthMm?: number;
  hallHeightMm?: number;
  floorMaterial?: string;
  ceilingCraft?: string;
  wallPlacementText?: string;
  exhibitCount?: number;
}): string;
