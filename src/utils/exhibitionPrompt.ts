import {
  buildExhibitionPrompt,
  EXHIBITION_DIMENSIONS,
  getExhibitionDimension,
  presetTextForDimension,
} from './exhibitionPromptData.js';

export type ExhibitionPromptDimension =
  | 'spaceType'
  | 'functionalZones'
  | 'exhibitionCraft'
  | 'colorSystem'
  | 'lightingStrategy'
  | 'materialExpression'
  | 'viewComposition'
  | 'styleReference'
  | 'negativeItems';

export interface ExhibitionDimensionPreset {
  id: string;
  label: string;
  text: string;
}

export interface ExhibitionDimension {
  id: ExhibitionPromptDimension;
  label: string;
  presets: ExhibitionDimensionPreset[];
}

export type ExhibitionPromptValues = Partial<Record<ExhibitionPromptDimension, string>> & {
  supplement?: string;
  upstreamText?: string;
  hasReferenceImages?: boolean;
};

export {
  buildExhibitionPrompt,
  EXHIBITION_DIMENSIONS,
  getExhibitionDimension,
  presetTextForDimension,
};

