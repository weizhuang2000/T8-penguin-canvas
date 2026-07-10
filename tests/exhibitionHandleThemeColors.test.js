import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const EXHIBITION_NODE_FILES = [
  'src/components/nodes/ExhibitionCreativeImageNode.tsx',
  'src/components/nodes/ExhibitionImg2ImgNode.tsx',
  'src/components/nodes/ExhibitionLightingHeatmapNode.tsx',
  'src/components/nodes/ExhibitionOutlineSplitNode.tsx',
  'src/components/nodes/ExhibitionRecolorNode.tsx',
  'src/components/nodes/ExhibitionRenderToElevationNode.tsx',
  'src/components/nodes/ExhibitionStyleTransferNode.tsx',
  'src/components/nodes/ExhibitionTextImageLoopNode.tsx',
  'src/components/nodes/ShowcaseInteriorDesignNode.tsx',
  'src/components/nodes/UnitPanelDesignNode.tsx',
];

function handleLinesWith(source, token) {
  return source
    .split(/\r?\n/)
    .filter((line) => line.includes('<Handle') && line.includes(token));
}

test('exhibition handles carry semantic theme override classes', () => {
  const allSources = EXHIBITION_NODE_FILES.map((file) => [file, read(file)]);
  assert.ok(
    allSources.some(([, source]) => source.includes('t8-exhibition-handle--text')),
    'at least one exhibition text handle class is present',
  );
  assert.ok(
    allSources.some(([, source]) => source.includes('t8-exhibition-handle--image')),
    'at least one exhibition image handle class is present',
  );
  assert.ok(
    allSources.some(([, source]) => source.includes('t8-exhibition-handle--pink')),
    'at least one exhibition pink handle class is present',
  );

  for (const [file, source] of allSources) {
    for (const line of handleLinesWith(source, 'EXHIBITION_TEXT_HANDLE_COLOR')) {
      assert.match(line, /t8-exhibition-handle--text/, `${file} text handle should use text override class`);
    }
    for (const line of handleLinesWith(source, 'EXHIBITION_IMAGE_HANDLE_COLOR')) {
      assert.match(line, /t8-exhibition-handle--image/, `${file} image handle should use image override class`);
    }
    for (const line of handleLinesWith(source, 'EXHIBITION_COLOR_MATERIAL_REFERENCE_COLOR')) {
      assert.match(line, /t8-exhibition-handle--pink/, `${file} color material handle should use pink override class`);
    }
    for (const line of handleLinesWith(source, 'STYLE_REFERENCE_HANDLE_COLOR')) {
      assert.match(line, /t8-exhibition-handle--pink/, `${file} style reference handle should use pink override class`);
    }
    for (const line of handleLinesWith(source, 'FORM_REFERENCE_HANDLE_COLOR')) {
      assert.match(line, /t8-exhibition-handle--pink/, `${file} form reference handle should use pink override class`);
    }
  }
});

test('theme css fixes exhibition handle colors above templates', () => {
  const css = read('src/styles/index.css');
  assert.match(css, /html\[data-theme-template\] \.react-flow__handle\.t8-exhibition-handle--text/);
  assert.match(css, /html\[data-theme-visual\] \.react-flow__handle\.t8-exhibition-handle--text/);
  assert.match(css, /t8-exhibition-handle--text[\s\S]*background: #60a5fa !important/);
  assert.match(css, /t8-exhibition-handle--image[\s\S]*background: #facc15 !important/);
  assert.match(css, /t8-exhibition-handle--pink[\s\S]*background: #f472b6 !important/);
});

test('global port colors and theme template port tokens stay unchanged', () => {
  const ports = read('src/config/portTypes.ts');
  const templates = read('src/theme/defaultTemplates.ts');
  assert.match(ports, /text:\s*'#facc15'/);
  assert.match(ports, /image:\s*'#60a5fa'/);
  assert.match(templates, /portText:\s*'#[0-9a-fA-F]{6}'/);
  assert.match(templates, /portImage:\s*'#[0-9a-fA-F]{6}'/);
  assert.doesNotMatch(templates, /EXHIBITION_(TEXT|IMAGE|COLOR)_HANDLE_COLOR/);
});
