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
  mode?: ExhibitionStyleTransferMode | string;
  colorMaterial?: string;
  colorMaterialPalette?: string;
  colorMaterialTextures?: string;
  primaryMaterial?: ExhibitionStyleTransferMaterialLike | null;
  secondaryMaterials?: ExhibitionStyleTransferMaterialLike[];
  supplement?: string;
}

export const EXHIBITION_STYLE_TRANSFER_MODES: Array<{
  id: ExhibitionStyleTransferMode;
  label: string;
}>;

export function normalizeExhibitionStyleTransferMode(value?: unknown): ExhibitionStyleTransferMode;

export function buildExhibitionStyleTransferPrompt(values?: ExhibitionStyleTransferPromptValues): string;
