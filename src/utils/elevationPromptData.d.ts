export interface ElevationCraft {
  id: string;
  category?: string;
  label: string;
  prompt: string;
  order?: number;
}

export interface ElevationSection {
  title: string;
  shortTitle: string;
  keyQuotes: string[];
  displayFocus: string;
  suggestedCrafts: string[];
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

export interface ElevationPromptValues {
  analysis?: Partial<ElevationAnalysis> | null;
  walls?: ElevationWall[];
  wallMode?: 'single' | 'multi' | 'auto';
  wallCount?: number;
  outputMode?: 'segments' | 'overview';
  downstreamContent?: 'concept' | 'schedule' | 'combined';
  selectedCrafts?: string[];
  craftPresets?: ElevationCraft[];
  customCraft?: string;
  aspectRatio?: string;
  dimensions?: string;
  density?: string;
  colorMaterial?: string;
  visualStyle?: string;
  supplement?: string;
  layoutScheduleOverride?: string;
}

export interface ElevationOutputs {
  walls: ElevationWall[];
  conceptPrompts: string[];
  scheduleSegments: string[];
  overviewPrompt: string;
  layoutSchedule: string;
  generatedLayoutSchedule: string;
  mainOutput: string;
  textSegments: string[];
}

export interface ElevationAnalysisMessage {
  role: 'system' | 'user';
  content: string;
}

export const ELEVATION_CRAFTS: ElevationCraft[];

export function normalizeElevationAnalysis(value: unknown): ElevationAnalysis;
export function parseElevationAnalysisResponse(content: string): ElevationAnalysis;
export function wallsFromAnalysis(
  analysisValue: unknown,
  mode?: 'single' | 'multi' | 'auto',
  count?: number,
): ElevationWall[];
export function buildElevationOutputs(values?: ElevationPromptValues): ElevationOutputs;
export function buildElevationAnalysisMessages(
  sourceText: string,
  wallMode?: 'single' | 'multi' | 'auto',
  wallCount?: number,
  wordCount?: number,
): ElevationAnalysisMessage[];
export function parseElevationContentPlanResponse(content: string): ElevationContentPlan;
export function buildElevationContentPlanMessages(values?: {
  sourceText?: string;
  wallMode?: 'single' | 'multi' | 'auto';
  wallCount?: number;
  selectedCrafts?: string[];
  craftPresets?: ElevationCraft[];
  customCraft?: string;
  spaceLightingEnabled?: boolean;
  spaceLightingLevel?: 'very-dark' | 'dark' | 'bright' | 'very-bright';
}): ElevationAnalysisMessage[];
