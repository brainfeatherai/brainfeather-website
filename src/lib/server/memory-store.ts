import 'server-only';

/* ────────────────────────────────────────────────────────────────
   Server-side memory store.

   Mirrors the MCP server's store, with one structural difference that
   matters: every method takes `userId` as an argument.

   The MCP store reads userId from its own config, because one process
   serves one user. This one serves everybody, so the caller must say
   whose data it is on every call. Any query missing its userId filter
   would read across tenants — which is why the filter is applied here,
   in one place, rather than left to each route.
   ──────────────────────────────────────────────────────────────── */

import { ID, Query } from 'node-appwrite';
import { adminDb, DATABASE_ID, COLLECTIONS } from './appwrite-admin';
import { expand, score } from './concepts';

export type MemoryDoc = {
  $id: string;
  $createdAt: string;
  userId: string;
  source: string;
  title?: string;
  content: string;
  category: string;
  tags?: string[];
  status: 'active' | 'invalid';
  supersededBy?: string;
  projectId?: string;
  metadata?: string;
};

export type EntityDoc = {
  $id: string;
  userId: string;
  name: string;
  type: string;
  summary?: string;
};

export type EdgeDoc = {
  $id: string;
  userId: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
  validFrom: string;
  validTo?: string;
};

/* ── Memories ───────────────────────────────────────────────────── */

export async function listActive(
  userId: string,
  opts: { category?: string; projectId?: string; limit?: number } = {},
): Promise<MemoryDoc[]> {
  const queries = [
    Query.equal('userId', userId),
    Query.equal('status', 'active'),
    Query.orderDesc('$createdAt'),
    Query.limit(opts.limit ?? 50),
  ];
  if (opts.category) queries.push(Query.equal('category', opts.category));

  /* Scoped read = this project's facts PLUS unscoped ones.

     A bare Query.equal here was strict, and measured against the live
     corpus that meant a scoped call returned 0 of 14 facts — every
     existing memory vanishing from the user's context the moment
     projectId started being sent. Indistinguishable from data loss.
  
     An unscoped fact is GLOBAL, not orphaned: "I prefer terse
     explanations" belongs in every project, while "this service uses
     Drizzle" belongs to one. Verified that Appwrite honours or + isNull,
     so this stays a single round trip. */
  if (opts.projectId) {
    queries.push(
      Query.or([Query.equal('projectId', opts.projectId), Query.isNull('projectId')]),
    );
  }

  const res = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.memories, queries);
  return res.documents as unknown as MemoryDoc[];
}

/* Concept-expanded search over active facts.

   Was plain substring matching, which failed the query that matters
   most: "how do we handle auth" scored ZERO against a stored fact
   reading "Supabase RLS for permissions" — no shared tokens, so no
   match, while the answer sat right there. That is the gap Mem0 and Zep
   close with embeddings.

   ./concepts expands the query across a curated domain graph instead:
   deterministic, no provider key, no per-query latency. See that module
   for why a bounded vocabulary makes this viable, and where a vector
   signal would fuse in later.

   Deliberately NOT Query.search: full-text search needs a fulltext index
   on `content` and none exists, and without one Appwrite either errors
   or silently degrades depending on version. Ranking in JS over a capped
   pool is honest about what it is and correct at this scale. */
export async function search(
  userId: string,
  query: string,
  opts: { category?: string; projectId?: string; limit?: number } = {},
): Promise<MemoryDoc[]> {
  const limit = opts.limit ?? 10;
  const pool = await listActive(userId, { ...opts, limit: 100 });

  const expanded = expand(query);
  /* A query of nothing but stop words expands to no terms. Returning the
     newest facts beats returning an empty list — the caller asked for
     something. */
  if (!expanded.exact.length) return pool.slice(0, limit);

  return pool
    .map((doc) => ({ doc, s: score(`${doc.title ?? ''} ${doc.content}`, expanded) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.doc);
}

export async function createMemory(
  userId: string,
  fact: {
    content: string;
    category: string;
    source?: string;
    title?: string;
    projectId?: string;
    metadata?: string;
  },
): Promise<MemoryDoc> {
  const doc = await adminDb.createDocument(
    DATABASE_ID,
    COLLECTIONS.memories,
    ID.unique(),
    {
      userId,
      source: fact.source ?? 'manual',
      title: fact.title ?? '',
      content: fact.content,
      category: fact.category,
      tags: [],
      status: 'active',
      ...(fact.projectId ? { projectId: fact.projectId } : {}),
      ...(fact.metadata ? { metadata: fact.metadata } : {}),
    },
  );
  return doc as unknown as MemoryDoc;
}

/* Retract without deleting: flip status and record what replaced it.
   The dashboard and every read path filter on status, so an invalidated
   fact stops being returned while remaining auditable. */
export async function supersede(ids: string[], byId: string): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      adminDb
        .updateDocument(DATABASE_ID, COLLECTIONS.memories, id, {
          status: 'invalid',
          supersededBy: byId,
        })
        .catch(() => {}),
    ),
  );
}

/* Ownership is checked before deleting. Without this, any valid token
   could delete any user's memory by guessing an ID. */
export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  try {
    const doc = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      id,
    )) as unknown as MemoryDoc;
    if (doc.userId !== userId) return false;
  } catch {
    return false;
  }
  await adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.memories, id);
  return true;
}

/* Same ownership rule as deleteMemory, for edits and retractions.
   Returns null for "not found or not yours" so the route can answer 404
   without confirming which. */
export async function updateMemory(
  userId: string,
  id: string,
  data: { content?: string; category?: string; status?: 'active' | 'invalid'; supersededBy?: string },
): Promise<MemoryDoc | null> {
  let doc: MemoryDoc;
  try {
    doc = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      id,
    )) as unknown as MemoryDoc;
    if (doc.userId !== userId) return null;
  } catch {
    return null;
  }
  const updated = await adminDb.updateDocument(
    DATABASE_ID,
    COLLECTIONS.memories,
    id,
    data,
  );
  return updated as unknown as MemoryDoc;
}

/* ── Entities ───────────────────────────────────────────────────── */

export async function listEntities(userId: string, type?: string): Promise<EntityDoc[]> {
  const queries = [Query.equal('userId', userId), Query.limit(100)];
  if (type) queries.push(Query.equal('type', type));
  const res = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.entities, queries);
  return res.documents as unknown as EntityDoc[];
}

export async function upsertEntity(
  userId: string,
  name: string,
  type: string,
  summary?: string,
): Promise<EntityDoc> {
  const existing = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.entities, [
    Query.equal('userId', userId),
    Query.equal('name', name),
    Query.limit(1),
  ]);

  const found = existing.documents[0];
  if (found) {
    if (summary) {
      const updated = await adminDb.updateDocument(
        DATABASE_ID,
        COLLECTIONS.entities,
        found.$id,
        { summary },
      );
      return updated as unknown as EntityDoc;
    }
    return found as unknown as EntityDoc;
  }

  const doc = await adminDb.createDocument(
    DATABASE_ID,
    COLLECTIONS.entities,
    ID.unique(),
    { userId, name, type, ...(summary ? { summary } : {}) },
  );
  return doc as unknown as EntityDoc;
}

/* Deleting a node cascades to its edges. Orphan edges pointing at a
   vanished entity would still render in traversals (the graph resolves
   missing endpoints to raw ids), so they go too. Ownership of the node
   is verified; edges are deleted by reference, and they were all
   created under the same userId. */
export async function deleteEntity(userId: string, id: string): Promise<boolean> {
  try {
    const doc = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.entities,
      id,
    )) as unknown as EntityDoc;
    if (doc.userId !== userId) return false;
  } catch {
    return false;
  }

  const [outgoing, incoming] = await Promise.all([
    adminDb.listDocuments(DATABASE_ID, COLLECTIONS.edges, [
      Query.equal('userId', userId),
      Query.equal('sourceId', id),
      Query.limit(100),
    ]),
    adminDb.listDocuments(DATABASE_ID, COLLECTIONS.edges, [
      Query.equal('userId', userId),
      Query.equal('targetId', id),
      Query.limit(100),
    ]),
  ]);

  await Promise.all(
    [...outgoing.documents, ...incoming.documents].map((e) =>
      adminDb
        .deleteDocument(DATABASE_ID, COLLECTIONS.edges, (e as unknown as EdgeDoc).$id)
        .catch(() => {}),
    ),
  );

  await adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.entities, id);
  return true;
}

/* ── Edges ──────────────────────────────────────────────────────── */

/* `weight` is stored as an integer 0-10, not a float: Appwrite has no
   double attribute type, so a 0-1 float would silently truncate to 0. */
export async function createEdge(
  userId: string,
  sourceId: string,
  targetId: string,
  type: string,
  weight = 0.5,
): Promise<EdgeDoc> {
  const doc = await adminDb.createDocument(DATABASE_ID, COLLECTIONS.edges, ID.unique(), {
    userId,
    sourceId,
    targetId,
    type,
    weight: Math.round(Math.max(0, Math.min(1, weight)) * 10),
    validFrom: new Date().toISOString(),
  });
  return doc as unknown as EdgeDoc;
}

/* Remove one link. Ownership checked on the edge row itself. */
export async function deleteEdge(userId: string, id: string): Promise<boolean> {
  try {
    const doc = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.edges,
      id,
    )) as unknown as EdgeDoc;
    if (doc.userId !== userId) return false;
  } catch {
    return false;
  }
  await adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.edges, id);
  return true;
}

export async function traverseGraph(
  userId: string,
  entityId: string,
  depth = 1,
): Promise<{ entities: EntityDoc[]; edges: EdgeDoc[] }> {
  const seen = new Set<string>([entityId]);
  const edges: EdgeDoc[] = [];
  let frontier = [entityId];

  for (let level = 0; level < depth; level++) {
    const next: string[] = [];

    for (const id of frontier) {
      /* Two queries rather than one OR: an edge can reach this node from
         either end, and Appwrite has no cross-attribute OR here. */
      const [outgoing, incoming] = await Promise.all([
        adminDb.listDocuments(DATABASE_ID, COLLECTIONS.edges, [
          Query.equal('userId', userId),
          Query.equal('sourceId', id),
          Query.limit(50),
        ]),
        adminDb.listDocuments(DATABASE_ID, COLLECTIONS.edges, [
          Query.equal('userId', userId),
          Query.equal('targetId', id),
          Query.limit(50),
        ]),
      ]);

      for (const raw of [...outgoing.documents, ...incoming.documents]) {
        const edge = raw as unknown as EdgeDoc;
        /* Superseded edges are filtered here, in code: Appwrite rejects
           Query.equal on a null value, so `validTo is null` is not
           expressible as a query. */
        if (edge.validTo) continue;

        edges.push(edge);
        for (const end of [edge.sourceId, edge.targetId]) {
          if (!seen.has(end)) {
            seen.add(end);
            next.push(end);
          }
        }
      }
    }

    frontier = next;
    if (!frontier.length) break;
  }

  /* seen holds memory IDs as well as entity IDs — an edge links a memory
     to an entity — so a miss here is expected, not an error. */
  const entities = (
    await Promise.all(
      [...seen].map((id) =>
        adminDb
          .getDocument(DATABASE_ID, COLLECTIONS.entities, id)
          .then((d) => d as unknown as EntityDoc)
          .catch(() => null),
      ),
    )
  ).filter((e): e is EntityDoc => e !== null && e.userId === userId);

  return { entities, edges };
}
