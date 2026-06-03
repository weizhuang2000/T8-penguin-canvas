'use strict';

const { isAdminRole } = require('./middleware');

function userCanAccessCanvas(user, canvas) {
  if (!user || !canvas) return false;
  if (isAdminRole(user.role)) return true;
  return Boolean(canvas.ownerUserId) && String(canvas.ownerUserId) === String(user.id);
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
  userCanAccessCanvas,
  deriveNextNodeSerialId,
};
