'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { findActiveUserByLogin, findUserById, touchLastLogin } = require('../auth/designTeamDb');
const {
  clearSessionCookie,
  createSession,
  deleteSession,
  getTokenFromRequest,
  publicUser,
  setSessionCookie,
} = require('../auth/session');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || '';

async function issueSession(res, user) {
  const token = createSession(user);
  setSessionCookie(res, token);
  return {
    user: publicUser(user),
    token,
  };
}

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ success: false, error: '请输入用户名和密码' });
    }

    const user = await findActiveUserByLogin(username);
    if (!user || !user.password) {
      return res.status(401).json({ success: false, error: '用户名、邮箱或密码错误' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ success: false, error: '用户名、邮箱或密码错误' });
    }

    await touchLastLogin(user.id).catch(() => {});
    res.json({ success: true, data: await issueSession(res, user) });
  } catch (e) {
    console.error('[auth] login failed:', e);
    res.status(500).json({ success: false, error: '登录服务暂时不可用' });
  }
});

router.post('/sso', async (req, res) => {
  try {
    const token = String(req.body?.token || req.body?.sso_token || '').trim();
    if (!token) return res.status(400).json({ success: false, error: '缺少 SSO token' });
    if (!JWT_SECRET) return res.status(500).json({ success: false, error: '服务端未配置 JWT_SECRET' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded?.userId || decoded?.id || decoded?.sub;
    if (!userId) return res.status(401).json({ success: false, error: 'SSO token 无效' });

    const user = await findUserById(String(userId));
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, error: '用户不存在或已被禁用' });
    }

    await touchLastLogin(user.id).catch(() => {});
    res.json({ success: true, data: await issueSession(res, user) });
  } catch (e) {
    console.error('[auth] sso failed:', e?.message || e);
    res.status(401).json({ success: false, error: 'SSO token 无效或已过期' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

router.post('/logout', (req, res) => {
  deleteSession(getTokenFromRequest(req));
  clearSessionCookie(res);
  res.json({ success: true, data: null });
});

module.exports = router;
