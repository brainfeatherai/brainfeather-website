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

import { createHash } from 'node:crypto';
import { ID, Query } from 'node-appwrite';
import { adminDb, DATABASE_ID, COLLECTIONS } from './appwrite-admin';
import { expand, score } from './concepts';

type CollectionId = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

async function listAllDocuments<T>(
  collectionId: CollectionId,
  queries: string[],
  pageSize = 100,
  transactionId?: string,
): Promise<T[]> {
  const documents: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await adminDb.listDocuments(
      DATABASE_ID,
      collectionId,
      [...queries, Query.limit(pageSize), Query.offset(offset)],
      transactionId,
    );
    documents.push(...(page.documents as unknown as T[]));
    if (page.documents.length < pageSize) return documents;
  }
}

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

function edgeIdForMention(userId: string, memoryId: string, entityId: string): string {
  return createHash('sha256')
    .update(`${userId}\0${memoryId}\0${entityId}\0mentioned_in`)
    .digest('hex')
    .slice(0, 36);
}

async function edgesForNode(userId: string, id: string): Promise<EdgeDoc[]> {
  const [outgoing, incoming] = await Promise.all([
    listAllDocuments<EdgeDoc>(COLLECTIONS.edges, [
      Query.equal('userId', userId),
      Query.equal('sourceId', id),
    ]),
    listAllDocuments<EdgeDoc>(COLLECTIONS.edges, [
      Query.equal('userId', userId),
      Query.equal('targetId', id),
    ]),
  ]);

  return [...outgoing, ...incoming];
}

/* ── Memories ───────────────────────────────────────────────────── */

export async function listActive(
  userId: string,
  opts: {
    category?: string;
    projectId?: string;
    limit?: number;
    strictScope?: boolean;
  } = {},
): Promise<MemoryDoc[]> {
  const queries = [
    Query.equal('userId', userId),
    Query.equal('status', 'active'),
    Query.orderDesc('$createdAt'),
    Query.limit(opts.limit ?? 50),
  ];
  if (opts.category) queries.push(Query.equal('category', opts.category));

  /* Compatibility read = this project's facts PLUS unscoped ones.

     A bare Query.equal here was strict, and measured against the live
     corpus that meant a scoped call returned 0 of 14 facts — every
     existing memory vanishing from the user's context the moment
     projectId started being sent. Indistinguishable from data loss.
  
     An unscoped fact is GLOBAL, not orphaned: "I prefer terse
     explanations" belongs in every project, while "this service uses
     Drizzle" belongs to one. Verified that Appwrite honours or + isNull,
     so this stays a single round trip. strictScope is used by MCP and
     returns only memories explicitly assigned to the current project. */
  if (opts.projectId && opts.strictScope) {
    queries.push(Query.equal('projectId', opts.projectId));
  } else if (opts.projectId) {
    queries.push(
      Query.or([Query.equal('projectId', opts.projectId), Query.isNull('projectId')]),
    );
  }

  const res = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.memories, queries);
  return res.documents as unknown as MemoryDoc[];
}

export function listAllActive(userId: string): Promise<MemoryDoc[]> {
  return listAllDocuments<MemoryDoc>(COLLECTIONS.memories, [
    Query.equal('userId', userId),
    Query.equal('status', 'active'),
    Query.orderDesc('$createdAt'),
  ]);
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
  opts: {
    category?: string;
    projectId?: string;
    limit?: number;
    strictScope?: boolean;
  } = {},
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
    supersedeIds?: string[];
  },
): Promise<MemoryDoc> {
  const documentId = ID.unique();
  const data = {
    userId,
    source: fact.source ?? 'manual',
    title: fact.title ?? '',
    content: fact.content,
    category: fact.category,
    tags: [],
    status: 'active',
    ...(fact.projectId ? { projectId: fact.projectId } : {}),
    ...(fact.metadata ? { metadata: fact.metadata } : {}),
  };

  let transactionId: string | undefined;
  try {
    if (fact.supersedeIds?.length) {
      transactionId = (await adminDb.createTransaction({ ttl: 60 })).$id;
      for (const id of fact.supersedeIds) {
        const target = (await adminDb.getDocument(
          DATABASE_ID,
          COLLECTIONS.memories,
          id,
          undefined,
          transactionId,
        )) as unknown as MemoryDoc;
        if (
          target.userId !== userId ||
          (target.projectId ?? null) !== (fact.projectId ?? null) ||
          target.status !== 'active'
        ) {
          throw new Error('Supersession target is not active in this project.');
        }
      }
    }
    const document = await adminDb.createDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.memories,
      documentId,
      data,
      transactionId,
    });
    if (transactionId) {
      await Promise.all(
        fact.supersedeIds!.map((id) =>
          adminDb.updateDocument({
            databaseId: DATABASE_ID,
            collectionId: COLLECTIONS.memories,
            documentId: id,
            data: { status: 'invalid', supersededBy: documentId },
            transactionId,
          }),
        ),
      );
      await adminDb.updateTransaction({ transactionId, commit: true });
    }
    return document as unknown as MemoryDoc;
  } catch (error) {
    if (transactionId) {
      await adminDb
        .updateTransaction({ transactionId, rollback: true })
        .catch(() => {});
    }
    throw error;
  }
}

export async function getMemory(
  userId: string,
  id: string,
  projectId?: string,
): Promise<MemoryDoc | null> {
  try {
    const memory = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      id,
    )) as unknown as MemoryDoc;
    if (memory.userId !== userId) return null;
    if (projectId !== undefined && memory.projectId !== projectId) return null;
    return memory;
  } catch {
    return null;
  }
}

/* Retract without deleting: flip status and record what replaced it.
   The dashboard and every read path filter on status, so an invalidated
   fact stops being returned while remaining auditable. */
export async function supersede(ids: string[], byId: string): Promise<void> {
  if (!ids.length) return;
  const transaction = await adminDb.createTransaction({ ttl: 60 });
  try {
    const replacement = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      byId,
      undefined,
      transaction.$id,
    )) as unknown as MemoryDoc;
    if (replacement.status !== 'active') {
      throw new Error('Replacement memory is not active.');
    }
    await adminDb.updateDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.memories,
      documentId: byId,
      data: { content: replacement.content },
      transactionId: transaction.$id,
    });
    await Promise.all(
      ids.map(async (id) => {
        const target = (await adminDb.getDocument(
          DATABASE_ID,
          COLLECTIONS.memories,
          id,
          undefined,
          transaction.$id,
        )) as unknown as MemoryDoc;
        if (
          target.userId !== replacement.userId ||
          (target.projectId ?? null) !== (replacement.projectId ?? null) ||
          (target.status !== 'active' && target.supersededBy !== byId)
        ) {
          throw new Error('Supersession target is not active in this project.');
        }
        if (target.status === 'active') await adminDb.updateDocument({
          databaseId: DATABASE_ID,
          collectionId: COLLECTIONS.memories,
          documentId: id,
          data: { status: 'invalid', supersededBy: byId },
          transactionId: transaction.$id,
        });
      }),
    );
    await adminDb.updateTransaction({ transactionId: transaction.$id, commit: true });
  } catch (error) {
    await adminDb
      .updateTransaction({ transactionId: transaction.$id, rollback: true })
      .catch(() => {});
    throw error;
  }
}

/* Ownership is checked before deleting. Without this, any valid token
   could delete any user's memory by guessing an ID. */
export async function deleteMemory(
  userId: string,
  id: string,
  projectId?: string,
): Promise<boolean> {
  try {
    const doc = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      id,
    )) as unknown as MemoryDoc;
    if (doc.userId !== userId) return false;
    if (projectId && doc.projectId !== projectId) return false;
  } catch {
    return false;
  }
  const edges = await edgesForNode(userId, id);
  await Promise.all(
    edges.map((edge) =>
      adminDb.deleteDocument(DATABASE_ID, COLLECTIONS.edges, edge.$id).catch(() => {}),
    ),
  );
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
  projectId?: string,
): Promise<MemoryDoc | null> {
  let doc: MemoryDoc;
  try {
    doc = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      id,
    )) as unknown as MemoryDoc;
    if (doc.userId !== userId) return null;
    if (projectId !== undefined && doc.projectId !== projectId) return null;
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
  const queries = [Query.equal('userId', userId)];
  if (type) queries.push(Query.equal('type', type));
  return listAllDocuments<EntityDoc>(COLLECTIONS.entities, queries);
}

async function edgesForMemoryIds(
  userId: string,
  memoryIds: string[],
): Promise<EdgeDoc[]> {
  if (!memoryIds.length) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < memoryIds.length; i += 100) {
    chunks.push(memoryIds.slice(i, i + 100));
  }

  const responses = await Promise.all(
    chunks.flatMap((ids) => [
      listAllDocuments<EdgeDoc>(COLLECTIONS.edges, [
        Query.equal('userId', userId),
        Query.equal('sourceId', ids),
      ]),
      listAllDocuments<EdgeDoc>(COLLECTIONS.edges, [
        Query.equal('userId', userId),
        Query.equal('targetId', ids),
      ]),
    ]),
  );

  const unique = new Map<string, EdgeDoc>();
  for (const response of responses) {
    for (const edge of response) {
      if (!edge.validTo) unique.set(edge.$id, edge);
    }
  }
  return [...unique.values()];
}

async function projectGraphScope(
  userId: string,
  projectId: string,
): Promise<{ memoryIds: Set<string>; entityIds: Set<string> }> {
  const memories = await listAllDocuments<MemoryDoc>(COLLECTIONS.memories, [
    Query.equal('userId', userId),
    Query.equal('status', 'active'),
    Query.equal('projectId', projectId),
    Query.orderDesc('$createdAt'),
  ]);
  const memoryIds = new Set(memories.map((memory) => memory.$id));
  const linkedEdges = await edgesForMemoryIds(userId, [...memoryIds]);
  const entityIds = new Set<string>();

  for (const edge of linkedEdges) {
    if (!memoryIds.has(edge.sourceId)) entityIds.add(edge.sourceId);
    if (!memoryIds.has(edge.targetId)) entityIds.add(edge.targetId);
  }
  return { memoryIds, entityIds };
}

export async function listProjectEntities(
  userId: string,
  projectId: string,
  type?: string,
): Promise<EntityDoc[]> {
  const { entityIds } = await projectGraphScope(userId, projectId);
  const ids = [...entityIds];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const entities = (
    await Promise.all(
      chunks.map((chunk) =>
        listAllDocuments<EntityDoc>(COLLECTIONS.entities, [
          Query.equal('userId', userId),
          Query.equal('$id', chunk),
        ]),
      ),
    )
  ).flat();

  return type ? entities.filter((entity) => entity.type === type) : entities;
}

export async function upsertEntity(
  userId: string,
  name: string,
  type: string,
  summary?: string,
): Promise<EntityDoc> {
  const entityId = ID.custom(
    createHash('sha256')
      .update(`${userId}\0${name.toLowerCase()}`)
      .digest('hex')
      .slice(0, 36),
  );
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

  try {
    const doc = await adminDb.createDocument(
      DATABASE_ID,
      COLLECTIONS.entities,
      entityId,
      { userId, name, type, ...(summary ? { summary } : {}) },
    );
    return doc as unknown as EntityDoc;
  } catch (error) {
    if ((error as { code?: number }).code !== 409) throw error;
    return (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.entities,
      entityId,
    )) as unknown as EntityDoc;
  }
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

  const edges = await edgesForNode(userId, id);

  await Promise.all(
    edges.map((edge) =>
      adminDb
        .deleteDocument(DATABASE_ID, COLLECTIONS.edges, edge.$id)
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
  deterministic = false,
): Promise<EdgeDoc> {
  const edgeId = deterministic
    ? ID.custom(
        createHash('sha256')
          .update(`${userId}\0${sourceId}\0${targetId}\0${type}`)
          .digest('hex')
          .slice(0, 36),
      )
    : ID.unique();
  try {
    const doc = await adminDb.createDocument(DATABASE_ID, COLLECTIONS.edges, edgeId, {
      userId,
      sourceId,
      targetId,
      type,
      weight: Math.round(Math.max(0, Math.min(1, weight)) * 10),
      validFrom: new Date().toISOString(),
    });
    return doc as unknown as EdgeDoc;
  } catch (error) {
    if (!deterministic || (error as { code?: number }).code !== 409) throw error;
    const existing = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.edges,
      edgeId,
    )) as unknown as EdgeDoc;
    if (!existing.validTo) return existing;
    return (await adminDb.updateDocument(DATABASE_ID, COLLECTIONS.edges, edgeId, {
      validFrom: new Date().toISOString(),
      validTo: '',
      weight: Math.round(Math.max(0, Math.min(1, weight)) * 10),
    })) as unknown as EdgeDoc;
  }
}

/* Keep one active mention edge per memory/entity pair. Reprocessing a
   memory is therefore safe, and editing it closes links for entities no
   longer present instead of leaving the graph permanently stale. */
export async function syncMentionEdges(
  userId: string,
  memoryId: string,
  entityIds: string[],
  expectedContent?: string,
): Promise<void> {
  const transaction = await adminDb.createTransaction({ ttl: 60 });
  try {
    const memory = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      memoryId,
      undefined,
      transaction.$id,
    )) as unknown as MemoryDoc;
    if (memory.userId !== userId) throw new Error('Memory does not belong to this user.');
    if (expectedContent !== undefined && memory.content !== expectedContent) {
      await adminDb.updateTransaction({ transactionId: transaction.$id, rollback: true });
      return;
    }
    await adminDb.updateDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.memories,
      documentId: memoryId,
      data: { content: memory.content },
      transactionId: transaction.$id,
    });

    const desired = new Set(memory.status === 'active' ? entityIds : []);
    const edges = await listAllDocuments<EdgeDoc>(
      COLLECTIONS.edges,
      [Query.equal('userId', userId), Query.equal('sourceId', memoryId)],
      100,
      transaction.$id,
    );
    const retained = new Set<string>();
    const now = new Date().toISOString();

    for (const edge of edges) {
      if (edge.type !== 'mentioned_in') continue;
      if (desired.has(edge.targetId) && !retained.has(edge.targetId)) {
        retained.add(edge.targetId);
        if (edge.validTo) {
          await adminDb.updateDocument({
            databaseId: DATABASE_ID,
            collectionId: COLLECTIONS.edges,
            documentId: edge.$id,
            data: { validFrom: now, validTo: '', weight: 7 },
            transactionId: transaction.$id,
          });
        }
      } else if (!edge.validTo) {
        await adminDb.updateDocument({
          databaseId: DATABASE_ID,
          collectionId: COLLECTIONS.edges,
          documentId: edge.$id,
          data: { validTo: now },
          transactionId: transaction.$id,
        });
      }
    }

    for (const targetId of desired) {
      if (retained.has(targetId)) continue;
      await adminDb.upsertDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTIONS.edges,
        documentId: ID.custom(edgeIdForMention(userId, memoryId, targetId)),
        data: {
          userId,
          sourceId: memoryId,
          targetId,
          type: 'mentioned_in',
          weight: 7,
          validFrom: now,
          validTo: '',
        },
        transactionId: transaction.$id,
      });
    }

    await adminDb.updateTransaction({ transactionId: transaction.$id, commit: true });
  } catch (error) {
    await adminDb
      .updateTransaction({ transactionId: transaction.$id, rollback: true })
      .catch(() => {});
    throw error;
  }
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
  projectId?: string,
): Promise<{ entities: EntityDoc[]; edges: EdgeDoc[] }> {
  let allowed: Set<string> | undefined;
  if (projectId) {
    const scope = await projectGraphScope(userId, projectId);
    if (!scope.entityIds.has(entityId)) return { entities: [], edges: [] };
    allowed = new Set([...scope.memoryIds, ...scope.entityIds]);
  }

  const seen = new Set<string>([entityId]);
  const edges = new Map<string, EdgeDoc>();
  let frontier = [entityId];

  for (let level = 0; level < depth; level++) {
    const next: string[] = [];

    for (const id of frontier) {
      /* Two queries rather than one OR: an edge can reach this node from
         either end, and Appwrite has no cross-attribute OR here. */
      const adjacent = await edgesForNode(userId, id);

      for (const edge of adjacent) {
        /* Superseded edges are filtered here, in code: Appwrite rejects
           Query.equal on a null value, so `validTo is null` is not
           expressible as a query. */
        if (edge.validTo) continue;
        if (allowed && (!allowed.has(edge.sourceId) || !allowed.has(edge.targetId))) continue;

        edges.set(edge.$id, edge);
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
  const seenIds = [...seen];
  const chunks: string[][] = [];
  for (let i = 0; i < seenIds.length; i += 100) chunks.push(seenIds.slice(i, i + 100));
  const entities = (
    await Promise.all(
      chunks.map((chunk) =>
        listAllDocuments<EntityDoc>(COLLECTIONS.entities, [
          Query.equal('userId', userId),
          Query.equal('$id', chunk),
        ]),
      ),
    )
  ).flat();

  return { entities, edges: [...edges.values()] };
}
