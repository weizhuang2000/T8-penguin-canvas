'use strict';

const express = require('express');
const config = require('../config');
const settingsRouter = require('./settings');
const { runSeedvr2Upscale } = require('../providers/seedvr2');
const { requireNodePermission } = require('../auth/toolPermissions');
const { addGeneratedHistoryItems } = require('../utils/generationHistory');

const router = express.Router();

router.post('/upscale', requireNodePermission('seedvr2-upscale'), async (req, res) => {
  try {
    const settings = settingsRouter.loadSettings();
    const data = await runSeedvr2Upscale(req.body || {}, {
      apiKey: settings.seedvr2ApiKey,
      baseUrl: settings.seedvr2BaseUrl || config.SEEDVR2_BASE_URL,
      localBaseUrl: `http://127.0.0.1:${config.PORT}`,
    });
    const historyContext = req.body?.historyContext && typeof req.body.historyContext === 'object'
      ? req.body.historyContext
      : {};
    try {
      await addGeneratedHistoryItems([{
        url: data.imageUrl,
        kind: 'image',
        title: historyContext.outputTitle || historyContext.nodeTitle || 'SeedVR2 超分',
        prompt: req.body?.prompt || 'Upscale this image',
        provider: 'SeedVR2',
        model: data.model,
        seed: data.seed,
        width: data.width,
        height: data.height,
      }], {
        ...historyContext,
        prompt: req.body?.prompt || historyContext.prompt || 'Upscale this image',
        provider: 'SeedVR2',
        model: data.model,
        seed: data.seed,
        width: data.width,
        height: data.height,
      }, req.user);
    } catch (historyError) {
      console.warn('[seedvr2] generation history failed:', historyError?.message || historyError);
    }
    res.json({ success: true, data });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ success: false, error: error?.message || String(error), code: error?.code || 'seedvr2_failed' });
  }
});

module.exports = router;
