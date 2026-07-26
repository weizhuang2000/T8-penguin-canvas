'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const config = require('../backend/src/config');
const {
  canonicalThumbnailSize,
  ensureThumbnailForSource,
  prewarmThumbnailSources,
  thumbnailCacheFile,
} = require('../backend/src/utils/thumbnailCache');

test('remote output thumbnail identity is stable when materialized cache path changes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-thumb-'));
  const oldDir = config.THUMBNAILS_DIR;
  config.THUMBNAILS_DIR = path.join(root, 'thumbnails');
  fs.mkdirSync(config.THUMBNAILS_DIR, { recursive: true });
  try {
    const entry = {
      storageSpaceId: 'cloud-baidu-netdisk',
      remotePath: '/T8PenguinCanvas/output/fhl/job/image.png',
      sha256: 'same-content-hash',
      size: 1234,
    };
    const first = thumbnailCacheFile({
      sourcePath: path.join(root, 'cache-a.png'),
      stat: { size: 1234, mtimeMs: 100 },
      outputKey: 'fhl/job/image.png',
      storageEntry: entry,
      size: 360,
    });
    const second = thumbnailCacheFile({
      sourcePath: path.join(root, 'cache-b.png'),
      stat: { size: 1234, mtimeMs: 999999 },
      outputKey: 'fhl/job/image.png',
      storageEntry: entry,
      size: 360,
    });
    assert.equal(first, second);
    assert.match(first, /preview_360_[a-f0-9]+\.webp$/);
    assert.notEqual(
      first,
      thumbnailCacheFile({ outputKey: 'fhl/job/image.png', storageEntry: { ...entry, sha256: 'changed' }, size: 360 }),
    );
    const localFirst = thumbnailCacheFile({
      sourcePath: path.join(root, 'unindexed.png'),
      stat: { size: 10, mtimeMs: 100 },
      outputKey: 'unindexed.png',
      size: 360,
    });
    const localChanged = thumbnailCacheFile({
      sourcePath: path.join(root, 'unindexed.png'),
      stat: { size: 10, mtimeMs: 200 },
      outputKey: 'unindexed.png',
      size: 360,
    });
    assert.notEqual(localFirst, localChanged);
  } finally {
    config.THUMBNAILS_DIR = oldDir;
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows may briefly lock sharp output */ }
  }
});

test('thumbnail generation canonicalizes sizes and prewarms common canvas sizes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-thumb-'));
  const oldDir = config.THUMBNAILS_DIR;
  config.THUMBNAILS_DIR = path.join(root, 'thumbnails');
  fs.mkdirSync(config.THUMBNAILS_DIR, { recursive: true });
  const source = path.join(root, 'source.png');
  try {
    await sharp({
      create: { width: 1200, height: 800, channels: 4, background: { r: 40, g: 120, b: 220, alpha: 1 } },
    }).png().toFile(source);
    assert.equal(canonicalThumbnailSize(120), 360);
    assert.equal(canonicalThumbnailSize(500), 720);
    assert.equal(canonicalThumbnailSize(1600), 1024);
    const targets = await prewarmThumbnailSources(source);
    assert.equal(targets.length, 2);
    assert.deepEqual(
      targets.map((target) => path.basename(target).split('_')[1]).sort(),
      ['360', '720'],
    );
    for (const target of targets) {
      assert.ok(fs.existsSync(target));
      const metadata = await sharp(target).metadata();
      assert.ok(metadata.width <= 720 && metadata.height <= 720);
    }
    const again = await ensureThumbnailForSource(source, { size: 360 });
    assert.equal(again, targets.find((target) => target.includes('preview_360_')));
  } finally {
    config.THUMBNAILS_DIR = oldDir;
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows may briefly lock sharp output */ }
  }
});
