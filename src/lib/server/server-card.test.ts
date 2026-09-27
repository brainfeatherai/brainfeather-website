import './test-env.ts';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SERVER_CARD_PATH, buildServerCard, renderServerCard } from './server-card.ts';

test('the published server card matches the hosted MCP server', async () => {
  const committed = await readFile(SERVER_CARD_PATH, 'utf8');
  assert.equal(
    committed,
    await renderServerCard(),
    'server-card.json is stale: run `npm run mcp:server-card` and commit the result',
  );
});

test('the server card lists every hosted tool with an input schema', async () => {
  const card = await buildServerCard();
  assert.deepEqual(
    card.tools.map(({ name }) => name).sort(),
    [
      'capture_activity',
      'forget_memory',
      'get_context',
      'list_entities',
      'save_memory',
      'search_memory',
      'traverse_graph',
    ],
  );
  for (const tool of card.tools) {
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} has no object input schema`);
    assert.ok(tool.description, `${tool.name} has no description`);
  }
  assert.equal(card.authentication.required, true);
});
