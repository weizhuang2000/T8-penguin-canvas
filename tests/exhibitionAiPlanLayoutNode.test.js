import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exhibition AI plan layout node is registered as an independent exhibition node', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'exhibition-ai-plan-layout'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'exhibition-ai-plan-layout'/);
  assert.match(read('src/config/nodeRegistry.ts'), /平面AI布局/);
  assert.match(read('src/components/Canvas.tsx'), /ExhibitionAiPlanLayoutNode/);
  assert.match(read('src/components/Canvas.tsx'), /'exhibition-ai-plan-layout': ExhibitionAiPlanLayoutNode/);
  assert.match(read('src/components/Canvas.tsx'), /aiPlanLayoutMode: true/);
  assert.match(read('src/config/portTypes.ts'), /'exhibition-ai-plan-layout': \{ inputs: \['text', 'image'\], outputs: \['image', 'text'\] \}/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'exhibition-ai-plan-layout'/);
  assert.match(read('src/config/exhibitionCompactForm.ts'), /nodeType: 'exhibition-ai-plan-layout'/);
  assert.match(read('backend/src/auth/exhibitionCompactForm.js'), /nodeType: 'exhibition-ai-plan-layout'/);
});

test('exhibition AI plan layout node wires vision LLM analysis and team presets', () => {
  const source = read('src/components/nodes/ExhibitionPlanLayoutNode.tsx');
  assert.match(source, /buildExhibitionAiPlanInterpretationPrompt/);
  assert.match(source, /buildExhibitionAiPlanLayoutPrompt/);
  assert.match(source, /type: 'image_url'/);
  assert.match(source, /planAiInterpretation/);
  assert.match(source, /styleRequirement/);
  assert.match(source, /specialRequirement/);
  assert.match(source, /getExhibitionAiPlanLayoutPromptPresets/);
  assert.match(source, /updateExhibitionAiPlanLayoutStylePresets/);
  assert.match(source, /updateExhibitionAiPlanLayoutRequirementPresets/);
  assert.match(source, /AI读取平面/);

  const api = read('src/services/api.ts');
  assert.match(api, /ExhibitionAiPlanLayoutPresetItem/);
  assert.match(api, /\/prompt-library\/exhibition-ai-plan-layout\/presets/);
  assert.match(api, /\/prompt-library\/exhibition-ai-plan-layout\/presets\/styles/);
  assert.match(api, /\/prompt-library\/exhibition-ai-plan-layout\/presets\/requirements/);

  const backend = read('backend/src/routes/promptLibrary.js');
  assert.match(backend, /AI_PLAN_LAYOUT_DB_FILE/);
  assert.match(backend, /prompt_library_exhibition_ai_plan_layout\.json/);
  assert.match(backend, /router\.get\('\/exhibition-ai-plan-layout\/presets'/);
  assert.match(backend, /router\.put\('\/exhibition-ai-plan-layout\/presets\/styles'/);
  assert.match(backend, /router\.put\('\/exhibition-ai-plan-layout\/presets\/requirements'/);
});
