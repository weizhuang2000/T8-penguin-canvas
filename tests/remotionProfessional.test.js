import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {buildSkillContext, normalizeGenerationInput, selectSkillRules} = require('../backend/src/tools/remotion/skillPack');
const {generateConfiguredLlm, resolveLlmConfig} = require('../backend/src/providers/llmClient');
const manager = require('../backend/src/tools/remotion/generationManager');
const {validateTsxSource} = require('../backend/src/tools/remotion/tsxValidator');

const fakeSettings = {
  llmConfigs: [{id: 'writer', label: 'Writer', apiKey: 'secret-key', baseUrl: 'https://llm.example/v1', model: 'code-model', isDefault: true}],
  llmApiKeys: [],
  llmApiKey: '',
  llmBaseUrl: '',
  llmModel: '',
  zhenzhenBaseUrl: 'https://fallback.example',
};

const validTsx = `
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {GradientBackdrop, KineticText} from '@t8/remotion-kit';
export const GeneratedComposition: React.FC<any> = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return <AbsoluteFill><GradientBackdrop/><KineticText text={String(frame + fps)} /></AbsoluteFill>;
};`;

function waitForJob(id, timeout = 3000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const job = manager.getGenerationJob(id);
      if (job && ['success', 'error', 'cancelled'].includes(job.status)) return resolve(manager.publicJob(job));
      if (Date.now() - started > timeout) return reject(new Error('generation job timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

afterEach(() => manager.resetForTests());

test('Remotion skill router selects supported conditional rules and clips text context', () => {
  const ids = selectSkillRules({
    subject: '展示季度增长数据并使用场景转场',
    assets: [{kind: 'image'}, {kind: 'video'}, {kind: 'audio'}],
    profile: {duration: 8},
  });
  for (const id of ['animations', 'timing', 'sequencing', 'assets', 'security', 'text', 'images', 'videos', 'audio', 'transitions', 'charts']) {
    assert.equal(ids.includes(id), true, id);
  }
  const normalized = normalizeGenerationInput({texts: [{id: 'long', text: 'a'.repeat(100_000)}]});
  assert.equal(normalized.texts[0].text.length, 80_000);
  const skill = buildSkillContext({subject: '标题', assets: [], profile: {duration: 8}, stylePreset: 'tech'});
  assert.equal(skill.version, 't8-remotion-skill/v1');
  assert.match(skill.text, /useCurrentFrame/);
  assert.doesNotMatch(skill.text, /Lottie|React Three Fiber/);
});

test('reusable LLM client resolves only independent config and reports HTML upstream safely', async () => {
  const selected = resolveLlmConfig(fakeSettings, 'writer');
  assert.equal(selected.model, 'code-model');
  assert.equal(selected.keyId, 'writer');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><title>IIS 502</title></html>', {status: 502, headers: {'content-type': 'text/html'}});
  try {
    await assert.rejects(() => generateConfiguredLlm({
      settings: fakeSettings,
      llmKeyId: 'writer',
      messages: [{role: 'user', content: 'hello'}],
      retries: 0,
    }), (error) => {
      assert.match(error.message, /非 JSON.*HTTP 502/);
      assert.doesNotMatch(error.message, /secret-key/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('expert validator allows the internal professional kit while keeping frame hooks mandatory', () => {
  const result = validateTsxSource(validTsx);
  assert.equal(result.ok, true, result.errors.join('\n'));
  const unsafe = validTsx.replace("from '@t8/remotion-kit'", "from '@remotion/light-leaks'");
  assert.match(validateTsxSource(unsafe).errors.join('\n'), /禁止导入模块/);
});

test('standard generation job runs asynchronously with mocked independent LLM', async () => {
  const spec = JSON.stringify({
    version: 't8-remotion/v1',
    assets: [],
    scenes: [{id: 's1', start: 0, duration: 2, background: '#111827', transition: 'fade', layers: [{id: 't1', type: 'text', start: 0, duration: 2, x: 0, y: 0, width: 0.8, height: 0.3, text: 'Hello'}]}],
  });
  manager.setTestHooks({
    loadSettings: () => fakeSettings,
    generateLlm: async () => ({content: spec, model: 'code-model'}),
  });
  const created = manager.createGenerationJob({mode: 'json', quality: 'standard', llmKeyId: 'writer', subject: 'Hello', profile: {duration: 2}}, {id: 'u1', role: 'member'});
  const completed = await waitForJob(created.id);
  assert.equal(completed.status, 'success', completed.error);
  assert.match(completed.source, /t8-remotion\/v1/);
  assert.equal(manager.canAccess(manager.getGenerationJob(created.id), {id: 'u2', role: 'member'}), false);
  assert.equal(manager.canAccess(manager.getGenerationJob(created.id), {id: 'admin', role: 'admin'}), true);
});

test('professional generation performs visual review and falls back to text review', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-remotion-review-test-'));
  const contactSheet = path.join(dir, 'contact-sheet.jpg');
  fs.writeFileSync(contactSheet, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  let calls = 0;
  manager.setTestHooks({
    loadSettings: () => fakeSettings,
    renderStills: async () => ({contactSheet, frames: [1, 2, 3, 4, 5, 6]}),
    generateLlm: async (options) => {
      calls += 1;
      const system = String(options.messages?.[0]?.content || '');
      if (system.includes('动态视觉导演')) return {content: JSON.stringify({concept: '高级科技发布', scenes: []})};
      if (system.includes('动画工程师')) return {content: validTsx};
      if (system.includes('动态视觉总监')) {
        const content = options.messages?.[1]?.content;
        if (Array.isArray(content) && content.some((part) => part.type === 'image_url')) throw new Error('model does not support image input');
        return {content: JSON.stringify({score: 92, criticalIssues: [], summary: '层级清晰', revisedSource: ''})};
      }
      throw new Error('unexpected mocked call');
    },
  });
  try {
    const created = manager.createGenerationJob({mode: 'tsx', quality: 'professional', llmKeyId: 'writer', subject: '科技发布', profile: {duration: 2}}, {id: 'u1', role: 'member'});
    const completed = await waitForJob(created.id);
    assert.equal(completed.status, 'success', completed.error);
    assert.equal(completed.reviews[0].score, 92);
    assert.match(completed.warnings.join('\n'), /降级为文本审查/);
    assert.ok(calls >= 4);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('professional mode rejects JSON and queued/running generation can be cancelled', async () => {
  manager.setTestHooks({
    loadSettings: () => fakeSettings,
    generateLlm: ({signal}) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), {name: 'AbortError'})), {once: true})),
  });
  assert.throws(() => manager.createGenerationJob({mode: 'json', quality: 'professional', subject: 'x'}, {id: 'u1'}), /仅支持专家 TSX/);
  const created = manager.createGenerationJob({mode: 'tsx', quality: 'standard', llmKeyId: 'writer', subject: 'cancel me'}, {id: 'u1', role: 'member'});
  manager.cancelGenerationJob(manager.getGenerationJob(created.id));
  const completed = await waitForJob(created.id);
  assert.equal(completed.status, 'cancelled');
});

test('generation job routes use the standard envelope and enforce professional TSX', async () => {
  const express = require('express');
  const router = require('../backend/src/routes/remotion');
  const app = express();
  app.use(express.json({limit: '1mb'}));
  app.use((req, _res, next) => { req.user = {id: 'admin-1', role: 'admin'}; next(); });
  app.use('/api/remotion', router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const {port} = server.address();
    const invalid = await fetch(`http://127.0.0.1:${port}/api/remotion/generation-jobs`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({mode: 'json', quality: 'professional', subject: 'x'}),
    });
    const invalidPayload = await invalid.json();
    assert.equal(invalid.status, 400);
    assert.equal(invalidPayload.success, false);
    assert.match(invalidPayload.error, /专家 TSX/);
    const missing = await fetch(`http://127.0.0.1:${port}/api/remotion/generation-jobs/missing`);
    const missingPayload = await missing.json();
    assert.equal(missing.status, 404);
    assert.equal(missingPayload.success, false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('professional kit resolves through the Remotion bundler alias', {timeout: 60_000}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-remotion-kit-bundle-'));
  const publicDir = path.join(dir, 'public');
  const entryPoint = path.join(dir, 'index.tsx');
  fs.mkdirSync(publicDir, {recursive: true});
  fs.writeFileSync(entryPoint, `
import React from 'react';
import {Composition, registerRoot, AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {GradientBackdrop, KineticText, BarChart} from '@t8/remotion-kit';
const Demo: React.FC = () => { const frame=useCurrentFrame(); const {fps}=useVideoConfig(); return <AbsoluteFill><GradientBackdrop/><KineticText text={String(frame+fps)}/><BarChart data={[{label:'A',value:10}]}/></AbsoluteFill>; };
const Root=()=> <Composition id="T8Remotion" component={Demo} width={320} height={180} fps={24} durationInFrames={24}/>;
registerRoot(Root);`, 'utf8');
  try {
    const {bundle} = require('@remotion/bundler');
    const serveUrl = await bundle({
      entryPoint,
      publicDir,
      enableCaching: false,
      webpackOverride: (configuration) => ({
        ...configuration,
        resolve: {
          ...(configuration.resolve || {}),
          modules: [path.join(process.cwd(), 'node_modules'), ...((configuration.resolve && configuration.resolve.modules) || ['node_modules'])],
          alias: {...((configuration.resolve && configuration.resolve.alias) || {}), '@t8/remotion-kit': path.join(process.cwd(), 'remotion', 'ProKit.tsx')},
        },
      }),
    });
    assert.equal(typeof serveUrl, 'string');
    assert.ok(serveUrl.length > 0);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('optional real worker renders six professional stills and a contact sheet', {skip: process.env.T8_RUN_REMOTION_SMOKE !== '1', timeout: 10 * 60_000}, async () => {
  const root = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't8-remotion-stills-smoke-'));
  const publicDir = path.join(dir, 'public');
  const outputDir = path.join(dir, 'stills');
  fs.mkdirSync(publicDir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'GeneratedComposition.tsx'), validTsx, 'utf8');
  fs.writeFileSync(path.join(dir, 'index.tsx'), `
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {GeneratedComposition} from './GeneratedComposition';
const Root=()=> <Composition id="T8Remotion" component={GeneratedComposition as React.FC<any>} width={320} height={180} fps={24} durationInFrames={24} defaultProps={{assets:[],profile:{width:320,height:180,fps:24,duration:1,durationInFrames:24},subject:'smoke'}}/>;
registerRoot(Root);`, 'utf8');
  const requestFile = path.join(dir, 'request.json');
  fs.writeFileSync(requestFile, JSON.stringify({
    operation: 'stills',
    entryPoint: path.join(dir, 'index.tsx'),
    publicDir,
    outputDir,
    frames: [1, 4, 8, 12, 18, 22],
    scale: 0.25,
    inputProps: {assets: [], profile: {width: 320, height: 180, fps: 24, duration: 1, durationInFrames: 24}, subject: 'smoke'},
    nodeModulesDir: path.join(root, 'node_modules'),
    proKitPath: path.join(root, 'remotion', 'ProKit.tsx'),
    browserCacheDir: path.join(os.tmpdir(), 't8-remotion-smoke-browser-cache'),
  }), 'utf8');
  try {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(root, 'electron', 'remotion-worker.cjs'), requestFile], {cwd: root, windowsHide: true});
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => resolve({code, stdout, stderr}));
    });
    assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
    assert.equal(fs.existsSync(path.join(outputDir, 'contact-sheet.jpg')), true);
    assert.equal(fs.readdirSync(outputDir).filter((name) => name.endsWith('.png')).length, 6);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
