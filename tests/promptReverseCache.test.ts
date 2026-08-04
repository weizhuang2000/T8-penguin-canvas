import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResourceItem } from '../src/services/api.ts';
import { findPromptReverseResourceByUrl, mapPromptReverseWithConcurrency } from '../src/utils/promptReverseCache.ts';

function resource(id: string, fileUrl: string, sourceUrls: string[] = []): ResourceItem {
  return {
    id,
    kind: 'image',
    categoryId: 'image_uncategorized',
    title: id,
    fileUrl,
    size: 1,
    sha256: id,
    tags: [],
    favorite: false,
    sourceUrl: sourceUrls[0],
    sourceUrls,
    createdAt: 1,
    updatedAt: 1,
  };
}

test('prompt reverse cache matches resource file and source URLs without cross-origin path collisions', () => {
  const resources = [
    resource('a', '/api/resources/file/a', ['/files/output/a.png']),
    resource('b', '/api/resources/file/b', ['https://cdn.example.com/b.png']),
  ];
  assert.equal(findPromptReverseResourceByUrl(resources, 'http://127.0.0.1:11422/api/resources/file/a', 'http://127.0.0.1:11422')?.id, 'a');
  assert.equal(findPromptReverseResourceByUrl(resources, '/files/output/a.png', 'http://127.0.0.1:11422')?.id, 'a');
  assert.equal(findPromptReverseResourceByUrl(resources, 'https://cdn.example.com/b.png', 'http://127.0.0.1:11422')?.id, 'b');
  assert.equal(findPromptReverseResourceByUrl(resources, 'https://other.example.com/b.png', 'http://127.0.0.1:11422'), undefined);
  assert.equal(findPromptReverseResourceByUrl(resources, 'data:image/png;base64,AAAA', 'http://127.0.0.1:11422'), undefined);
});

test('prompt reverse cache concurrency preserves selection order and caps active workers', async () => {
  let active = 0;
  let maxActive = 0;
  const results = await mapPromptReverseWithConcurrency([30, 5, 20, 1], 2, async (delay, index) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return `item-${index}`;
  });
  assert.equal(maxActive, 2);
  assert.deepEqual(results, ['item-0', 'item-1', 'item-2', 'item-3']);
});

test('prompt reverse cache waits for in-flight analysis before rejecting', async () => {
  const started: number[] = [];
  const completed: number[] = [];

  await assert.rejects(
    mapPromptReverseWithConcurrency([0, 1, 2], 2, async (item) => {
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, item === 0 ? 5 : 25));
      if (item === 0) throw new Error('analysis failed');
      completed.push(item);
      return item;
    }),
    /analysis failed/,
  );

  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(completed, [1]);
});
