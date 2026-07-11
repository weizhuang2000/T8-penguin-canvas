export type ReverseIsometricDirection = 'front-left' | 'front-right' | 'back-left' | 'back-right';
export interface ReverseIsometricLayoutItem { id: string; url: string; label: string; xRatio: number; yRatio: number; widthRatio: number; heightRatio: number; rotationDeg: number; zIndex: number; cropX: number; cropY: number; cropWidth: number; cropHeight: number; }
export const REVERSE_ISOMETRIC_DIRECTIONS: Array<{ value: ReverseIsometricDirection; label: string }>;
export const REVERSE_ISOMETRIC_FLOOR_MATERIALS: string[];
export function normalizeReverseIsometricDirection(value: unknown): ReverseIsometricDirection;
export function normalizeReverseIsometricLayoutItems(value: unknown, exhibits?: Array<{ id?: string; url: string; label?: string }>): ReverseIsometricLayoutItem[];
export function patchReverseIsometricLayoutItem(item: ReverseIsometricLayoutItem, patch?: Partial<ReverseIsometricLayoutItem>): ReverseIsometricLayoutItem;
export function describeWallAdjacentExhibits(items?: ReverseIsometricLayoutItem[], threshold?: number): string;
export function buildReverseIsometricPrompt(options?: { viewDirection?: ReverseIsometricDirection; hallHeightMm?: number; floorMaterial?: string; wallPlacementText?: string; exhibitCount?: number }): string;
