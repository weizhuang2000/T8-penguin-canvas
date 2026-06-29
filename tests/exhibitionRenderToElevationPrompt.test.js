import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenderToElevationAnalysisMessages,
  buildRenderToElevationImagePrompt,
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

test('render to elevation llm fallback prompt includes strict JSON schema and image part', () => {
  const messages = buildRenderToElevationAnalysisMessages({
    sourceText: '序厅做品牌墙，尾厅做荣誉墙',
    referenceImage: '/files/output/demo.png',
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[1].content[0].text, /"elevations"/);
  assert.match(messages[1].content[0].text, /自动判断可拆分的立面/);
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
