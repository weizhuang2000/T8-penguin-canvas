import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const config = require('../backend/src/config.js');
const permissions = require('../backend/src/auth/toolPermissions.js');

function withTempData(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't8-perms-'));
  const old = {
    DATA_DIR: config.DATA_DIR,
    TOOL_PERMISSIONS_FILE: config.TOOL_PERMISSIONS_FILE,
    CANVAS_FILE: config.CANVAS_FILE,
  };
  config.DATA_DIR = path.join(tmp, 'data');
  config.TOOL_PERMISSIONS_FILE = path.join(config.DATA_DIR, 'tool_permissions.json');
  config.CANVAS_FILE = path.join(config.DATA_DIR, 'canvas_list.json');
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  const cleanup = () => {
    Object.assign(config, old);
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  try {
    const result = fn(tmp);
    if (result && typeof result.then === 'function') {
      return result.finally(cleanup);
    }
    cleanup();
    return result;
  } catch (e) {
    cleanup();
    throw e;
  }
}

test('tool permissions resolve admin, user, role, and defaults', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text', 'image'],
    roleRules: {
      designer: { mode: 'custom', allowedNodeTypes: ['text'], deniedNodeTypes: [] },
    },
    userRules: {
      u1: { mode: 'custom', allowedNodeTypes: ['video'], deniedNodeTypes: [] },
    },
  });

  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'text'), true);
  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'image'), false);
  assert.equal(permissions.canUseNode({ id: 'u1', role: 'designer' }, 'video'), true);
  assert.equal(permissions.canUseNode({ id: 'u1', role: 'designer' }, 'text'), false);
  assert.equal(permissions.canUseNode({ id: 'admin', role: 'admin' }, 'rh-config'), true);
}));

test('findUnauthorizedNewNodes allows existing blocked nodes but rejects new ones', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {},
    userRules: {},
  });
  const user = { id: 'u1', role: 'designer' };
  const existing = [{ id: 'old-image', type: 'image' }];
  const incoming = [
    { id: 'old-image', type: 'image' },
    { id: 'new-video', type: 'video' },
    { id: 'new-text', type: 'text' },
  ];
  assert.deepEqual(permissions.findUnauthorizedNewNodes(user, incoming, existing), ['video']);
}));

test('requireNodePermission blocks a disallowed proxy route', async (t) => withTempData(async () => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {},
    userRules: {},
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'u1', role: 'designer' };
    next();
  });
  app.post('/image', permissions.requireNodePermission('image'), (_req, res) => res.json({ success: true }));
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const denied = await fetch(`${base}/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 403);
}));
