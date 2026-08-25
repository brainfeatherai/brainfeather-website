/* ────────────────────────────────────────────────────────────────
   /api/v1/edges/[edgeId]

   DELETE — remove one link between two nodes.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { deleteEdge } from '@/lib/server/memory-store';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ edgeId: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const { edgeId } = await params;

  const removed = await deleteEdge(auth.userId, edgeId);
  if (!removed) return fail(404, 'No such edge.');

  return Response.json({ deleted: edgeId });
}
