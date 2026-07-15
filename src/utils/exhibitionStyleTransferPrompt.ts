import {
  buildExhibitionStyleTransferPrompt,
  EXHIBITION_STYLE_TRANSFER_MODES,
  normalizeExhibitionStyleTransferMode,
} from './exhibitionStyleTransferPromptData.js';

export type ExhibitionStyleTransferMode =
  | 'style-reference'
  | 'color-material-preset'
  | 'material-replacement';

export interface ExhibitionStyleTransferMaterialLike {
  label?: string;
  category?: string;
  description?: string;
  texture?: string;
  usage?: string;
}

export interface ExhibitionStyleTransferPromptValues {
  mode?: ExhibitionStyleTransferMode;
  colorMaterial?: string;
  colorMaterialPalette?: string;
  colorMaterialTextures?: string;
  primaryMaterial?: ExhibitionStyleTransferMaterialLike | null;
  secondaryMaterials?: ExhibitionStyleTransferMaterialLike[];
  supplement?: string;
}

export {
  buildExhibitionStyleTransferPrompt,
  EXHIBITION_STYLE_TRANSFER_MODES,
  normalizeExhibitionStyleTransferMode,
};
