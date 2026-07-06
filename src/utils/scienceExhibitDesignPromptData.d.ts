export interface ScienceExhibitPromptOption {
  id: string;
  label: string;
  prompt: string;
}

export interface ScienceExhibitPromptParameter {
  name: string;
  range: string;
  unit: string;
  effect: string;
}

export interface ScienceExhibitPromptAnalysis {
  titleText: string;
  sciencePrinciple: string;
  keyParameters: ScienceExhibitPromptParameter[];
  interactionFlow: string;
  mechanismDesign: string;
  safetyMaintenance: string;
  visualBrief: string;
  drawingNotes: string;
}

export interface ScienceExhibitPromptDimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  operationHeightMm: number;
  safetyClearanceMm: number;
  maintenanceClearanceMm: number;
  estimatedPowerW: number;
}

export const SCIENCE_EXHIBIT_DOMAINS: ScienceExhibitPromptOption[];
export const SCIENCE_EXHIBIT_TYPES: ScienceExhibitPromptOption[];
export const SCIENCE_EXHIBIT_INTERACTIONS: ScienceExhibitPromptOption[];
export const SCIENCE_EXHIBIT_AUDIENCES: ScienceExhibitPromptOption[];
export const SCIENCE_EXHIBIT_SCALES: ScienceExhibitPromptOption[];
export const SCIENCE_EXHIBIT_DRAWING_TYPES: ScienceExhibitPromptOption[];
export const SCIENCE_EXHIBIT_BACKGROUNDS: ScienceExhibitPromptOption[];
export const SCIENCE_EXHIBIT_DEFAULT_DRAWINGS: string[];
export const SCIENCE_EXHIBIT_DEFAULT_DIMENSIONS: Record<string, ScienceExhibitPromptDimensions>;

export function cleanScienceExhibitText(value: unknown, limit?: number): string;
export function normalizeScienceExhibitDomain(value: unknown, options?: ScienceExhibitPromptOption[]): string;
export function normalizeScienceExhibitType(value: unknown, options?: ScienceExhibitPromptOption[]): string;
export function normalizeScienceExhibitInteraction(value: unknown, options?: ScienceExhibitPromptOption[]): string;
export function normalizeScienceExhibitAudience(value: unknown, options?: ScienceExhibitPromptOption[]): string;
export function normalizeScienceExhibitScale(value: unknown, options?: ScienceExhibitPromptOption[]): string;
export function normalizeScienceExhibitDrawingType(value: unknown): string;
export function normalizeScienceExhibitBackground(value: unknown): string;
export function normalizeScienceExhibitDrawingSelection(value: unknown): string[];
export function normalizeScienceExhibitDimensions(value?: unknown, scaleValue?: unknown): ScienceExhibitPromptDimensions;
export function scienceExhibitDomainMeta(value: unknown, options?: ScienceExhibitPromptOption[]): ScienceExhibitPromptOption;
export function scienceExhibitTypeMeta(value: unknown, options?: ScienceExhibitPromptOption[]): ScienceExhibitPromptOption;
export function scienceExhibitInteractionMeta(value: unknown, options?: ScienceExhibitPromptOption[]): ScienceExhibitPromptOption;
export function scienceExhibitAudienceMeta(value: unknown, options?: ScienceExhibitPromptOption[]): ScienceExhibitPromptOption;
export function scienceExhibitScaleMeta(value: unknown, options?: ScienceExhibitPromptOption[]): ScienceExhibitPromptOption;
export function scienceExhibitDrawingMeta(value: unknown): ScienceExhibitPromptOption;
export function scienceExhibitBackgroundMeta(value: unknown): ScienceExhibitPromptOption;
export function normalizeScienceExhibitAnalysis(value?: unknown): ScienceExhibitPromptAnalysis;
export function buildScienceExhibitExtractPrompt(values?: Record<string, unknown>): string;
export function parseScienceExhibitExtractJson(text: string): ScienceExhibitPromptAnalysis;
export function buildScienceExhibitParameterMarkdown(values?: Record<string, unknown>): string;
export function buildScienceExhibitImagePrompt(values?: Record<string, unknown>): string;
export function buildScienceExhibitDrawingPrompt(values?: Record<string, unknown>): string;
