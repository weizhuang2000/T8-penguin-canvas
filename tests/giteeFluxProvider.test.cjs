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

test('Gitee Flux normalizes unsupported aspect-ratio sizes to an official square size', () => {
  assert.equal(giteeFlux.normalizeImageSize('1344x768'), '1024x1024');
  assert.equal(giteeFlux.normalizeImageSize('1536*1536'), '1536x1536');
  assert.equal(giteeFlux.normalizeImageSize('2048x2048'), '2048x2048');
});

test('Gitee Flux validates token before submitting', async () => {
  const result = await giteeFlux.generateImage({ id: 'gitee-flux', protocol: 'gitee-flux', baseUrl: 'https://ai.gitee.com/v1' }, { prompt: 'test' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'missing_api_key');
});

test('Gitee ACE-Step submits async music task and resolves audio result', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith('/async/music/generations')) return response(200, { task_id: 'music-task-1', status: 'waiting' });
    if (url.endsWith('/task/music-task-1')) {
      return response(200, { task_id: 'music-task-1', status: 'success', output: { file_url: 'https://cdn.example/ace-step.wav' } });
    }
    return response(404, { message: 'not found' });
  };

  const result = await giteeFlux.generateMusic({
    id: 'gitee-flux', protocol: 'gitee-flux', baseUrl: 'https://ai.gitee.com/v1', apiKey: 'token',
  }, {
    prompt: 'pop, synth, drums, 120 bpm, upbeat, female vocals',
    lyrics: '[Verse]\nHello world',
    duration: 90,
    seed: 42,
    infer_steps: 27,
    scheduler_type: 'heun',
    cfg_type: 'cfg_star',
  }, {
    fetchImpl,
    pollIntervalMs: 1,
    timeoutMs: 1000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.audioUrls, ['https://cdn.example/ace-step.wav']);
  assert.equal(calls[0].body.model, 'ACE-Step-v1-3.5B');
  assert.equal(calls[0].body.task, 'text2music');
  assert.equal(calls[0].body.duration, 90);
  assert.equal(calls[0].body.infer_steps, 27);
  assert.deepEqual(calls[0].body.seeds, [42]);
  assert.equal(calls[0].body.scheduler_type, 'heun');
  assert.equal(calls[0].body.cfg_type, 'cfg_star');
});
