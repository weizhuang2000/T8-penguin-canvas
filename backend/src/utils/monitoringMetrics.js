'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const SCHEMA = 't8-monitoring-metrics';
const VERSION = 1;
const UNKNOWN_USER_ID = '__unknown__';
const HEARTBEAT_ONLINE_MS = 75 * 1000;
const HEARTBEAT_MAX_CREDIT_MS = 45 * 1000;
const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PENDING_RUN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let cachedFile = '';
let cachedDb = null;

function metricsFile() {
  return config.MONITORING_METRICS_FILE || path.join(config.DATA_DIR, 'monitoring_metrics.json');
}

function nowIso(ms = Date.now()) {
  return new Date(ms).toISOString();
}

function safeText(value, fallback = '', max = 240) {
  return String(value ?? fallback).trim().slice(0, max);
}

function safeUser(user) {
  const id = safeText(user?.id, UNKNOWN_USER_ID, 96) || UNKNOWN_USER_ID;
  return {
    id,
    username: safeText(user?.username, '', 120),
    name: safeText(user?.name || user?.realName || user?.username, id === UNKNOWN_USER_ID ? '未归属历史' : id, 160),
    role: safeText(user?.role, '', 64),
  };
}

function hourKey(ms) {
  const date = new Date(Number(ms) || Date.now());
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function modelKey(provider, model) {
  return `${safeText(provider, 'unknown', 160) || 'unknown'}\u0000${safeText(model, 'unknown', 240) || 'unknown'}`;
}

function emptyCounters() {
  return {
    calls: 0,
    successes: 0,
    upstreamFailures: 0,
    excluded: 0,
    cancelled: 0,
    outputs: 0,
    legacyOutputs: 0,
  };
}

function emptyDb(now = Date.now()) {
  return {
    schema: SCHEMA,
    version: VERSION,
    trackedFrom: nowIso(now),
    updatedAt: nowIso(now),
    historyBackfill: { completedAt: '', itemCount: 0 },
    buckets: {},
    runs: {},
    correlations: {},
    heartbeats: {},
  };
}

function normalizeCounters(raw) {
  const out = emptyCounters();
  for (const key of Object.keys(out)) out[key] = Math.max(0, Number(raw?.[key]) || 0);
  return out;
}

function normalizeDb(raw, now = Date.now()) {
  const db = emptyDb(now);
  if (!raw || raw.schema !== SCHEMA) return db;
  db.trackedFrom = safeText(raw.trackedFrom, db.trackedFrom, 64) || db.trackedFrom;
  db.updatedAt = safeText(raw.updatedAt, db.updatedAt, 64) || db.updatedAt;
  db.historyBackfill = {
    completedAt: safeText(raw.historyBackfill?.completedAt, '', 64),
    itemCount: Math.max(0, Number(raw.historyBackfill?.itemCount) || 0),
  };
  db.runs = raw.runs && typeof raw.runs === 'object' ? raw.runs : {};
  db.correlations = raw.correlations && typeof raw.correlations === 'object' ? raw.correlations : {};
  db.heartbeats = raw.heartbeats && typeof raw.heartbeats === 'object' ? raw.heartbeats : {};
  for (const [bucketKey, rawBucket] of Object.entries(raw.buckets || {})) {
    if (!Number.isFinite(Date.parse(bucketKey))) continue;
    const bucket = { users: {} };
    for (const [userId, rawUser] of Object.entries(rawBucket?.users || {})) {
      const user = safeUser({ ...rawUser?.user, id: userId });
      const entry = {
        user,
        activeSeconds: Math.max(0, Number(rawUser?.activeSeconds) || 0),
        lastActiveAt: Math.max(0, Number(rawUser?.lastActiveAt) || 0),
        models: {},
      };
      for (const [key, rawModel] of Object.entries(rawUser?.models || {})) {
        entry.models[key] = {
          provider: safeText(rawModel?.provider, 'unknown', 160) || 'unknown',
          model: safeText(rawModel?.model, 'unknown', 240) || 'unknown',
          nodeType: safeText(rawModel?.nodeType, '', 160),
          ...normalizeCounters(rawModel),
        };
      }
      bucket.users[user.id] = entry;
    }
    db.buckets[bucketKey] = bucket;
  }
  return db;
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.warn('[monitoring] read metrics failed:', error?.message || error);
    return null;
  }
}

function writeDb(db) {
  const file = metricsFile();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db.updatedAt = nowIso();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function generationHistoryFile() {
  return path.join(config.DATA_DIR, 'generation_history.json');
}

function ensureBucketUser(db, at, user) {
  const key = hourKey(at);
  if (!db.buckets[key]) db.buckets[key] = { users: {} };
  const normalized = safeUser(user);
  if (!db.buckets[key].users[normalized.id]) {
    db.buckets[key].users[normalized.id] = {
      user: normalized,
      activeSeconds: 0,
      lastActiveAt: 0,
      models: {},
    };
  } else {
    db.buckets[key].users[normalized.id].user = {
      ...db.buckets[key].users[normalized.id].user,
      ...Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== '')),
    };
  }
  return db.buckets[key].users[normalized.id];
}

function ensureModel(entry, provider, model, nodeType = '') {
  const key = modelKey(provider, model);
  if (!entry.models[key]) {
    entry.models[key] = {
      provider: safeText(provider, 'unknown', 160) || 'unknown',
      model: safeText(model, 'unknown', 240) || 'unknown',
      nodeType: safeText(nodeType, '', 160),
      ...emptyCounters(),
    };
  } else if (nodeType && !entry.models[key].nodeType) {
    entry.models[key].nodeType = safeText(nodeType, '', 160);
  }
  return entry.models[key];
}

function backfillHistory(db, now = Date.now()) {
  if (db.historyBackfill.completedAt) return false;
  const raw = readJson(generationHistoryFile());
  let count = 0;
  for (const item of Array.isArray(raw?.items) ? raw.items : []) {
    if (String(item?.kind || '').toLowerCase() !== 'image') continue;
    const createdAt = Number(item.createdAt) || now;
    const user = safeUser({
      id: item.createdByUserId || UNKNOWN_USER_ID,
      name: item.createdByUserName,
      role: item.createdByUserRole,
    });
    const provider = safeText(item.provider, 'unknown', 160) || 'unknown';
    const model = safeText(item.model, 'unknown', 240) || 'unknown';
    const metrics = ensureModel(ensureBucketUser(db, createdAt, user), provider, model, item.sourceNodeType);
    metrics.outputs += 1;
    metrics.legacyOutputs += 1;
    count += 1;
  }
  db.historyBackfill = { completedAt: nowIso(now), itemCount: count };
  return true;
}

function ensureLoaded(now = Date.now()) {
  const file = metricsFile();
  if (cachedDb && cachedFile === file) return cachedDb;
  cachedFile = file;
  cachedDb = normalizeDb(readJson(file), now);
  const changed = backfillHistory(cachedDb, now);
  if (!fs.existsSync(file) || changed) writeDb(cachedDb);
  return cachedDb;
}

function addActiveInterval(db, user, startAt, endAt) {
  let cursor = startAt;
  while (cursor < endAt) {
    const nextHour = Date.parse(hourKey(cursor)) + 60 * 60 * 1000;
    const segmentEnd = Math.min(endAt, nextHour);
    const entry = ensureBucketUser(db, cursor, user);
    entry.activeSeconds += Math.max(0, segmentEnd - cursor) / 1000;
    entry.lastActiveAt = Math.max(entry.lastActiveAt, endAt);
    cursor = segmentEnd;
  }
}

function recordHeartbeat(user, options = {}) {
  const at = Number(options.now) || Date.now();
  const db = ensureLoaded(at);
  const normalized = safeUser(user);
  const previous = db.heartbeats[normalized.id];
  let creditedMs = 0;
  if (previous && at > Number(previous.lastAt)) {
    const gap = at - Number(previous.lastAt);
    if (gap <= HEARTBEAT_ONLINE_MS) {
      creditedMs = Math.min(gap, HEARTBEAT_MAX_CREDIT_MS);
      addActiveInterval(db, normalized, at - creditedMs, at);
    }
  }
  db.heartbeats[normalized.id] = { user: normalized, lastAt: at };
  const current = ensureBucketUser(db, at, normalized);
  current.lastActiveAt = Math.max(current.lastActiveAt, at);
  writeDb(db);
  return { creditedSeconds: creditedMs / 1000, lastActiveAt: at };
}

function normalizeRunId(value) {
  return safeText(value, '', 160).replace(/[^a-zA-Z0-9_.:-]/g, '');
}

function createRunId(prefix = 'image') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function pruneRuns(db, now = Date.now()) {
  for (const [runId, run] of Object.entries(db.runs)) {
    const terminalAt = Number(run.terminalAt) || 0;
    if (!terminalAt && now - Number(run.startedAt || now) > PENDING_RUN_TTL_MS) {
      finishRun(runId, { outcome: 'excluded', now, persist: false, db });
    }
    const updatedTerminalAt = Number(db.runs[runId]?.terminalAt) || 0;
    if (updatedTerminalAt && now - updatedTerminalAt > RUN_RETENTION_MS) delete db.runs[runId];
  }
  for (const [key, runId] of Object.entries(db.correlations)) {
    if (!db.runs[runId]) delete db.correlations[key];
  }
}

function startRun(input = {}) {
  const at = Number(input.startedAt || input.now) || Date.now();
  const db = input.db || ensureLoaded(at);
  pruneRuns(db, at);
  const runId = normalizeRunId(input.runId) || createRunId();
  if (db.runs[runId]) return { runId, created: false, run: db.runs[runId] };
  const user = safeUser(input.user);
  const provider = safeText(input.provider, 'unknown', 160) || 'unknown';
  const model = safeText(input.model, 'unknown', 240) || 'unknown';
  const nodeType = safeText(input.nodeType, '', 160);
  const metrics = ensureModel(ensureBucketUser(db, at, user), provider, model, nodeType);
  metrics.calls += 1;
  db.runs[runId] = {
    id: runId,
    user,
    provider,
    model,
    nodeType,
    bucket: hourKey(at),
    startedAt: at,
    terminalAt: 0,
    outcome: 'pending',
    outputCount: 0,
  };
  if (input.correlationKey) correlateRun(runId, input.correlationKey, { db, persist: false });
  if (input.persist !== false) writeDb(db);
  return { runId, created: true, run: db.runs[runId] };
}

function correlateRun(runId, correlationKey, options = {}) {
  const db = options.db || ensureLoaded();
  const id = normalizeRunId(runId);
  const key = safeText(correlationKey, '', 300);
  if (!id || !key || !db.runs[id]) return false;
  db.correlations[key] = id;
  if (options.persist !== false) writeDb(db);
  return true;
}

function findRunId(correlationKey) {
  const db = ensureLoaded();
  return db.correlations[safeText(correlationKey, '', 300)] || '';
}

function finishRun(runIdOrCorrelation, input = {}) {
  const at = Number(input.now) || Date.now();
  const db = input.db || ensureLoaded(at);
  const direct = normalizeRunId(runIdOrCorrelation);
  const runId = db.runs[direct] ? direct : db.correlations[safeText(runIdOrCorrelation, '', 300)];
  const run = runId ? db.runs[runId] : null;
  if (!run || run.terminalAt) return { updated: false, run: run || null };
  const outcome = ['success', 'upstream_failure', 'cancelled'].includes(input.outcome) ? input.outcome : 'excluded';
  const outputCount = outcome === 'success' ? Math.max(1, Math.floor(Number(input.outputCount) || 0)) : 0;
  const bucket = db.buckets[run.bucket];
  const entry = bucket?.users?.[run.user.id];
  const metrics = entry ? ensureModel(entry, run.provider, run.model, run.nodeType) : null;
  if (metrics) {
    if (outcome === 'success') {
      metrics.successes += 1;
      metrics.outputs += outputCount;
    } else if (outcome === 'upstream_failure') metrics.upstreamFailures += 1;
    else if (outcome === 'cancelled') {
      metrics.cancelled += 1;
      metrics.excluded += 1;
    } else metrics.excluded += 1;
  }
  Object.assign(run, { outcome, outputCount, terminalAt: at });
  if (input.correlationKey) correlateRun(runId, input.correlationKey, { db, persist: false });
  if (input.persist !== false) writeDb(db);
  return { updated: true, run };
}

function addCounters(target, source) {
  for (const key of Object.keys(emptyCounters())) target[key] += Number(source?.[key]) || 0;
  return target;
}

function successRate(counters) {
  const denominator = counters.successes + counters.upstreamFailures;
  return denominator > 0 ? counters.successes / denominator : null;
}

function periodKey(ms, granularity, timezoneOffsetMinutes) {
  const shift = -Number(timezoneOffsetMinutes || 0) * 60 * 1000;
  const shifted = new Date(ms + shift);
  if (granularity === 'day') shifted.setUTCHours(0, 0, 0, 0);
  else shifted.setUTCMinutes(0, 0, 0);
  return nowIso(shifted.getTime() - shift);
}

function parseRange(params = {}, now = Date.now()) {
  const fallbackFrom = now - 7 * 24 * 60 * 60 * 1000;
  let from = Date.parse(params.from);
  let to = Date.parse(params.to);
  if (!Number.isFinite(from)) from = fallbackFrom;
  if (!Number.isFinite(to)) to = now;
  if (to <= from) to = from + 24 * 60 * 60 * 1000;
  return { from, to };
}

function querySummary(params = {}, seedUsers = []) {
  const now = Number(params.now) || Date.now();
  const db = ensureLoaded(now);
  const { from, to } = parseRange(params, now);
  const duration = to - from;
  const granularity = params.granularity === 'hour' || params.granularity === 'day'
    ? params.granularity
    : duration <= 2 * 24 * 60 * 60 * 1000 ? 'hour' : 'day';
  const timezoneOffset = Number(params.timezoneOffset) || 0;
  const wantedUser = safeText(params.userId, '', 96);
  const wantedProvider = safeText(params.provider, '', 160);
  const wantedModel = safeText(params.model, '', 240);
  const users = new Map();
  const models = new Map();
  const trend = new Map();

  const ensureUserSummary = (user) => {
    const normalized = safeUser(user);
    if (!users.has(normalized.id)) users.set(normalized.id, {
      user: normalized,
      activeSeconds: 0,
      lastActiveAt: 0,
      online: false,
      ...emptyCounters(),
      models: new Map(),
    });
    return users.get(normalized.id);
  };

  for (const user of seedUsers || []) {
    const normalized = safeUser(user);
    if (!wantedUser || normalized.id === wantedUser) ensureUserSummary(normalized);
  }

  for (const [bucketIso, bucket] of Object.entries(db.buckets)) {
    const bucketAt = Date.parse(bucketIso);
    if (bucketAt < from || bucketAt >= to) continue;
    const period = periodKey(bucketAt, granularity, timezoneOffset);
    if (!trend.has(period)) trend.set(period, { start: period, activeSeconds: 0, imageOutputs: 0, calls: 0, successes: 0, upstreamFailures: 0, excluded: 0 });
    const trendEntry = trend.get(period);
    for (const entry of Object.values(bucket.users || {})) {
      if (wantedUser && entry.user.id !== wantedUser) continue;
      const userSummary = ensureUserSummary(entry.user);
      userSummary.activeSeconds += Number(entry.activeSeconds) || 0;
      userSummary.lastActiveAt = Math.max(userSummary.lastActiveAt, Number(entry.lastActiveAt) || 0);
      trendEntry.activeSeconds += Number(entry.activeSeconds) || 0;
      for (const metric of Object.values(entry.models || {})) {
        if (wantedProvider && metric.provider !== wantedProvider) continue;
        if (wantedModel && metric.model !== wantedModel) continue;
        const key = modelKey(metric.provider, metric.model);
        if (!userSummary.models.has(key)) userSummary.models.set(key, { provider: metric.provider, model: metric.model, nodeType: metric.nodeType, ...emptyCounters() });
        if (!models.has(key)) models.set(key, { provider: metric.provider, model: metric.model, nodeType: metric.nodeType, ...emptyCounters() });
        addCounters(userSummary, metric);
        addCounters(userSummary.models.get(key), metric);
        addCounters(models.get(key), metric);
        trendEntry.imageOutputs += metric.outputs;
        trendEntry.calls += metric.calls;
        trendEntry.successes += metric.successes;
        trendEntry.upstreamFailures += metric.upstreamFailures;
        trendEntry.excluded += metric.excluded;
      }
    }
  }

  const onlineUsers = [];
  for (const heartbeat of Object.values(db.heartbeats || {})) {
    if (now - Number(heartbeat.lastAt) > HEARTBEAT_ONLINE_MS) continue;
    if (wantedUser && heartbeat.user?.id !== wantedUser) continue;
    const userSummary = ensureUserSummary(heartbeat.user);
    userSummary.online = true;
    userSummary.lastActiveAt = Math.max(userSummary.lastActiveAt, Number(heartbeat.lastAt) || 0);
    onlineUsers.push({ ...safeUser(heartbeat.user), lastActiveAt: Number(heartbeat.lastAt) || 0 });
  }

  const userRows = Array.from(users.values()).map((entry) => ({
    ...entry,
    successRate: successRate(entry),
    models: Array.from(entry.models.values())
      .map((metric) => ({ ...metric, successRate: successRate(metric) }))
      .sort((a, b) => b.calls - a.calls || b.outputs - a.outputs),
  })).sort((a, b) => Number(b.online) - Number(a.online) || b.activeSeconds - a.activeSeconds || b.outputs - a.outputs);

  const modelRows = Array.from(models.values())
    .map((metric) => ({ ...metric, successRate: successRate(metric) }))
    .sort((a, b) => b.calls - a.calls || b.outputs - a.outputs);
  const totals = { activeSeconds: 0, currentOnline: onlineUsers.length, ...emptyCounters() };
  for (const user of userRows) {
    totals.activeSeconds += user.activeSeconds;
    addCounters(totals, user);
  }
  totals.successRate = successRate(totals);

  return {
    meta: {
      from: nowIso(from),
      to: nowIso(to),
      granularity,
      trackedFrom: db.trackedFrom,
      historyBackfilledAt: db.historyBackfill.completedAt || null,
      historyBackfilledItems: db.historyBackfill.itemCount,
      updatedAt: db.updatedAt,
    },
    totals,
    onlineUsers: onlineUsers.sort((a, b) => b.lastActiveAt - a.lastActiveAt),
    trend: Array.from(trend.values()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    users: userRows,
    models: modelRows,
    filters: {
      providers: Array.from(new Set(Array.from(models.values()).map((item) => item.provider))).sort(),
      models: Array.from(new Set(Array.from(models.values()).map((item) => item.model))).sort(),
    },
  };
}

function resetForTests() {
  cachedFile = '';
  cachedDb = null;
}

module.exports = {
  HEARTBEAT_MAX_CREDIT_MS,
  HEARTBEAT_ONLINE_MS,
  UNKNOWN_USER_ID,
  correlateRun,
  createRunId,
  ensureLoaded,
  findRunId,
  finishRun,
  querySummary,
  recordHeartbeat,
  resetForTests,
  startRun,
};
