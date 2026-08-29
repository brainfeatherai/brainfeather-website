import { authenticate, fail } from '@/lib/server/api-auth';
import { handleHostedMcp, HOSTED_MCP_CORS } from '@/lib/server/hosted-mcp';
import { PREFERRED_REGION } from '@/lib/server/region';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { str } from '@/lib/server/validate';

export const runtime = 'nodejs';
export const preferredRegion = PREFERRED_REGION;
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
  if (!auth.ok) return fail(auth.status, auth.error);

  const projectIdHeader = request.headers.get('x-brainfeather-project');
  const projectIdParam = new URL(request.url).searchParams.get('projectId');
  const rawProject = projectIdHeader ?? projectIdParam;
  if (!rawProject) {
    return fail(
      400,
      'Hosted MCP needs x-brainfeather-project (or ?projectId=) because there is no local workspace root.',
    );
  }
  const parsed = str(rawProject, 'projectId', { min: 1, max: 64 });
  if (!parsed.ok) return fail(400, parsed.error);

  return handleHostedMcp(request, auth.userId, parsed.value);
}

function withMcpAccess(
  handler: typeof mcp,
): typeof mcp {
  return async (request) => withCors(await withRequestTelemetry('mcp.http', handler)(request));
}

export const GET = withMcpAccess(mcp);
export const POST = withMcpAccess(mcp);
export const DELETE = withMcpAccess(mcp);
export const OPTIONS = mcp;
