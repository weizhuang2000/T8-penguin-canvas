import type { ElevationCraft } from './elevationPromptData.js';

export type ExhibitionImg2ImgPriorityId =
  | 'structureAnnotations'
  | 'craftLayout'
  | 'colorMaterialReference';

export interface ExhibitionImg2ImgPriorityMeta {
  id: ExhibitionImg2ImgPriorityId;
  label: string;
}

export interface ExhibitionImg2ImgExcludeItem {
  id: string;
  label: string;
  order?: number;
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
  excludeItemOptions?: ExhibitionImg2ImgExcludeItem[];
  wallContentPrompt?: string;
  exhibitReferenceItems?: Array<{ id?: string; url?: string; label?: string; description?: string }>;
  referenceRoleHints?: Array<{ token?: string; role?: 'structure' | 'plan-layout' | 'color-material-reference' | 'exhibit-reference'; index?: number }>;
  spatialInputMode?: 'structure' | 'plan-camera';
  planCameraDescription?: string;
  renderElevationTogether?: boolean;
}

export const EXHIBITION_IMG2IMG_PRIORITY: ExhibitionImg2ImgPriorityMeta[];
export const DEFAULT_EXHIBITION_IMG2IMG_PRIORITY: ExhibitionImg2ImgPriorityId[];
export const EXHIBITION_IMG2IMG_EXCLUDE_ITEMS: ExhibitionImg2ImgExcludeItem[];
export function normalizeExhibitionImg2ImgPriority(value: unknown): ExhibitionImg2ImgPriorityId[];
export function normalizeExhibitionImg2ImgExcludeItems(value: unknown, options?: ExhibitionImg2ImgExcludeItem[]): ExhibitionImg2ImgExcludeItem[];
export function exhibitionImg2ImgExcludeItemsText(value: unknown, options?: ExhibitionImg2ImgExcludeItem[]): string;
export function buildExhibitionImg2ImgPrompt(values?: ExhibitionImg2ImgPromptValues): string;
