import {
  buildExhibitionRecolorPrompt,
  exhibitionRecolorExcludeItemsText,
  EXHIBITION_RECOLOR_DEFAULT_COLORS,
  EXHIBITION_RECOLOR_EXCLUDE_ITEMS,
  normalizeExhibitionRecolorBrightness,
  normalizeExhibitionRecolorColor,
  normalizeExhibitionRecolorExcludeItems,
} from './exhibitionRecolorPromptData.js';

export interface ExhibitionRecolorPresetItem {
  id: string;
  label: string;
  order?: number;
}

export interface ExhibitionRecolorPromptValues {
  toneEnabled?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  brightness?: number;
  excludeItems?: string[];
  excludeItemOptions?: ExhibitionRecolorPresetItem[];
  manualExclusions?: string;
  floorPrompt?: string;
  ceilingPrompt?: string;
}

export {
  buildExhibitionRecolorPrompt,
  exhibitionRecolorExcludeItemsText,
  EXHIBITION_RECOLOR_DEFAULT_COLORS,
  EXHIBITION_RECOLOR_EXCLUDE_ITEMS,
  normalizeExhibitionRecolorBrightness,
  normalizeExhibitionRecolorColor,
  normalizeExhibitionRecolorExcludeItems,
};
