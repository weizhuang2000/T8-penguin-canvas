export type GameUiFlowMode = 'state-graph' | 'linear' | 'branching-story';
export type GameUiDemoMode = 'static' | 'prototype';
export type GameUiTrigger = 'tap' | 'swipe-left' | 'swipe-right' | 'timeout';
export type GameUiConditionOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'truthy' | 'falsy';
export type GameUiEffectOperation = 'set' | 'increment' | 'decrement' | 'toggle';

export interface GameUiVariable {
  id: string;
  label: string;
  type: 'boolean' | 'number' | 'string';
  initialValue: boolean | number | string;
}

export interface GameUiElement {
  id: string;
  type: string;
  label: string;
  description: string;
}

export interface GameUiCondition {
  variableId: string;
  operator: GameUiConditionOperator;
  value?: boolean | number | string;
}

export interface GameUiEffect {
  variableId: string;
  operation: GameUiEffectOperation;
  value?: boolean | number | string;
}

export interface GameUiHotspot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameUiInteraction {
  id: string;
  label: string;
  trigger: GameUiTrigger;
  elementId: string;
  hotspot: GameUiHotspot;
  conditions: GameUiCondition[];
  effects: GameUiEffect[];
  targetScreenId: string | null;
  feedback: {
    type: 'none' | 'toast' | 'highlight' | 'modal';
    message: string;
  };
}

export interface GameUiScreen {
  id: string;
  index: number;
  title: string;
  purpose: string;
  layout: string;
  stateSummary: string;
  elements: GameUiElement[];
  interactions: GameUiInteraction[];
  imagePrompt: string;
}

export interface GameUiScript {
  schemaVersion: 1;
  title: string;
  concept: string;
  flowMode: GameUiFlowMode;
  initialScreenId: string;
  globalVisual: string;
  variables: GameUiVariable[];
  screens: GameUiScreen[];
}

export interface GameUiDesignStyle {
  id: string;
  label: string;
  prompt: string;
}

export const GAME_UI_FLOW_MODES: Array<{ id: GameUiFlowMode; label: string; description: string }> = [
  { id: 'state-graph', label: '界面状态图', description: '以状态变量、条件和可回访页面组织互动。' },
  { id: 'linear', label: '线性步骤流', description: '按固定顺序演示完整操作路径。' },
  { id: 'branching-story', label: '剧情分支树', description: '通过选择进入不同剧情路径和结局。' },
];

export const GAME_UI_DEMO_MODES: Array<{ id: GameUiDemoMode; label: string }> = [
  { id: 'static', label: '静态界面与逻辑说明' },
  { id: 'prototype', label: '图片热点交互原型' },
];

export const GAME_UI_DESIGN_STYLES: GameUiDesignStyle[] = [
  { id: 'auto', label: '自动匹配', prompt: '' },
  { id: 'tech-dashboard', label: '科技数据大屏', prompt: '深蓝黑底、高亮青蓝数据、模块化信息卡、清晰图表和动态光轨，专业可信，适合科技馆、企业展厅与成果展示' },
  { id: 'future-hud', label: '未来 HUD', prompt: '未来舱 HUD、环形扫描界面、细线框、坐标网格、粒子和能量光效，具有科幻沉浸感但保持触控按钮清晰可读' },
  { id: 'digital-twin', label: '数字孪生控制台', prompt: '三维园区或设备数字孪生主视觉，左右参数面板、底部时间轴和状态告警，工业级控制台秩序与真实数据可视化' },
  { id: 'glassmorphism', label: '玻璃拟态交互', prompt: '半透明磨砂玻璃面板、柔和背景光晕、清晰层级阴影和大圆角触控卡片，精致现代且不牺牲文字对比度' },
  { id: 'immersive-story', label: '深色沉浸叙事', prompt: '全屏电影级场景图、暗色渐变遮罩、少量悬浮控件和重点聚光，突出故事氛围、角色与空间代入感' },
  { id: 'museum-elegant', label: '博物馆典雅', prompt: '米白、深褐与低饱和金色，克制留白、精细分隔线、展签式排版和文物细节特写，庄重安静且具有文化权威感' },
  { id: 'chinese-trend', label: '文化国潮', prompt: '传统纹样、东方色彩、现代扁平图形与层叠卷轴结构结合，适量金红青绿点缀，文化辨识度强但避免繁复堆砌' },
  { id: 'kids-science', label: '儿童科普卡通', prompt: '明亮友好色彩、圆润角色、夸张反馈动画、大图标和超大触控按钮，信息简单有趣，适合亲子与低龄观众' },
  { id: 'eco-nature', label: '生态自然', prompt: '自然绿、湖蓝和暖白，植物、水体、地形等有机形态，柔和渐变与轻量信息图，营造环保、生命与可持续主题' },
  { id: 'minimal-brand', label: '极简品牌发布', prompt: '大面积品牌主色与留白、超大标题、单一强视觉焦点、严格网格和高品质微动效，适合企业品牌与产品发布体验' },
  { id: 'industrial-archive', label: '工业档案', prompt: '深灰金属、工程蓝图、编号标签、机械结构线稿和档案时间轴，粗犷可靠，适合工业史、制造业与遗产展陈' },
  { id: 'pixel-game', label: '像素游戏', prompt: '统一像素网格、有限色板、街机按钮、得分条和逐帧反馈，复古游戏感明确，同时保证大屏像素边缘干净' },
  { id: 'tactile-3d', label: '3D 拟物互动', prompt: '高品质三维物体、真实材质、柔和环境光和可按压拟物控件，强调旋转、拆解、组装等直接操控体验' },
  { id: 'art-installation', label: '艺术装置实验', prompt: '抽象生成艺术、流体粒子、非对称构图和声音可视化式图形，保留极简导航与明确热点，适合艺术馆和互动装置' },
];

export function resolveGameUiDesignStyle(value: unknown): GameUiDesignStyle {
  return GAME_UI_DESIGN_STYLES.find((item) => item.id === String(value || 'auto')) || GAME_UI_DESIGN_STYLES[0];
}

const FLOW_MODE_SET = new Set(GAME_UI_FLOW_MODES.map((item) => item.id));
const TRIGGER_SET = new Set<GameUiTrigger>(['tap', 'swipe-left', 'swipe-right', 'timeout']);
const CONDITION_SET = new Set<GameUiConditionOperator>(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy']);
const EFFECT_SET = new Set<GameUiEffectOperation>(['set', 'increment', 'decrement', 'toggle']);
const FEEDBACK_SET = new Set(['none', 'toast', 'highlight', 'modal']);
const ID_RE = /^[a-z][a-z0-9-]{1,47}$/;

function extractJsonObject(input: string): string {
  const text = String(input || '').trim();
  if (!text) throw new Error('LLM 未返回互动游戏脚本');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const source = fenced || text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM 返回内容中没有 JSON 对象');
  return source.slice(start, end + 1);
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value as Record<string, any>;
}

function text(value: unknown, label: string, allowEmpty = false, max = 8000): string {
  if (typeof value !== 'string') throw new Error(`${label} 缺失`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${label} 不能为空`);
  if ([...normalized].length > max) throw new Error(`${label} 内容过长`);
  return normalized;
}

export function resolveGameUiGlobalVisual(raw: Record<string, any>, concept: string): string {
  const aliases = [
    raw.globalVisual,
    raw.global_visual,
    raw.visualStyle,
    raw.visual_style,
    raw.styleGuide,
    raw.artDirection,
  ];
  const configured = aliases.find((value) => typeof value === 'string' && value.trim());
  if (configured) return text(configured, 'globalVisual', false, 3000);
  return [
    `围绕“${concept}”建立统一的 16:9 大屏互动视觉系统`,
    '所有界面沿用一致的品牌主色、字体层级、图标语言、圆角、间距和材质',
    '采用远距离清晰可读的高对比信息层级与大尺寸触控控件',
    '背景、面板、按钮、反馈状态和动效定格保持连续，四周保留大屏安全留白',
  ].join('；');
}

export function enrichGameUiImagePrompt(input: {
  imagePrompt?: unknown;
  purpose: string;
  layout: string;
  stateSummary: string;
  elements: GameUiElement[];
  globalVisual: string;
}): string {
  const original = typeof input.imagePrompt === 'string' ? input.imagePrompt.trim() : '';
  if ([...original].length >= 60) return original;
  const elementSummary = input.elements
    .map((element) => `${element.label || element.id}：${element.description}`)
    .join('；');
  const parts = [
    original,
    `界面用途：${input.purpose}`,
    `16:9 大屏布局：${input.layout}`,
    `当前状态：${input.stateSummary}`,
    elementSummary ? `必须呈现的 UI 元素：${elementSummary}` : '',
    `统一视觉系统：${input.globalVisual}`,
  ].filter(Boolean);
  let enriched = parts.join('；').replace(/[；。\s]+$/, '');
  if ([...enriched].length < 60) {
    enriched += '；使用远距离清晰可读的层级、高对比触控控件、统一图标与材质，四周保留大屏安全留白，呈现关键动效发生瞬间';
  }
  return enriched;
}

function id(value: unknown, label: string): string {
  const normalized = text(value, label, false, 48);
  if (!ID_RE.test(normalized)) throw new Error(`${label} 必须使用小写英文、数字和短横线，并以字母开头`);
  return normalized;
}

function primitive(value: unknown, label: string): boolean | number | string {
  if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`${label} 只能是布尔值、数字或字符串`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${label} 数字无效`);
  return value;
}

function hotspot(value: unknown, label: string): GameUiHotspot {
  const raw = record(value, label);
  const out = {
    x: Number(raw.x),
    y: Number(raw.y),
    width: Number(raw.width),
    height: Number(raw.height),
  };
  if (Object.values(out).some((item) => !Number.isFinite(item))) throw new Error(`${label} 坐标无效`);
  if (out.x < 0 || out.y < 0 || out.width <= 0 || out.height <= 0 || out.x + out.width > 100 || out.y + out.height > 100) {
    throw new Error(`${label} 必须位于 0–100% 画布范围内`);
  }
  return out;
}

function uniqueIds(items: Array<{ id: string }>, label: string) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`${label} ID 重复：${item.id}`);
    seen.add(item.id);
  }
}

function assertReachable(script: GameUiScript) {
  const byId = new Map(script.screens.map((screen) => [screen.id, screen]));
  const visited = new Set<string>();
  const queue = [script.initialScreenId];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const interaction of byId.get(current)?.interactions || []) {
      if (interaction.targetScreenId && !visited.has(interaction.targetScreenId)) queue.push(interaction.targetScreenId);
    }
  }
  const missing = script.screens.filter((screen) => !visited.has(screen.id)).map((screen) => screen.id);
  if (missing.length) throw new Error(`存在从初始界面不可达的界面：${missing.join('、')}`);
}

function assertModeRules(script: GameUiScript) {
  if (script.flowMode === 'linear') {
    for (let index = 0; index < script.screens.length - 1; index += 1) {
      const current = script.screens[index];
      const next = script.screens[index + 1];
      if (!current.interactions.some((item) => item.targetScreenId === next.id)) {
        throw new Error(`线性步骤流的界面 ${current.id} 缺少前往 ${next.id} 的互动`);
      }
    }
    return;
  }
  if (script.flowMode === 'branching-story') {
    const hasBranch = script.screens.some((screen) => new Set(screen.interactions.map((item) => item.targetScreenId).filter(Boolean)).size >= 2);
    const hasEnding = script.screens.some((screen) => screen.interactions.length === 0 || screen.interactions.some((item) => item.targetScreenId === null));
    if (!hasBranch) throw new Error('剧情分支树至少需要一个通往不同界面的多选分支');
    if (!hasEnding) throw new Error('剧情分支树至少需要一个终局');
    return;
  }
  const hasEffect = script.screens.some((screen) => screen.interactions.some((item) => item.effects.length > 0));
  const screenIndex = new Map(script.screens.map((screen, index) => [screen.id, index]));
  const hasConditionOrReturn = script.screens.some((screen, index) => screen.interactions.some((item) => (
    item.conditions.length > 0 || (item.targetScreenId !== null && (screenIndex.get(item.targetScreenId) ?? index + 1) <= index)
  )));
  if (!hasEffect) throw new Error('界面状态图至少需要一个状态修改效果');
  if (!hasConditionOrReturn) throw new Error('界面状态图至少需要条件跳转或可回访路径');
}

export function parseGameUiScript(input: string, expectedMode?: GameUiFlowMode): GameUiScript {
  let raw: Record<string, any>;
  try {
    raw = record(JSON.parse(extractJsonObject(input)), '脚本 JSON 顶层');
  } catch (error: any) {
    if (error?.message?.includes('LLM') || error?.message?.includes('必须') || error?.message?.includes('缺失')) throw error;
    throw new Error(`脚本 JSON 解析失败：${error?.message || error}`);
  }
  const flowMode = String(raw.flowMode || '') as GameUiFlowMode;
  if (!FLOW_MODE_SET.has(flowMode)) throw new Error('flowMode 无效');
  if (expectedMode && flowMode !== expectedMode) throw new Error(`flowMode 必须为 ${expectedMode}`);
  if (!Array.isArray(raw.variables)) throw new Error('variables 必须是数组');
  if (!Array.isArray(raw.screens) || raw.screens.length < 4 || raw.screens.length > 8) throw new Error('screens 必须包含 4–8 个界面');
  const title = text(raw.title, 'title', false, 200);
  const concept = text(raw.concept, 'concept', false, 3000);
  const globalVisual = resolveGameUiGlobalVisual(raw, concept);

  const variables: GameUiVariable[] = raw.variables.map((value: unknown, index: number) => {
    const item = record(value, `变量 ${index + 1}`);
    const type = String(item.type || '');
    if (!['boolean', 'number', 'string'].includes(type)) throw new Error(`变量 ${index + 1} type 无效`);
    const initialValue = primitive(item.initialValue, `变量 ${index + 1} initialValue`);
    if (typeof initialValue !== type) throw new Error(`变量 ${index + 1} initialValue 与 type 不一致`);
    return { id: id(item.id, `变量 ${index + 1} id`), label: text(item.label, `变量 ${index + 1} label`), type: type as GameUiVariable['type'], initialValue };
  });
  uniqueIds(variables, '变量');
  const variableIds = new Set(variables.map((item) => item.id));

  const screens: GameUiScreen[] = raw.screens.map((value: unknown, position: number) => {
    const item = record(value, `界面 ${position + 1}`);
    if (!Array.isArray(item.elements) || !Array.isArray(item.interactions)) throw new Error(`界面 ${position + 1} 缺少 elements 或 interactions 数组`);
    const elements: GameUiElement[] = item.elements.map((elementValue: unknown, elementIndex: number) => {
      const element = record(elementValue, `界面 ${position + 1} 元素 ${elementIndex + 1}`);
      return {
        id: id(element.id, `界面 ${position + 1} 元素 ${elementIndex + 1} id`),
        type: text(element.type, `界面 ${position + 1} 元素 ${elementIndex + 1} type`, false, 60),
        label: text(element.label, `界面 ${position + 1} 元素 ${elementIndex + 1} label`, true, 200),
        description: text(element.description, `界面 ${position + 1} 元素 ${elementIndex + 1} description`, false, 1000),
      };
    });
    uniqueIds(elements, `界面 ${position + 1} 元素`);
    const elementIds = new Set(elements.map((element) => element.id));
    const interactions: GameUiInteraction[] = item.interactions.map((interactionValue: unknown, interactionIndex: number) => {
      const interaction = record(interactionValue, `界面 ${position + 1} 互动 ${interactionIndex + 1}`);
      const trigger = String(interaction.trigger || '') as GameUiTrigger;
      if (!TRIGGER_SET.has(trigger)) throw new Error(`界面 ${position + 1} 互动 ${interactionIndex + 1} trigger 无效`);
      const elementId = text(interaction.elementId, `界面 ${position + 1} 互动 ${interactionIndex + 1} elementId`, trigger === 'timeout', 48);
      if (elementId && !elementIds.has(elementId)) throw new Error(`互动引用了不存在的元素 ${elementId}`);
      if (!Array.isArray(interaction.conditions) || !Array.isArray(interaction.effects)) throw new Error('互动 conditions 和 effects 必须是数组');
      const conditions: GameUiCondition[] = interaction.conditions.map((conditionValue: unknown, conditionIndex: number) => {
        const condition = record(conditionValue, `条件 ${conditionIndex + 1}`);
        const variableId = id(condition.variableId, `条件 ${conditionIndex + 1} variableId`);
        const operator = String(condition.operator || '') as GameUiConditionOperator;
        if (!variableIds.has(variableId)) throw new Error(`条件引用了不存在的变量 ${variableId}`);
        if (!CONDITION_SET.has(operator)) throw new Error(`条件 ${conditionIndex + 1} operator 无效`);
        const needsValue = !['truthy', 'falsy'].includes(operator);
        return { variableId, operator, ...(needsValue ? { value: primitive(condition.value, `条件 ${conditionIndex + 1} value`) } : {}) };
      });
      const effects: GameUiEffect[] = interaction.effects.map((effectValue: unknown, effectIndex: number) => {
        const effect = record(effectValue, `效果 ${effectIndex + 1}`);
        const variableId = id(effect.variableId, `效果 ${effectIndex + 1} variableId`);
        const operation = String(effect.operation || '') as GameUiEffectOperation;
        if (!variableIds.has(variableId)) throw new Error(`效果引用了不存在的变量 ${variableId}`);
        if (!EFFECT_SET.has(operation)) throw new Error(`效果 ${effectIndex + 1} operation 无效`);
        const needsValue = operation !== 'toggle';
        return { variableId, operation, ...(needsValue ? { value: primitive(effect.value, `效果 ${effectIndex + 1} value`) } : {}) };
      });
      const feedback = record(interaction.feedback, `互动 ${interactionIndex + 1} feedback`);
      const feedbackType = String(feedback.type || 'none') as GameUiInteraction['feedback']['type'];
      if (!FEEDBACK_SET.has(feedbackType)) throw new Error(`互动 ${interactionIndex + 1} feedback.type 无效`);
      return {
        id: id(interaction.id, `界面 ${position + 1} 互动 ${interactionIndex + 1} id`),
        label: text(interaction.label, `界面 ${position + 1} 互动 ${interactionIndex + 1} label`),
        trigger,
        elementId,
        hotspot: hotspot(interaction.hotspot, `界面 ${position + 1} 互动 ${interactionIndex + 1} hotspot`),
        conditions,
        effects,
        targetScreenId: interaction.targetScreenId === null ? null : id(interaction.targetScreenId, `互动 ${interactionIndex + 1} targetScreenId`),
        feedback: { type: feedbackType, message: text(feedback.message, `互动 ${interactionIndex + 1} feedback.message`, true, 500) },
      };
    });
    uniqueIds(interactions, `界面 ${position + 1} 互动`);
    const purpose = text(item.purpose, `界面 ${position + 1} purpose`);
    const layout = text(item.layout, `界面 ${position + 1} layout`);
    const stateSummary = text(item.stateSummary, `界面 ${position + 1} stateSummary`);
    const imagePrompt = enrichGameUiImagePrompt({
      imagePrompt: item.imagePrompt,
      purpose,
      layout,
      stateSummary,
      elements,
      globalVisual,
    });
    return {
      id: id(item.id, `界面 ${position + 1} id`),
      index: position + 1,
      title: text(item.title, `界面 ${position + 1} title`),
      purpose,
      layout,
      stateSummary,
      elements,
      interactions,
      imagePrompt,
    };
  });
  uniqueIds(screens, '界面');
  const screenIds = new Set(screens.map((screen) => screen.id));
  for (const screen of screens) {
    for (const interaction of screen.interactions) {
      if (interaction.targetScreenId && !screenIds.has(interaction.targetScreenId)) throw new Error(`互动引用了不存在的目标界面 ${interaction.targetScreenId}`);
    }
  }
  const initialScreenId = id(raw.initialScreenId, 'initialScreenId');
  if (!screenIds.has(initialScreenId)) throw new Error('initialScreenId 不存在');
  const script: GameUiScript = {
    schemaVersion: 1,
    title,
    concept,
    flowMode,
    initialScreenId,
    globalVisual,
    variables,
    screens,
  };
  assertReachable(script);
  assertModeRules(script);
  return script;
}

export function buildGameUiScriptMessages(brief: string, flowMode: GameUiFlowMode, designStyle: GameUiDesignStyle = GAME_UI_DESIGN_STYLES[0]) {
  const mode = GAME_UI_FLOW_MODES.find((item) => item.id === flowMode) || GAME_UI_FLOW_MODES[0];
  return [
    {
      role: 'system' as const,
      content: [
        '你是互动游戏策划、UX 架构师和大屏触控 UI 导演。',
        `把用户需求设计成“${mode.label}”：${mode.description}`,
        '面向甲方效果演示和 16:9 大屏触控，自动规划 4–8 个必要界面。只输出一个 JSON 对象，不要 Markdown 或解释。',
        '顶层字段必须为 schemaVersion、title、concept、flowMode、initialScreenId、globalVisual、variables、screens；schemaVersion 固定为 1。',
        'variables 每项为 id、label、type(boolean/number/string)、initialValue。screens 每项为 id、index、title、purpose、layout、stateSummary、elements、interactions、imagePrompt。',
        'elements 每项为 id、type、label、description。interactions 每项为 id、label、trigger、elementId、hotspot、conditions、effects、targetScreenId、feedback。',
        '所有 id 使用小写英文、数字和短横线且以字母开头。hotspot 使用 x/y/width/height 百分比，必须位于 0–100 范围且覆盖对应可点击区域。',
        'trigger 只能是 tap、swipe-left、swipe-right、timeout；timeout 可使用空 elementId。',
        'condition.operator 只能是 eq/ne/gt/gte/lt/lte/truthy/falsy；effect.operation 只能是 set/increment/decrement/toggle。禁止输出代码、表达式或脚本字符串。',
        'feedback.type 只能是 none/toast/highlight/modal，message 可为空。targetScreenId 为目标界面 id，终止互动使用 null。',
        '所有界面必须从 initialScreenId 可达。线性模式依次连接每个界面；剧情分支模式必须有多选分支和终局；状态图必须修改变量，并包含条件跳转或回访路径。',
        '每个 imagePrompt 至少 100 个中文字符，精确描述 16:9 大屏 UI：背景、层级、控件位置、真实可读的简短中文、品牌气质、色彩、材质、图标、动效定格和安全留白。所有界面保持同一视觉系统。',
        designStyle.prompt ? `指定 UI 设计风格为“${designStyle.label}”：${designStyle.prompt}。globalVisual、所有界面布局和 imagePrompt 必须统一遵循该风格。` : '根据用户需求、展厅主题和视觉参考图自动选择统一的 UI 设计风格。',
      ].join('\n'),
    },
    { role: 'user' as const, content: brief.trim() },
  ];
}

export function buildGameUiRepairMessages(rawResponse: string, brief: string, flowMode: GameUiFlowMode, error: string) {
  return [
    {
      role: 'system' as const,
      content: `修复互动游戏 JSON。flowMode 必须为 ${flowMode}，界面数 4–8，所有引用有效且从初始界面可达，符合对应模式规则。只能使用声明式条件和效果，不得输出代码。只返回合法 JSON。`,
    },
    { role: 'user' as const, content: `原始需求：\n${brief}\n\n校验错误：${error}\n\n待修复内容：\n${rawResponse}` },
  ];
}

export function formatGameUiScreen(screen: GameUiScreen): string {
  const lines = [
    `界面 ${screen.index}｜${screen.title}`,
    `用途：${screen.purpose}`,
    `布局：${screen.layout}`,
    `状态：${screen.stateSummary}`,
    `UI 元素：${screen.elements.map((item) => `${item.label || item.id}（${item.description}）`).join('；')}`,
  ];
  for (const interaction of screen.interactions) {
    const target = interaction.targetScreenId || '结束';
    lines.push(`互动：${interaction.label}｜${interaction.trigger} → ${target}${interaction.feedback.message ? `｜反馈：${interaction.feedback.message}` : ''}`);
  }
  lines.push(`生图提示词：${screen.imagePrompt}`);
  return lines.join('\n');
}

export function gameUiTextSegments(script: GameUiScript): string[] {
  return script.screens.map(formatGameUiScreen);
}

export function formatGameUiScript(script: GameUiScript): string {
  const mode = GAME_UI_FLOW_MODES.find((item) => item.id === script.flowMode)?.label || script.flowMode;
  return [
    `项目：${script.title}`,
    `流程：${mode}`,
    `概念：${script.concept}`,
    `全局视觉：${script.globalVisual}`,
    ...gameUiTextSegments(script),
  ].join('\n\n');
}

export function buildGameUiImagePrompt(script: GameUiScript, screen: GameUiScreen, referenceImageCount = 0, designStyle: GameUiDesignStyle = GAME_UI_DESIGN_STYLES[0]): string {
  return [
    '生成一张 16:9 横向、无外框的互动游戏大屏 UI 最终效果图，只呈现当前一个完整界面，不要宫格、样机、透视屏幕或设计稿标注。',
    '目标为展厅或发布会的大型触摸屏：远距离易读、按钮触控面积充足、层级明确、边缘保留安全区。',
    `项目：${script.title}。核心概念：${script.concept}`,
    `统一视觉系统：${script.globalVisual}`,
    designStyle.prompt ? `UI 设计风格：${designStyle.label}。${designStyle.prompt}` : '',
    `当前界面：${screen.title}。用途：${screen.purpose}`,
    `布局：${screen.layout}`,
    `状态：${screen.stateSummary}`,
    `必须出现的 UI 元素：${screen.elements.map((item) => `${item.label || item.id}：${item.description}`).join('；')}`,
    screen.imagePrompt,
    referenceImageCount > 0 ? `已提供 ${referenceImageCount} 张视觉参考图，保持角色、品牌、场景、材质和色彩一致，不要把参考图画成拼贴板。` : '',
    '界面文字只使用上述简短中文标签，不生成长段说明、乱码、水印、Logo 占位符或额外页面。',
  ].filter(Boolean).join('\n');
}

export function gameUiVisualFingerprint(script: GameUiScript, screen: GameUiScreen, references: string[], designStyleId = 'auto'): string {
  return JSON.stringify({ globalVisual: script.globalVisual, title: script.title, concept: script.concept, designStyleId, screen: {
    id: screen.id,
    title: screen.title,
    purpose: screen.purpose,
    layout: screen.layout,
    stateSummary: screen.stateSummary,
    elements: screen.elements,
    imagePrompt: screen.imagePrompt,
  }, references });
}

export function gameUiGridLayout(count: number) {
  const screens = Math.max(1, Math.min(8, Math.floor(Number(count) || 1)));
  const rows = 2;
  const cols = Math.ceil(screens / rows);
  const cellWidth = 960;
  const cellHeight = 540;
  const gap = 16;
  return { rows, cols, cellWidth, cellHeight, gap, width: cols * cellWidth + (cols - 1) * gap, height: rows * cellHeight + gap };
}
