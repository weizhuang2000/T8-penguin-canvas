'use strict';

const express = require('express');
const {
  deleteHistoryItem,
  listProjects,
  listVisibleItems,
  updateHistoryItem,
} = require('../utils/generationHistory');
const { detachResourceSourceUrl, upsertResourceItem } = require('./resources');

const router = express.Router();

function canManageGeneratedSharing(user, item) {
  if (!user || !item) return false;
  if (user.role === 'admin') return true;
  return !!item.createdByUserId && String(item.createdByUserId) === String(user.id);
}

function generatedHistoryItem(req) {
  return listVisibleItems(req.user, { includeHidden: true }).find((entry) => entry.id === req.params.id) || null;
}

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

router.delete('/items/:id', async (req, res) => {
  try {
    const mode = String(req.query?.mode || 'hide');
    if (mode !== 'hide' && mode !== 'delete-file') {
      return res.status(400).json({ success: false, error: 'mode must be hide or delete-file' });
    }
    const result = await Promise.resolve(deleteHistoryItem(req.user, req.params.id, mode));
    if (result.status !== 200) return res.status(result.status).json({ success: false, error: result.error });
    res.json({ success: true, data: result.item });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.post('/items/:id/add-to-resources', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const item = generatedHistoryItem(req);
    if (!item) return res.status(404).json({ success: false, error: 'History item not found' });
    if (!canManageGeneratedSharing(req.user, item)) {
      return res.status(403).json({ success: false, error: 'No permission to manage generated image sharing' });
    }
    if (item.kind !== 'image') return res.status(400).json({ success: false, error: 'Only generated images can be shared here' });
    const payload = {
      url: item.url,
      kind: item.kind,
      title: req.body?.title || item.title,
      tags: [
        '生图',
        item.sourceNodeType === 'image-editor' ? '网页版改图' : '无限画布',
        ...(Array.isArray(req.body?.tags) ? req.body.tags : []),
      ],
      sourceNodeId: item.sourceNodeId,
      sourceCanvasId: item.canvasId,
      favorite: !!req.body?.favorite,
      imageAnalysis: item.imageAnalysis,
    };
    const result = await upsertResourceItem(payload, {
      categoryName: '成品',
      preserveExistingCategory: true,
      fillMissingImageAnalysis: true,
    });
    return res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.delete('/items/:id/resources', (req, res) => {
  try {
    const item = generatedHistoryItem(req);
    if (!item) return res.status(404).json({ success: false, error: 'History item not found' });
    if (!canManageGeneratedSharing(req.user, item)) {
      return res.status(403).json({ success: false, error: 'No permission to manage generated image sharing' });
    }
    const result = detachResourceSourceUrl(item.url);
    return res.json({ success: true, data: result });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

module.exports = router;
module.exports.canManageGeneratedSharing = canManageGeneratedSharing;
