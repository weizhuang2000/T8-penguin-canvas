'use strict';

const path = require('path');

const MAX_EXTRACTED_CHARS = 120000;
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

async function defaultDocxParser(buffer) {
  const mammoth = require('mammoth');
  return mammoth.extractRawText({ buffer });
}

async function defaultPdfParser(buffer) {
  const pdfParse = require('pdf-parse');
  return pdfParse(buffer);
}

async function extractDocument(file, parsers = {}) {
  const kind = validateInput(file);
  const warnings = [];
  let rawText = '';
  let pageCount;

  if (kind === 'docx') {
    const result = await (parsers.docxParser || defaultDocxParser)(file.buffer);
    rawText = result?.value || '';
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
    warnings: warnings.slice(0, 20),
  };
}

module.exports = {
  MAX_EXTRACTED_CHARS,
  documentKind,
  sanitizeExtractedText,
  decodeTxt,
  extractDocument,
};
