const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { deriveNextNodeSerialId, userCanAccessCanvas } = require('../auth/canvasAccess');

const router = express.Router();

function loadCanvasList() {
  if (!fs.existsSync(config.CANVAS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(config.CANVAS_FILE, 'utf-8'));
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

function findCanvasForRequest(req, res) {
  const list = loadCanvasList();
  const item = list.find((x) => x.id === req.params.id);
  if (!item) {
    res.status(404).json({ success: false, error: '画布不存在' });
    return null;
  }
  if (!userCanAccessCanvas(req.user, item)) {
    res.status(403).json({ success: false, error: '无权访问该画布' });
    return null;
  }
  return { list, item };
}

function ownerFieldsFromUser(user) {
  return {
    ownerUserId: String(user.id),
    ownerName: user.name || user.username || '',
    ownerRole: user.role || '',
  };
}

router.get('/', (req, res) => {
  const list = loadCanvasList().filter((item) => userCanAccessCanvas(req.user, item));
  res.json({ success: true, data: list });
});

router.post('/', (req, res) => {
  const list = loadCanvasList();
  const id = `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const owner = ownerFieldsFromUser(req.user);
  const canvas = {
    id,
    name: req.body?.name || '未命名画布',
    ...owner,
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
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      nextNodeSerialId: 1,
    }, null, 2),
    'utf-8'
  );
  res.json({ success: true, data: canvas });
});

router.get('/:id', (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  const file = getCanvasFile(req.params.id);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ success: false, error: '画布不存在' });
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
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: `读取失败: ${e.message}` });
  }
});

router.put('/:id', (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
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
      return res.status(400).json({ success: false, error: '拒绝空数据覆盖' });
    }
  }

  const persisted = {
    ownerUserId: found.item.ownerUserId || null,
    ownerName: found.item.ownerName || '',
    ownerRole: found.item.ownerRole || '',
    nodes: Array.isArray(incoming?.nodes) ? incoming.nodes : [],
    edges: Array.isArray(incoming?.edges) ? incoming.edges : [],
    viewport: incoming?.viewport || { x: 0, y: 0, zoom: 1 },
    nextNodeSerialId: deriveNextNodeSerialId(incoming?.nodes, incoming?.nextNodeSerialId),
  };
  fs.writeFileSync(file, JSON.stringify(persisted, null, 2), 'utf-8');
  found.item.nodeCount = persisted.nodes.length;
  found.item.ownerUserId = found.item.ownerUserId || persisted.ownerUserId;
  found.item.ownerName = found.item.ownerName || persisted.ownerName;
  found.item.ownerRole = found.item.ownerRole || persisted.ownerRole;
  found.item.updatedAt = Date.now();
  saveCanvasList(found.list);
  res.json({ success: true });
});

router.post('/:id/auto-save', (req, res) => {
  try {
    const found = findCanvasForRequest(req, res);
    if (!found) return;
    const incoming = req.body;
    if (!incoming || !Array.isArray(incoming.nodes) || !Array.isArray(incoming.edges)) {
      return res.status(400).json({ success: false, error: '画布数据格式错误' });
    }
    const saveDir = getCanvasAutoSaveDir();
    if (!saveDir) {
      return res.status(400).json({ success: false, error: '未配置 canvasAutoSavePath' });
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
  saveCanvasList(found.list.filter((x) => x.id !== req.params.id));
  const file = getCanvasFile(req.params.id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

router.patch('/:id/name', (req, res) => {
  const found = findCanvasForRequest(req, res);
  if (!found) return;
  found.item.name = req.body?.name || found.item.name;
  found.item.updatedAt = Date.now();
  saveCanvasList(found.list);
  res.json({ success: true, data: found.item });
});

module.exports = router;
