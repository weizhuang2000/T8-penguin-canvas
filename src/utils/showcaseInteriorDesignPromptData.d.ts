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

export function normalizeShowcaseStyle(value?: unknown): Required<ShowcaseStyleValues>;
export function normalizeShowcaseExhibitItems(value?: unknown): Array<{ url: string; label: string; heightMm: number }>;
export function normalizeShowcaseManualLayoutItems(value?: unknown): Array<{ url: string; label: string; xMm: number; yMm: number; widthMm: number; heightMm: number; zIndex: number }>;
export function colorMaterialTextFromPreset(preset?: unknown): string;
export function buildShowcaseInteriorDesignPrompt(values?: ShowcaseInteriorDesignPromptValues): string;
