import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const route = require('../backend/src/routes/qoderCli.js');
const express = require('../backend/node_modules/express');

test('Qoder MCP bridge exposes one narrow image tool', () => {
  const tool = route._qoderToolDefinitionForTests();
  assert.equal(tool.name, 'generate_image');
  assert.deepEqual(tool.inputSchema.required, ['prompt']);
  assert.equal(tool.inputSchema.properties.count.maximum, 4);
  assert.equal(tool.inputSchema.additionalProperties, false);
});

test('Qoder MCP bridge contexts are ephemeral in-memory records', () => {
  assert.ok(route._bridgeContextsForTests instanceof Map);
  assert.equal(route._bridgeContextsForTests.size, 0);
});

test('Qoder MCP HTTP initialization requires a valid one-time bearer token', async () => {
  const app = express();
  app.use(express.json());
  app.use(route.internalRouter);
  const server = await new Promise<any>((resolve) => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next));
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/mcp`;
  try {
    const denied = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }),
    });
    assert.equal(denied.status, 401);

    const token = 'test-qoder-token';
    route._bridgeContextsForTests.set(token, {
      createdAt: Date.now(),
      sessionId: 'test-session',
      body: {},
      signal: new AbortController().signal,
    });
    const accepted = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2024-11-05' } }),
    });
    assert.equal(accepted.status, 200);
    const payload = await accepted.json();
    assert.equal(payload.result.serverInfo.name, 't8-image');
    assert.equal(accepted.headers.get('mcp-session-id'), 'test-session');
    route._bridgeContextsForTests.delete(token);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
