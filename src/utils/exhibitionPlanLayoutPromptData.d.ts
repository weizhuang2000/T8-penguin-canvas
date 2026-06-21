export interface ExhibitionPlanLayoutPreset {
  id: string;
  label: string;
  text: string;
}

export interface ExhibitionPlanLayoutChoiceItem {
  id: string;
  label: string;
  order?: number;
}

export interface ExhibitionPlanOutlineZone {
  name: string;
  summary: string;
  displayMethods: string[];
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
  insertItems?: string[];
  excludeItems?: string[];
  insertItemOptions?: ExhibitionPlanLayoutChoiceItem[];
  excludeItemOptions?: ExhibitionPlanLayoutChoiceItem[];
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
  insertItems?: string[];
  excludeItems?: string[];
  insertItemOptions?: ExhibitionPlanLayoutChoiceItem[];
  excludeItemOptions?: ExhibitionPlanLayoutChoiceItem[];
}

export const EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS: ExhibitionPlanLayoutChoiceItem[];
export const EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS: ExhibitionPlanLayoutChoiceItem[];
export const EXHIBITION_PLAN_LAYOUT_PRESETS: ExhibitionPlanLayoutPreset[];
export function normalizeExhibitionPlanLayoutPresetId(value?: unknown): string;
export function exhibitionPlanLayoutPresetText(value?: unknown): string;
export function normalizeExhibitionPlanLayoutInsertItems(value?: unknown, options?: ExhibitionPlanLayoutChoiceItem[]): ExhibitionPlanLayoutChoiceItem[];
export function exhibitionPlanLayoutInsertItemsText(value?: unknown, options?: ExhibitionPlanLayoutChoiceItem[]): string;
export function normalizeExhibitionPlanLayoutExcludeItems(value?: unknown, options?: ExhibitionPlanLayoutChoiceItem[]): ExhibitionPlanLayoutChoiceItem[];
export function exhibitionPlanLayoutExcludeItemsText(value?: unknown, options?: ExhibitionPlanLayoutChoiceItem[]): string;
export function buildExhibitionPlanOutlinePrompt(values?: ExhibitionPlanOutlinePromptValues): string;
export function parseExhibitionPlanOutlineJson(text: string): ExhibitionPlanOutlineResult;
export function formatExhibitionPlanOutline(result?: Partial<ExhibitionPlanOutlineResult> | null): string;
export function buildExhibitionPlanLayoutPrompt(values?: ExhibitionPlanLayoutPromptValues): string;
