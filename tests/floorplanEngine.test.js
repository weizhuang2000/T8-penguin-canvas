import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDxf, generateLayouts, validateLayout } = require('../backend/src/utils/floorplanEngine');

const rectangleDxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
WALL
70
1
10
0
20
0
10
24000
20
0
10
24000
20
12000
10
0
20
12000
0
LINE
8
ENTRY
10
0
20
5000
11
0
21
6800
0
LINE
8
EXIT
10
24000
20
5000
11
24000
21
6800
0
CIRCLE
8
COLUMN
10
12000
20
6000
40
300
0
ENDSEC
0
EOF`;

test('DXF parser normalizes supported entities into millimeter architecture', () => {
  const architecture = parseDxf(rectangleDxf);
  assert.equal(architecture.units, 'mm');
  assert.equal(architecture.bounds.width, 24000);
  assert.equal(architecture.bounds.height, 12000);
  assert.equal(architecture.openings.length, 2);
  assert.equal(architecture.columns.length, 1);
  assert.match(architecture.architectureVersion, /^arch-/);
});

test('layout engine returns three deterministic candidates with metrics', () => {
  const architecture = parseDxf(rectangleDxf);
  const requirement = { facilities: [{ type: '展柜', quantity: 4, size: [1200, 600], clearance: 1000 }] };
  const first = generateLayouts(architecture, requirement, { minimumPathWidth: 1000 });
  const second = generateLayouts(architecture, requirement, { minimumPathWidth: 1000 });
  assert.equal(first.candidates.length, 3);
  assert.deepEqual(first.candidates.map((c) => c.items), second.candidates.map((c) => c.items));
  assert.ok(first.candidates.every((c) => c.validation.metrics.minimumPathWidth === 1000));
});

test('validator reports boundary, wall, column and spacing conflicts', () => {
  const architecture = parseDxf(rectangleDxf);
  const validation = validateLayout(architecture, { strategy: 'grid', items: [
    { id: 'outside', x: -100, y: -100, width: 1200, depth: 600, clearance: 1200 },
    { id: 'column-hit', x: 11800, y: 5800, width: 1200, depth: 600, clearance: 1200 },
    { id: 'nearby', x: 12000, y: 6000, width: 1200, depth: 600, clearance: 1200 },
  ] }, { minimumPathWidth: 1200 });
  assert.equal(validation.status, 'error');
  assert.ok(validation.errors.some((e) => e.includes('建筑边界')));
  assert.ok(validation.errors.some((e) => e.includes('柱体')));
  assert.ok(validation.errors.some((e) => e.includes('净距不足')));
});

test('DXF parser rejects empty or unsupported documents', () => {
  assert.throws(() => parseDxf(''), /为空/);
  assert.throws(() => parseDxf('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF'), /没有可支持/);
});

