import {
  buildWayfindingExtractPrompt,
  buildWayfindingImagePrompt,
  cleanWayfindingText,
  normalizeWayfindingArrowStyle,
  normalizeWayfindingDimensions,
  normalizeWayfindingLanguage,
  normalizeWayfindingMaterial,
  normalizeWayfindingMounting,
  normalizeWayfindingOutputMode,
  normalizeWayfindingOutputPageCount,
  normalizeWayfindingOutputPageMode,
  normalizeWayfindingScope,
  normalizeWayfindingSignTypes,
  parseWayfindingExtractJson,
  resolveWayfindingOutputPages,
  MAX_WAYFINDING_OUTPUT_PAGES,
  WAYFINDING_ARROW_STYLES,
  WAYFINDING_LANGUAGES,
  WAYFINDING_MATERIALS,
  WAYFINDING_MOUNTING_OPTIONS,
  WAYFINDING_OUTPUT_MODES,
  WAYFINDING_OUTPUT_PAGE_OPTIONS,
  WAYFINDING_SCOPE_OPTIONS,
  WAYFINDING_SIGN_TYPES,
  wayfindingArrowStyleMeta,
  wayfindingDimensionsText,
  wayfindingLanguageMeta,
  wayfindingMaterialMeta,
  wayfindingMountingMeta,
  wayfindingOutputModeMeta,
  wayfindingScopeMeta,
  wayfindingSignTypeMeta,
} from './wayfindingDesignPromptData.js';

export type WayfindingOutputMode = 'system-board' | 'scene-render' | 'single-sign' | 'signage-set';
export type WayfindingOutputPageMode = 'auto' | 'fixed';
export type WayfindingScope = 'mixed' | 'indoor' | 'outdoor';

export interface WayfindingOption {
  id: string;
  label: string;
  prompt: string;
  scope?: string;
}

export interface WayfindingDimensions {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  installHeightMm: number;
}

export {
  buildWayfindingExtractPrompt,
  buildWayfindingImagePrompt,
  cleanWayfindingText,
  normalizeWayfindingArrowStyle,
  normalizeWayfindingDimensions,
  normalizeWayfindingLanguage,
  normalizeWayfindingMaterial,
  normalizeWayfindingMounting,
  normalizeWayfindingOutputMode,
  normalizeWayfindingOutputPageCount,
  normalizeWayfindingOutputPageMode,
  normalizeWayfindingScope,
  normalizeWayfindingSignTypes,
  parseWayfindingExtractJson,
  resolveWayfindingOutputPages,
  MAX_WAYFINDING_OUTPUT_PAGES,
  WAYFINDING_ARROW_STYLES,
  WAYFINDING_LANGUAGES,
  WAYFINDING_MATERIALS,
  WAYFINDING_MOUNTING_OPTIONS,
  WAYFINDING_OUTPUT_MODES,
  WAYFINDING_OUTPUT_PAGE_OPTIONS,
  WAYFINDING_SCOPE_OPTIONS,
  WAYFINDING_SIGN_TYPES,
  wayfindingArrowStyleMeta,
  wayfindingDimensionsText,
  wayfindingLanguageMeta,
  wayfindingMaterialMeta,
  wayfindingMountingMeta,
  wayfindingOutputModeMeta,
  wayfindingScopeMeta,
  wayfindingSignTypeMeta,
};
