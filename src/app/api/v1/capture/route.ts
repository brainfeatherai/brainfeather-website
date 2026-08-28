import { authenticate, fail } from '@/lib/server/api-auth';
import { captureFromActivity } from '@/lib/server/capture';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import {
  decodeSession,
  encodeSession,
} from '@/lib/server/session';
import { readJson, SOURCES, oneOf, str } from '@/lib/server/validate';

async function captureActivity(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');

  const activity = str(body.activity, 'activity', { min: 3, max: 8000 });
  if (!activity.ok) return fail(400, activity.error);

  let projectId: string | undefined;
  if (body.projectId !== undefined) {
    const parsed = str(body.projectId, 'projectId', { min: 1, max: 64 });
    if (!parsed.ok) return fail(400, parsed.error);
    projectId = parsed.value;
  }

  let source: string | undefined;
  if (body.source !== undefined) {
    const parsed = oneOf(body.source, SOURCES, 'source');
    if (!parsed.ok) return fail(400, parsed.error);
    source = parsed.value;
  }

  let session;
  if (body.sessionToken !== undefined) {
    const parsed = str(body.sessionToken, 'sessionToken', { min: 8, max: 4000 });
    if (!parsed.ok) return fail(400, parsed.error);
    session = decodeSession(parsed.value, auth.userId);
    if (!session) return fail(400, 'sessionToken is invalid.');
    if (session.projectId && projectId && session.projectId !== projectId) {
      return fail(400, 'sessionToken belongs to a different project.');
    }
  }

  const result = await captureFromActivity(auth.userId, {
    activity: activity.value,
    projectId,
    source,
    session,
  });

  return Response.json({
    ...result,
    ...(result.session ? { sessionToken: encodeSession(result.session) } : {}),
  });
}

export const POST = withRequestTelemetry('memory.capture', captureActivity);
