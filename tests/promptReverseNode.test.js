import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('prompt reverse node is registered as an executable image-to-text node', () => {
  assert.match(read('src/types/canvas.ts'), /\| 'prompt-reverse'/);
  assert.match(read('src/config/nodeRegistry.ts'), /type: 'prompt-reverse'[^\n]*label: '提示词反推'/);
  assert.match(read('src/config/portTypes.ts'), /'prompt-reverse': \{ inputs: \['image', 'text'\], outputs: \['text'\] \}/);
  assert.match(read('src/components/Canvas.tsx'), /'prompt-reverse': PromptReverseNode/);
  assert.match(read('src/components/Canvas.tsx'), /EXECUTABLE_NODE_TYPES[\s\S]*'prompt-reverse'/);
  assert.match(read('backend/src/auth/toolPermissions.js'), /'prompt-reverse'/);
});

test('prompt reverse node strictly uses independent LLM configs and multimodal chat', () => {
  const node = read('src/components/nodes/PromptReverseNode.tsx');
  assert.match(node, /settings\.llmConfigs \|\| state\.settings\.llmApiKeys/);
  assert.match(node, /llmKeyId: activeConfig\?\.id/);
  assert.match(node, /sourceNodeType: 'prompt-reverse'/);
  assert.match(node, /generateLlm\(\{/);
  assert.match(node, /buildPromptReverseMessages\(\{ imageUrls, strength, language, instruction \}\)/);
  assert.match(node, /getResourceCategories\('image'\)/);
  assert.match(node, /getResourceItems\(\{ kind: 'image' \}\)/);
  assert.match(node, /mapPromptReverseWithConcurrency\(materials, 2/);
  assert.match(node, /buildImageEditorAnalysisMessages\(\{/);
  assert.match(node, /buildPromptReverseCachedCompositionMessages\(\{/);
  assert.match(node, /requestLegacyReverse\(imageUrls\)/);
  assert.match(node, /uploadDataUrl\(url, 'reverse-cache'\)/);
  assert.match(node, /uploadFileBlob\(blob,/);
  assert.match(node, /new CustomEvent\('penguin:resources-changed'\)/);
  assert.match(node, /buildPromptReverseContentSwapMessages\(\{/);
  assert.match(node, /cleanPromptReverseContentSwapOutput\(response\.content\)/);
  assert.doesNotMatch(node, /advancedProviders|generateExternalLlm/);
  assert.match(read('backend/src/routes/proxy.js'), /requireNodePermission\(\[[^\]]*'prompt-reverse'[^\]]*\]\)/);
});

test('content text input can manually or automatically replace reversed prompt semantics', () => {
  const node = read('src/components/nodes/PromptReverseNode.tsx');
  const handles = read('src/utils/connectionHandles.ts');
  const utility = read('src/utils/promptReverse.ts');
  assert.match(node, /id="content-text"[\s\S]*title="输入内容文本"/);
  assert.match(node, /role="switch"[\s\S]*aria-checked=\{contentSwapEnabled\}/);
  assert.match(node, />换内容<\/button>/);
  assert.match(node, /contentSwapEnabled[\s\S]*requestContentSwap\(reversePrompt, contentText\)/);
  assert.match(handles, /'prompt-reverse':[\s\S]*'content-text': 'text'/);
  assert.match(utility, /严格保留原提示词的视觉形式/);
  assert.match(utility, /彻底替换原提示词的语义内容/);
  assert.match(utility, /新内容文本是待视觉化的创作素材/);
  assert.match(utility, /准确解析文字层级/);
  assert.match(utility, /严禁在最终提示词中出现或保留/);
  assert.match(utility, /禁止的是回答格式标题/);
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
  assert.match(node, /<NodeHelpButton[\s\S]*nodeType="prompt-reverse"[\s\S]*title="查看提示词反推节点帮助"[\s\S]*size=\{16\}[\s\S]*z-\[70\][\s\S]*shrink-0/);
  for (const section of ['标题栏与端口', '识图素材区', '内容文本与换内容', '识图 LLM（来自独立配置）', '细节强度', '输出语言', '补充要求', '运行按钮', '反推结果区', '常见问题']) {
    assert.match(help, new RegExp(section));
  }
  for (const control of ['右上角问号图标', '拖动缩略图排序', '复制', '清空图标', '扩大编辑', '提示词模板入口']) {
    assert.match(help, new RegExp(control));
  }
});
