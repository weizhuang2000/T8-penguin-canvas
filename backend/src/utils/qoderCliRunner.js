'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const config = require('../config');

const QODER_DISABLED_MESSAGE = 'Qoder CLI 运行时不可用：请确认已安装并登录 Qoder CLI，或在节点设置中填写 qodercli 可执行文件路径。';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeSegment(value, fallback = 'item') {
  const cleaned = String(value || '').trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function assertInside(baseDir, filePath) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(filePath);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Qoder 素材路径不在允许目录内。');
  }
  return resolved;
}

function createQoderWorkspace(options = {}) {
  const nodeId = safeSegment(options.nodeId || 'qoder-image-node');
  const sessionId = safeSegment(options.sessionId || `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
  const dir = path.join(config.DATA_DIR, 'qoder-workspaces', nodeId, sessionId);
  const inputDir = path.join(dir, 'inputs');
  const outputDir = path.join(dir, 'outputs');
  const configDir = path.join(dir, 'config');
  [dir, inputDir, outputDir, configDir].forEach(ensureDir);
  return { dir, inputDir, outputDir, configDir, nodeId, sessionId };
}

function uniquePush(list, value) {
  const text = String(value || '').trim();
  if (text && !list.includes(text)) list.push(text);
}

function pathEnvValue(env = process.env) {
  return String(env.PATH || env.Path || env.path || '');
}

function qoderWindowsCandidates(env = process.env) {
  const home = String(env.USERPROFILE || env.HOME || os.homedir() || '').trim();
  if (!home) return [];
  return [
    path.join(home, '.qoder', 'bin', 'qodercli', 'qodercli.exe'),
    path.join(home, '.qoder', 'bin', 'qodercli.exe'),
  ].filter((file) => fs.existsSync(file));
}

function findQoderCandidates(command, options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const requested = String(command || '').trim();
  const candidates = [];
  if (requested) uniquePush(candidates, requested);
  if (!requested) {
    uniquePush(candidates, env.T8_QODER_CLI_PATH);
    uniquePush(candidates, env.QODER_CLI_PATH);
  }
  if (platform === 'win32') {
    qoderWindowsCandidates(env).forEach((file) => uniquePush(candidates, file));
    for (const dir of pathEnvValue(env).split(path.delimiter).filter(Boolean)) {
      ['qodercli.exe', 'qodercli.cmd', 'qodercli.bat'].forEach((name) => {
        const file = path.join(dir, name);
        if (fs.existsSync(file)) uniquePush(candidates, file);
      });
    }
  }
  uniquePush(candidates, 'qodercli');
  return candidates;
}

function resolveQoderExecutable(options = {}) {
  const candidates = findQoderCandidates(options.executablePath, options);
  const executable = candidates.find((candidate) => {
    if (!/[\\/]/.test(candidate)) return true;
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  }) || candidates[0] || 'qodercli';
  return {
    executable,
    candidates,
    shell: (options.platform || process.platform) === 'win32' && /\.(?:cmd|bat)$/i.test(executable),
  };
}

function spawnQoder(args, options = {}) {
  const resolved = resolveQoderExecutable(options);
  const child = spawn(resolved.executable, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    windowsHide: true,
    shell: resolved.shell,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.__qoderResolved = resolved;
  return child;
}

function runQoderCommand(args, options = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      child = spawnQoder(args, options);
    } catch (error) {
      finish({ code: -1, stdout, stderr: error?.message || String(error), executable: options.executablePath || 'qodercli' });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      finish({ code: -1, stdout, stderr: stderr || 'Qoder CLI 命令超时', executable: child.__qoderResolved?.executable });
    }, Number(options.timeoutMs) || 15000);
    timer.unref?.();
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ code: -1, stdout, stderr: error?.message || String(error), executable: child.__qoderResolved?.executable });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ code: Number(code) || 0, stdout, stderr, executable: child.__qoderResolved?.executable });
    });
  });
}

function resolveCanvasFileUrlToPath(value) {
  const clean = String(value || '').trim().split('?')[0].split('#')[0];
  const mounts = [
    { prefix: '/files/input/', dir: config.INPUT_DIR },
    { prefix: '/input/', dir: config.INPUT_DIR },
    { prefix: '/files/output/', dir: config.OUTPUT_DIR },
    { prefix: '/output/', dir: config.OUTPUT_DIR },
    { prefix: '/files/thumbnails/', dir: config.THUMBNAILS_DIR },
  ];
  const mount = mounts.find((item) => clean.startsWith(item.prefix));
  if (!mount) {
    if (/^\/api\/resources\/(?:file|set-file)\//.test(clean)) {
      try {
        return require('../routes/resources').resolveResourceFilePath(clean) || '';
      } catch {
        return '';
      }
    }
    return '';
  }
  const resolved = assertInside(mount.dir, path.join(mount.dir, decodeURIComponent(clean.slice(mount.prefix.length))));
  return fs.existsSync(resolved) ? resolved : '';
}

function safeImageExtension(value, fallback = '.png') {
  const ext = path.extname(String(value || '').split(/[?#]/)[0]).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext) ? ext : fallback;
}

function isPrivateRemoteHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '::1' || host === '0.0.0.0'
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

async function materializeQoderAttachments(images, workspace, options = {}) {
  const out = [];
  const seen = new Set();
  let index = 0;
  for (const raw of Array.isArray(images) ? images : []) {
    const text = String(raw || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    index += 1;
    let source = resolveCanvasFileUrlToPath(text);
    let buffer = null;
    let ext = safeImageExtension(text);
    const dataMatch = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,(.+)$/i.exec(text);
    if (!source && dataMatch) {
      ext = `.${dataMatch[1].toLowerCase().replace('jpeg', 'jpg')}`;
      buffer = Buffer.from(dataMatch[2], 'base64');
    }
    if (!source && !buffer && /^https?:\/\//i.test(text)) {
      const url = new URL(text);
      if (isPrivateRemoteHost(url.hostname)) throw new Error('不允许把本机或内网 URL 作为 Qoder 远程附件。');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs) || 30000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`下载 Qoder 参考图失败：HTTP ${response.status}`);
        buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 30 * 1024 * 1024) throw new Error('Qoder 参考图超过 30MB。');
      } finally {
        clearTimeout(timer);
      }
    }
    if (!source && !buffer && path.isAbsolute(text) && fs.existsSync(text)) source = path.resolve(text);
    if (!source && !buffer) continue;
    const target = path.join(workspace.inputDir, `reference-${index}${ext}`);
    if (buffer) fs.writeFileSync(target, buffer);
    else fs.copyFileSync(source, target);
    out.push(target);
  }
  return out;
}

function parseQoderJsonLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { type: 'raw', text }; }
}

function extractQoderTextDelta(event) {
  if (!event || typeof event !== 'object') return '';
  const delta = event.event?.delta || event.delta;
  if (delta?.type === 'text_delta' && typeof delta.text === 'string') return delta.text;
  if (typeof delta === 'string') return delta;
  if (typeof event.text === 'string' && ['assistant', 'message', 'message.delta', 'raw'].includes(String(event.type || ''))) return event.text;
  if (typeof event.result === 'string') return event.result;
  const content = event.message?.content || event.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((item) => item?.type === 'text').map((item) => item.text || '').join('');
  return '';
}

function buildQoderArgs(options = {}) {
  const args = [
    '--cwd', options.workspaceDir,
    '--output-format', 'stream-json',
    '--no-session-persistence',
    '--mcp-config', options.mcpConfigPath,
    '--strict-mcp-config',
    '--tools', '',
    '--allowed-tools', 'mcp__t8-image__generate_image',
  ];
  if (String(options.model || '').trim()) args.push('-m', String(options.model).trim());
  for (const file of options.attachments || []) args.push('--attachment', file);
  args.push('-p', String(options.prompt || ''));
  return args;
}

function runQoderImageStream(body = {}, handlers = {}) {
  return new Promise(async (resolve, reject) => {
    const workspace = createQoderWorkspace({ nodeId: body.nodeId, sessionId: body.sessionId });
    let attachments;
    try {
      attachments = await materializeQoderAttachments(body.images, workspace);
      const mcpConfigPath = path.join(workspace.configDir, 'mcp.json');
      fs.writeFileSync(mcpConfigPath, JSON.stringify({
        mcpServers: {
          't8-image': {
            type: 'http',
            url: body.bridgeUrl,
            headers: { Authorization: `Bearer ${body.bridgeToken}` },
          },
        },
      }, null, 2), 'utf8');
      const args = buildQoderArgs({
        workspaceDir: workspace.dir,
        mcpConfigPath,
        attachments,
        model: body.model,
        prompt: body.prompt,
      });
      const child = spawnQoder(args, { executablePath: body.executablePath, cwd: workspace.dir });
      let fullText = '';
      let stderr = '';
      let pending = '';
      let finished = false;
      const abort = () => {
        if (finished) return;
        try { child.kill(); } catch { /* ignore */ }
      };
      if (handlers.signal) {
        if (handlers.signal.aborted) abort();
        else handlers.signal.addEventListener('abort', abort, { once: true });
      }
      child.stdout?.on('data', (chunk) => {
        pending += chunk.toString('utf8');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) {
          const event = parseQoderJsonLine(line);
          if (!event) continue;
          const delta = extractQoderTextDelta(event);
          if (delta) {
            fullText += delta;
            handlers.onDelta?.(delta, event);
          }
          handlers.onEvent?.(event);
          const type = String(event.type || event.event?.type || '');
          if (/tool|mcp/i.test(type)) handlers.onProgress?.('Qoder 正在调用扩展平台生图工具…', event);
        }
      });
      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stderr += text;
        if (text.trim()) handlers.onProgress?.(text.trim(), { type: 'stderr' });
      });
      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        finished = true;
        if (handlers.signal) handlers.signal.removeEventListener('abort', abort);
        if (pending.trim()) {
          const event = parseQoderJsonLine(pending);
          const delta = extractQoderTextDelta(event);
          if (delta) fullText += delta;
        }
        if (handlers.signal?.aborted) {
          const error = new Error('Qoder 生图任务已取消。');
          error.name = 'AbortError';
          reject(error);
          return;
        }
        if (Number(code) !== 0) {
          const error = new Error(stderr.trim() || `Qoder CLI 退出码 ${code}`);
          error.code = 'qoder_cli_failed';
          error.executable = child.__qoderResolved?.executable;
          reject(error);
          return;
        }
        resolve({
          text: fullText.trim(),
          reply: fullText.trim(),
          workspace: workspace.dir,
          executable: child.__qoderResolved?.executable,
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function probeQoderStatus(options = {}) {
  const version = await runQoderCommand(['--version'], {
    executablePath: options.executablePath,
    env: options.env,
    platform: options.platform,
    timeoutMs: options.timeoutMs || 12000,
  });
  if (version.code !== 0) {
    return {
      available: false,
      executable: version.executable || options.executablePath || 'qodercli',
      message: `${QODER_DISABLED_MESSAGE} ${version.stderr || ''}`.trim(),
    };
  }
  return {
    available: true,
    executable: version.executable,
    version: version.stdout.trim(),
    message: `Qoder CLI ${version.stdout.trim()} 可用`,
  };
}

module.exports = {
  QODER_DISABLED_MESSAGE,
  buildQoderArgs,
  createQoderWorkspace,
  extractQoderTextDelta,
  findQoderCandidates,
  materializeQoderAttachments,
  parseQoderJsonLine,
  probeQoderStatus,
  resolveQoderExecutable,
  runQoderImageStream,
  qoderWindowsCandidates,
};
