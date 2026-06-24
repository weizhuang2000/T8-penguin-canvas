import {
  buildElevationAnalysisMessages,
  buildElevationContentPlanMessages,
  buildElevationOutputs,
  ELEVATION_CRAFTS,
  normalizeElevationAnalysis,
  parseElevationContentPlanResponse,
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
  category?: string;
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
  craftIds?: string[];
  craftNotes?: string;
}

export interface ElevationContentPlan {
  projectTheme: string;
  coreMessage: string;
  walls: ElevationWall[];
}

export {
  buildElevationAnalysisMessages,
  buildElevationContentPlanMessages,
  buildElevationOutputs,
  ELEVATION_CRAFTS,
  normalizeElevationAnalysis,
  parseElevationContentPlanResponse,
  parseElevationAnalysisResponse,
  wallsFromAnalysis,
};
