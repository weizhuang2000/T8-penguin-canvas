'use strict';

const express = require('express');
const multer = require('multer');
const config = require('../config');
const { requireNodePermission } = require('../auth/toolPermissions');
const { extractDocument } = require('../utils/documentExtractor');
const { exportStoryboardDocument } = require('../utils/storyboardExporter');
const { exportGameUiDocument } = require('../utils/gameUiExporter');

const router = express.Router();
const maxDocumentFileSize = config.MAX_DOCUMENT_FILE_SIZE || config.MAX_FILE_SIZE;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxDocumentFileSize, files: 1 },
});

router.post('/extract', (req, res) => {
  upload.single('file')(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? `文档不能超过 ${Math.round(maxDocumentFileSize / 1024 / 1024)}MB`
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

router.post('/storyboard/export', requireNodePermission('storyboard-grid'), async (req, res) => {
  try {
    const result = await exportStoryboardDocument(req.body || {});
    const encodedFilename = encodeURIComponent(result.filename).replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Disposition', `attachment; filename="storyboard-export.${result.model.format}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', String(result.buffer.length));
    return res.send(result.buffer);
  } catch (error) {
    const status = Number(error?.status) || 500;
    const code = String(error?.code || 'storyboard_export_failed');
    const message = error?.message || '分镜脚本导出失败';
    if (status >= 500) console.error('[documents/storyboard/export]', error?.stack || message);
    return res.status(status).json({ success: false, error: message, code });
  }
});

router.post('/game-ui/export', requireNodePermission('interactive-game-script'), async (req, res) => {
  try {
    const result = await exportGameUiDocument(req.body || {});
    const encodedFilename = encodeURIComponent(result.filename).replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const fallbackExtension = result.model.format === 'prototype-zip' ? 'zip' : result.model.format;
    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Disposition', `attachment; filename="game-ui-export.${fallbackExtension}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', String(result.buffer.length));
    return res.send(result.buffer);
  } catch (error) {
    const status = Number(error?.status) || 500;
    const code = String(error?.code || 'game_ui_export_failed');
    const message = error?.message || '互动游戏方案导出失败';
    if (status >= 500) console.error('[documents/game-ui/export]', error?.stack || message);
    return res.status(status).json({ success: false, error: message, code });
  }
});

module.exports = router;
