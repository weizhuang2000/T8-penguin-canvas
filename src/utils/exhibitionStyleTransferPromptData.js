function cleanText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export const EXHIBITION_STYLE_TRANSFER_MODES = [
  { id: 'style-reference', label: '设计风格参考图' },
  { id: 'color-material-preset', label: '色彩与材质预设' },
  { id: 'material-replacement', label: '主材质和辅助材质替换' },
];

const MODE_IDS = new Set(EXHIBITION_STYLE_TRANSFER_MODES.map((item) => item.id));

export function normalizeExhibitionStyleTransferMode(value) {
  const id = cleanText(value, 80);
  return MODE_IDS.has(id) ? id : 'style-reference';
}

function materialText(item) {
  if (!item) return '';
  const label = cleanText(item.label, 120);
  const category = cleanText(item.category, 80);
  const description = cleanText(item.description, 300);
  const texture = cleanText(item.texture, 300);
  const usage = cleanText(item.usage, 200);
  return [
    label && `材质名称：${label}`,
    category && `分类：${category}`,
    description && `说明：${description}`,
    texture && `表面肌理/工艺：${texture}`,
    usage && `建议用途：${usage}`,
  ].filter(Boolean).join('；');
}

function colorMaterialPresetText(values) {
  return [
    cleanText(values.colorMaterialPalette, 1200) && `Color palette：${cleanText(values.colorMaterialPalette, 1200)}`,
    cleanText(values.colorMaterialTextures, 1200) && `Materials/textures：${cleanText(values.colorMaterialTextures, 1200)}`,
    cleanText(values.colorMaterial, 1600) && `色彩与材质说明：${cleanText(values.colorMaterial, 1600)}`,
  ].filter(Boolean).join('\n');
}

function materialReplacementText(values) {
  const primary = materialText(values.primaryMaterial);
  const secondaries = Array.isArray(values.secondaryMaterials) ? values.secondaryMaterials.map(materialText).filter(Boolean) : [];
  const lines = [];
  if (primary) lines.push(`主材质：${primary}`);
  secondaries.forEach((item, index) => lines.push(`辅助材质 ${index + 1}：${item}`));
  return lines.join('\n');
}

function styleSourceText(mode, values) {
  if (mode === 'style-reference') {
    return [
      '风格来源：设计风格参考图。',
      '设计风格参考图只用于提取展陈设计风格、色彩体系、材质语言、表面肌理、光泽关系、灯光氛围和细部质感。',
      '不得从设计风格参考图复制空间架构、展品、文字、展示手段、构图、透视、比例、动线或具体内容。',
      cleanText(values.styleReferenceTone, 500) && `参考图主色调识别：${cleanText(values.styleReferenceTone, 500)}`,
    ].filter(Boolean).join('\n');
  }
  if (mode === 'color-material-preset') {
    const preset = colorMaterialPresetText(values);
    return [
      '风格来源：已选择的共享色彩与材质预设。',
      preset || '色彩与材质说明：使用所选预设建立统一、克制、可落地的展陈色彩材质体系。',
      '不要使用任何设计风格参考图；如画布上曾连接参考图，该输入应已被清空。',
    ].join('\n');
  }
  const replacement = materialReplacementText(values);
  return [
    '风格来源：主材质和辅助材质替换。',
    replacement || '材质替换：使用已选择的主材质或辅助材质替换原图中对应的墙面、地面、展台、展柜、装置、字牌、灯带或装饰表面。',
    '主材质用于画面中面积最大、最稳定的基础表面；辅助材质用于收边、局部装饰、展柜、灯光构件、标题字或强调区域。',
    '不要使用任何设计风格参考图；如画布上曾连接参考图，该输入应已被清空。',
  ].join('\n');
}

export function buildExhibitionStyleTransferPrompt(values = {}) {
  const mode = normalizeExhibitionStyleTransferMode(values.mode);
  const supplement = cleanText(values.supplement);
  const lines = [
    '任务：对一张既有展陈空间图像进行风格迁移，输出高完成度、真实可落地的展陈空间效果图。',
    '',
    '最高优先级：原始图像是空间结构、展品、文字、展示手段、构图、视角、比例、动线、开口、墙体、顶面、地面、展柜、展台和主要内容的唯一依据。',
    '',
    '必须保持：空间架构不变；展品不变；画面中的文字和标识位置不变；展示手段不变；构图关系、透视角度、镜头高度、尺度比例和观众动线不变。',
    '',
    '禁止：改造空间、替换展品、改写文字、增加新展示方式、改变主要开口/墙体/展柜/展台/导视关系、把原图改成另一处展陈空间、复制参考图中的具体布局或内容。',
    '',
    '允许改变：色彩体系、主材质和辅助材质、表面肌理、光泽、反射强弱、灯光氛围、细部质感、收边工艺和整体设计风格。',
    '',
    '风格控制：',
    styleSourceText(mode, values),
    '',
    '执行方式：把上述风格语言真实地迁移到原始图像已有的墙面、地面、展台、展柜、装置、导视、标题字、灯带和装饰表面上；只做材质与风格层面的替换，不移动、不增删、不重构任何核心元素。',
    '',
    '文字约束：保留原图文字所在区域、层级和排版关系；不要生成新的可读文字，不要把提示词字段名渲染到画面里。',
    '',
    '展品约束：保留原图展品的类别、位置、数量、展示重点和尺度关系；只允许让展品周边环境的材质与灯光更符合目标风格。',
    '',
    '最终输出：与原始图像具有一眼可识别的相同空间与内容，只在设计风格、色彩、材质、质感和灯光氛围上完成迁移。',
  ];
  if (supplement) {
    lines.push('', '补充要求：', supplement);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
