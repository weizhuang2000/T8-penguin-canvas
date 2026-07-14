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
  normalizeAllUsersShare,
  normalizeSharePermission,
  normalizeSharedWith,
} = require('../auth/canvasAccess');
const { findUnauthorizedNewNodes } = require('../auth/toolPermissions');
const { patchCanvasNodeData } = require('../utils/canvasDataPatch');

const router = express.Router();
const jsonWriteQueues = new Map();

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

async function atomicWriteJsonNow(file, data, options = {}) {
  const dir = path.dirname(file);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  const text = options.pretty === false ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  try {
    await fs.promises.writeFile(tmp, text, 'utf-8');
    await fs.promises.rename(tmp, file);
  } catch (error) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw error;
  }
}

function atomicWriteJson(file, data, options = {}) {
  const previous = jsonWriteQueues.get(file) || Promise.resolve();
  const queued = previous.catch(() => undefined).then(() => atomicWriteJsonNow(file, data, options));
  let tracked;
  tracked = queued.finally(() => {
    if (jsonWriteQueues.get(file) === tracked) jsonWriteQueues.delete(file);
  });
  jsonWriteQueues.set(file, tracked);
  return tracked;
}

function normalizeCanvasMeta(item) {
  if (!item || typeof item !== 'object') return item;
  item.sharedWith = normalizeSharedWith(item.sharedWith);
  item.allUsersShare = normalizeAllUsersShare(item.allUsersShare);
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
    allUsersShare: normalizeAllUsersShare(item.allUsersShare),
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
        allUsersShare: normalizeAllUsersShare(item.allUsersShare),
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

async function readCanvasDataFileAsync(id) {
  try {
    return JSON.parse(await fs.promises.readFile(getCanvasFile(id), 'utf-8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function rejectUnauthorizedNewNodes(req, res, incomingNodes, existingNodes) {
  const knownNodes = Array.isArray(existingNodes)
    ? existingNodes
    : (readCanvasDataFile(req.params.id)?.nodes || []);
  const blocked = findUnauthorizedNewNodes(req.user, incomingNodes, knownNodes);
  if (blocked.length === 0) return false;
  res.status(403).json({
    success: false,
    error: `No permission to add these node types: ${blocked.join(', ')}`,
    data: { nodeTypes: blocked },
  });
  return true;
}

function canvasExtensionFields(source) {
  const out = {};
  if (source && typeof source === 'object' && source.creativeDesk && typeof source.creativeDesk === 'object') {
    out.creativeDesk = source.creativeDesk;
  }
  return out;
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
    allUsersShare: normalizeAllUsersShare(null),
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
      allUsersShare: normalizeAllUsersShare(null),
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
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'allUsersShare')) {
      if (
        req.body?.allUsersShare?.enabled &&
        req.body?.allUsersShare?.permission !== 'view' &&
        req.body?.allUsersShare?.permission !== 'edit'
      ) {
        return res.status(400).json({ success: false, error: 'All users share permission must be view or edit' });
      }
      found.item.allUsersShare = normalizeAllUsersShare(req.body?.allUsersShare);
      if (found.item.allUsersShare.enabled) {
        found.item.allUsersShare.updatedAt = Number(req.body?.allUsersShare?.updatedAt) || Date.now();
        found.item.allUsersShare.updatedByUserId = String(req.user.id);
      } else {
        found.item.allUsersShare.updatedAt = Number(req.body?.allUsersShare?.updatedAt) || 0;
        found.item.allUsersShare.updatedByUserId = '';
      }
    } else {
      found.item.allUsersShare = normalizeAllUsersShare(found.item.allUsersShare);
    }
    found.item.updatedAt = Date.now();
    saveCanvasList(found.list);
    syncCanvasFileMeta(req.params.id, found.item);
    res.json({ success: true, data: { sharedWith: shares, allUsersShare: found.item.allUsersShare } });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.get('/:id', async (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  const file = getCanvasFile(req.params.id);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ success: false, error: 'Canvas not found' });
  }
  try {
    const data = await readCanvasDataFileAsync(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Canvas not found' });
    }
    res.json({
      success: true,
      data: {
        ...data,
        ownerUserId: data.ownerUserId || found.item.ownerUserId || null,
        ownerName: data.ownerName || found.item.ownerName || '',
        ownerRole: data.ownerRole || found.item.ownerRole || '',
        sharedWith: normalizeSharedWith(found.item.sharedWith || data.sharedWith),
        allUsersShare: normalizeAllUsersShare(found.item.allUsersShare || data.allUsersShare),
        access: canvasAccessForUser(req.user, found.item),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: `Read failed: ${e.message}` });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const found = findCanvasForRequest(req, res);
    if (!found) return;
    if (!requireCanvasEdit(req, res, found)) return;
    const file = getCanvasFile(req.params.id);
    const incoming = req.body;
    const existing = await readCanvasDataFileAsync(req.params.id);
    const allowEmptyOverwrite = req.query?.allowEmpty === '1' || incoming?.allowEmpty === true;
    if (
      !incoming ||
      !Array.isArray(incoming.nodes) ||
      (!allowEmptyOverwrite && incoming.nodes.length === 0 && existing)
    ) {
      if (existing && Array.isArray(existing.nodes) && existing.nodes.length > 0) {
        return res.status(400).json({ success: false, error: 'Refusing to overwrite non-empty canvas with empty data' });
      }
    }

    const persisted = {
      ...canvasExtensionFields(incoming),
      ownerUserId: found.item.ownerUserId || null,
      ownerName: found.item.ownerName || '',
      ownerRole: found.item.ownerRole || '',
      sharedWith: normalizeSharedWith(found.item.sharedWith),
      allUsersShare: normalizeAllUsersShare(found.item.allUsersShare),
      nodes: Array.isArray(incoming?.nodes) ? incoming.nodes : [],
      edges: Array.isArray(incoming?.edges) ? incoming.edges : [],
      viewport: incoming?.viewport || { x: 0, y: 0, zoom: 1 },
      nextNodeSerialId: deriveNextNodeSerialId(incoming?.nodes, incoming?.nextNodeSerialId),
    };
    if (rejectUnauthorizedNewNodes(req, res, persisted.nodes, existing?.nodes)) return;
    await atomicWriteJson(file, persisted, { pretty: false });
    found.item.nodeCount = persisted.nodes.length;
    found.item.ownerUserId = found.item.ownerUserId || persisted.ownerUserId;
    found.item.ownerName = found.item.ownerName || persisted.ownerName;
    found.item.ownerRole = found.item.ownerRole || persisted.ownerRole;
    found.item.sharedWith = normalizeSharedWith(found.item.sharedWith);
    found.item.allUsersShare = normalizeAllUsersShare(found.item.allUsersShare);
    found.item.updatedAt = Date.now();
    saveCanvasList(found.list);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: `Save failed: ${e?.message || String(e)}` });
  }
});

router.patch('/:id/nodes/:nodeId/patch-data', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const found = findCanvasForRequest(req, res);
    if (!found) return;
    if (!requireCanvasEdit(req, res, found)) return;

    const file = getCanvasFile(req.params.id);
    const existing = await readCanvasDataFileAsync(req.params.id);
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
      ...canvasExtensionFields(existing),
      ownerUserId: found.item.ownerUserId || existing.ownerUserId || null,
      ownerName: found.item.ownerName || existing.ownerName || '',
      ownerRole: found.item.ownerRole || existing.ownerRole || '',
      sharedWith: normalizeSharedWith(found.item.sharedWith),
      allUsersShare: normalizeAllUsersShare(found.item.allUsersShare),
      nodes,
      edges: Array.isArray(existing.edges) ? existing.edges : [],
      viewport: existing.viewport || { x: 0, y: 0, zoom: 1 },
      nextNodeSerialId: deriveNextNodeSerialId(nodes, existing.nextNodeSerialId),
    };

    await atomicWriteJson(file, persisted, { pretty: false });
    found.item.nodeCount = nodes.length;
    found.item.updatedAt = Date.now();
    saveCanvasList(found.list);
    res.json({ success: true, data: persisted });
  } catch (e) {
    res.status(500).json({ success: false, error: `Patch failed: ${e?.message || String(e)}` });
  }
});

router.post('/:id/auto-save', async (req, res) => {
  try {
    const found = findCanvasForRequest(req, res);
    if (!found) return;
    if (!requireCanvasEdit(req, res, found)) return;
    const incoming = req.body;
    if (!incoming || !Array.isArray(incoming.nodes) || !Array.isArray(incoming.edges)) {
      return res.status(400).json({ success: false, error: 'Invalid canvas payload' });
    }
    const existing = await readCanvasDataFileAsync(req.params.id);
    if (rejectUnauthorizedNewNodes(req, res, incoming.nodes, existing?.nodes)) return;
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
      ...canvasExtensionFields(incoming),
      canvas: {
        id: req.params.id,
        name,
        ownerUserId: found.item.ownerUserId || null,
        ownerName: found.item.ownerName || '',
        ownerRole: found.item.ownerRole || '',
        sharedWith: normalizeSharedWith(found.item.sharedWith),
        allUsersShare: normalizeAllUsersShare(found.item.allUsersShare),
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

    await atomicWriteJson(target, payload, { pretty: false });
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
