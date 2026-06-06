import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateRawSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const {
  MAX_EXTRACTED_CHARS,
  decodeTxt,
  extractDocument,
  sanitizeExtractedText,
} = require('../backend/src/utils/documentExtractor.js');

function file(name, mime, buffer) {
  return { originalname: name, mimetype: mime, buffer, size: buffer.length };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const compressed = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBuffer);
    localOffset += local.length + nameBuffer.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

test('document extractor parses a real minimal docx zip without external dependencies', async () => {
  const docx = createZip([
    ['[Content_Types].xml', '<Types />'],
    [
      'word/document.xml',
      '<w:document><w:body><w:p><w:r><w:t>主题 &amp; 导语</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>展板</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>灯箱</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    ],
  ]);
  const data = await extractDocument(
    file(
      '方案.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      docx,
    ),
  );

  assert.equal(data.kind, 'docx');
  assert.match(data.text, /主题 & 导语/);
  assert.match(data.text, /展板/);
  assert.match(data.text, /灯箱/);
  assert.equal(data.charCount, data.text.length);
  assert.deepEqual(data.warnings, []);
});

test('document extractor rejects mismatched signatures and scanned pdf', async () => {
  await assert.rejects(
    extractDocument(file('bad.pdf', 'application/pdf', Buffer.from('not pdf'))),
    /PDF 文件签名无效/,
  );

  await assert.rejects(
    extractDocument(
      file('scan.pdf', 'application/pdf', Buffer.from('%PDF-1.7 fake')),
      { pdfParser: async () => ({ text: '  ', numpages: 3 }) },
    ),
    /暂不支持 OCR/,
  );
});

test('document extractor rejects unsupported, empty and MIME-disguised files', async () => {
  await assert.rejects(
    extractDocument(file('legacy.doc', 'application/msword', Buffer.from('DOC'))),
    /仅支持/,
  );
  await assert.rejects(
    extractDocument(file('empty.txt', 'text/plain', Buffer.alloc(0))),
    /文档为空/,
  );
  await assert.rejects(
    extractDocument(file('fake.docx', 'application/pdf', Buffer.from('PK word/document.xml'))),
    /MIME 类型不匹配/,
  );
});

test('document extractor returns pdf pages and truncates oversized text', async () => {
  const data = await extractDocument(
    file('large.pdf', 'application/pdf', Buffer.from('%PDF-1.7 fake')),
    { pdfParser: async () => ({ text: '展'.repeat(MAX_EXTRACTED_CHARS + 20), numpages: 8 }) },
  );
  assert.equal(data.pageCount, 8);
  assert.equal(data.text.length, MAX_EXTRACTED_CHARS);
  assert.match(data.warnings[0], /已截断/);
});

test('missing pdf parser dependency returns a deployable diagnostic', async () => {
  await assert.rejects(
    extractDocument(file('text.pdf', 'application/pdf', Buffer.from('%PDF-1.7 textual placeholder'))),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'document_parser_dependency_missing');
      assert.match(error.message, /npm install/);
      return true;
    },
  );
});

test('txt decoder supports utf-8 and utf-16 little endian', async () => {
  assert.equal(decodeTxt(Buffer.from('文字', 'utf8')), '文字');
  assert.equal(decodeTxt(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('文字', 'utf16le')])), '文字');

  const data = await extractDocument(file('notes.txt', 'text/plain', Buffer.from('标题\r\n正文', 'utf8')));
  assert.equal(data.text, '标题\n正文');
});

test('sanitizer removes control characters without flattening paragraphs', () => {
  assert.equal(sanitizeExtractedText('A\u0001\r\n\r\nB'), 'A\n\nB');
});
