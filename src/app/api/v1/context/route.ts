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
import { compileContext } from '@/lib/server/context-compiler';
import { listActive } from '@/lib/server/memory-store';
import { memoryEvidence } from '@/lib/server/memory-temporal';
import { PREFERRED_REGION } from '@/lib/server/region';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import {
  decodeSession,
  markRecalled,
  needsProactiveRecall,
  startSession,
  tryEncodeSession,
} from '@/lib/server/session';
import { boundedInt, dateTime, str, strictScopeOf } from '@/lib/server/validate';

function signedSession(sessionToken?: string): { sessionToken?: string } {
  return sessionToken ? { sessionToken } : {};
}

async function getContext(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const params = new URL(request.url).searchParams;
  const includeEvidence = params.get('includeEvidence') === 'true';
  const requestedProjectId = params.get('projectId') ?? undefined;
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
  if (
    session?.projectId &&
    requestedProjectId &&
    session.projectId !== requestedProjectId
  ) {
    return fail(400, 'sessionToken belongs to a different project.');
  }
  const projectId = requestedProjectId ?? session?.projectId;
  if (strictScope && !projectId) return fail(400, 'strictScope requires projectId.');
  if (!session) session = startSession(auth.userId, projectId);
  const proactive = needsProactiveRecall(session);
  session = markRecalled(session);

  /* Only active facts. A superseded decision reaching a prompt is the
     precise failure this product claims to prevent. */
  /* Hook recall asks for a tight token budget. Fetch fewer rows so decrypt
     stays on the prompt's critical path. Explicit tool calls keep the full window. */
  const recallLimit = maxTokens.value <= 1_600 ? 40 : 100;
  const all = await listActive(auth.userId, {
    projectId,
    strictScope,
    limit: recallLimit,
    referenceAtMs,
  });

  const sessionToken = tryEncodeSession(session);

  if (query !== undefined || rawMaxTokens !== null) {
    return Response.json({
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

  return Response.json({
    facts,
    decisions,
    patterns,
    counts: {
      facts: facts.length,
      decisions: decisions.length,
      patterns: patterns.length,
      total: all.length,
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

export const preferredRegion = PREFERRED_REGION;
export const runtime = 'nodejs';
export const GET = withRequestTelemetry('context.read', getContext);
