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

export const GAME_UI_FLOW_MODES: Array<{ id: GameUiFlowMode; label: string; description: string }> = [
  { id: 'state-graph', label: '界面状态图', description: '以状态变量、条件和可回访页面组织互动。' },
  { id: 'linear', label: '线性步骤流', description: '按固定顺序演示完整操作路径。' },
  { id: 'branching-story', label: '剧情分支树', description: '通过选择进入不同剧情路径和结局。' },
];

export const GAME_UI_DEMO_MODES: Array<{ id: GameUiDemoMode; label: string }> = [
  { id: 'static', label: '静态界面与逻辑说明' },
  { id: 'prototype', label: '图片热点交互原型' },
];

export function isTransientGameUiLlmError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /HTTP\s*(408|425|429|500|502|503|504|524)\b|502\.3|Bad Gateway|Gateway Timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|timeout|timed out|network error|fetch failed/i.test(message);
}

export function friendlyGameUiLlmError(error: unknown, attempts = 3): Error {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!isTransientGameUiLlmError(error)) return error instanceof Error ? error : new Error(message || '脚本生成失败');
  const reason = /429/.test(message) ? '请求过于频繁' : /timeout|timed out|504|524/i.test(message) ? '上游响应超时' : '上游网关暂时不可用';
  return new Error(`脚本服务${reason}，已自动重试 ${attempts} 次。请稍后再试，或切换“脚本模型”。`);
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
    const imagePrompt = text(item.imagePrompt, `界面 ${position + 1} imagePrompt`, false, 8000);
    if ([...imagePrompt].length < 60) throw new Error(`界面 ${position + 1} imagePrompt 过于简单`);
    return {
      id: id(item.id, `界面 ${position + 1} id`),
      index: position + 1,
      title: text(item.title, `界面 ${position + 1} title`),
      purpose: text(item.purpose, `界面 ${position + 1} purpose`),
      layout: text(item.layout, `界面 ${position + 1} layout`),
      stateSummary: text(item.stateSummary, `界面 ${position + 1} stateSummary`),
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
    title: text(raw.title, 'title', false, 200),
    concept: text(raw.concept, 'concept', false, 3000),
    flowMode,
    initialScreenId,
    globalVisual: text(raw.globalVisual, 'globalVisual', false, 3000),
    variables,
    screens,
  };
  assertReachable(script);
  assertModeRules(script);
  return script;
}

export function buildGameUiScriptMessages(brief: string, flowMode: GameUiFlowMode) {
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

export function buildGameUiImagePrompt(script: GameUiScript, screen: GameUiScreen, referenceImageCount = 0): string {
  return [
    '生成一张 16:9 横向、无外框的互动游戏大屏 UI 最终效果图，只呈现当前一个完整界面，不要宫格、样机、透视屏幕或设计稿标注。',
    '目标为展厅或发布会的大型触摸屏：远距离易读、按钮触控面积充足、层级明确、边缘保留安全区。',
    `项目：${script.title}。核心概念：${script.concept}`,
    `统一视觉系统：${script.globalVisual}`,
    `当前界面：${screen.title}。用途：${screen.purpose}`,
    `布局：${screen.layout}`,
    `状态：${screen.stateSummary}`,
    `必须出现的 UI 元素：${screen.elements.map((item) => `${item.label || item.id}：${item.description}`).join('；')}`,
    screen.imagePrompt,
    referenceImageCount > 0 ? `已提供 ${referenceImageCount} 张视觉参考图，保持角色、品牌、场景、材质和色彩一致，不要把参考图画成拼贴板。` : '',
    '界面文字只使用上述简短中文标签，不生成长段说明、乱码、水印、Logo 占位符或额外页面。',
  ].filter(Boolean).join('\n');
}

export function gameUiVisualFingerprint(script: GameUiScript, screen: GameUiScreen, references: string[]): string {
  return JSON.stringify({ globalVisual: script.globalVisual, title: script.title, concept: script.concept, screen: {
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
