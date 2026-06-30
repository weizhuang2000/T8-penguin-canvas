import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenderToElevationAnalysisMessages,
  buildRenderToElevationImagePrompt,
  parseElevationLengthMeters,
  parseElevationSectionsFromLlmResponse,
  parseElevationSectionsFromText,
} from '../src/utils/exhibitionRenderToElevationPromptData.js';

test('render to elevation parser reads numbered elevation sections', () => {
  const sections = parseElevationSectionsFromText([
    '立面1：序厅主形象墙',
    '内容：品牌精神与大标题',
    '',
    '立面 2: 发展历程墙',
    '时间轴、图文展板、灯箱',
    '',
    '立面三：荣誉墙',
    '奖项陈列和金属字',
  ].join('\n'));
  assert.equal(sections.length, 3);
  assert.equal(sections[0].index, 1);
  assert.equal(sections[0].title, '序厅主形象墙');
  assert.match(sections[1].content, /时间轴/);
  assert.equal(sections[2].index, 3);
  assert.equal(sections[2].title, '荣誉墙');
});

test('render to elevation image prompt defaults to img2img reference mode and can disable it', () => {
  const enabled = buildRenderToElevationImagePrompt({
    index: 1,
    title: '序厅主形象墙',
    content: '品牌大标题、序言、灯箱展板',
  });
  assert.match(enabled, /@img1/);
  assert.match(enabled, /形式参考/);
  assert.match(enabled, /透视墙面区域/);
  assert.match(enabled, /正投影/);
  assert.match(enabled, /平面展开/);

  const disabled = buildRenderToElevationImagePrompt({
    index: 1,
    title: '序厅主形象墙',
    content: '品牌大标题、序言、灯箱展板',
    img2imgModeEnabled: false,
  });
  assert.doesNotMatch(disabled, /@img1/);
  assert.doesNotMatch(disabled, /形式参考/);
  assert.doesNotMatch(disabled, /透视墙面区域/);
});

test('render to elevation parser marks long elevations for LLM craft-boundary split', () => {
  assert.equal(parseElevationLengthMeters('立面长度：12米，含主标题和展柜'), 12);
  const sections = parseElevationSectionsFromText([
    '立面1：序厅主形象墙',
    '长度：9米',
    '品牌大标题、序言、灯箱展板',
    '',
    '立面2：发展历程墙',
    '总长17米',
    '时间轴、图文展板、灯箱',
  ].join('\n'));
  assert.equal(sections.length, 2);
  assert.equal(sections[0].needsIntelligentSplit, true);
  assert.equal(sections[0].recommendedSplitCount, 2);
  assert.equal(sections[1].needsIntelligentSplit, true);
  assert.equal(sections[1].recommendedSplitCount, 3);
  assert.match(sections[0].craftBoundaryNotes, /工艺落位/);
  assert.match(sections[0].craftBoundaryNotes, /不要将同一工艺拆到两段立面图里/);
});

test('render to elevation prompt keeps intelligent split output visually unified', () => {
  const prompt = buildRenderToElevationImagePrompt({
    index: 2,
    title: '发展历程墙 2/3',
    content: '时间轴、图文展板、灯箱',
    splitIndex: 2,
    splitCount: 3,
    splitLengthMeters: 5.7,
    craftBoundaryNotes: '按时间轴节点和灯箱展柜落位拆分，灯箱组保持完整',
  });
  assert.match(prompt, /统一包装形式/);
  assert.match(prompt, /标题字/);
  assert.match(prompt, /不得使用白底留白画布/);
  assert.match(prompt, /第 2\/3 段/);
  assert.match(prompt, /工艺落位智能拆分/);
  assert.match(prompt, /不是机械均分切片/);
  assert.match(prompt, /不得把同一工艺模块拆到两个立面图里/);
  assert.match(prompt, /灯箱组保持完整/);
  assert.doesNotMatch(prompt, /长度均分拆分/);
});

test('render to elevation llm fallback prompt includes strict JSON schema and image part', () => {
  const messages = buildRenderToElevationAnalysisMessages({
    sourceText: '序厅做品牌墙，尾厅做荣誉墙',
    referenceImage: '/files/output/demo.png',
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[1].content[0].text, /"elevations"/);
  assert.match(messages[1].content[0].text, /自动判断可拆分的立面/);
  assert.match(messages[1].content[0].text, /超过 8 米/);
  assert.match(messages[1].content[0].text, /工艺落位/);
  assert.match(messages[1].content[0].text, /不要将一个工艺拆到两段立面图里/);
  assert.match(messages[1].content[0].text, /多个 elevations/);
  assert.equal(messages[1].content[1].type, 'image_url');
  assert.equal(messages[1].content[1].image_url.url, '/files/output/demo.png');
});

test('render to elevation parses llm JSON response', () => {
  const sections = parseElevationSectionsFromLlmResponse('```json\n{"elevations":[{"index":1,"title":"序厅","content":"主形象墙","styleAnchor":"红色金属","prompt":"正投影立面"}]}\n```');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, '序厅');
  assert.equal(sections[0].styleAnchor, '红色金属');
});

test('render to elevation image prompt keeps elevation constraints', () => {
  const prompt = buildRenderToElevationImagePrompt({
    index: 1,
    title: '序厅主形象墙',
    content: '品牌大标题、序言、灯箱展板',
    styleAnchor: '参照输入效果图中的红色金属和暖色灯光',
  });
  assert.match(prompt, /参照输入效果图风格/);
  assert.match(prompt, /独立展陈立面图/);
  assert.match(prompt, /正投影\/平面立面表达/);
  assert.match(prompt, /不要生成透视室内效果图/);
  assert.match(prompt, /只生成当前立面/);
});
