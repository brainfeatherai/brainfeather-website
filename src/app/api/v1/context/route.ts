/* ────────────────────────────────────────────────────────────────
   /api/v1/context

   The session-opening call. An agent asks this once, before it starts
   work, and gets everything it should already know about the project.

   Grouped rather than returned flat because the caller injects these
   into a prompt, where "decisions" and "conventions" carry different
   weight and want different framing. Regrouping a flat list client-side
   would mean every client reimplementing the same mapping.

   Compact by design: content strings only, no IDs or timestamps. This
   response goes into a context window, where every field costs tokens.
   Use /memories when you need the full records.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { compileContext, recallFetchLimit } from '@/lib/server/context-compiler';
import { listActive } from '@/lib/server/memory-store';
import { memoryEvidence } from '@/lib/server/memory-temporal';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import {
  decodeSession,
  markRecalled,
  needsProactiveRecall,
  startSession,
  tryEncodeSession,
} from '@/lib/server/session';
import { boundedInt, dateTime, memoryScope, str, strictScopeOf } from '@/lib/server/validate';

function signedSession(sessionToken?: string): { sessionToken?: string } {
  return sessionToken ? { sessionToken } : {};
}

const noStore = { headers: { 'Cache-Control': 'no-store, private' } };

function contextJson(body: object) {
  return Response.json(body, noStore);
}

async function getContext(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const params = new URL(request.url).searchParams;
  const includeEvidence = params.get('includeEvidence') === 'true';
  const parsedScope = memoryScope({
    projectId: params.get('projectId'),
    branch: params.get('branch'),
    taskId: params.get('taskId'),
  });
  if (!parsedScope.ok) return fail(400, parsedScope.error);
  const {
    projectId: requestedProjectId,
    branch: requestedBranch,
    taskId: requestedTaskId,
  } = parsedScope.value;
  const strictScope = strictScopeOf(params);
  let query: string | undefined;
  const rawQuery = params.get('query');
  if (rawQuery !== null) {
    const parsed = str(rawQuery, 'query', { min: 1, max: 200 });
    if (!parsed.ok) return fail(400, parsed.error);
    query = parsed.value;
  }
  let referenceAtMs: number | undefined;
  const rawReferenceAt = params.get('referenceAt');
  if (rawReferenceAt) {
    const parsed = dateTime(rawReferenceAt, 'referenceAt');
    if (!parsed.ok) return fail(400, parsed.error);
    referenceAtMs = parsed.ms;
  }
  const rawMaxTokens = params.get('maxTokens');
  const maxTokens = boundedInt(rawMaxTokens, 'maxTokens', {
    min: 256,
    max: 12_000,
    fallback: 4_000,
  });
  if (!maxTokens.ok) return fail(400, maxTokens.error);

  const rawSession =
    params.get('sessionToken') ?? request.headers.get('x-brainfeather-session');
  let session = rawSession ? decodeSession(rawSession, auth.userId) : null;
  if (rawSession && !session) return fail(400, 'sessionToken is invalid.');
  if (session && requestedProjectId && session.projectId !== requestedProjectId) {
    return fail(400, 'sessionToken belongs to a different project.');
  }
  if (session && requestedBranch && session.branch !== requestedBranch) {
    return fail(400, 'sessionToken belongs to a different branch.');
  }
  if (session && requestedTaskId && session.taskId !== requestedTaskId) {
    return fail(400, 'sessionToken belongs to a different task.');
  }
  const projectId = requestedProjectId ?? session?.projectId;
  const branch = requestedBranch ?? session?.branch;
  const taskId = requestedTaskId ?? session?.taskId;
  if (strictScope && !projectId) return fail(400, 'strictScope requires projectId.');
  if (!session) session = startSession(auth.userId, { projectId, branch, taskId });
  const proactive = needsProactiveRecall(session);
  session = markRecalled(session);

  /* Only active facts. A superseded decision reaching a prompt is the
     precise failure this product claims to prevent. */
  const all = await listActive(auth.userId, {
    projectId,
    branch,
    taskId,
    strictScope,
    limit: recallFetchLimit(maxTokens.value),
    referenceAtMs,
  });

  const sessionToken = tryEncodeSession(session);

  if (query !== undefined || rawMaxTokens !== null) {
    return contextJson({
      ...compileContext(all, {
        query,
        maxTokens: maxTokens.value,
        asOfMs: referenceAtMs,
        includeEvidence,
      }),
      ...signedSession(sessionToken),
      proactiveRecall: proactive,
    });
  }

  const rows = (...categories: string[]) =>
    all.filter((m) => categories.includes(m.category));
  const factRows = rows('context', 'project');
  const decisionRows = rows('decision');
  const patternRows = rows('code', 'preference');

  const facts = factRows.map((memory) => memory.content);
  const decisions = decisionRows.map((memory) => memory.content);
  const patterns = patternRows.map((memory) => memory.content);

  return contextJson({
    facts,
    decisions,
    patterns,
    counts: {
      facts: facts.length,
      decisions: decisions.length,
      patterns: patterns.length,
      total: facts.length + decisions.length + patterns.length,
    },
    ...(includeEvidence
      ? {
          evidence: {
            facts: factRows.map((memory) => memoryEvidence(memory.metadata) ?? null),
            decisions: decisionRows.map((memory) => memoryEvidence(memory.metadata) ?? null),
            patterns: patternRows.map((memory) => memoryEvidence(memory.metadata) ?? null),
          },
        }
      : {}),
    ...signedSession(sessionToken),
    proactiveRecall: proactive,
  });
}

export const runtime = 'nodejs';
export const GET = withRequestTelemetry('context.read', getContext);
