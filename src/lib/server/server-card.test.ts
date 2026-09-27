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

/* Directory scanners grade tools on this metadata, and clients use the hints
   to decide which calls need confirmation. */
test('every hosted tool has a title, behaviour hints and described parameters', async () => {
  const card = await buildServerCard();
  for (const tool of card.tools) {
    assert.ok(tool.title, `${tool.name} has no title`);
    assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean', `${tool.name} has no readOnlyHint`);
    const properties = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
    for (const [key, schema] of Object.entries(properties)) {
      assert.ok(schema.description, `${tool.name}.${key} has no description`);
    }
  }
  const destructive = card.tools.filter((tool) => tool.annotations?.destructiveHint).map(({ name }) => name);
  assert.deepEqual(destructive, ['forget_memory']);
});
