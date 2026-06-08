'use strict';

const express = require('express');
const { requireAdmin } = require('../auth/middleware');
const { findUserById, listActiveUsers } = require('../auth/designTeamDb');
const { publicUser } = require('../auth/session');
const {
  ALL_NODE_TYPES,
  normalizeDb,
  readDb,
  resolveToolPermissions,
  writeDb,
} = require('../auth/toolPermissions');
const {
  listHistoryUsers,
} = require('../utils/generationHistory');

const router = express.Router();

router.use(requireAdmin);

router.get('/tool-permissions', async (req, res) => {
  try {
    const db = readDb();
    const q = String(req.query?.q || '').trim();
    const users = await listActiveUsers(q, 50).catch(() => []);
    res.json({
      success: true,
      data: {
        ...db,
        allNodeTypes: ALL_NODE_TYPES,
        users: users.map((user) => ({
          ...publicUser(user),
          permissions: resolveToolPermissions(user, db),
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.put('/tool-permissions', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const next = writeDb(normalizeDb(req.body || {}));
    res.json({ success: true, data: next });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.get('/tool-permissions/users/:id', async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user || user.status !== 'active') return res.status(404).json({ success: false, error: 'User not found' });
    res.json({
      success: true,
      data: {
        ...publicUser(user),
        permissions: resolveToolPermissions(user),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.get('/generation-history/users', async (req, res) => {
  try {
    res.json({ success: true, data: await listHistoryUsers(req.user) });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

module.exports = router;
