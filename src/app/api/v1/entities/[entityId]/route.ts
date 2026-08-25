/* ────────────────────────────────────────────────────────────────
   /api/v1/entities/[entityId]

   DELETE — remove a node. Cascades: edges touching the node are
   deleted with it, so no traversal ever renders a dangling endpoint.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { deleteEntity } from '@/lib/server/memory-store';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const { entityId } = await params;

  const removed = await deleteEntity(auth.userId, entityId);
  if (!removed) return fail(404, 'No such entity.');

  return Response.json({ deleted: entityId });
}
