import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const geminiCompatible = require('../backend/src/providers/geminiCompatible.js');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'image/png' },
    async arrayBuffer() {
      return Buffer.from('PNG');
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('Gemini compatible image generation uses banana-2 JSON generations payload', async () => {
  const calls = [];
  const provider = {
    id: 'gemini-compatible',
    protocol: 'gemini-compatible',
    baseUrl: 'https://ai.t8star.org/v1',
    apiKey: 'gm-secret',
    imageModels: ['nano-banana-2'],
  };

  const result = await geminiCompatible.generateImage(provider, {
    prompt: 'a wide scene',
    aspect_ratio: '16:9',
    image_size: '2K',
    size: '1344x768',
    seed: 123,
  }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({ data: [{ b64_json: 'UE5H', mime_type: 'image/png' }] });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ['data:image/png;base64,UE5H']);
  assert.equal(calls[0].url, 'https://ai.t8star.org/v1/images/generations?async=true');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer gm-secret');
  assert.equal(calls[0].body.size, undefined);
  assert.equal(calls[0].body.model, 'nano-banana-2');
  assert.equal(calls[0].body.aspect_ratio, '16:9');
  assert.equal(calls[0].body.image_size, '2K');
  assert.equal(calls[0].body.seed, 123);
});

test('Gemini compatible image edit uses banana-2 multipart edits payload', async () => {
  const calls = [];
  const provider = {
    id: 'gemini-compatible',
    protocol: 'gemini-compatible',
    baseUrl: 'https://ai.t8star.org/v1',
    apiKey: 'gm-secret',
    imageModels: ['nano-banana-2'],
  };

  const result = await geminiCompatible.generateImage(provider, {
    prompt: 'use reference',
    aspect_ratio: '9:16',
    image_size: '4K',
    images: ['data:image/png;base64,QUJD'],
  }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ images: [{ url: 'https://cdn.example.com/out.png' }] });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ['https://cdn.example.com/out.png']);
  assert.equal(calls[0].url, 'https://ai.t8star.org/v1/images/edits?async=true');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer gm-secret');
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
  assert.equal(calls[0].init.body.get('model'), 'nano-banana-2');
  assert.equal(calls[0].init.body.get('aspect_ratio'), '9:16');
  assert.equal(calls[0].init.body.get('image_size'), '4K');
  assert.equal(calls[0].init.body.getAll('image').length, 1);
});

test('Gemini compatible image generation polls async task results', async () => {
  const calls = [];
  const provider = {
    id: 'gemini-compatible',
    protocol: 'gemini-compatible',
    baseUrl: 'https://ai.t8star.org/v1/images',
    apiKey: 'gm-secret',
    imageModels: ['nano-banana-2'],
  };

  const result = await geminiCompatible.generateImage(provider, {
    prompt: 'async scene',
    aspect_ratio: '4:3',
    image_size: '1K',
  }, {
    maxPolls: 2,
    pollIntervalMs: 1,
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
      if (String(url).includes('/tasks/')) {
        return jsonResponse({ status: 'completed', data: [{ b64_json: 'VEFTSw==' }] });
      }
      return jsonResponse({ task_id: 'task-1' });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.taskId, 'task-1');
  assert.deepEqual(result.imageUrls, ['data:image/png;base64,VEFTSw==']);
  assert.equal(calls[0].url, 'https://ai.t8star.org/v1/images/generations?async=true');
  assert.equal(calls[1].url, 'https://ai.t8star.org/v1/images/tasks/task-1');
});

test('Gemini compatible retries legacy Gemini image model as nano-banana-2 on 400', async () => {
  const calls = [];
  const provider = {
    id: 'gemini-compatible',
    protocol: 'gemini-compatible',
    baseUrl: 'https://ai.t8star.org/v1',
    apiKey: 'gm-secret',
    imageModels: ['gemini-2.5-flash-image'],
  };

  const result = await geminiCompatible.generateImage(provider, {
    prompt: 'retry scene',
    aspect_ratio: '16:9',
    image_size: '2K',
  }, {
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (calls.length === 1) return jsonResponse({ error: { message: 'bad model' } }, 400);
      return jsonResponse({ data: [{ b64_json: 'UkVUUlk=' }] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.model, 'gemini-2.5-flash-image');
  assert.equal(calls[1].body.model, 'nano-banana-2');
});

test('Gemini compatible chat normalizes generateContent text', async () => {
  const provider = {
    id: 'gemini-compatible',
    protocol: 'gemini-compatible',
    baseUrl: 'https://ai.t8star.org/v1',
    apiKey: 'gm-secret',
    chatModels: ['gemini-2.5-flash'],
  };

  const result = await geminiCompatible.generateChat(provider, {
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0.2,
  }, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'hello' }] }]);
      assert.equal(body.generationConfig.temperature, 0.2);
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: 'hi' }] } }],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'hi');
});
