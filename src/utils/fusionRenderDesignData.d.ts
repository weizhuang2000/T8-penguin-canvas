import type { ReverseIsometricDirection } from './reverseIsometricDesignData.js';
import type { ReverseIsometricLayoutItem } from './reverseIsometricDesignData.js';

export const FUSION_RENDER_AUTO_CEILING_CRAFT: string;
export const FUSION_RENDER_AUTO_FLOOR_MATERIAL: string;
export const FUSION_RENDER_VENUE_TYPES: string[];
export const FUSION_RENDER_CEILING_CRAFTS: string[];
export function describeFusionRenderLayout(items?: ReverseIsometricLayoutItem[]): string;

export function buildFusionRenderPrompt(options?: {
  hasPlan?: boolean;
  venueType?: string;
  hallSubject?: string;
  viewDirection?: ReverseIsometricDirection;
  hallLengthMm?: number;
  hallWidthMm?: number;
  hallHeightMm?: number;
  floorMaterial?: string;
  ceilingCraft?: string;
  layoutDescription?: string;
  wallPlacementText?: string;
  exhibitCount?: number;
}): string;
