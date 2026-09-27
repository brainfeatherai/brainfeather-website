import { authenticate, fail } from '@/lib/server/api-auth';
import { captureFromActivity } from '@/lib/server/capture';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import {
  decodeSession,
  startSession,
  tryEncodeSession,
} from '@/lib/server/session';
import { memoryScope, readJson, SOURCES, oneOf, str } from '@/lib/server/validate';

async function captureActivity(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');

  const activity = str(body.activity, 'activity', { min: 3, max: 8000 });
  if (!activity.ok) return fail(400, activity.error);

  const parsedScope = memoryScope(body);
  if (!parsedScope.ok) return fail(400, parsedScope.error);
  let { projectId, branch, taskId } = parsedScope.value;

  let source: string | undefined;
  if (body.source !== undefined) {
    const parsed = oneOf(body.source, SOURCES, 'source');
    if (!parsed.ok) return fail(400, parsed.error);
    source = parsed.value;
  }

  const rawSessionValue =
    body.sessionToken !== undefined
      ? body.sessionToken
      : request.headers.get('x-brainfeather-session');
  let session;
  if (rawSessionValue != null && rawSessionValue !== '') {
    const parsed = str(rawSessionValue, 'sessionToken', { min: 8, max: 4000 });
    if (!parsed.ok) return fail(400, parsed.error);
    session = decodeSession(parsed.value, auth.userId);
    if (!session) return fail(400, 'sessionToken is invalid.');
    if (projectId && session.projectId !== projectId) {
      return fail(400, 'sessionToken belongs to a different project.');
    }
    if (branch && session.branch !== branch) {
      return fail(400, 'sessionToken belongs to a different branch.');
    }
    if (taskId && session.taskId !== taskId) {
      return fail(400, 'sessionToken belongs to a different task.');
    }
  }
  projectId ??= session?.projectId;
  branch ??= session?.branch;
  taskId ??= session?.taskId;
  if (!session) session = startSession(auth.userId, { projectId, branch, taskId });

  const result = await captureFromActivity(auth.userId, {
    activity: activity.value,
    projectId,
    branch,
    taskId,
    source,
    session,
  });
  const sessionToken = result.session ? tryEncodeSession(result.session) : undefined;

  return Response.json({
    candidates: result.candidates,
    queued: result.queued,
    saved: result.saved,
    duplicates: result.duplicates,
    rejected: result.rejected,
    ...(sessionToken ? { sessionToken } : {}),
  });
}

export const runtime = 'nodejs';
export const POST = withRequestTelemetry('memory.capture', captureActivity);
