'use strict';

const express = require('express');
const config = require('../config');
const settingsRouter = require('./settings');
const { runSeedvr2Upscale } = require('../providers/seedvr2');

const router = express.Router();

router.post('/upscale', async (req, res) => {
  try {
    const settings = settingsRouter.loadSettings();
    const data = await runSeedvr2Upscale(req.body || {}, {
      apiKey: settings.seedvr2ApiKey,
      baseUrl: settings.seedvr2BaseUrl || config.SEEDVR2_BASE_URL,
      localBaseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    res.json({ success: true, data });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ success: false, error: error?.message || String(error), code: error?.code || 'seedvr2_failed' });
  }
});

module.exports = router;
