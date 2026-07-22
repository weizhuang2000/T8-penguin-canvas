import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('image generation channels are connected to monitoring lifecycle', () => {
  const proxy = read('backend/src/routes/proxy.js');
  const external = read('backend/src/routes/externalProviders.js');
  const fhl = read('backend/src/routes/fhlImage.js');
  const grok = read('backend/src/routes/grokOAuth.js');

  for (const provider of ['zhenzhen', 'fal', 'mj', 'runninghub']) {
    assert.match(proxy, new RegExp(`startImageRun\\(req, \\{ provider: '${provider}'`));
  }
  assert.match(proxy, /finishImageRun\(req, 'upstream_failure'/);
  assert.match(proxy, /correlateImageRun\(req, `zhenzhen:\$\{norm\.taskId\}`\)/);
  assert.match(external, /startExternalImageRun/);
  assert.match(external, /finishRun\(req\.monitoringRunId/);
  assert.match(fhl, /provider: 'FHL Images'/);
  assert.match(fhl, /finishRun\(job\.monitoringRunId/);
  assert.match(grok, /provider: 'Grok OAuth'/);
  assert.match(grok, /outcome: 'success'/);
});

test('dashboard entry, heartbeat, and admin-only API are wired', () => {
  const app = read('src/App.tsx');
  const api = read('src/services/api.ts');
  const admin = read('backend/src/routes/admin.js');
  assert.match(app, /const canViewMonitoring = authUser\?\.role === 'admin'/);
  assert.match(app, /Date\.now\(\) - lastInteractionAt <= 5 \* 60 \* 1000/);
  assert.match(app, /window\.setInterval\(\(\) => heartbeat\(\), 30_000\)/);
  assert.match(api, /\/monitoring\/heartbeat/);
  assert.match(api, /\/admin\/monitoring/);
  assert.match(admin, /router\.get\('\/monitoring', requireAdminOnly/);
});
