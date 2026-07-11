'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { isAdminRole } = require('./middleware');
const {
  EXHIBITION_COMPACT_FORM_DEFINITIONS,
  defaultExhibitionCompactForm,
  normalizeExhibitionCompactForm,
} = require('./exhibitionCompactForm');

const ALL_NODE_TYPES = [
  'upload',
  'model-3d-upload',
  'model-3d-preview',
  'material-set',
  'output',
  'text',
  'image',
  'video',
  'seedance',
  'director-storyboard',
  'audio',
  'llm',
  'runninghub',
  'runninghub-wallet',
  'rh-config',
  'rh-tools',
  'rh-toolbox',
  'fal-toolbox',
  'grok-oauth-agent',
  'codex-cli-agent',
  'codex-image-conjure',
  'artist-style-master',
  'anime-tag-master',
  'comfyui-store',
  'comfyui-app-maker',
  'multi-angle-3d',
  'panorama-720',
  'penguin-portrait',
  'portrait-metadata',
  'storyboard-grid',
  'drawing-board',
  'browser',
  'image-compare',
  'frame-extractor',
  'frame-pair',
  'loop',
  'pick-from-set',
  'text-split',
  'import-cam-project',
  'resize',
  'combine',
  'mark',
  'remove-bg',
  'upscale',
  'grid-crop',
  'grid-editor',
  'edit',
  'idea',
  'bp',
  'relay',
  'remove-ai-watermark',
  'video-output',
  'cinematic',
  'video-motion',
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
  'exhibition-floorplan-layout',
  'showcase-interior-design',
  'reverse-isometric-design',
  'cinema-auditorium-design',
  'multi-angle-visual',
  'portrait-master',
  'pose-master',
  'aggregate-parser',
  'batch-processor',
  'topaz-image-upscale',
  'topaz-video-upscale',
  'panorama-3d',
];

const DEFAULT_VISIBLE_NODE_TYPES = [
  'upload',
  'model-3d-upload',
  'model-3d-preview',
  'material-set',
  'output',
  'text',
  'image',
  'video',
  'seedance',
  'director-storyboard',
  'audio',
  'llm',
  'runninghub',
  'runninghub-wallet',
  'rh-tools',
  'rh-toolbox',
  'fal-toolbox',
  'grok-oauth-agent',
  'codex-cli-agent',
  'codex-image-conjure',
  'artist-style-master',
  'anime-tag-master',
  'comfyui-store',
  'comfyui-app-maker',
  'drawing-board',
  'image-compare',
  'frame-pair',
  'loop',
  'pick-from-set',
  'text-split',
  'import-cam-project',
  'resize',
  'combine',
  'mark',
  'grid-crop',
  'grid-editor',
  'idea',
  'bp',
  'relay',
  'remove-ai-watermark',
  'cinematic',
  'video-motion',
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
  'exhibition-floorplan-layout',
  'showcase-interior-design',
  'reverse-isometric-design',
  'cinema-auditorium-design',
  'multi-angle-visual',
  'portrait-master',
  'pose-master',
  'aggregate-parser',
  'batch-processor',
  'topaz-image-upscale',
  'topaz-video-upscale',
  'panorama-3d',
];

function permissionsFile() {
  return config.TOOL_PERMISSIONS_FILE || path.join(config.DATA_DIR, 'tool_permissions.json');
}

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNodeTypes(value, fallback = []) {
  const known = new Set(ALL_NODE_TYPES);
  const out = [];
  const seen = new Set();
  for (const raw of asArray(value)) {
    const type = String(raw || '').trim();
    if (!known.has(type) || seen.has(type)) continue;
    seen.add(type);
    out.push(type);
  }
  return out.length ? out : [...fallback];
}

function normalizeDefaultVisibleNodeTypes(value) {
  const normalized = normalizeNodeTypes(value, DEFAULT_VISIBLE_NODE_TYPES);
  const rawLength = asArray(value).length;
  const looksLikeSavedDefault = rawLength === 0 || normalized.length >= Math.max(1, DEFAULT_VISIBLE_NODE_TYPES.length - 8);
  if (!looksLikeSavedDefault) return normalized;
  const seen = new Set(normalized);
  for (const type of DEFAULT_VISIBLE_NODE_TYPES) {
    if (!seen.has(type)) {
      seen.add(type);
      normalized.push(type);
    }
  }
  return normalized;
}

function normalizeRule(raw = {}) {
  return {
    mode: raw.mode === 'custom' ? 'custom' : 'inherit',
    allowedNodeTypes: normalizeNodeTypes(raw.allowedNodeTypes),
    deniedNodeTypes: normalizeNodeTypes(raw.deniedNodeTypes),
  };
}

function emptyDb() {
  return {
    schema: 't8-tool-permissions',
    version: 2,
    updatedAt: nowIso(),
    defaultVisibleNodeTypes: [...DEFAULT_VISIBLE_NODE_TYPES],
    roleRules: {},
    userRules: {},
    exhibitionCompactForm: defaultExhibitionCompactForm(),
  };
}

function readDb() {
  let raw = null;
  try {
    const file = permissionsFile();
    if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    raw = null;
  }
  const db = emptyDb();
  db.defaultVisibleNodeTypes = normalizeDefaultVisibleNodeTypes(raw?.defaultVisibleNodeTypes);
  for (const [role, rule] of Object.entries(raw?.roleRules || {})) {
    const key = String(role || '').trim();
    if (key) db.roleRules[key] = normalizeRule(rule);
  }
  for (const [userId, rule] of Object.entries(raw?.userRules || {})) {
    const key = String(userId || '').trim();
    if (key) db.userRules[key] = normalizeRule(rule);
  }
  db.exhibitionCompactForm = normalizeExhibitionCompactForm(raw?.exhibitionCompactForm);
  return db;
}

function writeDb(db) {
  const normalized = normalizeDb(db);
  if (!fs.existsSync(config.DATA_DIR)) fs.mkdirSync(config.DATA_DIR, { recursive: true });
  normalized.updatedAt = nowIso();
  const file = permissionsFile();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
  return normalized;
}

function normalizeDb(raw = {}) {
  const db = emptyDb();
  db.defaultVisibleNodeTypes = normalizeDefaultVisibleNodeTypes(raw.defaultVisibleNodeTypes);
  for (const [role, rule] of Object.entries(raw.roleRules || {})) {
    const key = String(role || '').trim();
    if (key) db.roleRules[key] = normalizeRule(rule);
  }
  for (const [userId, rule] of Object.entries(raw.userRules || {})) {
    const key = String(userId || '').trim();
    if (key) db.userRules[key] = normalizeRule(rule);
  }
  db.exhibitionCompactForm = normalizeExhibitionCompactForm(raw.exhibitionCompactForm);
  return db;
}

function applyRule(baseTypes, rule) {
  if (!rule || rule.mode !== 'custom') return new Set(baseTypes);
  const allowed = new Set(rule.allowedNodeTypes.length ? rule.allowedNodeTypes : baseTypes);
  for (const denied of rule.deniedNodeTypes) allowed.delete(denied);
  return allowed;
}

function resolveToolPermissions(user, db = readDb()) {
  const exhibitionCompactForm = normalizeExhibitionCompactForm(db.exhibitionCompactForm);
  if (isAdminRole(user?.role)) {
    return {
      isAdmin: true,
      visibleNodeTypes: [...ALL_NODE_TYPES],
      allowedNodeTypes: [...ALL_NODE_TYPES],
      exhibitionCompactForm,
    };
  }
  const roleRule = db.roleRules[String(user?.role || '')];
  const userRule = db.userRules[String(user?.id || '')];
  const roleTypes = applyRule(db.defaultVisibleNodeTypes, roleRule);
  const finalTypes = applyRule(roleTypes, userRule);
  return {
    isAdmin: false,
    visibleNodeTypes: [...finalTypes],
    allowedNodeTypes: [...finalTypes],
    exhibitionCompactForm,
  };
}

function canUseNode(user, nodeType, db = readDb()) {
  if (!nodeType) return true;
  if (isAdminRole(user?.role)) return true;
  return new Set(resolveToolPermissions(user, db).allowedNodeTypes).has(String(nodeType));
}

function unauthorizedNodeTypes(user, nodeTypes, db = readDb()) {
  if (isAdminRole(user?.role)) return [];
  const allowed = new Set(resolveToolPermissions(user, db).allowedNodeTypes);
  const seen = new Set();
  const out = [];
  for (const raw of asArray(nodeTypes)) {
    const type = String(raw || '').trim();
    if (!type || allowed.has(type) || seen.has(type)) continue;
    seen.add(type);
    out.push(type);
  }
  return out;
}

function assertCanUseNode(req, res, nodeType) {
  if (canUseNode(req.user, nodeType)) return true;
  res.status(403).json({ success: false, error: `No permission to use node: ${nodeType}` });
  return false;
}

function parseHistoryContext(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

function nodeTypeFromRequest(req, fallback) {
  const ctx = parseHistoryContext(req.body?.historyContext ?? req.query?.historyContext);
  const fallbackType = Array.isArray(fallback) ? fallback[0] : fallback;
  return String(ctx.sourceNodeType || req.body?.sourceNodeType || req.query?.sourceNodeType || fallbackType || '').trim();
}

function requireNodePermission(fallbackNodeType) {
  return (req, res, next) => {
    const explicitType = String(parseHistoryContext(req.body?.historyContext ?? req.query?.historyContext).sourceNodeType || req.body?.sourceNodeType || req.query?.sourceNodeType || '').trim();
    const candidates = explicitType
      ? [explicitType]
      : (Array.isArray(fallbackNodeType) ? fallbackNodeType : [fallbackNodeType]).filter(Boolean);
    if (candidates.length === 0 || candidates.some((type) => canUseNode(req.user, type))) {
      next();
      return;
    }
    res.status(403).json({ success: false, error: `No permission to use node: ${candidates.join(', ')}` });
  };
}

function findUnauthorizedNewNodes(user, incomingNodes, existingNodes = []) {
  if (isAdminRole(user?.role)) return [];
  const existingById = new Map(asArray(existingNodes).map((node) => [String(node?.id || ''), String(node?.type || '')]));
  const candidateTypes = [];
  for (const node of asArray(incomingNodes)) {
    const id = String(node?.id || '');
    const type = String(node?.type || '');
    if (!type) continue;
    if (id && existingById.get(id) === type) continue;
    candidateTypes.push(type);
  }
  return unauthorizedNodeTypes(user, candidateTypes);
}

module.exports = {
  ALL_NODE_TYPES,
  DEFAULT_VISIBLE_NODE_TYPES,
  EXHIBITION_COMPACT_FORM_DEFINITIONS,
  assertCanUseNode,
  canUseNode,
  defaultExhibitionCompactForm,
  findUnauthorizedNewNodes,
  nodeTypeFromRequest,
  normalizeDb,
  normalizeExhibitionCompactForm,
  readDb,
  requireNodePermission,
  resolveToolPermissions,
  unauthorizedNodeTypes,
  writeDb,
};
