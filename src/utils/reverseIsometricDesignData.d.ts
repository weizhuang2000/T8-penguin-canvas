export type ReverseIsometricDirection = 'front-left' | 'front-right' | 'back-left' | 'back-right';
export interface ReverseIsometricLayoutItem { id: string; url: string; label: string; xRatio: number; yRatio: number; widthRatio: number; heightRatio: number; rotationDeg: number; zIndex: number; cropX: number; cropY: number; cropWidth: number; cropHeight: number; }
export interface ReverseIsometricValidationReport { pass: boolean; confidence: number; violations: Array<{ kind: string; message: string }>; }
export const REVERSE_ISOMETRIC_DIRECTIONS: Array<{ value: ReverseIsometricDirection; label: string }>;
export const REVERSE_ISOMETRIC_FLOOR_MATERIALS: string[];
export function normalizeReverseIsometricDirection(value: unknown): ReverseIsometricDirection;
export function normalizeReverseIsometricLayoutItems(value: unknown, exhibits?: Array<{ id?: string; url: string; label?: string }>): ReverseIsometricLayoutItem[];
export function patchReverseIsometricLayoutItem(item: ReverseIsometricLayoutItem, patch?: Partial<ReverseIsometricLayoutItem>): ReverseIsometricLayoutItem;
export function describeWallAdjacentExhibits(items?: ReverseIsometricLayoutItem[], threshold?: number): string;
export function buildReverseIsometricPrompt(options?: { viewDirection?: ReverseIsometricDirection; hallHeightMm?: number; floorMaterial?: string; wallPlacementText?: string; exhibitCount?: number; correction?: string }): string;
export function parseReverseIsometricValidationReport(content: unknown): ReverseIsometricValidationReport;
export function validationCorrectionText(report: ReverseIsometricValidationReport): string;
export function runReverseIsometricValidationLoop(options: {
  initialPrompt: string;
  viewDirection?: ReverseIsometricDirection;
  hallHeightMm?: number;
  floorMaterial?: string;
  wallPlacementText?: string;
  exhibitCount?: number;
  generateCandidate: (prompt: string, attempt: number) => Promise<string>;
  validateCandidate: (candidate: string, attempt: number) => Promise<ReverseIsometricValidationReport>;
  onPhase?: (event: { phase: 'generate' | 'validate'; attempt: number; candidate?: string }) => void;
}): Promise<{ passed: boolean; candidate: string; report: ReverseIsometricValidationReport | null; prompt: string; attempts: number }>;
