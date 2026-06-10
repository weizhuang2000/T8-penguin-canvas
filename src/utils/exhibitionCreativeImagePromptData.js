export const EXHIBITION_CREATIVE_SPACE_TYPES = [
  {
    id: 'intro-hall',
    label: '序厅',
    prompt: '序厅、入口形象区、第一视觉记忆点，强调开场仪式感、主题总览、品牌或展览核心精神的瞬间建立。',
  },
  {
    id: 'outro-hall',
    label: '尾厅',
    prompt: '尾厅、收束空间、出口前的情绪沉淀区，强调总结升华、互动留念、未来展望与完整参观体验的余韵。',
  },
  {
    id: 'highlight-space',
    label: '重亮点展项空间',
    prompt: '重亮点展项空间、核心展品或核心叙事节点，强调聚焦、沉浸、强视觉识别、戏剧化灯光与高完成度展陈体验。',
  },
];

const SPACE_TYPE_IDS = new Set(EXHIBITION_CREATIVE_SPACE_TYPES.map((item) => item.id));

export function cleanExhibitionCreativeText(value, max = 12000) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

export function normalizeExhibitionCreativeSpaceType(value) {
  const id = String(value || '').trim();
  return SPACE_TYPE_IDS.has(id) ? id : 'intro-hall';
}

export function normalizeExhibitionCreativeCount(value) {
  const number = Math.floor(Number(value) || 1);
  return Math.max(1, Math.min(12, number));
}

export function exhibitionCreativeSpaceTypeMeta(value) {
  const id = normalizeExhibitionCreativeSpaceType(value);
  return EXHIBITION_CREATIVE_SPACE_TYPES.find((item) => item.id === id) || EXHIBITION_CREATIVE_SPACE_TYPES[0];
}

export function normalizeExhibitionCreativeBrief(value) {
  return cleanExhibitionCreativeText(value, 5000)
    .replace(/^```(?:json|markdown|md)?/i, '')
    .replace(/```$/i, '')
    .replace(/^\s*(?:创意描述|方案描述|空间创意|概念描述)\s*[:：]\s*/i, '')
    .trim();
}

export function buildExhibitionCreativeBriefPrompt(values = {}) {
  const meta = exhibitionCreativeSpaceTypeMeta(values.spaceType);
  const projectTheme = cleanExhibitionCreativeText(values.projectTheme, 500);
  const inspiration = cleanExhibitionCreativeText(values.inspiration, 2000);
  const roundIndex = Math.max(1, Number(values.roundIndex) || 1);
  const total = normalizeExhibitionCreativeCount(values.total || values.generationCount || 1);
  const previousBriefs = Array.isArray(values.previousBriefs)
    ? values.previousBriefs.map((item) => cleanExhibitionCreativeText(item, 800)).filter(Boolean)
    : [];
  const lines = [
    `请基于输入图片中的室内建筑空间，创作第 ${roundIndex}/${total} 个${meta.label}展陈空间生图创意描述。`,
    `空间类型：${meta.label}。${meta.prompt}`,
    '输入图片只用于确定室内建筑空间的几何关系、透视角度、尺度、开口、墙体、柱网、吊顶、地面和主要动线，不要擅自改成另一套空间。',
    '请从展陈叙事、空间气质、核心装置、灯光氛围、材料语言、互动方式、观众视线组织和拍摄画面完成度等角度给出可直接用于图生图的创意描述。',
    '输出 180 到 320 字中文自然段，只输出创意描述本身，不要标题、编号、Markdown、解释、参数表或英文翻译。',
  ];
  if (projectTheme) lines.push(`项目主题/展览关键词：${projectTheme}`);
  if (inspiration) lines.push(`个人灵感补充：${inspiration}`);
  if (previousBriefs.length > 0) {
    lines.push('已有创意方向，新的描述需要明显区分，避免重复：');
    previousBriefs.slice(-5).forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }
  if (values.regenerateEachTime === false) {
    lines.push('本轮后续图片会复用同一创意描述，因此请给出稳定、完整、可反复变体的主创意方向。');
  } else {
    lines.push('请让本轮创意与同批次其他结果形成差异化，适合多方案比选。');
  }
  return lines.join('\n');
}

export function buildExhibitionCreativeImagePrompt(values = {}) {
  const meta = exhibitionCreativeSpaceTypeMeta(values.spaceType);
  const projectTheme = cleanExhibitionCreativeText(values.projectTheme, 500);
  const inspiration = cleanExhibitionCreativeText(values.inspiration, 2000);
  const creativeBrief = normalizeExhibitionCreativeBrief(values.creativeBrief || values.brief);
  const roundIndex = Math.max(1, Number(values.roundIndex) || 1);
  const total = normalizeExhibitionCreativeCount(values.total || values.generationCount || 1);
  const lines = [
    `生成一张专业${meta.label}展陈空间效果图，第 ${roundIndex}/${total} 张。真实室内建筑摄影级渲染，空间尺度可信，材质细节清晰，灯光层次准确，画面干净完整。`,
    `空间类型：${meta.label}。${meta.prompt}`,
    '',
    '【输入空间图约束】',
    '输入图像是唯一的室内建筑空间依据。必须保留原图的空间几何、透视角度、层高尺度、主要墙体/柱网/开口、吊顶关系、地面边界、入口出口、通行动线和前后左右空间关系。',
    '允许在该空间内植入展陈装置、展墙、展柜、灯光、图文层级、数字媒体和互动界面；不得把空间改成另一处建筑，不得改变主要开口、承重结构和真实尺度关系。',
    '',
    '【LLM创意描述】',
    creativeBrief || '围绕该室内空间生成具有强记忆点的展陈创意：以主题叙事为核心，在入口/核心/收束视线位置组织主视觉装置、沉浸光影、展陈工艺和观众动线，形成可落地的高完成度展陈效果图。',
  ];
  if (projectTheme) lines.push(`项目主题：${projectTheme}`);
  if (inspiration) lines.push(`个人灵感：${inspiration}`);
  lines.push('');
  lines.push('【设计深化要求】');
  lines.push('画面应适合序厅、尾厅或重点展项空间的方案比选：有清晰主视觉焦点、明确参观路径、可信材料工艺、可实施的灯光系统、适度的信息层级和高品质空间氛围。');
  lines.push('展墙图文可使用抽象占位块、光带、图像面板和不可读的小字质感表达，不要生成可读错字、乱码文字、真实品牌标识、说明表格或把提示词字段直接渲染到墙面。');
  lines.push('不要出现“LLM创意描述”“个人灵感”“空间类型”“输入空间图约束”等字段名，也不要把上述设计说明作为上墙文字。');
  lines.push('最终画面必须看得出来自同一张输入室内空间图，只是在展陈创意、灯光、材料、装置和叙事氛围上形成新的方案。');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
