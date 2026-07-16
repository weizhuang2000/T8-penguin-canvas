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
  config.NOTIFICATIONS_FILE = path.join(tmpDir, 'notifications.json');
  t.after(() => {
    config.NOTIFICATIONS_FILE = previousFile;
  });

  const express = require('express');
  const notificationsRouter = require('../backend/src/routes/notifications.js');
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

  const published = await requestJson(base, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user': 'admin-1',
      'x-test-role': 'admin',
    },
    body: JSON.stringify({ title: '系统维护', content: '今晚 22:00 进行系统维护。' }),
  });
  assert.equal(published.response.status, 201);
  assert.equal(published.data.success, true);
  assert.equal(published.data.data.title, '系统维护');
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
  assert.deepEqual(saved.readByUser['user-1'], [notificationId]);
});

test('notification publishing validates required fields and length limits', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-notification-validation-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const config = require('../backend/src/config.js');
  const previousFile = config.NOTIFICATIONS_FILE;
  config.NOTIFICATIONS_FILE = path.join(tmpDir, 'notifications.json');
  t.after(() => {
    config.NOTIFICATIONS_FILE = previousFile;
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
  assert.equal(fs.existsSync(config.NOTIFICATIONS_FILE), false);
});
