'use strict';

const MAX_CAPTIONS = 500;

function timestampMs(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return null;
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}

function parseSrt(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const captions = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n').map((line) => line.trimEnd());
    if (/^\d+$/.test(lines[0] || '')) lines.shift();
    const timing = lines.shift() || '';
    const match = timing.match(/^(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!match) continue;
    const startMs = timestampMs(match[1]);
    const endMs = timestampMs(match[2]);
    const captionText = lines.join('\n').trim().slice(0, 2000);
    if (startMs == null || endMs == null || endMs <= startMs || !captionText) continue;
    captions.push({text: captionText, startMs, endMs, timestampMs: null, confidence: null});
    if (captions.length >= MAX_CAPTIONS) break;
  }
  return captions;
}

function extractCaptionTracks(texts = []) {
  const tracks = [];
  for (const item of texts) {
    const captions = parseSrt(item?.text);
    if (captions.length) tracks.push({id: String(item?.id || `captions-${tracks.length + 1}`).slice(0, 120), label: String(item?.label || 'SRT 字幕').slice(0, 200), captions});
  }
  return tracks;
}

module.exports = {MAX_CAPTIONS, extractCaptionTracks, parseSrt, timestampMs};
