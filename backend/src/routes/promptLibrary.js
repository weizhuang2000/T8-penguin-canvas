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
const IMG2IMG_DB_FILE = path.join(config.DATA_DIR, 'prompt_library_exhibition_img2img.json');
const PLAN_LAYOUT_DB_FILE = path.join(config.DATA_DIR, 'prompt_library_exhibition_plan_layout.json');
const AI_PLAN_LAYOUT_DB_FILE = path.join(config.DATA_DIR, 'prompt_library_exhibition_ai_plan_layout.json');
const RECOLOR_DB_FILE = path.join(config.DATA_DIR, 'prompt_library_exhibition_recolor.json');
const UNIT_PANEL_DB_FILE = path.join(config.DATA_DIR, 'prompt_library_unit_panel.json');
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

const EXHIBITION_CREATIVE_INSERT_CATEGORIES = new Set(['装饰', '多媒体', '艺术品', '展陈', '展柜', '展台', '顶部', '其它']);

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

const ELEVATION_CRAFT_CATEGORIES = new Set(['装饰', '多媒体', '艺术品', '展陈', '展柜', '展台', '顶部', '其它']);

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

const DEFAULT_EXHIBITION_CREATIVE_VIEW_ANGLE_PRESETS = [
  { id: 'front', label: '正视角' },
  { id: 'left', label: '左视角' },
  { id: 'right', label: '右视角' },
  { id: 'back', label: '后视角' },
  { id: 'top', label: '上视角' },
  { id: 'left-45', label: '左45度视角' },
  { id: 'right-45', label: '右45度视角' },
  { id: 'top-45', label: '上45度视角' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_IMG2IMG_EXCLUDE_PRESETS = [
  { id: 'readable-wrong-text', label: '可读错字/乱码文字' },
  { id: 'real-brand-logo', label: '真实品牌标识' },
  { id: 'instruction-table', label: '说明表格' },
  { id: 'crowded-people', label: '过多人群' },
  { id: 'messy-cables', label: '杂乱线缆' },
  { id: 'cartoon-style', label: '卡通低幼风格' },
  { id: 'blurry-low-quality', label: '低清晰度/模糊画面' },
  { id: 'extra-structure', label: '擅自新增或改变建筑结构' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_PLAN_LAYOUT_INSERT_PRESETS = [
  { id: 'large-sculpture', label: '大型雕塑' },
  { id: 'relief', label: '浮雕' },
  { id: 'group-sculpture', label: '群雕' },
  { id: 'art-installation', label: '艺术装置' },
  { id: 'multimedia-equipment', label: '多媒体设备' },
  { id: 'showcase', label: '文物柜/展柜' },
  { id: 'scene', label: '场景复原' },
  { id: 'artwork', label: '艺术品/主题展项' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_PLAN_LAYOUT_EXCLUDE_PRESETS = [
  { id: 'readable-wrong-text', label: '可读错字/乱码文字' },
  { id: 'real-brand-logo', label: '真实品牌标识' },
  { id: 'instruction-table', label: '说明表格' },
  { id: 'crowded-people', label: '过多人群' },
  { id: 'messy-cables', label: '杂乱线缆' },
  { id: 'cartoon-style', label: '卡通低幼风格' },
  { id: 'blurry-low-quality', label: '低清晰度/模糊画面' },
  { id: 'floating-islands', label: '孤立漂浮展区' },
  { id: 'isolated-columns', label: '孤零零不连接任何物体的柱子' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS = [
  { id: 'tech-blueprint', label: '科技馆蓝白线稿汇报风', prompt: '科技馆蓝白线稿汇报风：白色底图、蓝色/青色分区、清晰细线、红色动线箭头、理性工程图表达，适合科技产业与城市规划展陈。' },
  { id: 'minimal-museum', label: '极简博物馆风', prompt: '极简博物馆风：低饱和灰白底、克制色块、少量重点色、标注精简，强调留白、秩序和专业博物馆导览感。' },
  { id: 'family-learning', label: '儿童研学明亮风', prompt: '儿童研学明亮风：明亮友好的分区色彩、清晰图标化展项、动线易懂但不幼稚，适合亲子研学和互动教育空间。' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS = [
  { id: 'one-way-no-branch', label: '单向无分叉动线', prompt: '动线从入口到出口必须单向连续、无分叉、无断线，依次经过所有展区，避免回头路和交叉拥堵。' },
  { id: 'keep-fire-route', label: '保留消防疏散通道', prompt: '必须保留原建筑主要消防疏散通道和门洞可达关系，不得用展墙、展柜或装置遮挡必要疏散路径。' },
  { id: 'core-exhibit-near-atrium', label: '主展项靠近中庭', prompt: '将核心展项或主题装置布置在中庭、开敞核心区或视觉焦点附近，并围绕它组织若干连续展区。' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_RECOLOR_PALETTE_PRESETS = [
  { id: 'deep-blue-warm-gold', label: '深蓝暖金', category: '文化展陈', primaryColor: '#1f5f8b', secondaryColor: '#c7a76c', harmonyColor: '#e7dcc7', accentColor: '#e94b35', description: '沉稳蓝色主调，暖金辅助，适合历史文化与综合展陈' },
  { id: 'graphite-copper-cyan', label: '石墨铜青', category: '科技产业', primaryColor: '#2f3742', secondaryColor: '#b98248', harmonyColor: '#6f7f86', accentColor: '#2bb3c0', description: '深灰空间基底，铜色收边，青色点缀，适合科技与产业展' },
  { id: 'warm-white-wood-red', label: '暖白木色', category: '通用温暖', primaryColor: '#f2eee6', secondaryColor: '#9a6b45', harmonyColor: '#d8c7ad', accentColor: '#b73b35', description: '明亮温和的展墙基底，木色辅助，红色作为叙事强调' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_RECOLOR_EXCLUDE_PRESETS = [
  { id: 'exhibit', label: '展品' },
  { id: 'sand-table', label: '沙盘' },
  { id: 'sculpture', label: '雕塑' },
  { id: 'relic', label: '文物' },
  { id: 'artwork', label: '艺术品' },
  { id: 'model', label: '模型' },
  { id: 'description-text', label: '说明文字' },
  { id: 'brand-signage', label: '品牌/标识' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_RECOLOR_FLOOR_PRESETS = [
  { id: 'keep-floor', label: '保持地面原状', prompt: '地面保持原有材质、铺装分缝、反射和明暗层次，仅随整体色调做轻微自然匹配' },
  { id: 'dark-matte-stone', label: '深色哑光石材', prompt: '地面调整为深色哑光石材或微水泥质感，低反射、耐磨、分缝克制，保持原有地面边界和透视' },
  { id: 'light-neutral-stone', label: '浅灰中性石材', prompt: '地面调整为浅灰中性石材或大板砖，干净明亮、反射柔和，保持原有铺装方向和空间比例' },
  { id: 'warm-wood-floor', label: '暖木色地面', prompt: '地面调整为温润木色或木纹饰面，纹理克制、适合人文展陈，保持原有地面结构和动线' },
  { id: 'terrazzo-floor', label: '水磨石地面', prompt: '地面调整为细颗粒水磨石质感，色彩与主色调协调，保持原有地面轮廓、坡度和台阶关系' },
].map((item, index) => ({ ...item, order: index }));

const DEFAULT_EXHIBITION_RECOLOR_CEILING_PRESETS = [
  { id: 'keep-ceiling', label: '保持天花原状', prompt: '天花板保持原有造型、设备、灯位、标高和明暗层次，仅随整体色调做轻微自然匹配' },
  { id: 'dark-concealed-ceiling', label: '深色隐藏顶', prompt: '天花板调整为深色隐藏顶或黑色设备顶，弱化设备存在感，保持原有灯位、喷淋、风口和标高关系' },
  { id: 'soft-film-light-ceiling', label: '软膜发光顶', prompt: '天花板调整为均匀柔和的软膜发光顶效果，亮度克制不过曝，保持原有天花边界和灯光逻辑' },
  { id: 'linear-light-ceiling', label: '线性灯带顶', prompt: '天花板加入或强化线性灯带氛围，色温与主色调协调，但不改变原有天花分区、灯具位置和结构关系' },
  { id: 'white-clean-ceiling', label: '白色洁净顶', prompt: '天花板调整为白色或浅灰洁净顶，整体更明亮通透，保持原有设备点位、梁位和层高关系' },
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
      const category = safeText(raw?.category || raw?.group || raw?.type, 80) || '默认';
      return {
        id,
        category,
        label,
        core,
        features,
        usage,
        info: safeText(raw?.info, 4000) || [core && `核心：${core}`, features && `特征：${features}`, usage && `适用：${usage}`].filter(Boolean).join(''),
        order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index,
      };
    })
    .filter(Boolean)
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
      const category = safeText(raw?.category, 40);
      return {
        id,
        category: ELEVATION_CRAFT_CATEGORIES.has(category) ? category : '其它',
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
      const category = safeText(raw?.category, 40);
      return {
        id,
        category: EXHIBITION_CREATIVE_INSERT_CATEGORIES.has(category) ? category : '其它',
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

function normalizeImg2ImgExcludePresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_EXHIBITION_IMG2IMG_EXCLUDE_PRESETS;
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

function normalizeCreativeViewAnglePresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_EXHIBITION_CREATIVE_VIEW_ANGLE_PRESETS;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label || raw?.text, 120);
      if (!label) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `view_${index + 1}`;
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

function normalizePlanLayoutInsertPresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_EXHIBITION_PLAN_LAYOUT_INSERT_PRESETS;
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

function normalizePlanLayoutExcludePresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_EXHIBITION_PLAN_LAYOUT_EXCLUDE_PRESETS;
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

function normalizeAiPlanLayoutPresetList(value, defaults, fallbackId) {
  const source = Array.isArray(value) && value.length > 0 ? value : defaults;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label || raw?.text, 120);
      const prompt = safeText(raw?.prompt || raw?.text || raw?.label, 3000);
      if (!label || !prompt) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `${fallbackId}_${index + 1}`;
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

function normalizeHexColor(value, fallback) {
  const text = safeText(value, 32);
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toLowerCase();
  }
  return fallback;
}

function normalizeRecolorPalettePresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_EXHIBITION_RECOLOR_PALETTE_PRESETS;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label || raw?.text, 120);
      if (!label) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `palette_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      const fallback = DEFAULT_EXHIBITION_RECOLOR_PALETTE_PRESETS[index % DEFAULT_EXHIBITION_RECOLOR_PALETTE_PRESETS.length] || DEFAULT_EXHIBITION_RECOLOR_PALETTE_PRESETS[0];
      return {
        id,
        label,
        category: safeText(raw?.category || raw?.group || fallback.category || '未分类', 120) || '未分类',
        primaryColor: normalizeHexColor(raw?.primaryColor || raw?.primary_color, fallback.primaryColor),
        secondaryColor: normalizeHexColor(raw?.secondaryColor || raw?.secondary_color, fallback.secondaryColor),
        harmonyColor: normalizeHexColor(raw?.harmonyColor || raw?.harmony_color || raw?.neutralColor || raw?.neutral_color, fallback.harmonyColor || fallback.secondaryColor),
        accentColor: normalizeHexColor(raw?.accentColor || raw?.accent_color, fallback.accentColor),
        description: safeText(raw?.description || raw?.info, 1000),
        order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index,
      };
    })
    .filter(Boolean)
    .slice(0, 120)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({ ...item, order: index }));
}

function normalizeRecolorExcludePresetList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_EXHIBITION_RECOLOR_EXCLUDE_PRESETS;
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
    .slice(0, 120)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({ ...item, order: index }));
}

function normalizeRecolorSurfacePresetList(value, fallback, prefix) {
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label || raw?.text, 120);
      const prompt = safeText(raw?.prompt || raw?.description || raw?.text, 1200);
      if (!label || !prompt) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `${prefix}_${index + 1}`;
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
    .slice(0, 120)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({ ...item, order: index }));
}

function normalizeRecolorFloorPresetList(value) {
  return normalizeRecolorSurfacePresetList(value, DEFAULT_EXHIBITION_RECOLOR_FLOOR_PRESETS, 'floor');
}

function normalizeRecolorCeilingPresetList(value) {
  return normalizeRecolorSurfacePresetList(value, DEFAULT_EXHIBITION_RECOLOR_CEILING_PRESETS, 'ceiling');
}

const DEFAULT_UNIT_PANEL_MATERIALS = [
  {
    id: 'dark-blue-matte-metal',
    category: '金属',
    label: '深蓝哑光金属',
    description: '深蓝低反射金属面板，适合沉稳历史文化主题',
    texture: '哑光喷涂、细微金属颗粒、低反射表面',
    usage: '主材质',
  },
  {
    id: 'champagne-brushed-metal',
    category: '金属',
    label: '香槟金拉丝金属',
    description: '暖金色拉丝金属，用于标题字、边框和重点装饰',
    texture: '细密拉丝、微弱高光、金属包边',
    usage: '主材质或辅助材质',
  },
  {
    id: 'warm-wood-veneer',
    category: '木作',
    label: '暖色木饰面',
    description: '温润木纹饰面，适合人文叙事与地方文化展陈',
    texture: '自然木纹、半哑光清漆、细腻拼缝',
    usage: '主材质',
  },
  {
    id: 'stone-texture-panel',
    category: '石材',
    label: '深灰石纹板',
    description: '深灰石材肌理板，强调厚重、历史和纪念性',
    texture: '石材纹理、微水泥质感、低饱和灰阶',
    usage: '主材质或背景材质',
  },
  {
    id: 'translucent-acrylic',
    category: '亚克力',
    label: '半透明发光亚克力',
    description: '半透明亚克力发光层，用于局部导视、标题背光和图形层',
    texture: '柔和透光、磨砂边缘、内发光',
    usage: '辅助材质',
  },
  {
    id: 'etched-bronze',
    category: '金属',
    label: '蚀刻古铜',
    description: '带历史感的古铜蚀刻面，适合纹样、地图和铭文装饰',
    texture: '古铜氧化、浅浮雕、蚀刻线条',
    usage: '辅助材质',
  },
  {
    id: 'low-iron-glass',
    category: '玻璃',
    label: '超白玻璃',
    description: '高通透玻璃或保护面层，用于展板局部覆盖和精致反射',
    texture: '通透、轻微反射、精磨边',
    usage: '辅助材质',
  },
].map((item, index) => ({ ...item, order: index }));

function normalizeUnitPanelMaterialList(value) {
  const source = Array.isArray(value) && value.length > 0 ? value : DEFAULT_UNIT_PANEL_MATERIALS;
  const used = new Set();
  return source
    .map((raw, index) => {
      const label = safeText(raw?.label, 120);
      if (!label) return null;
      let id = safeText(raw?.id, 96).replace(/[^a-zA-Z0-9_-]/g, '');
      if (!id) id = `material_${index + 1}`;
      while (used.has(id)) id = `${id}_${index + 1}`;
      used.add(id);
      return {
        id,
        category: safeText(raw?.category, 120) || '默认',
        label,
        description: safeText(raw?.description, 1000),
        texture: safeText(raw?.texture, 1000),
        usage: safeText(raw?.usage, 1000),
        order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : index,
      };
    })
    .filter(Boolean)
    .slice(0, 120)
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
        viewAnglePresets: normalizeCreativeViewAnglePresetList(DEFAULT_EXHIBITION_CREATIVE_VIEW_ANGLE_PRESETS),
      };
    }
    const raw = JSON.parse(fs.readFileSync(CREATIVE_DB_FILE, 'utf-8'));
    return {
      insertPresets: normalizeCreativeInsertPresetList(raw?.insertPresets),
      excludePresets: normalizeCreativeExcludePresetList(raw?.excludePresets),
      viewAnglePresets: normalizeCreativeViewAnglePresetList(raw?.viewAnglePresets),
    };
  } catch {
    return {
      insertPresets: normalizeCreativeInsertPresetList(DEFAULT_EXHIBITION_CREATIVE_INSERT_PRESETS),
      excludePresets: normalizeCreativeExcludePresetList(DEFAULT_EXHIBITION_CREATIVE_EXCLUDE_PRESETS),
      viewAnglePresets: normalizeCreativeViewAnglePresetList(DEFAULT_EXHIBITION_CREATIVE_VIEW_ANGLE_PRESETS),
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
      viewAnglePresets: normalizeCreativeViewAnglePresetList(db?.viewAnglePresets),
    }, null, 2),
    'utf-8',
  );
}

function readImg2ImgDb() {
  try {
    if (!fs.existsSync(IMG2IMG_DB_FILE)) {
      return {
        excludePresets: normalizeImg2ImgExcludePresetList(DEFAULT_EXHIBITION_IMG2IMG_EXCLUDE_PRESETS),
      };
    }
    const raw = JSON.parse(fs.readFileSync(IMG2IMG_DB_FILE, 'utf-8'));
    return {
      excludePresets: normalizeImg2ImgExcludePresetList(raw?.excludePresets),
    };
  } catch {
    return {
      excludePresets: normalizeImg2ImgExcludePresetList(DEFAULT_EXHIBITION_IMG2IMG_EXCLUDE_PRESETS),
    };
  }
}

function writeImg2ImgDb(db) {
  fs.mkdirSync(path.dirname(IMG2IMG_DB_FILE), { recursive: true });
  fs.writeFileSync(
    IMG2IMG_DB_FILE,
    JSON.stringify({
      excludePresets: normalizeImg2ImgExcludePresetList(db?.excludePresets),
    }, null, 2),
    'utf-8',
  );
}

function readPlanLayoutDb() {
  try {
    if (!fs.existsSync(PLAN_LAYOUT_DB_FILE)) {
      return {
        insertPresets: normalizePlanLayoutInsertPresetList(DEFAULT_EXHIBITION_PLAN_LAYOUT_INSERT_PRESETS),
        excludePresets: normalizePlanLayoutExcludePresetList(DEFAULT_EXHIBITION_PLAN_LAYOUT_EXCLUDE_PRESETS),
      };
    }
    const raw = JSON.parse(fs.readFileSync(PLAN_LAYOUT_DB_FILE, 'utf-8'));
    return {
      insertPresets: normalizePlanLayoutInsertPresetList(raw?.insertPresets),
      excludePresets: normalizePlanLayoutExcludePresetList(raw?.excludePresets),
    };
  } catch {
    return {
      insertPresets: normalizePlanLayoutInsertPresetList(DEFAULT_EXHIBITION_PLAN_LAYOUT_INSERT_PRESETS),
      excludePresets: normalizePlanLayoutExcludePresetList(DEFAULT_EXHIBITION_PLAN_LAYOUT_EXCLUDE_PRESETS),
    };
  }
}

function writePlanLayoutDb(db) {
  fs.mkdirSync(path.dirname(PLAN_LAYOUT_DB_FILE), { recursive: true });
  fs.writeFileSync(
    PLAN_LAYOUT_DB_FILE,
    JSON.stringify({
      insertPresets: normalizePlanLayoutInsertPresetList(db?.insertPresets),
      excludePresets: normalizePlanLayoutExcludePresetList(db?.excludePresets),
    }, null, 2),
    'utf-8',
  );
}

function readAiPlanLayoutDb() {
  try {
    if (!fs.existsSync(AI_PLAN_LAYOUT_DB_FILE)) {
      return {
        stylePresets: normalizeAiPlanLayoutPresetList(DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS, 'style'),
        requirementPresets: normalizeAiPlanLayoutPresetList(DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS, 'requirement'),
      };
    }
    const raw = JSON.parse(fs.readFileSync(AI_PLAN_LAYOUT_DB_FILE, 'utf-8'));
    return {
      stylePresets: normalizeAiPlanLayoutPresetList(raw?.stylePresets || raw?.styles, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS, 'style'),
      requirementPresets: normalizeAiPlanLayoutPresetList(raw?.requirementPresets || raw?.requirements, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS, 'requirement'),
    };
  } catch {
    return {
      stylePresets: normalizeAiPlanLayoutPresetList(DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS, 'style'),
      requirementPresets: normalizeAiPlanLayoutPresetList(DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS, 'requirement'),
    };
  }
}

function writeAiPlanLayoutDb(db) {
  fs.mkdirSync(path.dirname(AI_PLAN_LAYOUT_DB_FILE), { recursive: true });
  fs.writeFileSync(
    AI_PLAN_LAYOUT_DB_FILE,
    JSON.stringify({
      stylePresets: normalizeAiPlanLayoutPresetList(db?.stylePresets, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS, 'style'),
      requirementPresets: normalizeAiPlanLayoutPresetList(db?.requirementPresets, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS, 'requirement'),
    }, null, 2),
    'utf-8',
  );
}

function readRecolorDb() {
  try {
    if (!fs.existsSync(RECOLOR_DB_FILE)) {
      return {
        palettePresets: normalizeRecolorPalettePresetList(DEFAULT_EXHIBITION_RECOLOR_PALETTE_PRESETS),
        excludePresets: normalizeRecolorExcludePresetList(DEFAULT_EXHIBITION_RECOLOR_EXCLUDE_PRESETS),
        floorPresets: normalizeRecolorFloorPresetList(DEFAULT_EXHIBITION_RECOLOR_FLOOR_PRESETS),
        ceilingPresets: normalizeRecolorCeilingPresetList(DEFAULT_EXHIBITION_RECOLOR_CEILING_PRESETS),
      };
    }
    const raw = JSON.parse(fs.readFileSync(RECOLOR_DB_FILE, 'utf-8'));
    return {
      palettePresets: normalizeRecolorPalettePresetList(raw?.palettePresets || raw?.palettes),
      excludePresets: normalizeRecolorExcludePresetList(raw?.excludePresets || raw?.exclusions),
      floorPresets: normalizeRecolorFloorPresetList(raw?.floorPresets || raw?.floors),
      ceilingPresets: normalizeRecolorCeilingPresetList(raw?.ceilingPresets || raw?.ceilings),
    };
  } catch {
    return {
      palettePresets: normalizeRecolorPalettePresetList(DEFAULT_EXHIBITION_RECOLOR_PALETTE_PRESETS),
      excludePresets: normalizeRecolorExcludePresetList(DEFAULT_EXHIBITION_RECOLOR_EXCLUDE_PRESETS),
      floorPresets: normalizeRecolorFloorPresetList(DEFAULT_EXHIBITION_RECOLOR_FLOOR_PRESETS),
      ceilingPresets: normalizeRecolorCeilingPresetList(DEFAULT_EXHIBITION_RECOLOR_CEILING_PRESETS),
    };
  }
}

function writeRecolorDb(db) {
  fs.mkdirSync(path.dirname(RECOLOR_DB_FILE), { recursive: true });
  fs.writeFileSync(
    RECOLOR_DB_FILE,
    JSON.stringify({
      palettePresets: normalizeRecolorPalettePresetList(db?.palettePresets),
      excludePresets: normalizeRecolorExcludePresetList(db?.excludePresets),
      floorPresets: normalizeRecolorFloorPresetList(db?.floorPresets),
      ceilingPresets: normalizeRecolorCeilingPresetList(db?.ceilingPresets),
    }, null, 2),
    'utf-8',
  );
}

function readUnitPanelDb() {
  try {
    if (!fs.existsSync(UNIT_PANEL_DB_FILE)) {
      return {
        materials: normalizeUnitPanelMaterialList(DEFAULT_UNIT_PANEL_MATERIALS),
      };
    }
    const raw = JSON.parse(fs.readFileSync(UNIT_PANEL_DB_FILE, 'utf-8'));
    return {
      materials: normalizeUnitPanelMaterialList(raw?.materials),
    };
  } catch {
    return {
      materials: normalizeUnitPanelMaterialList(DEFAULT_UNIT_PANEL_MATERIALS),
    };
  }
}

function writeUnitPanelDb(db) {
  fs.mkdirSync(path.dirname(UNIT_PANEL_DB_FILE), { recursive: true });
  fs.writeFileSync(
    UNIT_PANEL_DB_FILE,
    JSON.stringify({
      materials: normalizeUnitPanelMaterialList(db?.materials),
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
      viewAngles: normalizeCreativeViewAnglePresetList(db.viewAnglePresets),
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

router.put('/exhibition-creative/presets/view-angles', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护展陈创意视角预设' });
  }
  const db = readCreativeDb();
  const presets = normalizeCreativeViewAnglePresetList(req.body?.presets);
  writeCreativeDb({ ...db, viewAnglePresets: presets });
  res.json({ success: true, data: presets });
});

router.get('/exhibition-img2img/presets', (_req, res) => {
  const db = readImg2ImgDb();
  res.json({
    success: true,
    data: {
      exclusions: normalizeImg2ImgExcludePresetList(db.excludePresets),
    },
  });
});

router.put('/exhibition-img2img/presets/exclusions', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护展陈图生图排除项预设' });
  }
  const db = readImg2ImgDb();
  const presets = normalizeImg2ImgExcludePresetList(req.body?.presets);
  writeImg2ImgDb({ ...db, excludePresets: presets });
  res.json({ success: true, data: presets });
});

router.get('/exhibition-plan-layout/presets', (_req, res) => {
  const db = readPlanLayoutDb();
  res.json({
    success: true,
    data: {
      inserts: normalizePlanLayoutInsertPresetList(db.insertPresets),
      exclusions: normalizePlanLayoutExcludePresetList(db.excludePresets),
    },
  });
});

router.put('/exhibition-plan-layout/presets/inserts', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护平面自动布局植入项预设' });
  }
  const db = readPlanLayoutDb();
  const presets = normalizePlanLayoutInsertPresetList(req.body?.presets);
  writePlanLayoutDb({ ...db, insertPresets: presets });
  res.json({ success: true, data: presets });
});

router.put('/exhibition-plan-layout/presets/exclusions', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护平面自动布局排除项预设' });
  }
  const db = readPlanLayoutDb();
  const presets = normalizePlanLayoutExcludePresetList(req.body?.presets);
  writePlanLayoutDb({ ...db, excludePresets: presets });
  res.json({ success: true, data: presets });
});

router.get('/exhibition-ai-plan-layout/presets', (_req, res) => {
  const db = readAiPlanLayoutDb();
  res.json({
    success: true,
    data: {
      styles: normalizeAiPlanLayoutPresetList(db.stylePresets, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS, 'style'),
      requirements: normalizeAiPlanLayoutPresetList(db.requirementPresets, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS, 'requirement'),
    },
  });
});

router.put('/exhibition-ai-plan-layout/presets/styles', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护平面AI布局风格预设' });
  }
  const db = readAiPlanLayoutDb();
  const presets = normalizeAiPlanLayoutPresetList(req.body?.presets, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_STYLE_PRESETS, 'style');
  writeAiPlanLayoutDb({ ...db, stylePresets: presets });
  res.json({ success: true, data: presets });
});

router.put('/exhibition-ai-plan-layout/presets/requirements', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护平面AI布局特殊要求预设' });
  }
  const db = readAiPlanLayoutDb();
  const presets = normalizeAiPlanLayoutPresetList(req.body?.presets, DEFAULT_EXHIBITION_AI_PLAN_LAYOUT_REQUIREMENT_PRESETS, 'requirement');
  writeAiPlanLayoutDb({ ...db, requirementPresets: presets });
  res.json({ success: true, data: presets });
});

router.get('/exhibition-recolor/presets', (_req, res) => {
  const db = readRecolorDb();
  res.json({
    success: true,
    data: {
      palettes: normalizeRecolorPalettePresetList(db.palettePresets),
      exclusions: normalizeRecolorExcludePresetList(db.excludePresets),
      floors: normalizeRecolorFloorPresetList(db.floorPresets),
      ceilings: normalizeRecolorCeilingPresetList(db.ceilingPresets),
    },
  });
});

router.put('/exhibition-recolor/presets/palettes', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护主色调更换配色预设' });
  }
  const db = readRecolorDb();
  const presets = normalizeRecolorPalettePresetList(req.body?.presets);
  writeRecolorDb({ ...db, palettePresets: presets });
  res.json({ success: true, data: presets });
});

router.put('/exhibition-recolor/presets/exclusions', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护主色调更换保护排除项预设' });
  }
  const db = readRecolorDb();
  const presets = normalizeRecolorExcludePresetList(req.body?.presets);
  writeRecolorDb({ ...db, excludePresets: presets });
  res.json({ success: true, data: presets });
});

router.put('/exhibition-recolor/presets/floors', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护主色调更换地面预设' });
  }
  const db = readRecolorDb();
  const presets = normalizeRecolorFloorPresetList(req.body?.presets);
  writeRecolorDb({ ...db, floorPresets: presets });
  res.json({ success: true, data: presets });
});

router.put('/exhibition-recolor/presets/ceilings', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员或经理可以维护主色调更换天花板预设' });
  }
  const db = readRecolorDb();
  const presets = normalizeRecolorCeilingPresetList(req.body?.presets);
  writeRecolorDb({ ...db, ceilingPresets: presets });
  res.json({ success: true, data: presets });
});

router.get('/unit-panel/materials', (_req, res) => {
  const db = readUnitPanelDb();
  res.json({ success: true, data: normalizeUnitPanelMaterialList(db.materials) });
});

router.put('/unit-panel/materials', (req, res) => {
  const user = req.user;
  if (!isAdminRole(user?.role)) {
    return res.status(403).json({ success: false, error: '只有系统管理员可以维护单元板材质选项' });
  }
  const materials = normalizeUnitPanelMaterialList(req.body?.materials);
  writeUnitPanelDb({ materials });
  res.json({ success: true, data: materials });
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
