export interface ExhibitionSceneOption {
  id: string;
  label: string;
  prompt: string;
}

export interface ExhibitionSceneExtractResult {
  titleText: string;
  themeText: string;
  sceneText: string;
  interactionText: string;
}

export interface ExhibitionSceneImagePromptValues {
  sceneCategory?: string;
  presentationForm?: string;
  spatialScale?: string;
  atmosphere?: string;
  crowdDensity?: string;
  sceneCategoryOption?: ExhibitionSceneOption;
  presentationFormOption?: ExhibitionSceneOption;
  spatialScaleOption?: ExhibitionSceneOption;
  atmosphereOption?: ExhibitionSceneOption;
  crowdDensityOption?: ExhibitionSceneOption;
  titleText?: string;
  themeText?: string;
  sceneText?: string;
  interactionText?: string;
  peoplePropsText?: string;
  colorMaterial?: string;
  colorMaterialPalette?: string;
  colorMaterialTextures?: string;
  colorMaterialReferenceTone?: string;
  colorMaterialPriorityMode?: 'frontend' | 'llm';
  hasEnvironmentReferenceImage?: boolean;
  hasColorMaterialReferenceImage?: boolean;
  hasPeoplePropsReferenceImage?: boolean;
  environmentReferenceImages?: string[];
  colorMaterialReferenceImages?: string[];
  peoplePropsReferenceImages?: string[];
}

export const EXHIBITION_SCENE_CATEGORIES: ExhibitionSceneOption[];
export const EXHIBITION_SCENE_PRESENTATION_FORMS: ExhibitionSceneOption[];
export const EXHIBITION_SCENE_SPATIAL_SCALES: ExhibitionSceneOption[];
export const EXHIBITION_SCENE_ATMOSPHERES: ExhibitionSceneOption[];
export const EXHIBITION_SCENE_CROWD_DENSITIES: ExhibitionSceneOption[];

export function cleanExhibitionSceneText(value: unknown, limit?: number): string;
export function normalizeExhibitionSceneCategory(value: unknown): string;
export function normalizeExhibitionScenePresentationForm(value: unknown): string;
export function normalizeExhibitionSceneSpatialScale(value: unknown): string;
export function normalizeExhibitionSceneAtmosphere(value: unknown): string;
export function normalizeExhibitionSceneCrowdDensity(value: unknown): string;
export function exhibitionSceneCategoryMeta(value: unknown): ExhibitionSceneOption;
export function exhibitionScenePresentationFormMeta(value: unknown): ExhibitionSceneOption;
export function exhibitionSceneSpatialScaleMeta(value: unknown): ExhibitionSceneOption;
export function exhibitionSceneAtmosphereMeta(value: unknown): ExhibitionSceneOption;
export function exhibitionSceneCrowdDensityMeta(value: unknown): ExhibitionSceneOption;
export function buildExhibitionSceneExtractPrompt(values?: { sourceText?: string }): string;
export function parseExhibitionSceneExtractJson(text: string): ExhibitionSceneExtractResult;
export function buildExhibitionSceneImagePrompt(values?: ExhibitionSceneImagePromptValues): string;
