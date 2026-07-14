'use strict';

const fs = require('fs');
const path = require('path');

function emit(type, data = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...data })}\n`);
}

async function main() {
  const requestFile = process.argv[2];
  if (!requestFile) throw new Error('缺少 Remotion 作业请求文件');
  const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  if (request.browserCacheDir) {
    fs.mkdirSync(request.browserCacheDir, { recursive: true });
    process.env.PUPPETEER_CACHE_DIR = request.browserCacheDir;
  }

  const { bundle } = require('@remotion/bundler');
  const { ensureBrowser, makeCancelSignal, renderMedia, selectComposition } = require('@remotion/renderer');
  const cancellation = makeCancelSignal();
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    cancellation.cancel();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  emit('phase', { phase: 'bundling', progress: 2 });
  const serveUrl = await bundle({
    entryPoint: request.entryPoint,
    publicDir: request.publicDir,
    enableCaching: true,
    onProgress: (value) => emit('progress', { phase: 'bundling', progress: Math.round(2 + value * 18) }),
    webpackOverride: (configuration) => ({
      ...configuration,
      resolve: {
        ...(configuration.resolve || {}),
        modules: [request.nodeModulesDir, ...((configuration.resolve && configuration.resolve.modules) || ['node_modules'])],
      },
    }),
  });

  const onBrowserDownload = ({ chromeMode }) => ({
    version: null,
    onProgress: (info) => emit('runtime-download', {
      phase: 'runtime-download',
      chromeMode,
      progress: Math.round(20 + (Number(info.percent) || 0) * 20),
      downloadedBytes: info.downloadedBytes,
      totalSizeInBytes: info.totalSizeInBytes,
      alreadyAvailable: info.alreadyAvailable,
    }),
  });
  emit('phase', { phase: 'runtime-check', progress: 20 });
  const browser = await ensureBrowser({ chromeMode: 'headless-shell', onBrowserDownload, logLevel: 'warn' });
  emit('runtime-ready', { path: browser.path || '', status: browser.type, progress: 40 });

  const composition = await selectComposition({
    serveUrl,
    id: 'T8Remotion',
    inputProps: request.inputProps,
    chromeMode: 'headless-shell',
    onBrowserDownload,
    timeoutInMilliseconds: 120000,
    logLevel: 'warn',
  });

  emit('phase', { phase: 'rendering', progress: 42 });
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    crf: 18,
    inputProps: request.inputProps,
    outputLocation: request.outputLocation,
    overwrite: true,
    concurrency: Math.max(1, Math.min(4, Number(request.concurrency) || 2)),
    cancelSignal: cancellation.cancelSignal,
    chromeMode: 'headless-shell',
    onBrowserDownload,
    timeoutInMilliseconds: 120000,
    logLevel: 'warn',
    onProgress: (value) => emit('progress', {
      phase: 'rendering',
      progress: Math.round(42 + Math.max(0, Math.min(1, Number(value.progress) || 0)) * 57),
      renderedFrames: value.renderedFrames,
      encodedFrames: value.encodedFrames,
    }),
  });
  const stat = fs.statSync(request.outputLocation);
  emit('complete', { progress: 100, outputLocation: request.outputLocation, size: stat.size });
}

main().catch((error) => {
  emit('error', { error: error && error.message ? error.message : String(error), stack: error && error.stack ? error.stack : '' });
  process.exitCode = 1;
});
