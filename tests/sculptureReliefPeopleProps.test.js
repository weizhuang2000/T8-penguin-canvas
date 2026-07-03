import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSculptureReliefImagePrompt } from '../src/utils/sculptureReliefDesignPromptData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('sculpture relief people props prompt binds @img order after pattern reference', () => {
  const withPattern = buildSculptureReliefImagePrompt({
    hasPatternReferenceImage: true,
    peoplePropsReferenceImages: ['/files/input/person.png', '/files/input/tool.png'],
    peoplePropsText: '@img2 person with @img3 tool',
  });
  assert.match(withPattern, /@img1=参考图案/);
  assert.match(withPattern, /@img2=人物\/道具参考1/);
  assert.match(withPattern, /@img3=人物\/道具参考2/);
  assert.match(withPattern, /@img2 person with @img3 tool/);
  assert.match(withPattern, /人物姿态/);
  assert.match(withPattern, /道具类型/);
  assert.match(withPattern, /不要复制原图色彩/);

  const withoutPattern = buildSculptureReliefImagePrompt({
    peoplePropsReferenceImages: ['/files/input/person.png'],
    peoplePropsText: '@img1 as scale reference',
  });
  assert.match(withoutPattern, /@img1=人物\/道具参考1/);
  assert.match(withoutPattern, /@img1 as scale reference/);
});

test('sculpture relief node exposes people props handle and mention input', () => {
  const source = read('src/components/nodes/SculptureReliefDesignNode.tsx');
  assert.match(source, /id="people-props"/);
  assert.match(source, /MentionPromptInput/);
  assert.match(source, /resolveMediaMentions/);
  assert.match(source, /peoplePropsText/);
  assert.match(source, /peoplePropsMentions/);
  assert.match(source, /peoplePropsReferenceImages/);
  assert.match(source, /const referenceImages = \[\.\.\.\(patternReferenceImage \? \[patternReferenceImage\] : \[\]\), \.\.\.peoplePropsReferenceImages\]/);
  assert.match(source, /images: referenceImages/);
});

test('sculpture relief defaults and compact form include people props fields', () => {
  assert.match(read('src/components/Canvas.tsx'), /peoplePropsText: ''/);
  assert.match(read('src/components/Canvas.tsx'), /peoplePropsMentions: \[\]/);
  assert.match(read('src/components/Canvas.tsx'), /peoplePropsReferenceImages: \[\]/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /id: 'people-props'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /id: 'people-props'/);
});
