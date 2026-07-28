import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const EXHIBITION_IMAGE_NODES = [
  'ArtistStyleMasterNode.tsx',
  'ExhibitionImg2ImgNode.tsx',
  'ExhibitionStyleTransferNode.tsx',
  'ExhibitionRecolorNode.tsx',
  'ExhibitionLightingHeatmapNode.tsx',
  'ExhibitionCreativeImageNode.tsx',
  'ExhibitionRenderToElevationNode.tsx',
  'SculptureReliefDesignNode.tsx',
  'WayfindingDesignNode.tsx',
  'ExhibitionSceneDesignNode.tsx',
  'ScienceExhibitDesignNode.tsx',
  'ExhibitionFloorplanLayoutNode.tsx',
  'ShowcaseInteriorDesignNode.tsx',
  'ReverseIsometricDesignNode.tsx',
  'FusionRenderDesignNode.tsx',
  'CinemaAuditoriumDesignNode.tsx',
];

test('all exhibition image nodes expose the reusable FHL image module', () => {
  for (const filename of EXHIBITION_IMAGE_NODES) {
    const source = read(`src/components/nodes/${filename}`);
    assert.match(source, /import \{ FhlImageModuleControls \} from '\.\/FhlImageModule';/);
    assert.match(source, /<FhlImageModuleControls compact nodeId=\{id\}/);
  }
});

test('FHL module redirects every shared image submission path while active', () => {
  const module = read('src/components/nodes/FhlImageModule.tsx');
  const runtime = read('src/services/fhlImageRuntime.ts');
  const generation = read('src/services/generation.ts');
  assert.match(module, /fhlImageEngine/);
  assert.match(module, /启用 FHL/);
  assert.match(module, /JPG/);
  assert.match(module, /PNG/);
  assert.match(runtime, /mode: images\.length > 0 \? 'edit' : 'generate'/);
  assert.match(runtime, /quality: config\.quality/);
  assert.match(runtime, /outputFormat: config\.outputFormat/);
  assert.match(generation, /runFhlImageRuntimeGeneration/);
  assert.match(generation, /export async function generateImage[\s\S]*runFhlImageRuntimeGeneration/);
  assert.match(generation, /export async function generateExternalImage[\s\S]*runFhlImageRuntimeGeneration/);
  assert.match(generation, /export async function submitImageAsync[\s\S]*runFhlImageRuntimeGeneration/);
});
