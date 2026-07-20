import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runner = require('../backend/src/utils/qoderCliRunner.js');

test('Qoder CLI arguments preserve user login while using stream-json, attachments and the strict T8 MCP tool', () => {
  const args = runner.buildQoderArgs({
    configDir: 'C:\\tmp\\qoder-config',
    workspaceDir: 'C:\\tmp\\qoder-workspace',
    mcpConfigPath: 'C:\\tmp\\qoder-config\\mcp.json',
    attachments: ['C:\\tmp\\qoder-workspace\\inputs\\one.png'],
    model: 'qwen-test',
    prompt: '生成一张图片',
  });
  assert.deepEqual(args.slice(0, 2), ['--cwd', 'C:\\tmp\\qoder-workspace']);
  assert.ok(!args.includes('--config-dir'));
  assert.ok(args.includes('stream-json'));
  assert.ok(args.includes('--no-session-persistence'));
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(args.includes('mcp__t8-image__generate_image'));
  assert.ok(args.includes('--attachment'));
  assert.ok(args.includes('qwen-test'));
  assert.equal(args.at(-1), '生成一张图片');
});

test('Qoder stream parser extracts SDK text deltas and plain JSON lines', () => {
  const event = runner.parseQoderJsonLine(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: '完成' } },
  }));
  assert.equal(runner.extractQoderTextDelta(event), '完成');
  assert.equal(runner.parseQoderJsonLine('{bad').type, 'raw');
});

test('explicit executable path wins over environment and PATH candidates', () => {
  const candidates = runner.findQoderCandidates('D:\\tools\\qodercli.exe', {
    platform: 'win32',
    env: {
      USERPROFILE: 'C:\\Users\\tester',
      PATH: '',
      T8_QODER_CLI_PATH: 'C:\\env\\qodercli.exe',
    },
  });
  assert.equal(candidates[0], 'D:\\tools\\qodercli.exe');
  assert.equal(candidates.at(-1), 'qodercli');
});
