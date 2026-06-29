/**
 * 展陈节点精简窗体配置清单
 *
 * 定义哪些展陈节点支持精简窗体，以及每个节点的 section ID、中文标签和默认选中状态。
 * 与后端 EXHIBITION_COMPACT_NODE_TYPES / EXHIBITION_COMPACT_SECTIONS 保持同步。
 */

export interface ExhibitionSectionDef {
  id: string;
  label: string;
}

export interface ExhibitionNodeDef {
  nodeType: string;
  nodeLabel: string;
  sections: ExhibitionSectionDef[];
}

const COMMON_SECTIONS: ExhibitionSectionDef[] = [
  { id: 'input-material', label: '输入素材' },
  { id: 'prompt-outline', label: '提示词/大纲' },
  { id: 'craft-style', label: '工艺/风格' },
  { id: 'color-material', label: '色彩材质' },
  { id: 'layout-size', label: '布局/尺寸' },
  { id: 'model-params', label: '模型参数' },
  { id: 'generate-action', label: '生成操作' },
  { id: 'result-preview', label: '结果预览' },
];

export const EXHIBITION_COMPACT_NODES: ExhibitionNodeDef[] = [
  { nodeType: 'elevation-prompt', nodeLabel: '立面提示词', sections: COMMON_SECTIONS },
  { nodeType: 'exhibition-img2img', nodeLabel: '展陈图生图', sections: COMMON_SECTIONS },
  { nodeType: 'exhibition-style-transfer', nodeLabel: '展陈风格迁移', sections: COMMON_SECTIONS },
  { nodeType: 'exhibition-recolor', nodeLabel: '展陈重上色', sections: COMMON_SECTIONS },
  { nodeType: 'exhibition-lighting-heatmap', nodeLabel: '展陈灯光热力图', sections: COMMON_SECTIONS },
  { nodeType: 'exhibition-creative-image', nodeLabel: '展陈创意图', sections: COMMON_SECTIONS },
  { nodeType: 'exhibition-text-image-loop', nodeLabel: '展陈图文循环', sections: COMMON_SECTIONS },
  { nodeType: 'exhibition-outline-split', nodeLabel: '展陈大纲拆分', sections: COMMON_SECTIONS },
  { nodeType: 'exhibition-plan-layout', nodeLabel: '展陈平面排版', sections: COMMON_SECTIONS },
  { nodeType: 'unit-panel-design', nodeLabel: '单元展柜设计', sections: COMMON_SECTIONS },
  { nodeType: 'showcase-interior-design', nodeLabel: '展厅室内设计', sections: COMMON_SECTIONS },
];

/** 支持精简窗体的节点类型集合 */
export const EXHIBITION_COMPACT_NODE_TYPE_SET: Set<string> = new Set(
  EXHIBITION_COMPACT_NODES.map((n) => n.nodeType),
);

/** 按 nodeType 快速查找定义 */
export const EXHIBITION_COMPACT_NODE_MAP: Map<string, ExhibitionNodeDef> = new Map(
  EXHIBITION_COMPACT_NODES.map((n) => [n.nodeType, n]),
);

/** 生成默认全选配置 (与后端 defaultExhibitionCompactForm 对齐) */
export function defaultExhibitionCompactForm(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const node of EXHIBITION_COMPACT_NODES) {
    out[node.nodeType] = node.sections.map((s) => s.id);
  }
  return out;
}
