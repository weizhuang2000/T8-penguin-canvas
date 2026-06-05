import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const access = require('../backend/src/auth/canvasAccess.js');

const {
  canEditCanvas,
  canManageCanvasSharing,
  canViewCanvas,
  canvasAccessForUser,
  normalizeSharedWith,
} = access;

const users = {
  2: { id: '2', username: 'bob', name: 'Bob', role: 'designer', status: 'active' },
  3: { id: '3', username: 'carol', name: 'Carol', role: 'pm', status: 'active' },
};

async function normalizeShareUpdate({ actor, canvas, incoming }) {
  if (!canViewCanvas(actor, canvas)) {
    return { status: 403, error: 'No permission to access this canvas' };
  }
  if (!canManageCanvasSharing(actor, canvas)) {
    return { status: 403, error: 'No permission to manage this canvas' };
  }
  const shares = [];
  const seen = new Set();
  for (const raw of incoming) {
    const userId = String(raw?.userId ?? raw?.id ?? '').trim();
    if (!userId || seen.has(userId)) continue;
    if (canvas.ownerUserId && userId === String(canvas.ownerUserId)) {
      return { status: 400, error: 'Cannot share with the canvas owner' };
    }
    if (raw?.permission !== 'view' && raw?.permission !== 'edit') {
      return { status: 400, error: 'Share permission must be view or edit' };
    }
    const user = users[userId];
    if (!user || user.status !== 'active') {
      return { status: 400, error: `User not found or inactive: ${userId}` };
    }
    seen.add(userId);
    shares.push({
      userId,
      username: user.username,
      name: user.name,
      role: user.role,
      permission: raw.permission,
      sharedAt: Number(raw.sharedAt) || 1,
      sharedByUserId: String(actor.id),
    });
  }
  return { status: 200, data: shares };
}

test('canvas list is filtered by owner and shares for normal users', () => {
  const user = { id: '2', role: 'designer' };
  const list = [
    { id: 'own', ownerUserId: '2' },
    { id: 'shared', ownerUserId: '1', sharedWith: [{ userId: '2', permission: 'view' }] },
    { id: 'hidden', ownerUserId: '3' },
  ];
  const visible = list.filter((item) => canViewCanvas(user, item));
  assert.deepEqual(visible.map((item) => item.id), ['own', 'shared']);
  assert.equal(canvasAccessForUser(user, visible[1]).canEdit, false);
});

test('view share cannot save canvas data', () => {
  const user = { id: '2', role: 'designer' };
  const canvas = { ownerUserId: '1', sharedWith: [{ userId: '2', permission: 'view' }] };
  assert.equal(canViewCanvas(user, canvas), true);
  assert.equal(canEditCanvas(user, canvas), false);
});

test('share update normalizes users, dedupes, and rejects invalid permission', async () => {
  const actor = { id: '1', role: 'designer' };
  const canvas = { ownerUserId: '1' };

  const invalid = await normalizeShareUpdate({
    actor,
    canvas,
    incoming: [{ userId: '2', permission: 'admin' }],
  });
  assert.equal(invalid.status, 400);

  const saved = await normalizeShareUpdate({
    actor,
    canvas,
    incoming: [
      { userId: '2', permission: 'view' },
      { userId: '2', permission: 'edit' },
      { userId: '3', permission: 'edit' },
    ],
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(
    saved.data.map((share) => [share.userId, share.name, share.permission]),
    [
      ['2', 'Bob', 'view'],
      ['3', 'Carol', 'edit'],
    ],
  );
});

test('share update rejects sharing to the canvas owner', async () => {
  const result = await normalizeShareUpdate({
    actor: { id: '1', role: 'designer' },
    canvas: { ownerUserId: '1' },
    incoming: [{ userId: '1', permission: 'view' }],
  });
  assert.equal(result.status, 400);
});

test('normalizeSharedWith dedupes and defaults old entries to view', () => {
  const shares = normalizeSharedWith([
    { userId: 2, username: 'bob' },
    { userId: '2', username: 'bob', permission: 'edit' },
    { id: 3, username: 'carol', permission: 'edit' },
  ]);
  assert.deepEqual(shares.map((share) => [share.userId, share.permission]), [['2', 'view'], ['3', 'edit']]);
});
