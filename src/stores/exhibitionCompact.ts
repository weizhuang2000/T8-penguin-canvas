/**
 * 展陈节点精简窗体状态
 *
 * - compactActiveNodes: 当前已激活精简模式的节点 ID 集合（节点内切换）
 * - exhibitionCompactForm: 管理员配置的每个展陈节点允许显示的 section 清单
 */
import { create } from 'zustand';
import { useMemo } from 'react';
import { EXHIBITION_COMPACT_NODE_TYPE_SET, defaultExhibitionCompactForm } from '../config/exhibitionCompactForm';

interface ExhibitionCompactState {
  /** 已激活精简模式的节点 ID 集合 */
  compactActiveNodes: Set<string>;
  /** 管理员配置的 section 白名单 (nodeType -> sectionId[]) */
  exhibitionCompactForm: Record<string, string[]>;
  /** 切换某个节点的精简模式 */
  toggleCompact: (nodeId: string) => void;
  /** 设置管理员配置 */
  setExhibitionCompactForm: (form: Record<string, string[]>) => void;
  /** 判断某个节点是否处于精简模式 */
  isCompactActive: (nodeId: string) => boolean;
  /** 判断某个 section 在精简模式下是否可见 */
  isSectionVisible: (nodeId: string, nodeType: string, sectionId: string) => boolean;
  /** 获取某个展陈节点类型在精简模式下允许显示的 section 集合 */
  allowedSections: (nodeType: string) => Set<string>;
}

export const useExhibitionCompactStore = create<ExhibitionCompactState>((set, get) => ({
  compactActiveNodes: new Set<string>(),
  exhibitionCompactForm: defaultExhibitionCompactForm(),

  toggleCompact: (nodeId: string) => {
    set((state) => {
      const next = new Set(state.compactActiveNodes);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { compactActiveNodes: next };
    });
  },

  setExhibitionCompactForm: (form: Record<string, string[]>) => {
    set({ exhibitionCompactForm: form });
  },

  isCompactActive: (nodeId: string) => {
    return get().compactActiveNodes.has(nodeId);
  },

  isSectionVisible: (nodeId: string, nodeType: string, sectionId: string) => {
    const state = get();
    // 非精简模式：所有 section 可见
    if (!state.compactActiveNodes.has(nodeId)) return true;
    // 非展陈节点：不适用精简模式
    if (!EXHIBITION_COMPACT_NODE_TYPE_SET.has(nodeType)) return true;
    // 精简模式下：检查 section 白名单
    const allowed = state.allowedSections(nodeType);
    return allowed.has(sectionId);
  },

  allowedSections: (nodeType: string) => {
    const form = get().exhibitionCompactForm;
    const sections = form[nodeType];
    if (Array.isArray(sections) && sections.length > 0) return new Set(sections);
    // 未配置时默认全部可见
    const defaults = defaultExhibitionCompactForm();
    return new Set(defaults[nodeType] || []);
  },
}));

/**
 * React hook：展陈节点根容器 data 属性
 *
 * 在展陈节点根 div 上展开此 hook 返回值即可标记精简窗体状态：
 *   <div {...compactAttrs} ...>
 */
export function useCompactAttrs(nodeId: string, nodeType: string): Record<string, string | undefined> {
  const active = useExhibitionCompactStore((s) => s.compactActiveNodes.has(nodeId));
  const form = useExhibitionCompactStore((s) => s.exhibitionCompactForm);
  const allowedStr = useMemo(() => {
    const sections = form[nodeType] || defaultExhibitionCompactForm()[nodeType] || [];
    return sections.join(' ');
  }, [form, nodeType]);
  return {
    'data-exhibition-compact-node-type': nodeType,
    'data-exhibition-compact-active': active ? 'true' : undefined,
    'data-exhibition-compact-allowed-sections': active ? allowedStr : undefined,
  };
}
