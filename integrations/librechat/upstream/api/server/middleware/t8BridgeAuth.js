'use strict';

const crypto = require('node:crypto');
const { findUser, createUser, updateUser } = require('~/models');
const { setAuthTokens } = require('~/server/services/AuthService');

const ISSUER = 't8';
const MAX_CLOCK_SKEW_MS = 30 * 1000;

function reject(res, message = 'Unauthorized') {
  return res.status(401).json({ message });
}

function verifyIdentity(req) {
  const encoded = String(req.headers['x-t8-codex-user'] || '');
  const supplied = String(req.headers['x-t8-codex-signature'] || '');
  const secret = String(process.env.T8_CODEX_BRIDGE_SECRET || '');
  if (!encoded || !supplied || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('hex');
  if (supplied.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const now = Date.now();
  if (!payload || typeof payload.id !== 'string' || !payload.id.trim()) return null;
  if (!Number.isFinite(Number(payload.expiresAt)) || Number(payload.expiresAt) < now - MAX_CLOCK_SKEW_MS) {
    return null;
  }
  if (Number.isFinite(Number(payload.issuedAt)) && Number(payload.issuedAt) > now + MAX_CLOCK_SKEW_MS) {
    return null;
  }
  return payload;
}

function safeUsername(payload) {
  const source = String(payload.username || payload.id).trim().toLowerCase();
  return source.replace(/[^a-z0-9_.-]/g, '-').slice(0, 80) || `t8-${payload.id.slice(0, 32)}`;
}

function safeEmail(payload) {
  const supplied = String(payload.email || '').trim().toLowerCase();
  if (/^\S+@\S+\.\S+$/.test(supplied)) return supplied;
  const id = String(payload.id).replace(/[^a-z0-9-]/gi, '-').slice(0, 48);
  return `${id || 'user'}@t8.invalid`;
}

async function resolveShadowUser(payload) {
  const sourceId = payload.id.trim();
  const username = safeUsername(payload);
  const name = String(payload.name || payload.username || username).trim().slice(0, 160);
  const role = String(payload.role || '').toLowerCase() === 'admin' ? 'ADMIN' : 'USER';
  let user = await findUser({ idOnTheSource: sourceId, openidIssuer: ISSUER });
  if (!user) {
    try {
      user = await createUser(
        {
          provider: ISSUER,
          idOnTheSource: sourceId,
          openidIssuer: ISSUER,
          email: safeEmail(payload),
          username,
          name,
          role,
          emailVerified: true,
          termsAccepted: true,
        },
        undefined,
        true,
        true,
      );
    } catch (error) {
      // Concurrent first requests can race on the unique source-id index.
      user = await findUser({ idOnTheSource: sourceId, openidIssuer: ISSUER });
      if (!user) throw error;
    }
  }
  if (!user) return null;
  if (user.banned === true || user.disabled === true) return null;
  const changed = {};
  if (user.username !== username) changed.username = username;
  if (user.name !== name) changed.name = name;
  if (user.role !== role) changed.role = role;
  if (Object.keys(changed).length) user = (await updateUser(user.id || user._id, changed)) || user;
  const userId = String(user.id || user._id || '').trim();
  if (!userId) return null;
  return { ...user, id: userId };
}

/**
 * Authenticates requests emitted by the T8 reverse proxy. Requests without
 * bridge headers continue through LibreChat's normal authentication stack.
 */
async function t8BridgeAuth(req, res, next) {
  const hasBridgeHeader = req.headers['x-t8-codex-user'] || req.headers['x-t8-codex-signature'];
  if (!hasBridgeHeader) return next();
  const payload = verifyIdentity(req);
  if (!payload) return reject(res);
  try {
    const user = await resolveShadowUser(payload);
    if (!user) return reject(res, 'T8 user is disabled');
    req.user = user;
    req.authStrategy = 't8-bridge';

    // LibreChat's normal refresh endpoint requires its own refreshToken cookie.
    // The embedded workspace has no standalone login, so mint the regular
    // short-lived LibreChat session token from the already verified T8 identity
    // on the first refresh request. The proxy never forwards T8 credentials to
    // the browser and all later requests are still checked by this middleware.
    let pathname = '';
    try {
      pathname = new URL(req.originalUrl || req.url || '', 'http://localhost').pathname;
    } catch {
      pathname = '';
    }
    if (req.method === 'POST' && pathname.endsWith('/api/auth/refresh')) {
      const token = await setAuthTokens(user._id || user.id, res, null, req);
      const safeUser = user.toObject ? user.toObject() : { ...user };
      delete safeUser.password;
      delete safeUser.totpSecret;
      delete safeUser.backupCodes;
      delete safeUser.__v;
      safeUser.id = String(safeUser._id || safeUser.id);
      return res.status(200).json({ token, user: safeUser });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

t8BridgeAuth.verifyIdentity = verifyIdentity;
t8BridgeAuth.resolveShadowUser = resolveShadowUser;

module.exports = t8BridgeAuth;
