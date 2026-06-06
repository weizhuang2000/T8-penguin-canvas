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

export const EXHIBITION_DIMENSIONS: ExhibitionDimension[];
export function getExhibitionDimension(id: ExhibitionPromptDimension): ExhibitionDimension | undefined;
export function presetTextForDimension(dimensionId: ExhibitionPromptDimension, presetId?: string): string;
export function buildExhibitionPrompt(values: ExhibitionPromptValues): string;

