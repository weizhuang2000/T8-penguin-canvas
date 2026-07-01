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

export interface RenderToElevationAnalysisValues {
  sourceText?: string;
  referenceImage?: string;
}

export interface RenderToElevationImagePromptValues extends Partial<RenderToElevationSection> {
  supplement?: string;
  img2imgModeEnabled?: boolean;
  referenceToken?: string;
  formReferenceToken?: string;
}

export function parseElevationSectionsFromText(value: unknown): RenderToElevationSection[];
export function normalizeElevationSections(value: unknown): RenderToElevationSection[];
export function parseElevationSectionsFromLlmResponse(value: unknown): RenderToElevationSection[];
export function parseElevationLengthMeters(value: unknown): number;
export function splitLongElevationSections(value: unknown): RenderToElevationSection[];
export function buildRenderToElevationAnalysisMessages(values?: RenderToElevationAnalysisValues): Array<Record<string, unknown>>;
export function buildRenderToElevationImagePrompt(values?: RenderToElevationImagePromptValues): string;
