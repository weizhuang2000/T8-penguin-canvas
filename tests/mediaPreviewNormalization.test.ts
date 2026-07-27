import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLocalMediaUrl,
  normalizePersistedMediaUrls,
  previewImageUrl,
} from '../src/utils/mediaPreview.ts';

test('legacy absolute and legacy mounted media URLs normalize to the unified file endpoint', () => {
  assert.equal(
    normalizeLocalMediaUrl('https://old.example.com/files/output/fhl/job/image.png'),
    '/files/output/fhl/job/image.png',
  );
  assert.equal(normalizeLocalMediaUrl('/output/legacy.png'), '/files/output/legacy.png');
  assert.equal(normalizeLocalMediaUrl('/input/reference.png'), '/files/input/reference.png');
  assert.equal(normalizeLocalMediaUrl('https://provider.example.com/assets/image.png'), 'https://provider.example.com/assets/image.png');
});

test('persisted canvas media fields migrate without rewriting prompt text', () => {
  const normalized = normalizePersistedMediaUrls({
    prompt: 'https://old.example.com/files/output/keep-this-text.png',
    imageUrl: 'https://old.example.com/files/output/image.png',
    artifacts: [{ url: '/output/artifact.png', title: 'artifact' }],
    sourceNodeId: 'node-1',
  });
  assert.equal(normalized.prompt, 'https://old.example.com/files/output/keep-this-text.png');
  assert.equal(normalized.imageUrl, '/files/output/image.png');
  assert.equal(normalized.artifacts[0].url, '/files/output/artifact.png');
  assert.equal(normalized.sourceNodeId, 'node-1');
});

test('absolute historical output URLs request backend thumbnails instead of remote originals', () => {
  assert.equal(
    previewImageUrl('https://old.example.com/files/output/image.png', 720),
    '/api/files/thumbnail?size=360&url=%2Ffiles%2Foutput%2Fimage.png',
  );
});
