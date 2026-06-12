const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { findUserById } = require('../auth/designTeamDb');
const {
  canEditCanvas,
  canManageCanvasSharing,
  canViewCanvas,
  canvasAccessForUser,
  deriveNextNodeSerialId,
  normalizeSharePermission,
  normalizeSharedWith,
} = require('../auth/canvasAccess');
const { findUnauthorizedNewNodes } = require('../auth/toolPermissions');
const { patchCanvasNodeData } = require('../utils/canvasDataPatch');

const router = express.Router();

function loadCanvasList() {
  if (!fs.existsSync(config.CANVAS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(config.CANVAS_FILE, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCanvasList(list) {
  fs.writeFileSync(config.CANVAS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function getCanvasFile(id) {
  return path.join(config.DATA_DIR, `canvas_${id}.json`);
}

function safeFilename(input) {
  return String(input || 'canvas')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'canvas';
}

function loadSettings() {
  try {
    if (!fs.existsSync(config.SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function getCanvasAutoSaveDir() {
  const settings = loadSettings();
  const base = String(settings.canvasAutoSavePath || config.DEFAULT_CANVAS_AUTO_SAVE_DIR || '').trim();
  if (!base) return '';
  return path.join(base, 'T8-penguin-canvas', 'canvases');
}

function atomicWriteJson(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

function normalizeCanvasMeta(item) {
  if (!item || typeof item !== 'object') return item;
  item.sharedWith = normalizeSharedWith(item.sharedWith);
  return item;
}

function publicCanvasItem(item, user) {
  normalizeCanvasMeta(item);
  return {
    ...item,
    ownerUserId: item.ownerUserId || null,
    ownerName: item.ownerName || '',
    ownerRole: item.ownerRole || '',
    sharedWith: normalizeSharedWith(item.sharedWith),
    access: canvasAccessForUser(user, item),
  };
}

function findCanvasForRequest(req, res) {
  const list = loadCanvasList();
  const item = list.find((x) => x.id === req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: 'Canvas not found' });
    return null;
  }
  normalizeCanvasMeta(item);
  if (!canViewCanvas(req.user, item)) {
    res.status(403).json({ success: false, error: 'No permission to access this canvas' });
    return null;
  }
  return { list, item };
}

function requireCanvasEdit(req, res, found) {
  if (!canEditCanvas(req.user, found.item)) {
    res.status(403).json({ success: false, error: 'No permission to edit this canvas' });
    return false;
  }
  return true;
}

function requireCanvasManage(req, res, found) {
  if (!canManageCanvasSharing(req.user, found.item)) {
    res.status(403).json({ success: false, error: 'No permission to manage this canvas' });
    return false;
  }
  return true;
}

function syncCanvasFileMeta(id, item) {
  const file = getCanvasFile(id);
  if (!fs.existsSync(file)) return;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    fs.writeFileSync(
      file,
      JSON.stringify({
        ...data,
        ownerUserId: item.ownerUserId || data.ownerUserId || null,
        ownerName: item.ownerName || data.ownerName || '',
        ownerRole: item.ownerRole || data.ownerRole || '',
        sharedWith: normalizeSharedWith(item.sharedWith),
      }, null, 2),
      'utf-8'
    );
  } catch {
    // Best effort only; the canonical metadata lives in canvas_list.json.
  }
}

function ownerFieldsFromUser(user) {
  return {
    ownerUserId: String(user.id),
    ownerName: user.name || user.username || '',
    ownerRole: user.role || '',
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function displayNameFromUser(user) {
  return String(user?.name || user?.realName || user?.username || '').trim() || '用户';
}

function nextDefaultCanvasName(list, user) {
  const userName = displayNameFromUser(user);
  const prefix = `${userName}画布`;
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  const ownerUserId = user?.id == null ? '' : String(user.id);
  let maxIndex = 0;
  for (const item of Array.isArray(list) ? list : []) {
    if (ownerUserId && String(item?.ownerUserId || '') !== ownerUserId) continue;
    const match = String(item?.name || '').trim().match(pattern);
    if (!match) continue;
    maxIndex = Math.max(maxIndex, Number(match[1]) || 0);
  }
  return `${prefix}${maxIndex + 1}`;
}

function isGenericDefaultCanvasName(name) {
  const value = String(name || '').trim();
  return (
    !value ||
    /^画布\s*\d+$/i.test(value) ||
    value === '未命名画布' ||
    value === 'Untitled Canvas'
  );
}

function readCanvasDataFile(id) {
  const file = getCanvasFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function rejectUnauthorizedNewNodes(req, res, incomingNodes) {
  const existing = readCanvasDataFile(req.params.id);
  const blocked = findUnauthorizedNewNodes(req.user, incomingNodes, existing?.nodes || []);
  if (blocked.length === 0) return false;
  res.status(403).json({
    success: false,
    error: `No permission to add these node types: ${blocked.join(', ')}`,
    data: { nodeTypes: blocked },
  });
  return true;
}

router.get('/', (req, res) => {
  const list = loadCanvasList()
    .map(normalizeCanvasMeta)
    .filter((item) => canViewCanvas(req.user, item))
    .map((item) => publicCanvasItem(item, req.user));
  res.json({ success: true, data: list });
});

router.post('/', (req, res) => {
  const list = loadCanvasList();
  const id = `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const owner = ownerFieldsFromUser(req.user);
  const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const canvas = {
    id,
    name: isGenericDefaultCanvasName(requestedName) ? nextDefaultCanvasName(list, req.user) : requestedName,
    ...owner,
    sharedWith: [],
    nodeCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  list.push(canvas);
  saveCanvasList(list);
  fs.writeFileSync(
    getCanvasFile(id),
    JSON.stringify({
      ...owner,
      sharedWith: [],
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      nextNodeSerialId: 1,
    }, null, 2),
    'utf-8'
  );
  res.json({ success: true, data: publicCanvasItem(canvas, req.user) });
});

router.get('/:id/shares', (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  if (!requireCanvasManage(req, res, found)) return;
  res.json({ success: true, data: normalizeSharedWith(found.item.sharedWith) });
});

router.put('/:id/shares', async (req, res) => {
  try {
    const found = findCanvasForRequest(req, res);
    if (!found) return;
    if (!requireCanvasManage(req, res, found)) return;

    const incoming = Array.isArray(req.body?.sharedWith) ? req.body.sharedWith : [];
    const shares = [];
    const seen = new Set();
    for (const raw of incoming) {
      const userId = String(raw?.userId ?? raw?.id ?? '').trim();
      if (!userId || seen.has(userId)) continue;
      if (found.item.ownerUserId && userId === String(found.item.ownerUserId)) {
        return res.status(400).json({ success: false, error: 'Cannot share with the canvas owner' });
      }
      const permission = raw?.permission;
      if (permission !== 'view' && permission !== 'edit') {
        return res.status(400).json({ success: false, error: 'Share permission must be view or edit' });
      }
      const user = await findUserById(userId);
      if (!user || user.status !== 'active') {
        return res.status(400).json({ success: false, error: `User not found or inactive: ${userId}` });
      }
      seen.add(userId);
      shares.push({
        userId,
        username: user.username || '',
        name: user.name || user.realName || user.username || '',
        role: user.role || '',
        permission: normalizeSharePermission(permission),
        sharedAt: Number(raw.sharedAt) || Date.now(),
        sharedByUserId: String(req.user.id),
      });
    }

    found.item.sharedWith = shares;
    found.item.updatedAt = Date.now();
    saveCanvasList(found.list);
    syncCanvasFileMeta(req.params.id, found.item);
    res.json({ success: true, data: shares });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.get('/:id', (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  const file = getCanvasFile(req.params.id);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ success: false, error: 'Canvas not found' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    res.json({
      success: true,
      data: {
        ...data,
        ownerUserId: data.ownerUserId || found.item.ownerUserId || null,
        ownerName: data.ownerName || found.item.ownerName || '',
        ownerRole: data.ownerRole || found.item.ownerRole || '',
        sharedWith: normalizeSharedWith(found.item.sharedWith || data.sharedWith),
        access: canvasAccessForUser(req.user, found.item),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: `Read failed: ${e.message}` });
  }
});

router.put('/:id', (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  if (!requireCanvasEdit(req, res, found)) return;
  const file = getCanvasFile(req.params.id);
  const incoming = req.body;
  const allowEmptyOverwrite = req.query?.allowEmpty === '1' || incoming?.allowEmpty === true;
  if (
    !incoming ||
    !Array.isArray(incoming.nodes) ||
    (!allowEmptyOverwrite && incoming.nodes.length === 0 && fs.existsSync(file))
  ) {
    const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : null;
    if (existing && Array.isArray(existing.nodes) && existing.nodes.length > 0) {
      return res.status(400).json({ success: false, error: 'Refusing to overwrite non-empty canvas with empty data' });
    }
  }

  const persisted = {
    ownerUserId: found.item.ownerUserId || null,
    ownerName: found.item.ownerName || '',
    ownerRole: found.item.ownerRole || '',
    sharedWith: normalizeSharedWith(found.item.sharedWith),
    nodes: Array.isArray(incoming?.nodes) ? incoming.nodes : [],
    edges: Array.isArray(incoming?.edges) ? incoming.edges : [],
    viewport: incoming?.viewport || { x: 0, y: 0, zoom: 1 },
    nextNodeSerialId: deriveNextNodeSerialId(incoming?.nodes, incoming?.nextNodeSerialId),
  };
  if (rejectUnauthorizedNewNodes(req, res, persisted.nodes)) return;
  fs.writeFileSync(file, JSON.stringify(persisted, null, 2), 'utf-8');
  found.item.nodeCount = persisted.nodes.length;
  found.item.ownerUserId = found.item.ownerUserId || persisted.ownerUserId;
  found.item.ownerName = found.item.ownerName || persisted.ownerName;
  found.item.ownerRole = found.item.ownerRole || persisted.ownerRole;
  found.item.sharedWith = normalizeSharedWith(found.item.sharedWith);
  found.item.updatedAt = Date.now();
  saveCanvasList(found.list);
  res.json({ success: true });
});

router.patch('/:id/nodes/:nodeId/data', express.json({ limit: '50mb' }), (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  if (!requireCanvasEdit(req, res, found)) return;

  const file = getCanvasFile(req.params.id);
  const existing = readCanvasDataFile(req.params.id);
  if (!existing || !Array.isArray(existing.nodes)) {
    return res.status(404).json({ success: false, error: 'Canvas data not found' });
  }

  const result = patchCanvasNodeData(existing, req.params.nodeId, req.body?.patch);
  if (result.status !== 200) {
    return res.status(result.status).json({ success: false, error: result.error });
  }
  const nodes = result.data.nodes;

  const persisted = {
    ...result.data,
    ownerUserId: found.item.ownerUserId || existing.ownerUserId || null,
    ownerName: found.item.ownerName || existing.ownerName || '',
    ownerRole: found.item.ownerRole || existing.ownerRole || '',
    sharedWith: normalizeSharedWith(found.item.sharedWith),
    nodes,
    edges: Array.isArray(existing.edges) ? existing.edges : [],
    viewport: existing.viewport || { x: 0, y: 0, zoom: 1 },
    nextNodeSerialId: deriveNextNodeSerialId(nodes, existing.nextNodeSerialId),
  };

  fs.writeFileSync(file, JSON.stringify(persisted, null, 2), 'utf-8');
  found.item.nodeCount = nodes.length;
  found.item.updatedAt = Date.now();
  saveCanvasList(found.list);
  res.json({ success: true, data: persisted });
});

router.post('/:id/auto-save', (req, res) => {
  try {
    const found = findCanvasForRequest(req, res);
    if (!found) return;
    if (!requireCanvasEdit(req, res, found)) return;
    const incoming = req.body;
    if (!incoming || !Array.isArray(incoming.nodes) || !Array.isArray(incoming.edges)) {
      return res.status(400).json({ success: false, error: 'Invalid canvas payload' });
    }
    if (rejectUnauthorizedNewNodes(req, res, incoming.nodes)) return;
    const saveDir = getCanvasAutoSaveDir();
    if (!saveDir) {
      return res.status(400).json({ success: false, error: 'canvasAutoSavePath is not configured' });
    }

    const name = found.item?.name || req.params.id;
    const shortId = String(req.params.id).replace(/^canvas-/, '').slice(0, 24);
    const filename = `${safeFilename(name)}-${safeFilename(shortId)}.json`;
    const target = path.join(saveDir, filename);
    const now = Date.now();
    const payload = {
      schema: 't8-penguin-canvas-autosave',
      version: 1,
      autoSavedAt: new Date(now).toISOString(),
      canvas: {
        id: req.params.id,
        name,
        ownerUserId: found.item.ownerUserId || null,
        ownerName: found.item.ownerName || '',
        ownerRole: found.item.ownerRole || '',
        sharedWith: normalizeSharedWith(found.item.sharedWith),
        nodeCount: incoming.nodes.length,
        edgeCount: incoming.edges.length,
        createdAt: found.item?.createdAt || null,
        updatedAt: found.item?.updatedAt || now,
      },
      nodes: incoming.nodes,
      edges: incoming.edges,
      viewport: incoming.viewport || { x: 0, y: 0, zoom: 1 },
      nextNodeSerialId: deriveNextNodeSerialId(incoming.nodes, incoming.nextNodeSerialId),
    };

    atomicWriteJson(target, payload);
    res.json({ success: true, data: { path: target, nodeCount: incoming.nodes.length, edgeCount: incoming.edges.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.delete('/:id', (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  if (!requireCanvasManage(req, res, found)) return;
  saveCanvasList(found.list.filter((x) => x.id !== req.params.id));
  const file = getCanvasFile(req.params.id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

router.patch('/:id/name', (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  if (!requireCanvasManage(req, res, found)) return;
  found.item.name = req.body?.name || found.item.name;
  found.item.updatedAt = Date.now();
  saveCanvasList(found.list);
  res.json({ success: true, data: publicCanvasItem(found.item, req.user) });
});

module.exports = router;
