import { authenticate, fail } from '@/lib/server/api-auth';
import { consolidateProjectMemories } from '@/lib/server/consolidate';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { memoryScope, readJson } from '@/lib/server/validate';

async function consolidateMemories(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');
  const parsedScope = memoryScope(body);
  if (!parsedScope.ok) return fail(400, parsedScope.error);
  const { projectId, branch, taskId } = parsedScope.value;

  const commit = body.commit === true;
  const result = await consolidateProjectMemories(auth.userId, {
    projectId,
    branch,
    taskId,
    commit,
  });
  return Response.json({
    clusterCount: result.clusters.length,
    merged: result.decisions.filter((decision) => decision.action === 'add').length,
    dryRun: !commit,
    commit,
    ...result,
  });
}

export const POST = withRequestTelemetry('memory.consolidate', consolidateMemories);
