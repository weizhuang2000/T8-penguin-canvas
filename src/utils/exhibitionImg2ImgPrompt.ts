import {
  buildExhibitionImg2ImgPrompt,
  DEFAULT_EXHIBITION_IMG2IMG_PRIORITY,
  EXHIBITION_IMG2IMG_EXCLUDE_ITEMS,
  EXHIBITION_IMG2IMG_PRIORITY,
  exhibitionImg2ImgExcludeItemsText,
  normalizeExhibitionImg2ImgExcludeItems,
  normalizeExhibitionImg2ImgPriority,
} from './exhibitionImg2ImgPromptData.js';

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
  craftPresets?: Array<{ id: string; category?: string; label: string; prompt: string; order?: number }>;
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
  exhibitReferenceItems?: Array<{ id?: string; url?: string; label?: string }>;
  spatialInputMode?: 'structure' | 'plan-camera';
  planCameraDescription?: string;
}

export {
  buildExhibitionImg2ImgPrompt,
  DEFAULT_EXHIBITION_IMG2IMG_PRIORITY,
  EXHIBITION_IMG2IMG_EXCLUDE_ITEMS,
  EXHIBITION_IMG2IMG_PRIORITY,
  exhibitionImg2ImgExcludeItemsText,
  normalizeExhibitionImg2ImgExcludeItems,
  normalizeExhibitionImg2ImgPriority,
};
