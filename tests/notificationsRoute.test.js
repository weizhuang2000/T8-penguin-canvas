import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const data = await response.json();
  return { response, data };
}

test('notifications are admin-published and keep per-user read state', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-notifications-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const config = require('../backend/src/config.js');
  const previousFile = config.NOTIFICATIONS_FILE;
  const previousAssetDir = config.NOTIFICATIONS_ASSET_DIR;
  config.NOTIFICATIONS_FILE = path.join(tmpDir, 'notifications.json');
  config.NOTIFICATIONS_ASSET_DIR = path.join(tmpDir, 'notification-assets');
  t.after(() => {
    config.NOTIFICATIONS_FILE = previousFile;
    config.NOTIFICATIONS_ASSET_DIR = previousAssetDir;
  });

  const express = require('express');
  const notificationsRouter = require('../backend/src/routes/notifications.js');
  const legacy = notificationsRouter.normalizeDb({
    notifications: [{ id: 'legacy', title: '旧通知', content: '旧版纯文本', publishedAt: new Date().toISOString() }],
    readByUser: {},
  });
  assert.equal(legacy.notifications[0].contentBlocks[0].type, 'text');
  assert.equal(legacy.notifications[0].contentBlocks[0].text, '旧版纯文本');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    const id = String(req.headers['x-test-user'] || 'user-1');
    const role = String(req.headers['x-test-role'] || 'designer');
    req.user = { id, username: id, name: id, role };
    next();
  });
  app.use('/api/notifications', notificationsRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/notifications`;

  const denied = await requestJson(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '普通用户发布', content: '不应成功' }),
  });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.data.success, false);

  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const imageForm = new FormData();
  imageForm.append('image', new Blob([onePixelPng], { type: 'image/png' }), 'notice.png');
  const uploadedImage = await requestJson(`${base}/assets`, {
    method: 'POST',
    headers: { 'x-test-user': 'admin-1', 'x-test-role': 'admin' },
    body: imageForm,
  });
  assert.equal(uploadedImage.response.status, 201);
  assert.match(uploadedImage.data.data.url, /^\/api\/notifications\/assets\/[a-f0-9-]+\.webp$/);
  assert.equal(fs.existsSync(path.join(config.NOTIFICATIONS_ASSET_DIR, path.basename(uploadedImage.data.data.url))), true);

  const servedImage = await fetch(`http://127.0.0.1:${server.address().port}${uploadedImage.data.data.url}`, {
    headers: { 'x-test-user': 'user-1' },
  });
  assert.equal(servedImage.status, 200);
  assert.equal(servedImage.headers.get('content-type'), 'image/webp');

  const published = await requestJson(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user': 'admin-1',
      'x-test-role': 'admin',
    },
    body: JSON.stringify({
      title: '系统维护',
      contentBlocks: [
        { id: 'text-1', type: 'text', text: '今晚 22:00 进行系统维护。', fontSize: 24, color: '#DC2626' },
        { id: 'image-1', type: 'image', url: uploadedImage.data.data.url, alt: '维护说明图', width: 1, height: 1 },
      ],
    }),
  });
  assert.equal(published.response.status, 201);
  assert.equal(published.data.success, true);
  assert.equal(published.data.data.title, '系统维护');
  assert.equal(published.data.data.contentBlocks.length, 2);
  assert.equal(published.data.data.contentBlocks[0].fontSize, 24);
  assert.equal(published.data.data.contentBlocks[0].color, '#dc2626');
  assert.equal(published.data.data.contentBlocks[1].url, uploadedImage.data.data.url);
  assert.equal(published.data.data.read, true, 'publisher should not receive their own notification as unread');
  const notificationId = published.data.data.id;

  const firstUserList = await requestJson(base, { headers: { 'x-test-user': 'user-1' } });
  assert.equal(firstUserList.data.unreadCount, 1);
  assert.equal(firstUserList.data.data[0].read, false);

  const marked = await requestJson(`${base}/${notificationId}/read`, {
    method: 'POST',
    headers: { 'x-test-user': 'user-1' },
  });
  assert.equal(marked.data.success, true);
  const firstUserAfterRead = await requestJson(base, { headers: { 'x-test-user': 'user-1' } });
  assert.equal(firstUserAfterRead.data.unreadCount, 0);
  assert.equal(firstUserAfterRead.data.data[0].read, true);

  const secondUserList = await requestJson(base, { headers: { 'x-test-user': 'user-2' } });
  assert.equal(secondUserList.data.unreadCount, 1, 'one user reading must not affect another user');
  assert.equal(secondUserList.data.data[0].read, false);

  const archived = await requestJson(`${base}/${notificationId}`, {
    method: 'DELETE',
    headers: { 'x-test-user': 'manager-1', 'x-test-role': 'manager' },
  });
  assert.equal(archived.data.success, true);
  assert.equal(archived.data.data.status, 'archived');

  const regularAfterArchive = await requestJson(base, { headers: { 'x-test-user': 'user-2' } });
  assert.deepEqual(regularAfterArchive.data.data, []);
  assert.equal(regularAfterArchive.data.unreadCount, 0);

  const adminHistory = await requestJson(`${base}/admin`, {
    headers: { 'x-test-user': 'admin-1', 'x-test-role': 'admin' },
  });
  assert.equal(adminHistory.data.data.length, 1);
  assert.equal(adminHistory.data.data[0].status, 'archived');

  const saved = JSON.parse(fs.readFileSync(config.NOTIFICATIONS_FILE, 'utf8'));
  assert.equal(saved.notifications.length, 1);
  assert.equal(saved.version, 2);
  assert.equal(saved.notifications[0].contentBlocks[1].type, 'image');
  assert.deepEqual(saved.readByUser['user-1'], [notificationId]);
});

test('notification publishing validates required fields and length limits', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-notification-validation-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const config = require('../backend/src/config.js');
  const previousFile = config.NOTIFICATIONS_FILE;
  const previousAssetDir = config.NOTIFICATIONS_ASSET_DIR;
  config.NOTIFICATIONS_FILE = path.join(tmpDir, 'notifications.json');
  config.NOTIFICATIONS_ASSET_DIR = path.join(tmpDir, 'notification-assets');
  t.after(() => {
    config.NOTIFICATIONS_FILE = previousFile;
    config.NOTIFICATIONS_ASSET_DIR = previousAssetDir;
  });

  const express = require('express');
  const notificationsRouter = require('../backend/src/routes/notifications.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.user = { id: 'admin', username: 'admin', name: 'Admin', role: 'admin' };
    next();
  });
  app.use('/api/notifications', notificationsRouter);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/notifications`;

  const missing = await requestJson(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '只有标题' }),
  });
  assert.equal(missing.response.status, 400);

  const tooLong = await requestJson(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'a'.repeat(101), content: '内容' }),
  });
  assert.equal(tooLong.response.status, 400);

  const externalImage = await requestJson(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '外链图片',
      contentBlocks: [{ id: 'bad', type: 'image', url: 'https://example.com/image.png', alt: 'bad' }],
    }),
  });
  assert.equal(externalImage.response.status, 400);
  assert.equal(fs.existsSync(config.NOTIFICATIONS_FILE), false);
});
