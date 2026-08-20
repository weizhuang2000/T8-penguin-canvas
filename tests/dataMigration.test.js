import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('data migration is conservative and rewrites deployment-specific values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't8-migration-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  fs.mkdirSync(path.join(source, 'data'), { recursive: true });
  fs.mkdirSync(path.join(source, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(source, 'data', 'settings.json'), JSON.stringify({
    fileSavePath: 'C:\\zhenzhen',
    resourceLibraryPath: 'C:\\zhenzhen\\resources',
    activeOutputStorageSpaceId: 'cloud-baidu-netdisk',
    cloudUploadTargets: [{ baiduNetdisk: { webdavUrl: 'http://old-host/dav/baidu' } }],
    canvasUrl: 'https://canvas.chinaemuseum.com/files/output/old.png',
  }));
  fs.writeFileSync(path.join(source, 'data', 'auth_sessions.json'), '{}');
  fs.writeFileSync(path.join(source, 'resources', 'library.json'), '{}');
  const report = path.join(root, 'migration-report.json');

  const result = spawnSync(process.execPath, [
    'scripts/data-migration.cjs', 'migrate', '--source', source, '--target', target,
    '--container-userdata', '/app/userdata', '--webdav-url', 'http://127.0.0.1:5244/dav/baidu', '--report', report, '--apply',
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const settings = JSON.parse(fs.readFileSync(path.join(target, 'data', 'settings.json'), 'utf8'));
  assert.equal(settings.fileSavePath, '/app/userdata/zhenzhen');
  assert.equal(settings.resourceLibraryPath, '/app/userdata/zhenzhen/resources');
  assert.equal(settings.activeOutputStorageSpaceId, 'primary');
  assert.equal(settings.cloudUploadTargets[0].baiduNetdisk.webdavUrl, 'http://127.0.0.1:5244/dav/baidu');
  assert.equal(settings.canvasUrl, '/files/output/old.png');
  assert.equal(fs.existsSync(path.join(target, 'data', 'auth_sessions.json')), false);
  assert.equal(fs.existsSync(path.join(target, 'zhenzhen', 'resources', 'library.json')), true);
  fs.rmSync(root, { recursive: true, force: true });
});
