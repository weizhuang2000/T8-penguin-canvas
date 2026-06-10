import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const config = require('../backend/src/config.js');

const {
  clearSessionCookie,
  createSession,
  deleteSession,
  getSession,
  publicUser,
  setSessionCookie,
  _resetSessionsForTests,
} = require('../backend/src/auth/session.js');
const { isAdminRole } = require('../backend/src/auth/middleware');

function withSessionFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-auth-session-'));
  const oldSessionFile = config.SESSION_FILE;
  config.SESSION_FILE = path.join(dir, 'sessions.json');
  _resetSessionsForTests();
  t.after(() => {
    config.SESSION_FILE = oldSessionFile;
    _resetSessionsForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('session stores public user data and can be deleted', (t) => {
  withSessionFile(t);
  const token = createSession({
    id: 12,
    username: 'alice',
    email: 'alice@example.com',
    password: 'secret',
    name: 'Alice',
    role: 'designer',
    status: 'active',
    position: 'Designer',
  });

  const session = getSession(token);
  assert.equal(session.user.id, '12');
  assert.equal(session.user.name, 'Alice');
  assert.equal(session.user.role, 'designer');
  assert.equal('password' in session.user, false);

  deleteSession(token);
  assert.equal(getSession(token), null);
});

test('session can be restored from disk after process memory is cleared', (t) => {
  withSessionFile(t);
  const token = createSession({
    id: 21,
    username: 'carol',
    email: 'carol@example.com',
    name: 'Carol',
    role: 'pm',
    status: 'active',
  });

  _resetSessionsForTests();

  const session = getSession(token);
  assert.equal(session.user.id, '21');
  assert.equal(session.user.name, 'Carol');
  assert.equal(session.user.role, 'pm');
});

test('publicUser normalizes safe auth fields', () => {
  const user = publicUser({
    id: 7,
    username: 'bob',
    email: 'bob@example.com',
    realName: 'Bob',
    role: 'manager',
    status: 'active',
  });

  assert.deepEqual(user, {
    id: '7',
    username: 'bob',
    email: 'bob@example.com',
    phone: null,
    name: 'Bob',
    avatarUrl: null,
    role: 'manager',
    status: 'active',
    position: '',
  });
});

test('admin roles include admin and manager only', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('manager'), true);
  assert.equal(isAdminRole('designer'), false);
  assert.equal(isAdminRole('pm'), false);
});

test('local session cookies are not Secure unless explicitly requested', () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldCookieSecure = process.env.T8PC_COOKIE_SECURE;
  process.env.NODE_ENV = 'production';
  delete process.env.T8PC_COOKIE_SECURE;

  const headers = {};
  setSessionCookie({ setHeader: (key, value) => { headers[key] = value; } }, 'tok');
  assert.equal(headers['Set-Cookie'].includes('; Secure'), false);

  process.env.T8PC_COOKIE_SECURE = '1';
  clearSessionCookie({ setHeader: (key, value) => { headers[key] = value; } });
  assert.equal(headers['Set-Cookie'].includes('; Secure'), true);

  if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = oldNodeEnv;
  if (oldCookieSecure === undefined) delete process.env.T8PC_COOKIE_SECURE;
  else process.env.T8PC_COOKIE_SECURE = oldCookieSecure;
});
