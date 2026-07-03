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

test('scene people props prompt uses runtime @img order in Chinese notes', () => {
  const prompt = buildExhibitionSceneImagePrompt({
    environmentReferenceImages: ['/files/input/env.png'],
    peoplePropsReferenceImages: ['/files/input/person.png'],
    peoplePropsText: '@img2 中的女子在探坑里考古',
  });

  assert.match(prompt, /人物\/道具补充说明：@img2 中的女子在探坑里考古/);
  assert.doesNotMatch(prompt, /@image1 中的女子/);
});
