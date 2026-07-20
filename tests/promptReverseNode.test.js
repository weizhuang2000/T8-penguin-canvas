import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('prompt reverse node is registered as an executable image-to-text node', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'prompt-reverse'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'prompt-reverse'[^\n]*label: '提示词反推'/);
  assert.match(read('src/config/portTypes.ts'), /'prompt-reverse': \{ inputs: \['image'\], outputs: \['text'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /'prompt-reverse': PromptReverseNode/);
  assert.match(read('src/components/Canvas.tsx'), /'llm', 'prompt-reverse', 'remotion-animation'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'prompt-reverse'/);
});

test('prompt reverse node strictly uses independent LLM configs and multimodal chat', () => {
  const node = read('src/components/nodes/PromptReverseNode.tsx');
  assert.match(node, /settings\.llmConfigs \|\| state\.settings\.llmApiKeys/);
  assert.match(node, /llmKeyId: activeConfig\?\.id/);
  assert.match(node, /sourceNodeType: 'prompt-reverse'/);
  assert.match(node, /generateLlm\(\{/);
  assert.match(node, /buildPromptReverseMessages\(\{ imageUrls, strength, language, instruction \}\)/);
  assert.doesNotMatch(node, /advancedProviders|generateExternalLlm/);
  assert.match(read('backend/src/routes/proxy.js'), /requireNodePermission\(\['llm', 'prompt-reverse'\]\)/);
});

test('prompt builder exposes four strength levels and GPT Image 2 constraints', () => {
  const utility = read('src/utils/promptReverse.ts');
  for (const strength of ['concise', 'standard', 'detailed', 'extreme']) {
    assert.match(utility, new RegExp(`value: '${strength}'`));
  }
  assert.match(utility, /GPT Image 2/);
  assert.match(utility, /不要使用 Midjourney 参数、Stable Diffusion 权重/);
  assert.match(utility, /图 1 作为主体画面/);
  assert.match(utility, /只输出一条提示词/);
});

test('generated prompt is published through standard downstream text fields', () => {
  const node = read('src/components/nodes/PromptReverseNode.tsx');
  assert.match(node, /prompt,\s*outputText: prompt,\s*text: prompt/);
  assert.match(node, /promptTemplateKind="image"/);
  assert.match(node, /useRunTrigger\(id, \(\) => runReverse\(true\), 'llm'\)/);
});

test('node exposes the standard help icon with detailed control documentation', () => {
  const node = read('src/components/nodes/PromptReverseNode.tsx');
  const help = read('src/config/nodeHelpDefaults.ts');
  assert.match(node, /<NodeHelpButton nodeType="prompt-reverse" \/>/);
  for (const section of ['标题栏与端口', '识图素材区', '识图 LLM（来自独立配置）', '细节强度', '输出语言', '补充要求', '运行按钮', '反推结果区', '常见问题']) {
    assert.match(help, new RegExp(section));
  }
  for (const control of ['右上角问号图标', '拖动缩略图排序', '复制', '清空图标', '扩大编辑', '提示词模板入口']) {
    assert.match(help, new RegExp(control));
  }
});
