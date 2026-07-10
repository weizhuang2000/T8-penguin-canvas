// 节点帮助文档路由
// 帮助内容按 nodeType 索引，存放在 data/node_helps.json，独立于 settings.json。
// 范围：仅展陈工具分类的 19 个节点 type（与前端 nodeRegistry.ts 同步）。
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { requireAdmin } = require('../auth/middleware');

const router = express.Router();

// 展陈节点 type 白名单（与 src/config/nodeRegistry.ts 中 category === 'exhibition' 一致）
const EXHIBITION_NODE_TYPES = new Set([
  'import-cam-project',
  'elevation-prompt',
  'exhibition-img2img',
  'exhibition-style-transfer',
  'exhibition-recolor',
  'exhibition-lighting-heatmap',
  'exhibition-creative-image',
  'exhibition-render-to-elevation',
  'exhibition-text-image-loop',
  'exhibition-outline-split',
  'unit-panel-design',
  'sculpture-relief-design',
  'exhibition-wayfinding-design',
  'exhibition-scene-design',
  'science-exhibit-design',
  'showcase-interior-design',
  'cinema-auditorium-design',
]);

const MAX_CONTENT_LENGTH = 100 * 1024; // 100KB

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

function loadHelps() {
  const raw = loadJson(config.NODE_HELP_FILE, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const key of Object.keys(raw)) {
    if (!EXHIBITION_NODE_TYPES.has(key)) continue;
    const value = raw[key];
    if (typeof value === 'string' && value.length <= MAX_CONTENT_LENGTH) {
      result[key] = value;
    }
  }
  return result;
}

function saveHelps(helps) {
  saveJson(config.NODE_HELP_FILE, helps);
}

function normalizeNodeType(value) {
  const raw = String(value || '').trim();
  return EXHIBITION_NODE_TYPES.has(raw) ? raw : '';
}

function normalizeContent(value) {
  if (typeof value !== 'string') return '';
  // 截断过长内容，避免存储滥用
  return value.length > MAX_CONTENT_LENGTH ? value.slice(0, MAX_CONTENT_LENGTH) : value;
}

// GET /api/node-help — 返回全部帮助 { [nodeType]: markdown }
router.get('/', (_req, res) => {
  res.json({ success: true, data: loadHelps() });
});

// GET /api/node-help/export — 导出全部 JSON（与 GET / 等价，独立路径便于备份按钮）
router.get('/export', (_req, res) => {
  res.json({
    success: true,
    data: {
      schema: 't8-node-helps',
      version: 1,
      exportedAt: new Date().toISOString(),
      helps: loadHelps(),
    },
  });
});

// GET /api/node-help/:nodeType — 单个节点帮助
router.get('/:nodeType', (req, res) => {
  const nodeType = normalizeNodeType(req.params.nodeType);
  if (!nodeType) return res.status(400).json({ success: false, error: '未知的节点类型' });
  const helps = loadHelps();
  res.json({ success: true, data: { content: helps[nodeType] || '' } });
});

// PUT /api/node-help/:nodeType — 更新单个节点帮助（admin）
router.put('/:nodeType', requireAdmin, (req, res) => {
  const nodeType = normalizeNodeType(req.params.nodeType);
  if (!nodeType) return res.status(400).json({ success: false, error: '未知的节点类型' });
  const content = normalizeContent(req.body?.content);
  const helps = loadHelps();
  helps[nodeType] = content;
  saveHelps(helps);
  res.json({ success: true, data: { nodeType, content } });
});

// DELETE /api/node-help/:nodeType — 删除单个节点帮助（admin），回退到内置默认
router.delete('/:nodeType', requireAdmin, (req, res) => {
  const nodeType = normalizeNodeType(req.params.nodeType);
  if (!nodeType) return res.status(400).json({ success: false, error: '未知的节点类型' });
  const helps = loadHelps();
  if (Object.prototype.hasOwnProperty.call(helps, nodeType)) {
    delete helps[nodeType];
    saveHelps(helps);
  }
  res.json({ success: true });
});

// POST /api/node-help/bulk — 整体替换全部帮助（admin），用于「恢复全部默认」清空
// body: { helps: { [nodeType]: string } } 或 { helps: {}, mode: 'replace' | 'merge' }
router.post('/bulk', requireAdmin, (req, res) => {
  const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';
  const incoming = req.body?.helps;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ success: false, error: '参数 helps 必须是对象' });
  }
  const normalized = {};
  for (const key of Object.keys(incoming)) {
    const nodeType = normalizeNodeType(key);
    if (!nodeType) continue;
    normalized[nodeType] = normalizeContent(incoming[key]);
  }
  let next;
  if (mode === 'merge') {
    next = { ...loadHelps(), ...normalized };
  } else {
    next = normalized;
  }
  saveHelps(next);
  res.json({ success: true, data: next });
});

// POST /api/node-help/import — 导入备份（admin），支持 { helps } 或 { schema, version, helps }
// body: { helps, mode?: 'merge' | 'replace' }
router.post('/import', requireAdmin, (req, res) => {
  const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
  const incoming = req.body?.helps;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ success: false, error: '备份文件格式不正确' });
  }
  const normalized = {};
  for (const key of Object.keys(incoming)) {
    const nodeType = normalizeNodeType(key);
    if (!nodeType) continue;
    normalized[nodeType] = normalizeContent(incoming[key]);
  }
  let next;
  if (mode === 'replace') {
    next = normalized;
  } else {
    next = { ...loadHelps(), ...normalized };
  }
  saveHelps(next);
  res.json({
    success: true,
    data: {
      helps: next,
      count: Object.keys(next).length,
    },
  });
});

module.exports = router;
module.exports.EXHIBITION_NODE_TYPES = EXHIBITION_NODE_TYPES;
