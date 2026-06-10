'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const COOKIE_NAME = 't8pc_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();
let loaded = false;

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

function sessionFile() {
  return config.SESSION_FILE || path.join(config.DATA_DIR, 'auth_sessions.json');
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const file = sessionFile();
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const items = Array.isArray(raw?.sessions) ? raw.sessions : [];
    const now = Date.now();
    let changed = false;
    for (const item of items) {
      const token = typeof item?.token === 'string' ? item.token : '';
      const expiresAt = Number(item?.expiresAt) || 0;
      const user = publicUser(item?.user);
      if (!token || !user || expiresAt <= now) {
        changed = true;
        continue;
      }
      sessions.set(token, { user, expiresAt });
    }
    if (changed) persistSessions();
  } catch (e) {
    console.warn('[auth] load sessions failed:', e?.message || e);
  }
}

function persistSessions() {
  try {
    const file = sessionFile();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const items = [];
    for (const [token, session] of sessions.entries()) {
      if (!session?.user || session.expiresAt <= now) {
        sessions.delete(token);
        continue;
      }
      items.push({ token, user: session.user, expiresAt: session.expiresAt });
    }
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, sessions: items }, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn('[auth] persist sessions failed:', e?.message || e);
  }
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
  ensureLoaded();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    user: publicUser(user),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  persistSessions();
  return token;
}

function getSession(token) {
  ensureLoaded();
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    persistSessions();
    return null;
  }
  return session;
}

function deleteSession(token) {
  ensureLoaded();
  if (!token) return;
  if (sessions.delete(token)) persistSessions();
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || '';
}

function setSessionCookie(res, token) {
  const secure = process.env.T8PC_COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.T8PC_COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function _resetSessionsForTests() {
  sessions.clear();
  loaded = false;
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  getTokenFromRequest,
  setSessionCookie,
  clearSessionCookie,
  publicUser,
  _resetSessionsForTests,
};
