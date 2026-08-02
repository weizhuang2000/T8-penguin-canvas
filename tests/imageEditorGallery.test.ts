import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { GenerationHistoryItem, ResourceItem } from '../src/services/api.ts';
import {
  coerceImageEditorList,
  mergeImageEditorGallery,
  normalizeImageEditorHistoryUrl,
  normalizeImageEditorResourceUrl,
  paginateImageEditorGallery,
  replaceImageEditorSelectionId,
  toggleImageEditorSelection,
} from '../src/utils/imageEditorGallery.ts';
import { buildImageEditorReverseMessages } from '../src/utils/promptReverse.ts';

function history(id: string, url: string, userId = 'u1'): GenerationHistoryItem {
  return {
    id,
    kind: 'image',
    url,
    fileName: `${id}.png`,
    title: id,
    canvasId: 'canvas-1',
    createdAt: Number(id.replace(/\D/g, '')) || 1,
    createdByUserId: userId,
    hidden: false,
    favorite: false,
    tags: [],
  };
}

function resource(id: string, sourceUrls: string[] = []): ResourceItem {
  return {
    id,
    kind: 'image',
    categoryId: 'image_4_成品',
    title: id,
    fileUrl: `/api/resources/file/${id}`,
    thumbUrl: `/api/resources/thumb/${id}`,
    size: 1,
    tags: [],
    favorite: false,
    sourceUrl: sourceUrls[0],
    sourceUrls,
    createdAt: 1,
    updatedAt: 1,
  };
}

test('unified image editor gallery merges resource membership and only includes current user history', () => {
  const items = mergeImageEditorGallery(
    [resource('shared', ['/files/output/mine.png', '/files/output/mine-copy.png']), resource('library-only')],
    [history('h1', '/files/output/mine.png'), history('h2', '/files/output/private.png'), history('h4', '/files/output/mine-copy.png'), history('h3', '/files/output/other.png', 'u2')],
    'u1',
  );

  assert.equal(items.length, 3);
  const shared = items.find((item) => item.resourceId === 'shared');
  assert.equal(shared?.inResourceLibrary, true);
  assert.equal(shared?.fromMyGeneration, true);
  assert.equal(shared?.historyId, 'h4');
  assert.equal(items.some((item) => item.historyId === 'h3'), false);
  assert.equal(items.some((item) => ['h1', 'h4'].includes(item.historyId || '') && !item.inResourceLibrary), false);
});

test('gallery filtering, pagination and selection keep deterministic behavior', () => {
  const assets = mergeImageEditorGallery(
    Array.from({ length: 13 }, (_, index) => resource(`r${index + 1}`)),
    Array.from({ length: 13 }, (_, index) => history(`h${index + 1}`, `/files/output/h${index + 1}.png`)),
    'u1',
  );
  const firstPage = paginateImageEditorGallery(assets, { source: 'all', page: 1, pageSize: 12 });
  const minePage = paginateImageEditorGallery(assets, { source: 'mine', page: 2, pageSize: 12 });
  assert.equal(firstPage.items.length, 12);
  assert.equal(firstPage.pageCount, 3);
  assert.equal(minePage.total, 13);
  assert.equal(minePage.items.length, 1);

  let selection: string[] = [];
  for (let index = 0; index < 10; index += 1) selection = toggleImageEditorSelection(selection, `asset-${index}`);
  assert.equal(selection.length, 9);
  assert.deepEqual(replaceImageEditorSelectionId(['a', 'b'], 'a', 'resource:1'), ['resource:1', 'b']);
});

test('gallery list normalization tolerates legacy envelopes and malformed API payloads', () => {
  assert.deepEqual(coerceImageEditorList({ items: [1, 2] }), [1, 2]);
  assert.deepEqual(coerceImageEditorList({ data: { history: ['a'] } }, ['history']), ['a']);
  assert.deepEqual(coerceImageEditorList({ message: 'connection reset' }), []);
  assert.deepEqual(mergeImageEditorGallery({ items: [] } as any, { items: [] } as any, 'u1'), []);
  assert.equal(paginateImageEditorGallery({ items: [] } as any, { source: 'all', page: 1, pageSize: 24 }).total, 0);
  assert.equal(normalizeImageEditorHistoryUrl('003.jpg'), '/files/output/003.jpg');
  assert.equal(normalizeImageEditorResourceUrl('004.jpg', 'res-4'), '/api/resources/file/res-4');
  assert.equal(normalizeImageEditorResourceUrl('/api/resources/thumb/res-4', 'res-4', 'thumb'), '/api/resources/thumb/res-4');
});

test('web image editor reverse prompt applies edit instruction and multi-image priority', () => {
  const messages = buildImageEditorReverseMessages({
    imageUrls: ['/files/input/main.png', '/files/input/style.png'],
    editInstruction: '把主体外套改成蓝色，其余保持不变',
    strength: 'standard',
    language: 'zh',
  });
  assert.match(String(messages[0].content), /用户的改图要求优先级最高/);
  const userContent = messages[1].content as Array<{ type: string; text?: string }>;
  assert.match(String(userContent[0].text), /图 1 是主体画面/);
  assert.match(String(userContent[0].text), /把主体外套改成蓝色/);
  assert.equal(userContent.filter((item) => item.type === 'image_url').length, 2);
});

test('web image editor route, sidebar permission entry and shared-library actions are wired', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const sidebar = fs.readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../src/components/ImageEditorPage.tsx', import.meta.url), 'utf8');
  assert.match(app, /appPath === '\/image-editor'/);
  assert.match(app, /visibleNodeTypes\.includes\('prompt-reverse'\).*visibleNodeTypes\.includes\('image'\)/s);
  assert.doesNotMatch(sidebar, /网页版改图/);
  assert.match(app, /网页版改图[\s\S]*\{\/\* 主题模板 \*\/\}/);
  assert.match(page, /getResourceItems\(\{ kind: 'image' \}\)/);
  assert.match(page, /getGenerationHistoryItems\(\{ kind: 'image' \}\)/);
  assert.match(page, /addResourceItem\(\{/);
  assert.match(page, /runConfiguredImageGeneration\(\{/);
  assert.match(page, /useState\(\(\) => fhlAllowed \? 'fhl' : 'standard'\)/);
  assert.match(page, /createFhlJob\(\{/);
  assert.match(page, /advancedProvidersForNode\(settings\.advancedProviders, 'image'\)/);
  assert.match(page, /mode: externalProvider \? 'external' : 'standard'/);
  assert.match(page, /title="放大预览"/);
  assert.match(page, /title="下载图片"/);
  assert.match(page, /const downloadAsset =/);
});
