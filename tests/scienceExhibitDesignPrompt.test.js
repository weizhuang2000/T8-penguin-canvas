import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScienceExhibitDrawingPrompt,
  buildScienceExhibitExtractPrompt,
  buildScienceExhibitImagePrompt,
  buildScienceExhibitParameterMarkdown,
  normalizeScienceExhibitAudience,
  normalizeScienceExhibitBackground,
  normalizeScienceExhibitDimensions,
  normalizeScienceExhibitDomain,
  normalizeScienceExhibitDrawingSelection,
  parseScienceExhibitExtractJson,
  SCIENCE_EXHIBIT_DEFAULT_DRAWINGS,
} from '../src/utils/scienceExhibitDesignPromptData.js';

const analysis = {
  titleText: '风力发电互动展项',
  sciencePrinciple: '观众改变叶片角度，观察风能转化为电能的效率变化。',
  keyParameters: [
    { name: '叶片角度', range: '0-45', unit: 'deg', effect: '影响升力和转速' },
    { name: '风速', range: '2-8', unit: 'm/s', effect: '影响发电功率' },
  ],
  interactionFlow: '转动旋钮调整叶片角度，屏幕显示转速与功率曲线。',
  mechanismDesign: '风机模型、角度编码器、风速模拟、LED 反馈屏。',
  safetyMaintenance: '透明防护罩、低压供电、可开启维护门。',
  visualBrief: '明亮科技馆岛台，半透明风洞和可视化屏幕。',
  drawingNotes: '风机、旋钮、屏幕、传感器位置在所有图纸中保持一致。',
};

const dimensions = {
  widthMm: 2200,
  depthMm: 1600,
  heightMm: 1600,
  operationHeightMm: 900,
  safetyClearanceMm: 900,
  maintenanceClearanceMm: 600,
  estimatedPowerW: 800,
};

test('science exhibit extract prompt and parser cover required fields', () => {
  const prompt = buildScienceExhibitExtractPrompt({ sourceText: 'source text' });
  for (const key of ['sciencePrinciple', 'keyParameters', 'interactionFlow', 'safetyMaintenance', 'drawingNotes']) {
    assert.match(prompt, new RegExp(key));
  }
  assert.match(prompt, /真实科学原理/);
  assert.match(prompt, /不要编造/);

  const parsed = parseScienceExhibitExtractJson(JSON.stringify(analysis));
  assert.equal(parsed.titleText, analysis.titleText);
  assert.equal(parsed.keyParameters.length, 2);
  assert.equal(parsed.keyParameters[0].unit, 'deg');

  const fallback = parseScienceExhibitExtractJson('标题\n科学原理\n互动流程\n构成\n安全\n视觉\n图纸约束');
  assert.equal(fallback.titleText, '标题');
  assert.equal(fallback.sciencePrinciple, '科学原理');
  assert.equal(fallback.drawingNotes, '图纸约束');
});

test('normalizers use stable defaults', () => {
  assert.equal(normalizeScienceExhibitDomain('bad'), 'physics');
  assert.equal(normalizeScienceExhibitAudience('bad'), 'general');
  assert.equal(normalizeScienceExhibitBackground('bad'), 'white');
  assert.deepEqual(normalizeScienceExhibitDimensions({}, 'island'), dimensions);
  assert.deepEqual(normalizeScienceExhibitDrawingSelection(['exploded', 'render', 'bad']), ['exploded']);
  assert.deepEqual(normalizeScienceExhibitDrawingSelection([]), SCIENCE_EXHIBIT_DEFAULT_DRAWINGS);
});

test('main image prompt keeps real science and parameter consistency', () => {
  const prompt = buildScienceExhibitImagePrompt({
    scienceDomain: 'engineering',
    exhibitType: 'interactive-device',
    interactionMode: 'turn-handle',
    audience: 'teenagers',
    spatialScale: 'island',
    backgroundMode: 'white',
    dimensions,
    analysis,
    spaceReferenceImages: ['/files/input/space.png'],
    deviceReferenceImages: ['/files/input/device.png'],
  });
  assert.match(prompt, /真实科学原理/);
  assert.match(prompt, /不要伪科学/);
  assert.match(prompt, /参数关系前后一致/);
  assert.match(prompt, /@img1/);
  assert.match(prompt, /@img2/);
  assert.match(prompt, /HIGH PRIORITY style reference/);
  assert.match(prompt, /must influence the design/);
  assert.match(prompt, /2200mm/);
  assert.match(prompt, /900mm/);
  assert.match(prompt, /白背景|白底/);
  assert.match(prompt, /叶片角度/);
});

test('technical drawing prompts bind later drawings to render reference', () => {
  const parameterMarkdown = buildScienceExhibitParameterMarkdown({ analysis, dimensions, spatialScale: 'island' });
  assert.match(parameterMarkdown, /2200 x 1600 x 1600 mm/);
  assert.match(parameterMarkdown, /## 关键参数/);
  assert.match(parameterMarkdown, /叶片角度/);

  for (const drawingType of ['exploded', 'principle', 'orthographic', 'parameter-table']) {
    const prompt = buildScienceExhibitDrawingPrompt({
      drawingType,
      analysis,
      backgroundMode: 'white',
      dimensions,
      spatialScale: 'island',
      renderImage: '/files/output/render.png',
      previousDrawingImage: '/files/output/prev.png',
      userReferenceImages: ['/files/input/device.png'],
      parameterMarkdown,
    });
    assert.match(prompt, /800W/);
    if (drawingType === 'parameter-table') {
      assert.match(prompt, /TABLE ONLY/);
      assert.match(prompt, /no render image/);
      assert.match(prompt, /no orthographic views/);
      assert.match(prompt, /no thumbnails/);
    }
    if (drawingType === 'orthographic') {
      assert.match(prompt, /CAD/);
      assert.match(prompt, /orthographic projection|正交投影|正投影/);
      assert.match(prompt, /no perspective|不允许任何透视关系|禁止.*透视/);
      assert.match(prompt, /操作台.*设备.*零部件|operating table.*device.*parts/i);
      assert.match(prompt, /side elevation|left or right side projection/);
      assert.match(prompt, /depth \/ D/);
      assert.match(prompt, /width \/ W/);
      assert.match(prompt, /正视图横向缩短|压扁/);
    }
    assert.match(prompt, /@img1: 主效果图一致性参考/);
    assert.match(prompt, /同一科学原理/);
    assert.match(prompt, /同一参数体系/);
    assert.match(prompt, /不要伪科学/);
    assert.match(prompt, /不要乱标文字/);
    assert.match(prompt, /待工程校核/);
  }
});
