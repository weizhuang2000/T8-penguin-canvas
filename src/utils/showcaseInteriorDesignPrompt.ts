import {
  buildShowcaseInteriorDesignPrompt,
  colorMaterialTextFromPreset,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseManualLayoutItems,
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

export interface ShowcaseManualLayoutItem {
  url?: string;
  imageUrl?: string;
  label?: string;
  name?: string;
  xMm?: number;
  yMm?: number;
  widthMm?: number;
  heightMm?: number;
  zIndex?: number;
}

export interface ShowcaseInteriorDesignPromptValues extends ShowcaseStyleValues {
  showcaseStyle?: ShowcaseStyleValues;
  dimensions?: ShowcaseStyleValues;
  exhibitItems?: ShowcaseExhibitItem[];
  emptyExhibitMode?: 'search' | 'empty';
  emptyExhibitQuery?: string;
  layoutMode?: 'auto' | 'manual';
  manualLayoutItems?: ShowcaseManualLayoutItem[];
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
  colorMaterialTextFromPreset,
  normalizeShowcaseExhibitItems,
  normalizeShowcaseManualLayoutItems,
  normalizeShowcaseStyle,
};
