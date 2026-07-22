'use strict';

const express = require('express');
const { recordHeartbeat } = require('../utils/monitoringMetrics');

const router = express.Router();

router.post('/heartbeat', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const data = recordHeartbeat(req.user);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[monitoring] heartbeat failed:', error);
    res.status(500).json({ success: false, error: '记录在线状态失败' });
  }
});

module.exports = router;
