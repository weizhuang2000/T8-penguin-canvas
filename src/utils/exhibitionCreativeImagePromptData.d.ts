export type ExhibitionCreativeSpaceType =
  | 'intro-hall'
  | 'outro-hall'
  | 'highlight-space';

export interface ExhibitionCreativeSpaceTypeMeta {
  id: ExhibitionCreativeSpaceType;
  label: string;
  prompt: string;
}

export interface ExhibitionCreativeInsertItem {
  id: string;
  label: string;
  order?: number;
}

export interface ExhibitionCreativeExcludeItem {
  id: string;
  label: string;
  order?: number;
}

export interface ExhibitionCreativeViewAngle {
  id: string;
  label: string;
  order?: number;
}

export interface ExhibitionCreativeBriefPromptValues {
  spaceType?: ExhibitionCreativeSpaceType;
  projectTheme?: string;
  colorMaterial?: string;
  hasColorMaterialReferenceImage?: boolean;
  inspiration?: string;
  documentSummary?: string;
  insertItems?: string[];
  insertItemOptions?: ExhibitionCreativeInsertItem[];
  excludeItems?: string[];
  excludeItemOptions?: ExhibitionCreativeExcludeItem[];
  roundIndex?: number;
  total?: number;
  generationCount?: number;
  previousBriefs?: string[];
  regenerateEachTime?: boolean;
}

export interface ExhibitionCreativeImagePromptValues extends ExhibitionCreativeBriefPromptValues {
  creativeBrief?: string;
  brief?: string;
  insertItems?: string[];
  insertItemOptions?: ExhibitionCreativeInsertItem[];
  excludeItems?: string[];
  excludeItemOptions?: ExhibitionCreativeExcludeItem[];
  hasSpaceImage?: boolean;
  spaceReferenceMarkText?: string;
  spaceReferenceMarkPosition?: string;
  colorMaterialReferenceMarkText?: string;
  colorMaterialReferenceMarkPosition?: string;
  hasExhibitReferenceImage?: boolean;
  spaceSize?: {
    width?: number | string;
    depth?: number | string;
    height?: number | string;
  };
  viewControlEnabled?: boolean;
  viewAngles?: string[];
  viewAngleOptions?: ExhibitionCreativeViewAngle[];
}

export const EXHIBITION_CREATIVE_SPACE_TYPES: ExhibitionCreativeSpaceTypeMeta[];
export const EXHIBITION_CREATIVE_INSERT_ITEMS: ExhibitionCreativeInsertItem[];
export const EXHIBITION_CREATIVE_EXCLUDE_ITEMS: ExhibitionCreativeExcludeItem[];
export const EXHIBITION_CREATIVE_VIEW_ANGLES: ExhibitionCreativeViewAngle[];
export function cleanExhibitionCreativeText(value: unknown, max?: number): string;
export function normalizeExhibitionCreativeSpaceType(value: unknown): ExhibitionCreativeSpaceType;
export function normalizeExhibitionCreativeCount(value: unknown): number;
export function normalizeExhibitionCreativeSpaceSize(value: unknown): { width: number; depth: number; height: number };
export function exhibitionCreativeSpaceSizeText(value: unknown): string;
export function exhibitionCreativeSpaceTypeMeta(value: unknown): ExhibitionCreativeSpaceTypeMeta;
export function normalizeExhibitionCreativeInsertItems(value: unknown, options?: ExhibitionCreativeInsertItem[]): ExhibitionCreativeInsertItem[];
export function exhibitionCreativeInsertItemsText(value: unknown, options?: ExhibitionCreativeInsertItem[]): string;
export function normalizeExhibitionCreativeExcludeItems(value: unknown, options?: ExhibitionCreativeExcludeItem[]): ExhibitionCreativeExcludeItem[];
export function exhibitionCreativeExcludeItemsText(value: unknown, options?: ExhibitionCreativeExcludeItem[]): string;
export function normalizeExhibitionCreativeViewAngles(value: unknown, options?: ExhibitionCreativeViewAngle[]): ExhibitionCreativeViewAngle[];
export function exhibitionCreativeViewAnglesText(value: unknown, options?: ExhibitionCreativeViewAngle[]): string;
export function normalizeExhibitionCreativeBrief(value: unknown): string;
export function buildExhibitionCreativeBriefPrompt(values?: ExhibitionCreativeBriefPromptValues): string;
export function buildExhibitionCreativeImagePrompt(values?: ExhibitionCreativeImagePromptValues): string;
