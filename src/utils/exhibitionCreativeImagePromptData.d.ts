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

export interface ExhibitionCreativeBriefPromptValues {
  spaceType?: ExhibitionCreativeSpaceType;
  projectTheme?: string;
  inspiration?: string;
  documentSummary?: string;
  insertItems?: string[];
  insertItemOptions?: ExhibitionCreativeInsertItem[];
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
}

export const EXHIBITION_CREATIVE_SPACE_TYPES: ExhibitionCreativeSpaceTypeMeta[];
export const EXHIBITION_CREATIVE_INSERT_ITEMS: ExhibitionCreativeInsertItem[];
export function cleanExhibitionCreativeText(value: unknown, max?: number): string;
export function normalizeExhibitionCreativeSpaceType(value: unknown): ExhibitionCreativeSpaceType;
export function normalizeExhibitionCreativeCount(value: unknown): number;
export function exhibitionCreativeSpaceTypeMeta(value: unknown): ExhibitionCreativeSpaceTypeMeta;
export function normalizeExhibitionCreativeInsertItems(value: unknown, options?: ExhibitionCreativeInsertItem[]): ExhibitionCreativeInsertItem[];
export function exhibitionCreativeInsertItemsText(value: unknown, options?: ExhibitionCreativeInsertItem[]): string;
export function normalizeExhibitionCreativeBrief(value: unknown): string;
export function buildExhibitionCreativeBriefPrompt(values?: ExhibitionCreativeBriefPromptValues): string;
export function buildExhibitionCreativeImagePrompt(values?: ExhibitionCreativeImagePromptValues): string;
