import {
  buildExhibitionImg2ImgPrompt,
  DEFAULT_EXHIBITION_IMG2IMG_PRIORITY,
  EXHIBITION_IMG2IMG_PRIORITY,
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

export interface ExhibitionImg2ImgPromptValues {
  priorityOrder?: ExhibitionImg2ImgPriorityId[];
  selectedCrafts?: string[];
  craftPresets?: Array<{ id: string; label: string; prompt: string; order?: number }>;
  customCraft?: string;
  density?: string;
  dimensions?: string;
  colorMaterial?: string;
  colorMaterialPalette?: string;
  colorMaterialTextures?: string;
  hasColorMaterialPreset?: boolean;
  hasColorMaterialReferenceImage?: boolean;
  visualStyle?: string;
  supplement?: string;
  wallContentPrompt?: string;
  exhibitReferenceItems?: Array<{ id?: string; url?: string; label?: string; description?: string }>;
}

export {
  buildExhibitionImg2ImgPrompt,
  DEFAULT_EXHIBITION_IMG2IMG_PRIORITY,
  EXHIBITION_IMG2IMG_PRIORITY,
  normalizeExhibitionImg2ImgPriority,
};
