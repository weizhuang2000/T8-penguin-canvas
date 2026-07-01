import {
  buildRenderToElevationAnalysisMessages,
  buildRenderToElevationImagePrompt,
  normalizeElevationSections,
  parseElevationLengthMeters,
  parseElevationSectionsFromLlmResponse,
  parseElevationSectionsFromText,
  splitLongElevationSections,
} from './exhibitionRenderToElevationPromptData.js';

export interface RenderToElevationSection {
  index: number;
  title: string;
  content: string;
  styleAnchor?: string;
  prompt?: string;
  lengthMeters?: number;
  originalIndex?: number;
  splitLengthMeters?: number;
  splitIndex?: number;
  splitCount?: number;
  needsIntelligentSplit?: boolean;
  recommendedSplitCount?: number;
  craftBoundaryNotes?: string;
}

export interface RenderToElevationPromptValues extends Partial<RenderToElevationSection> {
  supplement?: string;
  img2imgModeEnabled?: boolean;
  referenceToken?: string;
  formReferenceToken?: string;
}

export {
  buildRenderToElevationAnalysisMessages,
  buildRenderToElevationImagePrompt,
  normalizeElevationSections,
  parseElevationLengthMeters,
  parseElevationSectionsFromLlmResponse,
  parseElevationSectionsFromText,
  splitLongElevationSections,
};
