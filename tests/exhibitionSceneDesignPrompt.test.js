import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExhibitionSceneExtractPrompt,
  buildExhibitionSceneImagePrompt,
  EXHIBITION_SCENE_CATEGORIES,
  EXHIBITION_SCENE_PRESENTATION_FORMS,
  parseExhibitionSceneExtractJson,
} from '../src/utils/exhibitionSceneDesignPromptData.js';

test('exhibition scene extract prompt and parser support four text fields', () => {
  const prompt = buildExhibitionSceneExtractPrompt({ sourceText: 'source text' });
  assert.match(prompt, /titleText/);
  assert.match(prompt, /themeText/);
  assert.match(prompt, /sceneText/);
  assert.match(prompt, /interactionText/);

  assert.deepEqual(parseExhibitionSceneExtractJson(JSON.stringify({
    titleText: 'Title',
    themeText: 'Theme',
    sceneText: 'Scene',
    interactionText: 'Interaction',
  })), {
    titleText: 'Title',
    themeText: 'Theme',
    sceneText: 'Scene',
    interactionText: 'Interaction',
  });

  assert.deepEqual(parseExhibitionSceneExtractJson('Title\nTheme\nScene\nInteraction line 1\nInteraction line 2'), {
    titleText: 'Title',
    themeText: 'Theme',
    sceneText: 'Scene',
    interactionText: 'Interaction line 1\nInteraction line 2',
  });
});

test('scene categories and presentation forms are complete and enter prompt', () => {
  assert.equal(EXHIBITION_SCENE_CATEGORIES.length, 12);
  assert.equal(EXHIBITION_SCENE_PRESENTATION_FORMS.length, 10);

  const prompt = buildExhibitionSceneImagePrompt({
    sceneCategory: 'archaeological-site',
    presentationForm: 'immersive-cyclorama',
    spatialScale: 'full-room',
    atmosphere: 'mysterious-archaeology',
    crowdDensity: 'guided',
  });
  assert.match(prompt, /archaeological-site|考古|鑰冨彜/);
  assert.match(prompt, /immersive-cyclorama|cyclorama|环幕|鐜箷/);
  assert.match(prompt, /full-room|immersive scene|沉浸|娌夋蹈/);
  assert.match(prompt, /guided group|docent|讲解|璁茶В/);
});

test('environment reference is limited to space atmosphere scale circulation and composition', () => {
  const prompt = buildExhibitionSceneImagePrompt({
    environmentReferenceImages: ['/files/input/env.png'],
  });
  assert.match(prompt, /@img1/);
  assert.match(prompt, /空间|绌洪棿/);
  assert.match(prompt, /尺度|灏哄害/);
  assert.match(prompt, /动线|鍔ㄧ嚎/);
  assert.match(prompt, /光线|鍏夌嚎/);
  assert.match(prompt, /构图|鏋勫浘/);
  assert.match(prompt, /不要|涓嶈/);
  assert.match(prompt, /logo/);
});

test('people and props @img mentions are bound to reference image order', () => {
  const prompt = buildExhibitionSceneImagePrompt({
    environmentReferenceImages: ['/files/input/env.png'],
    peoplePropsReferenceImages: ['/files/input/person.png', '/files/input/prop.png'],
    peoplePropsText: 'Use @img2 as the main actor and @img3 as the tool.',
  });
  assert.match(prompt, /@img1/);
  assert.match(prompt, /@img2/);
  assert.match(prompt, /@img3/);
  assert.match(prompt, /Use @img2 as the main actor and @img3 as the tool/);
  assert.match(prompt, /人物|浜虹墿/);
  assert.match(prompt, /道具|閬撳叿/);
  assert.match(prompt, /顺序|椤哄簭/);
});

test('color material preset and reference image constraints enter scene prompt', () => {
  const prompt = buildExhibitionSceneImagePrompt({
    environmentReferenceImages: ['/files/input/env.png'],
    colorMaterialReferenceImages: ['/files/input/color-material.png'],
    peoplePropsReferenceImages: ['/files/input/person.png'],
    colorMaterialPalette: 'warm bronze, deep red, low contrast',
    colorMaterialTextures: 'brushed metal, rough stone, matte acrylic',
    colorMaterialReferenceTone: '@img2 has warm highlight and dark matte base',
    colorMaterialPriorityMode: 'frontend',
    peoplePropsText: 'Use @img3 as the visitor scale reference.',
  });

  assert.match(prompt, /@img1/);
  assert.match(prompt, /@img2/);
  assert.match(prompt, /@img3/);
  assert.match(prompt, /色彩与材质参考图作用/);
  assert.match(prompt, /Color palette：warm bronze, deep red, low contrast/);
  assert.match(prompt, /Materials\/textures：brushed metal, rough stone, matte acrylic/);
  assert.match(prompt, /Frontend recognized color\/material tone：@img2 has warm highlight/);
  assert.match(prompt, /Use @img3 as the visitor scale reference/);
  assert.match(prompt, /不得复制该图的空间布局、构图、具体物体、人物、文字、logo、品牌或图案细节/);
});

test('scene people props prompt uses runtime @img order in Chinese notes', () => {
  const prompt = buildExhibitionSceneImagePrompt({
    environmentReferenceImages: ['/files/input/env.png'],
    colorMaterialReferenceImages: ['/files/input/color.png'],
    peoplePropsReferenceImages: ['/files/input/person.png'],
    peoplePropsText: '@img3 中的女子在探坑里考古',
  });

  assert.match(prompt, /人物\/道具补充说明：@img3 中的女子在探坑里考古/);
  assert.doesNotMatch(prompt, /@image1 中的女子/);
});

test('scene prompt accepts administrator-defined key parameter prompts', () => {
  const prompt = buildExhibitionSceneImagePrompt({
    sceneCategory: 'custom-scene',
    sceneCategoryOption: { id: 'custom-scene', label: '定制场景', prompt: 'CUSTOM_SCENE_PROMPT' },
    presentationFormOption: { id: 'custom-form', label: '定制形式', prompt: 'CUSTOM_FORM_PROMPT' },
  });
  assert.match(prompt, /CUSTOM_SCENE_PROMPT/);
  assert.match(prompt, /CUSTOM_FORM_PROMPT/);
});
