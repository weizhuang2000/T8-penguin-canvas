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
  cleanupPublishedLocalFiles,
  getLocalCleanupState,
  reconcileRemoteSpace,
  testStorageSpace,
} = require('../outputStorage/manager');
const { testCloudTargetConnectivity } = require('../cloudUploads/uploader');

const router = express.Router();
router.use(requireAdmin);

function currentSpaces() {
  const settings = loadSettings();
  return {
    settings,
    spaces: normalizeOutputStorageSpaces(settings.outputStorageSpaces, settings.outputStorageSpaces, settings.cloudUploadTargets),
  };
}

function findSpace(spaces, id) {
  return spaces.find((item) => item.id === String(id || '').trim()) || null;
}

function findCloudTarget(settings, space) {
  return (settings.cloudUploadTargets || []).find((item) => item.id === space?.cloudTargetId && item.provider === space?.provider) || null;
}

async function testSpace(settings, space) {
  if (space.type === 'cloud-upload-target') {
    const target = findCloudTarget(settings, space);
    if (!target) throw new Error('百度网盘云端目标配置不存在');
    const result = await testCloudTargetConnectivity(target);
    return { ...result, capacityManagedExternally: true };
  }
  return testStorageSpace(space);
}

router.get('/status', async (_req, res) => {
  const { settings, spaces } = currentSpaces();
  const statuses = await Promise.all(spaces.map(async (space) => {
    if (space.id === 'primary') return { id: space.id, ok: true, local: true };
    const configured = space.type === 'cloud-upload-target'
      ? !!findCloudTarget(settings, space)?.baiduNetdisk?.webdavUrl
      : !!(space.baseUrl && space.apiToken);
    if (!space.enabled || !configured) return { id: space.id, ok: false, configured: false };
    try {
      const result = await testSpace(settings, space);
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
      cleanup: getLocalCleanupState(),
    },
  });
});

router.post('/cleanup/preview', async (_req, res) => {
  try {
    return res.json({ success: true, data: await cleanupPublishedLocalFiles({ dryRun: true }) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

router.post('/cleanup/run', async (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({ success: false, error: 'confirm=true is required' });
  }
  try {
    return res.json({ success: true, data: await cleanupPublishedLocalFiles() });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { settings, spaces } = currentSpaces();
    let space = findSpace(spaces, req.body?.spaceId);
    if (req.body?.space && typeof req.body.space === 'object') {
      const id = String(req.body.space.id || '').trim();
      space = normalizeOutputStorageSpaces([req.body.space], spaces).find((item) => item.id === id) || space;
    }
    if (!space || space.id === 'primary') return res.json({ success: true, data: { ok: true, local: true } });
    const result = await testSpace(settings, space);
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
