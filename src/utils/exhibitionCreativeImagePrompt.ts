import {
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  cleanExhibitionCreativeText,
  EXHIBITION_CREATIVE_INSERT_ITEMS,
  EXHIBITION_CREATIVE_SPACE_TYPES,
  exhibitionCreativeInsertItemsText,
  exhibitionCreativeSpaceTypeMeta,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeInsertItems,
  normalizeExhibitionCreativeSpaceType,
} from './exhibitionCreativeImagePromptData.js';

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

export {
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  cleanExhibitionCreativeText,
  EXHIBITION_CREATIVE_INSERT_ITEMS,
  EXHIBITION_CREATIVE_SPACE_TYPES,
  exhibitionCreativeInsertItemsText,
  exhibitionCreativeSpaceTypeMeta,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeInsertItems,
  normalizeExhibitionCreativeSpaceType,
};
