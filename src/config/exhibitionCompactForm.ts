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
  { nodeType: 'elevation-prompt', label: '立面提示词', sections: [
    { id: 'source', label: '资料输入' },
    { id: 'extract', label: 'AI 提炼' },
    { id: 'craft', label: '工艺清单' },
    { id: 'model', label: '模型参数' },
    { id: 'result', label: '结果预览' },
  ] },
  { nodeType: 'exhibition-img2img', label: '展陈图生图', sections: [
    { id: 'references', label: '参考图' },
    { id: 'craft', label: '工艺版式' },
    { id: 'exclusions', label: '排除项' },
    { id: 'color-material', label: '色彩材质' },
    { id: 'content', label: '图文内容' },
    { id: 'model', label: '模型参数' },
    { id: 'prompt', label: '提示词' },
    { id: 'result', label: '结果预览' },
  ] },
  { nodeType: 'exhibition-style-transfer', label: '风格迁移', sections: [
    { id: 'input', label: '输入图像' },
    { id: 'style', label: '风格设定' },
    { id: 'material', label: '材质选择' },
    { id: 'model', label: '模型参数' },
    { id: 'result', label: '结果预览' },
  ] },
  { nodeType: 'exhibition-recolor', label: '主色调更换', sections: [
    { id: 'input', label: '\u8272\u8c03', items: [
      { id: 'preset-options', label: '预设方案' },
      { id: 'color-controls', label: '颜色控件' },
      { id: 'brightness', label: '明暗控制' },
    ] },
        { id: 'protection', label: '保护对象' },
    { id: 'palette', label: '地面顶面', items: [
      { id: 'floor', label: '地面设置' },
      { id: 'ceiling', label: '顶面设置' },
    ] },
    { id: 'model', label: '模型参数' },
    { id: 'result', label: '结果预览' },
  ] },
  { nodeType: 'exhibition-lighting-heatmap', label: '灯光热力图', sections: [
    { id: 'analysis', label: '分析设置' },
    { id: 'model', label: '模型参数' },
    { id: 'result', label: '结果预览' },
  ] },
  { nodeType: 'exhibition-creative-image', label: '展陈创意生图', sections: [
    { id: 'source', label: '项目资料' },
    { id: 'creative', label: '创意方向' },
    { id: 'insert', label: '展项元素' },
    { id: 'color-material', label: '色彩材质' },
    { id: 'content', label: '文本内容' },
    { id: 'model', label: '模型参数' },
    { id: 'prompt', label: '提示词' },
    { id: 'result', label: '结果预览' },
  ] },
  { nodeType: 'exhibition-render-to-elevation', label: '效果图转立面', sections: [
    { id: 'input', label: '输入素材' },
    { id: 'model', label: '模型参数' },
    { id: 'result', label: '立面结果' },
  ] },
  { nodeType: 'exhibition-text-image-loop', label: '图文循环器', sections: [
    { id: 'input', label: '输入素材' },
    { id: 'pairing', label: '配对模式' },
    { id: 'run', label: '运行设置' },
    { id: 'status', label: '执行状态' },
  ] },
  { nodeType: 'exhibition-outline-split', label: '展陈大纲拆分', sections: [
    { id: 'source', label: '资料输入' },
    { id: 'split', label: '拆分设置' },
    { id: 'output', label: '输出格式' },
    { id: 'result', label: '拆分结果' },
  ] },
  { nodeType: 'exhibition-plan-layout', label: '平面自动布局', sections: [
    { id: 'input', label: '输入素材' },
    { id: 'layout', label: '布局策略' },
    { id: 'elements', label: '展项元素' },
    { id: 'model', label: '模型参数' },
    { id: 'result', label: '结果预览' },
  ] },
  { nodeType: 'unit-panel-design', label: '单元板设计', sections: [
    { id: 'source', label: '文本资料' },
    { id: 'language', label: '多语言' },
    { id: 'material', label: '材质设置' },
    { id: 'layout', label: '版式尺寸' },
    { id: 'model', label: '模型参数' },
    { id: 'result', label: '结果预览' },
  ] },
  { nodeType: 'showcase-interior-design', label: '柜内设计', sections: [
    { id: 'showcase', label: '展柜尺寸' },
    { id: 'exhibits', label: '展品素材' },
    { id: 'layout', label: '陈列布局' },
    { id: 'material', label: '色彩材质' },
    { id: 'model', label: '模型参数' },
    { id: 'result', label: '结果预览' },
  ] },
];

export const EXHIBITION_COMPACT_NODE_TYPES = new Set(
  EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => definition.nodeType),
);

function itemsForSection(section: ExhibitionCompactSectionDefinition): ExhibitionCompactItemDefinition[] {
  if (Array.isArray(section.items)) return section.items;
  return DEFAULT_ITEMS_BY_SECTION_ID[section.id] || [
    { id: 'main', label: section.label },
  ];
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
