import {
  buildUnitPanelExtractPrompt,
  buildUnitPanelImagePrompt,
  buildUnitPanelTranslatePrompt,
  cleanUnitPanelText,
  languageMeta,
  normalizeUnitPanelBodyFont,
  normalizeUnitPanelDimensions,
  normalizeUnitPanelLanguageTextDirections,
  normalizeUnitPanelLanguages,
  normalizeUnitPanelOutputMode,
  normalizeUnitPanelTextLayoutBounds,
  normalizeUnitPanelTextDirection,
  normalizeUnitPanelTitleFont,
  parseUnitPanelExtractJson,
  parseUnitPanelTranslateJson,
  UNIT_PANEL_BODY_FONTS,
  UNIT_PANEL_LANGUAGES,
  UNIT_PANEL_TITLE_FONTS,
  unitPanelBodyFontMeta,
  unitPanelDimensionsText,
  unitPanelMaterialsText,
  unitPanelTitleFontMeta,
} from './unitPanelDesignPromptData.js';

export type UnitPanelOutputMode = 'set' | 'single';

export interface UnitPanelLanguage {
  id: string;
  label: string;
  promptName: string;
}

export interface UnitPanelFontOption {
  id: string;
  label: string;
  prompt: string;
}

export interface UnitPanelDimensions {
  panelWidth: number;
  panelHeight: number;
  panelCount: number;
  gap: number;
  thickness: number;
}

export interface UnitPanelTextLayoutBounds {
  lowerMeters: number;
  upperMeters: number;
}

export type UnitPanelTextDirection = 'horizontal' | 'vertical';

export interface UnitPanelMaterialLike {
  id?: string;
  category?: string;
  label?: string;
  description?: string;
  texture?: string;
  usage?: string;
  order?: number;
}

export interface UnitPanelImagePromptValues {
  outputMode?: UnitPanelOutputMode;
  splitDesignEnabled?: boolean;
  dimensionMarksEnabled?: boolean;
  imageDisplayEnabled?: boolean;
  specialShapeEnabled?: boolean;
  backgroundMode?: 'black' | 'white';
  blackWhiteBackgroundEnabled?: boolean;
  dimensions?: Partial<UnitPanelDimensions>;
  textLayoutBounds?: Partial<UnitPanelTextLayoutBounds>;
  languages?: string[];
  languageTextDirections?: Record<string, UnitPanelTextDirection>;
  translations?: Record<string, { title?: string; body?: string }>;
  titleText?: string;
  bodyText?: string;
  subtitleText?: string;
  subtitleEnabled?: boolean;
  mixedLanguageLayoutEnabled?: boolean;
  titleFont?: string;
  bodyFont?: string;
  projectTheme?: string;
  primaryMaterial?: UnitPanelMaterialLike | null;
  secondaryMaterials?: UnitPanelMaterialLike[];
  colorMaterialPresetText?: string;
  colorMaterial?: string;
  colorMaterialReferenceTone?: string;
  manualColorMaterial?: string;
  hasColorMaterialReferenceImage?: boolean;
}

export {
  buildUnitPanelExtractPrompt,
  buildUnitPanelImagePrompt,
  buildUnitPanelTranslatePrompt,
  cleanUnitPanelText,
  languageMeta,
  normalizeUnitPanelBodyFont,
  normalizeUnitPanelDimensions,
  normalizeUnitPanelLanguageTextDirections,
  normalizeUnitPanelLanguages,
  normalizeUnitPanelOutputMode,
  normalizeUnitPanelTextLayoutBounds,
  normalizeUnitPanelTextDirection,
  normalizeUnitPanelTitleFont,
  parseUnitPanelExtractJson,
  parseUnitPanelTranslateJson,
  UNIT_PANEL_BODY_FONTS,
  UNIT_PANEL_LANGUAGES,
  UNIT_PANEL_TITLE_FONTS,
  unitPanelBodyFontMeta,
  unitPanelDimensionsText,
  unitPanelMaterialsText,
  unitPanelTitleFontMeta,
};
