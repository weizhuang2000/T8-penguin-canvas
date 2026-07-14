'use strict';

const fs = require('fs');
const path = require('path');

function emit(type, data = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...data })}\n`);
}

function unitProgress(value) {
  const number = Number(value) || 0;
  return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
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
  const { ensureBrowser, makeCancelSignal, renderMedia, renderStill, selectComposition } = require('@remotion/renderer');
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
    onProgress: (value) => emit('progress', { phase: 'bundling', progress: Math.round(2 + unitProgress(value) * 18) }),
    webpackOverride: (configuration) => ({
      ...configuration,
      resolve: {
        ...(configuration.resolve || {}),
        modules: [request.nodeModulesDir, ...((configuration.resolve && configuration.resolve.modules) || ['node_modules'])],
        alias: {
          ...((configuration.resolve && configuration.resolve.alias) || {}),
          '@t8/remotion-kit': request.proKitPath || path.join(__dirname, '..', 'remotion', 'ProKit.tsx'),
        },
      },
    }),
  });

  const onBrowserDownload = ({ chromeMode }) => ({
    version: null,
    onProgress: (info) => emit('runtime-download', {
      phase: 'runtime-download',
      chromeMode,
      progress: Math.round(20 + unitProgress(info.percent) * 20),
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

  if (request.operation === 'stills') {
    const outputDir = path.resolve(request.outputDir);
    fs.mkdirSync(outputDir, {recursive: true});
    const frames = [...new Set((request.frames || []).map((value) => Math.max(0, Math.min(composition.durationInFrames - 1, Math.round(Number(value) || 0)))))].slice(0, 6);
    if (!frames.length) throw new Error('关键帧列表为空');
    const scale = Math.max(0.1, Math.min(1, Number(request.scale) || 0.25));
    const frameFiles = [];
    emit('phase', {phase: 'rendering-stills', progress: 42});
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      const output = path.join(outputDir, `frame-${String(index + 1).padStart(2, '0')}-${frame}.png`);
      await renderStill({
        composition,
        serveUrl,
        inputProps: request.inputProps,
        output,
        frame,
        scale,
        imageFormat: 'png',
        overwrite: true,
        cancelSignal: cancellation.cancelSignal,
        chromeMode: 'headless-shell',
        onBrowserDownload,
        timeoutInMilliseconds: 120000,
        logLevel: 'warn',
      });
      frameFiles.push(output);
      emit('progress', {phase: 'rendering-stills', progress: Math.round(42 + ((index + 1) / frames.length) * 42), renderedFrames: index + 1});
    }

    const sharp = require('sharp');
    const frameWidth = Math.max(1, Math.round(composition.width * scale));
    const frameHeight = Math.max(1, Math.round(composition.height * scale));
    const labelHeight = 34;
    const columns = 2;
    const rows = Math.ceil(frameFiles.length / columns);
    const composites = [];
    for (let index = 0; index < frameFiles.length; index += 1) {
      const left = (index % columns) * frameWidth;
      const top = Math.floor(index / columns) * (frameHeight + labelHeight);
      const seconds = frames[index] / composition.fps;
      const label = Buffer.from(`<svg width="${frameWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#09090b"/><text x="14" y="23" fill="#e5e7eb" font-family="Arial,sans-serif" font-size="15">${index + 1} · ${seconds.toFixed(2)}s · frame ${frames[index]}</text></svg>`);
      composites.push({input: frameFiles[index], left, top});
      composites.push({input: label, left, top: top + frameHeight});
    }
    const contactSheet = path.join(outputDir, 'contact-sheet.jpg');
    await sharp({create: {width: frameWidth * columns, height: (frameHeight + labelHeight) * rows, channels: 3, background: '#09090b'}})
      .composite(composites)
      .jpeg({quality: 82, mozjpeg: true})
      .toFile(contactSheet);
    emit('complete', {progress: 100, operation: 'stills', contactSheet, frameFiles, frames, size: fs.statSync(contactSheet).size});
    return;
  }

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
