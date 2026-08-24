/* ────────────────────────────────────────────────────────────────
   /api/v1/memories/[id]

   DELETE — permanent removal.

   Distinct from superseding. Retraction (status: 'invalid') is what
   happens when a fact is replaced and stays auditable; this is the
   caller explicitly discarding it. Only the latter is exposed as DELETE.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { deleteMemory } from '@/lib/server/memory-store';

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
