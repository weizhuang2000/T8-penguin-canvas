export interface ExhibitionCompactSectionDefinition {
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
}

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
    { id: 'input', label: '输入图像' },
    { id: 'palette', label: '配色方案' },
    { id: 'protection', label: '保护对象' },
    { id: 'surface', label: '地面顶面' },
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

export function defaultExhibitionCompactForm(): ExhibitionCompactFormConfig {
  return {
    sectionsByNodeType: Object.fromEntries(
      EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => [
        definition.nodeType,
        definition.sections.map((section) => section.id),
      ]),
    ),
  };
}

export function normalizeExhibitionCompactFormConfig(value?: Partial<ExhibitionCompactFormConfig> | null): ExhibitionCompactFormConfig {
  const defaults = defaultExhibitionCompactForm();
  const incoming = value?.sectionsByNodeType || {};
  return {
    sectionsByNodeType: Object.fromEntries(
      EXHIBITION_COMPACT_FORM_DEFINITIONS.map((definition) => {
        const known = new Set(definition.sections.map((section) => section.id));
        const seen = new Set<string>();
        const sections = (Array.isArray(incoming[definition.nodeType])
          ? incoming[definition.nodeType]
          : defaults.sectionsByNodeType[definition.nodeType])
          .map((id) => String(id || '').trim())
          .filter((id) => {
            if (!known.has(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        return [definition.nodeType, sections];
      }),
    ),
  };
}
