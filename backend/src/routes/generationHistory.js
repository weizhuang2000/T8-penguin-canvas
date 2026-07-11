'use strict';

const express = require('express');
const config = require('../config');
const {
  deleteHistoryItem,
  listProjects,
  listVisibleItems,
  updateHistoryItem,
} = require('../utils/generationHistory');

const router = express.Router();

router.get('/projects', (req, res) => {
  try {
    res.json({ success: true, data: listProjects(req.user) });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.get('/items', (req, res) => {
  try {
    const items = listVisibleItems(req.user, req.query || {});
    res.json({ success: true, data: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.patch('/items/:id', express.json({ limit: '1mb' }), (req, res) => {
  try {
    const result = updateHistoryItem(req.user, req.params.id, req.body || {});
    if (result.status !== 200) return res.status(result.status).json({ success: false, error: result.error });
    res.json({ success: true, data: result.item });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.delete('/items/:id', (req, res) => {
  try {
    const mode = String(req.query?.mode || 'hide');
    if (mode !== 'hide' && mode !== 'delete-file') {
      return res.status(400).json({ success: false, error: 'mode must be hide or delete-file' });
    }
    const result = deleteHistoryItem(req.user, req.params.id, mode);
    if (result.status !== 200) return res.status(result.status).json({ success: false, error: result.error });
    res.json({ success: true, data: result.item });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.post('/items/:id/add-to-resources', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const item = listVisibleItems(req.user, { includeHidden: true }).find((entry) => entry.id === req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'History item not found' });
    const payload = {
      url: item.url,
      kind: item.kind,
      title: req.body?.title || item.title,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : item.tags,
      sourceNodeId: item.sourceNodeId,
      sourceCanvasId: item.canvasId,
      favorite: !!req.body?.favorite,
      categoryId: req.body?.categoryId,
    };
    const headers = {
      'Content-Type': 'application/json',
      ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
    };
    const upstream = await fetch(`http://127.0.0.1:${config.PORT}/api/resources/items/add`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

module.exports = router;
