import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FUSION_RENDER_AUTO_CEILING_CRAFT,
  FUSION_RENDER_CEILING_CRAFTS,
  buildFusionRenderPrompt,
} from '../src/utils/fusionRenderDesignData.js';

const root = path.resolve('.');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('fusion render node is registered across canvas, permissions and compact form', () => {
  assert.match(read('src/types/canvas.ts'), /'fusion-render-design'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'fusion-render-design'[^\n]*label: '融合效果图'/);
  assert.match(read('src/config/portTypes.ts'), /'fusion-render-design': \{ inputs: \['image'\], outputs: \['image'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design': FusionRenderDesignNode/);
  assert.match(read('src/utils/nodePlacement.ts'), /'fusion-render-design': \{ w: 520, h: 720 \}/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'fusion-render-design'/);
  assert.match(read('src/components/nodes/ExhibitionTextImageLoopNode.tsx'), /'fusion-render-design'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'fusion-render-design'/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /nodeType: 'fusion-render-design'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /nodeType: 'fusion-render-design'/);
  assert.match(read('src/config/nodeHelpDefaults.ts'), /'fusion-render-design': `# 融合效果图/);
  assert.match(read('features.json'), /"nodeType": "fusion-render-design"/);
});

test('plan is optional and exclusive while exhibit references remain required and multi-source', () => {
  const canvas = read('src/components/Canvas.tsx');
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(canvas, /targetType === 'fusion-render-design' && handle === 'plan-layout'[\s\S]*return \[handle\]/);
  assert.doesNotMatch(canvas, /targetType === 'fusion-render-design' && handle === 'exhibit-reference'/);
  assert.match(node, /id="plan-layout"[^>]*type="target"/);
  assert.match(node, /id="exhibit-reference"[^>]*type="target"/);
  assert.match(node, /if \(!exhibitImages\.length\) throw new Error\('请至少连接一张展项效果图'\)/);
  assert.doesNotMatch(node, /if \(!planImage\) throw/);
});

test('blank rectangle follows hall dimensions and layout transforms use the shared editor/exporter', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  const editor = read('src/components/nodes/ReverseIsometricDesignNode.tsx');
  assert.match(node, /createBlankStage\(hallLengthMm, hallWidthMm\)/);
  assert.match(node, /aspectRatio=\{`\$\{hallLengthMm\} \/ \$\{hallWidthMm\}`\}/);
  assert.match(node, /空白矩形空间/);
  assert.match(node, /buildReverseIsometricLayoutReference\(planUrl \|\| createBlankStage\(hallLengthMm, hallWidthMm\), items\)/);
  for (const term of ['stretch-x', 'stretch-y', 'scale', 'rotate', '源图裁剪', 'zIndex']) assert.match(editor, new RegExp(term));
});

test('reference ordering changes with plan availability and previous output survives failures', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /planImage \? \[planImage, layoutReference, \.\.\.layoutItems\.map/);
  assert.match(node, /: \[layoutReference, \.\.\.layoutItems\.map/);
  assert.match(node, /const previousOutput = \{ imageUrl:/);
  assert.match(node, /update\(\{ \.\.\.previousOutput, status: 'error'/);
  assert.match(node, /imageUrl: candidate, imageUrls: \[candidate\], urls: \[candidate\]/);
});

test('prompt describes both structural modes and always requests one realistic perspective render', () => {
  const planned = buildFusionRenderPrompt({ hasPlan: true, exhibitCount: 2, hallHeightMm: 5600, floorMaterial: '深灰水磨石' });
  assert.match(planned, /@img1 是原始平面结构基准/);
  assert.match(planned, /@img2 是俯视排版定位图/);
  assert.match(planned, /@img3 至 @img4/);
  for (const term of ['墙体中心线', '柱网', '出入口', '门', '窗', '5600 mm', '深灰水磨石']) assert.match(planned, new RegExp(term));

  const blank = buildFusionRenderPrompt({ hasPlan: false, exhibitCount: 2 });
  assert.match(blank, /@img1 是矩形空间内的俯视排版定位图/);
  assert.match(blank, /@img2 至 @img3/);
  assert.match(blank, /简洁、完整的矩形展厅/);
  for (const term of ['写实', '空间透视效果图', '底座落地', '禁止拼版', '不得输出俯视平面图、轴侧图']) assert.match(blank, new RegExp(term));
});

test('ceiling craft offers automatic styling first plus twenty common crafts', () => {
  assert.equal(FUSION_RENDER_AUTO_CEILING_CRAFT, '根据所有展项风格自动调整');
  assert.equal(FUSION_RENDER_CEILING_CRAFTS.length, 20);
  assert.equal(new Set(FUSION_RENDER_CEILING_CRAFTS).size, 20);

  const automatic = buildFusionRenderPrompt({ ceilingCraft: FUSION_RENDER_AUTO_CEILING_CRAFT, exhibitCount: 2 });
  assert.match(automatic, /根据全部展项原始外观参考的设计风格、色彩、材质、造型语言和灯光气质自动选择/);

  const specified = buildFusionRenderPrompt({ ceilingCraft: '铝方通吊顶' });
  assert.match(specified, /明确采用“铝方通吊顶”/);
  assert.match(specified, /真实可施工/);

  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  assert.match(node, /顶部工艺/);
  assert.match(node, /FUSION_RENDER_AUTO_CEILING_CRAFT/);
  assert.match(node, /FUSION_RENDER_CEILING_CRAFTS\.map/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*ceilingCraft: '根据所有展项风格自动调整'/);
});

test('layout editor configures hall length and width and prompt uses physical dimensions', () => {
  const node = read('src/components/nodes/FusionRenderDesignNode.tsx');
  const editor = read('src/components/nodes/ReverseIsometricDesignNode.tsx');
  assert.match(node, /hallLengthMm=\{hallLengthMm\}/);
  assert.match(node, /hallWidthMm=\{hallWidthMm\}/);
  assert.match(node, /onDimensionsChange=\{\(dimensions\) => update\(dimensions\)\}/);
  assert.match(editor, /展厅尺寸/);
  assert.match(editor, />长 mm<input/);
  assert.match(editor, />宽 mm<input/);

  const prompt = buildFusionRenderPrompt({ hallLengthMm: 18000, hallWidthMm: 9000, hallHeightMm: 5000 });
  assert.match(prompt, /长 18000 mm、宽 9000 mm、净高 5000 mm/);
  assert.match(prompt, /长宽高比例/);
  assert.match(read('src/components/Canvas.tsx'), /'fusion-render-design':[\s\S]*hallLengthMm: 12000,[\s\S]*hallWidthMm: 8000/);
});
