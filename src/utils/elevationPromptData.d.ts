export interface ElevationCraft {
  id: string;
  label: string;
  prompt: string;
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
}

export interface ElevationPromptValues {
  analysis?: Partial<ElevationAnalysis> | null;
  walls?: ElevationWall[];
  wallMode?: 'single' | 'multi';
  wallCount?: number;
  outputMode?: 'segments' | 'overview';
  downstreamContent?: 'concept' | 'schedule' | 'combined';
  selectedCrafts?: string[];
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
  mode?: 'single' | 'multi',
  count?: number,
): ElevationWall[];
export function buildElevationOutputs(values?: ElevationPromptValues): ElevationOutputs;
export function buildElevationAnalysisMessages(
  sourceText: string,
  wallMode?: 'single' | 'multi',
  wallCount?: number,
  wordCount?: number,
): ElevationAnalysisMessage[];
