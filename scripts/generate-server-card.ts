/* Regenerates public/.well-known/mcp/server-card.json from the hosted MCP
   server. Run after adding, removing, or re-describing a tool; the
   server-card test fails until the committed file matches. */

import '../src/lib/server/test-env.ts';

import { writeFile } from 'node:fs/promises';
import { SERVER_CARD_PATH, renderServerCard } from '../src/lib/server/server-card.ts';

await writeFile(SERVER_CARD_PATH, await renderServerCard());
console.log(`Wrote ${SERVER_CARD_PATH}`);
