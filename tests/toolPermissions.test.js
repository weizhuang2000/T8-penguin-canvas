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

test('tool permissions include exhibition style transfer as a valid grant', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {
      designer: { mode: 'custom', allowedNodeTypes: ['exhibition-style-transfer'], deniedNodeTypes: [] },
    },
    userRules: {},
  });

  const resolved = permissions.resolveToolPermissions({ id: 'u2', role: 'designer' });
  assert.equal(permissions.ALL_NODE_TYPES.includes('exhibition-style-transfer'), true);
  assert.equal(permissions.DEFAULT_VISIBLE_NODE_TYPES.includes('exhibition-style-transfer'), true);
  assert.equal(resolved.allowedNodeTypes.includes('exhibition-style-transfer'), true);
  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'exhibition-style-transfer'), true);
}));

test('tool permissions merge new default-visible nodes into old configs', () => withTempData(() => {
  const oldDefaults = permissions.DEFAULT_VISIBLE_NODE_TYPES.filter((type) => type !== 'exhibition-lighting-heatmap');
  permissions.writeDb({
    defaultVisibleNodeTypes: oldDefaults,
    roleRules: {},
    userRules: {},
  });

  const resolved = permissions.resolveToolPermissions({ id: 'u2', role: 'designer' });
  assert.equal(permissions.ALL_NODE_TYPES.includes('exhibition-lighting-heatmap'), true);
  assert.equal(permissions.DEFAULT_VISIBLE_NODE_TYPES.includes('exhibition-lighting-heatmap'), true);
  assert.equal(resolved.visibleNodeTypes.includes('exhibition-lighting-heatmap'), true);
  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'exhibition-lighting-heatmap'), true);
}));

test('tool permissions expose ACE-Step music node and migrate it into saved defaults', () => withTempData(() => {
  const oldDefaults = permissions.DEFAULT_VISIBLE_NODE_TYPES.filter((type) => type !== 'gitee-music');
  permissions.writeDb({ defaultVisibleNodeTypes: oldDefaults, roleRules: {}, userRules: {} });

  const resolved = permissions.resolveToolPermissions({ id: 'u2', role: 'designer' });
  assert.equal(permissions.ALL_NODE_TYPES.includes('gitee-music'), true);
  assert.equal(permissions.DEFAULT_VISIBLE_NODE_TYPES.includes('gitee-music'), true);
  assert.equal(resolved.visibleNodeTypes.includes('gitee-music'), true);
  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'gitee-music'), true);
}));

test('tool permissions keep exhibition text-image loop grants when saved from user management', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {
      designer: { mode: 'custom', allowedNodeTypes: ['exhibition-text-image-loop'], deniedNodeTypes: [] },
    },
    userRules: {},
  });

  const db = permissions.readDb();
  const resolved = permissions.resolveToolPermissions({ id: 'u2', role: 'designer' }, db);
  assert.equal(permissions.ALL_NODE_TYPES.includes('exhibition-text-image-loop'), true);
  assert.equal(permissions.DEFAULT_VISIBLE_NODE_TYPES.includes('exhibition-text-image-loop'), true);
  assert.deepEqual(db.roleRules.designer.allowedNodeTypes, ['exhibition-text-image-loop']);
  assert.equal(resolved.visibleNodeTypes.includes('exhibition-text-image-loop'), true);
  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'exhibition-text-image-loop', db), true);
}));

test('tool permissions keep render-to-elevation grants when saved from user management', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {
      designer: { mode: 'custom', allowedNodeTypes: ['exhibition-render-to-elevation'], deniedNodeTypes: [] },
    },
    userRules: {},
  });

  const db = permissions.readDb();
  const resolved = permissions.resolveToolPermissions({ id: 'u2', role: 'designer' }, db);
  assert.equal(permissions.ALL_NODE_TYPES.includes('exhibition-render-to-elevation'), true);
  assert.equal(permissions.DEFAULT_VISIBLE_NODE_TYPES.includes('exhibition-render-to-elevation'), true);
  assert.deepEqual(db.roleRules.designer.allowedNodeTypes, ['exhibition-render-to-elevation']);
  assert.equal(resolved.visibleNodeTypes.includes('exhibition-render-to-elevation'), true);
  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'exhibition-render-to-elevation', db), true);
}));

test('tool permissions keep image edit node grants when saved from user management', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {
      designer: { mode: 'custom', allowedNodeTypes: ['image-edit'], deniedNodeTypes: [] },
    },
    userRules: {},
  });

  const db = permissions.readDb();
  const resolved = permissions.resolveToolPermissions({ id: 'u2', role: 'designer' }, db);
  assert.equal(permissions.ALL_NODE_TYPES.includes('image-edit'), true);
  assert.equal(permissions.DEFAULT_VISIBLE_NODE_TYPES.includes('image-edit'), true);
  assert.deepEqual(db.roleRules.designer.allowedNodeTypes, ['image-edit']);
  assert.equal(resolved.visibleNodeTypes.includes('image-edit'), true);
  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'image-edit', db), true);
}));

test('tool permissions keep FHL image generation grants saved from user management', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {
      designer: { mode: 'custom', allowedNodeTypes: ['fhl-image-gen'], deniedNodeTypes: [] },
    },
    userRules: {
      u1: { mode: 'custom', allowedNodeTypes: ['fhl-image-gen'], deniedNodeTypes: [] },
    },
  });

  const db = permissions.readDb();
  const resolved = permissions.resolveToolPermissions({ id: 'u1', role: 'designer' }, db);
  assert.equal(permissions.ALL_NODE_TYPES.includes('fhl-image-gen'), true);
  assert.equal(permissions.DEFAULT_VISIBLE_NODE_TYPES.includes('fhl-image-gen'), true);
  assert.deepEqual(db.roleRules.designer.allowedNodeTypes, ['fhl-image-gen']);
  assert.deepEqual(db.userRules.u1.allowedNodeTypes, ['fhl-image-gen']);
  assert.equal(resolved.allowedNodeTypes.includes('fhl-image-gen'), true);
  assert.equal(permissions.canUseNode({ id: 'u1', role: 'designer' }, 'fhl-image-gen', db), true);
}));

test('tool permissions migrate FHL image generation into saved default visibility', () => withTempData(() => {
  const oldDefaults = permissions.DEFAULT_VISIBLE_NODE_TYPES.filter((type) => type !== 'fhl-image-gen');
  permissions.writeDb({ defaultVisibleNodeTypes: oldDefaults, roleRules: {}, userRules: {} });

  const db = permissions.readDb();
  const resolved = permissions.resolveToolPermissions({ id: 'u2', role: 'designer' }, db);
  assert.equal(db.defaultVisibleNodeTypes.includes('fhl-image-gen'), true);
  assert.equal(resolved.visibleNodeTypes.includes('fhl-image-gen'), true);
  assert.equal(permissions.canUseNode({ id: 'u2', role: 'designer' }, 'fhl-image-gen', db), true);
}));

test('tool permissions default exhibition compact form for old configs', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {},
    userRules: {},
  });

  const db = permissions.readDb();
  assert.ok(db.exhibitionCompactForm.sectionsByNodeType['exhibition-img2img'].includes('craft'));
  assert.ok(db.exhibitionCompactForm.itemsByNodeType['exhibition-img2img'].craft.includes('preset-options'));
  assert.ok(db.exhibitionCompactForm.sectionsByNodeType['showcase-interior-design'].includes('showcase'));
  assert.deepEqual(db.exhibitionCompactForm.hiddenKeysByNodeType, {});
}));

test('tool permissions filters unknown compact form node types, sections, and items but keeps DOM keys', () => withTempData(() => {
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {},
    userRules: {},
    exhibitionCompactForm: {
      sectionsByNodeType: {
        'exhibition-img2img': ['craft', 'unknown-section', 'craft'],
        'unknown-node': ['craft'],
      },
      itemsByNodeType: {
        'exhibition-img2img': {
          craft: ['preset-options', 'unknown-item', 'preset-options'],
          'unknown-section': ['preset-options'],
        },
        'unknown-node': {
          craft: ['preset-options'],
        },
      },
      hiddenKeysByNodeType: {
        'exhibition-img2img': ['references:plan-reference', 'references:plan-reference', ' custom-dom-key '],
        'unknown-node': ['references:plan-reference'],
      },
    },
  });

  const db = permissions.readDb();
  assert.deepEqual(db.exhibitionCompactForm.sectionsByNodeType['exhibition-img2img'], ['craft']);
  assert.deepEqual(db.exhibitionCompactForm.itemsByNodeType['exhibition-img2img'].craft, ['preset-options']);
  assert.equal(Object.hasOwn(db.exhibitionCompactForm.itemsByNodeType['exhibition-img2img'], 'unknown-section'), false);
  assert.equal(Object.hasOwn(db.exhibitionCompactForm.sectionsByNodeType, 'unknown-node'), false);
  assert.equal(Object.hasOwn(db.exhibitionCompactForm.itemsByNodeType, 'unknown-node'), false);
  assert.deepEqual(db.exhibitionCompactForm.hiddenKeysByNodeType['exhibition-img2img'], ['references:plan-reference', 'custom-dom-key']);
  assert.equal(Object.hasOwn(db.exhibitionCompactForm.hiddenKeysByNodeType, 'unknown-node'), false);
}));

test('resolved permissions expose exhibition compact form to normal users', () => withTempData(() => {
  const db = permissions.normalizeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {},
    userRules: {},
    exhibitionCompactForm: {
      sectionsByNodeType: {
        'exhibition-lighting-heatmap': ['analysis'],
      },
      itemsByNodeType: {
        'exhibition-lighting-heatmap': {
          analysis: ['mode'],
        },
      },
      hiddenKeysByNodeType: {
        'exhibition-lighting-heatmap': ['analysis:mode'],
      },
    },
  });

  const resolved = permissions.resolveToolPermissions({ id: 'u2', role: 'designer' }, db);
  assert.deepEqual(resolved.exhibitionCompactForm.sectionsByNodeType['exhibition-lighting-heatmap'], ['analysis']);
  assert.deepEqual(resolved.exhibitionCompactForm.itemsByNodeType['exhibition-lighting-heatmap'].analysis, ['mode']);
  assert.deepEqual(resolved.exhibitionCompactForm.hiddenKeysByNodeType['exhibition-lighting-heatmap'], ['analysis:mode']);
}));

test('admin exhibition compact form patch is admin-only and stores DOM keys', async (t) => withTempData(async () => {
  const adminRouter = require('../backend/src/routes/admin.js');
  permissions.writeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {},
    userRules: {},
  });
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 'u1', role: req.get('x-role') || 'designer' };
    next();
  });
  app.use('/api/admin', adminRouter);
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({
    exhibitionCompactForm: {
      hiddenKeysByNodeType: {
        'exhibition-img2img': ['references:plan-reference'],
        'unknown-node': ['x'],
      },
    },
  });

  const denied = await fetch(`${base}/api/admin/exhibition-compact-form`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  assert.equal(denied.status, 403);

  const allowed = await fetch(`${base}/api/admin/exhibition-compact-form`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-role': 'admin' },
    body,
  });
  assert.equal(allowed.status, 200);
  const json = await allowed.json();
  assert.deepEqual(json.data.hiddenKeysByNodeType['exhibition-img2img'], ['references:plan-reference']);
  assert.equal(Object.hasOwn(json.data.hiddenKeysByNodeType, 'unknown-node'), false);
}));

test('tool permissions migrates old recolor surface compact section to palette', () => withTempData(() => {
  const db = permissions.normalizeDb({
    defaultVisibleNodeTypes: ['text'],
    roleRules: {},
    userRules: {},
    exhibitionCompactForm: {
      sectionsByNodeType: {
        'exhibition-recolor': ['surface'],
      },
      itemsByNodeType: {
        'exhibition-recolor': {
          surface: ['floor'],
        },
      },
    },
  });

  assert.deepEqual(db.exhibitionCompactForm.sectionsByNodeType['exhibition-recolor'], ['palette']);
  assert.deepEqual(db.exhibitionCompactForm.itemsByNodeType['exhibition-recolor'].palette, ['floor']);
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
