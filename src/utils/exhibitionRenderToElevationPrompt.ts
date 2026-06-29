import {
  buildRenderToElevationAnalysisMessages,
  buildRenderToElevationImagePrompt,
  normalizeElevationSections,
  parseElevationSectionsFromLlmResponse,
  parseElevationSectionsFromText,
} from './exhibitionRenderToElevationPromptData.js';

export interface RenderToElevationSection {
  index: number;
  title: string;
  content: string;
  styleAnchor?: string;
  prompt?: string;
}

export interface RenderToElevationPromptValues extends Partial<RenderToElevationSection> {
  supplement?: string;
}

export {
  buildRenderToElevationAnalysisMessages,
  buildRenderToElevationImagePrompt,
  normalizeElevationSections,
  parseElevationSectionsFromLlmResponse,
  parseElevationSectionsFromText,
};
