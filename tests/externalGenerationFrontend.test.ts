import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateExternalImage,
  generateExternalVideo,
  generateExternalLlm,
  queryExternalImageStatus,
} from '../src/services/generation.ts';

function jsonResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    },
  } as any;
}

function textResponse(text: string, status = 502) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return text;
    },
  } as any;
}

test('generateExternalImage posts to external image route and returns normalized image urls', async () => {
  const calls: any[] = [];
  const oldFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return jsonResponse({
      success: true,
      data: {
        imageUrls: ['/files/output/external_1.png'],
        remoteImageUrls: ['https://cdn.example.com/raw.png'],
        provider: { id: 'modelscope', protocol: 'modelscope' },
      },
    });
  };
  try {
    const result = await generateExternalImage({
      providerId: 'modelscope',
      prompt: 'draw',
      model: 'flux-dev',
      size: '1024x1024',
      images: ['/files/input/a.png'],
      async: true,
    });

    assert.equal(calls[0].url, '/api/proxy/external/image');
    assert.equal(calls[0].body.providerId, 'modelscope');
    assert.equal(calls[0].body.model, 'flux-dev');
    assert.equal(calls[0].body.async, true);
    assert.deepEqual(result.imageUrls, ['/files/output/external_1.png']);
    assert.deepEqual(result.remoteImageUrls, ['https://cdn.example.com/raw.png']);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('generateExternalImage forwards banana ratio fields for gemini-compatible providers', async () => {
  const calls: any[] = [];
  const oldFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({ success: true, data: { imageUrls: ['https://cdn.example.com/out.png'] } });
  };
  try {
    await generateExternalImage({
      providerId: 'gemini-compatible',
      prompt: 'banana ratio',
      model: 'nano-banana-2',
      aspect_ratio: '16:9',
      image_size: '2K',
      size: '1344x768',
    } as any);

    assert.equal(calls[0].url, '/api/proxy/external/image');
    assert.equal(calls[0].body.aspect_ratio, '16:9');
    assert.equal(calls[0].body.image_size, '2K');
    assert.equal(calls[0].body.size, '1344x768');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('generateExternalImage reports non JSON gateway pages in readable text', async () => {
  const oldFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => textResponse('<!DOCTYPE html><title>IIS 10.0 502.3 Bad Gateway</title>', 502);
  try {
    await assert.rejects(
      () => generateExternalImage({
        providerId: 'openai-compatible',
        prompt: 'draw',
      }),
      /接口返回非 JSON.*HTTP 502.*IIS 10\.0 502\.3 Bad Gateway/,
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('queryExternalImageStatus omits long history context for local extension jobs', async () => {
  const calls: string[] = [];
  const oldFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string) => {
    calls.push(url);
    return jsonResponse({
      success: true,
      code: 'completed',
      data: {
        taskId: 'external-image-123-demo',
        status: 'completed',
        imageUrls: ['/files/output/storyboard.png'],
      },
    });
  };
  try {
    const result = await queryExternalImageStatus({
      providerId: 'openai-compatible',
      providerModel: 'image-model',
      taskId: 'external-image-123-demo',
      outputFormat: 'png',
      historyContext: {
        sourceNodeType: 'storyboard-grid',
        prompt: '分镜宏格提示词'.repeat(2000),
      },
    });

    const requestUrl = new URL(calls[0], 'http://localhost');
    assert.equal(requestUrl.pathname, '/api/proxy/external/image/status/external-image-123-demo');
    assert.equal(requestUrl.searchParams.get('outputFormat'), 'png');
    assert.equal(requestUrl.searchParams.has('providerId'), false);
    assert.equal(requestUrl.searchParams.has('providerModel'), false);
    assert.equal(requestUrl.searchParams.has('historyContext'), false);
    assert.deepEqual(result.imageUrls, ['/files/output/storyboard.png']);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('generateExternalLlm posts to external llm route and maps text to content', async () => {
  const oldFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    assert.equal(url, '/api/proxy/external/llm');
    const body = JSON.parse(init.body);
    assert.equal(body.providerId, 'openai-compatible');
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.llmVideoMode, 'url');
    assert.equal(body.messages[0].content[1].type, 'video_url');
    return jsonResponse({
      success: true,
      data: {
        text: 'hello external',
        raw: { ok: true },
        provider: { id: 'openai-compatible', protocol: 'openai-compatible' },
      },
    });
  };
  try {
    const result = await generateExternalLlm({
      providerId: 'openai-compatible',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'video_url', video_url: { url: '/files/output/demo.mp4' } }] }],
      llmVideoMode: 'url',
    });

    assert.equal(result.content, 'hello external');
    assert.deepEqual(result.raw, { ok: true });
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('generateExternalVideo posts to external video route and returns normalized video urls', async () => {
  const calls: any[] = [];
  const oldFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return jsonResponse({
      success: true,
      data: {
        videoUrls: ['/files/output/external_1.mp4'],
        remoteVideoUrls: ['https://cdn.example.com/raw.mp4'],
        taskId: 'vid-1',
        provider: { id: 'volcengine', protocol: 'volcengine' },
      },
    });
  };
  try {
    const result = await generateExternalVideo({
      providerId: 'volcengine',
      prompt: 'pass',
      model: 'seedance',
      aspect_ratio: '16:9',
      duration: 5,
      resolution: '720p',
      images: ['/files/input/a.png'],
    });

    assert.equal(calls[0].url, '/api/proxy/external/video');
    assert.equal(calls[0].body.providerId, 'volcengine');
    assert.equal(calls[0].body.model, 'seedance');
    assert.deepEqual(result.videoUrls, ['/files/output/external_1.mp4']);
    assert.deepEqual(result.remoteVideoUrls, ['https://cdn.example.com/raw.mp4']);
    assert.equal(result.taskId, 'vid-1');
  } finally {
    globalThis.fetch = oldFetch;
  }
});
