'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { requireAdmin } = require('../auth/middleware');

const router = express.Router();
const MAX_NOTIFICATIONS = 200;
const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 5000;
const MAX_CONTENT_BLOCKS = 50;
const MAX_CONTENT_IMAGES = 12;
const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024;
const NOTIFICATION_ASSET_RE = /^\/api\/notifications\/assets\/([a-f0-9-]+\.webp)$/i;
const ASSET_FILE_RE = /^[a-f0-9-]+\.webp$/i;
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_IMAGE_FILE_SIZE },
}).single('image');

function emptyDb() {
  return { version: 2, notifications: [], readByUser: {} };
}

function normalizeContentBlocks(value, legacyContent = '') {
  const source = Array.isArray(value) ? value : [];
  const blocks = [];
  let textLength = 0;
  let imageCount = 0;
  for (const raw of source.slice(0, MAX_CONTENT_BLOCKS)) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.type === 'text') {
      const remaining = MAX_CONTENT_LENGTH - textLength;
      if (remaining <= 0) continue;
      const text = String(raw.text || '').trim().slice(0, remaining);
      if (!text) continue;
      textLength += text.length;
      const parsedSize = Math.round(Number(raw.fontSize) || 14);
      const color = String(raw.color || '').trim();
      blocks.push({
        id: String(raw.id || crypto.randomUUID()).slice(0, 100),
        type: 'text',
        text,
        fontSize: Math.max(12, Math.min(40, parsedSize)),
        color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '',
      });
      continue;
    }
    if (raw.type === 'image' && imageCount < MAX_CONTENT_IMAGES) {
      const url = String(raw.url || '').trim();
      if (!NOTIFICATION_ASSET_RE.test(url)) continue;
      imageCount += 1;
      blocks.push({
        id: String(raw.id || crypto.randomUUID()).slice(0, 100),
        type: 'image',
        url,
        alt: String(raw.alt || '通知图片').trim().slice(0, 200) || '通知图片',
        width: Math.max(0, Math.round(Number(raw.width) || 0)),
        height: Math.max(0, Math.round(Number(raw.height) || 0)),
      });
    }
  }
  if (blocks.length === 0) {
    const text = String(legacyContent || '').trim().slice(0, MAX_CONTENT_LENGTH);
    if (text) {
      blocks.push({
        id: crypto.randomUUID(),
        type: 'text',
        text,
        fontSize: 14,
        color: '',
      });
    }
  }
  return blocks;
}

function normalizeNotification(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const title = String(value.title || '').trim().slice(0, MAX_TITLE_LENGTH);
  const contentBlocks = normalizeContentBlocks(value.contentBlocks, value.content);
  if (!id || !title || contentBlocks.length === 0) return null;
  const content = contentBlocks
    .map((block) => block.type === 'text' ? block.text : '[图片]')
    .join('\n')
    .slice(0, MAX_CONTENT_LENGTH);
  return {
    id,
    title,
    content,
    contentBlocks,
    publishedAt: String(value.publishedAt || new Date().toISOString()),
    publishedBy: {
      id: String(value.publishedBy?.id || ''),
      name: String(value.publishedBy?.name || value.publishedBy?.username || '系统管理员').slice(0, 100),
    },
    status: value.status === 'archived' ? 'archived' : 'active',
  };
}

function normalizeDb(value) {
  const source = value && typeof value === 'object' ? value : {};
  const notifications = (Array.isArray(source.notifications) ? source.notifications : [])
    .map(normalizeNotification)
    .filter(Boolean)
    .slice(0, MAX_NOTIFICATIONS);
  const validIds = new Set(notifications.map((item) => item.id));
  const readByUser = {};
  if (source.readByUser && typeof source.readByUser === 'object' && !Array.isArray(source.readByUser)) {
    for (const [userId, ids] of Object.entries(source.readByUser)) {
      const normalizedUserId = String(userId || '').trim();
      if (!normalizedUserId || !Array.isArray(ids)) continue;
      readByUser[normalizedUserId] = Array.from(new Set(ids.map(String).filter((id) => validIds.has(id))));
    }
  }
  return { version: 2, notifications, readByUser };
}

function readDb() {
  try {
    if (!fs.existsSync(config.NOTIFICATIONS_FILE)) return emptyDb();
    return normalizeDb(JSON.parse(fs.readFileSync(config.NOTIFICATIONS_FILE, 'utf8')));
  } catch (error) {
    console.warn('[notifications] 读取通知数据失败，将使用空数据:', error?.message || error);
    return emptyDb();
  }
}

function writeDb(value) {
  const db = normalizeDb(value);
  const file = config.NOTIFICATIONS_FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return db;
}

function userIdOf(req) {
  return String(req.user?.id || '').trim();
}

function publicItems(db, userId, includeArchived = false) {
  const readIds = new Set(db.readByUser[userId] || []);
  return db.notifications
    .filter((item) => includeArchived || item.status === 'active')
    .map((item) => ({ ...item, read: readIds.has(item.id) }));
}

router.get('/', (req, res) => {
  try {
    const data = publicItems(readDb(), userIdOf(req));
    res.json({ success: true, data, unreadCount: data.filter((item) => !item.read).length });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || '读取通知失败' });
  }
});

router.get('/admin', requireAdmin, (req, res) => {
  try {
    res.json({ success: true, data: publicItems(readDb(), userIdOf(req), true) });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || '读取通知失败' });
  }
});

router.get('/assets/:filename', (req, res) => {
  const filename = String(req.params.filename || '');
  if (!ASSET_FILE_RE.test(filename)) {
    return res.status(400).json({ success: false, error: '无效的通知图片路径' });
  }
  const file = path.resolve(config.NOTIFICATIONS_ASSET_DIR, filename);
  const root = path.resolve(config.NOTIFICATIONS_ASSET_DIR);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
    return res.status(404).json({ success: false, error: '通知图片不存在' });
  }
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(file);
});

router.post('/assets', requireAdmin, (req, res) => {
  uploadImage(req, res, async (uploadError) => {
    if (uploadError) {
      const tooLarge = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        error: tooLarge ? '通知图片不能超过 20MB' : (uploadError.message || '上传通知图片失败'),
      });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: '请选择要上传的图片' });
    }
    try {
      const metadata = await sharp(req.file.buffer, { limitInputPixels: 80_000_000 }).metadata();
      if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff'].includes(metadata.format || '')) {
        return res.status(400).json({ success: false, error: '不支持的图片格式' });
      }
      fs.mkdirSync(config.NOTIFICATIONS_ASSET_DIR, { recursive: true });
      const filename = `${crypto.randomUUID()}.webp`;
      const target = path.join(config.NOTIFICATIONS_ASSET_DIR, filename);
      const output = await sharp(req.file.buffer, { limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toFile(target);
      return res.status(201).json({
        success: true,
        data: {
          url: `/api/notifications/assets/${filename}`,
          width: output.width,
          height: output.height,
          size: output.size,
        },
      });
    } catch (error) {
      return res.status(400).json({ success: false, error: error?.message || '无法处理该图片' });
    }
  });
});

router.post('/', requireAdmin, (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const contentBlocks = normalizeContentBlocks(req.body?.contentBlocks, content);
    if (!title || contentBlocks.length === 0) {
      return res.status(400).json({ success: false, error: '通知标题和内容不能为空' });
    }
    if (title.length > MAX_TITLE_LENGTH || content.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `标题不能超过 ${MAX_TITLE_LENGTH} 字，内容不能超过 ${MAX_CONTENT_LENGTH} 字`,
      });
    }
    const db = readDb();
    const notification = normalizeNotification({
      id: crypto.randomUUID(),
      title,
      content,
      contentBlocks,
      publishedAt: new Date().toISOString(),
      publishedBy: {
        id: userIdOf(req),
        name: req.user?.name || req.user?.username || '系统管理员',
      },
      status: 'active',
    });
    db.notifications.unshift(notification);
    db.readByUser[userIdOf(req)] = Array.from(new Set([
      ...(db.readByUser[userIdOf(req)] || []),
      notification.id,
    ]));
    const saved = writeDb(db);
    const data = publicItems(saved, userIdOf(req), true).find((item) => item.id === notification.id);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || '发布通知失败' });
  }
});

router.post('/read-all', (req, res) => {
  try {
    const db = readDb();
    const userId = userIdOf(req);
    db.readByUser[userId] = db.notifications
      .filter((item) => item.status === 'active')
      .map((item) => item.id);
    writeDb(db);
    res.json({ success: true, data: { unreadCount: 0 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || '更新通知状态失败' });
  }
});

router.post('/:id/read', (req, res) => {
  try {
    const db = readDb();
    const notification = db.notifications.find((item) => item.id === req.params.id && item.status === 'active');
    if (!notification) return res.status(404).json({ success: false, error: '通知不存在' });
    const userId = userIdOf(req);
    db.readByUser[userId] = Array.from(new Set([...(db.readByUser[userId] || []), notification.id]));
    writeDb(db);
    return res.json({ success: true, data: { id: notification.id, read: true } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || '更新通知状态失败' });
  }
});

router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const db = readDb();
    const notification = db.notifications.find((item) => item.id === req.params.id);
    if (!notification) return res.status(404).json({ success: false, error: '通知不存在' });
    notification.status = 'archived';
    writeDb(db);
    return res.json({ success: true, data: { ...notification, read: false } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || '撤回通知失败' });
  }
});

router.readDb = readDb;
router.writeDb = writeDb;
router.normalizeDb = normalizeDb;

module.exports = router;
