import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const config = require('../backend/src/config.js');
const monitoring = require('../backend/src/utils/monitoringMetrics.js');
const { requireAdminOnly } = require('../backend/src/auth/middleware.js');

function withTempData(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-monitoring-'));
  const previous = {
    DATA_DIR: config.DATA_DIR,
    MONITORING_METRICS_FILE: config.MONITORING_METRICS_FILE,
  };
  config.DATA_DIR = path.join(root, 'data');
  config.MONITORING_METRICS_FILE = path.join(config.DATA_DIR, 'monitoring_metrics.json');
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  monitoring.resetForTests();
  try {
    return fn(root);
  } finally {
    Object.assign(config, previous);
    monitoring.resetForTests();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function rangeAround(ms, extra = {}) {
  return {
    from: new Date(ms - 2 * 60 * 60 * 1000).toISOString(),
    to: new Date(ms + 2 * 60 * 60 * 1000).toISOString(),
    now: ms,
    granularity: 'hour',
    ...extra,
  };
}

test('effective heartbeat credits bounded consecutive server time and splits hours', () => withTempData(() => {
  const user = { id: 'u1', username: 'alice', name: 'Alice', role: 'designer' };
  const base = Date.parse('2026-07-22T10:59:50.000Z');
  assert.equal(monitoring.recordHeartbeat(user, { now: base }).creditedSeconds, 0);
  assert.equal(monitoring.recordHeartbeat(user, { now: base + 30_000 }).creditedSeconds, 30);
  assert.equal(monitoring.recordHeartbeat(user, { now: base + 30_000 }).creditedSeconds, 0);
  assert.equal(monitoring.recordHeartbeat(user, { now: base + 120_000 }).creditedSeconds, 0);

  const summary = monitoring.querySummary({
    ...rangeAround(base + 30_000),
    now: base + 300_000,
  });
  assert.equal(summary.totals.activeSeconds, 30);
  assert.equal(summary.trend.length, 2);
  assert.deepEqual(summary.trend.map((item) => item.activeSeconds), [10, 20]);
  assert.equal(summary.totals.currentOnline, 0);
}));

test('generation lifecycle is idempotent and success rate excludes local outcomes', () => withTempData(() => {
  const now = Date.parse('2026-07-22T12:00:00.000Z');
  const user = { id: 'u1', name: 'Alice', role: 'designer' };
  monitoring.startRun({ runId: 'run-success', user, provider: 'fal', model: 'gpt-image-2', now });
  monitoring.startRun({ runId: 'run-success', user, provider: 'fal', model: 'gpt-image-2', now });
  monitoring.finishRun('run-success', { outcome: 'success', outputCount: 3, now: now + 1000 });
  monitoring.finishRun('run-success', { outcome: 'success', outputCount: 3, now: now + 2000 });
  monitoring.startRun({ runId: 'run-failed', user, provider: 'fal', model: 'gpt-image-2', now });
  monitoring.finishRun('run-failed', { outcome: 'upstream_failure', now: now + 3000 });
  monitoring.startRun({ runId: 'run-timeout', user, provider: 'fal', model: 'gpt-image-2', now });
  monitoring.finishRun('run-timeout', { outcome: 'excluded', now: now + 4000 });

  const summary = monitoring.querySummary(rangeAround(now));
  assert.equal(summary.totals.calls, 3);
  assert.equal(summary.totals.successes, 1);
  assert.equal(summary.totals.upstreamFailures, 1);
  assert.equal(summary.totals.excluded, 1);
  assert.equal(summary.totals.outputs, 3);
  assert.equal(summary.totals.successRate, 0.5);
  assert.equal(summary.users[0].models.length, 1);
}));

test('history backfill adds image outputs once without inventing calls', () => withTempData(() => {
  const createdAt = Date.parse('2026-07-20T08:00:00.000Z');
  fs.writeFileSync(path.join(config.DATA_DIR, 'generation_history.json'), JSON.stringify({
    items: [
      { id: 'a', kind: 'image', createdAt, createdByUserId: 'u1', createdByUserName: 'Alice', provider: 'zhenzhen', model: 'nano-banana' },
      { id: 'b', kind: 'image', createdAt, provider: '', model: '' },
      { id: 'c', kind: 'video', createdAt, createdByUserId: 'u1' },
    ],
  }), 'utf8');

  let summary = monitoring.querySummary(rangeAround(createdAt));
  assert.equal(summary.totals.outputs, 2);
  assert.equal(summary.totals.legacyOutputs, 2);
  assert.equal(summary.totals.calls, 0);
  assert.equal(summary.totals.successRate, null);

  monitoring.resetForTests();
  summary = monitoring.querySummary(rangeAround(createdAt));
  assert.equal(summary.totals.outputs, 2);
  assert.equal(summary.meta.historyBackfilledItems, 2);
}));

test('monitoring dashboard permission is admin-only', () => {
  const invoke = (role) => {
    let status = 200;
    let payload = null;
    let nextCalled = false;
    requireAdminOnly(
      { user: { role } },
      { status(code) { status = code; return this; }, json(value) { payload = value; return value; } },
      () => { nextCalled = true; },
    );
    return { status, payload, nextCalled };
  };
  assert.equal(invoke('admin').nextCalled, true);
  assert.equal(invoke('manager').status, 403);
  assert.equal(invoke('designer').status, 403);
});
