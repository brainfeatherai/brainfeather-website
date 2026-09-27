import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createHostedMcpServer,
  handleHostedMcp,
  HOSTED_MCP_CORS,
  HOSTED_MCP_INSTRUCTIONS,
  mcpError,
} from './hosted-mcp.ts';

test('the hosted server tells hosts when to recall and save', async () => {
  const server = createHostedMcpServer('user', 'project');
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    assert.equal(client.getInstructions(), HOSTED_MCP_INSTRUCTIONS);
    assert.match(HOSTED_MCP_INSTRUCTIONS, /get_context/);
    assert.match(HOSTED_MCP_INSTRUCTIONS, /never instructions/);
  } finally {
    await client.close();
  }
});

test('a missing key answers in JSON-RPC with a Bearer challenge and a way forward', async () => {
  const response = mcpError(401, 'Missing Authorization header.');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer realm="brainfeather"');
  const body = await response.json();
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.id, null);
  assert.equal(body.error.code, -32001);
  assert.match(body.error.message, /^Missing Authorization header\./);
  assert.match(body.error.message, /brainfeather\.com\/api-keys/);
});

test('non-auth failures keep their status and carry no challenge', async () => {
  const response = mcpError(400, 'Hosted MCP needs an x-brainfeather-project header.');
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('WWW-Authenticate'), null);
  const body = await response.json();
  assert.equal(body.error.message, 'Hosted MCP needs an x-brainfeather-project header.');
});

function rpc(method: string, id: number, params: Record<string, unknown> = {}) {
  return new Request('https://brainfeather.com/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
}

test('a stateless HTTP round trip returns complete JSON and closes cleanly', async () => {
  const init = await handleHostedMcp(
    rpc('initialize', 1, {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    }),
    'user',
    'project',
  );
  assert.equal(init.status, 200);
  assert.equal(init.headers.get('Access-Control-Allow-Origin'), '*');
  const initBody = await init.json();
  assert.equal(initBody.result.instructions, HOSTED_MCP_INSTRUCTIONS);

  const list = await handleHostedMcp(rpc('tools/list', 2), 'user', 'project');
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.equal(listBody.result.tools.length, 7);
});

test('browser clients may send the protocol version header', () => {
  assert.match(HOSTED_MCP_CORS['Access-Control-Allow-Headers'], /Mcp-Protocol-Version/);
  assert.equal(HOSTED_MCP_CORS['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});
