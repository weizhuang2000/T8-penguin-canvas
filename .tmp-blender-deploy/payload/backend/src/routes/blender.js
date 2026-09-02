'use strict';

const express = require('express');
const { requireNodePermission } = require('../auth/toolPermissions');
const manager = require('../tools/blender/jobManager');

const router = express.Router();
const permission = requireNodePermission('blender-model');

router.get('/runtime/status', permission, (req, res) => {
  res.json({ success: true, data: manager.getRuntimeStatus(req.query?.path) });
});

router.post('/jobs', permission, (req, res) => {
  try {
    return res.status(202).json({ success: true, data: manager.createJob(req.body || {}, req.user) });
  } catch (error) {
    const status = error.code === 'validation_failed' ? 400 : 500;
    return res.status(status).json({ success: false, error: error.message || '创建 Blender 作业失败' });
  }
});

router.get('/jobs/:id', permission, (req, res) => {
  const job = manager.getJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Blender 作业不存在或已过期' });
  if (!manager.canAccess(job, req.user)) return res.status(403).json({ success: false, error: '无权访问该 Blender 作业' });
  return res.json({ success: true, data: manager.publicJob(job) });
});

router.post('/jobs/:id/cancel', permission, (req, res) => {
  const job = manager.getJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Blender 作业不存在或已过期' });
  if (!manager.canAccess(job, req.user)) return res.status(403).json({ success: false, error: '无权取消该 Blender 作业' });
  return res.json({ success: true, data: manager.cancelJob(job) });
});

module.exports = router;
