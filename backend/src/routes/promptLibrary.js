'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { isAdminRole } = require('../auth/middleware');

const router = express.Router();

const DB_FILE = path.join(config.DATA_DIR, 'prompt_library_exhibition.json');
const DIMENSIONS = new Set([
  'spaceType',
  'functionalZones',
  'exhibitionCraft',
  'colorSystem',
  'lightingStrategy',
  'materialExpression',
  'viewComposition',
  'styleReference',
  'negativeItems',
]);

function now() {
  return Date.now();
}

function genId() {
  return `prompt_${now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) return { items: [], presets: {} };
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    return {
      items: Array.isArray(raw?.items) ? raw.items : [],
      presets: raw?.presets && typeof raw.presets === 'object' && !Array.isArray(raw.presets) ? raw.presets : {},
    };
  } catch {
    return { items: [], presets: {} };
  }
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify({ items: db.items || [], presets: db.presets || {} }, null, 2), 'utf-8');
}

function publicItem(item) {
  return {
    id: safeText(item.id, 96),
    scope: item.scope === 'team' ? 'team' : 'personal',
    ownerUserId: safeText(item.ownerUserId, 96),
    ownerName: safeText(item.ownerName, 120),
    dimension: safeText(item.dimension, 80),
    label: safeText(item.label, 120),
    text: safeText(item.text, 4000),
    order: Number(item.order) || 0,
    createdAt: Number(item.createdAt) || 0,
    updatedAt: Number(item.updatedAt) || 0,
  };
}

function canManageItem(user, item) {
  if (!user) return false;
  if (item.scope === 'team') return isAdminRole(user.role);
  return isAdminRole(user.role) || String(item.ownerUserId) === String(user.id);
}

function normalizePresetList(value) {
  if (!Array.isArray(value)) return [];
  const used = new Set();
  return value
    .map((raw, index) => {
      const label = safeText(raw?.label, 120);
      const text = safeText(raw?.text, 4000);
      if (!label || !text) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `preset_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      return {
        id,
        label,
        text,
        order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index,
      };
    })
    .filter(Boolean)
    .slice(0, 80)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({ ...item, order: index }));
}

function normalizeIncoming(body, user, previous) {
  const scope = safeText(body?.scope || previous?.scope || 'personal', 16);
  if (scope !== 'team' && scope !== 'personal') {
    return { error: '词库范围必须是 team 或 personal' };
  }
  if (scope === 'team' && !isAdminRole(user?.role)) {
    return { error: '只有管理员可以维护团队词库', status: 403 };
  }
  const dimension = safeText(body?.dimension || previous?.dimension, 80);
  if (!DIMENSIONS.has(dimension)) {
    return { error: '无效的展陈提示词维度' };
  }
  const label = safeText(body?.label || previous?.label, 120);
  const text = safeText(body?.text || previous?.text, 4000);
  if (!label || !text) {
    return { error: '词条名称和内容不能为空' };
  }
  return {
    item: {
      ...(previous || {}),
      scope,
      dimension,
      label,
      text,
      order: Number.isFinite(Number(body?.order)) ? Number(body.order) : Number(previous?.order) || 0,
    },
  };
}

router.get('/exhibition', (req, res) => {
  const user = req.user;
  const includePersonal = String(req.query?.includePersonal || '') === '1';
  const dimension = safeText(req.query?.dimension, 80);
  const admin = isAdminRole(user?.role);
  const db = readDb();
  let items = db.items
    .map(publicItem)
    .filter((item) => item.scope === 'team' || item.ownerUserId === String(user.id) || (admin && includePersonal));
  if (dimension) items = items.filter((item) => item.dimension === dimension);
  items.sort((a, b) => (a.order || 0) - (b.order || 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  res.json({ success: true, data: items });
});

router.get('/exhibition/presets', (_req, res) => {
  const db = readDb();
  const data = {};
  for (const dimension of DIMENSIONS) {
    data[dimension] = normalizePresetList(db.presets?.[dimension]);
  }
  res.json({ success: true, data });
});

router.put('/exhibition/presets/:dimension', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有管理员可以维护展陈维度预设' });
  }
  const dimension = safeText(req.params.dimension, 80);
  if (!DIMENSIONS.has(dimension)) {
    return res.status(400).json({ success: false, error: '无效的展陈提示词维度' });
  }
  const presets = normalizePresetList(req.body?.presets);
  const db = readDb();
  db.presets = db.presets || {};
  db.presets[dimension] = presets;
  writeDb(db);
  res.json({ success: true, data: presets });
});

router.post('/exhibition', (req, res) => {
  const user = req.user;
  const normalized = normalizeIncoming(req.body || {}, user, null);
  if (normalized.error) {
    return res.status(normalized.status || 400).json({ success: false, error: normalized.error });
  }
  const db = readDb();
  const ts = now();
  const item = publicItem({
    ...normalized.item,
    id: genId(),
    ownerUserId: String(user.id),
    ownerName: safeText(user.name || user.username || user.id, 120),
    createdAt: ts,
    updatedAt: ts,
  });
  db.items.push(item);
  writeDb(db);
  res.json({ success: true, data: item });
});

router.put('/exhibition/:id', (req, res) => {
  const user = req.user;
  const db = readDb();
  const idx = db.items.findIndex((item) => item.id === req.params.id);
  if (idx < 0) return res.status(404).json({ success: false, error: '词条不存在' });
  const previous = publicItem(db.items[idx]);
  if (!canManageItem(user, previous)) {
    return res.status(403).json({ success: false, error: '无权限维护此词条' });
  }
  const normalized = normalizeIncoming(req.body || {}, user, previous);
  if (normalized.error) {
    return res.status(normalized.status || 400).json({ success: false, error: normalized.error });
  }
  const next = publicItem({
    ...previous,
    ...normalized.item,
    ownerUserId: previous.ownerUserId,
    ownerName: previous.ownerName,
    createdAt: previous.createdAt,
    updatedAt: now(),
  });
  db.items[idx] = next;
  writeDb(db);
  res.json({ success: true, data: next });
});

router.delete('/exhibition/:id', (req, res) => {
  const user = req.user;
  const db = readDb();
  const item = db.items.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, error: '词条不存在' });
  if (!canManageItem(user, publicItem(item))) {
    return res.status(403).json({ success: false, error: '无权限维护此词条' });
  }
  db.items = db.items.filter((entry) => entry.id !== req.params.id);
  writeDb(db);
  res.json({ success: true, data: null });
});

module.exports = router;
