export interface FloorplanPoint { 0: number; 1: number }
export interface FloorplanBounds { x: number; y: number; width: number; height: number }
export interface FloorplanArchitecture {
  units: 'mm'; bounds: FloorplanBounds; walls: Array<{ id: string; polyline: number[][]; thickness: number; locked: true; layer?: string }>;
  columns: Array<{ id: string; shape: 'rect' | 'circle'; x: number; y: number; width: number; height: number; locked: true }>;
  openings: Array<{ id: string; type: 'entrance' | 'exit'; position: number[]; width: number; locked: true; confidence?: number; needsConfirmation?: boolean }>;
  rooms: unknown[]; annotations: Array<{ id: string; type: string; position: number[]; text: string }>;
  confidence: number; needsConfirmation: string[]; sourceType: 'dxf' | 'image'; architectureVersion: string;
}
export interface FloorplanFacility { type: string; quantity: number; size: number[]; clearance: number; priority?: number }
export interface FloorplanRequirement { projectType: string; capacity: number; zones: Array<{ name: string; areaRatio?: number; priority?: number }>; facilities: FloorplanFacility[]; style: { keywords?: string[]; materials?: string[] }; routePreference?: string }
export interface FloorplanLayoutItem { id: string; type: string; x: number; y: number; width: number; depth: number; rotation: number; zone: string; clearance: number; priority?: number }
export interface FloorplanMetrics { mainRouteLength: number; minimumPathWidth: number; revisitRate: number; exhibitCoverage: number; congestionPoints: number; deadEnds: number; crossings: number; exitVisibility: number; areaUtilization: number }
export interface FloorplanValidation { status: 'passed' | 'warning' | 'error'; errors: string[]; warnings: string[]; conflicts: string[]; metrics: FloorplanMetrics }
export interface FloorplanCandidate { id: string; name: string; strategy: string; layoutVersion: string; items: FloorplanLayoutItem[]; score: number; validation: FloorplanValidation; confirmed?: boolean }
export interface FloorplanRender { provider: string; imageUrl: string; layoutVersion: string; promptVersion: string; stale?: boolean }

