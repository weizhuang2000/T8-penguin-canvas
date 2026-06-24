/**
 * T8-penguin-canvas 后端 API 封装
 * 所有请求走 Vite proxy → http://127.0.0.1:18766
 */
import type {
  AdvancedProviderConfig,
  ApiSettings,
  CanvasData,
  CanvasListItem,
  CanvasShareEntry,
  CloudUploadSummary,
  CloudUploadTargetConfig,
} from '../types/canvas';
import type { ThemeTemplate } from '../theme/types';
import type { MediaKind } from '../utils/mediaCollection';

const BASE = '/api';
export const MAX_DOCUMENT_FILE_SIZE_MB = 100;
export const MAX_DOCUMENT_FILE_SIZE = MAX_DOCUMENT_FILE_SIZE_MB * 1024 * 1024;

export type TaskCompletionSoundSettings = NonNullable<ApiSettings['taskCompletionSound']>;

export async function getTaskCompletionSoundSettings(): Promise<TaskCompletionSoundSettings> {
  const res = await request<{ success: boolean; data: TaskCompletionSoundSettings }>(BASE + '/settings/task-completion-sound');
  if (!res.success) throw new Error('???????????');
  return res.data;
}

export async function uploadTaskCompletionSound(file: File): Promise<TaskCompletionSoundSettings> {
  const form = new FormData();
  form.append('audio', file, file.name);
  const res = await fetch(BASE + '/settings/task-completion-sound', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data?.error || `HTTP ${res.status}`);
  return data.data;
}

export async function resetTaskCompletionSound(): Promise<TaskCompletionSoundSettings> {
  const res = await request<{ success: boolean; data: TaskCompletionSoundSettings }>(BASE + '/settings/task-completion-sound', { method: 'DELETE' });
  if (!res.success) throw new Error('?????????');
  return res.data;
}
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  name: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  position: string;
  permissions?: ResolvedToolPermissions;
}

export interface ToolPermissionRule {
  mode: 'inherit' | 'custom';
  allowedNodeTypes: string[];
  deniedNodeTypes: string[];
}

export interface ResolvedToolPermissions {
  isAdmin: boolean;
  visibleNodeTypes: string[];
  allowedNodeTypes: string[];
}

export interface ToolPermissionsConfig {
  schema: string;
  version: number;
  updatedAt: string;
  defaultVisibleNodeTypes: string[];
  roleRules: Record<string, ToolPermissionRule>;
  userRules: Record<string, ToolPermissionRule>;
  allNodeTypes?: string[];
  users?: AuthUser[];
}

const canvasDataCache = new Map<string, CanvasData>();
const pendingCanvasDataRequests = new Map<string, Promise<CanvasData>>();

function cloneCanvasData(data: CanvasData): CanvasData {
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
}

function writeCanvasDataCache(id: string, data: CanvasData) {
  const previous = canvasDataCache.get(id);
  canvasDataCache.set(id, cloneCanvasData({
    ...(previous || {}),
    ...data,
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    edges: Array.isArray(data.edges) ? data.edges : [],
    viewport: data.viewport || previous?.viewport || { x: 0, y: 0, zoom: 1 },
  }));
}

export function primeCanvasDataCache(id: string, data: CanvasData): void {
  writeCanvasDataCache(id, data);
}

export function getCachedCanvasData(id: string): CanvasData | null {
  const cached = canvasDataCache.get(id);
  return cached ? cloneCanvasData(cached) : null;
}

export function invalidateCanvasDataCache(id: string): void {
  canvasDataCache.delete(id);
  pendingCanvasDataRequests.delete(id);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch (error: any) {
    const message = error?.message || String(error || 'network error');
    throw new Error(`本地后端服务不可用，请确认后端已启动：${message}`);
  }
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    let text = '';
    try {
      text = await res.text();
    } catch {
      /* ignore */
    }
    if (text.trim()) {
      try {
        const data = JSON.parse(text);
        errMsg = data.error || data.message || errMsg;
      } catch {
        errMsg = text.trim().slice(0, 500);
      }
    }
    if (res.status === 502 && errMsg === `HTTP ${res.status}` && url.startsWith(BASE)) {
      errMsg = '本地后端服务不可用，请确认已启动 npm run dev:backend 或 npm run dev';
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export async function login(payload: { username: string; password: string }): Promise<{ user: AuthUser; token: string }> {
  const res = await request<{ success: boolean; data: { user: AuthUser; token: string } }>(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function ssoLogin(token: string): Promise<{ user: AuthUser; token: string }> {
  const res = await request<{ success: boolean; data: { user: AuthUser; token: string } }>(`${BASE}/auth/sso`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  return res.data;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await request<{ success: boolean; data: AuthUser }>(`${BASE}/auth/me`);
    return res.data;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await request(`${BASE}/auth/logout`, { method: 'POST' });
}

export async function searchUsers(q = ''): Promise<AuthUser[]> {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set('q', q.trim());
  const res = await request<{ success: boolean; data: AuthUser[] }>(
    `${BASE}/auth/users${sp.toString() ? `?${sp.toString()}` : ''}`
  );
  return res.data || [];
}

export async function getToolPermissions(q = ''): Promise<ToolPermissionsConfig> {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set('q', q.trim());
  const res = await request<{ success: boolean; data: ToolPermissionsConfig }>(
    `${BASE}/admin/tool-permissions${sp.toString() ? `?${sp.toString()}` : ''}`
  );
  return res.data;
}

export async function updateToolPermissions(payload: Partial<ToolPermissionsConfig>): Promise<ToolPermissionsConfig> {
  const res = await request<{ success: boolean; data: ToolPermissionsConfig }>(`${BASE}/admin/tool-permissions`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return res.data;
}

// ========== 状态 ==========
export async function checkBackendStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/status`);
    return res.ok;
  } catch {
    return false;
  }
}

export interface ExtractedDocument {
  name: string;
  kind: 'docx' | 'pdf' | 'txt';
  mime: string;
  size: number;
  text: string;
  charCount: number;
  pageCount?: number;
  images?: Array<{
    filename: string;
    url: string;
    name: string;
    size: number;
    mime: string;
    index: number;
  }>;
  warnings: string[];
}

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${BASE}/documents/extract`, { method: 'POST', body });
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error || `HTTP ${res.status}`);
  }
  return payload.data;
}

// ========== 画布列表 ==========
export async function listCanvases(): Promise<CanvasListItem[]> {
  const res = await request<{ success: boolean; data: CanvasListItem[] }>(`${BASE}/canvas`);
  return res.data || [];
}

export async function createCanvas(name?: string): Promise<CanvasListItem> {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const res = await request<{ success: boolean; data: CanvasListItem }>(`${BASE}/canvas`, {
    method: 'POST',
    body: JSON.stringify(trimmedName ? { name: trimmedName } : {}),
  });
  return res.data;
}

export async function getCanvasData(id: string, options?: { force?: boolean }): Promise<CanvasData> {
  if (!options?.force) {
    const cached = getCachedCanvasData(id);
    if (cached) return cached;
    const pending = pendingCanvasDataRequests.get(id);
    if (pending) return pending.then(cloneCanvasData);
  }
  const pending = request<{ success: boolean; data: CanvasData }>(`${BASE}/canvas/${id}`)
    .then((res) => {
      writeCanvasDataCache(id, res.data);
      return getCachedCanvasData(id) || res.data;
    })
    .finally(() => {
      if (pendingCanvasDataRequests.get(id) === pending) {
        pendingCanvasDataRequests.delete(id);
      }
    });
  pendingCanvasDataRequests.set(id, pending);
  return pending.then(cloneCanvasData);
}

export async function saveCanvasData(id: string, data: CanvasData, options?: { allowEmpty?: boolean }): Promise<void> {
  const query = options?.allowEmpty ? '?allowEmpty=1' : '';
  await request(`${BASE}/canvas/${id}${query}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  writeCanvasDataCache(id, data);
}

export async function patchCanvasNodeData(
  canvasId: string,
  nodeId: string,
  patch: Record<string, any>,
): Promise<CanvasData> {
  const res = await request<{ success: boolean; data: CanvasData }>(
    `${BASE}/canvas/${encodeURIComponent(canvasId)}/nodes/${encodeURIComponent(nodeId)}/patch-data`,
    {
      method: 'PATCH',
      body: JSON.stringify({ patch }),
    },
  );
  writeCanvasDataCache(canvasId, res.data);
  return res.data;
}

export async function autoSaveCanvasData(
  id: string,
  data: CanvasData,
): Promise<{ path?: string; nodeCount?: number; edgeCount?: number }> {
  const res = await request<{
    success: boolean;
    data: { path?: string; nodeCount?: number; edgeCount?: number };
  }>(`${BASE}/canvas/${id}/auto-save`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.data || {};
}

export async function deleteCanvas(id: string): Promise<void> {
  await request(`${BASE}/canvas/${id}`, { method: 'DELETE' });
  invalidateCanvasDataCache(id);
}

export async function renameCanvas(id: string, name: string): Promise<CanvasListItem> {
  const res = await request<{ success: boolean; data: CanvasListItem }>(
    `${BASE}/canvas/${id}/name`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }
  );
  return res.data;
}

export async function getCanvasShares(id: string): Promise<CanvasShareEntry[]> {
  const res = await request<{ success: boolean; data: CanvasShareEntry[] }>(`${BASE}/canvas/${id}/shares`);
  return res.data || [];
}

export async function updateCanvasShares(
  id: string,
  sharedWith: Array<Pick<CanvasShareEntry, 'userId' | 'permission'> & Partial<CanvasShareEntry>>,
): Promise<CanvasShareEntry[]> {
  const res = await request<{ success: boolean; data: CanvasShareEntry[] }>(`${BASE}/canvas/${id}/shares`, {
    method: 'PUT',
    body: JSON.stringify({ sharedWith }),
  });
  return res.data || [];
}

// ========== 设置(三套通用 Key + 分类 Key) ==========
export type ExhibitionPromptDimension =
  | 'spaceType'
  | 'functionalZones'
  | 'exhibitionCraft'
  | 'colorSystem'
  | 'lightingStrategy'
  | 'materialExpression'
  | 'viewComposition'
  | 'styleReference'
  | 'negativeItems';

export interface ExhibitionPromptLibraryItem {
  id: string;
  scope: 'team' | 'personal';
  ownerUserId: string;
  ownerName: string;
  dimension: ExhibitionPromptDimension;
  label: string;
  text: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExhibitionPromptPresetItem {
  id: string;
  label: string;
  text: string;
  order: number;
}

export type ExhibitionPromptPresetMap = Partial<Record<ExhibitionPromptDimension, ExhibitionPromptPresetItem[]>>;

export interface ElevationColorMaterialPresetItem {
  id: string;
  category: string;
  label: string;
  core?: string;
  features?: string;
  usage?: string;
  info: string;
  order: number;
}

export interface ElevationCraftPresetItem {
  id: string;
  label: string;
  prompt: string;
  order: number;
}

export interface ElevationPromptPresetMap {
  colorMaterial: ElevationColorMaterialPresetItem[];
  crafts: ElevationCraftPresetItem[];
}

export interface ExhibitionCreativeInsertPresetItem {
  id: string;
  label: string;
  order: number;
}

export interface ExhibitionCreativeExcludePresetItem {
  id: string;
  label: string;
  order: number;
}

export interface ExhibitionCreativeViewAnglePresetItem {
  id: string;
  label: string;
  order: number;
}

export interface ExhibitionCreativePromptPresetMap {
  inserts: ExhibitionCreativeInsertPresetItem[];
  exclusions: ExhibitionCreativeExcludePresetItem[];
  viewAngles: ExhibitionCreativeViewAnglePresetItem[];
}

export interface ExhibitionImg2ImgExcludePresetItem {
  id: string;
  label: string;
  order: number;
}

export interface ExhibitionImg2ImgPromptPresetMap {
  exclusions: ExhibitionImg2ImgExcludePresetItem[];
}

export interface ExhibitionPlanLayoutInsertPresetItem {
  id: string;
  label: string;
  order: number;
}

export interface ExhibitionPlanLayoutExcludePresetItem {
  id: string;
  label: string;
  order: number;
}

export interface ExhibitionPlanLayoutPromptPresetMap {
  inserts: ExhibitionPlanLayoutInsertPresetItem[];
  exclusions: ExhibitionPlanLayoutExcludePresetItem[];
}

export interface ExhibitionRecolorPalettePresetItem {
  id: string;
  label: string;
  category: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  description: string;
  order: number;
}

export interface ExhibitionRecolorExcludePresetItem {
  id: string;
  label: string;
  order: number;
}

export interface ExhibitionRecolorSurfacePresetItem {
  id: string;
  label: string;
  prompt: string;
  order: number;
}

export interface ExhibitionRecolorPromptPresetMap {
  palettes: ExhibitionRecolorPalettePresetItem[];
  exclusions: ExhibitionRecolorExcludePresetItem[];
  floors: ExhibitionRecolorSurfacePresetItem[];
  ceilings: ExhibitionRecolorSurfacePresetItem[];
}

export interface UnitPanelMaterialItem {
  id: string;
  category: string;
  label: string;
  description: string;
  texture: string;
  usage: string;
  order: number;
}

export async function listExhibitionPromptLibrary(options?: {
  dimension?: ExhibitionPromptDimension;
  includePersonal?: boolean;
}): Promise<ExhibitionPromptLibraryItem[]> {
  const sp = new URLSearchParams();
  if (options?.dimension) sp.set('dimension', options.dimension);
  if (options?.includePersonal) sp.set('includePersonal', '1');
  const res = await request<{ success: boolean; data: ExhibitionPromptLibraryItem[] }>(
    `${BASE}/prompt-library/exhibition${sp.toString() ? `?${sp.toString()}` : ''}`,
  );
  return res.data || [];
}

export async function createExhibitionPromptLibraryItem(
  item: Pick<ExhibitionPromptLibraryItem, 'scope' | 'dimension' | 'label' | 'text'> & Partial<Pick<ExhibitionPromptLibraryItem, 'order'>>,
): Promise<ExhibitionPromptLibraryItem> {
  const res = await request<{ success: boolean; data: ExhibitionPromptLibraryItem }>(`${BASE}/prompt-library/exhibition`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  return res.data;
}

export async function updateExhibitionPromptLibraryItem(
  id: string,
  patch: Partial<Pick<ExhibitionPromptLibraryItem, 'scope' | 'dimension' | 'label' | 'text' | 'order'>>,
): Promise<ExhibitionPromptLibraryItem> {
  const res = await request<{ success: boolean; data: ExhibitionPromptLibraryItem }>(`${BASE}/prompt-library/exhibition/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deleteExhibitionPromptLibraryItem(id: string): Promise<void> {
  await request(`${BASE}/prompt-library/exhibition/${id}`, { method: 'DELETE' });
}

export async function getExhibitionPromptPresets(): Promise<ExhibitionPromptPresetMap> {
  const res = await request<{ success: boolean; data: ExhibitionPromptPresetMap }>(`${BASE}/prompt-library/exhibition/presets`);
  return res.data || {};
}

export async function updateExhibitionPromptPresets(
  dimension: ExhibitionPromptDimension,
  presets: Array<Pick<ExhibitionPromptPresetItem, 'label' | 'text'> & Partial<Pick<ExhibitionPromptPresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionPromptPresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionPromptPresetItem[] }>(
    `${BASE}/prompt-library/exhibition/presets/${dimension}`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function getElevationPromptPresets(): Promise<ElevationPromptPresetMap> {
  const res = await request<{ success: boolean; data: ElevationPromptPresetMap }>(`${BASE}/prompt-library/elevation/presets`);
  return res.data || { colorMaterial: [], crafts: [] };
}

export async function updateElevationColorMaterialPresets(
  presets: Array<Pick<ElevationColorMaterialPresetItem, 'label'> & Partial<Pick<ElevationColorMaterialPresetItem, 'id' | 'category' | 'core' | 'features' | 'usage' | 'info' | 'order'>>>,
): Promise<ElevationColorMaterialPresetItem[]> {
  const res = await request<{ success: boolean; data: ElevationColorMaterialPresetItem[] }>(
    `${BASE}/prompt-library/elevation/presets/colorMaterial`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function updateElevationCraftPresets(
  presets: Array<Pick<ElevationCraftPresetItem, 'label' | 'prompt'> & Partial<Pick<ElevationCraftPresetItem, 'id' | 'order'>>>,
): Promise<ElevationCraftPresetItem[]> {
  const res = await request<{ success: boolean; data: ElevationCraftPresetItem[] }>(
    `${BASE}/prompt-library/elevation/presets/crafts`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function getExhibitionCreativePromptPresets(): Promise<ExhibitionCreativePromptPresetMap> {
  const res = await request<{ success: boolean; data: ExhibitionCreativePromptPresetMap }>(
    `${BASE}/prompt-library/exhibition-creative/presets`,
  );
  return res.data || { inserts: [], exclusions: [], viewAngles: [] };
}

export async function updateExhibitionCreativeInsertPresets(
  presets: Array<Pick<ExhibitionCreativeInsertPresetItem, 'label'> & Partial<Pick<ExhibitionCreativeInsertPresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionCreativeInsertPresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionCreativeInsertPresetItem[] }>(
    `${BASE}/prompt-library/exhibition-creative/presets/inserts`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function updateExhibitionCreativeExcludePresets(
  presets: Array<Pick<ExhibitionCreativeExcludePresetItem, 'label'> & Partial<Pick<ExhibitionCreativeExcludePresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionCreativeExcludePresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionCreativeExcludePresetItem[] }>(
    `${BASE}/prompt-library/exhibition-creative/presets/exclusions`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function updateExhibitionCreativeViewAnglePresets(
  presets: Array<Pick<ExhibitionCreativeViewAnglePresetItem, 'label'> & Partial<Pick<ExhibitionCreativeViewAnglePresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionCreativeViewAnglePresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionCreativeViewAnglePresetItem[] }>(
    `${BASE}/prompt-library/exhibition-creative/presets/view-angles`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function getExhibitionImg2ImgPromptPresets(): Promise<ExhibitionImg2ImgPromptPresetMap> {
  const res = await request<{ success: boolean; data: ExhibitionImg2ImgPromptPresetMap }>(
    `${BASE}/prompt-library/exhibition-img2img/presets`,
  );
  return res.data || { exclusions: [] };
}

export async function updateExhibitionImg2ImgExcludePresets(
  presets: Array<Pick<ExhibitionImg2ImgExcludePresetItem, 'label'> & Partial<Pick<ExhibitionImg2ImgExcludePresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionImg2ImgExcludePresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionImg2ImgExcludePresetItem[] }>(
    `${BASE}/prompt-library/exhibition-img2img/presets/exclusions`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function getExhibitionPlanLayoutPromptPresets(): Promise<ExhibitionPlanLayoutPromptPresetMap> {
  const res = await request<{ success: boolean; data: ExhibitionPlanLayoutPromptPresetMap }>(
    `${BASE}/prompt-library/exhibition-plan-layout/presets`,
  );
  return res.data || { inserts: [], exclusions: [] };
}

export async function updateExhibitionPlanLayoutInsertPresets(
  presets: Array<Pick<ExhibitionPlanLayoutInsertPresetItem, 'label'> & Partial<Pick<ExhibitionPlanLayoutInsertPresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionPlanLayoutInsertPresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionPlanLayoutInsertPresetItem[] }>(
    `${BASE}/prompt-library/exhibition-plan-layout/presets/inserts`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function updateExhibitionPlanLayoutExcludePresets(
  presets: Array<Pick<ExhibitionPlanLayoutExcludePresetItem, 'label'> & Partial<Pick<ExhibitionPlanLayoutExcludePresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionPlanLayoutExcludePresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionPlanLayoutExcludePresetItem[] }>(
    `${BASE}/prompt-library/exhibition-plan-layout/presets/exclusions`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function getExhibitionRecolorPromptPresets(): Promise<ExhibitionRecolorPromptPresetMap> {
  const res = await request<{ success: boolean; data: ExhibitionRecolorPromptPresetMap }>(
    `${BASE}/prompt-library/exhibition-recolor/presets`,
  );
  return res.data || { palettes: [], exclusions: [], floors: [], ceilings: [] };
}

export async function updateExhibitionRecolorPalettePresets(
  presets: Array<Pick<ExhibitionRecolorPalettePresetItem, 'label' | 'primaryColor' | 'secondaryColor' | 'accentColor'> & Partial<Pick<ExhibitionRecolorPalettePresetItem, 'id' | 'category' | 'description' | 'order'>>>,
): Promise<ExhibitionRecolorPalettePresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionRecolorPalettePresetItem[] }>(
    `${BASE}/prompt-library/exhibition-recolor/presets/palettes`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function updateExhibitionRecolorExcludePresets(
  presets: Array<Pick<ExhibitionRecolorExcludePresetItem, 'label'> & Partial<Pick<ExhibitionRecolorExcludePresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionRecolorExcludePresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionRecolorExcludePresetItem[] }>(
    `${BASE}/prompt-library/exhibition-recolor/presets/exclusions`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function updateExhibitionRecolorFloorPresets(
  presets: Array<Pick<ExhibitionRecolorSurfacePresetItem, 'label' | 'prompt'> & Partial<Pick<ExhibitionRecolorSurfacePresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionRecolorSurfacePresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionRecolorSurfacePresetItem[] }>(
    `${BASE}/prompt-library/exhibition-recolor/presets/floors`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function updateExhibitionRecolorCeilingPresets(
  presets: Array<Pick<ExhibitionRecolorSurfacePresetItem, 'label' | 'prompt'> & Partial<Pick<ExhibitionRecolorSurfacePresetItem, 'id' | 'order'>>>,
): Promise<ExhibitionRecolorSurfacePresetItem[]> {
  const res = await request<{ success: boolean; data: ExhibitionRecolorSurfacePresetItem[] }>(
    `${BASE}/prompt-library/exhibition-recolor/presets/ceilings`,
    {
      method: 'PUT',
      body: JSON.stringify({ presets }),
    },
  );
  return res.data || [];
}

export async function getUnitPanelMaterials(): Promise<UnitPanelMaterialItem[]> {
  const res = await request<{ success: boolean; data: UnitPanelMaterialItem[] }>(
    `${BASE}/prompt-library/unit-panel/materials`,
  );
  return res.data || [];
}

export async function updateUnitPanelMaterials(
  materials: Array<Pick<UnitPanelMaterialItem, 'label'> & Partial<Pick<UnitPanelMaterialItem, 'id' | 'category' | 'description' | 'texture' | 'usage' | 'order'>>>,
): Promise<UnitPanelMaterialItem[]> {
  const res = await request<{ success: boolean; data: UnitPanelMaterialItem[] }>(
    `${BASE}/prompt-library/unit-panel/materials`,
    {
      method: 'PUT',
      body: JSON.stringify({ materials }),
    },
  );
  return res.data || [];
}

export async function getSettings(): Promise<ApiSettings> {
  const res = await request<{ success: boolean; data: ApiSettings }>(`${BASE}/settings`);
  return res.data;
}

// 获取明文 Key（仅用于设置弹窗内眼睛预览，不脱敏）
export async function getRawSettings(): Promise<ApiSettings> {
  const res = await request<{ success: boolean; data: ApiSettings }>(`${BASE}/settings/raw`);
  return res.data;
}

export async function updateSettings(patch: Partial<ApiSettings>): Promise<void> {
  await request(`${BASE}/settings`, {
    method: 'POST',
    body: JSON.stringify(patch),
  });
}

export interface AdvancedProviderTestResult {
  ok: boolean;
  code: string;
  providerId: string;
  protocol: string;
  message?: string;
  error?: string;
  provider?: AdvancedProviderConfig;
}

export async function testAdvancedProvider(payload: {
  providerId?: string;
  provider?: AdvancedProviderConfig;
  dryRun?: boolean;
}): Promise<AdvancedProviderTestResult> {
  const res = await request<{
    success: boolean;
    code?: string;
    error?: string;
    data?: AdvancedProviderTestResult;
  }>(`${BASE}/proxy/external/test-provider`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.success && res.data) return res.data;
  if (!res.success) {
    return {
      ok: false,
      code: res.code || 'provider_test_failed',
      providerId: payload.providerId || payload.provider?.id || '',
      protocol: payload.provider?.protocol || '',
      error: res.error || '测试失败',
    };
  }
  return res.data || {
    ok: false,
    code: 'empty_response',
    providerId: payload.providerId || payload.provider?.id || '',
    protocol: payload.provider?.protocol || '',
    error: '测试接口没有返回结果',
  };
}

// ========== 文件自动保存到本地路径 (v1.2.10.2) ==========
// 静默失败(后端不可用/路径不存在/写入床夫败等) —— 仅返回布尔, 不抛
// 以免阐业务外主生成链路(OutputNode 只负责 "心愿尝试保存")。
export async function saveAssetToDisk(
  url: string,
  filename?: string,
): Promise<{ ok: boolean; path?: string; exist?: boolean; error?: string }> {
  try {
    if (!url) return { ok: false, error: 'empty url' };
    const res = await fetch(`${BASE}/files/save-to-disk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, filename }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    return { ok: true, path: json?.data?.path, exist: !!json?.data?.exist };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export interface DuckDecodeFileItem {
  sourceUrl: string;
  decoded: boolean;
  url?: string;
  filename?: string;
  size?: number;
  kind?: MediaKind;
  mime?: string;
  originalExt?: string;
  ext?: string;
  isDuck?: boolean;
  passwordProtected?: boolean;
  reason?: string;
}

export async function decodeDuckFiles(
  urls: string[],
): Promise<{ items: DuckDecodeFileItem[]; decodedCount: number }> {
  const res = await request<{
    success: boolean;
    data: { items: DuckDecodeFileItem[]; decodedCount: number };
  }>(`${BASE}/files/duck-decode`, {
    method: 'POST',
    body: JSON.stringify({ urls }),
  });
  return res.data || { items: [], decodedCount: 0 };
}

export interface CamOutputProject {
  name: string;
  imageCount: number;
  mtime: number;
}

export interface CamOutputImage {
  filename: string;
  url: string;
  size: number;
  mtime: number;
}

const CAM_OUTPUT_ROUTE_MISSING_MESSAGE = '项目白模后端接口未加载：请把最新 backend 部署到服务器并重启 PM2/后端服务，让 /api/files/cam-output/projects 生效。';

async function requestCamOutput<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    if (res.status === 404) throw new Error(CAM_OUTPUT_ROUTE_MISSING_MESSAGE);
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }
  if (data?.success === false) {
    throw new Error(data?.error || data?.message || '读取项目白模失败');
  }
  return data;
}

export async function listCamOutputProjects(): Promise<{ root: string; projects: CamOutputProject[] }> {
  const res = await requestCamOutput<{
    success: boolean;
    data: { root: string; projects: CamOutputProject[] };
  }>(`${BASE}/files/cam-output/projects`);
  return res.data || { root: '', projects: [] };
}

export async function listCamOutputProjectImages(project: string): Promise<{
  project: string;
  folder: string;
  images: CamOutputImage[];
}> {
  const res = await requestCamOutput<{
    success: boolean;
    data: { project: string; folder: string; images: CamOutputImage[] };
  }>(`${BASE}/files/cam-output/projects/${encodeURIComponent(project)}/images`);
  return res.data || { project, folder: '', images: [] };
}

// ========== RH 工具节点 (v1.2.10+) ==========
//   与顶层控件区分：仅供 RHToolsNode 使用，与 RH 应用创意包数据完全分开。
//   后端走 T8 自己的 18766 服务。

export interface RHToolCategory {
  id: string;
  name: string;
  order: number;
  createdAt: number;
}

export interface RHTool {
  id: string;
  webappId: string;
  title: string;
  description: string;
  categoryId: string;
  coverUrl: string;
  order: number;
  addedAt: number;
}

export interface RHToolsBackup {
  schema?: 't8-rh-tools' | string;
  version?: number;
  exportedAt?: string;
  categories: RHToolCategory[];
  tools: RHTool[];
}

export interface AddRHToolPayload {
  webappId: string;
  title: string;
  description?: string;
  categoryId?: string;
  coverUrl?: string;
}

export type OkData<T> = { success: true; data: T };
export type ErrData = { success: false; error: string };
export type Result<T> = OkData<T> | ErrData;

async function safeRequest<T>(url: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: json.error || `HTTP ${res.status}` };
    if (json && typeof json === 'object' && 'success' in json) return json as Result<T>;
    return { success: true, data: json as T };
  } catch (e: any) {
    return { success: false, error: e?.message || '网络错误' };
  }
}

// ----- 分类 -----
export function getRHToolCategories() {
  return safeRequest<RHToolCategory[]>(`${BASE}/settings/rh-tool-categories`);
}
export function addRHToolCategory(name: string) {
  return safeRequest<RHToolCategory>(`${BASE}/settings/rh-tool-categories`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}
export function renameRHToolCategory(id: string, name: string) {
  return safeRequest<RHToolCategory>(`${BASE}/settings/rh-tool-categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}
export function deleteRHToolCategory(id: string) {
  return safeRequest<void>(`${BASE}/settings/rh-tool-categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
export function reorderRHToolCategories(ids: string[]) {
  return safeRequest<RHToolCategory[]>(`${BASE}/settings/rh-tool-categories/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

// ----- 应用 -----
export function getRHTools() {
  return safeRequest<RHTool[]>(`${BASE}/settings/rh-tool-apps`);
}
export function addRHTool(payload: AddRHToolPayload) {
  return safeRequest<RHTool>(`${BASE}/settings/rh-tool-apps`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function updateRHTool(id: string, payload: Partial<AddRHToolPayload>) {
  return safeRequest<RHTool>(`${BASE}/settings/rh-tool-apps/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
export function deleteRHTool(id: string) {
  return safeRequest<void>(`${BASE}/settings/rh-tool-apps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
export function reorderRHTools(ids: string[]) {
  return safeRequest<RHTool[]>(`${BASE}/settings/rh-tool-apps/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}
export function getRHToolsBackup() {
  return safeRequest<RHToolsBackup>(`${BASE}/settings/rh-tools/export`);
}
export function importRHToolsBackup(payload: RHToolsBackup, mode: 'replace' | 'merge' = 'replace') {
  return safeRequest<{ categories: RHToolCategory[]; tools: RHTool[]; categoryCount: number; toolCount: number }>(
    `${BASE}/settings/rh-tools/import`,
    {
      method: 'POST',
      body: JSON.stringify({ ...payload, mode }),
    }
  );
}

// ========== 资源库 (v1.3.4) ==========
export type ResourceKind = 'image' | 'video' | 'audio' | 'panorama' | 'set' | 'pose' | 'workflow';
export type ResourceMediaKind = 'image' | 'video' | 'audio';
export type ResourceAddKind = ResourceMediaKind | 'panorama';
export type ResourceMaterialSetKind = 'text' | 'image' | 'video' | 'audio';

export interface ResourceCategory {
  id: string;
  kind: ResourceKind;
  name: string;
  order: number;
  system?: boolean;
  createdAt: number;
}

export interface ResourceItem {
  id: string;
  kind: ResourceKind;
  categoryId: string;
  title: string;
  originalName?: string;
  fileUrl: string;
  thumbUrl?: string;
  mime?: string;
  size: number;
  width?: number;
  height?: number;
  sha256?: string;
  tags: string[];
  favorite: boolean;
  sourceUrl?: string;
  sourceNodeId?: string;
  sourceCanvasId?: string;
  materialSetKind?: ResourceMaterialSetKind;
  materialSetItems?: Array<{
    id: string;
    kind: ResourceMaterialSetKind;
    url?: string;
    text?: string;
    name?: string;
    size?: number;
    mime?: string;
  }>;
  workflowNodeCount?: number;
  workflowEdgeCount?: number;
  workflowNodeTypes?: string[];
  workflowPreview?: {
    nodes: Array<{ id: string; type: string; label: string; x: number; y: number }>;
    edges: Array<{ source: string; target: string }>;
  };
  workflowFragment?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export interface AddResourceSetPayload {
  materialSetKind: ResourceMaterialSetKind;
  materialSetItems: Array<{
    id?: string;
    kind: ResourceMaterialSetKind;
    url?: string;
    text?: string;
    name?: string;
    size?: number;
    mime?: string;
  }>;
  categoryId?: string;
  title?: string;
  tags?: string[];
  sourceNodeId?: string;
  sourceCanvasId?: string;
  favorite?: boolean;
}

export interface AddResourcePayload {
  url: string;
  kind: ResourceAddKind;
  categoryId?: string;
  title?: string;
  tags?: string[];
  sourceNodeId?: string;
  sourceCanvasId?: string;
  favorite?: boolean;
}

export interface AddResourcePosePayload {
  poseBackup: Record<string, any>;
  categoryId?: string;
  title?: string;
  tags?: string[];
  sourceNodeId?: string;
  sourceCanvasId?: string;
  favorite?: boolean;
}

export interface AddResourceWorkflowPayload {
  workflowFragment: Record<string, any>;
  categoryId?: string;
  title?: string;
  tags?: string[];
  sourceNodeId?: string;
  sourceCanvasId?: string;
  favorite?: boolean;
}

export function getResourceCategories(kind?: ResourceKind) {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return safeRequest<ResourceCategory[]>(`${BASE}/resources/categories${q}`);
}

export function addResourceCategory(kind: ResourceKind, name: string) {
  return safeRequest<ResourceCategory>(`${BASE}/resources/categories`, {
    method: 'POST',
    body: JSON.stringify({ kind, name }),
  });
}

export function renameResourceCategory(id: string, name: string) {
  return safeRequest<ResourceCategory>(`${BASE}/resources/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export function deleteResourceCategory(id: string) {
  return safeRequest<{ movedTo: string }>(`${BASE}/resources/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getResourceItems(params: {
  kind?: ResourceKind;
  categoryId?: string;
  q?: string;
  favorite?: boolean;
} = {}) {
  const sp = new URLSearchParams();
  if (params.kind) sp.set('kind', params.kind);
  if (params.categoryId) sp.set('categoryId', params.categoryId);
  if (params.q) sp.set('q', params.q);
  if (params.favorite) sp.set('favorite', '1');
  const qs = sp.toString();
  return safeRequest<ResourceItem[]>(`${BASE}/resources/items${qs ? `?${qs}` : ''}`);
}

export function addResourceItem(payload: AddResourcePayload) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(`${BASE}/resources/items/add`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addResourceSet(payload: AddResourceSetPayload) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(`${BASE}/resources/sets/add`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addResourcePose(payload: AddResourcePosePayload) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(`${BASE}/resources/poses/add`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addResourceWorkflow(payload: AddResourceWorkflowPayload) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(`${BASE}/resources/workflows/add`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateResourceItem(id: string, patch: Partial<Pick<ResourceItem, 'title' | 'categoryId' | 'tags' | 'favorite'>> & { touch?: boolean }) {
  return safeRequest<ResourceItem>(`${BASE}/resources/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function deleteResourceItem(id: string) {
  return safeRequest<void>(`${BASE}/resources/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ========== 云端上传 ==========
export interface CloudUploadStatus {
  targets: CloudUploadTargetConfig[];
  summary: CloudUploadSummary;
}

export interface CloudUploadTestResult {
  ok: boolean;
  supported?: boolean;
  message?: string;
  error?: string;
  target?: CloudUploadTargetConfig;
}

export interface CloudUploadAssetResult {
  provider: string;
  targetId: string;
  label: string;
  objectKey?: string;
  path?: string;
  url?: string;
  filename?: string;
  size?: number;
  mime?: string;
  kind?: string;
  uploadedAt?: string;
}

export function getCloudUploadStatus() {
  return safeRequest<CloudUploadStatus>(`${BASE}/cloud-uploads/status`);
}

export function testCloudUploadTarget(payload: {
  targetId?: string;
  target?: CloudUploadTargetConfig;
}) {
  return safeRequest<CloudUploadTestResult>(`${BASE}/cloud-uploads/test`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function uploadCloudAsset(payload: {
  targetId: string;
  url: string;
  kind?: ResourceMediaKind | string;
  filename?: string;
  title?: string;
  sourceNodeId?: string;
  sourceCanvasId?: string;
}) {
  return safeRequest<CloudUploadAssetResult>(`${BASE}/cloud-uploads/upload`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ========== 主题成就 / 时长 ==========
export type AchievementEventType =
  | 'theme.active_tick'
  | 'theme.switched'
  | 'hidden_mode.enabled'
  | 'hidden_mode.used'
  | 'node.created'
  | 'node.run_success'
  | 'resource.saved'
  | 'workflow.saved'
  | 'panorama.generated'
  | 'parsehub.resolved'
  | 'dragon_ball.set_completed'
  | 'dragon_ball.collected'
  | 'saint_seiya.cloth_collected'
  | 'saint_seiya.battle_won'
  | 'saint_seiya.cosmo_burst'
  | 'saint_seiya.gold_completed'
  | 'tetris.game_started'
  | 'tetris.chapter_completed'
  | 'tetris.clean_chapter_completed'
  | 'tetris.line_clear'
  | 'tetris.tetris_clear'
  | 'tetris.level_reached'
  | 'tetris.game_over';

export interface AchievementEventPayload {
  type: AchievementEventType;
  theme?: string;
  amountSeconds?: number;
  nodeType?: string;
  kind?: string;
  category?: string;
  mode?: string;
}

export interface AchievementSummary {
  today: string;
  todaySeconds: number;
  totalActiveSeconds: number;
  achievementCount: number;
  unlockedCount: number;
  filmCount: number;
  unlockedFilmCount: number;
  recentUnlocks: AchievementDefinitionData[];
  recentFilms: AchievementUnlockedFilm[];
  dailyTasks?: AchievementDailyTask[];
  weeklyPassport?: AchievementWeeklyPassport;
  creativeReview?: AchievementCreativeReview;
  themeShowcases?: Record<string, AchievementThemeShowcase>;
}

export interface AchievementDefinitionData {
  id: string;
  theme: string;
  themeLabel: string;
  title: string;
  description: string;
  rarity: string;
  condition: Record<string, any>;
  medal?: boolean;
  hidden?: boolean;
}

export interface AchievementDailyTask {
  id: string;
  title: string;
  description?: string;
  progress: number;
  target: number;
  completed: boolean;
  reward?: string;
  mode?: string;
  targetKind?: string;
  theme?: string;
  accent?: string;
  themeLabel?: string;
}

export interface AchievementWeeklyPassport {
  id: string;
  title: string;
  progress: number;
  target: number;
  completed: boolean;
  completedThemeCount?: number;
  targetThemeCount?: number;
  weekStart?: string;
  weekEnd?: string;
  ratio?: number;
  themes?: Array<{
    theme: string;
    themeLabel?: string;
    shortLabel?: string;
    accent?: string;
    completed?: boolean;
    progress?: number;
    target?: number;
    weeklySeconds?: number;
    actionCount?: number;
  }>;
}

export interface AchievementThemeUsage {
  theme: string;
  themeLabel?: string;
  activeSeconds?: number;
  todaySeconds?: number;
}

export interface AchievementTopEntry {
  key: string;
  value: number;
}

export interface AchievementCreativeReview {
  id: string;
  title: string;
  progress: number;
  target: number;
  completed: boolean;
  topTheme?: AchievementThemeUsage | null;
  todayTopTheme?: AchievementThemeUsage | null;
  weeklyActiveSeconds?: number;
  weeklyThemeCount?: number;
  mostUsedNodeType?: AchievementTopEntry | null;
  recentCreativeEventCount?: number;
  hiddenModeActivations?: number;
  nodesCreated?: number;
  runsSucceeded?: number;
  resourcesSaved?: number;
  workflowsSaved?: number;
}

export interface AchievementThemeShowcase {
  id: string;
  title: string;
  description?: string;
  unlocked?: boolean;
  mediaUrl?: string;
  hasShowcase?: boolean;
  resourcesSaved?: number;
  workflowsSaved?: number;
  panoramasGenerated?: number;
  parseHubResolved?: number;
  topCategory?: string;
  lastActivityAt?: string;
}

export interface AchievementUnlocked {
  id: string;
  theme: string;
  title: string;
  rarity: string;
  unlockedAt: string;
  eventType?: string;
}

export interface AchievementUnlockedFilm {
  id: string;
  theme: string;
  title: string;
  unlockedAt: string;
  sourceAchievementId: string;
  hasMedia: boolean;
  status: 'awaiting-media' | string;
  lockedText?: string;
  unavailableText?: string;
  playedSeconds?: number;
  mediaUrl?: string;
}

export interface AchievementProfile {
  schema: 't8-achievements';
  version: number;
  profileId: string;
  createdAt: string;
  updatedAt: string;
  themeStats: Record<string, any>;
  events: Array<Record<string, any>>;
  unlockedAchievements: Record<string, AchievementUnlocked>;
  claimedMedals: Record<string, any>;
  unlockedFilms: Record<string, AchievementUnlockedFilm>;
  preferences: {
    enabled: boolean;
    showToast: boolean;
    showTopBadge: boolean;
  };
}

export interface AchievementProfileData {
  profile: AchievementProfile;
  manifest: Record<string, any>;
  definitions: AchievementDefinitionData[];
  summary: AchievementSummary;
  event?: Record<string, any>;
  ignored?: boolean;
}

export function getAchievementProfile() {
  return safeRequest<AchievementProfileData>(`${BASE}/achievements/profile`);
}

export function recordAchievementEvent(payload: AchievementEventPayload) {
  return safeRequest<AchievementProfileData>(`${BASE}/achievements/event`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAchievementPreferences(payload: Partial<AchievementProfile['preferences']>) {
  return safeRequest<AchievementProfileData>(`${BASE}/achievements/preferences`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resetAchievements() {
  return safeRequest<AchievementProfileData>(`${BASE}/achievements/reset`, { method: 'POST' });
}

export function exportAchievements() {
  return safeRequest<AchievementProfile>(`${BASE}/achievements/export`);
}

export function importAchievements(data: AchievementProfile | Record<string, any>) {
  return safeRequest<AchievementProfileData>(`${BASE}/achievements/import`, {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
}

// ========== 生成历史 ==========
export type GenerationHistoryKind = 'image' | 'video' | 'audio';

export interface GenerationHistoryProject {
  id: string;
  name: string;
  ownerUserId?: string | null;
  readonly?: boolean;
  counts: Record<GenerationHistoryKind, number> & { total: number };
  updatedAt?: number;
}

export interface GenerationHistoryItem {
  id: string;
  kind: GenerationHistoryKind;
  url: string;
  fileName: string;
  title: string;
  canvasId: string;
  sourceNodeId?: string;
  sourceNodeType?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  taskId?: string;
  seed?: number;
  createdAt: number;
  createdByUserId?: string;
  createdByUserName?: string;
  createdByUserRole?: string;
  hidden: boolean;
  favorite: boolean;
  tags: string[];
  access?: {
    canView: boolean;
    canManage: boolean;
    canDeleteFile: boolean;
  };
}

export interface GenerationHistoryUserSummary {
  userId: string;
  username: string;
  name: string;
  role: string;
  counts: Record<GenerationHistoryKind, number> & { total: number };
  lastCreatedAt: number;
}

export function getGenerationHistoryProjects() {
  return safeRequest<GenerationHistoryProject[]>(`${BASE}/generation-history/projects`);
}

export function getGenerationHistoryItems(params: {
  canvasId?: string;
  kind?: GenerationHistoryKind | 'all';
  q?: string;
  favorite?: boolean;
  includeHidden?: boolean;
  userId?: string;
  role?: string;
  provider?: string;
  model?: string;
  sourceNodeType?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const sp = new URLSearchParams();
  if (params.canvasId) sp.set('canvasId', params.canvasId);
  if (params.kind && params.kind !== 'all') sp.set('kind', params.kind);
  if (params.q) sp.set('q', params.q);
  if (params.favorite) sp.set('favorite', '1');
  if (params.includeHidden) sp.set('includeHidden', '1');
  if (params.userId) sp.set('userId', params.userId);
  if (params.role) sp.set('role', params.role);
  if (params.provider) sp.set('provider', params.provider);
  if (params.model) sp.set('model', params.model);
  if (params.sourceNodeType) sp.set('sourceNodeType', params.sourceNodeType);
  if (params.limit && params.limit > 0) sp.set('limit', String(Math.floor(params.limit)));
  if (params.offset && params.offset > 0) sp.set('offset', String(Math.floor(params.offset)));
  const qs = sp.toString();
  return safeRequest<GenerationHistoryItem[]>(`${BASE}/generation-history/items${qs ? `?${qs}` : ''}`);
}

export function getGenerationHistoryUsers() {
  return safeRequest<GenerationHistoryUserSummary[]>(`${BASE}/admin/generation-history/users`);
}

export function updateGenerationHistoryItem(
  id: string,
  patch: Partial<Pick<GenerationHistoryItem, 'title' | 'favorite' | 'hidden' | 'tags'>>,
) {
  return safeRequest<GenerationHistoryItem>(`${BASE}/generation-history/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteGenerationHistoryItem(id: string, mode: 'hide' | 'delete-file' = 'hide') {
  return safeRequest<GenerationHistoryItem>(`${BASE}/generation-history/items/${encodeURIComponent(id)}?mode=${encodeURIComponent(mode)}`, {
    method: 'DELETE',
  });
}

export function addGenerationHistoryItemToResources(id: string, payload: {
  title?: string;
  tags?: string[];
  favorite?: boolean;
  categoryId?: string;
} = {}) {
  return safeRequest<ResourceItem & { duplicate?: boolean }>(
    `${BASE}/generation-history/items/${encodeURIComponent(id)}/add-to-resources`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

// ========== Eagle 本地库 ==========
export interface EagleImportMaterial {
  id?: string;
  kind: ResourceMaterialSetKind;
  url?: string;
  text?: string;
  name?: string;
  tags?: string[];
}

export interface EagleImportResult {
  base: string;
  imported: Array<{ kind: string; name: string; result?: any }>;
  skipped: Array<{ kind: string; name: string; reason: string }>;
  failures: Array<{ kind: string; name: string; error: string }>;
}

export function sendToEagle(payload: {
  materials: EagleImportMaterial[];
  tags?: string[];
  folderId?: string;
  eagleApiBase?: string;
}) {
  return safeRequest<EagleImportResult>(`${BASE}/eagle/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ========== 主题模板 (v1.3.6) ==========

export interface ThemeTemplatesResponse {
  path: string;
  templates: ThemeTemplate[];
}

export function getThemeTemplates() {
  return safeRequest<ThemeTemplatesResponse>(`${BASE}/themes/templates`);
}

export function importThemeTemplate(template: ThemeTemplate) {
  return safeRequest<ThemeTemplate>(`${BASE}/themes/templates/import`, {
    method: 'POST',
    body: JSON.stringify({ template }),
  });
}

export function saveThemeTemplate(template: ThemeTemplate) {
  return safeRequest<ThemeTemplate>(`${BASE}/themes/templates/${encodeURIComponent(template.id)}`, {
    method: 'PUT',
    body: JSON.stringify(template),
  });
}

export function exportThemeTemplate(id: string) {
  return safeRequest<ThemeTemplate>(`${BASE}/themes/templates/${encodeURIComponent(id)}/export`);
}

export function deleteThemeTemplate(id: string) {
  return safeRequest<void>(`${BASE}/themes/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ========== 算力充值 ==========

export interface RechargeConfig {
  website_url: string;
  agent_base_url: string;
  configured: boolean;
  device_id: string;
}

export interface RechargeBinding {
  bound: boolean;
  website_user_id?: number;
  bind_time?: string;
}

export interface RechargePlan {
  id: string;
  power: number;
  price: number;
  quota: number;
  name: string;
  test?: boolean;
}

export type RechargeOrderStatus = 'pending' | 'transferring' | 'success' | 'transfer_failed';

export interface RechargeOrder {
  order_id: string;
  website_user_id: number;
  plan_id: string;
  plan_name: string;
  power: number;
  amount: number;
  quota: number;
  pay_type: 'alipay' | 'wxpay';
  status: RechargeOrderStatus;
  pay_url?: string;
  trade_no?: string;
  create_time?: string;
  pay_time?: string;
  transfer_message?: string;
}

export interface RechargeOrderCreateResponse {
  success: boolean;
  order_id: string;
  pay_url: string;
  amount: number;
  power: number;
  quota: number;
  plan_name: string;
  pay_type: 'alipay' | 'wxpay';
}

export interface RechargeOrderCheckResponse {
  success: boolean;
  status: RechargeOrderStatus;
  order_id: string;
  plan_name: string;
  amount: number;
  quota: number;
  power?: number;
  pay_url?: string;
  pay_time?: string;
  transfer_message?: string;
}

export function getRechargeConfig() {
  return request<RechargeConfig>(`${BASE}/recharge/config`);
}

export function getRechargeBinding() {
  return request<RechargeBinding>(`${BASE}/recharge/binding`);
}

export function bindRechargeUser(websiteUserId: number) {
  return request<{ success: boolean; website_user_id: number }>(`${BASE}/recharge/binding`, {
    method: 'POST',
    body: JSON.stringify({ website_user_id: websiteUserId }),
  });
}

export function unbindRechargeUser() {
  return request<{ success: boolean }>(`${BASE}/recharge/binding`, { method: 'DELETE' });
}

export function getRechargePlans() {
  return request<RechargePlan[]>(`${BASE}/recharge/plans`);
}

export function createRechargeOrder(planId: string, payType: 'alipay' | 'wxpay') {
  return request<RechargeOrderCreateResponse>(`${BASE}/recharge/order/create`, {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId, pay_type: payType }),
  });
}

export function checkRechargeOrder(orderId: string) {
  return request<RechargeOrderCheckResponse>(`${BASE}/recharge/order/${encodeURIComponent(orderId)}/check`);
}

export function retryRechargeOrder(orderId: string) {
  return request<RechargeOrderCheckResponse>(`${BASE}/recharge/order/${encodeURIComponent(orderId)}/retry`, {
    method: 'POST',
  });
}

export function getRechargeOrders(limit = 20) {
  return request<RechargeOrder[]>(`${BASE}/recharge/orders?limit=${encodeURIComponent(String(limit))}`);
}
