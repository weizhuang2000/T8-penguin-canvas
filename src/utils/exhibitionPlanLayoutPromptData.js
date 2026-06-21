export const EXHIBITION_PLAN_LAYOUT_PRESETS = [
  {
    id: 'balanced',
    label: '均衡叙事',
    text: '按展陈大纲均衡分配各展区面积，入口、序厅、主体单元、互动区和尾厅形成清晰但不过度拥挤的参观节奏。',
  },
  {
    id: 'one-way-loop',
    label: '单向环线',
    text: '组织单向闭环参观动线，避免回头路和交叉拥堵，适合连续叙事型展览。',
  },
  {
    id: 'free-flow',
    label: '自由流线',
    text: '采用开放式自由流线，允许观众按兴趣进入不同展区，保持视觉通透和多入口可达。',
  },
  {
    id: 'timeline',
    label: '时间线展陈',
    text: '按时间线或发展阶段顺序布置展区，动线从起点自然推进到终点，空间节点对应大纲章节。',
  },
  {
    id: 'highlight-core',
    label: '核心展项聚焦',
    text: '围绕一个或多个核心展项组织空间，主展项位于视觉焦点或交通汇聚处，其他单元形成辅助叙事。',
  },
  {
    id: 'high-capacity',
    label: '高容量参观',
    text: '优先保证团队参观和高峰客流通行宽度，减少狭窄瓶颈，设置等候、缓冲和分流区域。',
  },
  {
    id: 'family-learning',
    label: '亲子研学',
    text: '增加低龄友好的互动停留点、研学任务区和安全缓冲，动线清楚，展区名称直观。',
  },
  {
    id: 'quiet-museum',
    label: '安静博物馆式',
    text: '采用克制、安静、博物馆式布局，强调秩序、留白、展品观看距离和清晰分区。',
  },
];

const PRESET_IDS = new Set(EXHIBITION_PLAN_LAYOUT_PRESETS.map((item) => item.id));

function cleanText(value, max = 20000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function normalizeExhibitionPlanLayoutPresetId(value) {
  const id = String(value || '').trim();
  return PRESET_IDS.has(id) ? id : 'balanced';
}

export function exhibitionPlanLayoutPresetText(value) {
  const id = normalizeExhibitionPlanLayoutPresetId(value);
  return EXHIBITION_PLAN_LAYOUT_PRESETS.find((item) => item.id === id)?.text || EXHIBITION_PLAN_LAYOUT_PRESETS[0].text;
}

export function buildExhibitionPlanOutlinePrompt(values = {}) {
  const sourceText = cleanText(values.sourceText, 50000);
  const projectTheme = cleanText(values.projectTheme, 500);
  return [
    '你是资深展陈策划师。请从输入资料中提炼用于展陈平面自动布局的展区大纲。',
    '只输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"title":"展览主题","zones":[{"name":"展区名称","summary":"该展区展示内容与空间功能，40-100字","priority":1,"areaHint":"面积/位置建议，可为空","routeHint":"与前后展区的动线关系，可为空"}]}。',
    'zones 建议 4-8 个，必须覆盖资料的主要章节或叙事单元；不要编造资料中没有的事实。',
    projectTheme ? `项目主题参考：${projectTheme}` : '',
    '',
    sourceText,
  ].filter(Boolean).join('\n');
}

export function parseExhibitionPlanOutlineJson(text) {
  const raw = cleanText(text, 30000).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    const zones = Array.isArray(parsed?.zones) ? parsed.zones : Array.isArray(parsed) ? parsed : [];
    const normalizedZones = zones
      .map((zone, index) => ({
        name: cleanText(zone?.name || zone?.title || `展区${index + 1}`, 80),
        summary: cleanText(zone?.summary || zone?.description || zone?.content || '', 600),
        priority: Math.max(1, Math.min(5, Math.floor(Number(zone?.priority) || index + 1))),
        areaHint: cleanText(zone?.areaHint || zone?.area || '', 200),
        routeHint: cleanText(zone?.routeHint || zone?.route || '', 200),
      }))
      .filter((zone) => zone.name || zone.summary);
    return {
      title: cleanText(parsed?.title || parsed?.projectTitle || '', 120),
      zones: normalizedZones,
    };
  } catch {
    const lines = raw.split(/\n+/).map((line) => line.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean);
    const zones = lines.slice(0, 8).map((line, index) => {
      const [nameRaw, ...rest] = line.split(/[：:]/);
      const name = cleanText(nameRaw || `展区${index + 1}`, 80);
      const summary = cleanText(rest.join('：') || line, 600);
      return { name, summary, priority: index + 1, areaHint: '', routeHint: '' };
    });
    return { title: '', zones };
  }
}

export function formatExhibitionPlanOutline(result) {
  const zones = Array.isArray(result?.zones) ? result.zones : [];
  const lines = [];
  const title = cleanText(result?.title, 120);
  if (title) lines.push(`展览主题：${title}`);
  zones.forEach((zone, index) => {
    const parts = [
      `${index + 1}. ${cleanText(zone.name || `展区${index + 1}`, 80)}`,
      cleanText(zone.summary, 600),
      zone.areaHint ? `面积/位置：${cleanText(zone.areaHint, 200)}` : '',
      zone.routeHint ? `动线：${cleanText(zone.routeHint, 200)}` : '',
    ].filter(Boolean);
    lines.push(parts.join('\n'));
  });
  return lines.join('\n\n').trim();
}

export function buildExhibitionPlanLayoutPrompt(values = {}) {
  const outlineText = cleanText(values.outlineText || values.layoutOutlineText, 20000);
  const customRequirement = cleanText(values.layoutRequirement, 3000);
  const presetText = cleanText(values.layoutPresetText || exhibitionPlanLayoutPresetText(values.layoutPresetId), 1200);
  const showRoute = values.showRoute !== false;
  const showLabels = values.showLabels !== false;
  const showDescriptions = values.showDescriptions !== false;
  const hasStyleReferenceImage = values.hasStyleReferenceImage === true;

  const routeText = showRoute
    ? '显示动线：开启。请用清晰箭头、虚线或彩色路径表现参观方向、入口、出口、主环线和必要的分流路径。'
    : '显示动线：关闭。不要绘制箭头、路线、脚印、方向线或任何显性参观路径符号。';
  const labelText = showLabels
    ? '显示标注文字：开启。允许在平面图中标注展区名称、入口、出口、服务点、核心展项、互动区等短标签。'
    : '显示标注文字：关闭。不要在图面上写展区名称、入口出口、功能标签或编号文字，只用颜色和图例形状区分。';
  const descriptionText = showDescriptions
    ? '显示说明文字：开启。可加入简短图例、设计说明框、面积/功能提示，但必须克制、整洁、少量。'
    : '显示说明文字：关闭。不要加入说明框、图例长文、设计注释、面积说明或段落文字。';
  const styleText = hasStyleReferenceImage
    ? '输入图像说明：图1是唯一建筑平面图依据；图2只是平面布局图的视觉样式参考，只能参考配色、线条、图例、分区表达和标注形式，不得改变图1的建筑轮廓、墙体、柱网、入口和房间边界。'
    : '输入图像说明：图1是唯一建筑平面图依据。使用内置默认样式：干净俯视、展陈方案汇报用平面布局图、彩色半透明展区分区、清晰边界、现代图例、工程制图般整洁。';

  return [
    'Use case: exhibition-floor-plan-layout.',
    'Primary request: 基于输入的原始建筑平面图，生成一张专业展陈平面布局图。最终图必须是俯视平面布局，不是室内效果图、透视图、海报或鸟瞰渲染。',
    styleText,
    '必须严格保留图1的建筑外轮廓、墙体边界、柱网、门洞、入口、通道宽度关系和房间几何；只能在其上规划展区分区、展项点位、服务功能和参观组织。',
    '展陈大纲目录：',
    outlineText || '未提供详细大纲；请按通用展陈逻辑划分序厅、主题展区、互动区、尾厅和配套功能。',
    '',
    `布局要求预设：${presetText}`,
    customRequirement ? `用户补充布局要求：${customRequirement}` : '',
    routeText,
    labelText,
    descriptionText,
    '图面表达：彩色分区要覆盖在原始建筑平面内部；每个展区边界清晰，过渡自然；重要展项、互动装置、休息/服务点以简洁符号表达；图例和标注不遮挡关键平面结构。',
    '质量约束：线条锐利、文字如开启则尽量少且可读、分区色彩有区分度、整体像专业展陈设计汇报图；不要生成真实人物、摄影质感、杂乱装饰、三维透视、错误墙体、破碎文字或无关 logo。',
  ].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
