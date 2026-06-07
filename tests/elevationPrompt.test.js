import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildElevationAnalysisMessages,
  buildElevationOutputs,
  parseElevationAnalysisResponse,
  wallsFromAnalysis,
} from '../src/utils/elevationPromptData.js';

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
  const result = buildElevationOutputs({
    analysis,
    walls: wallsFromAnalysis(analysis, 'multi', 3),
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

test('analysis messages request strict JSON and preserve document text', () => {
  const messages = buildElevationAnalysisMessages('原始文档正文', 'multi', 4, 800);
  assert.match(messages[0].content, /只输出 JSON/);
  assert.match(messages[0].content, /约 4 个连续立面/);
  assert.match(messages[0].content, /约 800 字/);
  assert.equal(messages[1].content, '原始文档正文');
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
