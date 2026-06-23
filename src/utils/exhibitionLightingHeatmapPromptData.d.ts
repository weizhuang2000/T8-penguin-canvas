export type ExhibitionLightingHeatmapMode = 'overlay' | 'technical';

export interface ExhibitionLightingHeatmapModeOption {
  id: ExhibitionLightingHeatmapMode;
  label: string;
}

export interface ExhibitionLightingHeatmapFocusItem {
  id: string;
  label: string;
  order?: number;
}

export interface ExhibitionLightingHeatmapPromptValues {
  mode?: ExhibitionLightingHeatmapMode | string;
  focusItems?: string[];
  supplement?: string;
}

export const EXHIBITION_LIGHTING_HEATMAP_MODES: ExhibitionLightingHeatmapModeOption[];
export const EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS: ExhibitionLightingHeatmapFocusItem[];

export function normalizeExhibitionLightingHeatmapMode(value?: unknown): ExhibitionLightingHeatmapMode;
export function normalizeExhibitionLightingHeatmapFocusItems(value?: unknown): string[];
export function buildExhibitionLightingHeatmapPrompt(values?: ExhibitionLightingHeatmapPromptValues): string;
