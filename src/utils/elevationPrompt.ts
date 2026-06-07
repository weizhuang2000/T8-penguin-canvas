import {
  buildElevationAnalysisMessages,
  buildElevationOutputs,
  ELEVATION_CRAFTS,
  normalizeElevationAnalysis,
  parseElevationAnalysisResponse,
  wallsFromAnalysis,
} from './elevationPromptData.js';

export interface ElevationSection {
  title: string;
  shortTitle: string;
  keyQuotes: string[];
  displayFocus: string;
  suggestedCrafts: string[];
}

export interface ElevationCraft {
  id: string;
  label: string;
  prompt: string;
  order?: number;
}

export interface ElevationAnalysis {
  projectTheme: string;
  coreMessage: string;
  sections: ElevationSection[];
}

export interface ElevationWall {
  id: string;
  title: string;
  content: string;
  exactText: string[];
}

export {
  buildElevationAnalysisMessages,
  buildElevationOutputs,
  ELEVATION_CRAFTS,
  normalizeElevationAnalysis,
  parseElevationAnalysisResponse,
  wallsFromAnalysis,
};
