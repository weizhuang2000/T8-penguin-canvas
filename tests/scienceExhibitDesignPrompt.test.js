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
  normalizeScienceExhibitInteractions,
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
  const prompt = buildScienceExhibitExtractPrompt({
    sourceText: 'source text',
    scienceDomain: 'engineering',
    exhibitType: 'interactive-device',
    interactionMode: 'turn-handle',
    audience: 'teenagers',
    spatialScale: 'island',
    backgroundMode: 'white',
    dimensions,
    colorMaterial: '银灰金属外壳；透明亚克力防护罩',
    colorMaterialPalette: '银灰、冷白、蓝绿色点缀',
    colorMaterialTextures: '拉丝金属、磨砂亚克力',
    hasColorMaterialPreset: true,
  });
  for (const key of ['sciencePrinciple', 'keyParameters', 'interactionFlow', 'safetyMaintenance', 'drawingNotes']) {
    assert.match(prompt, new RegExp(key));
  }
  assert.match(prompt, /真实科学原理/);
  assert.match(prompt, /不要编造/);
  assert.match(prompt, /节点设计选项/);
  assert.match(prompt, /展项类型/);
  assert.match(prompt, /互动方式/);
  assert.match(prompt, /目标观众/);
  assert.match(prompt, /科学领域/);
  assert.match(prompt, /Color and material preset/);
  assert.match(prompt, /Color palette/);
  assert.match(prompt, /Materials\/textures/);
  assert.match(prompt, /不得用这些选项替代资料中的真实科学原理/);

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
  assert.deepEqual(normalizeScienceExhibitDrawingSelection(undefined), SCIENCE_EXHIBIT_DEFAULT_DRAWINGS);
  assert.deepEqual(normalizeScienceExhibitDrawingSelection([]), []);
  assert.deepEqual(normalizeScienceExhibitInteractions(['touch-screen', 'sensor-trigger', 'bad', 'touch-screen']), ['touch-screen', 'sensor-trigger']);
  assert.deepEqual(normalizeScienceExhibitInteractions([]), ['turn-handle']);
});

test('main image prompt keeps real science and parameter consistency', () => {
  const prompt = buildScienceExhibitImagePrompt({
    scienceDomain: 'engineering',
    exhibitType: 'interactive-device',
    interactionMode: 'turn-handle',
    audience: 'teenagers',
    spatialScale: 'island',
    backgroundMode: 'white',
    drawingSelection: [],
    dimensions,
    colorMaterial: '银灰金属外壳；透明亚克力防护罩；蓝绿色灯带',
    colorMaterialPalette: '银灰、冷白、蓝绿色点缀',
    colorMaterialTextures: '拉丝金属、磨砂亚克力、透明防护罩',
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
  assert.match(prompt, /Color and material preset/);
  assert.match(prompt, /Color palette/);
  assert.match(prompt, /Materials\/textures/);
  assert.match(prompt, /拉丝金属/);
  assert.match(prompt, /白背景|白底/);
  assert.match(prompt, /叶片角度/);
  assert.match(prompt, /SINGLE HERO RENDER ONLY/);
  assert.match(prompt, /NO EXPLODED VIEW/);
  assert.match(prompt, /当前未选择任何其它技术图纸/);
  assert.match(prompt, /不得出现爆炸分析、原理示意、三视图、参数表/);
});

test('main image prompt keeps selected drawings as later outputs only', () => {
  const prompt = buildScienceExhibitImagePrompt({
    drawingSelection: ['orthographic'],
    analysis: {
      ...analysis,
      drawingNotes: 'SHOULD_NOT_ENTER_RENDER_PROMPT',
    },
  });
  assert.match(prompt, /后续将另行生成/);
  assert.match(prompt, /三视图/);
  assert.match(prompt, /只能作为后续独立输出/);
  assert.match(prompt, /NO ORTHOGRAPHIC VIEWS/);
  assert.doesNotMatch(prompt, /SHOULD_NOT_ENTER_RENDER_PROMPT/);
});

test('science exhibit prompts use dynamic option definitions when provided', () => {
  const domainOptions = [{ id: 'custom-domain', label: '自定义科学领域', prompt: 'custom verified principle family', order: 0 }];
  const typeOptions = [{ id: 'custom-type', label: '自定义展项类型', prompt: 'custom exhibit mechanism type', order: 0 }];
  const interactionOptions = [{ id: 'custom-interaction', label: '自定义互动方式', prompt: 'custom visitor interaction behavior', order: 0 }];
  const audienceOptions = [{ id: 'custom-audience', label: '自定义目标观众', prompt: 'custom audience learning depth', order: 0 }];
  const scaleOptions = [{ id: 'custom-scale', label: '自定义空间尺度', prompt: 'custom spatial installation scale', order: 0 }];

  const extractPrompt = buildScienceExhibitExtractPrompt({
    sourceText: 'source text',
    scienceDomain: 'custom-domain',
    exhibitType: 'custom-type',
    interactionMode: 'custom-interaction',
    audience: 'custom-audience',
    spatialScale: 'custom-scale',
    domainOptions,
    typeOptions,
    interactionOptions,
    audienceOptions,
    scaleOptions,
  });
  assert.match(extractPrompt, /自定义科学领域/);
  assert.match(extractPrompt, /custom exhibit mechanism type/);
  assert.match(extractPrompt, /custom visitor interaction behavior/);

  const imagePrompt = buildScienceExhibitImagePrompt({
    scienceDomain: 'custom-domain',
    exhibitType: 'custom-type',
    interactionMode: 'custom-interaction',
    audience: 'custom-audience',
    spatialScale: 'custom-scale',
    analysis,
    domainOptions,
    typeOptions,
    interactionOptions,
    audienceOptions,
    scaleOptions,
  });
  assert.match(imagePrompt, /自定义空间尺度/);
  assert.match(imagePrompt, /custom audience learning depth/);
});

test('science exhibit prompts apply multiple selected interaction modes', () => {
  const interactionOptions = [
    { id: 'touch-screen', label: 'Touch choice', prompt: 'touchscreen parameter selection', order: 0 },
    { id: 'sensor-trigger', label: 'Sensor trigger', prompt: 'motion sensor triggers feedback', order: 1 },
  ];
  const extractPrompt = buildScienceExhibitExtractPrompt({
    sourceText: 'source text',
    interactionModes: ['touch-screen', 'sensor-trigger'],
    interactionOptions,
  });
  assert.match(extractPrompt, /Touch choice/);
  assert.match(extractPrompt, /Sensor trigger/);
  assert.match(extractPrompt, /同时贴合所有选中的互动方式/);

  const imagePrompt = buildScienceExhibitImagePrompt({
    interactionModes: ['touch-screen', 'sensor-trigger'],
    interactionOptions,
    analysis,
  });
  assert.match(imagePrompt, /touchscreen parameter selection/);
  assert.match(imagePrompt, /motion sensor triggers feedback/);
  assert.match(imagePrompt, /同时支持所有选中的互动方式/);
});

test('technical drawing prompts bind later drawings to render reference', () => {
  const parameterMarkdown = buildScienceExhibitParameterMarkdown({
    analysis,
    dimensions,
    spatialScale: 'island',
    colorMaterial: '银灰金属外壳；透明亚克力防护罩',
    colorMaterialPalette: '银灰、冷白、蓝绿色点缀',
    colorMaterialTextures: '拉丝金属、磨砂亚克力',
  });
  assert.match(parameterMarkdown, /2200 x 1600 x 1600 mm/);
  assert.match(parameterMarkdown, /## 关键参数/);
  assert.match(parameterMarkdown, /叶片角度/);
  assert.match(parameterMarkdown, /## 色彩与材质/);
  assert.match(parameterMarkdown, /Color palette/);
  assert.match(parameterMarkdown, /Materials\/textures/);

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
      colorMaterial: '银灰金属外壳；透明亚克力防护罩',
      colorMaterialPalette: '银灰、冷白、蓝绿色点缀',
      colorMaterialTextures: '拉丝金属、磨砂亚克力',
    });
    assert.match(prompt, /800W/);
    if (drawingType === 'parameter-table') {
      assert.match(prompt, /TABLE ONLY/);
      assert.match(prompt, /no render image/);
      assert.match(prompt, /no orthographic views/);
      assert.match(prompt, /no thumbnails/);
      assert.match(prompt, /Parameter table note/);
    }
    if (drawingType === 'orthographic') {
      assert.match(prompt, /CAD/);
      assert.match(prompt, /Orthographic CAD note/);
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
    assert.match(prompt, /Color and material preset/);
    assert.match(prompt, /Materials\/textures/);
    assert.match(prompt, /不要伪科学/);
    assert.match(prompt, /不要乱标文字/);
    assert.match(prompt, /待工程校核/);
  }
});

test('finished render mode drawing prompt uses only the finished image as reference', () => {
  const parameterMarkdown = buildScienceExhibitParameterMarkdown({
    analysis,
    dimensions,
    spatialScale: 'island',
  });
  const prompt = buildScienceExhibitDrawingPrompt({
    drawingType: 'orthographic',
    analysis,
    backgroundMode: 'white',
    dimensions,
    spatialScale: 'island',
    renderImage: '/files/input/finished.png',
    previousDrawingImage: '/files/output/exploded.png',
    userReferenceImages: ['/files/input/space.png', '/files/input/device.png'],
    parameterMarkdown,
    sourceText: '展项资料：风能转化演示。',
    supplement: '补充要求：统一部件编号。',
    finishedRenderMode: true,
  });
  assert.match(prompt, /唯一成品展项效果图参考/);
  assert.match(prompt, /不使用其它参考图/);
  assert.match(prompt, /不进行 LLM 提炼/);
  assert.match(prompt, /仅作为数据支撑/);
  assert.match(prompt, /展项资料/);
  assert.match(prompt, /补充要求/);
  assert.doesNotMatch(prompt, /用户原始参考/);
  assert.match(prompt, /CAD/);
  assert.match(prompt, /side elevation|left or right side projection/);

  const tablePrompt = buildScienceExhibitDrawingPrompt({
    drawingType: 'parameter-table',
    analysis,
    dimensions,
    renderImage: '/files/input/finished.png',
    parameterMarkdown,
    finishedRenderMode: true,
  });
  assert.match(tablePrompt, /TABLE ONLY/);
  assert.match(tablePrompt, /no render image/);
  assert.match(tablePrompt, /唯一成品展项效果图参考/);
});
