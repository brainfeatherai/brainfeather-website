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
import { rankMemories } from './retrieval-ranking';
import {
  invalidateMemoryMetadata,
  memoryIsVisibleAt,
  normalizeMemoryMetadata,
  reviveMemoryMetadata,
} from './memory-temporal';
import {
  blindIndex,
  dataEncryptionEnabled,
  decryptStoredValue,
  encryptStoredValue,
  isEncryptedValue,
  lookupValues,
  needsDataEncryption,
} from './data-encryption';

type CollectionId = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

function isNotFound(error: unknown): boolean {
  return (error as { code?: number }).code === 404;
}

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
  temporal?: ReturnType<typeof normalizeMemoryMetadata>;
};

export type EntityDoc = {
  $id: string;
  userId: string;
  name: string;
  type: string;
  summary?: string;
};

type StoredEntityDoc = EntityDoc & { metadata?: string };

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

type StoredMemoryMetadata =
  | { version: 1; metadata?: string; projectId?: string }
  | { v: 2; m?: string; p?: string };

type StoredEntityMetadata = {
  version: 1;
  name: string;
};

function memoryContext(
  userId: string,
  documentId: string,
  field: string,
) {
  return { userId, collection: COLLECTIONS.memories, documentId, field };
}

function entityContext(
  userId: string,
  documentId: string,
  field: string,
) {
  return { userId, collection: COLLECTIONS.entities, documentId, field };
}

function storedMemoryData(
  userId: string,
  documentId: string,
  fact: {
    content: string;
    category: string;
    source?: string;
    title?: string;
    projectId?: string;
    metadata?: string;
  },
) {
  if (!dataEncryptionEnabled()) {
    return {
      userId,
      source: fact.source ?? 'manual',
      title: fact.title ?? '',
      content: fact.content,
      category: fact.category,
      tags: [],
      status: 'active' as const,
      ...(fact.projectId ? { projectId: fact.projectId } : {}),
      ...(fact.metadata ? { metadata: fact.metadata } : {}),
    };
  }

  const privateMetadata: StoredMemoryMetadata = {
    v: 2,
    ...(fact.metadata ? { m: fact.metadata } : {}),
    ...(fact.projectId ? { p: fact.projectId } : {}),
  };

  return {
    userId,
    source: fact.source ?? 'manual',
    title: encryptStoredValue(
      fact.title ?? '',
      memoryContext(userId, documentId, 'title'),
    ),
    content: encryptStoredValue(
      fact.content,
      memoryContext(userId, documentId, 'content'),
    ),
    category: fact.category,
    tags: [],
    status: 'active' as const,
    ...(fact.projectId
      ? { projectId: blindIndex(fact.projectId, userId, 'memory.projectId') }
      : {}),
    ...(fact.metadata || fact.projectId
      ? {
          metadata: encryptStoredValue(
            JSON.stringify(privateMetadata),
            memoryContext(userId, documentId, 'metadata'),
          ),
        }
      : {}),
  };
}

function storedMemoryMetadata(
  userId: string,
  documentId: string,
  metadata: string,
  projectId: string | undefined,
  forceEncryption: boolean,
): string {
  if (!forceEncryption && !dataEncryptionEnabled()) return metadata;
  const value = JSON.stringify({
    v: 2,
    m: metadata,
    ...(projectId ? { p: projectId } : {}),
  } satisfies StoredMemoryMetadata);
  return encryptStoredValue(
    value,
    memoryContext(userId, documentId, 'metadata'),
    true,
  );
}

function decryptedMemory(row: MemoryDoc): MemoryDoc {
  let projectId = row.projectId;
  let metadata = row.metadata;

  if (metadata && isEncryptedValue(metadata)) {
    const parsed = JSON.parse(
      decryptStoredValue(metadata, memoryContext(row.userId, row.$id, 'metadata')),
    ) as StoredMemoryMetadata;
    if (!('version' in parsed ? parsed.version === 1 : parsed.v === 2)) {
      throw new Error('[brainfeather] Unsupported encrypted memory metadata version.');
    }
    projectId = 'version' in parsed ? parsed.projectId : parsed.p;
    metadata = 'version' in parsed ? parsed.metadata : parsed.m;
  }
  const temporal = normalizeMemoryMetadata(metadata, row.$createdAt);

  return {
    ...row,
    title: row.title
      ? decryptStoredValue(row.title, memoryContext(row.userId, row.$id, 'title'))
      : row.title,
    content: decryptStoredValue(
      row.content,
      memoryContext(row.userId, row.$id, 'content'),
    ),
    projectId,
    metadata,
    temporal,
  };
}

function decryptedEntity(row: StoredEntityDoc): EntityDoc {
  let name = row.name;
  if (row.metadata && isEncryptedValue(row.metadata)) {
    const parsed = JSON.parse(
      decryptStoredValue(
        row.metadata,
        entityContext(row.userId, row.$id, 'metadata'),
      ),
    ) as StoredEntityMetadata;
    if (parsed.version !== 1 || typeof parsed.name !== 'string') {
      throw new Error('[brainfeather] Unsupported encrypted entity metadata version.');
    }
    name = parsed.name;
  }

  return {
    $id: row.$id,
    userId: row.userId,
    name,
    type: row.type,
    summary: row.summary
      ? decryptStoredValue(
          row.summary,
          entityContext(row.userId, row.$id, 'summary'),
        )
      : row.summary,
  };
}

export async function migrateOwnedDataEncryption(userId: string): Promise<{
  memories: number;
  entities: number;
}> {
  if (!dataEncryptionEnabled()) {
    throw new Error('[brainfeather] Data encryption is not enabled.');
  }

  const [memoryRows, entityRows] = await Promise.all([
    listAllDocuments<MemoryDoc>(COLLECTIONS.memories, [Query.equal('userId', userId)]),
    listAllDocuments<StoredEntityDoc>(COLLECTIONS.entities, [
      Query.equal('userId', userId),
    ]),
  ]);

  let migratedMemories = 0;
  for (const row of memoryRows) {
    const plaintext = decryptedMemory(row);
    const needsMigration =
      needsDataEncryption(row.content) ||
      Boolean(row.title && needsDataEncryption(row.title)) ||
      Boolean(row.metadata && needsDataEncryption(row.metadata)) ||
      (Boolean(plaintext.projectId) && row.projectId === plaintext.projectId);
    if (!needsMigration) continue;

    const encrypted = storedMemoryData(userId, row.$id, {
      content: plaintext.content,
      category: plaintext.category,
      source: plaintext.source,
      title: plaintext.title,
      projectId: plaintext.projectId,
      metadata: plaintext.metadata,
    });
    await adminDb.updateDocument(DATABASE_ID, COLLECTIONS.memories, row.$id, {
      title: encrypted.title,
      content: encrypted.content,
      ...(encrypted.projectId ? { projectId: encrypted.projectId } : {}),
      ...(encrypted.metadata ? { metadata: encrypted.metadata } : {}),
    });
    migratedMemories++;
  }

  let migratedEntities = 0;
  for (const row of entityRows) {
    const plaintext = decryptedEntity(row);
    const needsMigration =
      !row.metadata ||
      needsDataEncryption(row.metadata) ||
      Boolean(row.summary && needsDataEncryption(row.summary));
    if (!needsMigration) continue;

    await adminDb.updateDocument(DATABASE_ID, COLLECTIONS.entities, row.$id, {
      name: blindIndex(plaintext.name, userId, 'entity.name'),
      metadata: encryptStoredValue(
        JSON.stringify({ version: 1, name: plaintext.name } satisfies StoredEntityMetadata),
        entityContext(userId, row.$id, 'metadata'),
      ),
      ...(plaintext.summary
        ? {
            summary: encryptStoredValue(
              plaintext.summary,
              entityContext(userId, row.$id, 'summary'),
            ),
          }
        : {}),
    });
    migratedEntities++;
  }

  return { memories: migratedMemories, entities: migratedEntities };
}

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
    referenceAtMs?: number;
  } = {},
): Promise<MemoryDoc[]> {
  const limit = opts.limit ?? 50;
  const retrievalWindow = Math.max(limit, 500);
  const queries = [
    Query.equal('userId', userId),
    Query.orderDesc('$createdAt'),
    Query.limit(retrievalWindow),
  ];
  if (opts.referenceAtMs === undefined) queries.push(Query.equal('status', 'active'));
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
    queries.push(
      Query.equal(
        'projectId',
        lookupValues(opts.projectId, userId, 'memory.projectId'),
      ),
    );
  } else if (opts.projectId) {
    queries.push(
      Query.or([
        Query.equal(
          'projectId',
          lookupValues(opts.projectId, userId, 'memory.projectId'),
        ),
        Query.isNull('projectId'),
      ]),
    );
  }

  const res = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.memories, queries);
  const referenceAtMs = opts.referenceAtMs ?? Date.now();
  return (res.documents as unknown as MemoryDoc[])
    .map(decryptedMemory)
    .filter((memory) => memoryIsVisibleAt(memory, referenceAtMs))
    .slice(0, limit);
}

export async function listAllActive(userId: string): Promise<MemoryDoc[]> {
  const rows = await listAllDocuments<MemoryDoc>(COLLECTIONS.memories, [
    Query.equal('userId', userId),
    Query.equal('status', 'active'),
    Query.orderDesc('$createdAt'),
  ]);
  const now = Date.now();
  return rows.map(decryptedMemory).filter((memory) => memoryIsVisibleAt(memory, now));
}

/* Hybrid retrieval over active, already-decrypted facts.

   Was plain substring matching, which failed the query that matters
   most: "how do we handle auth" scored ZERO against a stored fact
   reading "Supabase RLS for permissions" — no shared tokens, so no
   match, while the answer sat right there. That is the gap Mem0 and Zep
   close with embeddings.

   Ranking fuses BM25 lexical relevance, curated concept relations,
   canonical entity overlap and bounded recency. It remains deterministic,
   provider-free and in-process so plaintext never leaves the server.

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
    referenceAtMs?: number;
  } = {},
): Promise<MemoryDoc[]> {
  const limit = opts.limit ?? 10;
  const pool = await listActive(userId, { ...opts, limit: 100 });

  return rankMemories(pool, query, { limit, asOfMs: opts.referenceAtMs });
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
  const data = storedMemoryData(userId, documentId, fact);

  let transactionId: string | undefined;
  let invalidatedAt: string | undefined;
  let validTo: string | undefined;
  const supersessionTargets = new Map<
    string,
    { stored: MemoryDoc; plaintext: MemoryDoc }
  >();
  try {
    if (fact.supersedeIds?.length) {
      invalidatedAt = new Date().toISOString();
      validTo = normalizeMemoryMetadata(fact.metadata, invalidatedAt).validFrom;
      if (Date.parse(validTo) > Date.parse(invalidatedAt)) {
        throw new Error(
          'A future-effective memory cannot supersede current facts without a scheduler.',
        );
      }
      transactionId = (await adminDb.createTransaction({ ttl: 60 })).$id;
      for (const id of fact.supersedeIds) {
        const storedTarget = (await adminDb.getDocument(
          DATABASE_ID,
          COLLECTIONS.memories,
          id,
          undefined,
          transactionId,
        )) as unknown as MemoryDoc;
        const target = decryptedMemory(storedTarget);
        if (
          target.userId !== userId ||
          (target.projectId ?? null) !== (fact.projectId ?? null) ||
          target.status !== 'active'
        ) {
          throw new Error('Supersession target is not active in this project.');
        }
        supersessionTargets.set(id, { stored: storedTarget, plaintext: target });
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
        fact.supersedeIds!.map(async (id) => {
          const target = supersessionTargets.get(id);
          if (!target || !invalidatedAt || !validTo) {
            throw new Error('Supersession target state was lost.');
          }
          const metadata = invalidateMemoryMetadata(
            target.plaintext.metadata,
            invalidatedAt,
            new Date(
              Math.max(
                Date.parse(
                  normalizeMemoryMetadata(
                    target.plaintext.metadata,
                    target.plaintext.$createdAt,
                  ).validFrom,
                ),
                Date.parse(validTo),
              ),
            ).toISOString(),
          );
          return adminDb.updateDocument({
            databaseId: DATABASE_ID,
            collectionId: COLLECTIONS.memories,
            documentId: id,
            data: {
              status: 'invalid',
              supersededBy: documentId,
              metadata: storedMemoryMetadata(
                userId,
                id,
                metadata,
                target.plaintext.projectId,
                dataEncryptionEnabled() || isEncryptedValue(target.stored.metadata ?? ''),
              ),
            },
            transactionId,
          });
        }),
      );
      await adminDb.updateTransaction({ transactionId, commit: true });
    }
    return decryptedMemory(document as unknown as MemoryDoc);
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
    const memory = decryptedMemory((await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      id,
    )) as unknown as MemoryDoc);
    if (memory.userId !== userId) return null;
    if (projectId !== undefined && memory.projectId !== projectId) return null;
    return memory;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/* Retract without deleting: flip status and record what replaced it.
   The dashboard and every read path filter on status, so an invalidated
   fact stops being returned while remaining auditable. */
export async function supersede(ids: string[], byId: string): Promise<void> {
  if (!ids.length) return;
  const transaction = await adminDb.createTransaction({ ttl: 60 });
  try {
    const storedReplacement = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      byId,
      undefined,
      transaction.$id,
    )) as unknown as MemoryDoc;
    const replacement = decryptedMemory(storedReplacement);
    const invalidatedAt = new Date().toISOString();
    const validTo = normalizeMemoryMetadata(
      replacement.metadata,
      replacement.$createdAt,
    ).validFrom;
    if (Date.parse(validTo) > Date.parse(invalidatedAt)) {
      throw new Error(
        'A future-effective memory cannot supersede current facts without a scheduler.',
      );
    }
    if (replacement.status !== 'active') {
      throw new Error('Replacement memory is not active.');
    }
    await adminDb.updateDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.memories,
      documentId: byId,
      data: { content: storedReplacement.content },
      transactionId: transaction.$id,
    });
    await Promise.all(
      ids.map(async (id) => {
        const storedTarget = (await adminDb.getDocument(
          DATABASE_ID,
          COLLECTIONS.memories,
          id,
          undefined,
          transaction.$id,
        )) as unknown as MemoryDoc;
        const target = decryptedMemory(storedTarget);
        if (
          target.userId !== replacement.userId ||
          (target.projectId ?? null) !== (replacement.projectId ?? null) ||
          (target.status !== 'active' && target.supersededBy !== byId)
        ) {
          throw new Error('Supersession target is not active in this project.');
        }
        if (target.status === 'active') {
          const targetValidFrom = normalizeMemoryMetadata(
            target.metadata,
            target.$createdAt,
          ).validFrom;
          const metadata = invalidateMemoryMetadata(
            target.metadata,
            invalidatedAt,
            new Date(
              Math.max(Date.parse(targetValidFrom), Date.parse(validTo)),
            ).toISOString(),
          );
          await adminDb.updateDocument({
            databaseId: DATABASE_ID,
            collectionId: COLLECTIONS.memories,
            documentId: id,
            data: {
              status: 'invalid',
              supersededBy: byId,
              metadata: storedMemoryMetadata(
                target.userId,
                id,
                metadata,
                target.projectId,
                dataEncryptionEnabled() || isEncryptedValue(storedTarget.metadata ?? ''),
              ),
            },
            transactionId: transaction.$id,
          });
        }
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
    const doc = decryptedMemory((await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      id,
    )) as unknown as MemoryDoc);
    if (doc.userId !== userId) return false;
    if (projectId && doc.projectId !== projectId) return false;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
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
  data: {
    content?: string;
    category?: string;
    status?: 'active' | 'invalid';
    supersededBy?: string;
    validTo?: string;
  },
  projectId?: string,
): Promise<MemoryDoc | null> {
  let doc: MemoryDoc;
  let storedDoc: MemoryDoc;
  try {
    storedDoc = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      id,
    )) as unknown as MemoryDoc;
    doc = decryptedMemory(storedDoc);
    if (doc.userId !== userId) return null;
    if (projectId !== undefined && doc.projectId !== projectId) return null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const storedData = {
    ...data,
    ...(data.status !== undefined
      ? {
          metadata: storedMemoryMetadata(
            userId,
            id,
            data.status === 'invalid'
              ? invalidateMemoryMetadata(
                  doc.metadata,
                  new Date().toISOString(),
                  data.validTo,
                )
              : reviveMemoryMetadata(doc.metadata),
            doc.projectId,
            dataEncryptionEnabled() || isEncryptedValue(storedDoc.metadata ?? ''),
          ),
        }
      : {}),
    ...(data.content !== undefined
      ? {
          content:
            dataEncryptionEnabled() || isEncryptedValue(storedDoc.content)
              ? encryptStoredValue(
                  data.content,
                  memoryContext(userId, id, 'content'),
                  true,
                )
              : data.content,
        }
      : {}),
  };
  if (data.status === 'invalid' && data.validTo) {
    const validFrom = Date.parse(
      normalizeMemoryMetadata(doc.metadata, doc.$createdAt).validFrom,
    );
    if (Date.parse(data.validTo) <= validFrom) {
      throw new Error('validTo must be after the memory validFrom time.');
    }
  }
  delete storedData.validTo;
  const updated = await adminDb.updateDocument(
    DATABASE_ID,
    COLLECTIONS.memories,
    id,
    storedData,
  );
  return decryptedMemory(updated as unknown as MemoryDoc);
}

/* ── Entities ───────────────────────────────────────────────────── */

export async function listEntities(userId: string, type?: string): Promise<EntityDoc[]> {
  const queries = [Query.equal('userId', userId)];
  if (type) queries.push(Query.equal('type', type));
  const rows = await listAllDocuments<StoredEntityDoc>(COLLECTIONS.entities, queries);
  return rows.map(decryptedEntity);
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
  const storedMemories = await listAllDocuments<MemoryDoc>(COLLECTIONS.memories, [
    Query.equal('userId', userId),
    Query.equal('status', 'active'),
    Query.equal(
      'projectId',
      lookupValues(projectId, userId, 'memory.projectId'),
    ),
    Query.orderDesc('$createdAt'),
  ]);
  const now = Date.now();
  const memories = storedMemories
    .map(decryptedMemory)
    .filter((memory) => memoryIsVisibleAt(memory, now));
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
        listAllDocuments<StoredEntityDoc>(COLLECTIONS.entities, [
          Query.equal('userId', userId),
          Query.equal('$id', chunk),
        ]),
      ),
    )
  ).flat().map(decryptedEntity);

  return type ? entities.filter((entity) => entity.type === type) : entities;
}

export async function upsertEntity(
  userId: string,
  name: string,
  type: string,
  summary?: string,
): Promise<EntityDoc> {
  const entityId = ID.custom(
    (dataEncryptionEnabled()
      ? blindIndex(name.toLowerCase(), userId, 'entity.name')
      : createHash('sha256')
          .update(`${userId}\0${name.toLowerCase()}`)
          .digest('hex'))
      .slice(0, 36),
  );
  const existing = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.entities, [
    Query.equal('userId', userId),
    Query.equal('name', lookupValues(name, userId, 'entity.name')),
    Query.limit(1),
  ]);

  const found = existing.documents[0] as unknown as StoredEntityDoc | undefined;
  if (found) {
    const preserveEncryption = Boolean(
      found.metadata && isEncryptedValue(found.metadata),
    );
    if (summary || dataEncryptionEnabled() || preserveEncryption) {
      const current = decryptedEntity(found);
      const updated = await adminDb.updateDocument(
        DATABASE_ID,
        COLLECTIONS.entities,
        found.$id,
        dataEncryptionEnabled() || preserveEncryption
          ? {
              name: blindIndex(name, userId, 'entity.name'),
              metadata: encryptStoredValue(
                JSON.stringify({ version: 1, name } satisfies StoredEntityMetadata),
                entityContext(userId, found.$id, 'metadata'),
                true,
              ),
              ...(summary || current.summary
                ? {
                    summary: encryptStoredValue(
                      summary ?? current.summary!,
                      entityContext(userId, found.$id, 'summary'),
                      true,
                    ),
                  }
                : {}),
            }
          : { summary },
      );
      return decryptedEntity(updated as unknown as StoredEntityDoc);
    }
    return decryptedEntity(found);
  }

  try {
    const data = dataEncryptionEnabled()
      ? {
          userId,
          name: blindIndex(name, userId, 'entity.name'),
          type,
          metadata: encryptStoredValue(
            JSON.stringify({ version: 1, name } satisfies StoredEntityMetadata),
            entityContext(userId, entityId, 'metadata'),
          ),
          ...(summary
            ? {
                summary: encryptStoredValue(
                  summary,
                  entityContext(userId, entityId, 'summary'),
                ),
              }
            : {}),
        }
      : { userId, name, type, ...(summary ? { summary } : {}) };
    const doc = await adminDb.createDocument(
      DATABASE_ID,
      COLLECTIONS.entities,
      entityId,
      data,
    );
    return decryptedEntity(doc as unknown as StoredEntityDoc);
  } catch (error) {
    if ((error as { code?: number }).code !== 409) throw error;
    return decryptedEntity((await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.entities,
      entityId,
    )) as unknown as StoredEntityDoc);
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
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
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
    const storedMemory = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memories,
      memoryId,
      undefined,
      transaction.$id,
    )) as unknown as MemoryDoc;
    const memory = decryptedMemory(storedMemory);
    if (memory.userId !== userId) throw new Error('Memory does not belong to this user.');
    if (expectedContent !== undefined && memory.content !== expectedContent) {
      await adminDb.updateTransaction({ transactionId: transaction.$id, rollback: true });
      return;
    }
    await adminDb.updateDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.memories,
      documentId: memoryId,
      data: { content: storedMemory.content },
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
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
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
        listAllDocuments<StoredEntityDoc>(COLLECTIONS.entities, [
          Query.equal('userId', userId),
          Query.equal('$id', chunk),
        ]),
      ),
    )
  ).flat().map(decryptedEntity);

  return { entities, edges: [...edges.values()] };
}
