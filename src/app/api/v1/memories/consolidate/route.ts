import { authenticate, fail } from '@/lib/server/api-auth';
import { consolidateProjectMemories } from '@/lib/server/consolidate';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { readJson, str } from '@/lib/server/validate';

async function consolidateMemories(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = (await readJson(request)) ?? {};
  let projectId: string | undefined;
  if (body.projectId !== undefined) {
    const parsed = str(body.projectId, 'projectId', { min: 1, max: 64 });
    if (!parsed.ok) return fail(400, parsed.error);
    projectId = parsed.value;
  }

  const dryRun = body.dryRun === true;
  const result = await consolidateProjectMemories(auth.userId, { projectId, dryRun });
  return Response.json({
    clusterCount: result.clusters.length,
    merged: result.decisions.filter((decision) => decision.action === 'add').length,
    dryRun,
    ...result,
  });
}

export const POST = withRequestTelemetry('memory.consolidate', consolidateMemories);
