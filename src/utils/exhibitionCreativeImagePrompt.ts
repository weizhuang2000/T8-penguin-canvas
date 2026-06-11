import {
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  cleanExhibitionCreativeText,
  EXHIBITION_CREATIVE_EXCLUDE_ITEMS,
  EXHIBITION_CREATIVE_INSERT_ITEMS,
  EXHIBITION_CREATIVE_SPACE_TYPES,
  EXHIBITION_CREATIVE_VIEW_ANGLES,
  exhibitionCreativeExcludeItemsText,
  exhibitionCreativeInsertItemsText,
  exhibitionCreativeSpaceTypeMeta,
  exhibitionCreativeSpaceSizeText,
  exhibitionCreativeViewAnglesText,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeExcludeItems,
  normalizeExhibitionCreativeInsertItems,
  normalizeExhibitionCreativeSpaceSize,
  normalizeExhibitionCreativeSpaceType,
  normalizeExhibitionCreativeViewAngles,
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
  spaceSize?: {
    width?: number | string;
    depth?: number | string;
    height?: number | string;
  };
  viewControlEnabled?: boolean;
  viewAngles?: string[];
  viewAngleOptions?: ExhibitionCreativeViewAngle[];
}

export {
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  cleanExhibitionCreativeText,
  EXHIBITION_CREATIVE_EXCLUDE_ITEMS,
  EXHIBITION_CREATIVE_INSERT_ITEMS,
  EXHIBITION_CREATIVE_SPACE_TYPES,
  EXHIBITION_CREATIVE_VIEW_ANGLES,
  exhibitionCreativeExcludeItemsText,
  exhibitionCreativeInsertItemsText,
  exhibitionCreativeSpaceTypeMeta,
  exhibitionCreativeSpaceSizeText,
  exhibitionCreativeViewAnglesText,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeExcludeItems,
  normalizeExhibitionCreativeInsertItems,
  normalizeExhibitionCreativeSpaceSize,
  normalizeExhibitionCreativeSpaceType,
  normalizeExhibitionCreativeViewAngles,
};
