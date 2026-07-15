'use strict';

const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');
const sharp = require('sharp');
const {resolveBundledFfmpeg} = require('../../providers/llmMedia');

const PROBE_TIMEOUT_MS = 20_000;
const SILENCE_TIMEOUT_MS = 120_000;

function parseDuration(stderr) {
  const match = String(stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseVideo(stderr) {
  const line = String(stderr || '').split(/\r?\n/).find((value) => /Video:/i.test(value)) || '';
  const dimensions = line.match(/(?:^|[,\s])(\d{2,5})x(\d{2,5})(?:[,\s]|$)/);
  const codec = line.match(/Video:\s*([^,\s]+)/i);
  return {
    width: dimensions ? Number(dimensions[1]) : undefined,
    height: dimensions ? Number(dimensions[2]) : undefined,
    codec: codec?.[1],
  };
}

function parseAudioCodec(stderr) {
  return String(stderr || '').match(/Audio:\s*([^,\s]+)/i)?.[1];
}

function runFfmpeg(args, options = {}) {
  const signal = options.signal;
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('媒体探测已取消'), {name: 'AbortError'}));
  return new Promise((resolve, reject) => {
    const child = spawn(resolveBundledFfmpeg(), args, {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      if (error) reject(error); else resolve(stderr);
    };
    const onAbort = () => {
      try { child.kill('SIGKILL'); } catch (_) {}
      finish(Object.assign(new Error('媒体探测已取消'), {name: 'AbortError'}));
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      finish(new Error('媒体探测超时'));
    }, options.timeoutMs || PROBE_TIMEOUT_MS);
    timer.unref?.();
    signal?.addEventListener?.('abort', onAbort, {once: true});
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-100_000); });
    child.on('error', finish);
    child.on('close', () => finish());
  });
}

async function detectSilence(file, options = {}) {
  const stderr = await runFfmpeg(['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.35', '-f', 'null', '-'], {signal: options.signal, timeoutMs: SILENCE_TIMEOUT_MS});
  const ranges = [];
  let start;
  for (const match of stderr.matchAll(/silence_(start|end):\s*([\d.]+)/g)) {
    if (match[1] === 'start') start = Number(match[2]);
    else if (Number.isFinite(start)) {
      ranges.push({start: Number(start.toFixed(3)), end: Number(Number(match[2]).toFixed(3))});
      start = undefined;
    }
    if (ranges.length >= 200) break;
  }
  return ranges;
}

async function probeOne(asset, assetsDir, options = {}) {
  const file = path.join(assetsDir, asset.src);
  const metadata = {size: Number(asset.size) || fs.statSync(file).size, mime: asset.mime || ''};
  try {
    if (asset.kind === 'image') {
      const image = await sharp(file).metadata();
      metadata.width = image.width;
      metadata.height = image.height;
      metadata.format = image.format;
    } else {
      const stderr = await runFfmpeg(['-hide_banner', '-i', file], {signal: options.signal});
      metadata.duration = parseDuration(stderr);
      if (asset.kind === 'video') Object.assign(metadata, parseVideo(stderr));
      else metadata.codec = parseAudioCodec(stderr);
      if (options.detectSilence) metadata.silenceRanges = await detectSilence(file, options);
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    metadata.probeWarning = String(error?.message || error).slice(0, 300);
  }
  return {...asset, metadata};
}

async function probeStagedAssets(stagedAssets, assetsDir, options = {}) {
  const out = [];
  for (const asset of stagedAssets || []) out.push(await probeOne(asset, assetsDir, options));
  return out;
}

module.exports = {detectSilence, parseDuration, parseVideo, probeStagedAssets};
