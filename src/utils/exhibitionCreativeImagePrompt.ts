import {
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  cleanExhibitionCreativeText,
  EXHIBITION_CREATIVE_SPACE_TYPES,
  exhibitionCreativeSpaceTypeMeta,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
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

export interface ExhibitionCreativeBriefPromptValues {
  spaceType?: ExhibitionCreativeSpaceType;
  projectTheme?: string;
  inspiration?: string;
  roundIndex?: number;
  total?: number;
  generationCount?: number;
  previousBriefs?: string[];
  regenerateEachTime?: boolean;
}

export interface ExhibitionCreativeImagePromptValues extends ExhibitionCreativeBriefPromptValues {
  creativeBrief?: string;
  brief?: string;
}

export {
  buildExhibitionCreativeBriefPrompt,
  buildExhibitionCreativeImagePrompt,
  cleanExhibitionCreativeText,
  EXHIBITION_CREATIVE_SPACE_TYPES,
  exhibitionCreativeSpaceTypeMeta,
  normalizeExhibitionCreativeBrief,
  normalizeExhibitionCreativeCount,
  normalizeExhibitionCreativeSpaceType,
};
