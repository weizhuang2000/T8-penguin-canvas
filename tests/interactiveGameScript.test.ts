import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGameUiImagePrompt,
  buildGameUiScriptMessages,
  enrichGameUiImagePrompt,
  gameUiGridLayout,
  gameUiTextSegments,
  parseGameUiScript,
  resolveGameUiGlobalVisual,
  type GameUiFlowMode,
} from '../src/utils/interactiveGameScript.ts';

function scriptObject(mode: GameUiFlowMode = 'state-graph') {
  const screens = Array.from({ length: 4 }, (_, index) => ({
    id: `screen-${index + 1}`,
    index: index + 1,
    title: `界面 ${index + 1}`,
    purpose: `演示步骤 ${index + 1}`,
    layout: '16:9 横向大屏，顶部状态栏，中部主视觉，底部操作区。',
    stateSummary: `当前处于第 ${index + 1} 个演示状态。`,
    elements: [{ id: `button-${index + 1}`, type: 'button', label: index === 3 ? '完成' : '继续', description: '底部中央的大型触控按钮。' }],
    interactions: index === 3 ? [] : [{
      id: `go-${index + 1}`,
      label: '继续',
      trigger: 'tap',
      elementId: `button-${index + 1}`,
      hotspot: { x: 40, y: 80, width: 20, height: 10 },
      conditions: index === 2 && mode === 'state-graph' ? [{ variableId: 'score', operator: 'gte', value: 1 }] : [],
      effects: index === 0 ? [{ variableId: 'score', operation: 'increment', value: 1 }] : [],
      targetScreenId: `screen-${index + 2}`,
      feedback: { type: 'toast', message: '操作成功' },
    }],
    imagePrompt: `具有统一蓝紫色科技视觉的互动游戏大屏第 ${index + 1} 页，中央展示清晰的主视觉与游戏任务，底部设置大型圆角触控按钮，玻璃拟态面板、明亮高对比文字和粒子光效，四周保留安全留白，适合甲方演示。`,
  }));
  if (mode === 'state-graph') {
    screens[3].interactions = [{
      id: 'restart', label: '重新开始', trigger: 'tap', elementId: 'button-4',
      hotspot: { x: 40, y: 80, width: 20, height: 10 }, conditions: [], effects: [{ variableId: 'score', operation: 'set', value: 0 }],
      targetScreenId: 'screen-1', feedback: { type: 'toast', message: '已重置' },
    }];
  }
  if (mode === 'branching-story') {
    screens[0].elements.push({ id: 'choice-b', type: 'button', label: '另一条路', description: '右侧分支按钮。' });
    screens[0].interactions.push({
      id: 'branch-b', label: '选择另一条路', trigger: 'tap', elementId: 'choice-b',
      hotspot: { x: 65, y: 80, width: 20, height: 10 }, conditions: [], effects: [], targetScreenId: 'screen-3',
      feedback: { type: 'highlight', message: '已选择分支' },
    });
  }
  return {
    schemaVersion: 1,
    title: '星海寻宝',
    concept: '观众通过大屏触控寻找线索并完成挑战。',
    flowMode: mode,
    initialScreenId: 'screen-1',
    globalVisual: '蓝紫色科技展陈风，玻璃拟态面板和高对比触控按钮。',
    variables: [{ id: 'score', label: '得分', type: 'number', initialValue: 0 }],
    screens,
  };
}

test('interactive game parser validates all three flow modes', () => {
  for (const mode of ['state-graph', 'linear', 'branching-story'] as GameUiFlowMode[]) {
    const parsed = parseGameUiScript(JSON.stringify(scriptObject(mode)), mode);
    assert.equal(parsed.flowMode, mode);
    assert.equal(parsed.screens.length, 4);
    assert.equal(gameUiTextSegments(parsed).length, 4);
  }
});

test('interactive game parser rejects invalid references, hotspots and unreachable screens', () => {
  const invalidTarget = scriptObject();
  invalidTarget.screens[0].interactions[0].targetScreenId = 'missing-screen';
  assert.throws(() => parseGameUiScript(JSON.stringify(invalidTarget)), /不存在的目标界面/);

  const invalidHotspot = scriptObject();
  invalidHotspot.screens[0].interactions[0].hotspot.width = 80;
  assert.throws(() => parseGameUiScript(JSON.stringify(invalidHotspot)), /0–100%/);

  const unreachable = scriptObject('linear');
  unreachable.screens[1].interactions[0].targetScreenId = 'screen-4';
  assert.throws(() => parseGameUiScript(JSON.stringify(unreachable)), /不可达|缺少前往/);
});

test('interactive game parser enforces auto screen bounds and mode rules', () => {
  const tooShort = scriptObject();
  tooShort.screens = tooShort.screens.slice(0, 3);
  assert.throws(() => parseGameUiScript(JSON.stringify(tooShort)), /4–8/);

  const branch = scriptObject('branching-story');
  branch.screens[0].interactions = branch.screens[0].interactions.slice(0, 1);
  assert.throws(() => parseGameUiScript(JSON.stringify(branch)), /多选分支/);
});

test('interactive game parser locally enriches short or missing image prompts', () => {
  const shortPrompt = scriptObject();
  shortPrompt.screens[0].imagePrompt = '蓝紫色科技游戏首页。';
  const enriched = parseGameUiScript(JSON.stringify(shortPrompt)).screens[0].imagePrompt;
  assert.match(enriched, /蓝紫色科技游戏首页/);
  assert.match(enriched, /演示步骤 1/);
  assert.match(enriched, /顶部状态栏/);
  assert.match(enriched, /大型触控按钮/);
  assert.match(enriched, /统一视觉系统/);
  assert.ok([...enriched].length >= 60);

  delete (shortPrompt.screens[0] as any).imagePrompt;
  const recovered = parseGameUiScript(JSON.stringify(shortPrompt)).screens[0].imagePrompt;
  assert.match(recovered, /界面用途/);
  assert.ok([...recovered].length >= 60);

  const detailed = scriptObject().screens[0].imagePrompt;
  assert.equal(enrichGameUiImagePrompt({
    imagePrompt: detailed,
    purpose: '不追加',
    layout: '不追加',
    stateSummary: '不追加',
    elements: [],
    globalVisual: '不追加',
  }), detailed);
});

test('interactive game parser recovers missing globalVisual and accepts common aliases', () => {
  const missing = scriptObject();
  delete (missing as any).globalVisual;
  const recovered = parseGameUiScript(JSON.stringify(missing));
  assert.match(recovered.globalVisual, /星海寻宝|观众通过大屏触控/);
  assert.match(recovered.globalVisual, /统一的 16:9 大屏互动视觉系统/);
  assert.match(recovered.globalVisual, /高对比信息层级/);

  const aliased = scriptObject() as any;
  delete aliased.globalVisual;
  aliased.visual_style = '暖金色博物馆科技风，磨砂金属面板与深色背景。';
  assert.equal(parseGameUiScript(JSON.stringify(aliased)).globalVisual, aliased.visual_style);
  assert.match(resolveGameUiGlobalVisual({}, '海洋知识闯关'), /海洋知识闯关/);
});

test('interactive game prompts and grid layout target a 16:9 touch display', () => {
  const script = parseGameUiScript(JSON.stringify(scriptObject()), 'state-graph');
  const messages = buildGameUiScriptMessages('测试需求', 'state-graph');
  assert.match(String(messages[0].content), /4–8/);
  assert.match(String(messages[0].content), /16:9 大屏触控/);
  const prompt = buildGameUiImagePrompt(script, script.screens[0], 2);
  assert.match(prompt, /16:9/);
  assert.match(prompt, /2 张视觉参考图/);
  assert.deepEqual(gameUiGridLayout(5), { rows: 2, cols: 3, cellWidth: 960, cellHeight: 540, gap: 16, width: 2912, height: 1096 });
});
