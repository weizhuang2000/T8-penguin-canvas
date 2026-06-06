import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

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

test('document extractor parses docx through mammoth-compatible result and cleans text', async () => {
  const data = await extractDocument(
    file(
      '方案.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from('PK fake word/document.xml'),
    ),
    {
      docxParser: async () => ({
        value: '主题\u0000  \r\n\r\n\r\n\r\n第一章',
        messages: [{ message: '忽略了一个批注' }],
      }),
    },
  );

  assert.equal(data.kind, 'docx');
  assert.equal(data.text, '主题\n\n\n第一章');
  assert.equal(data.charCount, data.text.length);
  assert.deepEqual(data.warnings, ['忽略了一个批注']);
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

test('txt decoder supports utf-8 and utf-16 little endian', async () => {
  assert.equal(decodeTxt(Buffer.from('文字', 'utf8')), '文字');
  assert.equal(decodeTxt(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('文字', 'utf16le')])), '文字');

  const data = await extractDocument(file('notes.txt', 'text/plain', Buffer.from('标题\r\n正文', 'utf8')));
  assert.equal(data.text, '标题\n正文');
});

test('sanitizer removes control characters without flattening paragraphs', () => {
  assert.equal(sanitizeExtractedText('A\u0001\r\n\r\nB'), 'A\n\nB');
});
