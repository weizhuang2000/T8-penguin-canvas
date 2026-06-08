'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 't8pc_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();

function parseCookies(header) {
  const cookies = {};
  String(header || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index <= 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function publicUser(user) {
  if (!user) return null;
  const out = {
    id: String(user.id),
    username: user.username,
    email: user.email,
    phone: user.phone || null,
    name: user.name || user.realName || user.username,
    avatarUrl: user.avatarUrl || null,
    role: user.role || 'designer',
    status: user.status || 'active',
    position: user.position || '',
  };
  if (user.permissions && typeof user.permissions === 'object') out.permissions = user.permissions;
  return out;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    user: publicUser(user),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function deleteSession(token) {
  if (token) sessions.delete(token);
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || '';
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  getTokenFromRequest,
  setSessionCookie,
  clearSessionCookie,
  publicUser,
};
