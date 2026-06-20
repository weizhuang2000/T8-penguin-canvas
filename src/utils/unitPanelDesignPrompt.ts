import {
  buildUnitPanelExtractPrompt,
  buildUnitPanelImagePrompt,
  buildUnitPanelTranslatePrompt,
  cleanUnitPanelText,
  languageMeta,
  normalizeUnitPanelBodyFont,
  normalizeUnitPanelDimensions,
  normalizeUnitPanelLanguages,
  normalizeUnitPanelOutputMode,
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
  totalWidth: number;
  totalHeight: number;
  panelWidth: number;
  panelHeight: number;
  panelCount: number;
  gap: number;
  thickness: number;
}

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
  dimensions?: Partial<UnitPanelDimensions>;
  languages?: string[];
  translations?: Record<string, { title?: string; body?: string }>;
  titleText?: string;
  bodyText?: string;
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
  normalizeUnitPanelLanguages,
  normalizeUnitPanelOutputMode,
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
