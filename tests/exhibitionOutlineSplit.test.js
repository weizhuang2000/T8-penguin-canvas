import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExhibitionOutlineSplitPrompt,
  fallbackOutlineSplit,
  formatOutlineSegments,
  MAX_OUTLINE_SEGMENT_COUNT,
  normalizeOutlineSegmentCount,
  parseExhibitionOutlineSplitJson,
} from '../src/utils/exhibitionOutlineSplitData.js';

test('exhibition outline split prompt supports manual and auto modes', () => {
  const manual = buildExhibitionOutlineSplitPrompt({
    sourceText: '第一部分介绍城市源起。第二部分介绍产业成果。',
    mode: 'manual',
    segmentCount: 3,
    projectTheme: '城市更新',
  });
  assert.match(manual, /严格拆分为 3 个单元/);
  assert.match(manual, /项目主题\/关键词：城市更新/);
  assert.match(manual, /weightPercent/);
  assert.match(manual, /合计 100/);

  const auto = buildExhibitionOutlineSplitPrompt({
    sourceText: '第一部分介绍城市源起。第二部分介绍产业成果。',
    mode: 'auto',
  });
  assert.match(auto, /分段模式：自动/);
  assert.match(auto, /自动判断合理单元数量/);
});

test('exhibition outline split parser accepts fenced JSON and normalizes segments', () => {
  const parsed = parseExhibitionOutlineSplitJson(`\`\`\`json
{
  "mode": "auto",
  "segmentCount": 2,
  "segments": [
    {
      "title": "序章",
      "summary": "提炼城市精神与展览开场。",
      "keywords": "城市精神、序厅,开场",
      "weightPercent": 70,
      "sourceHint": "第 1 章"
    },
    {
      "title": "产业成果",
      "summary": "总结重点产业、创新平台与代表性成果。",
      "keywords": ["产业", "创新", "成果"],
      "weightPercent": 70
    }
  ]
}
\`\`\``);

  assert.equal(parsed.mode, 'auto');
  assert.equal(parsed.segmentCount, 2);
  assert.equal(parsed.segments.length, 2);
  assert.equal(parsed.segments.reduce((sum, segment) => sum + segment.weightPercent, 0), 100);
  assert.deepEqual(parsed.segments.map((segment) => segment.weightPercent), [50, 50]);
  assert.deepEqual(parsed.segments[0].keywords, ['城市精神', '序厅', '开场']);
  assert.match(formatOutlineSegments(parsed.segments), /单元 2：产业成果（权重 50%）/);
});

test('exhibition outline split fallback chunks text by requested count', () => {
  const segments = fallbackOutlineSplit(
    ['城市源起与历史脉络。', '产业升级与创新平台。', '未来愿景与开放合作。'].join('\n\n'),
    2,
  );
  assert.equal(segments.length, 2);
  assert.equal(segments.reduce((sum, segment) => sum + segment.weightPercent, 0), 100);
  assert.equal(MAX_OUTLINE_SEGMENT_COUNT, 100);
  assert.equal(normalizeOutlineSegmentCount(999), 100);
  assert.match(formatOutlineSegments(segments), /规则分块/);
});
