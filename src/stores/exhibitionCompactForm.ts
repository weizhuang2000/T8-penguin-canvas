import { create } from 'zustand';
import {
  defaultExhibitionCompactForm,
  EXHIBITION_COMPACT_FORM_DEFINITIONS,
  EXHIBITION_COMPACT_NODE_TYPES,
  getExhibitionCompactSectionItems,
  normalizeExhibitionCompactFormConfig,
  type ExhibitionCompactFormConfig,
} from '../config/exhibitionCompactForm';

interface ExhibitionCompactFormState {
  config: ExhibitionCompactFormConfig;
  activeNodeIds: string[];
  editingNodeId: string | null;
  editingNodeType: string | null;
  setConfig: (config?: Partial<ExhibitionCompactFormConfig> | null) => void;
  isEligibleNodeType: (nodeType?: string | null) => boolean;
  isNodeActive: (nodeId?: string | null) => boolean;
  toggleNode: (nodeId: string) => void;
  setNodeActive: (nodeId: string, active: boolean) => void;
  setEditingNode: (nodeId?: string | null, nodeType?: string | null) => void;
  clearEditingNode: () => void;
  getHiddenKeys: (nodeType?: string | null) => string[];
  setHiddenKeys: (nodeType: string, keys: string[]) => ExhibitionCompactFormConfig;
  toggleHiddenKey: (nodeType: string, key: string) => ExhibitionCompactFormConfig;
  getAllowedSections: (nodeType?: string | null) => string[];
  getAllowedItems: (nodeType?: string | null, sectionId?: string | null) => string[];
}

const DEFAULT_CONFIG = defaultExhibitionCompactForm();
const DEFAULT_SECTIONS_BY_NODE_TYPE = new Map(
  EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => [
    definition.nodeType,
    definition.sections.map((section) => section.id),
  ]),
);
const DEFAULT_ITEMS_BY_NODE_TYPE = new Map(
  EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => [
    definition.nodeType,
    new Map(definition.sections.map((section) => [
      section.id,
      getExhibitionCompactSectionItems(section).map((item) => item.id),
    ])),
  ]),
);

export const useExhibitionCompactFormStore = create<ExhibitionCompactFormState>((set, get) => ({
  config: DEFAULT_CONFIG,
  activeNodeIds: [],
  editingNodeId: null,
  editingNodeType: null,
  setConfig: (config) => set({ config: normalizeExhibitionCompactFormConfig(config) }),
  isEligibleNodeType: (nodeType) => EXHIBITION_COMPACT_NODE_TYPES.has(String(nodeType || '')),
  isNodeActive: (nodeId) => get().activeNodeIds.includes(String(nodeId || '')),
  toggleNode: (nodeId) => set((state) => {
    const id = String(nodeId || '');
    if (!id) return state;
    const active = state.activeNodeIds.includes(id);
    return {
      activeNodeIds: active
        ? state.activeNodeIds.filter((item) => item !== id)
        : [...state.activeNodeIds, id],
    };
  }),
  setNodeActive: (nodeId, active) => set((state) => {
    const id = String(nodeId || '');
    if (!id) return state;
    const exists = state.activeNodeIds.includes(id);
    if (active === exists) return state;
    return {
      activeNodeIds: active
        ? [...state.activeNodeIds, id]
        : state.activeNodeIds.filter((item) => item !== id),
    };
  }),
  setEditingNode: (nodeId, nodeType) => set(() => {
    const id = String(nodeId || '');
    const type = String(nodeType || '');
    if (!id || !EXHIBITION_COMPACT_NODE_TYPES.has(type)) return { editingNodeId: null, editingNodeType: null };
    return { editingNodeId: id, editingNodeType: type };
  }),
  clearEditingNode: () => set({ editingNodeId: null, editingNodeType: null }),
  getHiddenKeys: (nodeType) => {
    const type = String(nodeType || '');
    return get().config.hiddenKeysByNodeType[type] || [];
  },
  setHiddenKeys: (nodeType, keys) => {
    const type = String(nodeType || '');
    const normalized = normalizeExhibitionCompactFormConfig({
      ...get().config,
      hiddenKeysByNodeType: {
        ...get().config.hiddenKeysByNodeType,
        [type]: keys,
      },
    });
    set({ config: normalized });
    return normalized;
  },
  toggleHiddenKey: (nodeType, key) => {
    const type = String(nodeType || '');
    const id = String(key || '').trim();
    const current = new Set(get().config.hiddenKeysByNodeType[type] || []);
    if (current.has(id)) current.delete(id);
    else if (id) current.add(id);
    return get().setHiddenKeys(type, Array.from(current));
  },
  getAllowedSections: (nodeType) => {
    const type = String(nodeType || '');
    const configured = get().config.sectionsByNodeType[type];
    if (Array.isArray(configured)) return configured;
    return DEFAULT_SECTIONS_BY_NODE_TYPE.get(type) || [];
  },
  getAllowedItems: (nodeType, sectionId) => {
    const type = String(nodeType || '');
    const section = String(sectionId || '');
    const configured = get().config.itemsByNodeType[type]?.[section];
    if (Array.isArray(configured)) return configured;
    return DEFAULT_ITEMS_BY_NODE_TYPE.get(type)?.get(section) || [];
  },
}));
