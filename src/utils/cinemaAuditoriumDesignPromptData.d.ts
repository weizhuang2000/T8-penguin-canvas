export interface CinemaAuditoriumPromptOption {
  id: string;
  label: string;
  prompt: string;
}

export interface CinemaAuditoriumDimensions {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export const CINEMA_AUDITORIUM_VENUE_TYPES: CinemaAuditoriumPromptOption[];
export const CINEMA_AUDITORIUM_OUTPUT_TYPES: CinemaAuditoriumPromptOption[];
export const CINEMA_AUDITORIUM_DEFAULT_OUTPUTS: string[];
export const CINEMA_SCREEN_STAGE_SIDES: CinemaAuditoriumPromptOption[];
export const CINEMA_AISLE_MODES: CinemaAuditoriumPromptOption[];
export const CINEMA_SLOPE_MODES: CinemaAuditoriumPromptOption[];
export const CINEMA_SCREEN_TYPES: CinemaAuditoriumPromptOption[];
export const CINEMA_AUDIO_SYSTEMS: CinemaAuditoriumPromptOption[];
export const CINEMA_SPECIAL_EFFECTS: CinemaAuditoriumPromptOption[];

export function cleanCinemaAuditoriumText(value: unknown, limit?: number): string;
export function normalizeCinemaVenueType(value: unknown): string;
export function normalizeCinemaOutputType(value: unknown): string;
export function normalizeCinemaOutputSelection(value: unknown): string[];
export function normalizeCinemaScreenStageSide(value: unknown): string;
export function normalizeCinemaAisleMode(value: unknown): string;
export function normalizeCinemaSlopeMode(value: unknown): string;
export function normalizeCinemaScreenType(value: unknown): string;
export function normalizeCinemaAudioSystem(value: unknown): string;
export function normalizeCinemaSpecialEffects(value: unknown): string[];
export function normalizeCinemaDimensions(value?: unknown): CinemaAuditoriumDimensions;
export function cinemaVenueTypeMeta(value: unknown): CinemaAuditoriumPromptOption;
export function cinemaOutputTypeMeta(value: unknown): CinemaAuditoriumPromptOption;
export function cinemaScreenStageSideMeta(value: unknown): CinemaAuditoriumPromptOption;
export function cinemaAisleModeMeta(value: unknown): CinemaAuditoriumPromptOption;
export function cinemaSlopeModeMeta(value: unknown): CinemaAuditoriumPromptOption;
export function cinemaScreenTypeMeta(value: unknown): CinemaAuditoriumPromptOption;
export function cinemaAudioSystemMeta(value: unknown): CinemaAuditoriumPromptOption;
export function cinemaSpecialEffectMetas(value: unknown): CinemaAuditoriumPromptOption[];
export function colorMaterialTextFromCinemaPreset(preset: unknown): string;
export function buildCinemaAuditoriumSummary(values?: Record<string, unknown>): string;
export function buildCinemaAuditoriumImagePrompt(values?: Record<string, unknown>): string;
export function buildCinemaAuditoriumDrawingPrompt(values?: Record<string, unknown>): string;
