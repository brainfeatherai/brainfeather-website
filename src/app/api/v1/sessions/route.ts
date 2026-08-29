import { authenticate, fail } from '@/lib/server/api-auth';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import {
  decodeSession,
  encodeSession,
  startSession,
} from '@/lib/server/session';
import { readJson, str } from '@/lib/server/validate';

async function createSession(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = (await readJson(request)) ?? {};
  let projectId: string | undefined;
  if (body.projectId !== undefined) {
    const parsed = str(body.projectId, 'projectId', { min: 1, max: 64 });
    if (!parsed.ok) return fail(400, parsed.error);
    projectId = parsed.value;
  }

  const session = startSession(auth.userId, projectId);
  return Response.json({
    session,
    token: encodeSession(session),
    recall: true,
  });
}

async function readSession(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const token =
    new URL(request.url).searchParams.get('token') ??
    request.headers.get('x-brainfeather-session');
  if (!token) return fail(400, 'session token is required.');
  const session = decodeSession(token, auth.userId);
  if (!session) return fail(400, 'session token is invalid.');
  return Response.json({ session, token: encodeSession(session) });
}

export const POST = withRequestTelemetry('session.create', createSession);
export const GET = withRequestTelemetry('session.read', readSession);
