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
  setConfig: (config?: Partial<ExhibitionCompactFormConfig> | null) => void;
  isEligibleNodeType: (nodeType?: string | null) => boolean;
  isNodeActive: (nodeId?: string | null) => boolean;
  toggleNode: (nodeId: string) => void;
  setNodeActive: (nodeId: string, active: boolean) => void;
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
