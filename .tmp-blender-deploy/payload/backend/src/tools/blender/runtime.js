'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VERSION_TIMEOUT_MS = 10_000;

function isExecutableFile(file) {
  try {
    return !!file && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function validExecutableName(file) {
  const name = path.basename(String(file || '')).toLowerCase();
  return process.platform === 'win32' ? name === 'blender.exe' : name === 'blender';
}

function probeExecutable(file) {
  const candidate = String(file || '').trim();
  if (!candidate || !validExecutableName(candidate) || !isExecutableFile(candidate)) return null;
  const result = spawnSync(candidate, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: VERSION_TIMEOUT_MS,
  });
  if (result.error || result.status !== 0) return null;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const match = output.match(/Blender\s+([0-9]+(?:\.[0-9]+){1,2})/i);
  if (!match) return null;
  return { installed: true, executable: path.resolve(candidate), version: match[1], rawVersion: output.split(/\r?\n/)[0] };
}

function windowsCandidates() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
    .filter(Boolean)
    .map((root) => path.join(root, 'Blender Foundation'));
  const out = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    entries
      .filter((entry) => entry.isDirectory() && /^Blender\s+/i.test(entry.name))
      .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
      .forEach((entry) => out.push(path.join(root, entry.name, 'blender.exe')));
  }
  return out;
}

function commandCandidates() {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(command, ['blender'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (result.error || result.status !== 0) return [];
  return String(result.stdout || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function commonCandidates() {
  if (process.platform === 'win32') return windowsCandidates();
  if (process.platform === 'darwin') return ['/Applications/Blender.app/Contents/MacOS/Blender'];
  return ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender'];
}

function resolveRuntime(overridePath = '') {
  const requested = String(overridePath || '').trim();
  if (requested) {
    const runtime = probeExecutable(requested);
    if (!runtime) return { installed: false, error: '指定路径不是可用的 Blender 可执行文件' };
    return { ...runtime, source: 'override' };
  }
  const candidates = [process.env.T8_BLENDER_BIN, ...commandCandidates(), ...commonCandidates()].filter(Boolean);
  const seen = new Set();
  for (const candidate of candidates) {
    const key = process.platform === 'win32' ? String(candidate).toLowerCase() : String(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    const runtime = probeExecutable(candidate);
    if (runtime) return { ...runtime, source: candidate === process.env.T8_BLENDER_BIN ? 'env' : 'detected' };
  }
  return { installed: false, error: '未检测到 Blender，请安装 Blender 4.3+ 或在节点中指定 blender 可执行文件路径' };
}

module.exports = { probeExecutable, resolveRuntime, validExecutableName };
