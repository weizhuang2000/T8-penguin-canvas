import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('proxy llm normalizes image message parts for local refs', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-llm-vision-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const config = require('../backend/src/config.js');
  const oldConfig = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    INPUT_DIR: config.INPUT_DIR,
    DEFAULT_LOCAL_SAVE_DIR: config.DEFAULT_LOCAL_SAVE_DIR,
    DEFAULT_CANVAS_AUTO_SAVE_DIR: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    DEFAULT_THEME_TEMPLATE_DIR: config.DEFAULT_THEME_TEMPLATE_DIR,
  };
  t.after(() => Object.assign(config, oldConfig));
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.INPUT_DIR = path.join(tmpDir, 'input');
  config.DEFAULT_LOCAL_SAVE_DIR = path.join(tmpDir, 'save');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = path.join(tmpDir, 'canvas');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = path.join(tmpDir, 'resources');
  config.DEFAULT_THEME_TEMPLATE_DIR = path.join(tmpDir, 'themes');
  fs.mkdirSync(config.INPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(config.INPUT_DIR, 'tiny.png'), Buffer.from('iVBORw0KGgo=', 'base64'));

  const upstreamApp = express();
  upstreamApp.use(express.json({ limit: '4mb' }));
  const upstreamCalls = [];
  upstreamApp.post('/v1/chat/completions', (req, res) => {
    upstreamCalls.push(req.body);
    res.json({ choices: [{ message: { content: '红色陶器' } }] });
  });
  const upstreamServer = await listen(upstreamApp);
  t.after(() => upstreamServer.close());

  const settingsRouter = require('../backend/src/routes/settings.js');
  const proxyRouter = require('../backend/src/routes/proxy.js');
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use((req, _res, next) => {
    req.user = { id: 'test-admin', role: 'admin' };
    next();
  });
  app.use('/api/settings', settingsRouter);
  app.use('/api/proxy', proxyRouter);
  const server = await listen(app);
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmConfigs: [{
        id: 'vision',
        label: 'Vision',
        apiKey: 'sk-vision-secret',
        baseUrl: `http://127.0.0.1:${upstreamServer.address().port}/v1`,
        model: 'vision-test',
        isDefault: true,
      }],
    }),
  });

  const llm = await fetch(`${base}/api/proxy/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmKeyId: 'vision',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '识别展品' },
          { type: 'image', image_url: { url: '/files/input/tiny.png' } },
        ],
      }],
    }),
  }).then((res) => res.json());

  assert.equal(llm.success, true);
  assert.equal(llm.data.content, '红色陶器');
  assert.equal(upstreamCalls[0].messages[0].content[1].type, 'image');
  assert.match(upstreamCalls[0].messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal(JSON.stringify(llm).includes('sk-vision-secret'), false);
});

test('proxy llm translates no available accounts errors', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-llm-accounts-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const config = require('../backend/src/config.js');
  const oldConfig = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_LOCAL_SAVE_DIR: config.DEFAULT_LOCAL_SAVE_DIR,
    DEFAULT_CANVAS_AUTO_SAVE_DIR: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    DEFAULT_THEME_TEMPLATE_DIR: config.DEFAULT_THEME_TEMPLATE_DIR,
  };
  t.after(() => Object.assign(config, oldConfig));
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.DEFAULT_LOCAL_SAVE_DIR = path.join(tmpDir, 'save');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = path.join(tmpDir, 'canvas');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = path.join(tmpDir, 'resources');
  config.DEFAULT_THEME_TEMPLATE_DIR = path.join(tmpDir, 'themes');

  const upstreamApp = express();
  upstreamApp.use(express.json({ limit: '1mb' }));
  upstreamApp.post('/v1/chat/completions', (_req, res) => {
    res.status(429).json({ error: { message: 'No available accounts: no available accounts' } });
  });
  const upstreamServer = await listen(upstreamApp);
  t.after(() => upstreamServer.close());

  const settingsRouter = require('../backend/src/routes/settings.js');
  const proxyRouter = require('../backend/src/routes/proxy.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.user = { id: 'test-admin', role: 'admin' };
    next();
  });
  app.use('/api/settings', settingsRouter);
  app.use('/api/proxy', proxyRouter);
  const server = await listen(app);
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmConfigs: [{
        id: 'busy',
        label: 'Busy',
        apiKey: 'sk-busy-secret',
        baseUrl: `http://127.0.0.1:${upstreamServer.address().port}/v1`,
        model: 'vision-busy',
        isDefault: true,
      }],
    }),
  });

  const llm = await fetch(`${base}/api/proxy/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmKeyId: 'busy',
      messages: [{ role: 'user', content: 'hello' }],
    }),
  }).then((res) => res.json());

  assert.equal(llm.success, false);
  assert.match(llm.error, /当前 LLM 上游没有可用账号/);
  assert.equal(JSON.stringify(llm).includes('sk-busy-secret'), false);
});
