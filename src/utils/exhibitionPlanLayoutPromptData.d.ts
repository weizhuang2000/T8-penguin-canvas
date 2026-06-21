export interface ExhibitionPlanLayoutPreset {
  id: string;
  label: string;
  text: string;
}

export interface ExhibitionPlanOutlineZone {
  name: string;
  summary: string;
  priority: number;
  areaHint: string;
  routeHint: string;
}

export interface ExhibitionPlanOutlineResult {
  title: string;
  zones: ExhibitionPlanOutlineZone[];
}

export interface ExhibitionPlanOutlinePromptValues {
  sourceText?: string;
  projectTheme?: string;
}

export interface ExhibitionPlanLayoutPromptValues {
  outlineText?: string;
  layoutOutlineText?: string;
  layoutRequirement?: string;
  layoutPresetId?: string;
  layoutPresetText?: string;
  showRoute?: boolean;
  showLabels?: boolean;
  showDescriptions?: boolean;
  hasStyleReferenceImage?: boolean;
}

export const EXHIBITION_PLAN_LAYOUT_PRESETS: ExhibitionPlanLayoutPreset[];
export function normalizeExhibitionPlanLayoutPresetId(value?: unknown): string;
export function exhibitionPlanLayoutPresetText(value?: unknown): string;
export function buildExhibitionPlanOutlinePrompt(values?: ExhibitionPlanOutlinePromptValues): string;
export function parseExhibitionPlanOutlineJson(text: string): ExhibitionPlanOutlineResult;
export function formatExhibitionPlanOutline(result?: Partial<ExhibitionPlanOutlineResult> | null): string;
export function buildExhibitionPlanLayoutPrompt(values?: ExhibitionPlanLayoutPromptValues): string;
