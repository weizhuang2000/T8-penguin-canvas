import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildElevationAnalysisMessages,
  buildElevationContentPlanMessages,
  buildElevationOutputs,
  parseElevationContentPlanResponse,
  parseElevationAnalysisResponse,
  wallsFromAnalysis,
} from '../src/utils/elevationPromptData.js';

const elevationNodeSource = fs.readFileSync(new URL('../src/components/nodes/ElevationPromptNode.tsx', import.meta.url), 'utf-8');

const analysis = {
  projectTheme: '海洋文明',
  coreMessage: '讲述港口与城市共同成长的历史。',
  sections: [
    { title: '第一章 起航', shortTitle: '向海而生', keyQuotes: ['港口连接世界'], displayFocus: '港口起源与城市诞生', suggestedCrafts: ['展板'] },
    { title: '第二章 发展', shortTitle: '潮涌新城', keyQuotes: ['开放带来繁荣'], displayFocus: '产业与城市发展', suggestedCrafts: ['灯箱'] },
    { title: '第三章 未来', shortTitle: '蓝色未来', keyQuotes: ['建设智慧港口'], displayFocus: '科技与生态愿景', suggestedCrafts: ['LED 屏'] },
  ],
};

test('AI response parser accepts fenced JSON and rejects invalid payload', () => {
  const parsed = parseElevationAnalysisResponse(`\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``);
  assert.equal(parsed.projectTheme, '海洋文明');
  assert.equal(parsed.sections.length, 3);
  assert.throws(() => parseElevationAnalysisResponse('不是 JSON'), /有效 JSON/);
});

test('multi-wall analysis is distributed into requested wall count', () => {
  const walls = wallsFromAnalysis(analysis, 'multi', 2);
  assert.equal(walls.length, 2);
  assert.match(walls[0].title, /向海而生/);
  assert.match(walls[1].content, /科技与生态愿景/);
});

test('elevation outputs include crafts, concept prompts and accurate schedule', () => {
  const wallsWithoutCraftLimits = wallsFromAnalysis(analysis, 'multi', 3).map(({ craftIds, craftNotes, ...wall }) => wall);
  const result = buildElevationOutputs({
    analysis,
    walls: wallsWithoutCraftLimits,
    wallMode: 'multi',
    outputMode: 'segments',
    downstreamContent: 'combined',
    selectedCrafts: ['panel', 'dimensional-letters', 'soft-film-lightbox'],
    dimensions: '每面 6m × 3m',
    density: '适中',
    colorMaterial: '深蓝与香槟金',
    visualStyle: '现代海洋科技',
  });

  assert.equal(result.conceptPrompts.length, 3);
  assert.equal(result.textSegments.length, 3);
  assert.match(result.conceptPrompts[0], /立体字标题/);
  assert.match(result.layoutSchedule, /港口连接世界/);
  assert.match(result.textSegments[0], /准确排版清单/);
});

test('elevation outputs use configured craft presets', () => {
  const result = buildElevationOutputs({
    analysis,
    walls: wallsFromAnalysis(analysis, 'multi', 1),
    wallMode: 'multi',
    outputMode: 'segments',
    downstreamContent: 'combined',
    selectedCrafts: ['custom-craft'],
    craftPresets: [
      { id: 'custom-craft', label: '定制工艺', prompt: '定制工艺提示词' },
    ],
  });

  assert.match(result.conceptPrompts[0], /定制工艺提示词/);
  assert.match(result.layoutSchedule, /定制工艺/);
});

test('elevation node shows crafts by category with random counts', () => {
  assert.match(elevationNodeSource, /CRAFT_CATEGORIES = \['装饰', '多媒体', '艺术品', '展陈', '展柜', '展台', '顶部', '其它'\]/);
  assert.match(elevationNodeSource, /分类｜名称｜提示词/);
  assert.match(elevationNodeSource, /随机数量会在每次输出时从该分类未手动选中的工艺中补选/);
  assert.match(elevationNodeSource, /craftRandomCounts/);
});

test('elevation node exposes automatic split mode with read-only count', () => {
  assert.match(elevationNodeSource, /<option value="auto">自动拆分<\/option>/);
  assert.match(elevationNodeSource, /wallMode !== 'multi'/);
  assert.match(elevationNodeSource, /wallCount: wallMode === 'auto' \? nextWalls\.length : wallCount/);
});

test('content plan parser keeps wall craft choices and notes', () => {
  const payload = {
    projectTheme: '青花瓷展',
    coreMessage: '呈现青花瓷的历史、纹样与工艺',
    walls: [
      {
        id: 'wall-1',
        title: '瓷韵初见',
        content: '用立体字展示主标题，用图文展板展示青花瓷纹样演变。',
        exactText: ['瓷韵初见', '纹样演变'],
        craftIds: ['dimensional-letters', 'panel'],
        craftNotes: '立体字展示标题；图文展板展示青花瓷纹样。',
      },
    ],
  };

  const parsed = parseElevationContentPlanResponse(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``);

  assert.equal(parsed.projectTheme, '青花瓷展');
  assert.deepEqual(parsed.walls[0].craftIds, ['dimensional-letters', 'panel']);
  assert.match(parsed.walls[0].craftNotes, /图文展板展示青花瓷纹样/);
});

test('wall output uses only crafts selected for that wall when provided', () => {
  const result = buildElevationOutputs({
    analysis,
    walls: [
      {
        id: 'wall-1',
        title: '瓷韵初见',
        content: '展示青花瓷纹样和代表展品。',
        exactText: ['瓷韵初见'],
        craftIds: ['dimensional-letters', 'panel'],
        craftNotes: '立体字展示标题；图文展板展示青花瓷纹样。',
      },
    ],
    selectedCrafts: ['panel', 'dimensional-letters', 'soft-film-lightbox'],
    downstreamContent: 'combined',
  });

  assert.match(result.conceptPrompts[0], /立体字展示标题/);
  assert.match(result.conceptPrompts[0], /图文展板展示青花瓷纹样/);
  assert.doesNotMatch(result.conceptPrompts[0], /软膜灯箱/);
  assert.match(result.layoutSchedule, /立体字展示标题；图文展板展示青花瓷纹样/);
});

test('multi-wall segments omit wall number prefixes', () => {
  const combined = buildElevationOutputs({
    analysis,
    walls: wallsFromAnalysis(analysis, 'multi', 3),
    wallMode: 'multi',
    outputMode: 'segments',
    downstreamContent: 'combined',
  });
  const schedule = buildElevationOutputs({
    analysis,
    walls: wallsFromAnalysis(analysis, 'multi', 3),
    wallMode: 'multi',
    outputMode: 'segments',
    downstreamContent: 'schedule',
  });

  assert.doesNotMatch(combined.overviewPrompt, /【立面\s*1】/u);
  assert.doesNotMatch(combined.textSegments[0], /准确排版清单\s*---\s*\n立面\s*1/u);
  assert.doesNotMatch(schedule.textSegments[0], /^立面\s*1/u);
});

test('single-wall mode collapses multiple walls and never emits segments', () => {
  const result = buildElevationOutputs({
    analysis,
    walls: wallsFromAnalysis(analysis, 'multi', 3),
    wallMode: 'single',
    outputMode: 'segments',
    downstreamContent: 'concept',
  });
  assert.equal(result.walls.length, 1);
  assert.deepEqual(result.textSegments, []);
  assert.match(result.overviewPrompt, /共 1 面/);
});

test('auto wall mode lets AI-derived sections decide wall count', () => {
  const walls = wallsFromAnalysis(analysis, 'auto', 8);
  assert.equal(walls.length, analysis.sections.length);

  const result = buildElevationOutputs({
    analysis,
    wallMode: 'auto',
    outputMode: 'segments',
    downstreamContent: 'concept',
  });
  assert.equal(result.walls.length, analysis.sections.length);
  assert.equal(result.textSegments.length, analysis.sections.length);
  assert.match(result.overviewPrompt, new RegExp(`共 ${analysis.sections.length} 面`));
});

test('analysis messages request strict JSON and preserve document text', () => {
  const messages = buildElevationAnalysisMessages('原始文档正文', 'multi', 4, 800);
  assert.match(messages[0].content, /只输出 JSON/);
  assert.match(messages[0].content, /约 4 个连续立面/);
  assert.match(messages[0].content, /约 800 字/);
  assert.equal(messages[1].content, '原始文档正文');
});

test('analysis messages support automatic wall splitting', () => {
  const messages = buildElevationAnalysisMessages('原始文档正文', 'auto', 4, 800);
  assert.match(messages[0].content, /自动拆分为 1 到 12 个连续立面章节/);
  assert.match(messages[0].content, /sections 数组的长度就是最终立面数量/);
  assert.doesNotMatch(messages[0].content, /约 4 个连续立面/);
});

test('content plan messages ask for direct wall content with suitable crafts', () => {
  const messages = buildElevationContentPlanMessages({
    sourceText: '青花瓷纹样与代表器物',
    wallMode: 'multi',
    wallCount: 2,
    selectedCrafts: ['panel', 'showcase-niche'],
  });

  assert.match(messages[0].content, /直接根据用户内容生成/);
  assert.match(messages[0].content, /每个立面不需要使用全部候选工艺/);
  assert.match(messages[0].content, /用图文展板展示青花瓷纹样/);
  assert.equal(messages[1].content, '青花瓷纹样与代表器物');
});

test('content plan messages use space lighting as a precondition when enabled', () => {
  const disabled = buildElevationContentPlanMessages({
    sourceText: '展陈资料',
    spaceLightingEnabled: false,
    spaceLightingLevel: 'very-dark',
  });
  assert.doesNotMatch(disabled[0].content, /空间整体光照前置条件/);

  const enabled = buildElevationContentPlanMessages({
    sourceText: '展陈资料',
    spaceLightingEnabled: true,
    spaceLightingLevel: 'very-dark',
  });
  assert.match(enabled[0].content, /空间整体光照前置条件（必须优先遵守）：非常暗/);
  assert.match(enabled[0].content, /每个立面的 content、craftNotes 和画面组织描述都必须服务这个整体照明度/);
  assert.match(enabled[0].content, /避免大面积明亮背景/);
});

test('empty values still produce a usable one-wall template', () => {
  const result = buildElevationOutputs({ wallMode: 'single' });
  assert.equal(result.walls.length, 1);
  assert.match(result.mainOutput, /专业展陈彩立面/);
  assert.match(result.layoutSchedule, /待补充/);
});

test('manual layout schedule override is used for schedule output', () => {
  const result = buildElevationOutputs({
    analysis,
    wallMode: 'single',
    downstreamContent: 'schedule',
    layoutScheduleOverride: '人工确认版排版清单',
  });
  assert.equal(result.layoutSchedule, '人工确认版排版清单');
  assert.equal(result.mainOutput, '人工确认版排版清单');
});

test('content plan wall lengths are parsed, estimated and emitted to schedule output', () => {
  const parsed = parseElevationContentPlanResponse(JSON.stringify({
    projectTheme: 'Length test',
    coreMessage: 'Core',
    walls: [
      { id: 'wall-1', title: 'A', content: 'Short content', exactText: ['A'], craftNotes: 'Panels', approxLengthM: 7.5 },
      { id: 'wall-2', title: 'B', content: 'Long content '.repeat(40), exactText: ['B'], craftNotes: 'Panels', approxLengthM: -1 },
    ],
  }));
  assert.equal(parsed.walls[0].approxLengthM, 7.5);
  assert.ok(parsed.walls[1].approxLengthM > 0);

  const result = buildElevationOutputs({
    analysis,
    walls: parsed.walls,
    wallMode: 'multi',
    downstreamContent: 'schedule',
    wallRangeStart: 2,
    wallRangeEnd: 3,
  });
  assert.match(result.layoutSchedule, /立面长度：约 7\.5m/);
  assert.match(result.layoutSchedule, /立面长度：约 \d+\.\d+m/);
  assert.match(result.mainOutput, /当前效果图立面范围：第 2-3 面；范围总长度：约 \d+\.\d+m/);
  assert.ok(result.wallLengthTotalM > 7.5);
});
