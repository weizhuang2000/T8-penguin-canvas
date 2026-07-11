export const EXHIBITION_SCENE_CATEGORIES = [
  { id: 'historical-restoration', label: '历史复原场景', prompt: '历史空间复原、时代器物、人物活动和叙事背景完整呈现' },
  { id: 'life-context', label: '生活情境场景', prompt: '日常生活情境、人物关系、生活器具和可感知的时间氛围' },
  { id: 'production-craft', label: '生产/工艺场景', prompt: '生产流程、工艺步骤、工具设备和劳动动作清晰可读' },
  { id: 'war-event', label: '战争/事件场景', prompt: '重大事件瞬间、冲突关系、纪念性情绪和叙事焦点' },
  { id: 'technology-interactive', label: '科技互动场景', prompt: '互动屏幕、感应装置、科技展项和观众参与关系' },
  { id: 'immersive-digital', label: '沉浸式数字场景', prompt: '环幕投影、数字内容、沉浸氛围和空间包裹感' },
  { id: 'ecological-nature', label: '生态自然场景', prompt: '自然环境、生境层次、动植物关系和生态科普表达' },
  { id: 'urban-regional', label: '城市/地域街区场景', prompt: '街区肌理、地域符号、城市生活和文化记忆' },
  { id: 'figure-narrative', label: '人物群像叙事场景', prompt: '人物群像、动作关系、情绪节奏和故事线索' },
  { id: 'archaeological-site', label: '考古遗址场景', prompt: '遗址剖面、考古现场、土层结构和文物出土关系' },
  { id: 'intangible-folk', label: '非遗民俗场景', prompt: '民俗活动、非遗工艺、服饰道具和节庆氛围' },
  { id: 'future-vision', label: '未来愿景场景', prompt: '未来城市、科技愿景、低碳生态和前瞻性空间想象' },
];

export const EXHIBITION_SCENE_PRESENTATION_FORMS = [
  { id: 'realistic-reconstruction', label: '实景复原', prompt: 'full-scale realistic reconstruction with props, surfaces, figures, and spatial depth' },
  { id: 'diorama-painting', label: '半景画/场景画', prompt: 'diorama style with foreground objects and painted or printed background extension' },
  { id: 'sculpture-group', label: '雕塑群像', prompt: 'sculptural figure group integrated with a scenographic base and background' },
  { id: 'projection-fusion', label: '数字投影融合', prompt: 'projection mapped scene, physical set and digital imagery blended together' },
  { id: 'immersive-cyclorama', label: '沉浸式环幕', prompt: 'immersive wraparound screen or cyclorama with strong environmental atmosphere' },
  { id: 'interactive-installation', label: '互动装置', prompt: 'interactive installation with visitor touchpoints, sensors, screens, and feedback' },
  { id: 'sand-table-model', label: '沙盘模型', prompt: 'scaled model or sand table scene, miniature spatial narrative with labels and lighting' },
  { id: 'showcase-scene', label: '橱窗式场景', prompt: 'showcase window scene, framed display, compact depth and curated props' },
  { id: 'open-photo-spot', label: '开放式打卡场景', prompt: 'open walk-in scene for visitor photo moments, durable props and clear theme sign' },
  { id: 'theatrical-scene', label: '剧场式场景', prompt: 'theatrical scenography, dramatic lighting, staged composition and narrative focus' },
];

export const EXHIBITION_SCENE_SPATIAL_SCALES = [
  { id: 'cabinet', label: '展柜/橱窗尺度', prompt: 'compact showcase-scale scene, controlled depth, close viewing distance' },
  { id: 'wall-bay', label: '墙面展项尺度', prompt: 'wall bay scale scene, integrated with panels, reliefs, graphics, and lighting' },
  { id: 'room-corner', label: '展厅角落尺度', prompt: 'corner or partial-room scene, walk-by viewing and clear spatial boundary' },
  { id: 'full-room', label: '整厅沉浸尺度', prompt: 'full-room immersive scene, visitor circulation and enveloping environment' },
  { id: 'outdoor-plaza', label: '室外/序厅尺度', prompt: 'large entrance hall or outdoor plaza scene, strong landmark presence' },
];

export const EXHIBITION_SCENE_ATMOSPHERES = [
  { id: 'warm-memory', label: '温暖记忆', prompt: 'warm light, nostalgic material tone, humane and intimate atmosphere' },
  { id: 'solemn-epic', label: '庄重史诗', prompt: 'solemn contrast, monumental lighting, ceremonial and commemorative mood' },
  { id: 'mysterious-archaeology', label: '神秘考古', prompt: 'low grazing light, earth tones, excavation mystery and discovery feeling' },
  { id: 'bright-science', label: '明亮科普', prompt: 'clean bright light, legible displays, precise and educational atmosphere' },
  { id: 'immersive-drama', label: '沉浸戏剧', prompt: 'dramatic directional lighting, strong depth, immersive story mood' },
  { id: 'natural-ecology', label: '自然生态', prompt: 'natural daylight feeling, layered greens, habitat realism and soft shadows' },
  { id: 'future-tech', label: '未来科技', prompt: 'cool light, luminous interfaces, high-tech materials and futuristic ambience' },
];

export const EXHIBITION_SCENE_CROWD_DENSITIES = [
  { id: 'none', label: '无观众', prompt: 'no visitors, focus on scene and exhibit design only' },
  { id: 'few', label: '少量观众', prompt: 'a few visitors for scale reference, not blocking key exhibits' },
  { id: 'guided', label: '讲解参观', prompt: 'small guided group, one docent and several visitors, clear viewing relationship' },
  { id: 'busy', label: '热闹互动', prompt: 'lively visitor interaction, controlled crowd density, key scene remains readable' },
];

function normalizeId(value, options, fallback) {
  const id = String(value || '').trim();
  return options.some((item) => item.id === id) ? id : fallback;
}

export function cleanExhibitionSceneText(value, limit = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function normalizeExhibitionSceneCategory(value) {
  return normalizeId(value, EXHIBITION_SCENE_CATEGORIES, EXHIBITION_SCENE_CATEGORIES[0].id);
}

export function normalizeExhibitionScenePresentationForm(value) {
  return normalizeId(value, EXHIBITION_SCENE_PRESENTATION_FORMS, EXHIBITION_SCENE_PRESENTATION_FORMS[0].id);
}

export function normalizeExhibitionSceneSpatialScale(value) {
  return normalizeId(value, EXHIBITION_SCENE_SPATIAL_SCALES, EXHIBITION_SCENE_SPATIAL_SCALES[2].id);
}

export function normalizeExhibitionSceneAtmosphere(value) {
  return normalizeId(value, EXHIBITION_SCENE_ATMOSPHERES, EXHIBITION_SCENE_ATMOSPHERES[0].id);
}

export function normalizeExhibitionSceneCrowdDensity(value) {
  return normalizeId(value, EXHIBITION_SCENE_CROWD_DENSITIES, EXHIBITION_SCENE_CROWD_DENSITIES[1].id);
}

export function exhibitionSceneCategoryMeta(value) {
  const id = normalizeExhibitionSceneCategory(value);
  return EXHIBITION_SCENE_CATEGORIES.find((item) => item.id === id) || EXHIBITION_SCENE_CATEGORIES[0];
}

export function exhibitionScenePresentationFormMeta(value) {
  const id = normalizeExhibitionScenePresentationForm(value);
  return EXHIBITION_SCENE_PRESENTATION_FORMS.find((item) => item.id === id) || EXHIBITION_SCENE_PRESENTATION_FORMS[0];
}

export function exhibitionSceneSpatialScaleMeta(value) {
  const id = normalizeExhibitionSceneSpatialScale(value);
  return EXHIBITION_SCENE_SPATIAL_SCALES.find((item) => item.id === id) || EXHIBITION_SCENE_SPATIAL_SCALES[2];
}

export function exhibitionSceneAtmosphereMeta(value) {
  const id = normalizeExhibitionSceneAtmosphere(value);
  return EXHIBITION_SCENE_ATMOSPHERES.find((item) => item.id === id) || EXHIBITION_SCENE_ATMOSPHERES[0];
}

export function exhibitionSceneCrowdDensityMeta(value) {
  const id = normalizeExhibitionSceneCrowdDensity(value);
  return EXHIBITION_SCENE_CROWD_DENSITIES.find((item) => item.id === id) || EXHIBITION_SCENE_CROWD_DENSITIES[1];
}

export function buildExhibitionSceneExtractPrompt(values = {}) {
  const sourceText = cleanExhibitionSceneText(values.sourceText, 50000);
  return [
    '请从展陈资料中提炼“场景设计”所需的四段文案。',
    '输出 JSON，不要 Markdown，不要解释。',
    'JSON 结构：{"titleText":"适合作为场景标题的短句","themeText":"一句话主题概念","sceneText":"100-220 字场景设计说明","interactionText":"观众参与、人物道具或互动说明"}。',
    '要求：只基于资料提炼，不编造资料中没有的事实；文字应适合展陈方案汇报和图像生成。',
    '',
    sourceText,
  ].filter(Boolean).join('\n');
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function parseExhibitionSceneExtractJson(text) {
  const parsed = extractJsonObject(text);
  if (parsed && typeof parsed === 'object') {
    return {
      titleText: cleanExhibitionSceneText(parsed.titleText, 500),
      themeText: cleanExhibitionSceneText(parsed.themeText, 1000),
      sceneText: cleanExhibitionSceneText(parsed.sceneText, 4000),
      interactionText: cleanExhibitionSceneText(parsed.interactionText, 2000),
    };
  }
  const lines = String(text || '').split(/\r?\n/).map((line) => cleanExhibitionSceneText(line, 4000)).filter(Boolean);
  return {
    titleText: lines[0] || '',
    themeText: lines[1] || '',
    sceneText: lines[2] || '',
    interactionText: lines.slice(3).join('\n') || '',
  };
}

function referenceOrderText(urls, labelPrefix) {
  return urls.map((url, index) => `@img${index + 1}: ${labelPrefix}${index + 1} = ${url}`).join('\n');
}

export function buildExhibitionSceneImagePrompt(values = {}) {
  const optionMeta = (value, fallback) => value && typeof value === 'object'
    ? {
      id: cleanExhibitionSceneText(value.id, 96) || fallback.id,
      label: cleanExhibitionSceneText(value.label, 120) || fallback.label,
      prompt: cleanExhibitionSceneText(value.prompt, 1600) || fallback.prompt,
    }
    : fallback;
  const category = optionMeta(values.sceneCategoryOption, exhibitionSceneCategoryMeta(values.sceneCategory));
  const form = optionMeta(values.presentationFormOption, exhibitionScenePresentationFormMeta(values.presentationForm));
  const scale = optionMeta(values.spatialScaleOption, exhibitionSceneSpatialScaleMeta(values.spatialScale));
  const atmosphere = optionMeta(values.atmosphereOption, exhibitionSceneAtmosphereMeta(values.atmosphere));
  const crowd = optionMeta(values.crowdDensityOption, exhibitionSceneCrowdDensityMeta(values.crowdDensity));
  const titleText = cleanExhibitionSceneText(values.titleText, 500);
  const themeText = cleanExhibitionSceneText(values.themeText, 1200);
  const sceneText = cleanExhibitionSceneText(values.sceneText, 4000);
  const interactionText = cleanExhibitionSceneText(values.interactionText, 2000);
  const peoplePropsText = cleanExhibitionSceneText(values.peoplePropsText, 3000);
  const colorMaterial = cleanExhibitionSceneText(values.colorMaterial, 2000);
  const colorMaterialPalette = cleanExhibitionSceneText(values.colorMaterialPalette, 1500);
  const colorMaterialTextures = cleanExhibitionSceneText(values.colorMaterialTextures, 1500);
  const colorMaterialReferenceTone = cleanExhibitionSceneText(values.colorMaterialReferenceTone, 1500);
  const colorMaterialPriorityMode = values.colorMaterialPriorityMode === 'llm' ? 'llm' : 'frontend';
  const environmentImages = Array.isArray(values.environmentReferenceImages) ? values.environmentReferenceImages.filter(Boolean) : [];
  const colorMaterialImages = Array.isArray(values.colorMaterialReferenceImages) ? values.colorMaterialReferenceImages.filter(Boolean) : [];
  const peoplePropsImages = Array.isArray(values.peoplePropsReferenceImages) ? values.peoplePropsReferenceImages.filter(Boolean) : [];
  const hasEnvironmentReference = environmentImages.length > 0 || values.hasEnvironmentReferenceImage === true;
  const hasColorMaterialReference = colorMaterialImages.length > 0 || values.hasColorMaterialReferenceImage === true;
  const hasPeoplePropsReference = peoplePropsImages.length > 0 || values.hasPeoplePropsReferenceImage === true;
  const allReferenceImages = [...environmentImages, ...colorMaterialImages, ...peoplePropsImages];
  const colorMaterialOffset = environmentImages.length;
  const peoplePropsOffset = environmentImages.length + colorMaterialImages.length;
  const colorMaterialOrderText = colorMaterialImages
    .map((url, index) => `@img${colorMaterialOffset + index + 1}: 色彩与材质参考图${index + 1} = ${url}`)
    .join('\n');
  const peoplePropsOrderText = peoplePropsImages
    .map((url, index) => `@img${peoplePropsOffset + index + 1}: 人物/道具参考 ${index + 1} = ${url}`)
    .join('\n');

  const environmentText = hasEnvironmentReference
    ? [
      '整体环境参考图作用：只参考空间结构、风格气质、尺度关系、动线、光线氛围和大构图；不要照搬原图的具体展品、文字、logo、品牌或不可用细节。',
      environmentImages.length ? referenceOrderText(environmentImages, '整体环境参考 ') : '',
    ].filter(Boolean).join('\n')
    : '未提供整体环境参考图：请根据场景分类和展陈主题自行设计完整环境。';

  const colorMaterialTextBlock = [
    hasColorMaterialReference
      ? [
        '色彩与材质参考图作用：只参考整体色彩体系、主辅色比例、明暗冷暖、材质类别、表面肌理、粗糙度、反射/透明度、工艺质感和灯光氛围；不得复制该图的空间布局、构图、具体物体、人物、文字、logo、品牌或图案细节。',
        colorMaterialPriorityMode === 'llm'
          ? 'Color/material extraction mode: let the image model infer palette and materials from the reference image.'
          : 'Color/material extraction mode: use the preset/manual text and frontend recognized tone as priority; image is only a supporting color/material reference.',
        colorMaterialOrderText,
      ].filter(Boolean).join('\n')
      : '',
    colorMaterialPalette ? `Color palette：${colorMaterialPalette}` : '',
    colorMaterialTextures ? `Materials/textures：${colorMaterialTextures}` : '',
    colorMaterialReferenceTone ? `Frontend recognized color/material tone：${colorMaterialReferenceTone}` : '',
    colorMaterial && !colorMaterialPalette && !colorMaterialTextures ? `色彩与材质要求：${colorMaterial}` : '',
  ].filter(Boolean).join('\n');

  const peoplePropsTextBlock = hasPeoplePropsReference
    ? [
      '人物及道具参考图作用：参考人物姿态、服饰轮廓、道具类型、展项形态和情节元素；不要复制原图色彩、商标、文字或摄影背景。',
      '人物/道具参考图顺序如下，文案中的 @img 标记必须按此顺序理解：',
      peoplePropsOrderText,
      peoplePropsText ? `人物/道具补充说明：${peoplePropsText}` : '',
    ].filter(Boolean).join('\n')
    : (peoplePropsText ? `人物/道具补充说明：${peoplePropsText}` : '未提供人物及道具参考图：人物、道具和情节元素由模型根据主题自行设计。');

  return [
    '核心要求：生成专业展馆场景设计效果图，画面应像可用于展陈方案汇报的成熟空间场景方案。',
    `场景分类：${category.label}。${category.prompt}。`,
    `表现形式：${form.label}。${form.prompt}。`,
    `空间尺度：${scale.label}。${scale.prompt}。`,
    `氛围/灯光：${atmosphere.label}。${atmosphere.prompt}。`,
    `人群密度：${crowd.label}。${crowd.prompt}。`,
    environmentText,
    colorMaterialTextBlock,
    peoplePropsTextBlock,
    allReferenceImages.length ? `参考图总顺序：${allReferenceImages.map((_, index) => `@img${index + 1}`).join('、')}。` : '',
    titleText ? `标题文字：可将“${titleText}”作为场景标题或局部标识，但不要生成乱码。` : '标题文字：无明确标题时，不要强行生成大段文字。',
    themeText ? `主题概念：${themeText}` : '',
    sceneText ? `场景设计说明：${sceneText}` : '',
    interactionText ? `互动与叙事说明：${interactionText}` : '',
    '构图要求：主体场景完整、空间层次清楚、观众视线焦点明确，包含展陈结构、灯光、人物/道具、图文展项或互动装置之间的关系。',
    '质量约束：不要杂乱商场感，不要随机品牌 logo，不要错误文字，不要低清模糊，不要把场景画成普通室内装修或纯舞台布景。',
  ].filter(Boolean).join('\n');
}
