export interface ExhibitionCompactSectionDefinition {
  id: string;
  label: string;
  items?: ExhibitionCompactItemDefinition[];
}

export interface ExhibitionCompactItemDefinition {
  id: string;
  label: string;
}

export interface ExhibitionCompactNodeDefinition {
  nodeType: string;
  label: string;
  sections: ExhibitionCompactSectionDefinition[];
}

export interface ExhibitionCompactFormConfig {
  sectionsByNodeType: Record<string, string[]>;
  itemsByNodeType: Record<string, Record<string, string[]>>;
}

const DEFAULT_ITEMS_BY_SECTION_ID: Record<string, ExhibitionCompactItemDefinition[]> = {
  source: [
    { id: 'material-input', label: '输入素材' },
    { id: 'text-input', label: '文本输入' },
    { id: 'upload-import', label: '上传/导入' },
    { id: 'actions', label: '操作按钮' },
  ],
  input: [
    { id: 'material-input', label: '输入素材' },
    { id: 'parameter-input', label: '参数输入' },
    { id: 'manual-input', label: '手动输入' },
    { id: 'actions', label: '操作按钮' },
  ],
  references: [
    { id: 'space-reference', label: '空间参考' },
    { id: 'material-reference', label: '材质参考' },
    { id: 'exhibit-reference', label: '展品参考' },
    { id: 'reference-settings', label: '参考设置' },
  ],
  extract: [
    { id: 'llm-settings', label: '模型设置' },
    { id: 'extract-actions', label: '提炼操作' },
    { id: 'extracted-fields', label: '提炼字段' },
  ],
  craft: [
    { id: 'preset-options', label: '预设选项' },
    { id: 'random-count', label: '随机数量' },
    { id: 'density', label: '密度/版式' },
    { id: 'manual-input', label: '手动补充' },
  ],
  style: [
    { id: 'style-options', label: '风格选项' },
    { id: 'strength', label: '强度设置' },
    { id: 'prompt', label: '提示词' },
  ],
  palette: [
    { id: 'preset-options', label: '预设方案' },
    { id: 'color-controls', label: '颜色控件' },
    { id: 'brightness', label: '明暗控制' },
  ],
  protection: [
    { id: 'protected-options', label: '保护选项' },
    { id: 'manual-exclusions', label: '手动排除' },
  ],
  surface: [
    { id: 'floor', label: '地面设置' },
    { id: 'ceiling', label: '顶面设置' },
  ],
  analysis: [
    { id: 'mode', label: '分析模式' },
    { id: 'focus', label: '关注项' },
    { id: 'supplement', label: '补充要求' },
  ],
  creative: [
    { id: 'direction', label: '创意方向' },
    { id: 'view-angle', label: '视角控制' },
    { id: 'lighting', label: '灯光设置' },
  ],
  insert: [
    { id: 'insert-options', label: '展项元素' },
    { id: 'random-count', label: '随机数量' },
  ],
  'color-material': [
    { id: 'preset-options', label: '预设方案' },
    { id: 'priority-mode', label: '优先级' },
    { id: 'reference-analysis', label: '参考识别' },
    { id: 'manual-input', label: '手动补充' },
  ],
  content: [
    { id: 'enable-toggle', label: '启用开关' },
    { id: 'import-input', label: '导入输入' },
    { id: 'text-fields', label: '文本字段' },
    { id: 'llm-settings', label: '模型设置' },
    { id: 'actions', label: '操作按钮' },
  ],
  model: [
    { id: 'provider', label: '平台' },
    { id: 'model', label: '模型' },
    { id: 'aspect-size', label: '比例/尺寸' },
    { id: 'output-format', label: '输出格式' },
    { id: 'seed-name', label: 'Seed/名称' },
    { id: 'manual-input', label: '手动补充' },
    { id: 'material-select', label: '材质选择' },
    { id: 'font-select', label: '字体选择' },
    { id: 'reference', label: '参考图' },
    { id: 'progress', label: '进度状态' },
    { id: 'preview', label: '结果预览' },
    { id: 'outputs', label: '输出列表' },
    { id: 'actions', label: '生成操作' },
  ],
  prompt: [
    { id: 'prompt-preview', label: '提示词预览' },
    { id: 'prompt-actions', label: '提示词操作' },
  ],
  result: [
    { id: 'progress', label: '进度状态' },
    { id: 'preview', label: '结果预览' },
    { id: 'outputs', label: '输出列表' },
    { id: 'actions', label: '结果操作' },
  ],
  pairing: [
    { id: 'pairing-mode', label: '配对模式' },
    { id: 'count', label: '数量设置' },
  ],
  run: [
    { id: 'run-actions', label: '运行操作' },
    { id: 'run-options', label: '运行选项' },
  ],
  status: [
    { id: 'progress', label: '执行状态' },
    { id: 'outputs', label: '输出结果' },
  ],
  split: [
    { id: 'split-settings', label: '拆分设置' },
    { id: 'llm-settings', label: '模型设置' },
    { id: 'actions', label: '拆分操作' },
  ],
  output: [
    { id: 'output-format', label: '输出格式' },
    { id: 'export-options', label: '导出选项' },
  ],
  layout: [
    { id: 'size', label: '尺寸设置' },
    { id: 'strategy', label: '布局策略' },
    { id: 'text-bounds', label: '文字区域' },
    { id: 'toggles', label: '开关选项' },
  ],
  elements: [
    { id: 'element-options', label: '元素选项' },
    { id: 'exhibit-settings', label: '展品设置' },
  ],
  language: [
    { id: 'document', label: '文档导入' },
    { id: 'text-fields', label: '文本字段' },
    { id: 'languages', label: '多语种' },
    { id: 'actions', label: '文本操作' },
  ],
  material: [
    { id: 'material-select', label: '材质选择' },
    { id: 'font-select', label: '字体选择' },
    { id: 'manual-input', label: '手动补充' },
    { id: 'reference', label: '参考图' },
  ],
  showcase: [
    { id: 'dimensions', label: '尺寸参数' },
    { id: 'structure', label: '结构设置' },
    { id: 'lighting', label: '灯光设置' },
  ],
  exhibits: [
    { id: 'exhibit-images', label: '展品图片' },
    { id: 'exhibit-settings', label: '展品设置' },
    { id: 'labels', label: '标签说明' },
  ],
};

export const EXHIBITION_COMPACT_FORM_DEFINITIONS: ExhibitionCompactNodeDefinition[] = [
  { nodeType: 'elevation-prompt', label: '\u7acb\u9762\u63d0\u793a\u8bcd', sections: [
    { id: 'source', label: '\u8d44\u6599\u8f93\u5165', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'extract', label: 'AI \u63d0\u70bc', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'craft', label: '\u5de5\u827a\u6e05\u5355', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'result', label: '\u7ed3\u679c\u9884\u89c8', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
  ] },
  { nodeType: 'exhibition-img2img', label: '\u5c55\u9648\u56fe\u751f\u56fe', sections: [
    { id: 'references', label: '\u53c2\u8003\u56fe', items: [
      { id: 'plan-reference', label: '\u5e73\u9762/\u7ed3\u6784\u53c2\u8003' },
      { id: 'priority-order', label: '\u4f18\u5148\u7ea7\u987a\u5e8f' },
      { id: 'exhibit-reference', label: '\u5c55\u54c1\u53c2\u8003' },
    ] },
    { id: 'craft', label: '\u5de5\u827a\u7248\u5f0f', items: [
      { id: 'preset-options', label: '\u9884\u8bbe\u9009\u9879' },
      { id: 'density', label: '\u5bc6\u5ea6/\u7248\u5f0f' },
    ] },
    { id: 'exclusions', label: '\u6392\u9664\u9879', items: [
      { id: 'protected-options', label: '\u4fdd\u62a4\u9009\u9879' },
    ] },
    { id: 'color-material', label: '\u8272\u5f69\u6750\u8d28', items: [
      { id: 'priority-mode', label: '\u4f18\u5148\u7ea7' },
      { id: 'manual-input', label: '\u624b\u52a8\u8865\u5145' },
    ] },
    { id: 'content', label: '\u56fe\u6587\u5185\u5bb9', items: [
      { id: 'enable-toggle', label: '\u542f\u7528\u5f00\u5173' },
      { id: 'llm-settings', label: '\u6a21\u578b\u8bbe\u7f6e' },
      { id: 'text-fields', label: '\u6587\u672c\u5b57\u6bb5' },
    ] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [
      { id: 'aspect-size', label: '\u6bd4\u4f8b/\u5c3a\u5bf8' },
    ] },
    { id: 'prompt', label: '\u63d0\u793a\u8bcd', items: [
      { id: 'prompt-preview', label: '\u63d0\u793a\u8bcd\u9884\u89c8' },
    ] },
    { id: 'result', label: '\u7ed3\u679c\u9884\u89c8', items: [
      { id: 'preview', label: '\u7ed3\u679c\u9884\u89c8' },
    ] },
  ] },
  { nodeType: 'exhibition-style-transfer', label: '\u98ce\u683c\u8fc1\u79fb', sections: [
    { id: 'input', label: '\u8f93\u5165\u56fe\u50cf', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'style', label: '\u98ce\u683c\u8bbe\u5b9a', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
  ] },
  { nodeType: 'exhibition-recolor', label: '\u4e3b\u8272\u8c03\u66f4\u6362', sections: [
    { id: 'input', label: '\u8272\u8c03', items: [
      { id: 'preset-options', label: '\u9884\u8bbe\u65b9\u6848' },
      { id: 'color-controls', label: '\u989c\u8272\u63a7\u4ef6' },
      { id: 'brightness', label: '\u660e\u6697\u63a7\u5236' },
    ] },
    { id: 'palette', label: '\u5730\u9762\u9876\u9762', items: [
      { id: 'floor', label: '\u5730\u9762\u8bbe\u7f6e' },
      { id: 'ceiling', label: '\u9876\u9762\u8bbe\u7f6e' },
    ] },
    { id: 'protection', label: '\u4fdd\u62a4\u5bf9\u8c61', items: [
      { id: 'protected-options', label: '\u4fdd\u62a4\u9009\u9879' },
      { id: 'manual-exclusions', label: '\u624b\u52a8\u6392\u9664' },
    ] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [
      { id: 'actions', label: '\u751f\u6210\u64cd\u4f5c' },
      { id: 'provider', label: '\u5e73\u53f0' },
      { id: 'model', label: '\u6a21\u578b' },
      { id: 'aspect-size', label: '\u6bd4\u4f8b/\u5c3a\u5bf8' },
      { id: 'output-format', label: '\u8f93\u51fa\u683c\u5f0f' },
      { id: 'seed-name', label: 'Seed' },
      { id: 'progress', label: '\u8fdb\u5ea6\u72b6\u6001' },
      { id: 'preview', label: '\u7ed3\u679c\u9884\u89c8' },
    ] },
  ] },
  { nodeType: 'exhibition-lighting-heatmap', label: '\u706f\u5149\u70ed\u529b\u56fe', sections: [
    { id: 'analysis', label: '\u5206\u6790\u8bbe\u7f6e', items: [
      { id: 'mode', label: '\u5206\u6790\u6a21\u5f0f' },
      { id: 'focus', label: '\u5173\u6ce8\u9879' },
      { id: 'supplement', label: '\u8865\u5145\u8981\u6c42' },
    ] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [
      { id: 'actions', label: '\u751f\u6210\u64cd\u4f5c' },
      { id: 'provider', label: '\u5e73\u53f0' },
      { id: 'model', label: '\u6a21\u578b' },
      { id: 'aspect-size', label: '\u6bd4\u4f8b/\u5c3a\u5bf8' },
      { id: 'output-format', label: '\u8f93\u51fa\u683c\u5f0f' },
      { id: 'seed-name', label: 'Seed' },
      { id: 'progress', label: '\u8fdb\u5ea6\u72b6\u6001' },
      { id: 'preview', label: '\u7ed3\u679c\u9884\u89c8' },
    ] },
  ] },
  { nodeType: 'exhibition-creative-image', label: '\u5c55\u9648\u521b\u610f\u751f\u56fe', sections: [
    { id: 'source', label: '\u9879\u76ee\u8d44\u6599', items: [
      { id: 'reference-settings', label: '\u53c2\u8003\u8bbe\u7f6e' },
      { id: 'space-reference', label: '\u7a7a\u95f4\u53c2\u8003' },
      { id: 'material-reference', label: '\u6750\u8d28\u53c2\u8003' },
    ] },
    { id: 'creative', label: '\u521b\u610f\u65b9\u5411', items: [
      { id: 'direction', label: '\u521b\u610f\u65b9\u5411' },
    ] },
    { id: 'insert', label: '\u5c55\u9879\u5143\u7d20', items: [
      { id: 'insert-options', label: '\u5c55\u9879\u5143\u7d20' },
      { id: 'random-count', label: '\u968f\u673a\u6570\u91cf' },
    ] },
    { id: 'color-material', label: '\u8272\u5f69\u6750\u8d28', items: [
      { id: 'preset-options', label: '\u9884\u8bbe\u8272\u5f69\u65b9\u6848' },
    ] },
    { id: 'content', label: '\u6587\u672c\u5185\u5bb9', items: [
      { id: 'text-fields', label: '\u6587\u672c\u5b57\u6bb5' },
    ] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [
      { id: 'actions', label: '\u751f\u6210\u64cd\u4f5c' },
    ] },
    { id: 'prompt', label: '\u63d0\u793a\u8bcd', items: [
      { id: 'prompt-preview', label: '\u63d0\u793a\u8bcd\u9884\u89c8' },
    ] },
    { id: 'result', label: '\u7ed3\u679c\u9884\u89c8', items: [
      { id: 'preview', label: '\u7ed3\u679c\u9884\u89c8' },
      { id: 'prompt-output', label: '\u5f53\u524d\u63d0\u793a\u8bcd' },
    ] },
  ] },
  { nodeType: 'exhibition-render-to-elevation', label: '\u6548\u679c\u56fe\u8f6c\u7acb\u9762', sections: [
    { id: 'input', label: '\u8f93\u5165\u7d20\u6750', items: [
      { id: 'material-input', label: '\u8f93\u5165\u7d20\u6750' },
    ] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [
      { id: 'provider', label: '\u5e73\u53f0' },
      { id: 'model', label: '\u6a21\u578b' },
      { id: 'aspect-size', label: '\u6bd4\u4f8b/\u5c3a\u5bf8' },
      { id: 'output-format', label: '\u8f93\u51fa\u683c\u5f0f' },
      { id: 'seed-name', label: 'Seed' },
      { id: 'manual-input', label: '\u624b\u52a8\u8865\u5145' },
    ] },
    { id: 'result', label: '\u7acb\u9762\u7ed3\u679c', items: [
      { id: 'outputs', label: '\u8f93\u51fa\u5217\u8868' },
      { id: 'preview', label: '\u7ed3\u679c\u9884\u89c8' },
      { id: 'progress', label: '\u8fdb\u5ea6\u72b6\u6001' },
      { id: 'actions', label: '\u7ed3\u679c\u64cd\u4f5c' },
    ] },
  ] },
  { nodeType: 'exhibition-text-image-loop', label: '\u56fe\u6587\u5faa\u73af\u5668', sections: [
    { id: 'run', label: '\u8fd0\u884c\u8bbe\u7f6e', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'pairing', label: '\u914d\u5bf9\u6a21\u5f0f', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'input', label: '\u8f93\u5165\u7d20\u6750', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'status', label: '\u6267\u884c\u72b6\u6001', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
  ] },
  { nodeType: 'exhibition-outline-split', label: '\u5c55\u9648\u5927\u7eb2\u62c6\u5206', sections: [
    { id: 'source', label: '\u8d44\u6599\u8f93\u5165', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'split', label: '\u62c6\u5206\u8bbe\u7f6e', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'output', label: '\u8f93\u51fa\u683c\u5f0f', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'result', label: '\u62c6\u5206\u7ed3\u679c', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
  ] },
  { nodeType: 'exhibition-plan-layout', label: '\u5e73\u9762\u81ea\u52a8\u5e03\u5c40', sections: [
    { id: 'input', label: '\u8f93\u5165\u7d20\u6750', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'layout', label: '\u5e03\u5c40\u7b56\u7565', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'result', label: '\u7ed3\u679c\u9884\u89c8', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
  ] },
  { nodeType: 'unit-panel-design', label: '\u5355\u5143\u677f\u8bbe\u8ba1', sections: [
    { id: 'source', label: '\u6587\u672c\u8d44\u6599', items: [
      { id: 'parameter-input', label: '\u53c2\u6570\u8f93\u5165' },
      { id: 'toggles', label: '\u5f00\u5173\u9009\u9879' },
    ] },
    { id: 'language', label: '\u591a\u8bed\u8a00', items: [
      { id: 'document', label: '\u6587\u6863\u5bfc\u5165' },
      { id: 'text-fields', label: '\u6587\u672c\u5b57\u6bb5' },
      { id: 'actions', label: '\u6587\u672c\u64cd\u4f5c' },
    ] },
    { id: 'material', label: '\u6750\u8d28\u8bbe\u7f6e', items: [
      { id: 'languages', label: '\u591a\u8bed\u79cd' },
    ] },
    { id: 'layout', label: '\u7248\u5f0f\u5c3a\u5bf8', items: [
      { id: 'size', label: '\u5c3a\u5bf8\u8bbe\u7f6e' },
      { id: 'text-bounds', label: '\u6587\u5b57\u533a\u57df' },
    ] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [
      { id: 'actions', label: '\u751f\u6210\u64cd\u4f5c' },
      { id: 'material-select', label: '\u6750\u8d28\u9009\u62e9' },
      { id: 'font-select', label: '\u5b57\u4f53\u9009\u62e9' },
      { id: 'manual-input', label: '\u624b\u52a8\u8865\u5145' },
      { id: 'reference', label: '\u53c2\u8003\u56fe' },
    ] },
    { id: 'result', label: '\u7ed3\u679c\u9884\u89c8', items: [
      { id: 'actions', label: '\u7ed3\u679c\u64cd\u4f5c' },
      { id: 'model', label: '\u6a21\u578b\u53c2\u6570' },
      { id: 'progress', label: '\u8fdb\u5ea6\u72b6\u6001' },
      { id: 'preview', label: '\u7ed3\u679c\u9884\u89c8' },
    ] },
  ] },
  { nodeType: 'showcase-interior-design', label: '\u67dc\u5185\u8bbe\u8ba1', sections: [
    { id: 'showcase', label: '\u5c55\u67dc\u5c3a\u5bf8', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'exhibits', label: '\u5c55\u54c1\u7d20\u6750', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'material', label: '\u8272\u5f69\u6750\u8d28', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'model', label: '\u6a21\u578b\u53c2\u6570', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
    { id: 'result', label: '\u7ed3\u679c\u9884\u89c8', items: [{ id: 'main', label: '\u4e3b\u63a7\u4ef6' }] },
  ] },
];

export const EXHIBITION_COMPACT_NODE_TYPES = new Set(
  EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => definition.nodeType),
);

function itemsForSection(section: ExhibitionCompactSectionDefinition): ExhibitionCompactItemDefinition[] {
  if (Array.isArray(section.items)) return section.items;
  return [];
}

export function getExhibitionCompactSectionItems(section: ExhibitionCompactSectionDefinition): ExhibitionCompactItemDefinition[] {
  return itemsForSection(section);
}

export function getDefaultCompactItemsByNodeType(): Record<string, Record<string, string[]>> {
  return Object.fromEntries(
    EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => [
      definition.nodeType,
      Object.fromEntries(
        definition.sections.map((section) => [
          section.id,
          itemsForSection(section).map((item) => item.id),
        ]),
      ),
    ]),
  );
}

export function defaultExhibitionCompactForm(): ExhibitionCompactFormConfig {
  return {
    sectionsByNodeType: Object.fromEntries(
      EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => [
        definition.nodeType,
        definition.sections.map((section) => section.id),
      ]),
    ),
    itemsByNodeType: getDefaultCompactItemsByNodeType(),
  };
}

export function normalizeExhibitionCompactFormConfig(value?: Partial<ExhibitionCompactFormConfig> | null): ExhibitionCompactFormConfig {
  const defaults = defaultExhibitionCompactForm();
  const incomingSections = value?.sectionsByNodeType || {};
  const incomingItems = value?.itemsByNodeType || {};
  return {
    sectionsByNodeType: Object.fromEntries(
      EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => {
        const known = new Set(definition.sections.map((section) => section.id));
        const seen = new Set<string>();
        const rawSectionValues = Array.isArray(incomingSections[definition.nodeType])
          ? incomingSections[definition.nodeType]
          : defaults.sectionsByNodeType[definition.nodeType];
        const rawSections = rawSectionValues.map((id) => String(id || '').trim());
        const sections = rawSections
          .map((id) => (definition.nodeType === 'exhibition-recolor' && id === 'surface' ? 'palette' : id))
          .filter((id) => {
            if (!known.has(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        return [definition.nodeType, sections];
      }),
    ),
    itemsByNodeType: Object.fromEntries(
      EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => [
        definition.nodeType,
        Object.fromEntries(
          definition.sections.map((section) => {
            const known = new Set(itemsForSection(section).map((item) => item.id));
            const seen = new Set<string>();
            const sectionItems = incomingItems[definition.nodeType]?.[section.id]
              || (definition.nodeType === 'exhibition-recolor' && section.id === 'palette'
                ? incomingItems[definition.nodeType]?.surface
                : undefined);
            const items = (Array.isArray(sectionItems)
              ? sectionItems
              : defaults.itemsByNodeType[definition.nodeType][section.id])
              .map((id) => String(id || '').trim())
              .filter((id) => {
                if (!known.has(id) || seen.has(id)) return false;
                seen.add(id);
                return true;
              });
            return [section.id, items];
          }),
        ),
      ]),
    ),
  };
}
