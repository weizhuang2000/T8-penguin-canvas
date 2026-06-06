'use strict';

const express = require('express');
const multer = require('multer');
const config = require('../config');
const { extractDocument } = require('../utils/documentExtractor');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_SIZE, files: 1 },
});

router.post('/extract', (req, res) => {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? `文档不能超过 ${Math.round(config.MAX_FILE_SIZE / 1024 / 1024)}MB`
        : (uploadError.message || '文档上传失败');
      return res.status(400).json({ success: false, error: message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未收到文档文件' });
    }
    try {
      const data = await extractDocument(req.file);
      return res.json({ success: true, data });
    } catch (error) {
      const status = Number(error?.status) || 500;
      const code = String(error?.code || (status >= 500 ? 'document_parse_failed' : 'invalid_document'));
      const message = status >= 500 && !error?.status
        ? '文档解析失败，请查看后端日志'
        : (error?.message || '文档解析失败');
      if (status >= 500) console.error('[documents/extract]', error?.stack || error?.message || error);
      return res.status(status).json({ success: false, error: message, code });
    }
  });
});

module.exports = router;
