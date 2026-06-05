const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const JPEG_OPTIONS = {
  quality: 96,
  chromaSubsampling: '4:4:4',
  mozjpeg: true,
};

function safeOutputPrefix(value, fallback = 'img') {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]/gi, '')
    .slice(0, 24);
  return clean || fallback;
}

async function encodeHighQualityJpeg(buffer) {
  return sharp(buffer, { limitInputPixels: false, animated: false })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg(JPEG_OPTIONS)
    .toBuffer();
}

async function encodeHighQualityPng(buffer) {
  return sharp(buffer, { limitInputPixels: false, animated: false })
    .rotate()
    .png({ compressionLevel: 6, effort: 8 })
    .toBuffer();
}

function normalizeImageOutputFormat(format) {
  const value = String(format || '').trim().toLowerCase();
  if (value === 'png') return 'png';
  return 'jpg';
}

async function encodeImageOutput(buffer, format = 'jpg') {
  return normalizeImageOutputFormat(format) === 'png'
    ? encodeHighQualityPng(buffer)
    : encodeHighQualityJpeg(buffer);
}

async function writeImageOutput(outputDir, prefix, buffer, format = 'jpg') {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const tag = safeOutputPrefix(prefix);
  const fmt = normalizeImageOutputFormat(format);
  const suffix = crypto.randomBytes(4).toString('hex');
  const filename = `${tag}_${Date.now()}_${suffix}.${fmt}`;
  const filePath = path.join(outputDir, filename);
  const out = await encodeImageOutput(buffer, fmt);
  fs.writeFileSync(filePath, out);
  return { filename, filePath, url: `/files/output/${filename}`, size: out.length, format: fmt };
}

async function writeJpegOutput(outputDir, prefix, buffer) {
  return writeImageOutput(outputDir, prefix, buffer, 'jpg');
}

module.exports = {
  encodeHighQualityPng,
  encodeHighQualityJpeg,
  encodeImageOutput,
  normalizeImageOutputFormat,
  writeImageOutput,
  writeJpegOutput,
};
