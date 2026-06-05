import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const access = require('../backend/src/auth/canvasAccess.js');

const {
  canEditCanvas,
  canManageCanvasSharing,
  canViewCanvas,
  userCanAccessCanvas,
  deriveNextNodeSerialId,
} = access;

test('admin and manager can access legacy and owned canvases', () => {
  assert.equal(userCanAccessCanvas({ id: '1', role: 'admin' }, {}), true);
  assert.equal(userCanAccessCanvas({ id: '2', role: 'manager' }, { ownerUserId: '99' }), true);
});

test('designer and pm can only access owned canvases', () => {
  assert.equal(userCanAccessCanvas({ id: '5', role: 'designer' }, { ownerUserId: '5' }), true);
  assert.equal(userCanAccessCanvas({ id: '5', role: 'designer' }, { ownerUserId: '6' }), false);
  assert.equal(userCanAccessCanvas({ id: '7', role: 'pm' }, { ownerUserId: '7' }), true);
  assert.equal(userCanAccessCanvas({ id: '7', role: 'pm' }, {}), false);
});

test('shared users can view canvases shared with them', () => {
  const canvas = { ownerUserId: '1', sharedWith: [{ userId: '5', permission: 'view' }] };
  assert.equal(canViewCanvas({ id: '5', role: 'designer' }, canvas), true);
  assert.equal(canViewCanvas({ id: '6', role: 'designer' }, canvas), false);
});

test('view shares cannot edit while edit shares can edit', () => {
  const canvas = {
    ownerUserId: '1',
    sharedWith: [
      { userId: '5', permission: 'view' },
      { userId: '6', permission: 'edit' },
    ],
  };
  assert.equal(canEditCanvas({ id: '5', role: 'designer' }, canvas), false);
  assert.equal(canEditCanvas({ id: '6', role: 'designer' }, canvas), true);
});

test('edit shares cannot manage sharing', () => {
  const canvas = { ownerUserId: '1', sharedWith: [{ userId: '6', permission: 'edit' }] };
  assert.equal(canManageCanvasSharing({ id: '6', role: 'designer' }, canvas), false);
  assert.equal(canManageCanvasSharing({ id: '1', role: 'designer' }, canvas), true);
});

test('admin and manager can edit and manage all canvases', () => {
  const canvas = { ownerUserId: '1' };
  assert.equal(canEditCanvas({ id: '2', role: 'admin' }, canvas), true);
  assert.equal(canManageCanvasSharing({ id: '3', role: 'manager' }, canvas), true);
});

test('deriveNextNodeSerialId preserves monotonic serials', () => {
  assert.equal(
    deriveNextNodeSerialId(
      [
        { data: { nodeSerialId: 2 } },
        { data: { nodeSerialId: '#9' } },
      ],
      4,
    ),
    10,
  );
  assert.equal(deriveNextNodeSerialId([], undefined), 1);
});
