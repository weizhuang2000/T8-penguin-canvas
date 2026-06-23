import {
  buildExhibitionLightingHeatmapPrompt,
  EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS,
  EXHIBITION_LIGHTING_HEATMAP_MODES,
  normalizeExhibitionLightingHeatmapFocusItems,
  normalizeExhibitionLightingHeatmapMode,
} from './exhibitionLightingHeatmapPromptData.js';

export type ExhibitionLightingHeatmapMode = 'overlay' | 'technical';

export interface ExhibitionLightingHeatmapFocusItem {
  id: string;
  label: string;
  order?: number;
}

export interface ExhibitionLightingHeatmapPromptValues {
  mode?: ExhibitionLightingHeatmapMode;
  focusItems?: string[];
  supplement?: string;
}

export {
  buildExhibitionLightingHeatmapPrompt,
  EXHIBITION_LIGHTING_HEATMAP_FOCUS_ITEMS,
  EXHIBITION_LIGHTING_HEATMAP_MODES,
  normalizeExhibitionLightingHeatmapFocusItems,
  normalizeExhibitionLightingHeatmapMode,
};
