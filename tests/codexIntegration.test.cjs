'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('codex bridge signs T8 identity without exposing credentials', () => {
  process.env.T8_CODEX_BRIDGE_SECRET = 'test-secret';
  const route = require('../backend/src/routes/codex');
  const identity = route.bridgeIdentity({ id: 42, username: 'alice', email: 'alice@example.com', name: 'Alice', role: 'designer' });
  assert.ok(identity.encoded);
  assert.match(identity.signature, /^[a-f0-9]{64}$/);
  const payload = JSON.parse(Buffer.from(identity.encoded, 'base64url').toString('utf8'));
  assert.deepEqual(payload, { id: '42', username: 'alice', email: 'alice@example.com', name: 'Alice', role: 'designer', issuedAt: payload.issuedAt, expiresAt: payload.expiresAt });
  assert.doesNotMatch(identity.encoded, /apiKey|baseUrl|password/i);
});

test('codex shared model pool routes every model through its administrator config', () => {
  const route = require('../backend/src/routes/codex');
  const config = route.buildSharedLlmConfig([
    {
      id: 'other',
      apiKey: 'other-key',
      baseUrl: 'https://other.example.com',
      model: 'other-model',
      availableModels: ['shared-model', 'other-extra'],
    },
    {
      id: 'default',
      apiKey: 'default-key',
      baseUrl: 'https://default.example.com',
      model: 'default-model',
      availableModels: ['default-extra', 'shared-model'],
      isDefault: true,
    },
  ]);

  assert.equal(config.apiKey, 'default-key');
  assert.equal(config.baseUrl, 'https://default.example.com');
  assert.equal(config.model, 'default-model');
  assert.deepEqual(config.availableModels, [
    'default-model',
    'default-extra',
    'shared-model',
    'other-model',
    'other-extra',
  ]);
  assert.equal(config.configsByModel.get('default-extra').apiKey, 'default-key');
  assert.equal(config.configsByModel.get('shared-model').apiKey, 'default-key');
  assert.equal(config.configsByModel.get('other-model').apiKey, 'other-key');
  assert.equal(config.configsByModel.get('other-extra').baseUrl, 'https://other.example.com');
});

test('codex shared model pool excludes incomplete administrator configs', () => {
  const route = require('../backend/src/routes/codex');
  const config = route.buildSharedLlmConfig([
    {
      id: 'default',
      apiKey: 'default-key',
      baseUrl: 'https://default.example.com',
      model: 'default-model',
      isDefault: true,
    },
    {
      id: 'incomplete',
      apiKey: '',
      baseUrl: 'https://other.example.com',
      model: 'unusable-model',
    },
  ]);

  assert.deepEqual(config.availableModels, ['default-model']);
  assert.equal(config.configsByModel.has('unusable-model'), false);
});

test('codex route exposes only authenticated shared-model endpoints', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../backend/src/routes/codex.js'), 'utf8');
  assert.match(source, /router\.get\('\/models', requireCodexAuth/);
  assert.match(source, /router\.get\('\/v1\/models', requireCodexAuth/);
  assert.match(source, /router\.post\('\/v1\/chat\/completions', requireCodexAuth/);
  assert.match(source, /config\.configsByModel\.get\(model\)/);
  assert.match(source, /chatCompletionsUrl\(modelConfig\.baseUrl\)/);
  assert.match(source, /Authorization: `Bearer \$\{modelConfig\.apiKey\}`/);
  assert.match(source, /req\.once\('aborted', \(\) => controller\.abort\(\)\)/);
  assert.doesNotMatch(source, /req\.once\('close', \(\) => controller\.abort\(\)\)/);
  assert.match(source, /router\.use\(requireCodexAuth\)/);
});

test('codex workspace mount authenticates with the T8 cookie before proxying', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../backend/src/server.js'), 'utf8');
  assert.match(source, /app\.use\('\/codex', requireCookieAuth, \(req, res\) => codexRouter\.proxyToLibreChat\(req, res\)\)/);
  assert.doesNotMatch(source, /app\.use\('\/codex', codexRouter\)/);
});

test('librechat compose initializes persistent storage permissions before startup', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../integrations/librechat/docker-compose.t8.yml'), 'utf8');
  assert.match(source, /librechat-storage-init:/);
  assert.match(source, /chown -R 1000:1000 \/app\/uploads \/app\/data \/app\/api\/logs \/app\/client\/public\/images/);
  assert.match(source, /\.\/storage\/images:\/app\/client\/public\/images/);
  assert.match(source, /condition: service_completed_successfully/);
});

test('librechat header links back to the infinite canvas', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../integrations/librechat/upstream/client/src/components/Chat/Header.tsx'), 'utf8');
  assert.match(source, /function ReturnToCanvas\(\)/);
  assert.match(source, /href="\/"/);
  assert.match(source, /aria-label="返回无限画布"/);
  assert.match(source, /className="hidden md:inline">无限画布<\/span>/);
  assert.match(source, /<ReturnToCanvas \/>/);
});
