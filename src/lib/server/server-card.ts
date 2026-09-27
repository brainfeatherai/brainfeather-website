import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHostedMcpServer } from './hosted-mcp.ts';

/* Static MCP server card, served at /.well-known/mcp/server-card.json.

   Directories such as Smithery scan a server for its tools before listing
   it. /mcp requires a Brainfeather API key and has no OAuth, so a scanner
   that expects an OAuth sign-in stalls at "Authentication required". The
   card answers the same question without credentials (SEP-1649).

   It is generated from createHostedMcpServer through an in-memory client,
   not written by hand, so it describes exactly what the server registers.
   Listing tools and resources never touches Appwrite; the user and project
   ids below are placeholders that no request ever reads. */

export const SERVER_CARD_PATH = 'public/.well-known/mcp/server-card.json';

export async function buildServerCard() {
  const server = createHostedMcpServer('server-card', 'server-card');
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'server-card', version: '0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const { tools } = await client.listTools();
    const { resources } = await client.listResources();
    return {
      serverInfo: client.getServerVersion(),
      authentication: { required: true, schemes: ['bearer'] },
      tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
        name,
        ...(title ? { title } : {}),
        description,
        inputSchema,
        ...(annotations ? { annotations } : {}),
      })),
      resources: resources.map(({ uri, name, title, description, mimeType }) => ({
        uri,
        name,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(mimeType ? { mimeType } : {}),
      })),
      prompts: [],
    };
  } finally {
    await client.close();
  }
}

export async function renderServerCard(): Promise<string> {
  return `${JSON.stringify(await buildServerCard(), null, 2)}\n`;
}
