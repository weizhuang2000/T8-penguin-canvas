import test from 'node:test';
import assert from 'node:assert/strict';

import { exportGameUiDocument } from '../src/services/gameUiExport.ts';

const request = {
  format: 'prototype-zip' as const,
  sourceNodeType: 'interactive-game-script' as const,
  imageUrls: ['/files/output/screen.png'],
  script: { title: '测试互动游戏', screens: [] } as any,
};

test('game UI export frontend posts the schema and reads a UTF-8 filename', async () => {
  const oldFetch = globalThis.fetch;
  let body: any = null;
  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/documents/game-ui/export');
    body = JSON.parse(String(init.body));
    return new Response(new Blob(['zip-data']), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="game-ui-export.zip"; filename*=UTF-8''${encodeURIComponent('测试互动游戏_互动原型.zip')}`,
      },
    });
  };
  try {
    const result = await exportGameUiDocument(request);
    assert.equal(body.format, 'prototype-zip');
    assert.equal(body.sourceNodeType, 'interactive-game-script');
    assert.equal(result.filename, '测试互动游戏_互动原型.zip');
    assert.equal(result.blob.size, 8);
  } finally { globalThis.fetch = oldFetch; }
});

test('game UI export frontend surfaces backend JSON errors', async () => {
  const oldFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => new Response(JSON.stringify({ success: false, error: '界面图片无效' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try { await assert.rejects(() => exportGameUiDocument(request), /界面图片无效/); }
  finally { globalThis.fetch = oldFetch; }
});
