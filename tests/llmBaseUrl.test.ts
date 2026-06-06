import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeLlmBaseUrl,
  resolveLlmChatCompletionsUrl,
} = require('../backend/src/utils/llmBaseUrl.js');

const fallback = 'https://ai.t8star.org';

test('normalizes editable LLM Base URLs', () => {
  assert.equal(normalizeLlmBaseUrl(' https://llm.example.com/openai/v1/ ', fallback), 'https://llm.example.com/openai/v1');
  assert.equal(normalizeLlmBaseUrl('', fallback), fallback);
  assert.equal(normalizeLlmBaseUrl('ftp://llm.example.com', fallback), '');
  assert.equal(normalizeLlmBaseUrl('https://user:pass@llm.example.com', fallback), '');
  assert.equal(normalizeLlmBaseUrl('https://llm.example.com?v=1', fallback), '');
});

test('builds the OpenAI-compatible chat completions endpoint', () => {
  assert.equal(
    resolveLlmChatCompletionsUrl('https://llm.example.com', fallback),
    'https://llm.example.com/v1/chat/completions',
  );
  assert.equal(
    resolveLlmChatCompletionsUrl('https://llm.example.com/openai/v1/', fallback),
    'https://llm.example.com/openai/v1/chat/completions',
  );
  assert.equal(
    resolveLlmChatCompletionsUrl('', fallback),
    'https://ai.t8star.org/v1/chat/completions',
  );
});
