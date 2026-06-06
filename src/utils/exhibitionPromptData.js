export const EXHIBITION_DIMENSIONS = [
  {
    id: 'spaceType',
    label: '空间类型',
    presets: [
      { id: 'museum', label: '博物馆展厅', text: '博物馆展厅，叙事性空间尺度，兼顾文物保护与公众参观体验' },
      { id: 'brand', label: '品牌展厅', text: '品牌展厅，强调品牌识别、产品展示与沉浸式体验' },
      { id: 'culture', label: '文化主题馆', text: '文化主题展馆，融合地域文化、历史脉络与当代表达' },
      { id: 'science', label: '科技体验馆', text: '科技体验馆，交互装置丰富，空间具有未来感与探索感' },
      { id: 'temporary', label: '临时特展', text: '临时特展空间，模块化搭建，快速布展且视觉主题鲜明' },
    ],
  },
  {
    id: 'functionalZones',
    label: '功能分区',
    presets: [
      { id: 'intro-main-end', label: '序厅/主展/尾厅', text: '包含序厅、核心主展区、互动体验区、尾厅与休憩区，分区关系清晰' },
      { id: 'timeline', label: '时间轴分区', text: '按时间轴组织展区，入口导入、阶段展示、高潮节点与总结空间层层递进' },
      { id: 'island', label: '岛台式分区', text: '中央岛台与周边展墙结合，形成可环绕观看的多点展示结构' },
      { id: 'immersive', label: '沉浸体验分区', text: '沉浸影像区、实物展示区、数字互动区和观众停留区协同布局' },
      { id: 'product', label: '产品矩阵分区', text: '产品矩阵展示、重点单品区、场景体验区和洽谈区有序衔接' },
    ],
  },
  {
    id: 'exhibitionCraft',
    label: '展陈工艺',
    presets: [
      { id: 'modular', label: '模块化搭建', text: '模块化展墙与可拆装结构，收口精细，适合快速施工与后期维护' },
      { id: 'showcase', label: '展柜工艺', text: '恒温恒湿展柜、低反射玻璃、隐藏式锁具与精密金属边框' },
      { id: 'graphic', label: '图文工艺', text: 'UV喷绘、立体字、丝网印刷与分层导视图文，版式清晰克制' },
      { id: 'digital', label: '数字集成', text: 'LED屏、投影融合、互动触控与传感装置嵌入展墙，设备隐藏整洁' },
      { id: 'scenic', label: '场景复原', text: '半景画、仿真模型、肌理道具和微缩场景结合，营造真实叙事现场' },
    ],
  },
  {
    id: 'colorSystem',
    label: '色彩体系',
    presets: [
      { id: 'warm-neutral', label: '暖中性色', text: '暖中性色体系，米白、浅灰、木色与低饱和金属色协调搭配' },
      { id: 'deep-contrast', label: '深色对比', text: '深色背景与高亮展品形成对比，局部使用主题色强调重点信息' },
      { id: 'clean-tech', label: '清洁科技色', text: '白、银灰、冷蓝与透明材质构成清洁科技色彩体系' },
      { id: 'heritage', label: '文化沉稳色', text: '赭石、墨色、暗红与温润灰构成沉稳文化色彩体系' },
      { id: 'brand-accent', label: '品牌强调色', text: '整体低饱和背景中嵌入品牌强调色，识别清楚但不喧宾夺主' },
    ],
  },
  {
    id: 'lightingStrategy',
    label: '灯光策略',
    presets: [
      { id: 'museum-track', label: '博物馆轨道灯', text: '专业轨道射灯精准洗亮展品，环境光柔和，眩光控制良好' },
      { id: 'linear', label: '线性灯带', text: '隐藏式线性灯带勾勒空间边界，形成连续导向和轻盈层次' },
      { id: 'dramatic', label: '戏剧重点光', text: '重点展品采用戏剧化聚光，背景压暗，突出视觉焦点' },
      { id: 'immersive-light', label: '沉浸氛围光', text: '投影、漫反射和色温渐变结合，形成沉浸式氛围灯光' },
      { id: 'daylight', label: '自然光融合', text: '自然采光与人工补光融合，展品照度均匀，空间明亮通透' },
    ],
  },
  {
    id: 'materialExpression',
    label: '材质表达',
    presets: [
      { id: 'wood-metal', label: '木作金属', text: '温润木饰面、拉丝金属、哑光烤漆与细腻收边形成高级质感' },
      { id: 'stone-glass', label: '石材玻璃', text: '浅色石材、超白玻璃、金属框架与微水泥地面形成清爽秩序' },
      { id: 'fabric-acoustic', label: '织物吸音', text: '织物软包、吸音材料与柔和墙面肌理提升空间舒适度' },
      { id: 'industrial', label: '工业材料', text: '裸露结构、金属网、混凝土肌理与可见连接件呈现工业展陈语言' },
      { id: 'digital-surface', label: '数字表皮', text: '发光膜、透明屏、亚克力、镜面不锈钢与数字表皮构成未来质感' },
    ],
  },
  {
    id: 'viewComposition',
    label: '视角构图',
    presets: [
      { id: 'wide-eye', label: '广角平视', text: '广角平视效果图视角，完整呈现空间纵深、展墙关系和观众尺度' },
      { id: 'entrance', label: '入口透视', text: '从入口望向核心展区的透视构图，导视、主题墙和动线起点清晰' },
      { id: 'corner-depth', label: '转角纵深', text: '转角透视构图，展示多层展墙、灯光层次和空间递进' },
      { id: 'top-oblique', label: '高位俯视', text: '轻微高位俯视，清晰展示功能分区、展台布局和参观组织' },
      { id: 'hero-wall', label: '主题墙特写', text: '主题墙与核心展品的中景构图，突出图文、材质和灯光细节' },
    ],
  },
  {
    id: 'styleReference',
    label: '风格参考',
    presets: [
      { id: 'contemporary-museum', label: '当代博物馆', text: '当代博物馆风格，克制、精密、安静，强调展品与叙事' },
      { id: 'premium-brand', label: '高端品牌', text: '高端品牌展厅风格，精致商业空间、干净构图与高级材料' },
      { id: 'new-chinese', label: '新中式文化', text: '新中式文化展陈风格，留白、秩序、温润材质与现代照明融合' },
      { id: 'future-tech', label: '未来科技', text: '未来科技展陈风格，数字界面、发光结构和流线型空间语言' },
      { id: 'immersive-art', label: '沉浸艺术', text: '沉浸式艺术展风格，影像包裹、氛围光影和强主题场景' },
    ],
  },
  {
    id: 'negativeItems',
    label: '排除项',
    presets: [
      { id: 'no-clutter', label: '避免杂乱', text: '避免杂乱堆砌、廉价装饰、过多无关道具' },
      { id: 'no-distortion', label: '避免畸变', text: '避免空间透视畸变、展柜比例错误、人物尺度失真' },
      { id: 'no-bad-text', label: '避免乱码', text: '避免乱码文字、错误标识、不可读导视和错别字' },
      { id: 'no-overlight', label: '避免过曝', text: '避免灯光过曝、眩光刺眼、展品细节丢失' },
      { id: 'no-lowend', label: '避免廉价感', text: '避免廉价塑料质感、粗糙施工、脏污破损和低清渲染' },
    ],
  },
];

export function getExhibitionDimension(id) {
  return EXHIBITION_DIMENSIONS.find((dimension) => dimension.id === id);
}

export function presetTextForDimension(dimensionId, presetId) {
  if (!presetId) return '';
  return getExhibitionDimension(dimensionId)?.presets.find((preset) => preset.id === presetId)?.text || '';
}

export function buildExhibitionPrompt(values) {
  const lines = ['生成一张专业的展陈设计效果图，画面用于空间方案汇报与生图控制。'];
  for (const dimension of EXHIBITION_DIMENSIONS) {
    const text = String(values[dimension.id] || '').trim();
    if (!text) continue;
    const prefix = dimension.id === 'negativeItems' ? '排除项' : dimension.label;
    lines.push(`${prefix}：${text}`);
  }
  const upstreamText = String(values.upstreamText || '').trim();
  if (upstreamText) lines.push(`补充需求：${upstreamText}`);
  const supplement = String(values.supplement || '').trim();
  if (supplement) lines.push(`用户补充：${supplement}`);
  if (values.hasReferenceImages) {
    lines.push('参考图说明：参考上游或本地参考图中的空间比例、展项关系、材料气质和视觉氛围，不要照搬无关内容。');
  }
  lines.push('渲染要求：真实展陈空间效果图，建筑室内摄影级构图，材质细节清晰，灯光层次准确，空间尺度可信，画面干净完整。');
  return lines.join('\n');
}

