export interface ExhibitionRecolorColorSet {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export interface ExhibitionRecolorPresetItem {
  id: string;
  label: string;
  order?: number;
}

export interface ExhibitionRecolorPromptValues {
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

export const EXHIBITION_RECOLOR_DEFAULT_COLORS: ExhibitionRecolorColorSet;
export const EXHIBITION_RECOLOR_EXCLUDE_ITEMS: ExhibitionRecolorPresetItem[];

export function normalizeExhibitionRecolorColor(value: unknown, fallback?: string): string;
export function normalizeExhibitionRecolorBrightness(value: unknown): number;
export function normalizeExhibitionRecolorExcludeItems(value: unknown, options?: ExhibitionRecolorPresetItem[]): ExhibitionRecolorPresetItem[];
export function exhibitionRecolorExcludeItemsText(value: unknown, options?: ExhibitionRecolorPresetItem[]): string;
export function buildExhibitionRecolorPrompt(values?: ExhibitionRecolorPromptValues): string;
