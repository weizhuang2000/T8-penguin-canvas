import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve('.');
const require = createRequire(import.meta.url);

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('NodeActionBar places compact form button between run and fullscreen actions', () => {
  const source = read('src/components/NodeActionBar.tsx');
  const runIndex = source.indexOf('<span>RUN</span>');
  const compactIndex = source.indexOf('data-exhibition-compact-toggle');
  const fullscreenIndex = source.indexOf('onClick={onFullscreen}');
  assert.ok(runIndex > 0);
  assert.ok(compactIndex > runIndex);
  assert.ok(fullscreenIndex > compactIndex);
});

test('exhibition compact form only enables configured exhibition node types', () => {
  const source = read('src/config/exhibitionCompactForm.ts');
  assert.match(source, /exhibition-img2img/);
  assert.match(source, /showcase-interior-design/);
  assert.doesNotMatch(source, /nodeType: 'import-cam-project'/);
});

test('compact controller writes true active attribute expected by CSS', () => {
  const canvas = read('src/components/Canvas.tsx');
  const css = read('src/styles/index.css');
  assert.match(canvas, /setAttribute\('data-exhibition-compact-active', 'true'\)/);
  assert.match(canvas, /hiddenKeysByNodeType/);
  assert.match(canvas, /exhibitionCompactKey/);
  assert.match(canvas, /COMPACT_FINE_SELECTOR/);
  assert.match(canvas, /resolveCompactClickTarget/);
  assert.match(canvas, /'div'/);
  assert.match(canvas, /stopEditingEvent/);
  assert.match(canvas, /document\.addEventListener\('click', stopEditingEvent, true\)/);
  assert.match(canvas, /data-exhibition-compact-editing/);
  assert.match(canvas, /updateExhibitionCompactForm/);
  assert.match(canvas, /document\.addEventListener\('pointerdown', onPointerDown, true\)/);
  assert.match(css, /\[data-exhibition-compact-active="true"\]/);
  assert.match(css, /\[data-exhibition-compact-key\]\[data-exhibition-compact-visible="false"\]/);
  assert.match(css, /\[data-exhibition-compact-editing="true"\] \[data-exhibition-compact-hidden="true"\]/);
  assert.match(css, /rgba\(248, 113, 113/);
});

test('NodeActionBar supports admin double-click visual editing without firing single-click immediately', () => {
  const source = read('src/components/NodeActionBar.tsx');
  assert.match(source, /compactClickTimerRef/);
  assert.match(source, /window\.setTimeout\(\(\) => \{/);
  assert.match(source, /onDoubleClick=\{onEditCompact\}/);
  assert.match(source, /setEditingNode\(selectedExe\.id, selectedExe\.type\)/);
  assert.match(source, /selectedExe\.id !== editingNodeId/);
  assert.match(source, /data-exhibition-compact-editing/);
});

test('exhibition compact form supports field-level item config', () => {
  const source = read('src/config/exhibitionCompactForm.ts');
  assert.match(source, /itemsByNodeType/);
  assert.match(source, /getExhibitionCompactSectionItems/);
  assert.match(source, /preset-options/);
});

test('exhibition nodes carry compact section markers', () => {
  const files = [
    'src/components/nodes/ElevationPromptNode.tsx',
    'src/components/nodes/ExhibitionImg2ImgNode.tsx',
    'src/components/nodes/ExhibitionStyleTransferNode.tsx',
    'src/components/nodes/ExhibitionRecolorNode.tsx',
    'src/components/nodes/ExhibitionLightingHeatmapNode.tsx',
    'src/components/nodes/ExhibitionCreativeImageNode.tsx',
    'src/components/nodes/ExhibitionRenderToElevationNode.tsx',
    'src/components/nodes/ExhibitionTextImageLoopNode.tsx',
    'src/components/nodes/ExhibitionOutlineSplitNode.tsx',
    'src/components/nodes/ExhibitionPlanLayoutNode.tsx',
    'src/components/nodes/UnitPanelDesignNode.tsx',
    'src/components/nodes/ShowcaseInteriorDesignNode.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /data-exhibition-compact-node-type=/, file);
    assert.match(source, /data-exhibition-compact-section=/, file);
  }
});

test('representative exhibition nodes carry compact item markers', () => {
  const files = [
    'src/components/nodes/ExhibitionImg2ImgNode.tsx',
    'src/components/nodes/ExhibitionRecolorNode.tsx',
    'src/components/nodes/ExhibitionLightingHeatmapNode.tsx',
    'src/components/nodes/ExhibitionRenderToElevationNode.tsx',
    'src/components/nodes/UnitPanelDesignNode.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /data-exhibition-compact-item=/, file);
  }
});

test('legacy compact form definitions remain available while DOM keys drive the new editor', () => {
  const { EXHIBITION_COMPACT_FORM_DEFINITIONS } = require('../backend/src/auth/exhibitionCompactForm.js');
  const backendSource = read('backend/src/auth/exhibitionCompactForm.js');
  const frontendSource = read('src/config/exhibitionCompactForm.ts');
  assert.ok(EXHIBITION_COMPACT_FORM_DEFINITIONS.some((definition) => definition.nodeType === 'exhibition-img2img'));
  assert.match(backendSource, /hiddenKeysByNodeType/);
  assert.match(frontendSource, /hiddenKeysByNodeType/);
  assert.match(read('src/components/UserManagementModal.tsx'), /hiddenKeysByNodeType: \{\}/);
});
