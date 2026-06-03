import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  createSession,
  deleteSession,
  getSession,
  publicUser,
} = require('../backend/src/auth/session.js');
const { isAdminRole } = require('../backend/src/auth/middleware');

test('session stores public user data and can be deleted', () => {
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
