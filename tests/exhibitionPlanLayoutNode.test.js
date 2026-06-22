import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition plan layout node is registered across frontend and permissions', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-plan-layout'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-plan-layout'/);
  assert.match(read('src/config/nodeRegistry.ts'), /平面自动布局/);
  assert.match(read('src/components/Canvas.tsx'), /ExhibitionPlanLayoutNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-plan-layout': ExhibitionPlanLayoutNode/);
  assert.match(read('src/components/Canvas.tsx'), /layoutPresetId: 'balanced'/);
  assert.match(read('src/components/Canvas.tsx'), /planInterpretation: ''/);
  assert.match(read('src/components/Canvas.tsx'), /insertItems: \['large-sculpture'/);
  assert.match(read('src/components/Canvas.tsx'), /excludeItems: \['readable-wrong-text'/);
  assert.match(read('src/components/Canvas.tsx'), /showRoute: true/);
  assert.match(read('src/components/Canvas.tsx'), /showLabels: true/);
  assert.match(read('src/components/Canvas.tsx'), /showDescriptions: true/);
  assert.match(read('src/components/Canvas.tsx'), /structureLock: true/);
  assert.match(read('src/components/NodeActionBar.tsx'), /'exhibition-plan-layout'/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-plan-layout': \{ inputs: \['text', 'image'\], outputs: \['image', 'text'\] \}/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-plan-layout'/);
});

test('exhibition plan layout node wires llm and image generation providers', () => {
  const source = read('src/components/nodes/ExhibitionPlanLayoutNode.tsx');
  assert.match(source, /generateLlm/);
  assert.match(source, /advancedProvidersForNode\(advancedProviders, 'image'\)/);
  assert.match(source, /generateExternalImage/);
  assert.match(source, /queryExternalImageStatus/);
  assert.match(source, /submitImageAsync/);
  assert.match(source, /queryImageStatus/);
  assert.match(source, /uploadDataUrl/);
  assert.match(source, /composeStructureLockedPlan/);
  assert.match(source, /generationOutputFormat = structureLock \? 'png' : outputFormat/);
  assert.match(source, /overlayUrl/);
  assert.match(source, /structureLockedBaseUrl/);
  assert.match(source, /planInterpretation/);
  assert.match(source, /平面图解析/);
  assert.match(source, /总体宽30米，长40米，蓝色线条代表墙体，灰色方块代表柱子，都不可移动/);
  assert.match(source, /EXHIBITION_PLAN_LAYOUT_PRESETS/);
  assert.match(source, /EXHIBITION_PLAN_LAYOUT_INSERT_ITEMS/);
  assert.match(source, /EXHIBITION_PLAN_LAYOUT_EXCLUDE_ITEMS/);
  assert.match(source, /植入项/);
  assert.match(source, /排除项/);
  assert.match(source, /显示动线/);
  assert.match(source, /显示标注文字/);
  assert.match(source, /显示说明文字/);
  assert.match(source, /id="plan-image"/);
  assert.match(source, /id="outline-text"/);
  assert.doesNotMatch(source, /id="style-reference"/);
  assert.doesNotMatch(source, /styleReferenceImage/);
  assert.doesNotMatch(source, /hasStyleReferenceImage/);
});

test('exhibition plan layout presets use independent editable prompt-library endpoints', () => {
  const source = read('src/components/nodes/ExhibitionPlanLayoutNode.tsx');
  assert.match(source, /getCurrentUser/);
  assert.match(source, /canManageTeam/);
  assert.match(source, /getExhibitionPlanLayoutPromptPresets/);
  assert.match(source, /updateExhibitionPlanLayoutInsertPresets/);
  assert.match(source, /updateExhibitionPlanLayoutExcludePresets/);
  assert.match(source, /insertOptions/);
  assert.match(source, /excludeOptions/);

  const api = read('src/services/api.ts');
  assert.match(api, /ExhibitionPlanLayoutInsertPresetItem/);
  assert.match(api, /ExhibitionPlanLayoutExcludePresetItem/);
  assert.match(api, /getExhibitionPlanLayoutPromptPresets/);
  assert.match(api, /updateExhibitionPlanLayoutInsertPresets/);
  assert.match(api, /updateExhibitionPlanLayoutExcludePresets/);
  assert.match(api, /\/prompt-library\/exhibition-plan-layout\/presets/);
  assert.match(api, /\/prompt-library\/exhibition-plan-layout\/presets\/inserts/);
  assert.match(api, /\/prompt-library\/exhibition-plan-layout\/presets\/exclusions/);

  const backend = read('backend/src/routes/promptLibrary.js');
  assert.match(backend, /PLAN_LAYOUT_DB_FILE/);
  assert.match(backend, /prompt_library_exhibition_plan_layout\.json/);
  assert.match(backend, /DEFAULT_EXHIBITION_PLAN_LAYOUT_INSERT_PRESETS/);
  assert.match(backend, /DEFAULT_EXHIBITION_PLAN_LAYOUT_EXCLUDE_PRESETS/);
  assert.match(backend, /readPlanLayoutDb/);
  assert.match(backend, /writePlanLayoutDb/);
  assert.match(backend, /router\.get\('\/exhibition-plan-layout\/presets'/);
  assert.match(backend, /router\.put\('\/exhibition-plan-layout\/presets\/inserts'/);
  assert.match(backend, /router\.put\('\/exhibition-plan-layout\/presets\/exclusions'/);
  assert.match(backend, /isAdminRole\(user\?\.role\)/);
});
