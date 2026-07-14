'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('../../config');
const { addHistoryItems } = require('../../utils/generationHistory');
const { stageAssets } = require('./assets');
const { normalizeProfile, parseJsonSource, validateDslSpec } = require('./schema');
const { validateTsxSource } = require('./tsxValidator');
const renderCoordinator = require('./renderCoordinator');

const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const WORKSPACE_TTL_MS = 60 * 60 * 1000;
const RENDER_TIMEOUT_MS = 30 * 60 * 1000;
const jobs = new Map();
const queue = [];
let activeJobId = '';

function appRoot() {
  if (process.env.T8PC_APP_PATH) return path.resolve(process.env.T8PC_APP_PATH);
  if (config.IS_PACKAGED && process.resourcesPath) return path.join(process.resourcesPath, 'app.asar');
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function runtimeRoot() {
  return path.join(config.DATA_DIR, 'remotion-runtime');
}

function jobsRoot() {
  return path.join(config.DATA_DIR, 'remotion-jobs');
}

function genId() {
  return `rem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function safeText(value, max = 20000) {
  return String(value || '').trim().slice(0, max);
}

function validateSource(mode, source, options = {}) {
  if (mode === 'tsx') return validateTsxSource(source);
  const parsed = parseJsonSource(source);
  if (!parsed.ok) return parsed;
  return validateDslSpec(parsed.data, options);
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    error: job.error || undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt || undefined,
    completedAt: job.completedAt || undefined,
    queuePosition: job.status === 'queued' ? Math.max(1, queue.indexOf(job.id) + 1) : 0,
    videoUrl: job.videoUrl || undefined,
    width: job.profile.width,
    height: job.profile.height,
    fps: job.profile.fps,
    duration: job.profile.duration,
    fileName: job.fileName || undefined,
    size: job.size || 0,
    runtime: job.runtime || undefined,
  };
}

function getRuntimeStatus() {
  const root = runtimeRoot();
  let executable = '';
  const names = process.platform === 'win32' ? new Set(['chrome-headless-shell.exe', 'chrome.exe']) : new Set(['chrome-headless-shell', 'chrome']);
  const walk = (dir, depth = 0) => {
    if (executable || depth > 6 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && names.has(entry.name.toLowerCase())) { executable = full; return; }
      if (entry.isDirectory()) walk(full, depth + 1);
      if (executable) return;
    }
  };
  try { walk(root); } catch (_) {}
  const active = activeJobId ? jobs.get(activeJobId) : null;
  return {
    installed: !!executable,
    executable: executable || undefined,
    cacheDir: root,
    activeJobId: activeJobId || undefined,
    phase: active?.phase || 'idle',
    progress: active?.phase === 'runtime-download' ? active.progress : undefined,
    queuedJobs: queue.length,
  };
}

function expertEntrySource() {
  return `import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {GeneratedComposition} from './GeneratedComposition';
const defaults:any={spec:'',subject:'',assets:[],profile:{width:1920,height:1080,fps:30,duration:8,durationInFrames:240}};
const Root=()=> <Composition id="T8Remotion" component={GeneratedComposition as React.FC<any>} width={1920} height={1080} fps={30} durationInFrames={240} defaultProps={defaults} calculateMetadata={({props}:any)=>({width:props.profile.width,height:props.profile.height,fps:props.profile.fps,durationInFrames:props.profile.durationInFrames,props,defaultOutName:'t8-remotion-animation'})}/>;
registerRoot(Root);
`;
}

async function prepareJob(job) {
  fs.mkdirSync(job.workDir, { recursive: true });
  const publicDir = path.join(job.workDir, 'public');
  const stagedAssets = await stageAssets(job.assets, path.join(publicDir, 'assets'));
  let entryPoint = path.join(appRoot(), 'remotion', 'index.tsx');
  if (job.mode === 'tsx') {
    fs.writeFileSync(path.join(job.workDir, 'GeneratedComposition.tsx'), job.source, 'utf8');
    entryPoint = path.join(job.workDir, 'index.tsx');
    fs.writeFileSync(entryPoint, expertEntrySource(), 'utf8');
  }
  const outputName = `remotion_${Date.now()}_${job.id.slice(-8)}.mp4`;
  const outputLocation = path.join(config.OUTPUT_DIR, outputName);
  fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });
  const inputProps = {
    spec: job.mode === 'json' ? job.parsedSpec : job.source,
    subject: job.subject,
    assets: stagedAssets,
    profile: job.profile,
  };
  const request = {
    operation: 'media',
    entryPoint,
    publicDir,
    outputLocation,
    inputProps,
    browserCacheDir: runtimeRoot(),
    nodeModulesDir: path.join(appRoot(), 'node_modules'),
    proKitPath: path.join(appRoot(), 'remotion', 'ProKit.tsx'),
    concurrency: 2,
  };
  const requestFile = path.join(job.workDir, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify(request), 'utf8');
  return { requestFile, outputLocation, outputName };
}

function terminateTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    try { spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }); } catch (_) {}
  }
  try { child.kill('SIGTERM'); } catch (_) {}
}

function scheduleCleanup(job) {
  setTimeout(() => {
    try { fs.rmSync(job.workDir, { recursive: true, force: true }); } catch (_) {}
  }, WORKSPACE_TTL_MS).unref?.();
  setTimeout(() => jobs.delete(job.id), JOB_TTL_MS).unref?.();
}

function updateFromWorker(job, message) {
  job.updatedAt = Date.now();
  if (message.phase) job.phase = message.phase;
  if (Number.isFinite(Number(message.progress))) job.progress = Math.max(job.progress, Math.min(100, Number(message.progress)));
  if (message.type === 'runtime-ready') job.runtime = { status: message.status, path: message.path };
  if (message.type === 'complete') {
    job.workerCompleted = true;
    job.outputLocation = message.outputLocation;
    job.size = Number(message.size) || 0;
  }
  if (message.type === 'error') job.workerError = safeText(message.error, 2000) || 'Remotion 渲染失败';
}

async function runJob(job) {
  activeJobId = job.id;
  job.status = 'running';
  job.phase = 'preparing';
  job.progress = 1;
  job.startedAt = Date.now();
  job.updatedAt = Date.now();
  let prepared;
  try {
    prepared = await prepareJob(job);
  } catch (error) {
    job.status = 'error';
    job.phase = 'error';
    job.error = error.message || String(error);
    job.updatedAt = Date.now();
    activeJobId = '';
    scheduleCleanup(job);
    return drainQueue();
  }

  let releaseRender;
  try {
    job.phase = 'waiting-renderer';
    releaseRender = await renderCoordinator.acquire(`media:${job.id}`, job.abortController.signal);
    if (job.status === 'cancelled') {
      releaseRender();
      activeJobId = '';
      scheduleCleanup(job);
      return drainQueue();
    }
  } catch (error) {
    job.status = job.status === 'cancelled' || error?.name === 'AbortError' ? 'cancelled' : 'error';
    job.phase = job.status;
    job.error = job.status === 'error' ? (error.message || String(error)) : '';
    job.updatedAt = Date.now();
    activeJobId = '';
    scheduleCleanup(job);
    return drainQueue();
  }

  const worker = path.join(appRoot(), 'electron', 'remotion-worker.cjs');
  const env = { ...process.env };
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  const child = spawn(process.execPath, [worker, prepared.requestFile], {
    cwd: appRoot(),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  job.child = child;
  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => {
    job.workerError = 'Remotion 渲染超过 30 分钟，已终止';
    terminateTree(child);
  }, RENDER_TIMEOUT_MS);
  timeout.unref?.();

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
    let index;
    while ((index = stdout.indexOf('\n')) >= 0) {
      const line = stdout.slice(0, index).trim();
      stdout = stdout.slice(index + 1);
      if (!line) continue;
      try { updateFromWorker(job, JSON.parse(line)); } catch (_) {}
    }
  });
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-8000); });
  child.on('error', (error) => { job.workerError = error.message || String(error); });
  child.on('close', () => {
    clearTimeout(timeout);
    releaseRender?.();
    job.child = null;
    job.updatedAt = Date.now();
    job.completedAt = Date.now();
    if (job.status === 'cancelled') {
      job.phase = 'cancelled';
    } else if (job.workerCompleted && prepared.outputLocation && fs.existsSync(prepared.outputLocation)) {
      job.status = 'success';
      job.phase = 'success';
      job.progress = 100;
      job.fileName = prepared.outputName;
      job.videoUrl = `/files/output/${encodeURIComponent(prepared.outputName)}`;
      job.size = fs.statSync(prepared.outputLocation).size;
      try {
        addHistoryItems([{ url: job.videoUrl, kind: 'video', title: job.historyContext.outputTitle || 'Remotion 动画' }], {
          ...job.historyContext,
          prompt: job.subject,
          provider: 'Remotion',
          model: job.mode === 'tsx' ? 'expert-tsx' : 't8-remotion/v1',
          width: job.profile.width,
          height: job.profile.height,
          taskId: job.id,
        }, job.user);
      } catch (error) {
        console.warn('[remotion] generation history failed:', error.message || error);
      }
    } else {
      job.status = 'error';
      job.phase = 'error';
      job.error = job.workerError || stderr.trim().slice(-2000) || 'Remotion 渲染进程异常退出';
    }
    activeJobId = '';
    scheduleCleanup(job);
    drainQueue();
  });
}

function drainQueue() {
  if (activeJobId) return;
  while (queue.length) {
    const id = queue.shift();
    const job = jobs.get(id);
    if (!job || job.status !== 'queued') continue;
    void runJob(job);
    return;
  }
}

function createJob(body, user) {
  const mode = body?.mode === 'tsx' ? 'tsx' : 'json';
  const source = safeText(body?.source, 100000);
  const assets = Array.isArray(body?.assets) ? body.assets.slice(0, 33) : [];
  const profile = normalizeProfile(body?.profile);
  const validation = validateSource(mode, source, { assets, profile });
  if (!validation.ok) {
    const error = new Error('Remotion 描述校验失败');
    error.code = 'validation_failed';
    error.errors = validation.errors;
    throw error;
  }
  const id = genId();
  const now = Date.now();
  const job = {
    id,
    mode,
    source: validation.source || source,
    parsedSpec: validation.data,
    subject: safeText(body?.subject, 20000),
    assets,
    profile,
    historyContext: body?.historyContext && typeof body.historyContext === 'object' ? body.historyContext : {},
    user: user ? { id: user.id, username: user.username, name: user.name, role: user.role } : null,
    userId: String(user?.id || ''),
    status: 'queued',
    phase: 'queued',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    workDir: path.join(jobsRoot(), id),
    abortController: new AbortController(),
  };
  jobs.set(id, job);
  queue.push(id);
  drainQueue();
  return publicJob(job);
}

function getJob(id) {
  return jobs.get(String(id || '')) || null;
}

function canAccess(job, user) {
  if (!job || !user) return false;
  return String(job.userId) === String(user.id) || ['admin', 'superadmin'].includes(String(user.role || '').toLowerCase());
}

function cancelJob(job) {
  if (!job || ['success', 'error', 'cancelled'].includes(job.status)) return publicJob(job);
  job.status = 'cancelled';
  job.phase = 'cancelled';
  job.updatedAt = Date.now();
  const index = queue.indexOf(job.id);
  if (index >= 0) queue.splice(index, 1);
  job.abortController?.abort();
  if (job.child) terminateTree(job.child);
  if (activeJobId !== job.id) scheduleCleanup(job);
  return publicJob(job);
}

module.exports = {
  canAccess,
  cancelJob,
  createJob,
  getJob,
  getRuntimeStatus,
  publicJob,
  validateSource,
};
