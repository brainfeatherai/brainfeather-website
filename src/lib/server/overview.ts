import 'server-only';

import { Query } from 'node-appwrite';
import { adminDb, COLLECTIONS, DATABASE_ID } from './appwrite-admin.ts';
import { isMissingCandidatesTable } from './candidate-store.ts';
import { readRequestAnalytics } from './request-telemetry.ts';

type CollectionId = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

async function countDocuments(collection: CollectionId, queries: string[]): Promise<number> {
  const result = await adminDb.listDocuments(DATABASE_ID, collection, [
    ...queries,
    Query.limit(1),
  ]);
  return result.total;
}

async function pendingCandidateCount(userId: string): Promise<number> {
  try {
    return await countDocuments(COLLECTIONS.memoryCandidates, [
      Query.equal('userId', userId),
      Query.equal('status', 'pending'),
    ]);
  } catch (error) {
    if (isMissingCandidatesTable(error)) return 0;
    throw error;
  }
}

export async function readOverview(userId: string) {
  const [memories, entities, edges, keys, analytics, pendingCandidates] =
    await Promise.all([
      countDocuments(COLLECTIONS.memories, [
        Query.equal('userId', userId),
        Query.equal('status', 'active'),
      ]),
      countDocuments(COLLECTIONS.entities, [Query.equal('userId', userId)]),
      countDocuments(COLLECTIONS.edges, [Query.equal('userId', userId)]),
      countDocuments(COLLECTIONS.apiKeys, [Query.equal('userId', userId)]),
      readRequestAnalytics(userId, 30),
      pendingCandidateCount(userId),
    ]);

  return {
    memories,
    entities,
    edges,
    keys,
    pendingCandidates,
    analytics,
    path: {
      recallMs: durationOf(analytics, 'context.read'),
      mcpMs: durationOf(analytics, 'mcp.http'),
      captureMs: durationOf(analytics, 'memory.capture'),
    },
  };
}

function durationOf(analytics: Awaited<ReturnType<typeof readRequestAnalytics>>, operation: string) {
  return analytics.byOperation.find((item) => item.operation === operation)?.averageDurationMs;
}
