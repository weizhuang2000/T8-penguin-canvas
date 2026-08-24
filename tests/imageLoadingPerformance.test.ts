import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('local canvas image previews use cached backend thumbnails', () => {
  const smartImage = read('../src/components/SmartImage.tsx');
  const mediaPreview = read('../src/utils/mediaPreview.ts');
  const filesRoute = read('../backend/src/routes/files.js');

  assert.match(smartImage, /previewImageUrl\(src,\s*thumbSize\)/);
  assert.match(smartImage, /loading = 'lazy'/);
  assert.match(smartImage, /loading=\{shouldLoad \? 'eager' : loading\}/);
  assert.match(smartImage, /decoding = 'async'/);
  assert.match(smartImage, /data-full-src=\{src\}/);
  assert.match(smartImage, /IntersectionObserver/);
  assert.match(smartImage, /rootMargin:\s*'160px 160px'/);
  assert.match(smartImage, /getBoundingClientRect\(\)/);
  assert.match(smartImage, /window\.innerWidth \+ margin/);
  assert.match(smartImage, /setFallback\(true\)/);

  assert.match(mediaPreview, /\/api\/files\/thumbnail\?size=\$\{safeSize\}&url=/);
  assert.match(mediaPreview, /LOCAL_FILE_PREFIX_RE/);
  assert.match(mediaPreview, /const safeSize = 360/);

  assert.match(filesRoute, /router\.get\('\/thumbnail'/);
  assert.match(filesRoute, /const hasLocalSource = Boolean\(sourcePath && fs\.existsSync\(sourcePath\)\)/);
  assert.match(filesRoute, /const thumbnailEntry = hasLocalSource \? null : outputEntry/);
  assert.match(filesRoute, /const stableRemoteTarget = !hasLocalSource && outputKey/);
  assert.match(filesRoute, /ensureThumbnailForSource\(sourcePath, \{ size, outputKey, storageEntry: thumbnailEntry \}\)/);
  const thumbnailCache = read('../backend/src/utils/thumbnailCache.js');
  assert.match(filesRoute, /stableThumbnailCacheFile/);
  assert.match(filesRoute, /ensureThumbnailForSource/);
  assert.match(filesRoute, /X-T8-Thumbnail-Fallback/);
  assert.match(filesRoute, /scheduleRemoteThumbnailUpgrade/);
  assert.match(thumbnailCache, /T8PC_THUMBNAIL_CONCURRENCY \|\| '4'/);
  assert.match(thumbnailCache, /effort:\s*2/);
  assert.match(thumbnailCache, /output:/);
  assert.match(thumbnailCache, /outputRevision/);
  assert.match(filesRoute, /Cache-Control', 'private, max-age=31536000, immutable'/);
  assert.match(filesRoute, /THUMBNAILS_DIR/);
});

test('historical canvases restore their viewport before online refresh and reuse immutable media', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const server = read('../backend/src/server.js');
  const outputManager = read('../backend/src/outputStorage/manager.js');
  const storageClient = read('../backend/src/outputStorage/client.js');
  const webdav = read('../backend/src/outputStorage/webdav.js');

  assert.match(canvas, /normalizeRememberedViewport\(cachedData\.viewport\)/);
  assert.match(canvas, /setViewport\(cachedViewport, \{ duration: 0 \}\)/);
  assert.match(canvas, /normalizePersistedMediaUrls\(persisted\.data\)/);
  assert.doesNotMatch(canvas, /onlyRenderVisibleElements=/);
  assert.match(server, /IMMUTABLE_PRIVATE_MEDIA_CACHE = 'private, max-age=31536000, immutable'/);
  assert.match(outputManager, /IMMUTABLE_PRIVATE_OUTPUT_CACHE = 'private, max-age=31536000, immutable'/);
  assert.match(outputManager, /materializeInflight/);
  assert.match(outputManager, /T8_OUTPUT_STORAGE_DOWNLOAD_CONCURRENCY/);
  assert.match(storageClient, /response\.status === 200 \|\| response\.status === 206/);
  assert.match(storageClient, /'private, max-age=31536000, immutable'/);
  assert.match(webdav, /response\.status === 200 \|\| response\.status === 206/);
  assert.match(webdav, /'private, max-age=31536000, immutable'/);
});

test('local file uploads allow generated PNGs up to 20MB and report oversize as JSON', () => {
  const config = read('../backend/src/config.js');
  const filesRoute = read('../backend/src/routes/files.js');

  assert.match(config, /MAX_FILE_SIZE:\s*20\s*\*\s*1024\s*\*\s*1024/);
  assert.match(filesRoute, /const uploadSingleFile = upload\.single\('file'\)/);
  assert.match(filesRoute, /err instanceof multer\.MulterError/);
  assert.match(filesRoute, /err\.code === 'LIMIT_FILE_SIZE'/);
  assert.match(filesRoute, /res\.status\(413\)\.json/);
  assert.match(filesRoute, /code:\s*'file_too_large'/);
  assert.match(filesRoute, /formatUploadLimit\(config\.MAX_FILE_SIZE\)/);
});

test('initial canvas boot keeps heavy nodes behind lazy boundaries', () => {
  const index = read('../index.html');
  const app = read('../src/App.tsx');
  const canvas = read('../src/components/Canvas.tsx');

  assert.ok(existsSync(new URL('../public/infinite-canvas-loading.png', import.meta.url)));
  assert.match(index, /<div class="t8-boot-screen"/);
  assert.match(index, /src="\/infinite-canvas-loading\.png"/);
  assert.match(index, /t8-boot-progress-fill/);
  assert.match(index, /t8-boot-progress-spark/);
  assert.match(index, /prefers-reduced-motion/);
  assert.match(app, /const Canvas = lazy\(\(\) => import\('\.\/components\/Canvas'\)\)/);
  assert.match(app, /function InfiniteCanvasBootLoading/);
  assert.match(app, /src="\/infinite-canvas-loading\.png"/);
  assert.match(app, /<Suspense fallback=\{<InfiniteCanvasBootLoading \/>}/);
  assert.match(canvas, /function lazyCanvasNode/);
  assert.match(canvas, /const Panorama3DNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/Panorama3DNode'\)/);
  assert.match(canvas, /const ImageNode = lazyCanvasNode\(\(\) => import\('\.\/nodes\/ImageNode'\)/);
  assert.doesNotMatch(canvas, /import ImageNode from '\.\/nodes\/ImageNode'/);
});

test('high-traffic node previews render through SmartImage', () => {
  const expectedSmartImageNodes = [
    '../src/components/nodes/MaterialThumbnail.tsx',
    '../src/components/nodes/OutputNode.tsx',
    '../src/components/nodes/UploadNode.tsx',
    '../src/components/nodes/ImageNode.tsx',
    '../src/components/nodes/GridEditorNode.tsx',
    '../src/components/nodes/Panorama3DNode.tsx',
    '../src/components/nodes/LoopNode.tsx',
    '../src/components/nodes/MaterialSetNode.tsx',
    '../src/components/nodes/VideoNode.tsx',
    '../src/components/nodes/SeedanceNode.tsx',
    '../src/components/nodes/LLMNode.tsx',
  ];

  for (const file of expectedSmartImageNodes) {
    const source = read(file);
    assert.match(source, /import SmartImage from '\.\.\/SmartImage'/, `${file} imports SmartImage`);
    assert.match(source, /<SmartImage[\s\S]*thumbSize=/, `${file} uses bounded preview size`);
  }
});

test('decorative theme edge motion degrades while the canvas is busy', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const edge = read('../src/components/edges/DeletableEdge.tsx');
  const css = read('../src/styles/index.css');
  const slamCss = read('../src/styles/theme-slamdunk.css');
  const soccerCss = read('../src/styles/theme-soccer.css');
  const dragonCss = read('../src/styles/theme-dragonball.css');
  const main = read('../src/main.tsx');

  assert.match(canvas, /EDGE_MOTION_HEAVY_EDGE_COUNT/);
  assert.match(canvas, /isDecorativeEdgeVisual = isSlamdunk \|\| isSoccer \|\| isDragonBall/);
  assert.match(canvas, /edgeMotionMode = isDecorativeEdgeVisual \? \(edgeMotionReduced \? 'reduced' : 'scoped'\) : undefined/);
  assert.match(canvas, /data-t8-edge-motion/);
  assert.match(canvas, /onMoveStart=\{handleViewportMoveStart\}/);
  assert.match(canvas, /if \(isDraggingRef\.current\) return;/);
  assert.match(canvas, /setDragSaveTick\(\(tick\) => tick \+ 1\)/);

  assert.match(edge, /DECORATIVE_EDGE_MOTION_LIMIT/);
  assert.match(edge, /isNodeSelectedFromStore/);
  assert.match(edge, /countActiveThemeEdges/);
  assert.match(edge, /activeThemeEdgeCount <= DECORATIVE_EDGE_MOTION_LIMIT/);
  assert.match(edge, /t8-edge-theme-active/);
  assert.match(edge, /shouldRenderPassBall/);
  assert.match(edge, /shouldRenderSoccerBall/);
  assert.match(edge, /\{shouldRenderPassBall && \(/);
  assert.match(edge, /\{shouldRenderSoccerBall && \(/);

  assert.match(css, /html\[data-t8-edge-motion="reduced"\]/);
  assert.match(slamCss, /\.react-flow__edge-path\.t8-edge-theme-active/);
  assert.match(slamCss, /\.t8-edge-yyh-red-segment\.t8-edge-theme-active/);
  assert.match(slamCss, /html\[data-theme-visual="slamdunk"\] \.t8-sidebar::after \{\s*content: none;/);
  assert.match(soccerCss, /\.react-flow__edge-path\.t8-edge-theme-active/);
  assert.match(soccerCss, /\.t8-edge-yyh-red-segment\.t8-edge-theme-active/);
  assert.match(css, /theme-dragonball\.css/);
  assert.match(dragonCss, /\.react-flow__edge-path\.t8-edge-theme-active/);
  assert.match(dragonCss, /data-t8-edge-motion="reduced"/);
  assert.match(dragonCss, /\.t8-viewport-moving/);
  assert.match(dragonCss, /\.t8-node-dragging/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(main, /VITE_T8_STRICT_MODE/);
});
