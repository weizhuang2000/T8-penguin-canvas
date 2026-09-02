'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const config = require('./config');
const { loadSettings } = require('./routes/settings');

let child = null;
let port = Number(process.env.T8_PPT_PORT || 18767);

function findFreePort(start) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(findFreePort(start + 1)));
    server.listen(start, '127.0.0.1', () => {
      const p = server.address().port;
      server.close(() => resolve(p));
    });
  });
}

function serviceUrl() {
  return String(process.env.T8_PPT_SERVICE_URL || '').trim() || `http://127.0.0.1:${port}`;
}

function selectedLlmConfig() {
  try {
    const settings = loadSettings({ persistMigrations: false }) || {};
    const items = Array.isArray(settings.llmConfigs) ? settings.llmConfigs : [];
    const selected = items.find((item) => item && item.isDefault) || items.find(Boolean);
    if (!selected) return null;
    const apiKey = String(selected.apiKey || '').trim();
    const baseUrl = String(selected.baseUrl || '').trim();
    const model = String(selected.model || '').trim();
    if (!apiKey || !baseUrl || !model) return null;
    return { apiKey, baseUrl, model };
  } catch (error) {
    console.warn('[ppt] unable to load LLM config:', error?.message || error);
    return null;
  }
}

async function startPptService() {
  if (process.env.T8_PPT_ENABLED === '0') return { enabled: false, url: serviceUrl() };
  if (process.env.T8_PPT_SERVICE_URL) return { enabled: true, external: true, url: serviceUrl() };
  if (child && !child.killed) return { enabled: true, url: serviceUrl() };
  port = await findFreePort(port);
  const python = String(process.env.T8_PPT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'));
  const configuredRoot = String(process.env.T8_PPT_PROJECT_DIR || '').trim();
  const bundledRoot = path.resolve(__dirname, '..', '..', 'integrations', 'ppt-web');
  const dataRootFallback = path.resolve(config.BASE_DIR, 'integrations', 'ppt-web');
  const projectRoot = configuredRoot || (fs.existsSync(bundledRoot) ? bundledRoot : dataRootFallback);
  const root = path.join(projectRoot, 'backend');
  const llm = selectedLlmConfig();
  const env = {
    ...process.env,
    PPT_WEB_ENV: process.env.PPT_WEB_ENV || 'development',
    T8_PPT_INTERNAL_SECRET: process.env.T8_PPT_INTERNAL_SECRET || require('crypto').randomBytes(32).toString('hex'),
    T8_PPT_DATA_DIR: process.env.T8_PPT_DATA_DIR || path.join(config.DATA_DIR, 'ppt-web'),
    T8_PPT_PORT: String(port),
    T8_PPT_CODEX_CLI_PATH: process.env.T8_PPT_CODEX_CLI_PATH || process.env.T8_CODEX_CLI_PATH || '',
    T8_PPT_CODEX_HOME: process.env.T8_PPT_CODEX_HOME || '',
    T8_PPT_CODEX_API_KEY: process.env.T8_PPT_CODEX_API_KEY || '',
    T8_PPT_CODEX_MODEL: llm?.model || process.env.T8_PPT_CODEX_MODEL || '',
    T8_PPT_CODEX_BASE_URL: llm?.baseUrl || process.env.T8_PPT_CODEX_BASE_URL || '',
    T8_PPT_CODEX_API_KEY: llm?.apiKey || process.env.T8_PPT_CODEX_API_KEY || '',
  };
  process.env.T8_PPT_INTERNAL_SECRET = env.T8_PPT_INTERNAL_SECRET;
  try {
    child = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: projectRoot,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (b) => console.log(`[ppt] ${b.toString().trim()}`));
    child.stderr?.on('data', (b) => console.warn(`[ppt] ${b.toString().trim()}`));
    child.on('error', (e) => console.warn('[ppt] service failed:', e.message));
    child.on('exit', (code) => { if (code) console.warn(`[ppt] service exited with code ${code}`); child = null; });
  } catch (error) {
    console.warn('[ppt] unable to start Python service:', error.message);
    child = null;
  }
  return { enabled: true, url: serviceUrl(), started: Boolean(child) };
}

function stopPptService() {
  if (!child) return;
  try { child.kill(); } catch (_) {}
  child = null;
}

function getPptServiceState() {
  return { enabled: process.env.T8_PPT_ENABLED !== '0', url: serviceUrl(), running: Boolean(child && !child.killed) };
}

module.exports = { startPptService, stopPptService, getPptServiceState, serviceUrl };
