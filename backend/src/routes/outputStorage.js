'use strict';

const express = require('express');
const { requireAdmin } = require('../auth/middleware');
const { loadSettings } = require('./settings');
const {
  maskOutputStorageSpaces,
  normalizeOutputStorageSpaces,
  summarizeOutputStorageSpaces,
} = require('../outputStorage/settings');
const {
  reconcileRemoteSpace,
  testStorageSpace,
} = require('../outputStorage/manager');

const router = express.Router();
router.use(requireAdmin);

function currentSpaces() {
  const settings = loadSettings();
  return {
    settings,
    spaces: normalizeOutputStorageSpaces(settings.outputStorageSpaces, settings.outputStorageSpaces),
  };
}

function findSpace(spaces, id) {
  return spaces.find((item) => item.id === String(id || '').trim()) || null;
}

router.get('/status', async (_req, res) => {
  const { settings, spaces } = currentSpaces();
  const statuses = await Promise.all(spaces.map(async (space) => {
    if (space.id === 'primary') return { id: space.id, ok: true, local: true };
    if (!space.enabled || !space.baseUrl || !space.apiToken) return { id: space.id, ok: false, configured: false };
    try {
      const result = await testStorageSpace(space);
      return { id: space.id, ok: true, ...(result?.data || result) };
    } catch (error) {
      return { id: space.id, ok: false, configured: true, error: error?.message || String(error) };
    }
  }));
  res.json({
    success: true,
    data: {
      spaces: maskOutputStorageSpaces(spaces),
      summary: summarizeOutputStorageSpaces(spaces, settings.activeOutputStorageSpaceId),
      statuses,
    },
  });
});

router.post('/test', async (req, res) => {
  try {
    const { spaces } = currentSpaces();
    let space = findSpace(spaces, req.body?.spaceId);
    if (req.body?.space && typeof req.body.space === 'object') {
      const id = String(req.body.space.id || '').trim();
      space = normalizeOutputStorageSpaces([req.body.space], spaces).find((item) => item.id === id) || space;
    }
    if (!space || space.id === 'primary') return res.json({ success: true, data: { ok: true, local: true } });
    const result = await testStorageSpace(space);
    return res.json({ success: true, data: { ok: true, ...(result?.data || result) } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

router.post('/reconcile', async (req, res) => {
  try {
    const { spaces } = currentSpaces();
    const space = findSpace(spaces, req.body?.spaceId);
    if (!space || space.id === 'primary') {
      return res.status(400).json({ success: false, error: '请选择远端存储空间' });
    }
    const result = await reconcileRemoteSpace(space);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

module.exports = router;
