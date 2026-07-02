import {
  EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS,
  EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS,
  EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS,
  EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS,
  EXHIBITION_PLAN_LAYOUT_PRESETS,
  buildExhibitionAiPlanInterpretationPrompt,
  buildExhibitionAiPlanLayoutPrompt,
  buildExhibitionPlanLayoutPrompt,
  buildExhibitionPlanOutlinePrompt,
  exhibitionPlanLayoutExcludeItemsText,
  exhibitionPlanLayoutInsertItemsText,
  exhibitionPlanLayoutPresetText,
  formatExhibitionPlanOutline,
  normalizeExhibitionPlanLayoutExcludeItems,
  normalizeExhibitionPlanLayoutInsertItems,
  normalizeExhibitionPlanLayoutPresetId,
  parseExhibitionPlanOutlineJson,
} from './exhibitionPlanLayoutPromptData.js';

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

export interface ExhibitionAiPlanLayoutPromptValues extends ExhibitionPlanLayoutPromptValues {
  planAiInterpretation?: string;
  styleRequirement?: string;
  specialRequirement?: string;
}

export interface ExhibitionAiPlanPresetItem {
  id: string;
  label: string;
  prompt: string;
  order?: number;
}

export {
  EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS,
  EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS,
  EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS,
  EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS,
  EXHIBITION_PLAN_LAYOUT_PRESETS,
  buildExhibitionAiPlanInterpretationPrompt,
  buildExhibitionAiPlanLayoutPrompt,
  buildExhibitionPlanLayoutPrompt,
  buildExhibitionPlanOutlinePrompt,
  exhibitionPlanLayoutExcludeItemsText,
  exhibitionPlanLayoutInsertItemsText,
  exhibitionPlanLayoutPresetText,
  formatExhibitionPlanOutline,
  normalizeExhibitionPlanLayoutExcludeItems,
  normalizeExhibitionPlanLayoutInsertItems,
  normalizeExhibitionPlanLayoutPresetId,
  parseExhibitionPlanOutlineJson,
};
