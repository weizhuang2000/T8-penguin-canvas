const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const read = (file) => fs.readFileSync(file, 'utf8');

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const close = (server) => new Promise((resolve) => server.close(resolve));

test('PPT entry is placed before web image editor and uses /ppt route', () => {
  const app = read('src/App.tsx');
  const pptIndex = app.indexOf('打开 PPT 工作区');
  const imageIndex = app.indexOf('打开网页版改图');
  assert.ok(pptIndex >= 0);
  assert.ok(imageIndex >= 0);
  assert.ok(pptIndex < imageIndex);
  assert.match(app, /const pptRoute = appPath === '\/ppt'/);
  assert.match(app, /PptWebApp/);
});

test('PPT proxy requires T8 auth and forwards only server-issued identity headers', () => {
  const proxy = read('backend/src/routes/pptProxy.js');
  assert.match(proxy, /router\.use\(requireAuth\)/);
  assert.match(proxy, /x-t8-ppt-internal-secret/);
  assert.match(proxy, /x-t8-user-id/);
  assert.match(proxy, /delete headers\[key\]/);
  assert.match(proxy, /Buffer\.from\(JSON\.stringify\(req\.body\)\)/);
  assert.match(proxy, /headers\['content-length'\] = String\(body\.length\)/);
  assert.match(proxy, /if \(body\) upstream\.end\(body\)/);
});

test('PPT proxy replays JSON consumed by the global Express parser', async () => {
  let received = '';
  const upstreamServer = http.createServer((req, res) => {
    req.setEncoding('utf8');
    req.on('data', (chunk) => { received += chunk; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const upstreamPort = await listen(upstreamServer);

  const authPath = require.resolve('../backend/src/auth/middleware');
  const managerPath = require.resolve('../backend/src/pptServiceManager');
  const proxyPath = require.resolve('../backend/src/routes/pptProxy');
  const authOriginal = require(authPath);
  const managerOriginal = require(managerPath);
  require.cache[authPath].exports = {
    ...authOriginal,
    requireAuth(req, _res, next) {
      req.user = { id: 'u1', username: 'tester', email: '', name: 'Tester', role: 'designer' };
      next();
    },
  };
  require.cache[managerPath].exports = {
    ...managerOriginal,
    serviceUrl: () => `http://127.0.0.1:${upstreamPort}`,
    getPptServiceState: () => ({ running: true }),
  };
  delete require.cache[proxyPath];

  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/ppt', require(proxyPath));
  const proxyServer = http.createServer(app);
  const proxyPort = await listen(proxyServer);

  try {
    const payload = JSON.stringify({ action: 'requirements_submit', patch: { page_count: 8 } });
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: proxyPort,
        path: '/api/ppt/conversations/test/draft',
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end(payload);
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(received), JSON.parse(payload));
  } finally {
    await close(proxyServer);
    await close(upstreamServer);
    require.cache[authPath].exports = authOriginal;
    require.cache[managerPath].exports = managerOriginal;
    delete require.cache[proxyPath];
  }
});

test('Codex runner relies on its per-job Docker container instead of nested bwrap', () => {
  const runner = read('integrations/ppt-web/docker/ppt-runner/entrypoint.sh');
  assert.match(runner, /exec --json/);
  assert.match(runner, /--dangerously-bypass-approvals-and-sandbox/);
  assert.doesNotMatch(runner, /--sandbox workspace-write/);
  assert.doesNotMatch(runner, /approval_policy=\"never\"/);
  assert.match(runner, /--skip-git-repo-check/);
  assert.equal((runner.match(/ARGS\+=\(--model/g) || []).length, 1);
});

test('Docker runner maps the container user to the bind-mounted project owner', () => {
  const runner = read('integrations/ppt-web/backend/runner/docker.py');
  assert.match(runner, /project_root\.stat\(\)/);
  assert.match(runner, /run_user = f\"\{st\.st_uid\}:\{st\.st_gid\}\"/);
  assert.match(runner, /cmd\.extend\(\[\"--user\", run_user\]\)/);
});

test('PPT runner redirects ppt-master fallback projects into the mounted workspace', () => {
  const dockerfile = read('integrations/ppt-web/docker/ppt-runner/Dockerfile');
  assert.match(dockerfile, /ln -s \/work\/projects \/opt\/ppt-master\/projects/);
});

test('PPT workspace defines its own foreground under the host theme', () => {
  const styles = read('integrations/ppt-web/ui/src/index.css');
  assert.match(
    styles,
    /\.ppt-web-root\s*\{[^}]*color:\s*var\(--ds-text\)[^}]*background:\s*var\(--ds-page-bg\)[^}]*color-scheme:\s*light/s,
  );
});

test('Chat completion card uses the working PPTX endpoint and opens the slide modal', () => {
  const card = read('integrations/ppt-web/ui/src/components/chat/widgets/DownloadCard.tsx');
  assert.match(card, /downloadUrl\(`\/api\/jobs\/\$\{jobId\}\/pptx`/);
  assert.doesNotMatch(card, /\/download`/);
  assert.match(card, /<SlidePreviewModal/);
  assert.match(card, /setPreviewOpen\(true\)/);
  assert.doesNotMatch(card, /to=\{`\/jobs\/\$\{jobId\}`\}/);
});
