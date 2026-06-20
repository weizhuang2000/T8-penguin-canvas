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
  outputMode?: 'set' | 'single';
  splitDesignEnabled?: boolean;
  dimensionMarksEnabled?: boolean;
  imageDisplayEnabled?: boolean;
  specialShapeEnabled?: boolean;
  dimensions?: Partial<UnitPanelDimensions>;
  textLayoutBounds?: Partial<UnitPanelTextLayoutBounds>;
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

export const UNIT_PANEL_LANGUAGES: UnitPanelLanguage[];
export const UNIT_PANEL_TITLE_FONTS: UnitPanelFontOption[];
export const UNIT_PANEL_BODY_FONTS: UnitPanelFontOption[];

export function cleanUnitPanelText(value: unknown, max?: number): string;
export function normalizeUnitPanelOutputMode(value: unknown): 'set' | 'single';
export function normalizeUnitPanelLanguages(value: unknown): string[];
export function languageMeta(id: unknown): UnitPanelLanguage;
export function normalizeUnitPanelTitleFont(value: unknown): string;
export function normalizeUnitPanelBodyFont(value: unknown): string;
export function unitPanelTitleFontMeta(value: unknown): UnitPanelFontOption;
export function unitPanelBodyFontMeta(value: unknown): UnitPanelFontOption;
export function normalizeUnitPanelDimensions(value: unknown): UnitPanelDimensions;
export function normalizeUnitPanelTextLayoutBounds(value: unknown): UnitPanelTextLayoutBounds;
export function unitPanelDimensionsText(value: unknown): string;
export function unitPanelMaterialsText(primaryMaterial?: UnitPanelMaterialLike | null, secondaryMaterials?: UnitPanelMaterialLike[]): string;
export function buildUnitPanelExtractPrompt(values?: { sourceText?: string; projectTheme?: string }): string;
export function buildUnitPanelTranslatePrompt(values?: { languages?: string[]; titleText?: string; bodyText?: string }): string;
export function parseUnitPanelExtractJson(text: string): { titleText: string; bodyText: string };
export function parseUnitPanelTranslateJson(text: string, languages?: string[]): Record<string, { title: string; body: string }>;
export function buildUnitPanelImagePrompt(values?: UnitPanelImagePromptValues): string;
