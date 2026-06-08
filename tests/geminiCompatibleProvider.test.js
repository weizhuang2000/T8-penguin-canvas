import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const geminiCompatible = require('../backend/src/providers/geminiCompatible.js');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('Gemini compatible image generation uses generateContent responseFormat image options', async () => {
  const calls = [];
  const provider = {
    id: 'gemini-compatible',
    protocol: 'gemini-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    apiKey: 'gm-secret',
    imageModels: ['gemini-3.1-flash-image'],
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
      return jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: 'done' },
                { inlineData: { mimeType: 'image/png', data: 'UE5H' } },
              ],
            },
          },
        ],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ['data:image/png;base64,UE5H']);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent');
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'gm-secret');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].body.size, undefined);
  assert.deepEqual(calls[0].body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
  assert.deepEqual(calls[0].body.generationConfig.responseFormat, {
    type: 'IMAGE',
    image: {
      aspectRatio: '16:9',
      imageSize: '2K',
    },
  });
  assert.equal(calls[0].body.generationConfig.seed, 123);
});

test('Gemini 2.5 flash image omits unsupported imageSize while keeping aspectRatio', async () => {
  const calls = [];
  const provider = {
    id: 'gemini-compatible',
    protocol: 'gemini-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    apiKey: 'gm-secret',
    imageModels: ['gemini-2.5-flash-image'],
  };

  const result = await geminiCompatible.generateImage(provider, {
    prompt: 'a tall scene',
    aspect_ratio: '9:16',
    image_size: '4K',
  }, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return jsonResponse({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAA=' } }] } }],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-image:generateContent');
  assert.deepEqual(calls[0].body.generationConfig.responseFormat, {
    type: 'IMAGE',
    image: {
      aspectRatio: '9:16',
    },
  });
});

test('Gemini compatible chat normalizes generateContent text', async () => {
  const provider = {
    id: 'gemini-compatible',
    protocol: 'gemini-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
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
