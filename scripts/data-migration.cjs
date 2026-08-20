'use strict';

/**
 * Read-only audit and conservative migration helper for a T8 userdata export.
 *
 *   node scripts/data-migration.cjs audit --root <dir> --out <manifest.json>
 *   node scripts/data-migration.cjs migrate --source <dir> --target <dir> [--apply]
 *
 * Migration never deletes destination files. Existing files are skipped unless
 * --overwrite is supplied; overwritten files are copied to a dated backup.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRS = ['data', 'input', 'output', 'thumbnails', 'cam-output'];
const LEGACY_DIRS = ['resources', 'theme-templates', 'T8-penguin-canvas'];
const SKIP_FILES = new Set(['auth_sessions.json']);
const WINDOWS_ROOT_RE = /^[a-z]:[\\/]zhenzhen(?:[\\/]|$)/i;
const OLD_MEDIA_RE = /^https?:\/\/canvas\.chinaemuseum\.com(\/.*)$/i;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) { out._.push(item); continue; }
    const key = item.slice(2);
    if (key === 'apply' || key === 'overwrite' || key === 'preserve-active-storage') out[key] = true;
    else { out[key] = argv[i + 1]; i += 1; }
  }
  return out;
}

function required(options, name) {
  const value = String(options[name] || '').trim();
  if (!value) throw new Error(`缺少 --${name}`);
  return path.resolve(value);
}

function walk(root, current = root, out = []) {
  if (!fs.existsSync(current)) return out;
  const entries = fs.readdirSync(current, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(current, entry.name);
    if (entry.isDirectory()) walk(root, file, out);
    else if (entry.isFile()) out.push(file);
  }
  return out;
}

function digest(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function audit(root) {
  const files = [];
  for (const dir of [...DATA_DIRS, ...LEGACY_DIRS]) {
    const base = path.join(root, dir);
    for (const file of walk(root, base)) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      const stat = fs.statSync(file);
      files.push({ path: rel, bytes: stat.size, sha256: digest(file) });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    root,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
}

function parseJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function rewriteString(value, options, report) {
  if (typeof value !== 'string') return value;
  let next = value;
  const media = OLD_MEDIA_RE.exec(next);
  if (media && /^(?:\/(?:files|input|output|api\/resources)\b)/i.test(media[1])) {
    next = media[1];
    report.mediaUrls += 1;
  }
  if (WINDOWS_ROOT_RE.test(next)) {
    const suffix = next.slice('C:\\zhenzhen'.length).replace(/\\/g, '/').replace(/^\/+/, '');
    next = `${options.containerUserdata}/zhenzhen${suffix ? `/${suffix}` : ''}`.replace(/\/+/g, '/');
    report.windowsPaths += 1;
  }
  return next;
}

function rewriteJson(value, options, report, key = '') {
  if (typeof value === 'string') {
    const next = rewriteString(value, options, report);
    if (/webdavurl/i.test(key) && options.webdavUrl) return options.webdavUrl;
    return next;
  }
  if (Array.isArray(value)) return value.map((item) => rewriteJson(item, options, report, key));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [field, item] of Object.entries(value)) next[field] = rewriteJson(item, options, report, field);
  if (key === '' && !options.preserveActiveStorage && Object.prototype.hasOwnProperty.call(next, 'activeOutputStorageSpaceId')) {
    next.activeOutputStorageSpaceId = 'primary';
    report.activeStorageReset = true;
  }
  return next;
}

function copyFile(source, target, options, report) {
  const existing = fs.existsSync(target);
  if (existing && !options.overwrite) { report.skipped += 1; return; }
  if (existing && options.overwrite) {
    const backup = path.join(options.backupRoot, path.relative(options.target, target));
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
    report.backups += 1;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const isJson = path.extname(source).toLowerCase() === '.json' && path.basename(source) !== 'auth_sessions.json';
  if (isJson) {
    const parsed = parseJson(source);
    if (parsed !== null) {
      const transformed = rewriteJson(parsed, options, report);
      fs.writeFileSync(target, `${JSON.stringify(transformed, null, 2)}\n`, 'utf8');
    } else fs.copyFileSync(source, target);
  } else fs.copyFileSync(source, target);
  report.copied += 1;
}

function migrate(source, target, options) {
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source,
    target,
    dryRun: !options.apply,
    copied: 0,
    skipped: 0,
    backups: 0,
    windowsPaths: 0,
    mediaUrls: 0,
    activeStorageReset: false,
    files: [],
  };
  const backupRoot = path.join(target, `.migration-backups-${Date.now()}`);
  options.target = target;
  options.backupRoot = backupRoot;
  for (const dir of DATA_DIRS) {
    for (const file of walk(source, path.join(source, dir))) {
      if (SKIP_FILES.has(path.basename(file))) continue;
      const rel = path.relative(source, file);
      const destination = path.join(target, rel);
      report.files.push(rel.split(path.sep).join('/'));
      if (options.apply) copyFile(file, destination, options, report);
    }
  }
  // The old Windows defaults put the resource library and autosave tree under
  // C:\zhenzhen; keep that namespace under the container's userdata mount.
  for (const dir of LEGACY_DIRS) {
    for (const file of walk(source, path.join(source, dir))) {
      if (SKIP_FILES.has(path.basename(file))) continue;
      const rel = path.join('zhenzhen', dir, path.relative(path.join(source, dir), file));
      const destination = path.join(target, rel);
      report.files.push(rel.split(path.sep).join('/'));
      if (options.apply) copyFile(file, destination, options, report);
    }
  }
  if (!options.apply) report.nextStep = 'review this report, then rerun with --apply';
  else if (report.backups === 0 && fs.existsSync(backupRoot)) fs.rmSync(backupRoot, { recursive: true, force: true });
  return report;
}

function main() {
  const options = args(process.argv.slice(2));
  const command = options._[0];
  if (!['audit', 'migrate'].includes(command)) throw new Error('用法：audit 或 migrate');
  if (command === 'audit') {
    const root = required(options, 'root');
    const output = required(options, 'out');
    const result = audit(root);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`audit: ${result.fileCount} files, ${result.totalBytes} bytes -> ${output}`);
    return;
  }
  const source = required(options, 'source');
  const target = required(options, 'target');
  const result = migrate(source, target, {
    apply: !!options.apply,
    overwrite: !!options.overwrite,
    preserveActiveStorage: !!options['preserve-active-storage'],
    containerUserdata: String(options['container-userdata'] || '/app/userdata').replace(/\/$/, ''),
    webdavUrl: String(options['webdav-url'] || '').trim(),
  });
  const output = path.resolve(String(options.report || path.join(process.cwd(), 'migration-report.json')));
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`${result.dryRun ? 'dry-run' : 'migrate'}: ${result.copied} copied, ${result.skipped} skipped -> ${output}`);
}

try { main(); } catch (error) { console.error(error.message || error); process.exitCode = 1; }
