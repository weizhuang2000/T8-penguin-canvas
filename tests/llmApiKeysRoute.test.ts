import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function listen(app: any) {
  return new Promise<any>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('proxy llm uses selected saved LLM config', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-llm-keys-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const backupUpstreamApp = express();
  backupUpstreamApp.use(express.json({ limit: '1mb' }));
  const upstreamCalls: any[] = [];
  backupUpstreamApp.post('/v1/chat/completions', (req, res) => {
    upstreamCalls.push({ auth: req.header('authorization'), body: req.body });
    res.json({ choices: [{ message: { content: 'hello backup' } }] });
  });
  const backupUpstreamServer = await listen(backupUpstreamApp);
  t.after(() => backupUpstreamServer.close());

  const mainUpstreamApp = express();
  mainUpstreamApp.use(express.json({ limit: '1mb' }));
  mainUpstreamApp.post('/v1/chat/completions', (_req, res) => {
    res.status(500).json({ error: { message: 'wrong upstream' } });
  });
  const mainUpstreamServer = await listen(mainUpstreamApp);
  t.after(() => mainUpstreamServer.close());

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

  const settingsRouter = require('../backend/src/routes/settings.js');
  const proxyRouter = require('../backend/src/routes/proxy.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'test-admin', role: 'admin' };
    next();
  });
  app.use('/api/settings', settingsRouter);
  app.use('/api/proxy', proxyRouter);
  const server = await listen(app);
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const saved = await fetch(`${base}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmConfigs: [
        {
          id: 'main',
          label: 'Main',
          apiKey: 'sk-main-secret',
          baseUrl: `http://127.0.0.1:${mainUpstreamServer.address().port}/v1`,
          model: 'gpt-main',
          isDefault: true,
        },
        {
          id: 'backup',
          label: 'Backup',
          apiKey: 'sk-backup-secret',
          baseUrl: `http://127.0.0.1:${backupUpstreamServer.address().port}/v1`,
          model: 'gpt-backup',
        },
      ],
    }),
  }).then((res) => res.json());
  assert.equal(saved.success, true);

  const llm = await fetch(`${base}/api/proxy/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmKeyId: 'backup',
      messages: [{ role: 'user', content: 'hello' }],
    }),
  }).then((res) => res.json());

  assert.equal(llm.success, true);
  assert.equal(llm.data.content, 'hello backup');
  assert.equal(upstreamCalls[0].auth, 'Bearer sk-backup-secret');
  assert.equal(upstreamCalls[0].body.model, 'gpt-backup');
  assert.equal(JSON.stringify(llm).includes('sk-backup-secret'), false);
});
