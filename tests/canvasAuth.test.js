import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const access = require('../backend/src/auth/canvasAccess.js');

const { userCanAccessCanvas, deriveNextNodeSerialId } = access;

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
