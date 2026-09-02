'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const JSZip = require('jszip');
const sharp = require('sharp');
const config = require('../../config');
const { generateConfiguredLlm, loadRawSettings } = require('../../providers/llmClient');
const { addHistoryItems } = require('../../utils/generationHistory');
const { stageAssets } = require('../remotion/assets');
const { resolveRuntime } = require('./runtime');
const { RUNNER_SOURCE } = require('./pythonScripts');

const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const WORKSPACE_TTL_MS = 60 * 60 * 1000;
const PROCESS_TIMEOUT_MS = 30 * 60 * 1000;
const JOB_TIMEOUT_MS = 120 * 60 * 1000;
const MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;
const MAX_IMAGES = 12;
const REVIEW_THRESHOLD = 88;
// Automatic module rewrites are intentionally disabled. A failed generated
// script is surfaced immediately so users can adjust the prompt/model instead
// of compounding failures with additional LLM-generated patches.
const MAX_REPAIR_ROUNDS = 0;
const jobs = new Map();
const queue = [];
let activeJobId = '';
let generateLlmImpl = generateConfiguredLlm;
let loadSettingsImpl = loadRawSettings;
let stageAssetsImpl = stageAssets;
let resolveRuntimeImpl = resolveRuntime;
let runBlenderImpl = runBlenderProcess;

function safeText(value, max = 20_000) {
  return String(value || '').trim().slice(0, max);
}

function stripFence(value) {
  return String(value || '').trim()
    .replace(/^```(?:python|py|json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
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
  return `blend_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function cleanLabel(value, fallback) {
  return safeText(value, 120).replace(/[\\/:*?"<>|]+/g, '_') || fallback;
}

function normalizeInput(body = {}) {
  const texts = (Array.isArray(body.texts) ? body.texts : []).slice(0, 32).map((item, index) => ({
    id: safeText(item?.id || `text-${index + 1}`, 80),
    label: safeText(item?.label || `上游文本 ${index + 1}`, 120),
    text: safeText(item?.text, 20_000),
  })).filter((item) => item.text);
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, MAX_IMAGES).map((item, index) => ({
    id: safeText(item?.id || `image-${index + 1}`, 80),
    kind: 'image',
    label: safeText(item?.label || `参考图 ${index + 1}`, 120),
    url: String(item?.url || '').trim().slice(0, 70 * 1024 * 1024),
  })).filter((item) => item.url);
  return {
    prompt: safeText(body.prompt, 20_000),
    llmKeyId: safeText(body.llmKeyId, 120),
    renderPreset: body.renderPreset === 'draft' ? 'draft' : 'final',
    blenderPath: safeText(body.blenderPath, 1000),
    texts,
    images,
    historyContext: body.historyContext && typeof body.historyContext === 'object' ? body.historyContext : {},
  };
}

function artifactUrl(file) {
  const rel = path.relative(config.OUTPUT_DIR, file).split(path.sep).map(encodeURIComponent).join('/');
  return `/files/output/${rel}`;
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
    renderPreset: job.input.renderPreset,
    runtime: job.runtime || undefined,
    researchMode: job.researchMode || undefined,
    planSummary: safeText(job.plan?.summary || job.plan?.concept, 3000) || undefined,
    reviews: job.reviews,
    warnings: job.warnings,
    repairsUsed: job.repairsUsed,
    artifacts: job.artifacts || undefined,
  };
}

function update(job, phase, progress) {
  job.phase = phase;
  job.progress = Math.max(job.progress, Math.min(99, Math.round(Number(progress) || 0)));
  job.updatedAt = Date.now();
}

function terminateTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    try { spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }); } catch (_) {}
  }
  try { child.kill('SIGTERM'); } catch (_) {}
}

function cleanEnvironment() {
  const names = ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramData'];
  const env = {};
  for (const name of names) if (process.env[name]) env[name] = process.env[name];
  env.PYTHONNOUSERSITE = '1';
  return env;
}

function runBlenderProcess(job, request) {
  return new Promise((resolve, reject) => {
    const requestFile = path.join(job.workDir, `request-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`);
    fs.writeFileSync(requestFile, JSON.stringify(request), 'utf8');
    const child = spawn(job.runtime.executable, ['--background', '--factory-startup', '--python', job.runnerPath, '--', requestFile], {
      cwd: job.workDir,
      env: cleanEnvironment(),
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    job.child = child;
    let stdout = '';
    let stderr = '';
    let completed = null;
    let runnerError = '';
    const timer = setTimeout(() => {
      runnerError = 'Blender 单阶段执行超过 30 分钟';
      terminateTree(child);
    }, PROCESS_TIMEOUT_MS);
    timer.unref?.();
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      let index;
      while ((index = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, index).trim();
        stdout = stdout.slice(index + 1);
        if (!line.startsWith('{')) continue;
        try {
          const message = JSON.parse(line);
          if (message.type === 'complete') completed = message;
          if (message.type === 'error') runnerError = safeText(message.error || message.traceback, 5000);
        } catch (_) {}
      }
    });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-12_000); });
    child.on('error', (error) => { runnerError = error.message || String(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      job.child = null;
      try { fs.rmSync(requestFile, { force: true }); } catch (_) {}
      if (job.status === 'cancelled' || job.abortController.signal.aborted) return reject(Object.assign(new Error('Blender 作业已取消'), { name: 'AbortError' }));
      if (code !== 0 || !completed) return reject(new Error(runnerError || stderr.trim().slice(-5000) || `Blender 退出码 ${code}`));
      resolve(completed);
    });
  });
}

function recursiveSize(root) {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    total += entry.isDirectory() ? recursiveSize(file) : fs.statSync(file).size;
    if (total > MAX_OUTPUT_BYTES) break;
  }
  return total;
}

function assertWithinOutputLimit(job) {
  const size = recursiveSize(job.workDir) + recursiveSize(job.outputDir);
  if (size > MAX_OUTPUT_BYTES) throw new Error('Blender 作业产物超过 1GB 限制');
}

function imagePart(file) {
  const base64 = fs.readFileSync(file).toString('base64');
  return { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } };
}

function referenceContent(job, text, includeAll = true) {
  const content = [{ type: 'text', text }];
  const refs = includeAll ? job.referenceFiles.slice(0, MAX_IMAGES) : job.referenceFiles.slice(0, 4);
  refs.forEach((file) => content.push(imagePart(file)));
  return content;
}

async function callLlm(job, phase, options = {}) {
  update(job, phase, options.progress || job.progress);
  return generateLlmImpl({
    settings: job.settings,
    llmKeyId: job.input.llmKeyId,
    messages: options.messages,
    temperature: options.temperature ?? 0.25,
    maxTokens: options.maxTokens || 16_000,
    timeoutMs: 10 * 60 * 1000,
    retries: 2,
    webSearch: options.webSearch === true,
    signal: job.abortController.signal,
  });
}

function contextText(job) {
  const upstream = job.input.texts.map((item) => `${item.label}:\n${item.text}`).join('\n\n');
  return `用户要求：\n${job.input.prompt || '(依据参考图建模)'}\n\n上游文本：\n${upstream || '(无)'}\n\n参考图数量：${job.referenceFiles.length}`;
}

async function research(job) {
  const prompt = `${contextText(job)}\n\n先检索或识别真实建筑、神社、高层结构、街道设施与常见 PBR 材质参考。只返回 JSON：{"summary":"...","references":[{"name":"...","url":"...","relevance":"..."}],"structuralNotes":[],"materialNotes":[],"uncertainties":[]}。不要开始建模。`;
  const messages = [
    { role: 'system', content: '你是严谨的建筑与工业设计参考研究员。优先使用联网检索工具，来源必须服务于可执行 Blender 建模。' },
    { role: 'user', content: referenceContent(job, prompt) },
  ];
  let response;
  try {
    response = await callLlm(job, 'researching', { progress: 5, messages, temperature: 0.2, maxTokens: 7000, webSearch: true });
    if (!safeText(response?.content, 12_000)) throw new Error('联网研究未返回有效内容');
    job.researchMode = 'web-search';
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    job.warnings.push(`所选模型的联网检索不可用，已降级为模型知识与输入参考图：${safeText(error.message, 300)}`);
    try {
      response = await callLlm(job, 'researching-fallback', { progress: 6, messages, temperature: 0.2, maxTokens: 7000 });
    } catch (fallbackError) {
      if (/billing service temporarily unavailable|计费服务暂时不可用/i.test(String(fallbackError?.message || ''))) {
        throw new Error('所选 LLM 的计费服务暂时不可用，请稍后重试或切换可用的 LLM 配置。');
      }
      throw fallbackError;
    }
    job.researchMode = 'knowledge-fallback';
  }
  job.research = jsonFromText(response.content) || { summary: safeText(response.content, 12_000), references: [], uncertainties: ['研究响应未返回结构化 JSON'] };
}

async function planScene(job) {
  const prompt = `${contextText(job)}\n\n研究结果：\n${JSON.stringify(job.research, null, 2)}\n\n制定通用静态 Blender 场景方案。禁止一次性模糊完成整座城市，必须把建筑、道路、路灯、自动售货机、电线等按资产批次逐步创建。只返回 JSON：{"summary":"...","scaleBasis":"...","hierarchy":[],"assetBatches":[{"id":"...","label":"...","items":[]}],"palette":[],"materials":[],"wearStrategy":[],"lightingPlan":{},"cameraPlan":{},"qualityChecklist":[]}。assetBatches 最多 6 组。`;
  const response = await callLlm(job, 'planning', {
    progress: 10,
    temperature: 0.35,
    maxTokens: 10_000,
    messages: [
      { role: 'system', content: '你是 Blender 场景总监和结构设计师。方案必须有真实比例、清晰层级、统一色调、经年磨损与局部破损。' },
      { role: 'user', content: referenceContent(job, prompt) },
    ],
  });
  job.plan = jsonFromText(response.content) || { summary: safeText(response.content, 12_000), assetBatches: [{ id: 'main-assets', label: '主体资产', items: [] }] };
  if (!Array.isArray(job.plan.assetBatches) || job.plan.assetBatches.length === 0) {
    job.plan.assetBatches = [{ id: 'main-assets', label: '主体资产', items: [] }];
  }
  job.plan.assetBatches = job.plan.assetBatches.slice(0, 6);
}

function moduleGuide() {
  return `只返回一个 Python 模块，不要 Markdown。模块必须定义 build(context)，顶层不能执行建模。只允许导入 bpy、bmesh、math、mathutils、random、colorsys、collections、itertools；禁止文件、网络、子进程、动态导入、绝对路径和自行保存/导出。使用米制真实比例、语义化对象名和 Collection 层级。网格需有合理法线、倒角或细节，避免零尺寸与无穷坐标。`;
}

async function generateModule(job, spec, source = '', issues = []) {
  const retryContext = source
    ? `\n\n上一版模块：\n${source}\n\n必须修复的问题：\n${issues.join('\n')}`
    : issues.length ? `\n\n必须处理的问题：\n${issues.join('\n')}` : '';
  const prompt = `${contextText(job)}\n\n研究：\n${JSON.stringify(job.research, null, 2)}\n\n总方案：\n${JSON.stringify(job.plan, null, 2)}\n\n当前阶段：${spec.label}\n阶段任务：${JSON.stringify(spec.payload, null, 2)}${retryContext}\n\n${moduleGuide()}`;
  const response = await callLlm(job, source ? 'repairing-module' : `generating-${spec.kind}`, {
    progress: spec.progress,
    temperature: source ? 0.12 : 0.25,
    maxTokens: 24_000,
    messages: [
      { role: 'system', content: `你是负责${spec.label}的资深 Blender bpy 工程师。输出必须可在 Blender 4.3 后台模式直接执行。` },
      { role: 'user', content: referenceContent(job, prompt, false) },
    ],
  });
  const result = stripFence(response.content);
  if (!/def\s+build\s*\(\s*context\s*\)/.test(result)) throw new Error(`${spec.label}没有返回 build(context) 模块`);
  return result;
}

async function reviewCheckpoint(job, spec, file) {
  const prompt = `依据用户要求、参考研究和总方案，审查“${spec.label}”检查图。检查结构比例、资产完整度、明显穿插、悬浮、粗糙占位、统一色调和阶段目标。只返回 JSON：{"score":0-100,"criticalIssues":[],"summary":"...","revisionInstruction":"..."}。低于 ${REVIEW_THRESHOLD} 分或存在严重问题时给出具体修复指令。`;
  const response = await callLlm(job, `reviewing-${spec.kind}`, {
    progress: Math.min(88, spec.progress + 4),
    temperature: 0.15,
    maxTokens: 5000,
    messages: [
      { role: 'system', content: '你是严格的 3D 资产与场景质检总监。不要因为时间或 credit 降低质量标准。' },
      { role: 'user', content: [{ type: 'text', text: `${prompt}\n\n方案：${JSON.stringify(job.plan)}` }, imagePart(file)] },
    ],
  });
  const parsed = jsonFromText(response.content) || { score: 0, criticalIssues: ['审查响应无法解析'], summary: safeText(response.content, 3000), revisionInstruction: '重新检查并完整修复当前阶段' };
  return {
    phase: spec.kind,
    label: spec.label,
    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    criticalIssues: Array.isArray(parsed.criticalIssues) ? parsed.criticalIssues.map((item) => safeText(item, 500)).filter(Boolean) : [],
    summary: safeText(parsed.summary, 2500),
    revisionInstruction: safeText(parsed.revisionInstruction, 4000),
  };
}

function stageSpecs(job) {
  const batches = job.plan.assetBatches.map((batch, index) => ({
    kind: `assets-${index + 1}`,
    label: `资产建模 · ${safeText(batch.label || batch.id || index + 1, 80)}`,
    payload: batch,
  }));
  const raw = [
    { kind: 'structure', label: '结构与空间层级', payload: { hierarchy: job.plan.hierarchy, scaleBasis: job.plan.scaleBasis } },
    ...batches,
    { kind: 'materials', label: '统一材质、色调、磨损与局部破损', payload: { palette: job.plan.palette, materials: job.plan.materials, wearStrategy: job.plan.wearStrategy } },
    { kind: 'lighting', label: '灯光、相机与最终构图', payload: { lightingPlan: job.plan.lightingPlan, cameraPlan: job.plan.cameraPlan } },
  ];
  return raw.map((item, index) => ({ ...item, progress: 16 + Math.round((index / Math.max(1, raw.length)) * 52) }));
}

async function validatePreview(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) throw new Error('Blender 检查图为空或未生成');
  const stats = await sharp(file).stats();
  const spread = stats.channels.reduce((sum, channel) => sum + Number(channel.stdev || 0), 0);
  if (spread < 1.5) throw new Error('Blender 检查图接近纯色空白');
}

function validateArtifactFile(file, kind) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
    throw new Error(kind === 'blend' ? 'Blender 工程文件未生成' : 'GLB 预览模型未生成');
  }
  const header = Buffer.alloc(12);
  const descriptor = fs.openSync(file, 'r');
  try { fs.readSync(descriptor, header, 0, header.length, 0); } finally { fs.closeSync(descriptor); }
  if (kind === 'blend' && header.subarray(0, 7).toString('ascii') !== 'BLENDER') {
    throw new Error('Blender 工程文件头无效');
  }
  if (kind === 'glb') {
    const size = fs.statSync(file).size;
    if (header.subarray(0, 4).toString('ascii') !== 'glTF' || header.readUInt32LE(4) !== 2 || header.readUInt32LE(8) !== size) {
      throw new Error('GLB 预览模型文件头无效');
    }
  }
}

async function applyStage(job, spec, index, currentBlend) {
  const baseBlend = currentBlend;
  let source = await generateModule(job, spec);
  let attempt = 0;
  for (;;) {
    const suffix = attempt ? `-repair-${attempt}` : '';
    const modulePath = path.join(job.modulesDir, `${String(index + 1).padStart(2, '0')}-${cleanLabel(spec.kind, 'stage')}${suffix}.py`);
    const outputBlend = path.join(job.workDir, `checkpoint-${String(index + 1).padStart(2, '0')}${suffix}.blend`);
    const checkpointPath = path.join(job.checkpointDir, `${String(index + 1).padStart(2, '0')}-${cleanLabel(spec.kind, 'stage')}${suffix}.png`);
    fs.writeFileSync(modulePath, source, 'utf8');
    update(job, `building-${spec.kind}`, spec.progress + 1);
    try {
      await runBlenderImpl(job, {
        operation: 'apply', currentBlend: baseBlend || '', modulePath, outputBlend, checkpointPath,
        context: { prompt: job.input.prompt, phase: spec.kind, plan: job.plan },
      });
      await validatePreview(checkpointPath);
      assertWithinOutputLimit(job);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (job.repairsUsed >= MAX_REPAIR_ROUNDS) throw error;
      job.repairsUsed += 1;
      attempt += 1;
      const issue = `${spec.label}执行或检查失败：${safeText(error?.message || error, 2000)}`;
      job.warnings.push(`${issue}，正在自动返修（${job.repairsUsed}/${MAX_REPAIR_ROUNDS}）。`);
      source = await generateModule(job, spec, source, [issue]);
      continue;
    }
    const review = await reviewCheckpoint(job, spec, checkpointPath);
    review.round = job.reviews.length + 1;
    review.previewUrl = '';
    job.reviews.push(review);
    if (review.score >= REVIEW_THRESHOLD && review.criticalIssues.length === 0) return outputBlend;
    if (job.repairsUsed >= MAX_REPAIR_ROUNDS) {
      job.warnings.push(`${spec.label}未达到 ${REVIEW_THRESHOLD} 分，已保留当前结果（自动返修已关闭）。`);
      return outputBlend;
    }
    job.repairsUsed += 1;
    attempt += 1;
    const issues = [...review.criticalIssues, review.revisionInstruction].filter(Boolean);
    source = await generateModule(job, spec, source, issues);
  }
}

async function finalReview(job, previews) {
  const content = [{ type: 'text', text: `最终审查 Blender 场景四视图。严格对照用户要求和参考图，检查结构、比例、资产完整度、材质真实度、统一色调、经年磨损、局部破损、灯光构图和镜头可用质量。只返回 JSON：{"score":0-100,"criticalIssues":[],"summary":"...","revisionInstruction":"..."}。低于 ${REVIEW_THRESHOLD} 或有严重问题必须提出可执行修复。\n\n方案：${JSON.stringify(job.plan)}` }];
  previews.forEach((file) => content.push(imagePart(file)));
  const response = await callLlm(job, 'final-review', {
    progress: 92,
    temperature: 0.12,
    maxTokens: 6000,
    messages: [
      { role: 'system', content: '你是写实级 Blender 场景终审总监。只依据画面质量通过，不考虑时间和调用成本。' },
      { role: 'user', content },
    ],
  });
  const parsed = jsonFromText(response.content) || { score: 0, criticalIssues: ['最终审片响应无法解析'], summary: safeText(response.content, 3000), revisionInstruction: '全面修复最终场景' };
  return {
    phase: 'final', label: '最终四视图审片', round: job.reviews.length + 1,
    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    criticalIssues: Array.isArray(parsed.criticalIssues) ? parsed.criticalIssues.map((item) => safeText(item, 500)).filter(Boolean) : [],
    summary: safeText(parsed.summary, 2500), revisionInstruction: safeText(parsed.revisionInstruction, 4000),
  };
}

async function renderFinal(job, currentBlend) {
  fs.mkdirSync(job.previewDir, { recursive: true });
  await runBlenderImpl(job, {
    operation: 'final', currentBlend, preset: job.input.renderPreset,
    outputBlend: job.outputBlend, outputGlb: job.outputGlb, previewDir: job.previewDir,
  });
  const previews = [1, 2, 3, 4].map((index) => path.join(job.previewDir, `view-${String(index).padStart(2, '0')}.png`));
  for (const file of previews) await validatePreview(file);
  validateArtifactFile(job.outputBlend, 'blend');
  validateArtifactFile(job.outputGlb, 'glb');
  assertWithinOutputLimit(job);
  return previews;
}

async function reviseFinal(job, currentBlend, review, index) {
  const spec = { kind: `final-revision-${index}`, label: `最终场景返修 ${index}`, progress: 94, payload: { issues: review.criticalIssues, instruction: review.revisionInstruction } };
  const source = await generateModule(job, spec, '', [...review.criticalIssues, review.revisionInstruction]);
  const modulePath = path.join(job.modulesDir, `90-final-revision-${index}.py`);
  const outputBlend = path.join(job.workDir, `final-revision-${index}.blend`);
  const checkpointPath = path.join(job.checkpointDir, `90-final-revision-${index}.png`);
  fs.writeFileSync(modulePath, source, 'utf8');
  await runBlenderImpl(job, { operation: 'apply', currentBlend, modulePath, outputBlend, checkpointPath, context: { prompt: job.input.prompt, phase: spec.kind, plan: job.plan } });
  await validatePreview(checkpointPath);
  return outputBlend;
}

async function writeReportsAndPackage(job, previews) {
  const report = {
    schema: 't8-blender-report/v1', jobId: job.id, createdAt: new Date(job.createdAt).toISOString(),
    completedAt: new Date().toISOString(), renderPreset: job.input.renderPreset, runtime: job.runtime,
    researchMode: job.researchMode, research: job.research, plan: job.plan, reviews: job.reviews,
    repairsUsed: job.repairsUsed, warnings: job.warnings,
  };
  const reportPath = path.join(job.outputDir, 'report.json');
  const researchPath = path.join(job.outputDir, 'research.json');
  const planPath = path.join(job.outputDir, 'plan.json');
  const reviewsPath = path.join(job.outputDir, 'reviews.json');
  const manifestPath = path.join(job.outputDir, 'manifest.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(researchPath, JSON.stringify(job.research, null, 2), 'utf8');
  fs.writeFileSync(planPath, JSON.stringify(job.plan, null, 2), 'utf8');
  fs.writeFileSync(reviewsPath, JSON.stringify(job.reviews, null, 2), 'utf8');
  const moduleNames = fs.readdirSync(job.modulesDir).sort();
  const checkpointNames = fs.readdirSync(job.checkpointDir).filter((name) => /\.png$/i.test(name)).sort();
  fs.writeFileSync(manifestPath, JSON.stringify({
    schema: 't8-blender-project/v1', jobId: job.id, primary: 'scene.blend', previewModel: 'scene.glb',
    reports: ['report.json', 'research.json', 'plan.json', 'reviews.json'],
    previews: previews.map((file) => `previews/${path.basename(file)}`),
    checkpoints: checkpointNames.map((name) => `checks/${name}`),
    generatedModules: moduleNames.map((name) => `scripts/${name}`),
    runner: 'scripts/t8_blender_runner.py',
  }, null, 2), 'utf8');

  const zip = new JSZip();
  zip.file('scene.blend', fs.readFileSync(job.outputBlend));
  zip.file('scene.glb', fs.readFileSync(job.outputGlb));
  zip.file('report.json', fs.readFileSync(reportPath));
  zip.file('research.json', fs.readFileSync(researchPath));
  zip.file('plan.json', fs.readFileSync(planPath));
  zip.file('reviews.json', fs.readFileSync(reviewsPath));
  zip.file('manifest.json', fs.readFileSync(manifestPath));
  for (const file of previews) zip.file(`previews/${path.basename(file)}`, fs.readFileSync(file));
  for (const name of checkpointNames) zip.file(`checks/${name}`, fs.readFileSync(path.join(job.checkpointDir, name)));
  zip.file('scripts/t8_blender_runner.py', fs.readFileSync(job.runnerPath));
  for (const name of moduleNames) zip.file(`scripts/${name}`, fs.readFileSync(path.join(job.modulesDir, name)));
  for (const name of fs.readdirSync(job.referencesDir).sort()) zip.file(`references/${name}`, fs.readFileSync(path.join(job.referencesDir, name)));
  const zipPath = path.join(job.outputDir, 'blender-project.zip');
  fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
  assertWithinOutputLimit(job);
  job.artifacts = {
    blendUrl: artifactUrl(job.outputBlend), glbUrl: artifactUrl(job.outputGlb), zipUrl: artifactUrl(zipPath),
    reportUrl: artifactUrl(reportPath), previewUrls: previews.map(artifactUrl),
  };
}

async function prepareWorkspace(job) {
  fs.mkdirSync(job.workDir, { recursive: true });
  fs.mkdirSync(job.outputDir, { recursive: true });
  fs.mkdirSync(job.modulesDir, { recursive: true });
  fs.mkdirSync(job.checkpointDir, { recursive: true });
  fs.mkdirSync(job.referencesDir, { recursive: true });
  fs.writeFileSync(job.runnerPath, RUNNER_SOURCE, 'utf8');
  const staged = await stageAssetsImpl(job.input.images, job.referencesDir);
  job.referenceFiles = staged.map((item) => path.join(job.referencesDir, item.src));
}

async function runJob(job) {
  activeJobId = job.id;
  job.status = 'running';
  job.updatedAt = Date.now();
  const timeout = setTimeout(() => {
    if (!['success', 'error', 'cancelled'].includes(job.status)) {
      job.abortController.abort();
      terminateTree(job.child);
    }
  }, JOB_TIMEOUT_MS);
  timeout.unref?.();
  try {
    update(job, 'detecting-runtime', 1);
    job.runtime = resolveRuntimeImpl(job.input.blenderPath);
    if (!job.runtime?.installed) throw new Error(job.runtime?.error || 'Blender 不可用');
    update(job, 'preparing-references', 3);
    await prepareWorkspace(job);
    await research(job);
    await planScene(job);
    let currentBlend = '';
    const specs = stageSpecs(job);
    for (let index = 0; index < specs.length; index += 1) currentBlend = await applyStage(job, specs[index], index, currentBlend);
    let previews = await renderFinal(job, currentBlend);
    for (;;) {
      const review = await finalReview(job, previews);
      job.reviews.push(review);
      if (review.score >= REVIEW_THRESHOLD && review.criticalIssues.length === 0) break;
      if (job.repairsUsed >= MAX_REPAIR_ROUNDS) {
        job.warnings.push(`最终审片未达到 ${REVIEW_THRESHOLD} 分，已保留当前结果（自动返修已关闭）。`);
        break;
      }
      job.repairsUsed += 1;
      currentBlend = await reviseFinal(job, currentBlend, review, job.repairsUsed);
      previews = await renderFinal(job, currentBlend);
    }
    update(job, 'packaging', 98);
    await writeReportsAndPackage(job, previews);
    addHistoryItems([{ kind: 'image', url: job.artifacts.previewUrls[0], title: safeText(job.input.prompt, 80) || 'Blender 模型预览' }], job.input.historyContext, job.user);
    job.status = 'success';
    job.phase = 'success';
    job.progress = 100;
    job.completedAt = Date.now();
  } catch (error) {
    if (job.status === 'cancelled' || error?.name === 'AbortError' || job.abortController.signal.aborted) {
      job.status = 'cancelled'; job.phase = 'cancelled'; job.error = '';
    } else {
      job.status = 'error'; job.phase = 'error'; job.error = safeText(error?.message || String(error), 5000);
    }
    job.completedAt = Date.now();
  } finally {
    clearTimeout(timeout);
    job.updatedAt = Date.now();
    activeJobId = '';
    scheduleCleanup(job);
    drainQueue();
  }
}

function scheduleCleanup(job) {
  setTimeout(() => { try { fs.rmSync(job.workDir, { recursive: true, force: true }); } catch (_) {} }, WORKSPACE_TTL_MS).unref?.();
  setTimeout(() => jobs.delete(job.id), JOB_TTL_MS).unref?.();
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
  const input = normalizeInput(body);
  if (!input.prompt && input.texts.length === 0 && input.images.length === 0) {
    const error = new Error('请输入建模要求或连接上游文本/参考图'); error.code = 'validation_failed'; throw error;
  }
  const settings = loadSettingsImpl();
  if (!settings) throw new Error('无法读取 LLM 独立配置');
  const id = genId();
  const now = Date.now();
  const workDir = path.join(config.DATA_DIR, 'blender-jobs', id);
  const outputDir = path.join(config.OUTPUT_DIR, 'blender', id);
  const job = {
    id, input, settings, user, userId: String(user?.id || ''), status: 'queued', phase: 'queued', progress: 0,
    error: '', warnings: [], reviews: [], repairsUsed: 0, researchMode: '', research: null, plan: null,
    createdAt: now, updatedAt: now, completedAt: 0, workDir, outputDir,
    modulesDir: path.join(workDir, 'modules'), checkpointDir: path.join(workDir, 'checkpoints'),
    referencesDir: path.join(workDir, 'references'), runnerPath: path.join(workDir, 't8_blender_runner.py'),
    previewDir: path.join(outputDir, 'previews'), outputBlend: path.join(outputDir, 'scene.blend'), outputGlb: path.join(outputDir, 'scene.glb'),
    referenceFiles: [], abortController: new AbortController(), child: null, runtime: null, artifacts: null,
  };
  jobs.set(id, job);
  queue.push(id);
  drainQueue();
  return publicJob(job);
}

function getJob(id) { return jobs.get(String(id || '')) || null; }

function canAccess(job, user) {
  return !!job && !!user && (String(job.userId) === String(user.id) || ['admin', 'superadmin'].includes(String(user.role || '').toLowerCase()));
}

function cancelJob(job) {
  if (!job || ['success', 'error', 'cancelled'].includes(job.status)) return publicJob(job);
  job.status = 'cancelled'; job.phase = 'cancelled'; job.updatedAt = Date.now();
  const index = queue.indexOf(job.id); if (index >= 0) queue.splice(index, 1);
  job.abortController.abort(); terminateTree(job.child);
  if (activeJobId !== job.id) scheduleCleanup(job);
  return publicJob(job);
}

function getRuntimeStatus(overridePath = '') {
  const runtime = resolveRuntimeImpl(overridePath);
  return { ...runtime, activeJobId: activeJobId || undefined, queuedJobs: queue.length };
}

function resetForTests() {
  for (const job of jobs.values()) { job.abortController.abort(); terminateTree(job.child); }
  jobs.clear(); queue.splice(0, queue.length); activeJobId = '';
  generateLlmImpl = generateConfiguredLlm; loadSettingsImpl = loadRawSettings; stageAssetsImpl = stageAssets;
  resolveRuntimeImpl = resolveRuntime; runBlenderImpl = runBlenderProcess;
}

function setTestHooks(hooks = {}) {
  if (typeof hooks.generateLlm === 'function') generateLlmImpl = hooks.generateLlm;
  if (typeof hooks.loadSettings === 'function') loadSettingsImpl = hooks.loadSettings;
  if (typeof hooks.stageAssets === 'function') stageAssetsImpl = hooks.stageAssets;
  if (typeof hooks.resolveRuntime === 'function') resolveRuntimeImpl = hooks.resolveRuntime;
  if (typeof hooks.runBlender === 'function') runBlenderImpl = hooks.runBlender;
}

module.exports = {
  MAX_IMAGES, MAX_REPAIR_ROUNDS, REVIEW_THRESHOLD, canAccess, cancelJob, createJob, getJob,
  getRuntimeStatus, normalizeInput, publicJob, resetForTests, setTestHooks,
};
