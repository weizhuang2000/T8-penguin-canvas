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
  dimensionMarksEnabled?: boolean;
  explodedViewEnabled?: boolean;
  supplement?: string;
}

export function normalizeShowcaseStyle(value?: unknown): Required<ShowcaseStyleValues>;
export function normalizeShowcaseExhibitItems(value?: unknown): Array<{ url: string; label: string; maxSideMm: number }>;
export function colorMaterialTextFromPreset(preset?: unknown): string;
export function buildShowcaseInteriorDesignPrompt(values?: ShowcaseInteriorDesignPromptValues): string;

