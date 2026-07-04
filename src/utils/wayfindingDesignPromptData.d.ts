export type WayfindingOutputMode = 'system-board' | 'scene-render' | 'single-sign' | 'signage-set';
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

export interface WayfindingExtractResult {
  museumName: string;
  projectTheme: string;
  zones: string[];
  destinations: string[];
  routeText: string;
  signText: string;
  notes: string;
}

export const WAYFINDING_OUTPUT_MODES: WayfindingOption[];
export const WAYFINDING_SCOPE_OPTIONS: WayfindingOption[];
export const WAYFINDING_SIGN_TYPES: WayfindingOption[];
export const WAYFINDING_MATERIALS: WayfindingOption[];
export const WAYFINDING_MOUNTING_OPTIONS: WayfindingOption[];
export const WAYFINDING_ARROW_STYLES: WayfindingOption[];
export const WAYFINDING_LANGUAGES: WayfindingOption[];

export function cleanWayfindingText(value: unknown, max?: number): string;
export function normalizeWayfindingOutputMode(value: unknown): WayfindingOutputMode;
export function normalizeWayfindingScope(value: unknown): WayfindingScope;
export function normalizeWayfindingSignTypes(value: unknown): string[];
export function normalizeWayfindingMaterial(value: unknown): string;
export function normalizeWayfindingMounting(value: unknown): string;
export function normalizeWayfindingArrowStyle(value: unknown): string;
export function normalizeWayfindingLanguage(value: unknown): string;
export function normalizeWayfindingDimensions(value: unknown): WayfindingDimensions;
export function wayfindingOutputModeMeta(value: unknown): WayfindingOption;
export function wayfindingScopeMeta(value: unknown): WayfindingOption;
export function wayfindingSignTypeMeta(value: unknown): WayfindingOption;
export function wayfindingMaterialMeta(value: unknown): WayfindingOption;
export function wayfindingMountingMeta(value: unknown): WayfindingOption;
export function wayfindingArrowStyleMeta(value: unknown): WayfindingOption;
export function wayfindingLanguageMeta(value: unknown): WayfindingOption;
export function wayfindingDimensionsText(value: unknown): string;
export function buildWayfindingExtractPrompt(values?: Record<string, unknown>): string;
export function parseWayfindingExtractJson(text: string): WayfindingExtractResult;
export function buildWayfindingImagePrompt(values?: Record<string, unknown>): string;
