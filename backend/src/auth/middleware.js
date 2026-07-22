'use strict';

const { getSession, getTokenFromRequest } = require('./session');

function isAdminRole(role) {
  return role === 'admin' || role === 'manager';
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  const session = getSession(token);
  if (!session?.user) {
    return res.status(401).json({ success: false, error: '未登录或登录已过期' });
  }
  req.authToken = token;
  req.user = session.user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ success: false, error: '无权限执行此操作' });
  }
  next();
}

function requireAdminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '仅管理员可查看数据监控大屏' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireAdminOnly,
  isAdminRole,
};
