export const FUSION_RENDER_AUTO_CEILING_CRAFT: string;
export const FUSION_RENDER_AUTO_FLOOR_MATERIAL: string;
export const FUSION_RENDER_VENUE_TYPES: string[];
export const FUSION_RENDER_CEILING_CRAFTS: string[];

export function buildFusionRenderPrompt(options?: {
  hasSpaceReference?: boolean;
  venueType?: string;
  hallSubject?: string;
  hallHeightMm?: number;
  floorMaterial?: string;
  ceilingCraft?: string;
  colorMaterialPresetText?: string;
  colorMaterial?: string;
  applyColorMaterialToExhibits?: boolean;
  exhibitCount?: number;
}): string;
