import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResourceCategory } from '../src/services/api.ts';
import {
  buildImageEditorAnalysisMessages,
  buildImageEditorCachedPromptMergeMessages,
  getImageEditorCachedPrompt,
  mergeImageEditorAnalysis,
  parseImageEditorAnalysisOutput,
} from '../src/utils/imageEditorAnalysis.ts';

const categories: ResourceCategory[] = [
  { id: 'image_uncategorized', kind: 'image', name: '未分类', order: 0, createdAt: 0 },
  { id: 'image_role', kind: 'image', name: '角色', order: 1, createdAt: 0 },
];

test('image editor analysis builder requests one image and strict category JSON', () => {
  const messages = buildImageEditorAnalysisMessages({
    imageUrl: '/files/input/main.png',
    strength: 'extreme',
    language: 'zh',
    categories,
    includeClassification: true,
  });
  assert.match(String(messages[0].content), /categoryId/);
  assert.match(String(messages[0].content), /image_role/);
  const content = messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
  assert.equal(content.filter((item) => item.type === 'image_url').length, 1);
  assert.equal(content[1].image_url?.url, '/files/input/main.png');
});

test('image editor analysis parser validates category and caps unique secondary tags', () => {
  const parsed = parseImageEditorAnalysisOutput(
    '```json\n{"prompt":"完整提示词","categoryId":"image_role","secondaryTags":["企鹅","蓝色","企鹅","插画"]}\n```',
    categories,
    'image_uncategorized',
  );
  assert.deepEqual(parsed, {
    prompt: '完整提示词',
    categoryId: 'image_role',
    secondaryTags: ['企鹅', '蓝色', '插画'],
  });
  assert.equal(
    parseImageEditorAnalysisOutput('{"prompt":"x","categoryId":"missing","secondaryTags":[]}', categories, 'image_uncategorized')?.categoryId,
    'image_uncategorized',
  );
  assert.equal(parseImageEditorAnalysisOutput('{"prompt":"","categoryId":"image_role"}', categories, 'image_uncategorized'), null);
});

test('image editor prompt cache keeps strength and language entries independently', () => {
  const first = mergeImageEditorAnalysis(null, {
    strength: 'extreme',
    language: 'zh',
    prompt: '极致中文',
    secondaryTags: ['企鹅', '插画'],
    classifiedAt: 100,
  });
  const second = mergeImageEditorAnalysis(first, {
    strength: 'extreme',
    language: 'en',
    prompt: 'Extreme English',
  });
  const third = mergeImageEditorAnalysis(second, {
    strength: 'detailed',
    language: 'zh',
    prompt: '详细中文',
  });
  assert.equal(getImageEditorCachedPrompt(third, 'extreme', 'zh'), '极致中文');
  assert.equal(getImageEditorCachedPrompt(third, 'extreme', 'en'), 'Extreme English');
  assert.equal(getImageEditorCachedPrompt(third, 'detailed', 'zh'), '详细中文');
  assert.equal(getImageEditorCachedPrompt(third, 'standard', 'zh'), '');
  assert.deepEqual(third.secondaryTags, ['企鹅', '插画']);
});

test('multi-image cached prompt merge keeps first prompt as the primary image', () => {
  const messages = buildImageEditorCachedPromptMergeMessages({
    prompts: ['主体构图提示词', '补充材质提示词'],
    contentText: '新的企鹅展览主题',
    language: 'zh',
  });
  assert.match(String(messages[0].content), /图 1 是主体画面/);
  assert.match(String(messages[1].content), /主体构图提示词/);
  assert.match(String(messages[1].content), /补充材质提示词/);
  assert.match(String(messages[1].content), /新的企鹅展览主题/);
});
