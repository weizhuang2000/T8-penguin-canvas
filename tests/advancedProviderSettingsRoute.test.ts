import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('settings route persists advancedProviders with masking and secret preservation', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-advanced-settings-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const config = require('../backend/src/config.js');
  const oldConfig = {
    SETTINGS_FILE: config.SETTINGS_FILE,
    DEFAULT_LOCAL_SAVE_DIR: config.DEFAULT_LOCAL_SAVE_DIR,
    DEFAULT_CANVAS_AUTO_SAVE_DIR: config.DEFAULT_CANVAS_AUTO_SAVE_DIR,
    DEFAULT_RESOURCE_LIBRARY_DIR: config.DEFAULT_RESOURCE_LIBRARY_DIR,
    DEFAULT_THEME_TEMPLATE_DIR: config.DEFAULT_THEME_TEMPLATE_DIR,
  };
  t.after(() => {
    Object.assign(config, oldConfig);
  });
  config.SETTINGS_FILE = path.join(tmpDir, 'settings.json');
  config.DEFAULT_LOCAL_SAVE_DIR = path.join(tmpDir, 'save');
  config.DEFAULT_CANVAS_AUTO_SAVE_DIR = path.join(tmpDir, 'canvas');
  config.DEFAULT_RESOURCE_LIBRARY_DIR = path.join(tmpDir, 'resources');
  config.DEFAULT_THEME_TEMPLATE_DIR = path.join(tmpDir, 'themes');

  const express = require('express');
  const settingsRouter = require('../backend/src/routes/settings.js');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: 'test-admin', role: 'admin' };
    next();
  });
  app.use('/api/settings', settingsRouter);
  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => {
    server.close();
  });

  const base = `http://127.0.0.1:${server.address().port}/api/settings`;

  const initial = await fetch(base).then((res) => res.json());
  assert.equal(initial.success, true);
  assert.equal(initial.data.enableZhenzhenFallback, true);
  assert.equal(initial.data.llmBaseUrl, 'https://ai.t8star.org');
  assert.equal(initial.data.llmModel, 'gemini-3.1-flash-lite-preview');
  assert.ok(Array.isArray(initial.data.advancedProviders));
  assert.equal(initial.data.advancedProviderSummary.enabledCount, 0);
  assert.equal(initial.data.advancedProviders.find((p: any) => p.id === 'modelscope')?.apiKey, '');

  const save = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      advancedProviders: [
        {
          id: 'modelscope',
          protocol: 'modelscope',
          enabled: true,
          apiKey: 'ms-secret-123456',
          imageModels: ['MusePublic/489_ckpt_FLUX_1'],
        },
        {
          id: 'bad url',
          protocol: 'modelscope',
          baseUrl: 'ftp://not-allowed',
          apiKey: 'drop-me',
        },
      ],
    }),
  }).then((res) => res.json());
  assert.equal(save.success, true);

  const disableFallback = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enableZhenzhenFallback: false }),
  }).then((res) => res.json());
  assert.equal(disableFallback.success, true);

  const saveLlmBaseUrl = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmConfigs: [
        {
          id: 'default',
          label: '主 LLM',
          apiKey: 'sk-main-secret',
          baseUrl: 'https://llm.example.com/openai/v1/',
          model: 'custom-chat-model',
          isDefault: true,
        },
        {
          id: 'backup',
          label: '备用 LLM',
          apiKey: 'sk-backup-secret',
          baseUrl: 'https://backup.example.com/v1',
          model: 'backup-chat-model',
        },
      ],
    }),
  }).then((res) => res.json());
  assert.equal(saveLlmBaseUrl.success, true);

  const masked = await fetch(base).then((res) => res.json());
  assert.equal(masked.data.enableZhenzhenFallback, false);
  assert.equal(masked.data.llmBaseUrl, 'https://llm.example.com/openai/v1');
  assert.equal(masked.data.llmModel, 'custom-chat-model');
  assert.equal(masked.data.llmApiKey, '****cret');
  assert.equal(masked.data.llmConfigs[0].baseUrl, 'https://llm.example.com/openai/v1');
  assert.equal(masked.data.llmConfigs[0].model, 'custom-chat-model');
  assert.equal(masked.data.llmApiKeys[0].apiKey, '****cret');
  assert.equal(masked.data.llmApiKeys[0].hasApiKey, true);
  assert.equal(masked.data.llmApiKeys[1].apiKey, '****cret');
  const modelscope = masked.data.advancedProviders.find((p: any) => p.id === 'modelscope');
  assert.equal(modelscope.apiKey, '****3456');
  assert.equal(modelscope.hasApiKey, true);
  assert.equal(masked.data.advancedProviderSummary.enabledCount, 1);
  assert.equal(masked.data.advancedProviderSummary.configuredKeyCount, 1);
  assert.equal(masked.data.advancedProviders.some((p: any) => p.id === 'bad url'), false);
  assert.equal(JSON.stringify(masked.data).includes('ms-secret-123456'), false);

  const raw = await fetch(`${base}/raw`).then((res) => res.json());
  assert.equal(raw.data.enableZhenzhenFallback, false);
  assert.equal(raw.data.llmBaseUrl, 'https://llm.example.com/openai/v1');
  assert.equal(raw.data.llmModel, 'custom-chat-model');
  assert.equal(raw.data.llmApiKey, 'sk-main-secret');
  assert.equal(raw.data.llmConfigs.find((item: any) => item.id === 'backup').apiKey, 'sk-backup-secret');
  assert.equal(raw.data.llmConfigs.find((item: any) => item.id === 'backup').baseUrl, 'https://backup.example.com/v1');
  assert.equal(raw.data.llmConfigs.find((item: any) => item.id === 'backup').model, 'backup-chat-model');
  assert.equal(raw.data.advancedProviders.find((p: any) => p.id === 'modelscope').apiKey, 'ms-secret-123456');

  const preserveLlmKeys = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llmConfigs: [
        {
          id: 'default',
          label: '主 LLM 改名',
          apiKey: '****cret',
          baseUrl: 'https://llm.example.com/openai/v1',
          model: 'custom-chat-model',
          isDefault: false,
        },
        {
          id: 'backup',
          label: '备用 LLM',
          apiKey: '',
          baseUrl: 'https://backup.example.com/v1',
          model: 'backup-chat-model',
          isDefault: true,
        },
      ],
    }),
  }).then((res) => res.json());
  assert.equal(preserveLlmKeys.success, true);
  const preservedLlmRaw = await fetch(`${base}/raw`).then((res) => res.json());
  assert.equal(preservedLlmRaw.data.llmApiKeys.find((item: any) => item.id === 'default').apiKey, 'sk-main-secret');
  assert.equal(preservedLlmRaw.data.llmApiKey, 'sk-backup-secret');
  assert.equal(preservedLlmRaw.data.llmBaseUrl, 'https://backup.example.com/v1');
  assert.equal(preservedLlmRaw.data.llmModel, 'backup-chat-model');

  const preserve = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      advancedProviders: [
        { id: 'modelscope', protocol: 'modelscope', enabled: true, apiKey: '****3456' },
      ],
    }),
  }).then((res) => res.json());
  assert.equal(preserve.success, true);

  const preservedRaw = await fetch(`${base}/raw`).then((res) => res.json());
  assert.equal(preservedRaw.data.advancedProviders.find((p: any) => p.id === 'modelscope').apiKey, 'ms-secret-123456');

  const invalidBaseUrlResponse = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ llmBaseUrl: 'ftp://llm.example.com' }),
  });
  assert.equal(invalidBaseUrlResponse.status, 400);
  const afterInvalid = await fetch(`${base}/raw`).then((res) => res.json());
  assert.equal(afterInvalid.data.llmBaseUrl, 'https://backup.example.com/v1');
  assert.equal(afterInvalid.data.llmModel, 'backup-chat-model');

  const invalidModelResponse = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ llmModel: 'bad\nmodel' }),
  });
  assert.equal(invalidModelResponse.status, 400);
  const afterInvalidModel = await fetch(`${base}/raw`).then((res) => res.json());
  assert.equal(afterInvalidModel.data.llmModel, 'backup-chat-model');
});
