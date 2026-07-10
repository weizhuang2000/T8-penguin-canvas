import {
  buildScienceExhibitDrawingPrompt,
  buildScienceExhibitExtractPrompt,
  buildScienceExhibitImagePrompt,
  buildScienceExhibitParameterMarkdown,
  cleanScienceExhibitText,
  normalizeScienceExhibitAnalysis,
  normalizeScienceExhibitAudience,
  normalizeScienceExhibitBackground,
  normalizeScienceExhibitDimensions,
  normalizeScienceExhibitDomain,
  normalizeScienceExhibitDrawingSelection,
  normalizeScienceExhibitDrawingType,
  normalizeScienceExhibitInteraction,
  normalizeScienceExhibitInteractions,
  normalizeScienceExhibitScale,
  normalizeScienceExhibitType,
  parseScienceExhibitExtractJson,
  scienceExhibitAudienceMeta,
  scienceExhibitBackgroundMeta,
  scienceExhibitDomainMeta,
  scienceExhibitDrawingMeta,
  scienceExhibitInteractionMeta,
  scienceExhibitInteractionMetas,
  scienceExhibitScaleMeta,
  scienceExhibitTypeMeta,
  SCIENCE_EXHIBIT_AUDIENCES,
  SCIENCE_EXHIBIT_BACKGROUNDS,
  SCIENCE_EXHIBIT_DEFAULT_DIMENSIONS,
  SCIENCE_EXHIBIT_DEFAULT_DRAWINGS,
  SCIENCE_EXHIBIT_DOMAINS,
  SCIENCE_EXHIBIT_DRAWING_TYPES,
  SCIENCE_EXHIBIT_INTERACTIONS,
  SCIENCE_EXHIBIT_SCALES,
  SCIENCE_EXHIBIT_TYPES,
} from './scienceExhibitDesignPromptData.js';

export interface ScienceExhibitOption {
  id: string;
  label: string;
  prompt: string;
}

export interface ScienceExhibitParameter {
  name: string;
  range: string;
  unit: string;
  effect: string;
}

export interface ScienceExhibitAnalysis {
  titleText: string;
  sciencePrinciple: string;
  keyParameters: ScienceExhibitParameter[];
  interactionFlow: string;
  mechanismDesign: string;
  safetyMaintenance: string;
  visualBrief: string;
  drawingNotes: string;
  dimensions?: ScienceExhibitDimensions;
}

export interface ScienceExhibitDimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  operationHeightMm: number;
  safetyClearanceMm: number;
  maintenanceClearanceMm: number;
  estimatedPowerW: number;
}

export type ScienceExhibitDrawingType = 'render' | 'exploded' | 'principle' | 'orthographic' | 'parameter-table';
export type ScienceExhibitResultKind = ScienceExhibitDrawingType | 'combined-sheet';

export interface ScienceExhibitResult {
  kind: ScienceExhibitResultKind;
  name: string;
  imageUrl: string;
  prompt: string;
  seed: number;
  taskId?: string;
}

export {
  buildScienceExhibitDrawingPrompt,
  buildScienceExhibitExtractPrompt,
  buildScienceExhibitImagePrompt,
  buildScienceExhibitParameterMarkdown,
  cleanScienceExhibitText,
  normalizeScienceExhibitAnalysis,
  normalizeScienceExhibitAudience,
  normalizeScienceExhibitBackground,
  normalizeScienceExhibitDimensions,
  normalizeScienceExhibitDomain,
  normalizeScienceExhibitDrawingSelection,
  normalizeScienceExhibitDrawingType,
  normalizeScienceExhibitInteraction,
  normalizeScienceExhibitInteractions,
  normalizeScienceExhibitScale,
  normalizeScienceExhibitType,
  parseScienceExhibitExtractJson,
  scienceExhibitAudienceMeta,
  scienceExhibitBackgroundMeta,
  scienceExhibitDomainMeta,
  scienceExhibitDrawingMeta,
  scienceExhibitInteractionMeta,
  scienceExhibitInteractionMetas,
  scienceExhibitScaleMeta,
  scienceExhibitTypeMeta,
  SCIENCE_EXHIBIT_AUDIENCES,
  SCIENCE_EXHIBIT_BACKGROUNDS,
  SCIENCE_EXHIBIT_DEFAULT_DIMENSIONS,
  SCIENCE_EXHIBIT_DEFAULT_DRAWINGS,
  SCIENCE_EXHIBIT_DOMAINS,
  SCIENCE_EXHIBIT_DRAWING_TYPES,
  SCIENCE_EXHIBIT_INTERACTIONS,
  SCIENCE_EXHIBIT_SCALES,
  SCIENCE_EXHIBIT_TYPES,
};
