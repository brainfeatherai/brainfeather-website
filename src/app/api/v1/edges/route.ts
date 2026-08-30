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
import {
  createOwnedEntityEdge,
  publicEdge,
  type EdgeDoc,
} from '@/lib/server/memory-store';
import { reportServerError } from '@/lib/server/report-error';
import { withRequestTelemetry } from '@/lib/server/request-telemetry';
import { EDGE_TYPES, oneOf, readJson, str } from '@/lib/server/validate';

async function listEdges(request: Request) {
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

  const edges = res.documents.map((edge) => publicEdge(edge as unknown as EdgeDoc));
  return Response.json({ edges, count: edges.length });
}

async function createEdgeRoute(request: Request) {
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
  if (type.value === 'mentioned_in') {
    return fail(400, 'mentioned_in edges are managed by the memory pipeline.');
  }

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
    const edge = await createOwnedEntityEdge(
      auth.userId,
      sourceId.value,
      targetId.value,
      type.value,
      weight,
    );
    if (!edge) {
      return fail(400, 'sourceId and targetId must be entities owned by this account.');
    }
    return Response.json({ edge });
  } catch (err) {
    reportServerError(err, {
      operation: 'edge.create',
      route: '/api/v1/edges',
      userId: auth.userId,
      tags: { edge_type: type.value },
    });
    return fail(500, 'Could not create the edge.');
  }
}

export const GET = withRequestTelemetry('edge.list', listEdges);
export const POST = withRequestTelemetry('edge.create', createEdgeRoute);
