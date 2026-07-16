'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { requireAdmin } = require('../auth/middleware');

const router = express.Router();
const MAX_NOTIFICATIONS = 200;
const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 5000;

function emptyDb() {
  return { version: 1, notifications: [], readByUser: {} };
}

function normalizeNotification(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const title = String(value.title || '').trim().slice(0, MAX_TITLE_LENGTH);
  const content = String(value.content || '').trim().slice(0, MAX_CONTENT_LENGTH);
  if (!id || !title || !content) return null;
  return {
    id,
    title,
    content,
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
  return { version: 1, notifications, readByUser };
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

router.post('/', requireAdmin, (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!title || !content) {
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
