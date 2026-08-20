import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('backend exposes HOST as an effective runtime setting', () => {
  const source = fs.readFileSync(path.join(root, 'backend/src/config.js'), 'utf8');
  assert.match(source, /\n\s*HOST:\s*process\.env\.HOST\s*\|\|\s*['"]127\.0\.0\.1['"],/);
});

test('Linux compose binds application and AList to loopback only', () => {
  const compose = fs.readFileSync(path.join(root, 'deploy/linux/docker-compose.production.yml'), 'utf8');
  assert.match(compose, /127\.0\.0\.1:18766:18766/);
  assert.match(compose, /127\.0\.0\.1:5244:5244/);
  assert.match(compose, /profiles:\s*\["baidu"\]/);
  assert.match(compose, /T8PC_COOKIE_SECURE:\s*"1"/);
});

test('production secret file is ignored while the example stays tracked', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /deploy\/linux\/\.env\.production/);
  assert.equal(fs.existsSync(path.join(root, 'deploy/linux/.env.production')), false);
  assert.equal(fs.existsSync(path.join(root, 'deploy/linux/.env.production.example')), true);
});

test('Nginx template preserves large uploads and media range proxying', () => {
  const nginx = fs.readFileSync(path.join(root, 'deploy/linux/nginx/canvas-new.conf'), 'utf8');
  assert.match(nginx, /client_max_body_size\s+100m/);
  assert.match(nginx, /proxy_request_buffering\s+off/);
  assert.match(nginx, /proxy_read_timeout\s+3600s/);
  assert.match(nginx, /proxy_pass\s+http:\/\/127\.0\.0\.1:18766/);
});
