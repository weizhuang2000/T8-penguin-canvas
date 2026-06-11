'use strict';

const path = require('path');
const fs = require('fs');
const { inflateRawSync } = require('zlib');
const config = require('../config');

const MAX_EXTRACTED_CHARS = 120000;
const MAX_DOCX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_DOCX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_DOCX_IMAGES = 200;
const MIN_PDF_TEXT_CHARS = 10;
const SUPPORTED_KINDS = new Set(['docx', 'pdf', 'txt']);
const MIME_BY_KIND = {
  docx: new Set([
    '',
    'application/octet-stream',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  pdf: new Set(['', 'application/octet-stream', 'application/pdf']),
  txt: new Set(['', 'application/octet-stream', 'text/plain']),
};
const IMAGE_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
};

function documentKind(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.txt') return 'txt';
  return '';
}

function sanitizeExtractedText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function decodeTxt(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  const oddNulls = buffer.reduce((count, byte, index) => count + (index % 2 === 1 && byte === 0 ? 1 : 0), 0);
  if (buffer.length >= 4 && oddNulls > buffer.length / 6) return buffer.toString('utf16le');
  return buffer.toString('utf8');
}

function assertSignature(kind, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('文档为空');
    error.status = 400;
    throw error;
  }
  if (
    kind === 'docx' &&
    (
      !(buffer[0] === 0x50 && buffer[1] === 0x4b) ||
      !buffer.includes(Buffer.from('word/document.xml'))
    )
  ) {
    const error = new Error('DOCX 文件签名无效');
    error.status = 400;
    throw error;
  }
  if (kind === 'pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    const error = new Error('PDF 文件签名无效');
    error.status = 400;
    throw error;
  }
}

function publicError(message, status = 400, code = 'invalid_document') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function findZipEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function listZipEntries(buffer) {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw publicError('DOCX 压缩目录损坏', 422, 'invalid_docx_zip');
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  if (entryCount > 10000) throw publicError('DOCX 文件项数量异常', 422, 'invalid_docx_zip');
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw publicError('DOCX 压缩目录损坏', 422, 'invalid_docx_zip');
    }
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8').replace(/\\/g, '/');
    entries.push({ name, compression, compressedSize, uncompressedSize, localHeaderOffset });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw publicError('DOCX 文件项损坏', 422, 'invalid_docx_zip');
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw publicError('DOCX 文件项不完整', 422, 'invalid_docx_zip');
  const compressed = buffer.subarray(dataStart, dataEnd);
  if (entry.uncompressedSize > MAX_DOCX_ENTRY_BYTES) {
    throw publicError('DOCX 单个文件项解压后过大', 413, 'docx_content_too_large');
  }
  let output;
  try {
    if (entry.compression === 0) output = compressed;
    else if (entry.compression === 8) output = inflateRawSync(compressed, { maxOutputLength: MAX_DOCX_ENTRY_BYTES });
    else throw publicError(`DOCX 使用了不支持的压缩方式：${entry.compression}`, 422, 'unsupported_docx_compression');
  } catch (error) {
    if (error?.status) throw error;
    throw publicError('DOCX 压缩内容损坏或解压后过大', 422, 'invalid_docx_zip');
  }
  if (entry.uncompressedSize && output.length !== entry.uncompressedSize) {
    throw publicError('DOCX 文件项长度校验失败', 422, 'invalid_docx_zip');
  }
  return output;
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const point = parseInt(hex, 16);
      return Number.isInteger(point) && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/&#(\d+);/g, (match, decimal) => {
      const point = parseInt(decimal, 10);
      return Number.isInteger(point) && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function wordXmlToText(xml) {
  return decodeXmlEntities(
    String(xml || '')
      .replace(/<w:tab\b[^>]*\/?>/gi, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/?>/gi, '\n')
      .replace(/<\/w:tc>/gi, '\t')
      .replace(/<\/w:tr>/gi, '\n')
      .replace(/<\/w:p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

function safeOutputStem(value) {
  return String(value || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'document';
}

function xmlAttr(value, attr) {
  const match = String(value || '').match(new RegExp(`${attr}="([^"]+)"`));
  return match ? decodeXmlEntities(match[1]) : '';
}

function relTargetToEntryName(target) {
  const clean = String(target || '').replace(/\\/g, '/').trim();
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return '';
  const normalized = path.posix.normalize(clean.startsWith('/') ? clean.slice(1) : `word/${clean}`);
  if (normalized.startsWith('../') || normalized.includes('/../')) return '';
  return normalized;
}

function parseDocxRelationships(xml) {
  const rels = new Map();
  const re = /<Relationship\b[^>]*>/gi;
  let match;
  while ((match = re.exec(String(xml || '')))) {
    const tag = match[0];
    const id = xmlAttr(tag, 'Id');
    const target = xmlAttr(tag, 'Target');
    const type = xmlAttr(tag, 'Type');
    if (!id || !target) continue;
    if (type && !/image/i.test(type) && !/\bmedia\//i.test(target)) continue;
    const entryName = relTargetToEntryName(target);
    if (entryName) rels.set(id, entryName);
  }
  return rels;
}

function imageRelationshipIdsInOrder(documentXml) {
  const ids = [];
  const seen = new Set();
  const re = /\b(?:r:embed|r:id)="([^"]+)"/gi;
  let match;
  while ((match = re.exec(String(documentXml || '')))) {
    const id = decodeXmlEntities(match[1]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function writeDocxImageOutput(buffer, originalName, index, sourceName, mime) {
  fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  const ext = path.extname(sourceName).toLowerCase() || '.png';
  const stem = safeOutputStem(originalName);
  const filename = `docimg_${Date.now()}_${index + 1}_${stem}${ext}`;
  const filePath = path.join(config.OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return {
    filename,
    url: `/files/output/${filename}`,
    name: path.basename(sourceName),
    size: buffer.length,
    mime,
    index: index + 1,
  };
}

function extractDocxImages(buffer, originalName) {
  const entries = listZipEntries(buffer);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const documentEntry = byName.get('word/document.xml');
  const relsEntry = byName.get('word/_rels/document.xml.rels');
  if (!documentEntry || !relsEntry) return [];

  const documentXml = readZipEntry(buffer, documentEntry).toString('utf8');
  const rels = parseDocxRelationships(readZipEntry(buffer, relsEntry).toString('utf8'));
  const orderedNames = imageRelationshipIdsInOrder(documentXml)
    .map((id) => rels.get(id))
    .filter(Boolean);

  const mediaEntries = entries
    .filter((entry) => /^word\/media\/[^/]+$/i.test(entry.name) && IMAGE_MIME_BY_EXT[path.extname(entry.name).toLowerCase()])
    .map((entry) => entry.name);

  const seen = new Set();
  const names = [...orderedNames, ...mediaEntries]
    .filter((name) => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .slice(0, MAX_DOCX_IMAGES);

  return names
    .map((name, index) => {
      const entry = byName.get(name);
      const ext = path.extname(name).toLowerCase();
      const mime = IMAGE_MIME_BY_EXT[ext];
      if (!entry || !mime) return null;
      const image = readZipEntry(buffer, entry);
      if (!image.length) return null;
      return writeDocxImageOutput(image, originalName, index, name, mime);
    })
    .filter(Boolean);
}

async function builtInDocxParser(buffer) {
  const entries = listZipEntries(buffer);
  const contentEntries = entries.filter((entry) => (
    entry.name === 'word/document.xml' ||
    /^word\/(?:header|footer)\d+\.xml$/i.test(entry.name) ||
    entry.name === 'word/footnotes.xml' ||
    entry.name === 'word/endnotes.xml'
  ));
  const main = contentEntries.find((entry) => entry.name === 'word/document.xml');
  if (!main) throw publicError('DOCX 缺少 word/document.xml', 422, 'invalid_docx_structure');
  const ordered = [main, ...contentEntries.filter((entry) => entry !== main)];
  const totalSize = ordered.reduce((sum, entry) => sum + (entry.uncompressedSize || 0), 0);
  if (totalSize > MAX_DOCX_TOTAL_BYTES) {
    throw publicError('DOCX 可提取文字内容过大', 413, 'docx_content_too_large');
  }
  return {
    value: ordered
      .map((entry) => wordXmlToText(readZipEntry(buffer, entry).toString('utf8')))
      .filter(Boolean)
      .join('\n'),
    messages: [],
  };
}

function validateInput(file) {
  const kind = documentKind(file?.originalname);
  if (!SUPPORTED_KINDS.has(kind)) {
    const error = new Error('仅支持 .docx、文本型 .pdf 和 .txt 文件');
    error.status = 400;
    throw error;
  }
  const mime = String(file?.mimetype || '').toLowerCase();
  if (!MIME_BY_KIND[kind].has(mime)) {
    const error = new Error('文件扩展名与 MIME 类型不匹配');
    error.status = 400;
    throw error;
  }
  assertSignature(kind, file.buffer);
  return kind;
}

async function defaultPdfParser(buffer) {
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      throw publicError(
        '服务器缺少 PDF 解析依赖 pdf-parse，请在部署目录执行 npm install 后重启服务',
        503,
        'document_parser_dependency_missing',
      );
    }
    throw error;
  }
  const parse = typeof pdfParse === 'function' ? pdfParse : pdfParse?.default;
  if (typeof parse !== 'function') {
    throw publicError('服务器 PDF 解析器版本不兼容', 503, 'document_parser_incompatible');
  }
  return parse(buffer);
}

async function extractDocument(file, parsers = {}) {
  const kind = validateInput(file);
  const warnings = [];
  let rawText = '';
  let pageCount;
  let images = [];

  if (kind === 'docx') {
    const result = await (parsers.docxParser || builtInDocxParser)(file.buffer);
    rawText = result?.value || '';
    images = extractDocxImages(file.buffer, file.originalname);
    for (const message of result?.messages || []) {
      const text = sanitizeExtractedText(message?.message || message);
      if (text) warnings.push(text.slice(0, 300));
    }
  } else if (kind === 'pdf') {
    const result = await (parsers.pdfParser || defaultPdfParser)(file.buffer);
    rawText = result?.text || '';
    pageCount = Number(result?.numpages) || undefined;
  } else {
    rawText = decodeTxt(file.buffer);
  }

  let text = sanitizeExtractedText(rawText);
  if (kind === 'pdf' && text.replace(/\s/g, '').length < MIN_PDF_TEXT_CHARS) {
    const error = new Error('PDF 未提取到可用文字，可能是扫描件；第一版暂不支持 OCR');
    error.status = 422;
    throw error;
  }
  if (!text) {
    const error = new Error('文档未提取到可用文字');
    error.status = 422;
    throw error;
  }
  if (text.length > MAX_EXTRACTED_CHARS) {
    text = text.slice(0, MAX_EXTRACTED_CHARS);
    warnings.push(`文档内容超过 ${MAX_EXTRACTED_CHARS} 字，已截断后续内容`);
  }

  return {
    name: path.basename(String(file.originalname || 'document')),
    kind,
    mime: String(file.mimetype || ''),
    size: Number(file.size) || file.buffer.length,
    text,
    charCount: text.length,
    ...(pageCount ? { pageCount } : {}),
    ...(images.length > 0 ? { images } : {}),
    warnings: warnings.slice(0, 20),
  };
}

module.exports = {
  MAX_EXTRACTED_CHARS,
  documentKind,
  sanitizeExtractedText,
  decodeTxt,
  builtInDocxParser,
  extractDocxImages,
  wordXmlToText,
  extractDocument,
};
