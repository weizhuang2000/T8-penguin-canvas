'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {spawn} = require('child_process');
const config = require('../../config');
const {generateConfiguredLlm, loadRawSettings} = require('../../providers/llmClient');
const {stageAssets} = require('./assets');
const {extractCaptionTracks} = require('./captions');
const {probeStagedAssets} = require('./mediaProbe');
const renderCoordinator = require('./renderCoordinator');
const {normalizeProfile} = require('./schema');
const {validateSource} = require('./jobManager');
const {buildSkillContext, normalizeGenerationInput} = require('./skillPack');

const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const WORKSPACE_TTL_MS = 60 * 60 * 1000;
const WORKER_TIMEOUT_MS = 12 * 60 * 1000;
const REVIEW_FRAMES = [0.05, 0.2, 0.4, 0.6, 0.8, 0.95];
const jobs = new Map();
const queue = [];
let activeJobId = '';
let generateLlmImpl = generateConfiguredLlm;
let loadSettingsImpl = loadRawSettings;
let renderStillsImpl;

const JSON_GUIDE = `只返回严格 JSON，不要 Markdown 代码块。版本必须是 t8-remotion/v1。assets 只能声明给定素材 ID；scenes 包含 id/start/duration/background/transition/layers；图层仅限 text/image/video/audio/shape。所有场景和图层不能超过总时长。动画仅限 none/fade/slide-left/slide-right/slide-up/slide-down/scale/typewriter。`;
const TSX_GUIDE = `只返回单个 TSX 模块，不要 Markdown 代码块或解释。必须命名导出 export const GeneratedComposition: React.FC<any> = ({assets, profile, subject}) => {...}。可导入 react、remotion、@remotion/media、@remotion/transitions 白名单子路径和 @t8/remotion-kit。素材必须通过 assets.find(a=>a.id==='asset-1') 获取，并用 staticFile('assets/'+asset.src) 转为地址。数值动画使用 interpolate()；任何 #hex/rgb/hsl/oklch 颜色动画必须从 remotion 导入并使用 interpolateColors()，禁止把颜色传给 interpolate()。`;

function appRoot() {
  if (process.env.T8PC_APP_PATH) return path.resolve(process.env.T8PC_APP_PATH);
  if (config.IS_PACKAGED && process.resourcesPath) return path.join(process.resourcesPath, 'app.asar');
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function runtimeRoot() {
  return path.join(config.DATA_DIR, 'remotion-runtime');
}

function generationRoot() {
  return path.join(config.DATA_DIR, 'remotion-generation-jobs');
}

function safeText(value, max = 20_000) {
  return String(value || '').trim().slice(0, max);
}

function stripFence(value) {
  return String(value || '').trim().replace(/^```(?:json|tsx|typescript|ts|jsx)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function jsonFromText(value) {
  const clean = stripFence(value);
  try { return JSON.parse(clean); } catch (_) {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

function genId() {
  return `remgen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function expertEntrySource() {
  return `import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {GeneratedComposition} from './GeneratedComposition';
const defaults:any={spec:'',subject:'',assets:[],profile:{width:1920,height:1080,fps:30,duration:8,durationInFrames:240}};
const Root=()=> <Composition id="T8Remotion" component={GeneratedComposition as React.FC<any>} width={1920} height={1080} fps={30} durationInFrames={240} defaultProps={defaults} calculateMetadata={({props}:any)=>({width:props.profile.width,height:props.profile.height,fps:props.profile.fps,durationInFrames:props.profile.durationInFrames,props})}/>;
registerRoot(Root);
`;
}

function terminateTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    try { spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {windowsHide: true, stdio: 'ignore'}); } catch (_) {}
  }
  try { child.kill('SIGTERM'); } catch (_) {}
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    error: job.error || undefined,
    queuePosition: job.status === 'queued' ? Math.max(1, queue.indexOf(job.id) + 1) : 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || undefined,
    mode: job.input.mode,
    quality: job.input.quality,
    source: job.status === 'success' ? job.source : undefined,
    plan: job.planSummary || undefined,
    reviews: job.reviews,
    warnings: job.warnings,
    skillVersion: job.skill?.version,
    skillRules: job.skill?.ruleIds || [],
    skillSource: job.skill?.source,
    skillRuleDetails: job.skill?.details || [],
  };
}

function update(job, phase, progress) {
  job.phase = phase;
  job.progress = Math.max(job.progress, Math.min(99, Number(progress) || 0));
  job.updatedAt = Date.now();
}

function scheduleCleanup(job) {
  setTimeout(() => {
    try { fs.rmSync(job.workDir, {recursive: true, force: true}); } catch (_) {}
  }, WORKSPACE_TTL_MS).unref?.();
  setTimeout(() => jobs.delete(job.id), JOB_TTL_MS).unref?.();
}

function materialManifest(job) {
  const prepared = new Map((job.prepared?.stagedAssets || []).map((asset) => [asset.id, asset]));
  return job.input.assets.map((asset) => {
    const staged = prepared.get(asset.id);
    return {id: asset.id, kind: asset.kind, label: asset.label || asset.id, ...(staged?.metadata ? {metadata: staged.metadata} : {})};
  });
}

function userContent(job, prompt) {
  const content = [{type: 'text', text: prompt}];
  const prepared = new Map((job.prepared?.llmAssets || []).map((asset) => [asset.id, asset]));
  for (const asset of job.input.assets.filter((item) => item.kind === 'image').slice(0, 12)) {
    content.push({type: 'image_url', image_url: {url: prepared.get(asset.id)?.url || asset.url}});
  }
  for (const asset of job.input.assets.filter((item) => item.kind === 'video').slice(0, 4)) {
    content.push({type: 'video_url', video_url: {url: prepared.get(asset.id)?.url || asset.url}});
  }
  return content;
}

function skillFor(job, phase) {
  if (!job.skillContexts[phase]) job.skillContexts[phase] = buildSkillContext({...job.input, profile: job.profile}, phase);
  return job.skillContexts[phase];
}

function commonContext(job, phase) {
  const textContext = job.input.texts.map((item) => `${item.label || item.id || '上游文本'}：\n${item.text}`).join('\n\n');
  const captions = job.prepared?.captionTracks || [];
  const captionContext = captions.length ? `\n\n已解析字幕轨：\n${JSON.stringify(captions, null, 2)}` : '';
  return `主题/文案：\n${job.input.subject || '(依据上游素材创作)'}\n\n上游文本：\n${textContext || '(无)'}\n\n输出配置：${job.profile.ratio}，${job.profile.width}x${job.profile.height}，${job.profile.fps}fps，总时长 ${job.profile.duration} 秒。\n\n素材清单：\n${JSON.stringify(materialManifest(job), null, 2)}${captionContext}\n\n${skillFor(job, phase).text}`;
}

async function callLlm(job, phase, options) {
  update(job, phase, options.progress);
  return generateLlmImpl({
    settings: job.settings,
    llmKeyId: options.llmKeyId || job.input.llmKeyId,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    llmVideoMode: 'frames',
    videoFrameCount: 8,
    signal: job.abortController.signal,
  });
}

async function generatePlan(job) {
  const prompt = `${commonContext(job, 'plan')}\n\n先规划一份专业动画创意方案。只返回 JSON，字段包含 concept、style、palette、typography、scenes（每项含 start、duration、purpose、visual、motion、copy）、assetUsage、audioPlan、qualityChecklist。方案必须覆盖完整时长，控制文字密度，明确每段视觉焦点。`;
  const response = await callLlm(job, 'planning', {
    progress: 8,
    temperature: 0.65,
    maxTokens: 6000,
    messages: [
      {role: 'system', content: '你是资深动态视觉导演。先做可执行的镜头与排版方案，不输出代码。'},
      {role: 'user', content: userContent(job, prompt)},
    ],
  });
  const parsed = jsonFromText(response.content);
  job.plan = parsed || {concept: safeText(response.content, 12_000)};
  job.planSummary = safeText(parsed?.concept || parsed?.style || response.content, 4000);
}

async function generateSource(job) {
  const guide = job.input.mode === 'tsx' ? TSX_GUIDE : JSON_GUIDE;
  const plan = job.plan ? `\n\n已批准的创意方案：\n${JSON.stringify(job.plan, null, 2)}` : '';
  const prompt = `${commonContext(job, 'code')}${plan}\n\n${guide}\n请直接生成可渲染的完整${job.input.mode === 'tsx' ? ' TSX' : ' JSON DSL'}。专业结果必须有明确视觉层级、至少三种协调的帧动画、完整素材编排和可截图的关键画面。`;
  const response = await callLlm(job, 'generating-code', {
    progress: job.input.quality === 'professional' ? 20 : 12,
    temperature: job.input.quality === 'professional' ? 0.25 : 0.3,
    maxTokens: job.input.mode === 'tsx' ? 32_000 : 16_000,
    messages: [
      {role: 'system', content: '你是 Remotion 动画工程师和动态视觉设计师。严格遵守规则与输出契约，只返回完整目标源码。'},
      {role: 'user', content: userContent(job, prompt)},
    ],
  });
  return stripFence(response.content);
}

async function repairSource(job, source, errors, progress) {
  const response = await callLlm(job, 'repairing-code', {
    progress,
    temperature: 0.1,
    maxTokens: job.input.mode === 'tsx' ? 32_000 : 16_000,
    messages: [
      {role: 'system', content: '修复 Remotion 源码。只返回修复后的完整源码，不要解释、不要 Markdown。'},
      {role: 'user', content: `${skillFor(job, 'repair').text}\n\n模式：${job.input.mode}\n错误：\n${errors.join('\n')}\n\n待修复源码：\n${source}`},
    ],
  });
  return stripFence(response.content);
}

async function ensureValidSource(job, source, progress) {
  let result = validateSource(job.input.mode, source, {assets: job.input.assets, profile: job.profile});
  if (result.ok) {
    job.warnings.push(...(result.normalizations || []).filter((message) => !job.warnings.includes(message)));
    return result.source || source;
  }
  const repaired = await repairSource(job, source, result.errors || ['未知校验错误'], progress);
  result = validateSource(job.input.mode, repaired, {assets: job.input.assets, profile: job.profile});
  if (!result.ok) {
    const error = new Error('Remotion 源码修复后仍未通过校验');
    error.validationErrors = result.errors || [];
    throw error;
  }
  job.warnings.push(...(result.normalizations || []).filter((message) => !job.warnings.includes(message)));
  return result.source || repaired;
}

async function prepareWorkspace(job) {
  fs.mkdirSync(job.workDir, {recursive: true});
  const publicDir = path.join(job.workDir, 'public');
  const assetsDir = path.join(publicDir, 'assets');
  const staged = await stageAssets(job.input.assets, assetsDir);
  const detectSilence = /静音|去停顿|remove silence|silence/i.test(`${job.input.subject}\n${job.input.texts.map((item) => item.text).join('\n')}`);
  const stagedAssets = await probeStagedAssets(staged, assetsDir, {detectSilence, signal: job.abortController.signal});
  const llmAssets = stagedAssets.map((asset) => ({id: asset.id, url: path.join(assetsDir, asset.src)}));
  const captionTracks = extractCaptionTracks(job.input.texts);
  job.prepared = {publicDir, assetsDir, stagedAssets, llmAssets, captionTracks};
}

function parseWorkerLine(job, line, state, progressBase, progressSpan) {
  let message;
  try { message = JSON.parse(line); } catch (_) { return; }
  if (message.type === 'complete') state.complete = message;
  if (message.type === 'error') state.error = safeText(message.error, 3000);
  if (Number.isFinite(Number(message.progress))) {
    update(job, message.phase || job.phase, Math.round(progressBase + (Number(message.progress) / 100) * progressSpan));
  }
}

async function renderStills(job, source, round) {
  update(job, round ? `rendering-review-${round}` : 'compiling', round ? 42 + (round - 1) * 22 : 35);
  const generated = path.join(job.workDir, 'GeneratedComposition.tsx');
  const entryPoint = path.join(job.workDir, 'index.tsx');
  fs.writeFileSync(generated, source, 'utf8');
  fs.writeFileSync(entryPoint, expertEntrySource(), 'utf8');
  const outputDir = path.join(job.workDir, `review-${round || 0}`);
  const frames = REVIEW_FRAMES.map((ratio) => Math.min(job.profile.durationInFrames - 1, Math.max(0, Math.round((job.profile.durationInFrames - 1) * ratio))));
  const requestFile = path.join(job.workDir, `stills-request-${round || 0}.json`);
  fs.writeFileSync(requestFile, JSON.stringify({
    operation: 'stills',
    entryPoint,
    publicDir: job.prepared.publicDir,
    outputDir,
    frames,
    scale: 0.25,
    inputProps: {spec: source, subject: job.input.subject, assets: job.prepared.stagedAssets, profile: job.profile},
    browserCacheDir: runtimeRoot(),
    nodeModulesDir: path.join(appRoot(), 'node_modules'),
    proKitPath: path.join(appRoot(), 'remotion', 'ProKit.tsx'),
  }), 'utf8');

  const release = await renderCoordinator.acquire(`stills:${job.id}:${round}`, job.abortController.signal);
  try {
    return await new Promise((resolve, reject) => {
      const worker = path.join(appRoot(), 'electron', 'remotion-worker.cjs');
      const env = {...process.env};
      if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
      const child = spawn(process.execPath, [worker, requestFile], {cwd: appRoot(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      job.child = child;
      const state = {complete: null, error: '', stderr: ''};
      let stdout = '';
      const timeout = setTimeout(() => {
        state.error = '关键帧渲染超过 12 分钟';
        terminateTree(child);
      }, WORKER_TIMEOUT_MS);
      timeout.unref?.();
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
        let index;
        while ((index = stdout.indexOf('\n')) >= 0) {
          const line = stdout.slice(0, index).trim();
          stdout = stdout.slice(index + 1);
          if (line) parseWorkerLine(job, line, state, round ? 40 + (round - 1) * 22 : 30, 12);
        }
      });
      child.stderr.on('data', (chunk) => { state.stderr = `${state.stderr}${chunk.toString('utf8')}`.slice(-8000); });
      child.on('error', (error) => { state.error = error.message || String(error); });
      child.on('close', () => {
        clearTimeout(timeout);
        job.child = null;
        if (job.status === 'cancelled' || job.abortController.signal.aborted) return reject(Object.assign(new Error('生成已取消'), {name: 'AbortError'}));
        if (!state.complete?.contactSheet) return reject(new Error(state.error || state.stderr.trim().slice(-3000) || '关键帧渲染失败'));
        resolve(state.complete);
      });
    });
  } finally {
    release();
  }
}

renderStillsImpl = renderStills;

function contactSheetPart(file) {
  const base64 = fs.readFileSync(file).toString('base64');
  return {type: 'image_url', image_url: {url: `data:image/jpeg;base64,${base64}`}};
}

async function reviewSource(job, source, stills, round, includeImage = true) {
  const prompt = `${skillFor(job, 'review').text}\n\n审查这段 Remotion 动画的六张时间顺序关键帧和源码。按排版、视觉层级、素材利用、文字溢出、动画节奏、镜头连续性评分。只返回 JSON：{"score":0-100,"criticalIssues":["..."],"summary":"...","revisedSource":"完整 TSX 或空字符串"}。分数低于 88 或存在严重问题时必须给出完整 revisedSource；不要返回补丁。\n\n创意方案：\n${JSON.stringify(job.plan || {}, null, 2)}\n\n当前源码：\n${source}`;
  const content = [{type: 'text', text: prompt}];
  if (includeImage) content.push(contactSheetPart(stills.contactSheet));
  const response = await callLlm(job, includeImage ? `reviewing-${round}` : `reviewing-text-${round}`, {
    progress: 54 + (round - 1) * 22,
    temperature: 0.2,
    maxTokens: 24_000,
    llmKeyId: job.input.reviewLlmKeyId || job.input.llmKeyId,
    messages: [
      {role: 'system', content: '你是严格的动态视觉总监兼 Remotion 代码审查员。评价必须具体，并保持安全输出契约。'},
      {role: 'user', content},
    ],
  });
  return jsonFromText(response.content) || {score: 0, criticalIssues: ['审片响应无法解析'], summary: safeText(response.content, 4000), revisedSource: ''};
}

async function professionalPipeline(job, initialSource) {
  let source = initialSource;
  let lastCompiled = '';
  for (let round = 1; round <= 2; round += 1) {
    let stills;
    try {
      stills = await renderStillsImpl(job, source, round);
      lastCompiled = source;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const repaired = await repairSource(job, source, [`Remotion 编译或关键帧渲染失败：${error.message || error}`], 44 + (round - 1) * 22);
      const valid = await ensureValidSource(job, repaired, 46 + (round - 1) * 22);
      stills = await renderStillsImpl(job, valid, round);
      source = valid;
      lastCompiled = valid;
    }

    let review;
    try {
      review = await reviewSource(job, source, stills, round, true);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      job.warnings.push(`第 ${round} 轮视觉审片不可用，已降级为文本审查：${safeText(error.message, 300)}`);
      review = await reviewSource(job, source, stills, round, false);
    }
    const score = Math.max(0, Math.min(100, Number(review?.score) || 0));
    const criticalIssues = Array.isArray(review?.criticalIssues) ? review.criticalIssues.map((item) => safeText(item, 500)).filter(Boolean) : [];
    job.reviews.push({round, score, summary: safeText(review?.summary, 2000), criticalIssues});
    if (score >= 88 && criticalIssues.length === 0) break;
    const revised = stripFence(review?.revisedSource || '');
    if (!revised) {
      job.warnings.push(`第 ${round} 轮审片未返回可修订源码，保留上一版。`);
      break;
    }
    try {
      source = await ensureValidSource(job, revised, 60 + (round - 1) * 22);
    } catch (error) {
      job.warnings.push(`第 ${round} 轮修订未通过安全校验，已回退上一版：${safeText(error.message, 300)}`);
      source = lastCompiled;
      break;
    }
  }
  if (source !== lastCompiled) {
    try {
      await renderStillsImpl(job, source, 3);
      lastCompiled = source;
    } catch (error) {
      job.warnings.push(`最终修订未通过编译，已回退上一份可编译源码：${safeText(error.message, 300)}`);
      source = lastCompiled;
    }
  }
  return source;
}

async function runJob(job) {
  activeJobId = job.id;
  job.status = 'running';
  job.updatedAt = Date.now();
  try {
    update(job, 'preparing-assets', 3);
    await prepareWorkspace(job);
    if (job.input.quality === 'professional') await generatePlan(job);
    let source = await generateSource(job);
    source = await ensureValidSource(job, source, job.input.quality === 'professional' ? 30 : 55);
    if (job.input.quality === 'professional') source = await professionalPipeline(job, source);
    job.source = source;
    job.status = 'success';
    job.phase = 'described';
    job.progress = 100;
    job.completedAt = Date.now();
  } catch (error) {
    if (job.status === 'cancelled' || error?.name === 'AbortError' || job.abortController.signal.aborted) {
      job.status = 'cancelled';
      job.phase = 'cancelled';
      job.error = '';
    } else {
      job.status = 'error';
      job.phase = 'error';
      const validation = Array.isArray(error?.validationErrors) ? `\n${error.validationErrors.join('\n')}` : '';
      job.error = `${error?.message || String(error)}${validation}`.slice(0, 5000);
    }
    job.completedAt = Date.now();
  } finally {
    job.updatedAt = Date.now();
    activeJobId = '';
    scheduleCleanup(job);
    drainQueue();
  }
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

function createGenerationJob(body, user) {
  const input = normalizeGenerationInput(body);
  if (input.quality === 'professional' && input.mode !== 'tsx') {
    const error = new Error('专业模式仅支持专家 TSX');
    error.code = 'validation_failed';
    throw error;
  }
  if (!input.subject && input.texts.every((item) => !item.text) && input.assets.length === 0) {
    const error = new Error('请输入主题/文本或提交上游素材');
    error.code = 'validation_failed';
    throw error;
  }
  const settings = loadSettingsImpl();
  if (!settings) throw new Error('无法读取 LLM 独立配置');
  const profile = normalizeProfile(input.profile);
  const skill = buildSkillContext({...input, profile}, 'code');
  const id = genId();
  const now = Date.now();
  const job = {
    id,
    input,
    profile,
    settings,
    skill,
    skillContexts: {code: skill},
    userId: String(user?.id || ''),
    status: 'queued',
    phase: 'queued',
    progress: 0,
    error: '',
    source: '',
    plan: null,
    planSummary: '',
    reviews: [],
    warnings: [...skill.warnings],
    createdAt: now,
    updatedAt: now,
    workDir: path.join(generationRoot(), id),
    abortController: new AbortController(),
    child: null,
  };
  jobs.set(id, job);
  queue.push(id);
  drainQueue();
  return publicJob(job);
}

function getGenerationJob(id) {
  return jobs.get(String(id || '')) || null;
}

function canAccess(job, user) {
  if (!job || !user) return false;
  return String(job.userId) === String(user.id) || ['admin', 'superadmin'].includes(String(user.role || '').toLowerCase());
}

function cancelGenerationJob(job) {
  if (!job || ['success', 'error', 'cancelled'].includes(job.status)) return publicJob(job);
  job.status = 'cancelled';
  job.phase = 'cancelled';
  job.updatedAt = Date.now();
  const index = queue.indexOf(job.id);
  if (index >= 0) queue.splice(index, 1);
  job.abortController.abort();
  if (job.child) terminateTree(job.child);
  if (activeJobId !== job.id) scheduleCleanup(job);
  return publicJob(job);
}

function resetForTests() {
  for (const job of jobs.values()) {
    job.abortController?.abort();
    if (job.child) terminateTree(job.child);
  }
  jobs.clear();
  queue.splice(0, queue.length);
  activeJobId = '';
  generateLlmImpl = generateConfiguredLlm;
  loadSettingsImpl = loadRawSettings;
  renderStillsImpl = renderStills;
}

function setTestHooks(hooks = {}) {
  if (typeof hooks.generateLlm === 'function') generateLlmImpl = hooks.generateLlm;
  if (typeof hooks.loadSettings === 'function') loadSettingsImpl = hooks.loadSettings;
  if (typeof hooks.renderStills === 'function') renderStillsImpl = hooks.renderStills;
}

module.exports = {
  REVIEW_FRAMES,
  setTestHooks,
  canAccess,
  cancelGenerationJob,
  createGenerationJob,
  getGenerationJob,
  publicJob,
  resetForTests,
};
