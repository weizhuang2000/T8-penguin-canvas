export interface ExhibitionOutlineSegment {
  title: string;
  summary: string;
  keywords: string[];
  weightPercent: number;
  sourceHint?: string;
}

export interface ExhibitionOutlineSplitResult {
  mode: 'auto' | 'manual' | 'heading';
  segmentCount: number;
  segments: ExhibitionOutlineSegment[];
}

export interface ExhibitionOutlineSplitPromptValues {
  sourceText: string;
  mode?: 'auto' | 'manual' | 'heading';
  segmentCount?: number;
  projectTheme?: string;
  extraInstruction?: string;
}

export const MAX_OUTLINE_SEGMENT_COUNT: number;
export function normalizeOutlineSplitMode(value: unknown): 'auto' | 'manual' | 'heading';
export function normalizeOutlineSegmentCount(value: unknown): number;
export function normalizeOutlineLevel(value: unknown): number;
export function cleanOutlineText(value: unknown, max?: number): string;
export function buildExhibitionOutlineSplitPrompt(values: ExhibitionOutlineSplitPromptValues): string;
export function normalizeWeightPercents(weights: unknown, count: number): number[];
export function normalizeOutlineSegments(value: unknown): ExhibitionOutlineSegment[];
export function parseExhibitionOutlineSplitJson(content: string): ExhibitionOutlineSplitResult;
export function formatOutlineSegments(segments: ExhibitionOutlineSegment[]): string;
export function fallbackOutlineSplit(sourceText: string, segmentCount: number): ExhibitionOutlineSegment[];
export function splitOutlineByHeadingLevel(sourceText: string, outlineLevel?: number): ExhibitionOutlineSegment[];
