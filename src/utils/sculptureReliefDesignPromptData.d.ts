export type SculptureReliefDesignKind = 'sculpture' | 'relief';

export interface SculptureReliefOption {
  id: string;
  label: string;
  prompt: string;
}

export interface SculptureReliefDimensions {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  baseHeightMm: number;
}

export interface SculptureReliefImagePromptValues {
  designKind?: SculptureReliefDesignKind;
  sculptureType?: string;
  reliefType?: string;
  sculptureTypeOption?: SculptureReliefOption;
  reliefTypeOption?: SculptureReliefOption;
  dimensions?: Partial<SculptureReliefDimensions>;
  materialId?: string;
  manualMaterial?: string;
  titleText?: string;
  themeText?: string;
  bodyText?: string;
  dimensionMarksEnabled?: boolean;
  backgroundMode?: 'black' | 'white';
  hasPatternReferenceImage?: boolean;
  peoplePropsText?: string;
  hasPeoplePropsReferenceImage?: boolean;
  peoplePropsReferenceImages?: string[];
  viewAngles?: string[];
  viewAngleOptions?: SculptureReliefOption[];
  material?: Partial<SculptureReliefOption> & {
    description?: string;
    texture?: string;
    usage?: string;
  };
}

export const SCULPTURE_RELIEF_DESIGN_KINDS: SculptureReliefOption[];
export const SCULPTURE_DESIGN_TYPES: SculptureReliefOption[];
export const RELIEF_DESIGN_TYPES: SculptureReliefOption[];
export const SCULPTURE_RELIEF_MATERIALS: SculptureReliefOption[];
export const SCULPTURE_RELIEF_VIEW_ANGLES: SculptureReliefOption[];

export function cleanSculptureReliefText(value: unknown, limit?: number): string;
export function normalizeSculptureReliefDesignKind(value: unknown): SculptureReliefDesignKind;
export function sculptureReliefDesignKindMeta(value: unknown): SculptureReliefOption;
export function normalizeSculptureDesignType(value: unknown): string;
export function normalizeReliefDesignType(value: unknown): string;
export function normalizeSculptureReliefMaterial(value: unknown): string;
export function normalizeSculptureReliefViewAngles(value: unknown): string[];
export function sculptureDesignTypeMeta(value: unknown): SculptureReliefOption;
export function reliefDesignTypeMeta(value: unknown): SculptureReliefOption;
export function sculptureReliefMaterialMeta(value: unknown): SculptureReliefOption;
export function sculptureReliefViewAngleMeta(value: unknown): SculptureReliefOption;
export function normalizeSculptureReliefDimensions(value: unknown): SculptureReliefDimensions;
export function sculptureReliefDimensionsText(value: unknown): string;
export function buildSculptureReliefExtractPrompt(values?: { sourceText?: string }): string;
export function parseSculptureReliefExtractJson(text: string): { titleText: string; themeText: string; bodyText: string };
export function buildSculptureReliefImagePrompt(values?: SculptureReliefImagePromptValues): string;
