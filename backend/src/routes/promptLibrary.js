'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { isAdminRole } = require('../auth/middleware');

const router = express.Router();

const DB_FILE = path.join(config.DATA_DIR, 'prompt_library_exhibition.json');
const ELEVATION_DB_FILE = path.join(config.DATA_DIR, 'prompt_library_elevation.json');
const CREATIVE_DB_FILE = path.join(config.DATA_DIR, 'prompt_library_exhibition_creative.json');
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

const DEFAULT_ELEVATION_COLOR_MATERIAL_PRESETS = [
  {
    id: 'minimalism',
    label: '极简主义 / 少即是多',
    info: '核心：大量留白，仅保留最必要的元素，追求极致的简洁与功能性。特征：色彩单一或使用黑白灰，构图考究，字体干净利落。适用：品牌VI、高端产品海报、杂志设计。',
  },
  {
    id: 'swiss-international',
    label: '瑞士 / 国际主义风格',
    info: '核心：网格系统、信息层级清晰、高度理性。特征：偏爱无衬线字体，图片与文字严格对齐，版面干净客观。适用：企业画册、网页UI、导视系统、说明书。',
  },
  {
    id: 'pop-art',
    label: '波普艺术',
    info: '核心：对大众文化和消费主义的戏谑表达。特征：高饱和色彩、丝网印刷网点、名人头像、连环画风格粗黑线。适用：潮流品牌、音乐节海报、个性包装。',
  },
  {
    id: 'flat-design',
    label: '扁平化设计',
    info: '核心：去除一切3D效果，拥抱二维世界。特征：无阴影、无渐变、无纹理，仅用简单几何形状和纯色表达，图标感强。适用：手机App、网页设计、信息图表。',
  },
  {
    id: 'memphis',
    label: '孟菲斯风格',
    info: '核心：故意打破传统配色与构图规矩，充满童趣。特征：粉、蓝、黄等明快色彩，波点与几何图形随机拼贴，常配黑色粗描边。适用：电商促销页、儿童用品、创意海报。',
  },
  {
    id: 'acid-design',
    label: '酸性设计',
    info: '核心：视觉上的迷幻之旅，挑战舒适区。特征：高饱和镭射渐变、液态金属质感、反常规排版、欧普艺术图形、哥特式字体。适用：先锋音乐节、时尚品牌、潮流杂志。',
  },
  {
    id: 'cyberpunk',
    label: '赛博朋克',
    info: '核心：高科技，低生活的反乌托邦视觉。特征：暗夜背景、霓虹青蓝色与洋红色、全息投影、故障元素、机械感。适用：游戏、科技产品、科幻主题活动。',
  },
  {
    id: 'vaporwave',
    label: '蒸汽波',
    info: '核心：对20世纪末网络文化的怀旧与浪漫化。特征：粉紫色调渐变、古希腊石膏像、棕榈树、Windows 95图标、低像素马赛克、VHS质感。适用：复古音乐、独立品牌、个性短视频封面。',
  },
  {
    id: 'y2k',
    label: 'Y2K千禧美学',
    info: '核心：世纪之交对未来的乐观想象。特征：高反光塑料与金属质感、半透明果冻感、蝴蝶/王冠元素、低分辨率噪点贴纸、糖果色搭配铬色。适用：少女时尚、美妆、社交媒体滤镜、饰品设计。',
  },
  {
    id: 'glitch-art',
    label: '故障艺术',
    info: '核心：展现错误之美。特征：图像拉伸、色彩通道错位、画面撕裂、像素化破碎。适用：标题字体特效、先锋文化海报、电子音乐视觉。',
  },
  {
    id: 'illustration',
    label: '插画风格',
    info: '核心：主流叙事形式，分支丰富。特征：可包含扁平插画、渐变/弥散光感、噪点肌理插画、2.5D插画等。适用：叙事海报、品牌视觉、科技场景与内容型设计。',
  },
  {
    id: 'collage',
    label: '拼贴艺术',
    info: '核心：不同材质、照片、文字的解构与重组。特征：撕纸边缘、手写字与印刷体混搭、复古照片与色块叠加，富有手工感和故事性。适用：独立杂志、艺术展览海报、小众品牌。',
  },
  {
    id: 'double-exposure',
    label: '双重曝光',
    info: '核心：将两个或多个影像重叠融合。特征：常将人物肖像与自然风景、城市建筑结合，营造深邃意境。适用：电影海报、摄影作品集、充满故事感的封面。',
  },
  {
    id: 'new-chinese',
    label: '国潮 / 新中式',
    info: '核心：中国传统元素在现代设计语境下焕新。特征：红、绿、金色系，祥云、龙纹、书法飞白，搭配现代几何图形或波普手法。适用：国货品牌、节日营销、文创产品。',
  },
  {
    id: 'pixel-art',
    label: '像素艺术',
    info: '核心：刻意回归早期计算机的视觉限制。特征：明显锯齿边缘、8-bit色彩、低分辨率。适用：独立游戏、创意广告、复古派对。',
  },
  {
    id: 'c4d-3d',
    label: '3D/C4D风格',
    info: '核心：用三维软件渲染出极具质感的图像。特征：立体字、超写实质感、柔和几何体、年轻活泼的IP形象。适用：电商主图、品牌动态logo、IP形象设计。',
  },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_ELEVATION_CRAFT_PRESETS = [
  { id: 'panel', label: '展板', prompt: '模块化高清展板，边缘与分缝收口精细' },
  { id: 'dimensional-letters', label: '立体字', prompt: '精工立体字标题，层级明确，厚度与投影真实' },
  { id: 'luminous-letters', label: '发光字', prompt: '隐藏光源发光字，亮度克制且轮廓清晰' },
  { id: 'soft-film-lightbox', label: '软膜灯箱', prompt: '无边软膜灯箱，画面均匀透亮' },
  { id: 'fabric-lightbox', label: '卡布灯箱', prompt: '卡布灯箱图文模块，画面平整且便于更换' },
  { id: 'uv-print', label: 'UV 喷绘', prompt: '高精度 UV 喷绘图文，色彩稳定，文字边缘锐利' },
  { id: 'acrylic', label: '亚克力', prompt: '透明或半透明亚克力叠层，形成轻盈的信息层次' },
  { id: 'metal-panel', label: '金属板', prompt: '哑光金属板与精细折边，体现耐久和高级质感' },
  { id: 'relief', label: '浮雕造型', prompt: '浅浮雕主题造型，体块与墙面自然衔接' },
  { id: 'led-screen', label: 'LED 屏', prompt: '嵌入式 LED 屏，与图文版式形成完整构图' },
  { id: 'interactive-screen', label: '互动屏', prompt: '嵌入式互动触控屏，设备边框和走线隐藏' },
  { id: 'showcase-niche', label: '展柜/壁龛', prompt: '嵌墙展柜或壁龛，重点照明准确，尺度可信' },
  { id: 'wayfinding', label: '导视标识', prompt: '统一的导视标识系统，编号与方向信息清晰' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_CREATIVE_INSERT_PRESETS = [
  { id: 'large-sculpture', label: '大型雕塑' },
  { id: 'relief', label: '浮雕' },
  { id: 'group-sculpture', label: '群雕' },
  { id: 'art-installation', label: '艺术装置' },
  { id: 'multimedia-equipment', label: '多媒体设备' },
  { id: 'showcase', label: '展柜' },
  { id: 'scene', label: '场景' },
  { id: 'artwork', label: '艺术品' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_CREATIVE_EXCLUDE_PRESETS = [
  { id: 'readable-wrong-text', label: '可读错字/乱码文字' },
  { id: 'real-brand-logo', label: '真实品牌标识' },
  { id: 'instruction-table', label: '说明表格' },
  { id: 'crowded-people', label: '过多人群' },
  { id: 'messy-cables', label: '杂乱线缆' },
  { id: 'cartoon-style', label: '卡通低幼风格' },
  { id: 'blurry-low-quality', label: '低清晰度/模糊画面' },
  { id: 'extra-structure', label: '擅自新增或改变建筑结构' },
].map((item, index) => ({ ...item, order: index }));

function now() {
  return Date.now();
}

function genId() {
  return `prompt_${now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function splitElevationPresetInfo(raw) {
  const text = safeText(raw, 4000);
  const core = text.match(/核心[：:]\s*([\s\S]*?)(?=特征[：:]|适用[：:]|$)/)?.[1] || '';
  const features = text.match(/特征[：:]\s*([\s\S]*?)(?=适用[：:]|$)/)?.[1] || '';
  const usage = text.match(/适用[：:]\s*([\s\S]*?)$/)?.[1] || '';
  return {
    core: safeText(core, 1200),
    features: safeText(features, 1600),
    usage: safeText(usage, 1200),
  };
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

function normalizeElevationPresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_ELEVATION_COLOR_MATERIAL_PRESETS;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label, 120);
      if (!label) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `preset_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      const splitInfo = splitElevationPresetInfo(raw?.info);
      const core = safeText(raw?.core, 1200) || splitInfo.core;
      const features = safeText(raw?.features, 1600) || splitInfo.features;
      const usage = safeText(raw?.usage, 1200) || splitInfo.usage;
      return {
        id,
        label,
        core,
        features,
        usage,
        info: safeText(raw?.info, 4000) || [core && `核心：${core}`, features && `特征：${features}`, usage && `适用：${usage}`].filter(Boolean).join(''),
        order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index,
      };
    })
    .filter(Boolean)
    .slice(0, 80)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({ ...item, order: index }));
}

function normalizeElevationCraftPresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_ELEVATION_CRAFT_PRESETS;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label, 120);
      const prompt = safeText(raw?.prompt || raw?.text, 4000);
      if (!label || !prompt) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `craft_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      return {
        id,
        label,
        prompt,
        order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index,
      };
    })
    .filter(Boolean)
    .slice(0, 80)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({ ...item, order: index }));
}

function normalizeCreativeInsertPresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_EXHIBITION_CREATIVE_INSERT_PRESETS;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label || raw?.text, 120);
      if (!label) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `insert_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      return {
        id,
        label,
        order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index,
      };
    })
    .filter(Boolean)
    .slice(0, 80)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({ ...item, order: index }));
}

function normalizeCreativeExcludePresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_EXHIBITION_CREATIVE_EXCLUDE_PRESETS;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label || raw?.text, 120);
      if (!label) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `exclude_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      return {
        id,
        label,
        order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index,
      };
    })
    .filter(Boolean)
    .slice(0, 80)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({ ...item, order: index }));
}

function readElevationDb() {
  try {
    if (!fs.existsSync(ELEVATION_DB_FILE)) {
      return {
        colorMaterialPresets: normalizeElevationPresetList(DEFAULT_ELEVATION_COLOR_MATERIAL_PRESETS),
        craftPresets: normalizeElevationCraftPresetList(DEFAULT_ELEVATION_CRAFT_PRESETS),
      };
    }
    const raw = JSON.parse(fs.readFileSync(ELEVATION_DB_FILE, 'utf-8'));
    return {
      colorMaterialPresets: normalizeElevationPresetList(raw?.colorMaterialPresets),
      craftPresets: normalizeElevationCraftPresetList(raw?.craftPresets),
    };
  } catch {
    return {
      colorMaterialPresets: normalizeElevationPresetList(DEFAULT_ELEVATION_COLOR_MATERIAL_PRESETS),
      craftPresets: normalizeElevationCraftPresetList(DEFAULT_ELEVATION_CRAFT_PRESETS),
    };
  }
}

function writeElevationDb(db) {
  fs.mkdirSync(path.dirname(ELEVATION_DB_FILE), { recursive: true });
  fs.writeFileSync(
    ELEVATION_DB_FILE,
    JSON.stringify({
      colorMaterialPresets: normalizeElevationPresetList(db?.colorMaterialPresets),
      craftPresets: normalizeElevationCraftPresetList(db?.craftPresets),
    }, null, 2),
    'utf-8',
  );
}

function readCreativeDb() {
  try {
    if (!fs.existsSync(CREATIVE_DB_FILE)) {
      return {
        insertPresets: normalizeCreativeInsertPresetList(DEFAULT_EXHIBITION_CREATIVE_INSERT_PRESETS),
        excludePresets: normalizeCreativeExcludePresetList(DEFAULT_EXHIBITION_CREATIVE_EXCLUDE_PRESETS),
      };
    }
    const raw = JSON.parse(fs.readFileSync(CREATIVE_DB_FILE, 'utf-8'));
    return {
      insertPresets: normalizeCreativeInsertPresetList(raw?.insertPresets),
      excludePresets: normalizeCreativeExcludePresetList(raw?.excludePresets),
    };
  } catch {
    return {
      insertPresets: normalizeCreativeInsertPresetList(DEFAULT_EXHIBITION_CREATIVE_INSERT_PRESETS),
      excludePresets: normalizeCreativeExcludePresetList(DEFAULT_EXHIBITION_CREATIVE_EXCLUDE_PRESETS),
    };
  }
}

function writeCreativeDb(db) {
  fs.mkdirSync(path.dirname(CREATIVE_DB_FILE), { recursive: true });
  fs.writeFileSync(
    CREATIVE_DB_FILE,
    JSON.stringify({
      insertPresets: normalizeCreativeInsertPresetList(db?.insertPresets),
      excludePresets: normalizeCreativeExcludePresetList(db?.excludePresets),
    }, null, 2),
    'utf-8',
  );
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

router.get('/elevation/presets', (_req, res) => {
  const db = readElevationDb();
  res.json({
    success: true,
    data: {
      colorMaterial: normalizeElevationPresetList(db.colorMaterialPresets),
      crafts: normalizeElevationCraftPresetList(db.craftPresets),
    },
  });
});

router.put('/elevation/presets/colorMaterial', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护立面色彩与材质预设' });
  }
  const presets = normalizeElevationPresetList(req.body?.presets);
  const db = readElevationDb();
  writeElevationDb({ ...db, colorMaterialPresets: presets });
  res.json({ success: true, data: presets });
});

router.put('/elevation/presets/crafts', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护立面工艺预设' });
  }
  const db = readElevationDb();
  const presets = normalizeElevationCraftPresetList(req.body?.presets);
  writeElevationDb({ ...db, craftPresets: presets });
  res.json({ success: true, data: presets });
});

router.get('/exhibition-creative/presets', (_req, res) => {
  const db = readCreativeDb();
  res.json({
    success: true,
    data: {
      inserts: normalizeCreativeInsertPresetList(db.insertPresets),
      exclusions: normalizeCreativeExcludePresetList(db.excludePresets),
    },
  });
});

router.put('/exhibition-creative/presets/inserts', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护展陈创意植入项预设' });
  }
  const db = readCreativeDb();
  const presets = normalizeCreativeInsertPresetList(req.body?.presets);
  writeCreativeDb({ ...db, insertPresets: presets });
  res.json({ success: true, data: presets });
});

router.put('/exhibition-creative/presets/exclusions', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护展陈创意排除项预设' });
  }
  const db = readCreativeDb();
  const presets = normalizeCreativeExcludePresetList(req.body?.presets);
  writeCreativeDb({ ...db, excludePresets: presets });
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
