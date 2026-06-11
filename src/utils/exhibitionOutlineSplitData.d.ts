export interface ExhibitionOutlineSegment {
  title: string;
  summary: string;
  keywords: string[];
  weightPercent: number;
  sourceHint?: string;
}

export interface ExhibitionOutlineSplitResult {
  mode: 'auto' | 'manual';
  segmentCount: number;
  segments: ExhibitionOutlineSegment[];
}

export interface ExhibitionOutlineSplitPromptValues {
  sourceText: string;
  mode?: 'auto' | 'manual';
  segmentCount?: number;
  projectTheme?: string;
  extraInstruction?: string;
}

export const MAX_OUTLINE_SEGMENT_COUNT: number;
export function normalizeOutlineSplitMode(value: unknown): 'auto' | 'manual';
export function normalizeOutlineSegmentCount(value: unknown): number;
export function cleanOutlineText(value: unknown, max?: number): string;
export function buildExhibitionOutlineSplitPrompt(values: ExhibitionOutlineSplitPromptValues): string;
export function normalizeWeightPercents(weights: unknown, count: number): number[];
export function normalizeOutlineSegments(value: unknown): ExhibitionOutlineSegment[];
export function parseExhibitionOutlineSplitJson(content: string): ExhibitionOutlineSplitResult;
export function formatOutlineSegments(segments: ExhibitionOutlineSegment[]): string;
export function fallbackOutlineSplit(sourceText: string, segmentCount: number): ExhibitionOutlineSegment[];
