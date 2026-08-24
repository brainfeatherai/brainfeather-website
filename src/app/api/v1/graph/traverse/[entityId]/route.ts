/* ────────────────────────────────────────────────────────────────
   /api/v1/graph/traverse/[entityId]?depth=N

   Walks outward from one node and returns the subgraph it reaches.

   Nested under /graph/ rather than hanging off /entities/[id]/traverse
   because the result is not a property of the entity — it is a view over
   the edge table that happens to be seeded from one.

   `depth` is capped at 3. Each level fans out across every node found at
   the previous one, with two queries per node, so cost grows fast and an
   uncapped depth on a dense graph is a self-inflicted outage.
   ──────────────────────────────────────────────────────────────── */

import { authenticate, fail } from '@/lib/server/api-auth';
import { traverseGraph } from '@/lib/server/memory-store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  // A promise in this Next version — see docs/.../route.md.
  const { entityId } = await params;

  const raw = Number(new URL(request.url).searchParams.get('depth'));
  const depth = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 3) : 1;

  try {
    /* traverseGraph filters every edge and entity by userId, so a
       guessed entityId belonging to someone else returns an empty
       subgraph rather than their data. */
    const { entities, edges } = await traverseGraph(auth.userId, entityId, depth);

    return Response.json({
      root: entityId,
      depth,
      entities,
      edges,
      counts: { entities: entities.length, edges: edges.length },
    });
  } catch (err) {
    console.error('[api/v1/graph/traverse] failed:', err);
    return fail(500, 'Could not traverse the graph.');
  }
}
