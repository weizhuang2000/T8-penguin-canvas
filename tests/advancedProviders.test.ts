import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  DEFAULT_ADVANCED_PROVIDER_IDS,
  maskAdvancedProviders,
  normalizeAdvancedProviders,
  summarizeAdvancedProviders,
} = require('../backend/src/providers/registry.js');

test('normalizeAdvancedProviders migrates missing settings to disabled default provider cards', () => {
  const providers = normalizeAdvancedProviders(undefined);

  assert.deepEqual(
    providers.map((provider: any) => provider.id),
    DEFAULT_ADVANCED_PROVIDER_IDS,
  );
  assert.ok(providers.every((provider: any) => provider.enabled === false));
  assert.equal(providers.find((provider: any) => provider.id === 'modelscope')?.baseUrl, 'https://api-inference.modelscope.cn/v1');
  assert.equal(providers.find((provider: any) => provider.id === 'volcengine')?.baseUrl, 'https://ark.cn-beijing.volces.com/api/v3');
});

test('normalizeAdvancedProviders filters invalid providers and clamps unsafe fields', () => {
  const providers = normalizeAdvancedProviders([
    {
      id: '../bad',
      label: 'bad',
      protocol: 'modelscope',
      baseUrl: 'https://api-inference.modelscope.cn/v1',
    },
    {
      id: 'remote-comfy',
      label: 'Remote Comfy',
      protocol: 'comfyui',
      baseUrl: 'https://example.com',
      apiKey: 'should-not-matter',
    },
    {
      id: 'valid-openai',
      label: '  My OpenAI Compatible Provider With An Extremely Long Name That Should Be Trimmed  ',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1/',
      imageModels: ['gpt-image-1', 'bad\nmodel', 'x'.repeat(260), 'gpt-image-1'],
      videoModels: ['video-model'],
      chatModels: ['gpt-4o-mini'],
      unknownField: 'drop me',
    },
  ]);

  const provider = providers.find((item: any) => item.id === 'valid-openai');

  assert.ok(provider);
  assert.equal(provider.baseUrl, 'https://api.example.com/v1');
  assert.equal(provider.label.length <= 60, true);
  assert.deepEqual(provider.imageModels, ['gpt-image-1']);
  assert.equal('unknownField' in provider, false);
  assert.equal(providers.some((item: any) => item.id === '../bad'), false);
  assert.equal(providers.some((item: any) => item.id === 'remote-comfy'), false);
});

test('normalizeAdvancedProviders keeps multiple OpenAI compatible providers by id', () => {
  const providers = normalizeAdvancedProviders([
    {
      id: 'openai-compatible',
      label: 'Primary OpenAI',
      protocol: 'openai-compatible',
      enabled: true,
      baseUrl: 'https://api.primary.example/v1',
      apiKey: 'sk-primary',
      imageModels: ['gpt-image-primary'],
    },
    {
      id: 'openai-compatible-2',
      label: 'Backup OpenAI',
      protocol: 'openai-compatible',
      enabled: true,
      baseUrl: 'https://api.backup.example/v1',
      apiKey: 'sk-backup',
      imageModels: ['gpt-image-backup'],
    },
  ]);

  const openaiProviders = providers.filter((item: any) => item.protocol === 'openai-compatible');
  assert.deepEqual(openaiProviders.map((item: any) => item.id), ['openai-compatible', 'openai-compatible-2']);
  assert.equal(openaiProviders[0].baseUrl, 'https://api.primary.example/v1');
  assert.equal(openaiProviders[1].baseUrl, 'https://api.backup.example/v1');

  const masked = maskAdvancedProviders(providers).filter((item: any) => item.protocol === 'openai-compatible');
  assert.equal(masked[0].apiKey, '****mary');
  assert.equal(masked[1].apiKey, '****ckup');
});

test('normalizeAdvancedProviders supports Gemini compatible providers', () => {
  const providers = normalizeAdvancedProviders([
    {
      id: 'gemini-compatible-2',
      label: 'Gemini Images',
      protocol: 'gemini-compatible',
      enabled: true,
      baseUrl: 'https://ai.t8star.org/v1/',
      apiKey: 'gm-secret',
      imageModels: ['nano-banana-2'],
      chatModels: ['gemini-2.5-flash'],
    },
  ]);

  const gemini = providers.find((item: any) => item.id === 'gemini-compatible-2');
  assert.ok(gemini);
  assert.equal(gemini.protocol, 'gemini-compatible');
  assert.equal(gemini.baseUrl, 'https://ai.t8star.org/v1');
  assert.deepEqual(gemini.imageModels, ['nano-banana-2']);

  const masked = maskAdvancedProviders(providers).find((item: any) => item.id === 'gemini-compatible-2');
  assert.equal(masked?.apiKey, '****cret');
});

test('normalizeAdvancedProviders preserves stored secrets when incoming values are blank or masked', () => {
  const current = normalizeAdvancedProviders([
    {
      id: 'modelscope',
      protocol: 'modelscope',
      apiKey: 'ms-secret-123456',
      enabled: true,
    },
    {
      id: 'volcengine',
      protocol: 'volcengine',
      apiKey: 'ark-secret-abcdef',
      volcengineConfig: {
        accessKeyId: 'ak-secret-1111',
        secretAccessKey: 'sk-secret-2222',
      },
    },
  ]);

  const next = normalizeAdvancedProviders(
    [
      { id: 'modelscope', protocol: 'modelscope', apiKey: '****3456', enabled: true },
      {
        id: 'volcengine',
        protocol: 'volcengine',
        apiKey: '',
        volcengineConfig: {
          accessKeyId: '****1111',
          secretAccessKey: '',
        },
      },
    ],
    current,
  );

  assert.equal(next.find((item: any) => item.id === 'modelscope')?.apiKey, 'ms-secret-123456');
  const volc = next.find((item: any) => item.id === 'volcengine');
  assert.equal(volc?.apiKey, 'ark-secret-abcdef');
  assert.equal(volc?.volcengineConfig?.accessKeyId, 'ak-secret-1111');
  assert.equal(volc?.volcengineConfig?.secretAccessKey, 'sk-secret-2222');
});

test('maskAdvancedProviders hides secrets while preserving configuration status', () => {
  const providers = normalizeAdvancedProviders([
    {
      id: 'modelscope',
      protocol: 'modelscope',
      apiKey: 'ms-secret-123456',
      enabled: true,
    },
    {
      id: 'volcengine',
      protocol: 'volcengine',
      apiKey: 'ark-secret-abcdef',
      volcengineConfig: {
        accessKeyId: 'ak-secret-1111',
        secretAccessKey: 'sk-secret-2222',
      },
    },
  ]);

  const masked = maskAdvancedProviders(providers);
  const modelscope = masked.find((item: any) => item.id === 'modelscope');
  const volc = masked.find((item: any) => item.id === 'volcengine');

  assert.equal(modelscope?.apiKey, '****3456');
  assert.equal(modelscope?.hasApiKey, true);
  assert.equal(volc?.apiKey, '****cdef');
  assert.equal(volc?.volcengineConfig?.accessKeyId, '****1111');
  assert.equal(volc?.volcengineConfig?.secretAccessKey, '****2222');
  const serialized = JSON.stringify(masked);
  assert.equal(serialized.includes('ms-secret-123456'), false);
  assert.equal(serialized.includes('ark-secret-abcdef'), false);
  assert.equal(serialized.includes('ak-secret-1111'), false);
  assert.equal(serialized.includes('sk-secret-2222'), false);
});

test('summarizeAdvancedProviders reports enabled platforms, configured keys, and local tool readiness', () => {
  const providers = normalizeAdvancedProviders([
    { id: 'modelscope', protocol: 'modelscope', enabled: true, apiKey: 'ms-secret' },
    { id: 'comfyui-local', protocol: 'comfyui', enabled: true, baseUrl: 'http://127.0.0.1:8188' },
    { id: 'jimeng-local', protocol: 'jimeng-cli', enabled: false, jimengConfig: { executablePath: 'dreamina' } },
  ]);

  const summary = summarizeAdvancedProviders(providers);

  assert.equal(summary.enabledCount, 2);
  assert.equal(summary.configuredKeyCount, 1);
  assert.equal(summary.comfyuiConfigured, true);
  assert.equal(summary.jimengConfigured, true);
});

test('normalizeAdvancedProviders preserves ComfyUI workflow json and exposed field mappings', () => {
  const workflowJson = {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
  };
  const providers = normalizeAdvancedProviders([
    {
      id: 'comfyui',
      protocol: 'comfyui',
      enabled: true,
      baseUrl: 'http://127.0.0.1:8188',
      comfyuiConfig: {
        instances: ['http://127.0.0.1:8188'],
        workflows: [
          {
            id: 'workflow-1',
            name: 'Flux',
            workflowJson,
            fields: [{ nodeId: '1', fieldName: 'text', source: 'prompt' }],
          },
        ],
      },
    },
  ]);

  const workflow = providers.find((item: any) => item.id === 'comfyui')?.comfyuiConfig?.workflows?.[0];

  assert.deepEqual(workflow?.workflowJson, workflowJson);
  assert.deepEqual(workflow?.fields, [{ nodeId: '1', fieldName: 'text', source: 'prompt' }]);
});
