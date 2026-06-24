import type { ElevationCraft } from './elevationPromptData.js';
import type { ExhibitionCreativeExcludeItem } from './exhibitionCreativeImagePromptData.js';

export type ExhibitionImg2ImgPriorityId =
  | 'structureAnnotations'
  | 'craftLayout'
  | 'colorMaterialReference';

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
  colorMaterialPalette?: string;
  colorMaterialTextures?: string;
  hasColorMaterialPreset?: boolean;
  hasColorMaterialReferenceImage?: boolean;
  colorMaterialReferenceTone?: string;
  colorMaterialPriorityMode?: 'frontend' | 'llm';
  colorMaterialReferenceMode?: 'abstract-card' | 'marked-image';
  colorMaterialReferenceMarkText?: string;
  colorMaterialReferenceMarkPosition?: string;
  spaceLightingEnabled?: boolean;
  spaceLightingLevel?: 'very-dark' | 'dark' | 'bright' | 'very-bright';
  visualStyle?: string;
  supplement?: string;
  excludeItems?: string[];
  excludeItemOptions?: ExhibitionCreativeExcludeItem[];
  wallContentPrompt?: string;
  exhibitReferenceItems?: Array<{ id?: string; url?: string; label?: string; description?: string }>;
  spatialInputMode?: 'structure' | 'plan-camera';
  planCameraDescription?: string;
}

export const EXHIBITION_IMG2IMG_PRIORITY: ExhibitionImg2ImgPriorityMeta[];
export const DEFAULT_EXHIBITION_IMG2IMG_PRIORITY: ExhibitionImg2ImgPriorityId[];
export function normalizeExhibitionImg2ImgPriority(value: unknown): ExhibitionImg2ImgPriorityId[];
export function buildExhibitionImg2ImgPrompt(values?: ExhibitionImg2ImgPromptValues): string;
