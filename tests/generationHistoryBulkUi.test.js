import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('generation history drawer exposes bulk selection and actions', () => {
  const drawer = read('../src/components/GenerationHistoryDrawer.tsx');

  assert.match(drawer, /selectedIds/);
  assert.match(drawer, /selectionAnchorId/);
  assert.match(drawer, /bulkBusy/);
  assert.match(drawer, /event\.shiftKey/);
  assert.match(drawer, /idsInOrder\.slice\(start, end \+ 1\)/);
  assert.match(drawer, /sendSelectedItems/);
  assert.match(drawer, /penguin:open-send-materials/);
  assert.match(drawer, /defaultMode:\s*'upload'/);
  assert.match(drawer, /downloadSelectedItems/);
  assert.match(drawer, /addSelectedToResources/);
  assert.match(drawer, /toggleSelectedFavorite/);
  assert.match(drawer, /hideSelectedItems/);
  assert.match(drawer, /deleteSelectedFiles/);
  assert.match(drawer, /deleteGenerationHistoryItem\(item\.id,\s*'hide'\)/);
  assert.match(drawer, /deleteGenerationHistoryItem\(item\.id,\s*'delete-file'\)/);
  assert.match(drawer, /data-drag-materials/);
  assert.match(drawer, /bulkDragMaterialsForHistoryItems/);
});

test('bulk history drag payload is inserted into canvas as upload materials', () => {
  const dragStore = read('../src/stores/dragMaterial.ts');
  const overlay = read('../src/components/MaterialDragOverlay.tsx');
  const canvas = read('../src/components/Canvas.tsx');

  assert.match(dragStore, /materials\?: Array/);
  assert.match(overlay, /parseDragMaterials/);
  assert.match(overlay, /data-drag-materials/);
  assert.match(overlay, /cur\?\.materials\?\.length/);
  assert.match(canvas, /sendablesFromMaterialPayload/);
  assert.match(canvas, /Array\.isArray\(payload\.materials\)/);
  assert.match(canvas, /buildSendNodeSpecs\(materials,\s*'upload'\)/);
  assert.match(canvas, /sendableMaterialSignature\(materials\)/);
  assert.match(canvas, /summarizeSendableMaterials\(materials\)/);
});
