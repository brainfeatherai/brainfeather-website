/* ────────────────────────────────────────────────────────────────
   /api/v1/memories/[id]

   PATCH  — edit a fact, or retract it (status → 'invalid').
   DELETE — permanent removal.

   Distinct from superseding. Retraction (status: 'invalid') is what
   happens when a fact is replaced and stays auditable; DELETE is the
   caller explicitly discarding it.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { deleteMemory, updateMemory } from '@/lib/server/memory-store';
import { CATEGORIES, oneOf, readJson, str } from '@/lib/server/validate';

export async function PATCH(
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
    data.content = parsed.value;
  }

  if (body.category !== undefined) {
    const parsed = oneOf(body.category, CATEGORIES, 'category');
    if (!parsed.ok) return fail(400, parsed.error);
    data.category = parsed.value;
  }

  /* Retract and revive both go through here. A retraction without a
     replacement records 'dashboard' as the retractor, so the audit
     trail still says who retired the fact. */
  if (body.status !== undefined) {
    const parsed = oneOf(body.status, ['active', 'invalid'] as const, 'status');
    if (!parsed.ok) return fail(400, parsed.error);
    data.status = parsed.value;
    data.supersededBy =
      parsed.value === 'invalid'
        ? typeof body.supersededBy === 'string' && body.supersededBy.trim()
          ? body.supersededBy.trim().slice(0, 64)
          : 'dashboard'
        : '';
  }

  if (!Object.keys(data).length) {
    return fail(400, 'Nothing to update. Send content, category or status.');
  }

  try {
    /* Same 404-for-both rule as DELETE: "not found" and "not yours" are
       indistinguishable on purpose. */
    const updated = await updateMemory(auth.userId, id, data);
    if (!updated) return fail(404, 'No such memory.');
    return Response.json({ memory: updated });
  } catch (err) {
    console.error('[api/v1/memories/:id] patch failed:', err);
    return fail(500, 'Could not update the memory.');
  }
}

export async function DELETE(
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
  const removed = await deleteMemory(auth.userId, id);
  if (!removed) return fail(404, 'No such memory.');

  return Response.json({ deleted: id });
}
