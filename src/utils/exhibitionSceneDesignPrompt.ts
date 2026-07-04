import {
  buildExhibitionSceneExtractPrompt,
  buildExhibitionSceneImagePrompt,
  cleanExhibitionSceneText,
  exhibitionSceneAtmosphereMeta,
  exhibitionSceneCategoryMeta,
  exhibitionSceneCrowdDensityMeta,
  exhibitionScenePresentationFormMeta,
  exhibitionSceneSpatialScaleMeta,
  EXHIBITION_SCENE_ATMOSPHERES,
  EXHIBITION_SCENE_CATEGORIES,
  EXHIBITION_SCENE_CROWD_DENSITIES,
  EXHIBITION_SCENE_PRESENTATION_FORMS,
  EXHIBITION_SCENE_SPATIAL_SCALES,
  normalizeExhibitionSceneAtmosphere,
  normalizeExhibitionSceneCategory,
  normalizeExhibitionSceneCrowdDensity,
  normalizeExhibitionScenePresentationForm,
  normalizeExhibitionSceneSpatialScale,
  parseExhibitionSceneExtractJson,
} from './exhibitionSceneDesignPromptData.js';

export interface ExhibitionSceneOption {
  id: string;
  label: string;
  prompt: string;
}

export interface ExhibitionSceneImagePromptValues {
  sceneCategory?: string;
  presentationForm?: string;
  spatialScale?: string;
  atmosphere?: string;
  crowdDensity?: string;
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

export {
  buildExhibitionSceneExtractPrompt,
  buildExhibitionSceneImagePrompt,
  cleanExhibitionSceneText,
  exhibitionSceneAtmosphereMeta,
  exhibitionSceneCategoryMeta,
  exhibitionSceneCrowdDensityMeta,
  exhibitionScenePresentationFormMeta,
  exhibitionSceneSpatialScaleMeta,
  EXHIBITION_SCENE_ATMOSPHERES,
  EXHIBITION_SCENE_CATEGORIES,
  EXHIBITION_SCENE_CROWD_DENSITIES,
  EXHIBITION_SCENE_PRESENTATION_FORMS,
  EXHIBITION_SCENE_SPATIAL_SCALES,
  normalizeExhibitionSceneAtmosphere,
  normalizeExhibitionSceneCategory,
  normalizeExhibitionSceneCrowdDensity,
  normalizeExhibitionScenePresentationForm,
  normalizeExhibitionSceneSpatialScale,
  parseExhibitionSceneExtractJson,
};
