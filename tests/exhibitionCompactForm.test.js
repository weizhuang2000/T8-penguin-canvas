import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');

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
  assert.match(canvas, /getAllowedItems/);
  assert.match(canvas, /data-exhibition-compact-item/);
  assert.match(canvas, /sectionEl\.dataset\.exhibitionCompactItem/);
  assert.match(css, /\[data-exhibition-compact-active="true"\]/);
  assert.match(css, /\[data-exhibition-compact-item\]\[data-exhibition-compact-visible="false"\]/);
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
