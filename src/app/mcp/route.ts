import { authenticate } from '@/lib/server/api-auth';
import { handleHostedMcp, HOSTED_MCP_CORS, mcpError } from '@/lib/server/hosted-mcp';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { memoryScope } from '@/lib/server/validate';

export const runtime = 'nodejs';
export const maxDuration = 30;

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(HOSTED_MCP_CORS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

async function mcp(request: Request) {
  if (request.method === 'OPTIONS') {
    return handleHostedMcp(request, '', '');
  }

  const auth = await authenticate(request);
  if (!auth.ok) return mcpError(auth.status, auth.error);

  const projectIdHeader = request.headers.get('x-brainfeather-project');
  const projectIdParam = new URL(request.url).searchParams.get('projectId');
  const rawProject = projectIdHeader ?? projectIdParam;
  if (!rawProject) {
    return mcpError(
      400,
      'Hosted MCP needs an x-brainfeather-project header (or ?projectId=) naming the repository, because there is no local workspace root.',
    );
  }
  const parsed = memoryScope({ projectId: rawProject });
  if (!parsed.ok) return mcpError(400, parsed.error);

  return handleHostedMcp(request, auth.userId, parsed.value.projectId!);
}

function withMcpAccess(
  handler: typeof mcp,
): typeof mcp {
  return async (request) =>
    withCors(await withRequestTelemetry('mcp.http', handler, mcpError)(request));
}

/* Stateless server: there is no session to stream to or delete. Answering
   GET before auth also stops clients that probe for an SSE stream from
   holding a function open until maxDuration. */
function methodNotAllowed() {
  return withCors(
    Response.json(
      { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Send JSON-RPC over POST.' }, id: null },
      { status: 405, headers: { Allow: 'POST, OPTIONS' } },
    ),
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const POST = withMcpAccess(mcp);
export const OPTIONS = mcp;
