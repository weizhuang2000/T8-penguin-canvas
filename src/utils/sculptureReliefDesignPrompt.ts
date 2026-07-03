import {
  buildSculptureReliefExtractPrompt,
  buildSculptureReliefImagePrompt,
  cleanSculptureReliefText,
  normalizeReliefDesignType,
  normalizeSculptureDesignType,
  normalizeSculptureReliefDesignKind,
  normalizeSculptureReliefDimensions,
  normalizeSculptureReliefMaterial,
  parseSculptureReliefExtractJson,
  RELIEF_DESIGN_TYPES,
  SCULPTURE_DESIGN_TYPES,
  SCULPTURE_RELIEF_DESIGN_KINDS,
  SCULPTURE_RELIEF_MATERIALS,
  reliefDesignTypeMeta,
  sculptureDesignTypeMeta,
  sculptureReliefDesignKindMeta,
  sculptureReliefDimensionsText,
  sculptureReliefMaterialMeta,
} from './sculptureReliefDesignPromptData.js';

export type SculptureReliefDesignKind = 'sculpture' | 'relief';

export interface SculptureReliefOption {
  id: string;
  label: string;
  prompt: string;
}

export interface SculptureReliefDimensions {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  baseHeightMm: number;
}

export interface SculptureReliefImagePromptValues {
  designKind?: SculptureReliefDesignKind;
  sculptureType?: string;
  reliefType?: string;
  dimensions?: Partial<SculptureReliefDimensions>;
  materialId?: string;
  manualMaterial?: string;
  titleText?: string;
  themeText?: string;
  bodyText?: string;
  dimensionMarksEnabled?: boolean;
  backgroundMode?: 'black' | 'white';
  hasPatternReferenceImage?: boolean;
}

export {
  buildSculptureReliefExtractPrompt,
  buildSculptureReliefImagePrompt,
  cleanSculptureReliefText,
  normalizeReliefDesignType,
  normalizeSculptureDesignType,
  normalizeSculptureReliefDesignKind,
  normalizeSculptureReliefDimensions,
  normalizeSculptureReliefMaterial,
  parseSculptureReliefExtractJson,
  RELIEF_DESIGN_TYPES,
  SCULPTURE_DESIGN_TYPES,
  SCULPTURE_RELIEF_DESIGN_KINDS,
  SCULPTURE_RELIEF_MATERIALS,
  reliefDesignTypeMeta,
  sculptureDesignTypeMeta,
  sculptureReliefDesignKindMeta,
  sculptureReliefDimensionsText,
  sculptureReliefMaterialMeta,
};
