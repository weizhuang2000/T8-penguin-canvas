import {
  EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS,
  EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS,
  EXHIBITION_PLAN_LAYOUT_PRESETS,
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

export {
  EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS,
  EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS,
  EXHIBITION_PLAN_LAYOUT_PRESETS,
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
