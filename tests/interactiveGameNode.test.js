import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('interactive game script node is registered, executable, permissioned and documented', () => {
  const types = read('src/types/canvas.ts');
  const registry = read('src/config/nodeRegistry.ts');
  const ports = read('src/config/portTypes.ts');
  const handles = read('src/utils/connectionHandles.ts');
  const canvas = read('src/components/Canvas.tsx');
  const node = read('src/components/nodes/InteractiveGameScriptNode.tsx');
  const permissions = read('backend/src/auth/toolPermissions.js');
  const proxy = read('backend/src/routes/proxy.js');
  const documents = read('backend/src/routes/documents.js');
  const help = read('src/config/nodeHelpDefaults.ts');
  const features = JSON.parse(read('features.json'));

  assert.match(types, /\| 'interactive-game-script'/);
  assert.match(registry, /type:\s*'interactive-game-script'[\s\S]*label:\s*'互动游戏脚本'[\s\S]*category:\s*'core'/);
  assert.match(ports, /'interactive-game-script':\s*\{ inputs:\s*\['text', 'image'\], outputs:\s*\['text', 'image'\] \}/);
  assert.match(handles, /'interactive-game-script'[\s\S]*screens:\s*'image'[\s\S]*brief:\s*'text'/);
  assert.match(canvas, /'interactive-game-script': InteractiveGameScriptNode/);
  assert.match(canvas, /EXECUTABLE_NODE_TYPES[\s\S]*'interactive-game-script'/);
  assert.match(canvas, /'interactive-game-script':[\s\S]*gameUiImageProviderInitialized:\s*false[\s\S]*providerSource:\s*''/);
  assert.match(node, /sourceNodeType:\s*'interactive-game-script'/);
  assert.match(node, /Promise\.all\(Array\.from\(\{ length: Math\.min\(2,/);
  assert.match(node, /opGridCompose/);
  assert.match(node, /gameUiSheetUrl/);
  assert.match(node, /HotspotModal/);
  assert.match(node, /PrototypeModal/);
  assert.match(node, /max_tokens: Math\.min\(32000, 1800 \+ 8 \* 720\)/);
  assert.doesNotMatch(node, /SCRIPT_LLM_ATTEMPTS|generateScriptLlm/);
  assert.match(node, /advancedProvidersForNode/);
  assert.match(node, /gameUiImageProviderInitialized/);
  assert.match(node, /providerSource: firstImageProvider\.protocol[\s\S]*providerModel: models\[0\]/);
  assert.match(node, /<span>生图来源<\/span>/);
  assert.match(node, /<span>扩展模型<\/span>/);
  assert.match(node, /<span>图像模型<\/span>/);
  assert.match(permissions, /DEFAULT_VISIBLE_NODE_TYPES[\s\S]*'interactive-game-script'/);
  assert.match(proxy, /requireNodePermission\(\['llm', 'prompt-reverse', 'storyboard-grid', 'interactive-game-script'\]\)/);
  assert.match(documents, /game-ui\/export'[\s\S]*requireNodePermission\('interactive-game-script'\)/);
  assert.match(help, /'interactive-game-script': `# 互动游戏脚本/);
  assert.ok(features.executableNodeTypes.includes('interactive-game-script'));
});
