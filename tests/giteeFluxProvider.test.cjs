const test = require('node:test');
const assert = require('node:assert/strict');

const giteeFlux = require('../backend/src/providers/giteeFlux');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test('Gitee Flux submits async task and resolves image result', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith('/async/images/generations')) return response(200, { task_id: 'task-1' });
    if (url.endsWith('/task/task-1/status')) return response(200, { status: 'success' });
    if (url.endsWith('/task/task-1/get')) return response(200, { output: { url: 'https://cdn.example/flux.png' } });
    return response(404, { message: 'not found' });
  };

  const result = await giteeFlux.generateImage({
    id: 'gitee-flux', protocol: 'gitee-flux', baseUrl: 'https://ai.gitee.com/v1', apiKey: 'token',
    imageModels: ['flux-1-schnell'], defaults: { imageModel: 'flux-1-schnell' },
  }, { prompt: 'a penguin in a red coat', size: '1024x1024', providerModel: 'flux-1-schnell' }, {
    fetchImpl,
    pollIntervalMs: 1,
    timeoutMs: 1000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ['https://cdn.example/flux.png']);
  assert.equal(calls[0].body.model, 'flux-1-schnell');
  assert.equal(calls[0].body.n, 1);
  assert.equal(calls[0].body.response_format, 'url');
});

test('Gitee Flux validates token before submitting', async () => {
  const result = await giteeFlux.generateImage({ id: 'gitee-flux', protocol: 'gitee-flux', baseUrl: 'https://ai.gitee.com/v1' }, { prompt: 'test' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'missing_api_key');
});
