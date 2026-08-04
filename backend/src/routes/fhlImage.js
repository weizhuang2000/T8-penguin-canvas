'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const { isAdminRole, requireAdmin } = require('../auth/middleware');
const settingsRouter = require('./settings');
const { addGeneratedHistoryItems } = require('../utils/generationHistory');
const { storageEntryForUrl } = require('../outputStorage/manager');
const { createRunId, finishRun, startRun } = require('../utils/monitoringMetrics');
const {
  MAX_WORKERS,
  RATIO_SUPPORT,
  SIZE_MATRIX,
  maskWorkers,
  normalizeWorkers,
  requestImage,
  resolveSize,
  runWorkerQueue,
} = require('../providers/fhlImages');

const router = express.Router();
const JOB_ROOT = path.join(config.DATA_DIR, 'fhl-image', 'jobs');
const OUTPUT_ROOT = path.join(config.OUTPUT_DIR, 'fhl');
const activeJobs = new Map();
const jobs = new Map();
const JOB_MODES = new Set(['generate', 'edit', 'batch-generate', 'batch-edit', 'workflow-batch-edit']);

const NAIL_TEMPLATES = [
  { key: 'hands_closeup', label: '双手前伸特写', filename: '01_hands_closeup.png', instruction: '伸出双手做近距离美甲展示，镜头重点聚焦双手和美甲细节，模特脸部可以弱化但仍要保持可识别。' },
  { key: 'hand_half_face', label: '手遮半眼面部特写', filename: '02_hand_half_face.png', instruction: '一只手自然靠近脸颊或遮住一侧眼周，肩部以上近景，特写镜头同时展示眼镜、发型、脸部识别特征和手部美甲，姿态中性自然，不要性感化。' },
  { key: 'half_body_pose', label: '半身像手部姿态', filename: '03_half_body_pose.png', instruction: '半身像构图，画面裁切到腰部以上，双手做不同展示姿态，既体现人物气质，也要让手部美甲足够清晰可见，整体像电商 lookbook 或商品试戴参考图，不强调身体曲线，不突出裙摆和腿部。' },
  { key: 'full_body_scene', label: '全身场景展示', filename: '04_full_body_scene.png', instruction: '全身像构图，人物完整出现在独立场景中，同时仍能清楚看到双手和美甲展示，不要把手藏起来；站姿和镜头语言保持日常、中性、保守的商品展示风格，避免任何性感化姿态或对身体曲线的强调。' },
];

function ensureDirs() {
  fs.mkdirSync(JOB_ROOT, { recursive: true });
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
}

function cleanText(value, max = 20_000) {
  return String(value || '').trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, max);
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

function uniqueStrings(values, max = Infinity) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanText(value, 4_000_000);
    if (!text || seen.has(text)) continue;
    seen.add(text); out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function slug(value, fallback) {
  return cleanText(value, 80).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 48) || fallback;
}

function jobFile(id) { return path.join(JOB_ROOT, `${id}.json`); }

function outputUrl(filePath) {
  const rel = path.relative(config.OUTPUT_DIR, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return `/files/output/${rel}`;
}

function persist(job) {
  ensureDirs();
  job.updatedAt = new Date().toISOString();
  const target = jobFile(job.id);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(job, null, 2), 'utf8');
  fs.renameSync(temp, target);
}

function loadJobs() {
  ensureDirs();
  for (const name of fs.readdirSync(JOB_ROOT)) {
    if (!name.endsWith('.json')) continue;
    try {
      const job = JSON.parse(fs.readFileSync(path.join(JOB_ROOT, name), 'utf8'));
      if (!job?.id) continue;
      if (job.status === 'running' || job.status === 'queued') {
        job.status = 'interrupted';
        job.error = '应用重启导致任务中断，可点击恢复继续缺失任务。';
        persist(job);
      }
      jobs.set(job.id, job);
    } catch (_) {}
  }
}

function readWorkers() {
  const settings = settingsRouter.loadSettings({ persistMigrations: false });
  return normalizeWorkers(settings.fhlWorkers);
}

function writeWorkers(workers) {
  const settings = settingsRouter.loadSettings({ persistMigrations: false });
  settings.fhlWorkers = normalizeWorkers(workers, settings.fhlWorkers);
  settingsRouter.saveSettings(settings);
  return settings.fhlWorkers;
}

function workerSummary() {
  const workers = readWorkers();
  return {
    apiRoot: 'https://www.fhl.mom',
    model: 'gpt-image-2',
    apiMode: 'images',
    workerLimit: MAX_WORKERS,
    workerCount: workers.length,
    enabledWorkerCount: workers.filter((item) => item.enabled !== false).length,
    workers: maskWorkers(workers),
    defaults: { quality: '2K', outputFormat: 'jpg', aspect: '1:1', concurrency: Math.min(3, Math.max(1, workers.length)), repairPasses: 2 },
    ratioSupport: RATIO_SUPPORT,
  };
}

function normalizeTemplates(values) {
  const out = [];
  for (const [index, raw] of (Array.isArray(values) ? values : []).entries()) {
    const prompt = cleanText(typeof raw === 'string' ? raw : raw?.prompt, 20_000);
    if (!prompt) continue;
    const key = slug(typeof raw === 'string' ? `scene_${index + 1}` : raw?.key, `scene_${index + 1}`);
    out.push({ key, label: cleanText(typeof raw === 'string' ? `场景 ${index + 1}` : raw?.label, 120) || `场景 ${index + 1}`, prompt, filename: `${String(index + 1).padStart(2, '0')}_${key}.png` });
  }
  return out.slice(0, 20);
}

function nailPrompt(template) {
  return [
    '请把第1张参考图中的固定模特，与第2张参考图中的美甲产品组合，生成一张真实自然的模特试戴图。',
    '严格保持同一模特身份与穿着不变：同一张脸、同一发型和刘海、同一副眼镜、粉色针织开衫、碎花裙、斜挎包、凉鞋，年龄感和整体气质保持一致，不要换人，不要改发型，不要改穿搭。',
    '把第1张参考图中的人物明确视为 25 岁左右的成年女性，保留其五官、发型、眼镜和穿搭特征，但不要呈现未成年感。',
    '粉色针织开衫要以保守、完整、日常穿法呈现，覆盖胸口区域；碎花裙作为普通日常裙装处理，不要强调裙长、腿部或身体曲线。',
    '第2张参考图是美甲产品款式参考，请把其中的颜色、材质、装饰、图案准确映射到模特双手的整套可穿戴美甲上，优先保证产品特征保真和手部细节清晰。',
    '整体风格必须是电商商品试戴参考图或品牌 lookbook 风格，人物姿态保持中性、自然、日常、保守，不要性感化，不要强调胸部、腰臀、腿部或身体曲线，不要做成人化呈现。',
    template.instruction,
    '输出必须是 9:16 竖构图，人物和手部都要真实自然，不要拼图，不要多面板，不要海报文字，不要水印。',
  ].join('\n\n');
}

function workflowPrompt(template, fixedCount) {
  return [
    `Reference order: ${fixedCount > 0 ? `references 1-${fixedCount} are fixed context images; ` : ''}reference ${fixedCount + 1} is the current variable item image.`,
    "Follow the user's template exactly. Do not assume a product category unless the template says it. Combine or apply the references according to the template.",
    template.prompt,
  ].join('\n\n');
}

function normalizeRequest(body) {
  const mode = JOB_MODES.has(body?.mode) ? body.mode : 'generate';
  const quality = String(body?.quality || '2K').toUpperCase() === '4K' ? '4K' : '2K';
  const outputFormat = String(body?.outputFormat || '').toLowerCase() === 'png' ? 'png' : 'jpg';
  const aspect = cleanText(body?.aspect || '1:1', 12);
  const fixedImages = uniqueStrings(body?.fixedImages || body?.images, 10);
  const itemImages = uniqueStrings(body?.itemImages, 10_000);
  const prompts = uniqueStrings(body?.prompts, 20).map((item) => cleanText(item, 20_000)).filter(Boolean);
  const prompt = cleanText(body?.prompt, 20_000);
  const preset = body?.preset === 'nail-tryon' ? 'nail-tryon' : '';
  const request = {
    mode, prompt, prompts, fixedImages, itemImages, preset, quality, outputFormat,
    aspect: preset ? '9:16' : aspect,
    count: clampInt(body?.count, 1, mode === 'edit' ? 4 : 9, 1),
    repeat: body?.repeat == null ? 0 : clampInt(body.repeat, 1, 50, 1),
    concurrency: clampInt(body?.concurrency, 1, 10, 1),
    repairPasses: clampInt(body?.repairPasses, 0, 5, 2),
    limit: clampInt(body?.limit, 1, Math.max(1, itemImages.length), Math.min(100, Math.max(1, itemImages.length))),
    adaptive: body?.adaptive !== false,
    resize: body?.resize === true,
    dryRun: body?.dryRun === true,
    templates: preset ? NAIL_TEMPLATES.map((item) => ({ ...item, prompt: nailPrompt(item) })) : normalizeTemplates(body?.templates),
    historyContext: body?.historyContext && typeof body.historyContext === 'object' ? body.historyContext : {},
  };
  if ((mode === 'generate' || mode === 'edit') && !prompt) throw new Error('请输入提示词。');
  if (mode === 'batch-generate' && !prompts.length) throw new Error('请提供 1–20 条批量提示词。');
  if ((mode === 'edit' || mode === 'batch-edit') && !fixedImages.length && !itemImages.length) throw new Error('编辑模式需要参考图。');
  if (mode === 'workflow-batch-edit') {
    if (!fixedImages.length || !itemImages.length) throw new Error('工作流批改需要固定参考图和变量图片。');
    if (!request.templates.length) throw new Error('工作流批改需要至少一个模板。');
    if (fixedImages.length + 1 > 10) throw new Error('工作流单任务的固定参考图加变量图合计不能超过 10 张。');
    if (preset && fixedImages.length !== 1) throw new Error('nail-tryon 预设需要且只允许 1 张人物固定参考图。');
  }
  const operation = mode === 'generate' || mode === 'batch-generate' ? 'generate' : 'edit';
  resolveSize(quality, request.aspect, operation);
  return request;
}

function buildTasks(job) {
  const req = job.request;
  const root = path.join(OUTPUT_ROOT, job.id);
  const extension = req.outputFormat === 'png' ? 'png' : 'jpg';
  const formattedName = (value, fallback) => {
    const safeName = path.basename(value || fallback);
    return `${safeName.replace(/\.(?:png|jpe?g)$/i, '')}.${extension}`;
  };
  fs.mkdirSync(root, { recursive: true });
  const tasks = [];
  const push = (task) => tasks.push({ id: `task-${tasks.length + 1}`, status: 'queued', ...task });
  if (req.mode === 'generate') {
    const total = req.repeat || req.count;
    for (let index = 0; index < total; index += 1) push({ operation: 'generate', prompt: req.prompt, images: [], outputPath: path.join(root, `${String(index + 1).padStart(3, '0')}.${extension}`) });
  } else if (req.mode === 'edit') {
    for (let index = 0; index < req.count; index += 1) push({ operation: 'edit', prompt: req.prompt, images: req.fixedImages, outputPath: path.join(root, `${String(index + 1).padStart(3, '0')}.${extension}`) });
  } else if (req.mode === 'batch-generate') {
    req.prompts.forEach((prompt, index) => push({ operation: 'generate', prompt, images: [], outputPath: path.join(root, `${String(index + 1).padStart(3, '0')}.${extension}`) }));
  } else if (req.mode === 'batch-edit') {
    req.itemImages.slice(0, 10).forEach((image, index) => push({ operation: 'edit', prompt: req.prompt, images: [image], itemIndex: index + 1, outputPath: path.join(root, `${String(index + 1).padStart(3, '0')}.${extension}`) }));
  } else {
    req.itemImages.slice(0, req.limit).forEach((image, itemIndex) => {
      const itemDir = path.join(root, `${String(itemIndex + 1).padStart(3, '0')}_item`);
      req.templates.forEach((template, templateIndex) => push({
        operation: 'edit',
        prompt: req.preset ? template.prompt : workflowPrompt(template, req.fixedImages.length),
        images: [...req.fixedImages, image],
        itemIndex: itemIndex + 1,
        templateIndex: templateIndex + 1,
        templateKey: template.key,
        templateLabel: template.label,
        groupKey: `item-${itemIndex + 1}`,
        outputPath: path.join(itemDir, formattedName(template.filename, `${String(templateIndex + 1).padStart(2, '0')}_${template.key}`)),
      }));
    });
  }
  return tasks.map((task) => ({ ...task, quality: req.quality, outputFormat: req.outputFormat, aspect: req.aspect, resize: req.resize, outputUrl: outputUrl(task.outputPath) }));
}

function taskPublic(task) {
  return {
    id: task.id, status: task.status, itemIndex: task.itemIndex || 0, templateIndex: task.templateIndex || 0,
    templateKey: task.templateKey || '', templateLabel: task.templateLabel || '', outputUrl: task.outputUrl,
    workerId: task.workerId || '', workerName: task.workerName || '', attempts: task.attempts || 0, retries: task.retries || 0,
    width: task.width || 0, height: task.height || 0, error: task.error || '', errorClass: task.errorClass || '',
  };
}

function snapshot(job) {
  const taskList = (job.tasks || []).map(taskPublic);
  return {
    id: job.id, mode: job.request.mode, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt,
    error: job.error || '', total: taskList.length, success: taskList.filter((item) => item.status === 'success').length,
    failed: taskList.filter((item) => item.status === 'failed').length, cancelled: taskList.filter((item) => item.status === 'cancelled').length,
    progress: job.request.dryRun && job.status === 'completed' ? 100 : (taskList.length ? Math.round((taskList.filter((item) => ['success', 'failed', 'cancelled'].includes(item.status)).length / taskList.length) * 100) : 0),
    tasks: taskList, workerStats: job.workerStats || [], artifactUrls: job.artifactUrls || {},
    outputUrls: taskList.filter((item) => item.status === 'success').map((item) => item.outputUrl),
    dryRun: job.request.dryRun,
  };
}

function canAccessJob(job, user) {
  return Boolean(job && user && (isAdminRole(user.role) || (job.userId && String(job.userId) === String(user.id))));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeArtifacts(job, partial = false) {
  const root = path.join(OUTPUT_ROOT, job.id);
  fs.mkdirSync(root, { recursive: true });
  const records = job.tasks.map(taskPublic);
  const summary = snapshot(job);
  const manifest = { schema: 't8-fhl-image-job', version: 1, partial, request: { ...job.request, fixedImages: job.request.fixedImages.length, itemImages: job.request.itemImages.length }, summary: { total: summary.total, success: summary.success, failed: summary.failed, cancelled: summary.cancelled }, workerStats: job.workerStats || [], items: records };
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  const rows = [['id', 'status', 'itemIndex', 'templateKey', 'worker', 'attempts', 'retries', 'width', 'height', 'outputUrl', 'errorClass', 'error'], ...records.map((item) => [item.id, item.status, item.itemIndex, item.templateKey, item.workerName, item.attempts, item.retries, item.width, item.height, item.outputUrl, item.errorClass, item.error])];
  fs.writeFileSync(path.join(root, 'summary.csv'), `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'failures.json'), JSON.stringify(records.filter((item) => item.status === 'failed' || item.status === 'cancelled'), null, 2), 'utf8');
  fs.writeFileSync(path.join(root, 'sessions.json'), JSON.stringify(job.sessions || [], null, 2), 'utf8');
  job.artifactUrls = Object.fromEntries(['manifest.json', 'summary.csv', 'failures.json', 'sessions.json'].map((name) => [name, outputUrl(path.join(root, name))]));
}

function applyReport(job, queue, report) {
  report.results.forEach((result, index) => {
    const task = queue[index];
    if (!task) return;
    Object.assign(task, result?.ok ? { status: 'success', ...result, outputUrl: outputUrl(task.outputPath), error: '', errorClass: '' } : { status: result?.cancelled ? 'cancelled' : 'failed', ...result });
  });
  job.workerStats = report.workerStats;
}

async function isUsableImage(filePath) {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 0) return false;
    const sharp = require('sharp');
    const metadata = await sharp(filePath, { limitInputPixels: false }).metadata();
    const expected = /\.jpe?g$/i.test(filePath) ? 'jpeg' : 'png';
    return metadata.format === expected && Number(metadata.width) > 0 && Number(metadata.height) > 0;
  } catch {
    return false;
  }
}

async function incompleteTasks(tasks) {
  const out = [];
  for (const task of tasks) {
    const indexed = storageEntryForUrl(task.outputUrl);
    const availableRemotely = indexed && indexed.storageSpaceId !== 'primary' && Number(indexed.size) > 0;
    if (task.status === 'success' && (availableRemotely || await isUsableImage(task.outputPath))) continue;
    if (await isUsableImage(task.outputPath)) {
      task.status = 'success';
      task.outputUrl = outputUrl(task.outputPath);
      continue;
    }
    if (availableRemotely) {
      task.status = 'success';
      continue;
    }
    out.push(task);
  }
  return out;
}

async function rememberHistory(job, user) {
  const urls = job.tasks
    .filter((task) => task.status === 'success')
    .map((task) => ({
      url: task.outputUrl,
      kind: 'image',
      taskId: job.id,
      prompt: task.prompt || job.request.prompt,
    }));
  if (!urls.length) return;
  try { await addGeneratedHistoryItems(urls, { ...job.request.historyContext, prompt: job.request.prompt, provider: 'FHL Images', model: 'gpt-image-2', taskId: job.id }, user); }
  catch (error) { console.warn('[fhl-image] generation history failed:', error?.message || error); }
  const outputCount = Math.max(0, urls.length - Number(job.monitoringBaselineSuccess || 0));
  if (job.monitoringRunId && outputCount > 0) finishRun(job.monitoringRunId, { outcome: 'success', outputCount });
}

async function executeJob(job, user, resume = false) {
  if (activeJobs.has(job.id)) return;
  const controller = new AbortController();
  activeJobs.set(job.id, controller);
  job.status = 'running'; job.error = '';
  if (!resume || !job.tasks?.length) job.tasks = buildTasks(job);
  await incompleteTasks(job.tasks);
  persist(job);
  if (job.request.dryRun) {
    job.status = 'completed'; writeArtifacts(job); persist(job); activeJobs.delete(job.id); return;
  }
  try {
    let queue = await incompleteTasks(job.tasks);
    const isCombined = job.request.mode === 'edit' && job.request.fixedImages.length > 1;
    const startedAt = new Date().toISOString();
    if (queue.length) {
      const report = await runWorkerQueue(readWorkers(), queue, {
        concurrency: isCombined ? 1 : job.request.concurrency,
        stickyGroups: job.request.mode === 'workflow-batch-edit',
        adaptive: job.request.adaptive,
        signal: controller.signal,
        runTask: (worker, task) => requestImage(worker, task, { signal: controller.signal, baseUrl: `http://127.0.0.1:${config.PORT}` }),
        onUpdate: ({ type, state }) => { const task = queue[state.index]; if (task) { task.status = type === 'start' ? 'running' : task.status; task.attempts = state.attempts; task.retries = state.retries; } persist(job); },
      });
      applyReport(job, queue, report);
      job.sessions.push({ label: resume ? 'resume' : 'main', startedAt, endedAt: new Date().toISOString(), success: report.success, failed: report.failed, cancelled: report.cancelled, workerStats: report.workerStats });
      writeArtifacts(job, true); persist(job);
    }
    if (job.request.mode === 'workflow-batch-edit' && !controller.signal.aborted) {
      for (let pass = 1; pass <= job.request.repairPasses; pass += 1) {
        queue = await incompleteTasks(job.tasks);
        if (!queue.length) break;
        const passStarted = new Date().toISOString();
        const report = await runWorkerQueue(readWorkers(), queue, {
          concurrency: 1, adaptive: job.request.adaptive, signal: controller.signal,
          runTask: (worker, task) => requestImage(worker, task, { signal: controller.signal, baseUrl: `http://127.0.0.1:${config.PORT}` }),
        });
        applyReport(job, queue, report);
        job.sessions.push({ label: `repair-${pass}`, startedAt: passStarted, endedAt: new Date().toISOString(), success: report.success, failed: report.failed, cancelled: report.cancelled, workerStats: report.workerStats });
        writeArtifacts(job, true); persist(job);
        if (controller.signal.aborted) break;
      }
    }
    const terminalStatus = controller.signal.aborted ? 'cancelled' : (job.tasks.some((task) => task.status === 'failed') ? 'partial' : 'completed');
    await rememberHistory(job, user);
    job.status = terminalStatus;
    writeArtifacts(job); persist(job);
    if (job.monitoringRunId && controller.signal.aborted) finishRun(job.monitoringRunId, { outcome: 'cancelled' });
    if (job.monitoringRunId && !job.tasks.some((task) => task.status === 'success')) finishRun(job.monitoringRunId, { outcome: 'upstream_failure' });
  } catch (error) {
    job.status = controller.signal.aborted ? 'cancelled' : 'failed';
    job.error = error?.message || String(error);
    writeArtifacts(job); persist(job);
    if (job.monitoringRunId) finishRun(job.monitoringRunId, { outcome: controller.signal.aborted ? 'cancelled' : 'excluded' });
  } finally {
    activeJobs.delete(job.id);
  }
}

router.get('/config', (_req, res) => res.json({ success: true, data: workerSummary() }));

router.post('/workers', requireAdmin, (req, res) => {
  const current = readWorkers();
  if (current.length >= MAX_WORKERS) return res.status(400).json({ success: false, error: 'FHL worker 最多 10 个。' });
  const key = cleanText(req.body?.apiKey, 4096);
  if (!key) return res.status(400).json({ success: false, error: '请输入 FHL API Key。' });
  if (current.some((item) => item.apiKey === key)) return res.status(409).json({ success: false, error: '该 Key 已存在。' });
  const id = `worker-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  writeWorkers([...current, { id, name: cleanText(req.body?.name, 80) || `worker ${current.length + 1}`, apiKey: key, enabled: req.body?.enabled !== false, createdAt: new Date().toISOString() }]);
  return res.json({ success: true, data: workerSummary() });
});

router.patch('/workers/:id', requireAdmin, (req, res) => {
  const current = readWorkers();
  const index = current.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ success: false, error: 'Worker 不存在。' });
  const next = current.map((item, i) => i === index ? { ...item, name: req.body?.name == null ? item.name : cleanText(req.body.name, 80), apiKey: req.body?.apiKey == null ? item.apiKey : req.body.apiKey, enabled: req.body?.enabled == null ? item.enabled : req.body.enabled !== false } : item);
  writeWorkers(next);
  return res.json({ success: true, data: workerSummary() });
});

router.delete('/workers/:id', requireAdmin, (req, res) => {
  writeWorkers(readWorkers().filter((item) => item.id !== req.params.id));
  return res.json({ success: true, data: workerSummary() });
});

router.post('/workers/import-codex', requireAdmin, (_req, res) => {
  const source = path.join(os.homedir(), '.codex', 'fhl-image-gen-config.json');
  if (!fs.existsSync(source)) return res.status(404).json({ success: false, error: '未找到 Codex FHL 插件配置。' });
  let raw;
  try { raw = JSON.parse(fs.readFileSync(source, 'utf8')); }
  catch { return res.status(400).json({ success: false, error: 'Codex FHL 插件配置无法读取。' }); }
  const imported = (Array.isArray(raw?.workers) ? raw.workers : []).filter((item) => !item?.provider || item.provider === 'fhl');
  const current = readWorkers();
  const keys = new Set(current.map((item) => item.apiKey));
  const merged = [...current];
  for (const worker of imported) {
    if (merged.length >= MAX_WORKERS) break;
    const key = cleanText(worker?.apiKey, 4096);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    merged.push({ id: `worker-${Date.now().toString(36)}-${merged.length + 1}`, name: cleanText(worker.name, 80) || `worker ${merged.length + 1}`, apiKey: key, enabled: worker.enabled !== false, createdAt: cleanText(worker.createdAt, 64) || new Date().toISOString() });
  }
  writeWorkers(merged);
  return res.json({ success: true, data: { ...workerSummary(), importedCount: merged.length - current.length } });
});

router.post('/jobs', (req, res) => {
  try {
    const request = normalizeRequest(req.body || {});
    if (!request.dryRun && !readWorkers().some((item) => item.enabled !== false)) return res.status(400).json({ success: false, error: '请先在 API 设置中配置并启用 FHL worker。' });
    const id = `fhl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const monitoringRunId = request.dryRun ? '' : startRun({
      runId: request.historyContext?.generationRunId || createRunId('fhl-image'),
      user: req.user,
      provider: 'FHL Images',
      model: 'gpt-image-2',
      nodeType: request.historyContext?.sourceNodeType || 'fhl-image-gen',
    }).runId;
    const job = { id, userId: String(req.user?.id || ''), monitoringRunId, monitoringBaselineSuccess: 0, request, status: 'queued', error: '', tasks: [], workerStats: [], sessions: [], artifactUrls: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    jobs.set(id, job); persist(job); setImmediate(() => executeJob(job, req.user));
    return res.json({ success: true, data: snapshot(job) });
  } catch (error) {
    return res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'FHL 任务不存在或已清理。' });
  if (!canAccessJob(job, req.user)) return res.status(403).json({ success: false, error: '无权访问该 FHL 任务。' });
  return res.json({ success: true, data: snapshot(job) });
});

router.post('/jobs/:id/cancel', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'FHL 任务不存在。' });
  if (!canAccessJob(job, req.user)) return res.status(403).json({ success: false, error: '无权停止该 FHL 任务。' });
  activeJobs.get(job.id)?.abort();
  job.status = 'cancelled'; persist(job);
  if (job.monitoringRunId) finishRun(job.monitoringRunId, { outcome: 'cancelled' });
  return res.json({ success: true, data: snapshot(job) });
});

router.post('/jobs/:id/resume', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'FHL 任务不存在。' });
  if (!canAccessJob(job, req.user)) return res.status(403).json({ success: false, error: '无权恢复该 FHL 任务。' });
  if (activeJobs.has(job.id)) return res.status(409).json({ success: false, error: '任务正在运行。' });
  job.monitoringBaselineSuccess = job.tasks.filter((task) => task.status === 'success').length;
  job.monitoringRunId = startRun({
    runId: createRunId('fhl-image-resume'),
    user: req.user,
    provider: 'FHL Images',
    model: 'gpt-image-2',
    nodeType: job.request.historyContext?.sourceNodeType || 'fhl-image-gen',
  }).runId;
  job.status = 'queued'; job.error = ''; persist(job); setImmediate(() => executeJob(job, req.user, true));
  return res.json({ success: true, data: snapshot(job) });
});

loadJobs();

module.exports = router;
module.exports._test = { normalizeRequest, buildTasks, snapshot, writeArtifacts, NAIL_TEMPLATES };
