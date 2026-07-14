'use strict';

const express = require('express');
const { requireNodePermission } = require('../auth/toolPermissions');
const manager = require('../tools/remotion/jobManager');
const generationManager = require('../tools/remotion/generationManager');

const router = express.Router();
const permission = requireNodePermission('remotion-animation');

router.get('/runtime/status', permission, (_req, res) => {
  res.json({ success: true, data: manager.getRuntimeStatus() });
});

router.post('/spec/validate', permission, (req, res) => {
  const mode = req.body?.mode === 'tsx' ? 'tsx' : 'json';
  const result = manager.validateSource(mode, req.body?.source, {
    assets: Array.isArray(req.body?.assets) ? req.body.assets : [],
    profile: req.body?.profile,
  });
  if (!result.ok) return res.status(400).json({ success: false, error: 'Remotion 描述校验失败', data: { errors: result.errors } });
  return res.json({ success: true, data: { valid: true, spec: mode === 'json' ? result.data : undefined } });
});

router.post('/generation-jobs', permission, (req, res) => {
  try {
    const job = generationManager.createGenerationJob(req.body || {}, req.user);
    return res.status(202).json({ success: true, data: job });
  } catch (error) {
    const status = error.code === 'validation_failed' ? 400 : 500;
    return res.status(status).json({ success: false, error: error.message || '创建 Remotion 生成作业失败' });
  }
});

router.get('/generation-jobs/:id', permission, (req, res) => {
  const job = generationManager.getGenerationJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Remotion 生成作业不存在或已过期' });
  if (!generationManager.canAccess(job, req.user)) return res.status(403).json({ success: false, error: '无权访问该 Remotion 生成作业' });
  return res.json({ success: true, data: generationManager.publicJob(job) });
});

router.post('/generation-jobs/:id/cancel', permission, (req, res) => {
  const job = generationManager.getGenerationJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Remotion 生成作业不存在或已过期' });
  if (!generationManager.canAccess(job, req.user)) return res.status(403).json({ success: false, error: '无权取消该 Remotion 生成作业' });
  return res.json({ success: true, data: generationManager.cancelGenerationJob(job) });
});

router.post('/jobs', permission, (req, res) => {
  try {
    const job = manager.createJob(req.body || {}, req.user);
    return res.status(202).json({ success: true, data: job });
  } catch (error) {
    const status = error.code === 'validation_failed' ? 400 : 500;
    return res.status(status).json({ success: false, error: error.message || '创建 Remotion 作业失败', data: { errors: error.errors || [] } });
  }
});

router.get('/jobs/:id', permission, (req, res) => {
  const job = manager.getJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Remotion 作业不存在或已过期' });
  if (!manager.canAccess(job, req.user)) return res.status(403).json({ success: false, error: '无权访问该 Remotion 作业' });
  return res.json({ success: true, data: manager.publicJob(job) });
});

router.post('/jobs/:id/cancel', permission, (req, res) => {
  const job = manager.getJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Remotion 作业不存在或已过期' });
  if (!manager.canAccess(job, req.user)) return res.status(403).json({ success: false, error: '无权取消该 Remotion 作业' });
  return res.json({ success: true, data: manager.cancelJob(job) });
});

module.exports = router;
