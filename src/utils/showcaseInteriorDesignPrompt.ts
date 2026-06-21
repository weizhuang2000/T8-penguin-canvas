import {
  buildShowcaseInteriorDesignPrompt,
  buildShowcaseInteriorScaleReferenceDataUrl,
  buildShowcaseInteriorScaleReferenceSvg,
  colorMaterialTextFromPreset,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseStyle,
} from './showcaseInteriorDesignPromptData.js';

export interface ShowcaseStyleValues {
  widthMm?: number;
  baseHeightMm?: number;
  glassHeightMm?: number;
  capHeightMm?: number;
  hasCap?: boolean;
}

export interface ShowcaseExhibitItem {
  url?: string;
  imageUrl?: string;
  label?: string;
  name?: string;
  heightMm?: number;
  displayHeightMm?: number;
  maxSideMm?: number;
  longestSideMm?: number;
  sizeMm?: number;
}

export interface ShowcaseInteriorDesignPromptValues extends ShowcaseStyleValues {
  showcaseStyle?: ShowcaseStyleValues;
  dimensions?: ShowcaseStyleValues;
  exhibitItems?: ShowcaseExhibitItem[];
  colorMaterialPresetText?: string;
  colorMaterial?: string;
  manualColorMaterial?: string;
  colorMaterialReferenceTone?: string;
  hasColorMaterialReferenceImage?: boolean;
  perspectiveEnabled?: boolean;
  dimensionMarksEnabled?: boolean;
  explodedViewEnabled?: boolean;
  supplement?: string;
}

export {
  buildShowcaseInteriorDesignPrompt,
  buildShowcaseInteriorScaleReferenceDataUrl,
  buildShowcaseInteriorScaleReferenceSvg,
  colorMaterialTextFromPreset,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseStyle,
};
