export const EXHIBITION_PLAN_LAYOUT_PRESETS = [
  {
    id: 'balanced',
    label: '均衡叙事',
    text: '按展陈大纲均衡分配各展区面积，入口、序厅、主体单元、互动区和尾厅形成清晰但不过度拥挤的参观节奏。',
  },
  {
    id: 'one-way-loop',
    label: '单向环线',
    text: '组织单向连续环线参观动线，避免回头路和交叉拥堵，适合连续叙事型展览；环线指游客路径闭合或回到出口附近，不是把展区做成完全封闭房间。',
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

export const EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS = [
  { id: 'large-sculpture', label: '大型雕塑' },
  { id: 'relief', label: '浮雕' },
  { id: 'group-sculpture', label: '群雕' },
  { id: 'art-installation', label: '艺术装置' },
  { id: 'multimedia-equipment', label: '多媒体设备' },
  { id: 'showcase', label: '文物柜/展柜' },
  { id: 'scene', label: '场景复原' },
  { id: 'artwork', label: '艺术品/主题展项' },
].map((item, index) => ({ ...item, order: index }));

export const EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS = [
  { id: 'readable-wrong-text', label: '可读错字/乱码文字' },
  { id: 'real-brand-logo', label: '真实品牌标识' },
  { id: 'instruction-table', label: '说明表格' },
  { id: 'crowded-people', label: '过多人群' },
  { id: 'messy-cables', label: '杂乱线缆' },
  { id: 'cartoon-style', label: '卡通低幼风格' },
  { id: 'blurry-low-quality', label: '低清晰度/模糊画面' },
  { id: 'floating-islands', label: '孤立漂浮展区' },
  { id: 'isolated-columns', label: '孤零零不连接任何物体的柱子' },
].map((item, index) => ({ ...item, order: index }));

const INSERT_ITEM_IDS = new Set(EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS.map((item) => item.id));

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

function labelsText(items) {
  const labels = items.map((item) => cleanText(item.label || item.id, 80)).filter(Boolean);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return labels.join('和');
  return `${labels.slice(0, -1).join('、')}和${labels[labels.length - 1]}`;
}

export function normalizeExhibitionPlanLayoutInsertItems(value, options = EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS) {
  const source = Array.isArray(options) && options.length > 0 ? options : EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS;
  const labelsById = new Map(source.map((item) => [String(item.id), String(item.label || item.id).trim()]));
  const ids = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const validIds = ids.filter((id) => labelsById.has(id));
  const fallback = source
    .filter((item) => INSERT_ITEM_IDS.has(String(item.id)))
    .map((item) => String(item.id));
  const picked = validIds.length > 0 ? validIds : fallback;
  return Array.from(new Set(picked)).map((id) => ({
    id,
    label: labelsById.get(id) || id,
  }));
}

export function exhibitionPlanLayoutInsertItemsText(value, options = EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS) {
  return labelsText(normalizeExhibitionPlanLayoutInsertItems(value, options));
}

export function normalizeExhibitionPlanLayoutExcludeItems(value, options = EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS) {
  const source = Array.isArray(options) && options.length > 0 ? options : EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS;
  const labelsById = new Map(source.map((item) => [String(item.id), String(item.label || item.id).trim()]));
  const ids = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return Array.from(new Set(ids.filter((id) => labelsById.has(id)))).map((id) => ({
    id,
    label: labelsById.get(id) || id,
  }));
}

export function exhibitionPlanLayoutExcludeItemsText(value, options = EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS) {
  return labelsText(normalizeExhibitionPlanLayoutExcludeItems(value, options));
}

export function buildExhibitionPlanOutlinePrompt(values = {}) {
  const sourceText = cleanText(values.sourceText, 50000);
  const projectTheme = cleanText(values.projectTheme, 500);
  const insertItemsText = exhibitionPlanLayoutInsertItemsText(values.insertItems, values.insertItemOptions);
  const excludeItemsText = exhibitionPlanLayoutExcludeItemsText(values.excludeItems, values.excludeItemOptions);
  return [
    '你是资深展陈策划师。请从输入资料中提炼用于展陈平面自动布局的展区大纲。',
    '只输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"title":"展览主题","zones":[{"name":"展区名称","summary":"该展区展示内容与空间功能，40-100字","displayMethods":["展示手段1","展示手段2"],"priority":1,"areaHint":"面积/位置建议，可为空","routeHint":"与前后展区的动线关系，可为空"}]}。',
    'zones 建议 4-8 个，必须覆盖资料的主要章节或叙事单元；不要编造资料中没有的事实。',
    `指定植入项展示手段：${insertItemsText}。请结合资料内容，为每个展区分配适合的展示手段，写入 displayMethods 和 summary。`,
    excludeItemsText ? `排除项：${excludeItemsText}。大纲和展示手段中不要设计、暗示或要求生成这些内容。` : '',
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
        displayMethods: Array.isArray(zone?.displayMethods)
          ? zone.displayMethods.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 6)
          : [],
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
      return { name, summary, displayMethods: [], priority: index + 1, areaHint: '', routeHint: '' };
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
      Array.isArray(zone.displayMethods) && zone.displayMethods.length > 0 ? `展示手段：${zone.displayMethods.map((item) => cleanText(item, 80)).filter(Boolean).join('、')}` : '',
      zone.areaHint ? `面积/位置：${cleanText(zone.areaHint, 200)}` : '',
      zone.routeHint ? `动线：${cleanText(zone.routeHint, 200)}` : '',
    ].filter(Boolean);
    lines.push(parts.join('\n'));
  });
  return lines.join('\n\n').trim();
}

export function buildExhibitionPlanLayoutPrompt(values = {}) {
  const outlineText = cleanText(values.outlineText || values.layoutOutlineText, 20000);
  const planInterpretation = cleanText(values.planInterpretation, 3000);
  const customRequirement = cleanText(values.layoutRequirement, 3000);
  const presetText = cleanText(values.layoutPresetText || exhibitionPlanLayoutPresetText(values.layoutPresetId), 1200);
  const showRoute = values.showRoute !== false;
  const showLabels = values.showLabels !== false;
  const showDescriptions = values.showDescriptions !== false;
  const structureLock = values.structureLock !== false;
  const insertItemsText = exhibitionPlanLayoutInsertItemsText(values.insertItems, values.insertItemOptions);
  const excludeItemsText = exhibitionPlanLayoutExcludeItemsText(values.excludeItems, values.excludeItemOptions);

  const routeText = showRoute
    ? '显示动线：开启。请用清晰箭头、红色虚线或彩色路径表现参观方向、入口、出口、主环线和必要的分流路径。动线必须从入口到出口连续穿过所有展陈单元和展区，不能遗漏任何单元，不能出现断线、跳线或只经过局部展区；每个单元都必须被主参观动线实际进入或贴近穿过，并与前后单元形成清楚的连续参观关系。'
    : '显示动线：关闭。不要绘制箭头、路线、脚印、方向线或任何显性参观路径符号。';
  const labelText = showLabels
    ? '显示标注文字：开启。允许在平面图中标注展区名称、入口、出口、服务点、核心展项、互动区等短标签。'
    : '显示标注文字：关闭。不要在图面上写展区名称、入口出口、功能标签或编号文字，只用颜色和图例形状区分。';
  const descriptionText = showDescriptions
    ? '显示说明文字：开启。可加入简短图例、设计说明框、面积/功能提示，但必须克制、整洁、少量。'
    : '显示说明文字：关闭。不要加入说明框、图例长文、设计注释、面积说明或段落文字。';
  const styleText = '输入图像说明：图1是唯一建筑平面图依据。在上面添加的元素使用如下风格：白色汇报底图、灰色建筑平面线稿、淡黄/淡粉/米色半透明展区色块、深灰大标题与单元标题、红色折线引导标注、红点节点、红色虚线参观动线和箭头、局部小号黑色展项标注，整体像展陈服务项目平面布局汇报图。';
  const outputModeText = structureLock
    ? '结构锁定模式：开启。请只生成透明背景的展陈布局叠加层 overlay，不要重画、描摹、修改或新增任何原建筑平面图上的墙体、柱子、门洞、窗、外轮廓、房间边界和原始尺寸标注；这些建筑结构会由程序直接保留图1原始底图并在最后合成。overlay 里只允许出现展区半透明色块、动线、箭头、展柜/展项/隔断/装置、标注文字、图例和说明。输出应为可叠加在图1上的透明 PNG 效果，空白区域保持透明。'
    : '结构锁定模式：关闭。可以生成完整平面布局图，但仍必须尽量保持图1建筑结构关系不变。';

  return [
    'Use case: exhibition-floor-plan-layout.',
    structureLock
      ? 'Primary request: 基于输入的原始建筑平面图，在原图上进行绘制专业展陈平面布局透明叠加层，覆盖在原图上完成最终平面布局图，原图在最底层并且不要进行任何改动。不要改成室内效果图、透视图、海报或鸟瞰渲染。'
      : 'Primary request: 基于输入的原始建筑平面图，生成一张专业展陈平面布局图。最终图必须是俯视平面布局，不是室内效果图、透视图、海报或鸟瞰渲染。',
    styleText,
    outputModeText,
    `平面图解析说明：${planInterpretation || '未填写'}。这段说明用于定义图1中的比例、尺寸、颜色含义、墙体、柱子、门洞、入口、不可移动结构和可布展范围；必须优先遵守，不得与图1冲突。`,
    '必须严格保留图1的建筑外轮廓、墙体边界、柱网、门洞、入口、通道宽度关系和房间几何；只能在其上规划展区分区、展项点位、服务功能和参观组织。',
    '展陈大纲目录：',
    outlineText || '未提供详细大纲；请按通用展陈逻辑划分序厅、主题展区、互动区、尾厅和配套功能。',
    '',
    `布局要求预设：${presetText}`,
    customRequirement ? `用户补充布局要求：${customRequirement}` : '',
    `植入项展示手段：${insertItemsText}。请把这些展示手段合理分配到展区中，可作为文物柜、展柜、艺术品、装置、多媒体点位、场景复原或主题展项来组织空间。`,
    excludeItemsText ? `排除项：${excludeItemsText}。最终平面布局中不得出现这些内容。` : '',
    routeText,
    labelText,
    descriptionText,
    '空间通行硬约束：不能出现任何完全闭合、没有门洞/开口/通道连接的展陈空间或单元，否则游客无法进入参观。每个由墙体、隔断、展柜或装置围合出的单元，都必须至少保留一个清晰可通行入口和一个可继续前进的出口或通道节点，并接入主参观动线。',
    '单元分隔要求：各展陈单元之间必须有明确遮挡物或空间界面分隔，观众通道除外。分隔可以是墙体完全隔开，也可以是文物柜、展柜、核心展项、艺术品、浮雕墙、半高隔断或装置隔开；这些界面用于引导参观路线，视觉可以局部穿透，但不能让所有单元完全敞开混成一片。',
    '柱网与孤立物约束：不得出现柱子或小构筑物孤零零地漂浮在空地中且不连接任何物体。所有柱子、展柜、展墙、装置或节点都必须与墙体、展项、隔断、展柜组、地台或展区边界形成明确关系。',
    '图面表达：彩色分区要覆盖在原始建筑平面内部；每个展区边界清晰，过渡自然；重要展项、互动装置、休息/服务点以简洁符号表达；图例和标注不遮挡关键平面结构。',
    '质量约束：线条锐利、文字如开启则尽量少且可读、分区色彩有区分度、整体像专业展陈设计汇报图；不要生成真实人物、摄影质感、杂乱装饰、三维透视、错误墙体、破碎文字或无关 logo。',
  ].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS = [
  {
    id: 'tech-blueprint',
    label: '科技馆蓝白线稿汇报风',
    prompt: '科技馆蓝白线稿汇报风：白色底图、蓝色/青色分区、清晰细线、红色动线箭头、理性工程图表达，适合科技产业与城市规划展陈。',
  },
  {
    id: 'minimal-museum',
    label: '极简博物馆风',
    prompt: '极简博物馆风：低饱和灰白底、克制色块、少量重点色、标注精简，强调留白、秩序和专业博物馆导览感。',
  },
  {
    id: 'family-learning',
    label: '儿童研学明亮风',
    prompt: '儿童研学明亮风：明亮友好的分区色彩、清晰图标化展项、动线易懂但不幼稚，适合亲子研学和互动教育空间。',
  },
].map((item, index) => ({ ...item, order: index }));

export const EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS = [
  {
    id: 'one-way-no-branch',
    label: '单向无分叉动线',
    prompt: '动线从入口到出口必须单向连续、无分叉、无断线，依次经过所有展区，避免回头路和交叉拥堵。',
  },
  {
    id: 'keep-fire-route',
    label: '保留消防疏散通道',
    prompt: '必须保留原建筑主要消防疏散通道和门洞可达关系，不得用展墙、展柜或装置遮挡必要疏散路径。',
  },
  {
    id: 'core-exhibit-near-atrium',
    label: '主展项靠近中庭',
    prompt: '将核心展项或主题装置布置在中庭、开敞核心区或视觉焦点附近，并围绕它组织若干连续展区。',
  },
].map((item, index) => ({ ...item, order: index }));

export function buildExhibitionAiPlanInterpretationPrompt(values = {}) {
  const outlineText = cleanText(values.outlineText || values.layoutOutlineText, 12000);
  const manualInterpretation = cleanText(values.planInterpretation, 3000);
  return [
    '你是展陈空间规划师和建筑平面图识图专家。请读取图1原始建筑平面图，输出可用于展陈平面AI布局的结构解析。',
    '只输出中文纯文本，不要 Markdown 表格，不要编造图中没有的尺寸。',
    '必须重点识别并明确声明：墙体、柱子、外轮廓、门洞、入口、出口、楼梯/电梯/设备井、已有房间边界等不可动结构。',
    '请按以下顺序输出：',
    '1. 不可动结构解析：墙体、柱子、外轮廓、门洞、入口出口和原始房间/通道边界。',
    '2. 可布局范围：哪些区域可叠加展陈分区、展柜、展墙、互动点位、服务点位。',
    '3. 入口出口与动线约束：入口出口位置、建议起止方向、必须保留的通行关系。',
    '4. 柱网/障碍约束：柱子和固定构筑物如何被展墙、展柜或展区边界连接，不允许孤零零漂浮。',
    '5. 与文本大纲的匹配建议：根据大纲给出展区顺序和重点展项落位建议。',
    manualInterpretation ? `用户补充平面说明：${manualInterpretation}` : '',
    outlineText ? `文本大纲：\n${outlineText}` : '',
  ].filter(Boolean).join('\n\n').trim();
}

export function buildExhibitionAiPlanLayoutPrompt(values = {}) {
  const base = buildExhibitionPlanLayoutPrompt({
    ...values,
    planInterpretation: [
      cleanText(values.planAiInterpretation, 6000),
      cleanText(values.planInterpretation, 3000),
    ].filter(Boolean).join('\n\n'),
  });
  const styleRequirement = cleanText(values.styleRequirement, 3000);
  const specialRequirement = cleanText(values.specialRequirement, 4000);
  return [
    'AI floor plan layout mode.',
    '图1是唯一建筑平面依据。墙体、柱子、外轮廓、门洞、入口出口不可移动、不可删除、不可重绘。',
    '只能在可布展区域内叠加展陈布局元素；不得把展陈要求当作修改原建筑结构的理由。',
    '如结构锁定开启，只生成透明背景 overlay，空白区域保持透明，最终由程序把 overlay 合成回原始平面图。',
    styleRequirement ? `风格要求：${styleRequirement}` : '风格要求：保持专业展陈平面汇报图风格，清晰、克制、可读。',
    specialRequirement ? `特殊要求：${specialRequirement}` : '',
    base,
  ].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
