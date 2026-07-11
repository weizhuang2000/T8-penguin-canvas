import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REVERSE_ISOMETRIC_DIRECTIONS,
  REVERSE_ISOMETRIC_FLOOR_MATERIALS,
  buildReverseIsometricPrompt,
  describeWallAdjacentExhibits,
  normalizeReverseIsometricLayoutItems,
  patchReverseIsometricLayoutItem,
} from '../src/utils/reverseIsometricDesignData.js';

const root = path.resolve('.');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('reverse isometric node is registered across canvas, permissions and compact form', () => {
  assert.match(read('src/types/canvas.ts'), /'reverse-isometric-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'reverse-isometric-design'[^\n]*label: '反推轴侧'/);
  assert.match(read('src/config/portTypes.ts'), /'reverse-isometric-design': \{ inputs: \['image'\], outputs: \['image'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /'reverse-isometric-design': ReverseIsometricDesignNode/);
  assert.match(read('src/utils/nodePlacement.ts'), /'reverse-isometric-design': \{ w: 520, h: 720 \}/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'reverse-isometric-design'/);
  assert.match(read('src/components/nodes/ExhibitionTextImageLoopNode.tsx'), /'reverse-isometric-design'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'reverse-isometric-design'/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /nodeType: 'reverse-isometric-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /nodeType: 'reverse-isometric-design'/);
});

test('plan layout handle is exclusive while exhibit references remain multi-source', () => {
  const canvas = read('src/components/Canvas.tsx');
  const node = read('src/components/nodes/ReverseIsometricDesignNode.tsx');
  assert.match(canvas, /targetType === 'reverse-isometric-design' && handle === 'plan-layout'[\s\S]*return \[handle\]/);
  assert.doesNotMatch(canvas, /targetType === 'reverse-isometric-design' && handle === 'exhibit-reference'/);
  assert.match(node, /id="plan-layout"[^>]*type="target"/);
  assert.match(node, /id="exhibit-reference"[^>]*type="target"/);
  assert.match(node, /useHandleImages\(id, 'plan-layout', true\)/);
  assert.match(node, /useHandleImages\(id, 'exhibit-reference'\)/);
});

test('layout normalization restores matching URLs and drops disconnected exhibits', () => {
  const saved = [
    { id: 'old-a', url: '/a.png', label: '旧 A', xRatio: 0.7, yRatio: 0.8, widthRatio: 0.5, heightRatio: 0.4, rotationDeg: 450, zIndex: 8 },
    { id: 'gone', url: '/gone.png', xRatio: 0, yRatio: 0, widthRatio: 0.2, heightRatio: 0.2 },
  ];
  const result = normalizeReverseIsometricLayoutItems(saved, [
    { id: 'new-a', url: '/a.png', label: 'A' },
    { id: 'new-b', url: '/b.png', label: 'B' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'old-a');
  assert.equal(result[0].rotationDeg, 90);
  assert.equal(result[0].xRatio, 0.5);
  assert.equal(result[0].yRatio, 0.6);
  assert.equal(result.some((item) => item.url === '/gone.png'), false);
  assert.deepEqual({ x: result[0].cropX, y: result[0].cropY, width: result[0].cropWidth, height: result[0].cropHeight }, { x: 0, y: 0, width: 1, height: 1 });
});

test('node keeps disconnected transforms archived and tracks manually excluded layers', () => {
  const source = read('src/components/nodes/ReverseIsometricDesignNode.tsx');
  assert.match(source, /const archived = [\s\S]*!connectedUrls\.has\(item\.url\)/);
  assert.match(source, /excludedLayoutUrls: exhibitImages\.filter\(\(item\) => !visibleUrls\.has\(item\.url\)\)/);
  assert.match(source, /excludedLayoutUrls: \[\]/);
});

test('layout item patch clamps move, non-uniform stretch, scale and rotation', () => {
  const item = { id: 'a', url: '/a.png', label: 'A', xRatio: 0.2, yRatio: 0.2, widthRatio: 0.2, heightRatio: 0.3, rotationDeg: 0, zIndex: 1 };
  const stretched = patchReverseIsometricLayoutItem(item, { xRatio: 0.95, yRatio: -1, widthRatio: 0.4, heightRatio: 0.1, rotationDeg: -540 });
  assert.equal(stretched.xRatio, 0.6);
  assert.equal(stretched.yRatio, 0);
  assert.equal(stretched.widthRatio, 0.4);
  assert.equal(stretched.heightRatio, 0.1);
  assert.equal(stretched.rotationDeg, -180);
  const scaled = patchReverseIsometricLayoutItem(item, { widthRatio: 0.4, heightRatio: 0.6 });
  assert.equal(scaled.widthRatio / scaled.heightRatio, item.widthRatio / item.heightRatio);
  const cropped = patchReverseIsometricLayoutItem(item, { cropX: 0.25, cropY: 0.1, cropWidth: 0.9, cropHeight: 0.95 });
  assert.deepEqual({ x: cropped.cropX, y: cropped.cropY, width: cropped.cropWidth, height: cropped.cropHeight }, { x: 0.25, y: 0.1, width: 0.75, height: 0.9 });
});

test('prompt locks every architectural category and supports all four directions', () => {
  assert.equal(REVERSE_ISOMETRIC_FLOOR_MATERIALS.length, 20);
  assert.deepEqual(REVERSE_ISOMETRIC_DIRECTIONS.map((item) => item.value), ['front-left', 'front-right', 'back-left', 'back-right']);
  for (const direction of REVERSE_ISOMETRIC_DIRECTIONS) {
    const prompt = buildReverseIsometricPrompt({ viewDirection: direction.value });
    assert.match(prompt, new RegExp(direction.label));
    for (const term of ['墙体中心线', '墙厚关系', '柱网', '出入口', '门', '窗', '连接拓扑', '无顶整体']) assert.match(prompt, new RegExp(term));
    assert.match(prompt, /严禁补墙、拆墙/);
  }
  const configured = buildReverseIsometricPrompt({ hallHeightMm: 5600, floorMaterial: '深灰水磨石' });
  assert.match(configured, /5600 mm/);
  assert.match(configured, /深灰水磨石/);
  assert.match(configured, /靠墙布置的展项[\s\S]*背面[\s\S]*紧贴对应墙面/);
  assert.match(configured, /俯角约 25°–30°/);
  assert.match(configured, /不得生成接近顶视图/);
  assert.match(configured, /严禁把整张展项图片水平平铺/);
  assert.match(configured, /底座落地、立面竖直/);
});

test('wall-adjacent exhibit descriptions identify the nearest plan boundary', () => {
  const items = [
    { label: '墙柜A', xRatio: 0.01, yRatio: 0.3, widthRatio: 0.2, heightRatio: 0.2 },
    { label: '墙柜B', xRatio: 0.4, yRatio: 0.75, widthRatio: 0.2, heightRatio: 0.22 },
    { label: '中央展项', xRatio: 0.4, yRatio: 0.4, widthRatio: 0.1, heightRatio: 0.1 },
  ];
  const description = describeWallAdjacentExhibits(items);
  assert.match(description, /墙柜A靠近左侧墙/);
  assert.match(description, /墙柜B靠近底部墙/);
  assert.doesNotMatch(description, /中央展项/);
  const prompt = buildReverseIsometricPrompt({ wallPlacementText: description, exhibitCount: 2 });
  assert.match(prompt, /@img3 至 @img4/);
  assert.match(prompt, /墙柜A靠近左侧墙/);
});

test('manual layout preview and reference export share crop data', () => {
  const source = read('src/components/nodes/ReverseIsometricDesignNode.tsx');
  assert.match(source, /item\.cropX \* sourceWidth/);
  assert.match(source, /item\.cropWidth \* sourceWidth/);
  assert.match(source, /源图裁剪/);
  assert.match(source, /重置裁剪/);
  assert.match(source, /100 \/ item\.cropWidth/);
  assert.match(source, /REVERSE_ISOMETRIC_FLOOR_MATERIALS\.map/);
  assert.match(source, /hallHeightMm/);
  assert.match(source, /\.\.\.layoutItems\.map\(\(item\) => item\.url\)/);
});

test('node generates once without vision validation and publishes directly', () => {
  const source = read('src/components/nodes/ReverseIsometricDesignNode.tsx');
  assert.doesNotMatch(source, /generateLlm|validateCandidate|runReverseIsometricValidationLoop|validationReport|结构校验模型/);
  assert.match(source, /const previousOutput = \{ imageUrl:/);
  assert.match(source, /update\(\{ \.\.\.previousOutput, status: 'error'/);
  assert.match(source, /const candidate = await generateCandidate\(previewPrompt, references, runSeed\)/);
  assert.match(source, /imageUrl: candidate, imageUrls: \[candidate\], urls: \[candidate\]/);
  assert.match(source, /historyContext/);
});
