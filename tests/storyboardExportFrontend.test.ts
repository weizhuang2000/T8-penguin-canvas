import test from 'node:test';
import assert from 'node:assert/strict';

import { exportStoryboardDocument } from '../src/services/storyboardExport.ts';

const script = {
  title: '测试片名',
  visualContinuity: '视觉一致',
  shots: [{
    index: 1,
    title: '镜头一',
    durationSeconds: 5,
    shotSize: '中景',
    cameraAngle: '平视',
    cameraMovement: '固定',
    visual: '画面',
    action: '动作',
    dialogue: '',
    voiceOver: '',
    imagePrompt: 'prompt',
  }],
};

test('storyboard export frontend posts settings and reads UTF-8 download filename', async () => {
  const oldFetch = globalThis.fetch;
  let requestBody: any = null;
  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/documents/storyboard/export');
    requestBody = JSON.parse(String(init.body));
    return new Response(new Blob(['pptx-data']), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="storyboard-export.pptx"; filename*=UTF-8''${encodeURIComponent('测试片名_分镜脚本.pptx')}`,
      },
    });
  };
  try {
    const result = await exportStoryboardDocument({
      format: 'pptx',
      layout: 'shot-card-table',
      pptShotsPerSlide: 4,
      script,
      imageUrls: [],
      sourceNodeType: 'storyboard-grid',
    });
    assert.equal(requestBody.format, 'pptx');
    assert.equal(requestBody.layout, 'shot-card-table');
    assert.equal(requestBody.pptShotsPerSlide, 4);
    assert.equal(result.filename, '测试片名_分镜脚本.pptx');
    assert.equal(result.blob.size, 9);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('storyboard export frontend surfaces JSON errors', async () => {
  const oldFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => new Response(JSON.stringify({ success: false, error: '导出参数无效' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    await assert.rejects(() => exportStoryboardDocument({
      format: 'pdf',
      layout: 'production-table',
      pptShotsPerSlide: 2,
      script,
      imageUrls: [],
      sourceNodeType: 'storyboard-grid',
    }), /导出参数无效/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
