import {
  buildCinemaAuditoriumDrawingPrompt,
  buildCinemaAuditoriumImagePrompt,
  buildCinemaAuditoriumSummary,
  cinemaAisleModeMeta,
  cinemaAudioSystemMeta,
  cinemaOutputTypeMeta,
  cinemaScreenStageSideMeta,
  cinemaScreenTypeMeta,
  cinemaSlopeModeMeta,
  cinemaSpecialEffectMetas,
  cinemaVenueTypeMeta,
  cleanCinemaAuditoriumText,
  colorMaterialTextFromCinemaPreset,
  normalizeCinemaAisleMode,
  normalizeCinemaAudioSystem,
  normalizeCinemaDimensions,
  normalizeCinemaOutputSelection,
  normalizeCinemaOutputType,
  normalizeCinemaScreenStageSide,
  normalizeCinemaScreenType,
  normalizeCinemaSlopeMode,
  normalizeCinemaSpecialEffects,
  normalizeCinemaVenueType,
  CINEMA_AISLE_MODES,
  CINEMA_AUDIO_SYSTEMS,
  CINEMA_AUDITORIUM_DEFAULT_OUTPUTS,
  CINEMA_AUDITORIUM_OUTPUT_TYPES,
  CINEMA_AUDITORIUM_VENUE_TYPES,
  CINEMA_SCREEN_STAGE_SIDES,
  CINEMA_SCREEN_TYPES,
  CINEMA_SLOPE_MODES,
  CINEMA_SPECIAL_EFFECTS,
} from './cinemaAuditoriumDesignPromptData.js';

export type CinemaAuditoriumOutputType = 'render' | 'color-plan' | 'system-principle';
export type CinemaScreenStageSide = 'north' | 'south' | 'east' | 'west';

export interface CinemaAuditoriumOption {
  id: string;
  label: string;
  prompt: string;
}

export interface CinemaAuditoriumDimensions {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface CinemaAuditoriumResult {
  kind: CinemaAuditoriumOutputType;
  name: string;
  imageUrl: string;
  prompt: string;
  seed: number;
  taskId?: string;
}

export {
  buildCinemaAuditoriumDrawingPrompt,
  buildCinemaAuditoriumImagePrompt,
  buildCinemaAuditoriumSummary,
  cinemaAisleModeMeta,
  cinemaAudioSystemMeta,
  cinemaOutputTypeMeta,
  cinemaScreenStageSideMeta,
  cinemaScreenTypeMeta,
  cinemaSlopeModeMeta,
  cinemaSpecialEffectMetas,
  cinemaVenueTypeMeta,
  cleanCinemaAuditoriumText,
  colorMaterialTextFromCinemaPreset,
  normalizeCinemaAisleMode,
  normalizeCinemaAudioSystem,
  normalizeCinemaDimensions,
  normalizeCinemaOutputSelection,
  normalizeCinemaOutputType,
  normalizeCinemaScreenStageSide,
  normalizeCinemaScreenType,
  normalizeCinemaSlopeMode,
  normalizeCinemaSpecialEffects,
  normalizeCinemaVenueType,
  CINEMA_AISLE_MODES,
  CINEMA_AUDIO_SYSTEMS,
  CINEMA_AUDITORIUM_DEFAULT_OUTPUTS,
  CINEMA_AUDITORIUM_OUTPUT_TYPES,
  CINEMA_AUDITORIUM_VENUE_TYPES,
  CINEMA_SCREEN_STAGE_SIDES,
  CINEMA_SCREEN_TYPES,
  CINEMA_SLOPE_MODES,
  CINEMA_SPECIAL_EFFECTS,
};
