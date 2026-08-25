/* ────────────────────────────────────────────────────────────────
   /api/v1/memories/[id]

   PATCH  — edit a fact, or retract it (status → 'invalid').
   DELETE — permanent removal.

   Distinct from superseding. Retraction (status: 'invalid') is what
   happens when a fact is replaced and stays auditable; DELETE is the
   caller explicitly discarding it.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { deleteMemory, syncMentionEdges, updateMemory } from '@/lib/server/memory-store';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { enrichMemory } from '@/lib/server/think';
import { CATEGORIES, oneOf, readJson, secretReason, str } from '@/lib/server/validate';

async function updateMemoryRoute(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const { id } = await params;
  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');

  const data: {
    content?: string;
    category?: string;
    status?: 'active' | 'invalid';
    supersededBy?: string;
  } = {};

  if (body.content !== undefined) {
    const parsed = str(body.content, 'content', { min: 3, max: 2000 });
    if (!parsed.ok) return fail(400, parsed.error);
    const unsafe = secretReason(parsed.value);
    if (unsafe) return fail(400, `Refusing to store memory: ${unsafe}.`);
    data.content = parsed.value;
  }

  if (body.category !== undefined) {
    const parsed = oneOf(body.category, CATEGORIES, 'category');
    if (!parsed.ok) return fail(400, parsed.error);
    data.category = parsed.value;
  }

  const projectId = new URL(request.url).searchParams.get('projectId') ?? undefined;

  /* Retract and revive both go through here. A retraction without a
     replacement records 'dashboard' as the retractor, so the audit
     trail still says who retired the fact. */
  if (body.status !== undefined) {
    const parsed = oneOf(body.status, ['active', 'invalid'] as const, 'status');
    if (!parsed.ok) return fail(400, parsed.error);
    data.status = parsed.value;
    data.supersededBy = parsed.value === 'invalid' ? 'dashboard' : '';
  }

  if (!Object.keys(data).length) {
    return fail(400, 'Nothing to update. Send content, category or status.');
  }

  try {
    /* Same 404-for-both rule as DELETE: "not found" and "not yours" are
       indistinguishable on purpose. */
    const updated = await updateMemory(auth.userId, id, data, projectId);
    if (!updated) return fail(404, 'No such memory.');

    if (updated.status === 'active' && (data.content !== undefined || data.status === 'active')) {
      await enrichMemory(auth.userId, id, updated.content).catch((err) => {
        reportServerError(err, {
          operation: 'memory.enrich_after_update',
          route: '/api/v1/memories/:id',
          userId: auth.userId,
          resourceId: id,
        });
      });
    } else if (data.status === 'invalid') {
      await syncMentionEdges(auth.userId, id, []).catch((err) => {
        reportServerError(err, {
          operation: 'memory.close_links_after_retract',
          route: '/api/v1/memories/:id',
          userId: auth.userId,
          resourceId: id,
        });
      });
    }

    return Response.json({ memory: updated });
  } catch (err) {
    reportServerError(err, {
      operation: 'memory.update',
      route: '/api/v1/memories/:id',
      userId: auth.userId,
      resourceId: id,
    });
    return fail(500, 'Could not update the memory.');
  }
}

async function deleteMemoryRoute(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  // A promise in this Next version — see docs/.../route.md.
  const { id } = await params;

  /* deleteMemory verifies ownership and returns false for both "not
     found" and "belongs to someone else". Reporting 404 for both is
     deliberate: distinguishing them would confirm the existence of
     another user's records. */
  const projectId = new URL(request.url).searchParams.get('projectId') ?? undefined;
  const removed = await deleteMemory(auth.userId, id, projectId);
  if (!removed) return fail(404, 'No such memory.');

  return Response.json({ deleted: id });
}

export const PATCH = withRequestTelemetry('memory.update', updateMemoryRoute);
export const DELETE = withRequestTelemetry('memory.delete', deleteMemoryRoute);
