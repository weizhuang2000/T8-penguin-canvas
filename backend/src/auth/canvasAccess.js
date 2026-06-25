'use strict';

const { isAdminRole } = require('./middleware');

function normalizeSharePermission(value) {
  return value === 'edit' ? 'edit' : 'view';
}

function normalizeAllUsersShare(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const enabled = value === true || !!raw.enabled;
  return {
    enabled,
    permission: normalizeSharePermission(raw.permission),
    updatedAt: Number(raw.updatedAt) || 0,
    updatedByUserId: raw.updatedByUserId != null ? String(raw.updatedByUserId) : '',
  };
}

function normalizeSharedWith(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const shares = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const userId = String(raw.userId ?? raw.id ?? '').trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    shares.push({
      userId,
      username: String(raw.username || ''),
      name: String(raw.name || raw.realName || raw.username || ''),
      role: String(raw.role || ''),
      permission: normalizeSharePermission(raw.permission),
      sharedAt: Number(raw.sharedAt) || Date.now(),
      sharedByUserId: raw.sharedByUserId != null ? String(raw.sharedByUserId) : '',
    });
  }
  return shares;
}

function isCanvasOwner(user, canvas) {
  return Boolean(user && canvas?.ownerUserId) && String(canvas.ownerUserId) === String(user.id);
}

function findCanvasShare(user, canvas) {
  if (!user || !canvas) return null;
  return normalizeSharedWith(canvas.sharedWith).find((share) => share.userId === String(user.id)) || null;
}

function findAllUsersShare(user, canvas) {
  if (!user || !canvas) return null;
  const share = normalizeAllUsersShare(canvas.allUsersShare);
  return share.enabled ? share : null;
}

function canViewCanvas(user, canvas) {
  if (!user || !canvas) return false;
  if (isAdminRole(user.role)) return true;
  if (isCanvasOwner(user, canvas)) return true;
  if (findAllUsersShare(user, canvas)) return true;
  return Boolean(findCanvasShare(user, canvas));
}

function canEditCanvas(user, canvas) {
  if (!user || !canvas) return false;
  if (isAdminRole(user.role)) return true;
  if (isCanvasOwner(user, canvas)) return true;
  const allUsersShare = findAllUsersShare(user, canvas);
  if (allUsersShare?.permission === 'edit') return true;
  return findCanvasShare(user, canvas)?.permission === 'edit';
}

function canManageCanvasSharing(user, canvas) {
  if (!user || !canvas) return false;
  if (isAdminRole(user.role)) return true;
  return isCanvasOwner(user, canvas);
}

function canvasAccessForUser(user, canvas) {
  const share = findCanvasShare(user, canvas);
  const allUsersShare = findAllUsersShare(user, canvas);
  const sharedPermissions = [share?.permission, allUsersShare?.permission].filter(Boolean);
  const sharePermission = sharedPermissions.includes('edit') ? 'edit' : sharedPermissions[0] || null;
  return {
    canView: canViewCanvas(user, canvas),
    canEdit: canEditCanvas(user, canvas),
    canManageSharing: canManageCanvasSharing(user, canvas),
    isOwner: isCanvasOwner(user, canvas),
    isShared: Boolean(share || allUsersShare),
    isAllUsersShared: Boolean(allUsersShare),
    sharePermission,
    allUsersPermission: allUsersShare?.permission || null,
  };
}

function userCanAccessCanvas(user, canvas) {
  return canViewCanvas(user, canvas);
}

function parseNodeSerialId(value) {
  const raw = String(value ?? '').trim().replace(/^#/, '').trim();
  if (!/^\d+$/.test(raw)) return 0;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function deriveNextNodeSerialId(nodes, incomingNext) {
  const requested = parseNodeSerialId(incomingNext);
  let maxSerial = 0;
  for (const node of Array.isArray(nodes) ? nodes : []) {
    maxSerial = Math.max(maxSerial, parseNodeSerialId(node?.data?.nodeSerialId));
  }
  return Math.max(1, requested || 1, maxSerial + 1);
}

module.exports = {
  canEditCanvas,
  canManageCanvasSharing,
  canViewCanvas,
  canvasAccessForUser,
  findCanvasShare,
  findAllUsersShare,
  isCanvasOwner,
  normalizeAllUsersShare,
  normalizeSharedWith,
  normalizeSharePermission,
  userCanAccessCanvas,
  deriveNextNodeSerialId,
};
