import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS,
  EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS,
  EXHIBITION_PLAN_LAYOUT_PRESETS,
  buildExhibitionPlanLayoutPrompt,
  buildExhibitionPlanOutlinePrompt,
  exhibitionPlanLayoutPresetText,
  formatExhibitionPlanOutline,
  normalizeExhibitionPlanLayoutPresetId,
  parseExhibitionPlanOutlineJson,
} from '../src/utils/exhibitionPlanLayoutPromptData.js';

test('exhibition plan layout prompt toggles route labels and descriptions', () => {
  const hidden = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '序厅：项目开篇\n产业展区：展示核心成果',
    layoutPresetId: 'one-way-loop',
    showRoute: false,
    showLabels: false,
    showDescriptions: false,
  });
  assert.match(hidden, /显示动线：关闭/);
  assert.match(hidden, /不要绘制箭头/);
  assert.match(hidden, /显示标注文字：关闭/);
  assert.match(hidden, /不要在图面上写展区名称/);
  assert.match(hidden, /显示说明文字：关闭/);
  assert.match(hidden, /不要加入说明框/);

  const visible = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '序厅：项目开篇',
    showRoute: true,
    showLabels: true,
    showDescriptions: true,
  });
  assert.match(visible, /显示动线：开启/);
  assert.match(visible, /显示标注文字：开启/);
  assert.match(visible, /显示说明文字：开启/);
});

test('exhibition plan layout prompt uses built-in layout style only', () => {
  const prompt = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '城市记忆展区：老城历史',
  });
  assert.match(prompt, /图1是唯一建筑平面图依据/);
  assert.match(prompt, /平面布局默认使用如下风格/);
  assert.match(prompt, /白色汇报底图/);
  assert.doesNotMatch(prompt, /图2/);
  assert.doesNotMatch(prompt, /样式参考图/);
  assert.match(prompt, /平面图解析说明：未填写/);
});

test('exhibition plan layout prompt follows the requested template order', () => {
  const prompt = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '展览主题：丝路酒脉：千年丝路，美酒飘香\n\n1. 序厅：丝路酒脉形象区\n以动态丝绸之路浮雕地图统领全展。',
    planInterpretation: '总体宽30米，长40米，蓝色线条代表墙体，灰色方块代表柱子，都不可移动，红色指向图中心的箭头是入口，指向图外侧的是出口',
    layoutPresetId: 'balanced',
    insertItems: ['large-sculpture', 'relief', 'group-sculpture', 'art-installation', 'multimedia-equipment', 'showcase', 'scene', 'artwork'],
    excludeItems: ['readable-wrong-text', 'real-brand-logo', 'instruction-table', 'crowded-people', 'messy-cables', 'cartoon-style', 'blurry-low-quality', 'floating-islands', 'isolated-columns'],
    showRoute: true,
    showLabels: true,
    showDescriptions: true,
  });
  const expectedOrder = [
    'Use case: exhibition-floor-plan-layout.',
    'Primary request: 基于输入的原始建筑平面图，在原图上进行绘制专业展陈平面布局透明叠加层，覆盖在原图上完成最终平面布局图，原图在最底层并且不要进行任何改动',
    '输入图像说明：图1是唯一建筑平面图依据。平面布局默认使用如下风格',
    '结构锁定模式：开启。请只生成透明背景的展陈布局叠加层 overlay',
    '平面图解析说明：总体宽30米，长40米，蓝色线条代表墙体，灰色方块代表柱子，都不可移动，红色指向图中心的箭头是入口，指向图外侧的是出口',
    '必须严格保留图1的建筑外轮廓、墙体边界、柱网、门洞、入口、通道宽度关系和房间几何',
    '展陈大纲目录：',
    '展览主题：丝路酒脉：千年丝路，美酒飘香',
    '布局要求预设：按展陈大纲均衡分配各展区面积',
    '植入项展示手段：大型雕塑、浮雕、群雕、艺术装置、多媒体设备、文物柜/展柜、场景复原和艺术品/主题展项',
    '排除项：可读错字/乱码文字、真实品牌标识、说明表格、过多人群、杂乱线缆、卡通低幼风格、低清晰度/模糊画面、孤立漂浮展区和孤零零不连接任何物体的柱子',
    '显示动线：开启。',
    '显示标注文字：开启。',
    '显示说明文字：开启。',
    '空间通行硬约束：',
    '单元分隔要求：',
    '柱网与孤立物约束：',
    '图面表达：',
    '质量约束：',
  ];
  let cursor = -1;
  for (const part of expectedOrder) {
    const next = prompt.indexOf(part);
    assert.ok(next > cursor, `expected "${part}" after index ${cursor}`);
    cursor = next;
  }
});

test('exhibition plan layout prompt includes preset and custom requirement', () => {
  const prompt = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '核心展项：城市模型',
    layoutPresetId: 'highlight-core',
    layoutRequirement: '入口右侧设置接待台，尾厅靠近出口。',
  });
  assert.match(prompt, /围绕一个或多个核心展项组织空间/);
  assert.match(prompt, /入口右侧设置接待台/);
  assert.equal(normalizeExhibitionPlanLayoutPresetId('missing'), 'balanced');
  assert.ok(EXHIBITION_PLAN_LAYOUT_PRESETS.length >= 8);
  assert.match(exhibitionPlanLayoutPresetText('family-learning'), /研学/);
});

test('exhibition plan outline prompt and parser support json and text fallback', () => {
  const request = buildExhibitionPlanOutlinePrompt({
    sourceText: '第一章 城市源起。第二章 产业创新。',
    projectTheme: '城市发展馆',
    insertItems: ['large-sculpture', 'showcase'],
    excludeItems: ['real-brand-logo'],
  });
  assert.match(request, /提炼用于展陈平面自动布局/);
  assert.match(request, /城市发展馆/);
  assert.match(request, /指定植入项展示手段：大型雕塑和文物柜\/展柜/);
  assert.match(request, /displayMethods/);
  assert.match(request, /排除项：真实品牌标识/);

  const parsed = parseExhibitionPlanOutlineJson(JSON.stringify({
    title: '城市发展馆',
    zones: [
      { name: '城市源起', summary: '展示城市历史根脉。', displayMethods: ['浮雕', '展柜'], priority: 1, areaHint: '入口附近', routeHint: '接序厅' },
    ],
  }));
  assert.equal(parsed.title, '城市发展馆');
  assert.equal(parsed.zones[0].name, '城市源起');
  assert.deepEqual(parsed.zones[0].displayMethods, ['浮雕', '展柜']);
  assert.equal(parsed.zones[0].areaHint, '入口附近');

  const fallback = parseExhibitionPlanOutlineJson('序厅：建立第一印象\n产业创新：展示成果');
  assert.equal(fallback.zones.length, 2);
  assert.equal(fallback.zones[1].name, '产业创新');
  assert.match(formatExhibitionPlanOutline(parsed), /展览主题：城市发展馆/);
  assert.match(formatExhibitionPlanOutline(parsed), /展示手段：浮雕、展柜/);
});

test('exhibition plan layout prompt uses attachment style and hard layout constraints', () => {
  const prompt = buildExhibitionPlanLayoutPrompt({
    layoutOutlineText: '序厅：开篇\n第一单元：历史根脉\n第二单元：城市印记',
    planInterpretation: '总体宽30米，长40米，蓝色线条代表墙体，灰色方块代表柱子，都不可移动',
    insertItems: ['showcase', 'art-installation'],
    excludeItems: ['isolated-columns'],
    showRoute: true,
  });
  assert.match(prompt, /平面布局默认使用如下风格/);
  assert.match(prompt, /平面图解析说明：总体宽30米，长40米，蓝色线条代表墙体，灰色方块代表柱子，都不可移动/);
  assert.match(prompt, /比例、尺寸、颜色含义、墙体、柱子、门洞、入口、不可移动结构和可布展范围/);
  assert.match(prompt, /必须优先遵守，不得与图1冲突/);
  assert.match(prompt, /结构锁定模式：开启/);
  assert.match(prompt, /只生成透明背景的展陈布局叠加层 overlay/);
  assert.match(prompt, /这些建筑结构会由程序直接保留图1原始底图并在最后合成/);
  assert.match(prompt, /不要重画、描摹、修改或新增任何建筑墙体、柱子/);
  assert.match(prompt, /空白区域保持透明/);
  assert.match(prompt, /红色虚线参观动线和箭头/);
  assert.match(prompt, /动线必须从入口到出口连续穿过所有展陈单元和展区/);
  assert.match(prompt, /每个单元都必须被主参观动线实际进入或贴近穿过/);
  assert.match(prompt, /不能遗漏任何单元/);
  assert.match(prompt, /空间通行硬约束/);
  assert.match(prompt, /不能出现任何完全闭合、没有门洞\/开口\/通道连接的展陈空间或单元/);
  assert.match(prompt, /至少保留一个清晰可通行入口和一个可继续前进的出口或通道节点/);
  assert.match(prompt, /单元分隔要求/);
  assert.match(prompt, /文物柜、展柜、核心展项、艺术品、浮雕墙、半高隔断或装置隔开/);
  assert.match(prompt, /柱网与孤立物约束/);
  assert.match(prompt, /不得出现柱子或小构筑物孤零零地漂浮/);
  assert.match(prompt, /植入项展示手段：文物柜\/展柜和艺术装置/);
  assert.match(prompt, /排除项：孤零零不连接任何物体的柱子/);
  assert.ok(EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS.length >= 8);
  assert.ok(EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS.some((item) => item.id === 'isolated-columns'));
});
