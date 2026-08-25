/* ────────────────────────────────────────────────────────────────
   /api/v1/edges

   GET  — list edges. Superseded edges (validTo set) are returned too:
          the dashboard filters them, same rule as memories.status.
   POST — link two nodes.

   Endpoints are IDs of either kind: a memory or an entity. think()
   creates memory→entity 'mentioned_in' links automatically; POST is for
   asserting a relationship by hand, e.g. entity→entity 'depends_on'.

   `weight` is accepted as 0-1 and stored as an integer 0-10 — Appwrite
   has no float attribute type. That conversion lives in the store so
   every caller expresses weight the same way.
   ──────────────────────────────────────────────────────────────── */

import { Query } from 'node-appwrite';
import { authenticate, fail } from '@/lib/server/api-auth';
import { adminDb, DATABASE_ID, COLLECTIONS } from '@/lib/server/appwrite-admin';
import { createEdge } from '@/lib/server/memory-store';
import { EDGE_TYPES, oneOf, readJson, str } from '@/lib/server/validate';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const limit = Math.min(
    Math.max(Number(new URL(request.url).searchParams.get('limit')) || 300, 1),
    500,
  );

  const res = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.edges, [
    Query.equal('userId', auth.userId),
    Query.limit(limit),
  ]);

  return Response.json({ edges: res.documents, count: res.documents.length });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');

  const sourceId = str(body.sourceId, 'sourceId', { min: 1, max: 64 });
  if (!sourceId.ok) return fail(400, sourceId.error);

  const targetId = str(body.targetId, 'targetId', { min: 1, max: 64 });
  if (!targetId.ok) return fail(400, targetId.error);

  if (sourceId.value === targetId.value) {
    return fail(400, 'sourceId and targetId must differ.');
  }

  const type = oneOf(body.type, EDGE_TYPES, 'type');
  if (!type.ok) return fail(400, type.error);

  let weight = 0.5;
  if (body.weight !== undefined) {
    if (typeof body.weight !== 'number' || !Number.isFinite(body.weight)) {
      return fail(400, 'weight must be a number between 0 and 1.');
    }
    if (body.weight < 0 || body.weight > 1) {
      return fail(400, 'weight must be between 0 and 1.');
    }
    weight = body.weight;
  }

  try {
    const edge = await createEdge(
      auth.userId,
      sourceId.value,
      targetId.value,
      type.value,
      weight,
    );
    return Response.json({ edge });
  } catch (err) {
    console.error('[api/v1/edges] create failed:', err);
    return fail(500, 'Could not create the edge.');
  }
}
