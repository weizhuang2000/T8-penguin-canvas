import type { ElevationCraft } from './elevationPromptData.js';

export type ExhibitionImg2ImgPriorityId =
  | 'structureAnnotations'
  | 'craftLayout'
  | 'styleImageForm';

export interface ExhibitionImg2ImgPriorityMeta {
  id: ExhibitionImg2ImgPriorityId;
  label: string;
}

export interface ExhibitionImg2ImgPromptValues {
  priorityOrder?: ExhibitionImg2ImgPriorityId[];
  selectedCrafts?: string[];
  craftPresets?: ElevationCraft[];
  customCraft?: string;
  density?: string;
  dimensions?: string;
  colorMaterial?: string;
  visualStyle?: string;
  toneReferenceMode?: 'solidModelFirst' | 'renderFirst' | 'balanced';
  supplement?: string;
  wallContentPrompt?: string;
  exhibitGroups?: Array<{
    groupIndex?: number;
    items?: Array<string | { description?: string; label?: string }>;
  }>;
}

export const EXHIBITION_IMG2IMG_PRIORITY: ExhibitionImg2ImgPriorityMeta[];
export const DEFAULT_EXHIBITION_IMG2IMG_PRIORITY: ExhibitionImg2ImgPriorityId[];
export function normalizeExhibitionImg2ImgPriority(value: unknown): ExhibitionImg2ImgPriorityId[];
export function buildExhibitionImg2ImgPrompt(values?: ExhibitionImg2ImgPromptValues): string;
