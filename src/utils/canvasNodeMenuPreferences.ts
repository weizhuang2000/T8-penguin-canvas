import { NODE_REGISTRY } from '../config/nodeRegistry';
import type { NodeMeta, NodeType } from '../types/canvas';

export type CanvasNodeMenuScene = 'quickAdd' | 'connectFromInput' | 'connectToOutput';

export interface CanvasNodeMenuItemPreference {
  type: NodeType;
  visible: boolean;
  order: number;
}

export interface CanvasNodeMenuScenePreference {
  enabled: boolean;
  items: CanvasNodeMenuItemPreference[];
}

export type CanvasNodeMenuPreferences = Record<CanvasNodeMenuScene, CanvasNodeMenuScenePreference>;

export const CANVAS_NODE_MENU_SCENES: CanvasNodeMenuScene[] = [
  'quickAdd',
  'connectFromInput',
  'connectToOutput',
];

export const CANVAS_NODE_MENU_SCENE_LABELS: Record<CanvasNodeMenuScene, { title: string; hint: string }> = {
  quickAdd: {
    title: '空白区右键快速添加',
    hint: '控制画布空白处右键菜单里的节点选项。',
  },
  connectFromInput: {
    title: '输入接口：从...输入',
    hint: '从节点左侧输入口拖到空白处时，控制可作为上游来源的候选节点。',
  },
  connectToOutput: {
    title: '输出接口：连接到',
    hint: '从节点右侧输出口拖到空白处时，控制可作为下游目标的候选节点。',
  },
};

const sceneDefaultVisible = (scene: CanvasNodeMenuScene, meta: NodeMeta): boolean => {
  if (scene === 'quickAdd') return meta.category === 'input' || meta.category === 'core';
  return true;
};

const sceneDefaultOrderScore = (scene: CanvasNodeMenuScene, meta: NodeMeta, index: number): number => {
  if (scene === 'quickAdd') {
    if (meta.category === 'input') return index;
    if (meta.category === 'core') return 100 + index;
    return 1000 + index;
  }
  if (meta.type === 'relay') return -1;
  return index;
};

function configurableNodes() {
  return NODE_REGISTRY
    .map((meta, index) => ({ meta, index }))
    .filter(({ meta }) => !meta.hidden);
}

export function createDefaultCanvasNodeMenuPreferences(): CanvasNodeMenuPreferences {
  const nodes = configurableNodes();
  return CANVAS_NODE_MENU_SCENES.reduce((acc, scene) => {
    const ordered = [...nodes].sort((a, b) => (
      sceneDefaultOrderScore(scene, a.meta, a.index) - sceneDefaultOrderScore(scene, b.meta, b.index)
    ));
    acc[scene] = {
      enabled: true,
      items: ordered.map(({ meta }, order) => ({
        type: meta.type,
        visible: sceneDefaultVisible(scene, meta),
        order,
      })),
    };
    return acc;
  }, {} as CanvasNodeMenuPreferences);
}

export function normalizeCanvasNodeMenuPreferences(value: unknown): CanvasNodeMenuPreferences {
  const defaults = createDefaultCanvasNodeMenuPreferences();
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<Record<CanvasNodeMenuScene, unknown>>
    : {};

  return CANVAS_NODE_MENU_SCENES.reduce((acc, scene) => {
    const defaultScene = defaults[scene];
    const rawScene = source[scene] && typeof source[scene] === 'object' && !Array.isArray(source[scene])
      ? source[scene] as Partial<CanvasNodeMenuScenePreference>
      : {};
    const incomingItems = Array.isArray(rawScene.items) ? rawScene.items : [];
    const incomingByType = new Map<string, Partial<CanvasNodeMenuItemPreference>>();
    incomingItems.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const type = String((item as any).type || '') as NodeType;
      if (!type) return;
      incomingByType.set(type, item as Partial<CanvasNodeMenuItemPreference>);
    });
    const normalizedItems = defaultScene.items
      .map((defaultItem) => {
        const incoming = incomingByType.get(defaultItem.type);
        const incomingOrder = Number((incoming as any)?.order);
        return {
          type: defaultItem.type,
          visible: typeof incoming?.visible === 'boolean' ? incoming.visible : defaultItem.visible,
          order: Number.isFinite(incomingOrder) ? incomingOrder : defaultItem.order,
        };
      })
      .sort((a, b) => a.order - b.order || defaultScene.items.findIndex((item) => item.type === a.type) - defaultScene.items.findIndex((item) => item.type === b.type))
      .map((item, order) => ({ ...item, order }));

    acc[scene] = {
      enabled: rawScene.enabled !== false,
      items: normalizedItems,
    };
    return acc;
  }, {} as CanvasNodeMenuPreferences);
}

export function applyCanvasNodeMenuPreferences<T extends { type: unknown }>(
  items: T[],
  preferences: CanvasNodeMenuPreferences | undefined,
  scene: CanvasNodeMenuScene,
): T[] {
  const normalized = normalizeCanvasNodeMenuPreferences(preferences);
  const scenePrefs = normalized[scene];
  if (!scenePrefs.enabled) return [];
  const byType = new Map(scenePrefs.items.map((item) => [item.type, item]));
  return items
    .filter((item) => {
      const pref = byType.get(String(item.type) as NodeType);
      return pref?.visible === true;
    })
    .sort((a, b) => {
      const aPref = byType.get(String(a.type) as NodeType);
      const bPref = byType.get(String(b.type) as NodeType);
      return (aPref?.order ?? 9999) - (bPref?.order ?? 9999);
    });
}
