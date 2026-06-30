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

test('compact form definitions only expose sections and items present in node markup', () => {
  const { EXHIBITION_COMPACT_FORM_DEFINITIONS } = require('../backend/src/auth/exhibitionCompactForm.js');
  const filesByNodeType = new Map([
    ['elevation-prompt', 'src/components/nodes/ElevationPromptNode.tsx'],
    ['exhibition-img2img', 'src/components/nodes/ExhibitionImg2ImgNode.tsx'],
    ['exhibition-style-transfer', 'src/components/nodes/ExhibitionStyleTransferNode.tsx'],
    ['exhibition-recolor', 'src/components/nodes/ExhibitionRecolorNode.tsx'],
    ['exhibition-lighting-heatmap', 'src/components/nodes/ExhibitionLightingHeatmapNode.tsx'],
    ['exhibition-creative-image', 'src/components/nodes/ExhibitionCreativeImageNode.tsx'],
    ['exhibition-render-to-elevation', 'src/components/nodes/ExhibitionRenderToElevationNode.tsx'],
    ['exhibition-text-image-loop', 'src/components/nodes/ExhibitionTextImageLoopNode.tsx'],
    ['exhibition-outline-split', 'src/components/nodes/ExhibitionOutlineSplitNode.tsx'],
    ['exhibition-plan-layout', 'src/components/nodes/ExhibitionPlanLayoutNode.tsx'],
    ['unit-panel-design', 'src/components/nodes/UnitPanelDesignNode.tsx'],
    ['showcase-interior-design', 'src/components/nodes/ShowcaseInteriorDesignNode.tsx'],
  ]);

  for (const definition of EXHIBITION_COMPACT_FORM_DEFINITIONS) {
    const file = filesByNodeType.get(definition.nodeType);
    assert.ok(file, `missing node file map for ${definition.nodeType}`);
    const source = read(file);
    const sectionIds = new Set([...source.matchAll(/data-exhibition-compact-section="([^"]+)"/g)].map((match) => match[1]));
    for (const section of definition.sections) {
      assert.ok(sectionIds.has(section.id), `${definition.nodeType}.${section.id} is not marked in ${file}`);
      if (!section.items?.length) continue;
      const itemIds = new Set();
      let searchFrom = 0;
      while (true) {
        const sectionStart = source.indexOf(`data-exhibition-compact-section="${section.id}"`, searchFrom);
        if (sectionStart < 0) break;
        const nextSection = source.slice(sectionStart + 1).search(/data-exhibition-compact-section="/);
        const chunk = nextSection >= 0
          ? source.slice(sectionStart, sectionStart + 1 + nextSection)
          : source.slice(sectionStart);
        for (const match of chunk.matchAll(/data-exhibition-compact-item="([^"]+)"/g)) {
          itemIds.add(match[1]);
        }
        const sectionTagStart = source.lastIndexOf('<', sectionStart);
        const sectionTagEnd = source.indexOf('>', sectionStart);
        if (sectionTagStart >= 0 && sectionTagEnd > sectionTagStart) {
          const sectionTag = source.slice(sectionTagStart, sectionTagEnd + 1);
          for (const match of sectionTag.matchAll(/data-exhibition-compact-item="([^"]+)"/g)) {
            itemIds.add(match[1]);
          }
        }
        searchFrom = sectionStart + 1;
      }
      for (const item of section.items) {
        assert.ok(itemIds.has(item.id), `${definition.nodeType}.${section.id}.${item.id} is not marked in ${file}`);
      }
    }
  }
});
