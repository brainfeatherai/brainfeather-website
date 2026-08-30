import 'server-only';

import { createHash } from 'node:crypto';
import { Query } from 'node-appwrite';
import { adminDb, COLLECTIONS, DATABASE_ID } from './appwrite-admin.ts';
import {
  decryptStoredValue,
  encryptStoredValue,
  encryptedDataReadable,
} from './data-encryption.ts';
import type { Candidate, Decision } from './think.ts';

export type CandidateStatus = 'pending' | 'approved' | 'rejected';

export type MemoryCandidateDoc = {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  userId: string;
  sessionId?: string;
  source: string;
  category: string;
  content: string;
  title?: string;
  projectId?: string;
  branch?: string;
  taskId?: string;
  provenance?: Candidate['provenance'];
  confidence: number;
  status: CandidateStatus;
  reviewedAt?: string;
  decision?: Decision;
};

type StoredCandidateDoc = Omit<
  MemoryCandidateDoc,
  'sessionId' | 'content' | 'title' | 'projectId' | 'provenance' | 'decision'
> & {
  sessionId?: string;
  content: string;
  title?: string;
  projectId?: string;
  provenance?: string;
  decision?: string;
};

function isNotFound(error: unknown): boolean {
  return (error as { code?: number }).code === 404;
}

function fieldContext(userId: string, documentId: string, field: string) {
  return {
    userId,
    collection: COLLECTIONS.memoryCandidates,
    documentId,
    field,
  };
}

function encryptedField(
  value: string | undefined,
  userId: string,
  documentId: string,
  field: string,
): string | undefined {
  if (!value) return undefined;
  if (!encryptedDataReadable()) {
    throw new Error(
      '[brainfeather] Candidate review requires compatibility or encrypted data mode.',
    );
  }
  return encryptStoredValue(value, fieldContext(userId, documentId, field), true);
}

export function candidateDocumentId(
  userId: string,
  candidate: Pick<Candidate, 'content' | 'category' | 'source' | 'projectId' | 'branch' | 'taskId'>,
  sessionId?: string,
): string {
  return createHash('sha256')
    .update(
      [
        userId,
        sessionId ?? '',
        candidate.source ?? 'manual',
        candidate.category,
        candidate.projectId ?? '',
        candidate.branch ?? '',
        candidate.taskId ?? '',
        candidate.content.replace(/\s+/g, ' ').trim(),
      ].join('\0'),
    )
    .digest('hex')
    .slice(0, 36);
}

export function isMissingCandidatesTable(error: unknown): boolean {
  const value = error as { code?: number; type?: string; message?: string };
  return (
    value.code === 404 ||
    value.type === 'collection_not_found' ||
    /collection.*not found|table.*not found/i.test(value.message ?? '')
  );
}

export function encodeCandidateDocument(
  userId: string,
  documentId: string,
  candidate: Candidate,
  sessionId?: string,
) {
  const sessionIdEnc = encryptedField(sessionId, userId, documentId, 'sessionId');
  const titleEnc = encryptedField(candidate.title, userId, documentId, 'title');
  const projectIdEnc = encryptedField(candidate.projectId, userId, documentId, 'projectId');
  const provenanceEnc = candidate.provenance || candidate.branch || candidate.taskId
    ? encryptedField(
        JSON.stringify({
          v: 2,
          ...(candidate.provenance ? { p: candidate.provenance } : {}),
          ...(candidate.branch ? { b: candidate.branch } : {}),
          ...(candidate.taskId ? { tk: candidate.taskId } : {}),
        }),
        userId,
        documentId,
        'provenance',
      )
    : undefined;

  return {
    userId,
    ...(sessionIdEnc ? { sessionId: sessionIdEnc } : {}),
    source: candidate.source ?? 'manual',
    category: candidate.category,
    content: encryptedField(
      candidate.content.replace(/\s+/g, ' ').trim(),
      userId,
      documentId,
      'content',
    )!,
    ...(titleEnc ? { title: titleEnc } : {}),
    ...(projectIdEnc ? { projectId: projectIdEnc } : {}),
    ...(provenanceEnc ? { provenance: provenanceEnc } : {}),
    confidence: Math.max(0, Math.min(1, candidate.confidence ?? 0.8)),
    status: 'pending' as const,
  };
}

export function decodeCandidateDocument(row: StoredCandidateDoc): MemoryCandidateDoc {
  const decrypt = (value: string | undefined, field: string) =>
    value
      ? decryptStoredValue(value, fieldContext(row.userId, row.$id, field))
      : undefined;
  const rawProvenance = decrypt(row.provenance, 'provenance');
  const decision = decrypt(row.decision, 'decision');
  const parsedProvenance = rawProvenance
    ? (JSON.parse(rawProvenance) as Record<string, unknown>)
    : undefined;
  const scopedProvenance = parsedProvenance?.v === 2 ? parsedProvenance : undefined;

  return {
    ...row,
    sessionId: decrypt(row.sessionId, 'sessionId'),
    content: decrypt(row.content, 'content')!,
    title: decrypt(row.title, 'title'),
    projectId: decrypt(row.projectId, 'projectId'),
    branch: typeof scopedProvenance?.b === 'string' ? scopedProvenance.b : undefined,
    taskId: typeof scopedProvenance?.tk === 'string' ? scopedProvenance.tk : undefined,
    provenance: scopedProvenance
      ? (scopedProvenance.p as Candidate['provenance'] | undefined)
      : (parsedProvenance as Candidate['provenance'] | undefined),
    decision: decision ? (JSON.parse(decision) as Decision) : undefined,
  };
}

export async function queueMemoryCandidate(
  userId: string,
  candidate: Candidate,
  sessionId?: string,
): Promise<{ candidate: MemoryCandidateDoc; created: boolean }> {
  const documentId = candidateDocumentId(userId, candidate, sessionId);
  try {
    const document = await adminDb.createDocument(
      DATABASE_ID,
      COLLECTIONS.memoryCandidates,
      documentId,
      encodeCandidateDocument(userId, documentId, candidate, sessionId),
    );
    return {
      candidate: decodeCandidateDocument(document as unknown as StoredCandidateDoc),
      created: true,
    };
  } catch (error) {
    if ((error as { code?: number }).code !== 409) throw error;
    const existing = await getMemoryCandidate(userId, documentId);
    if (!existing) throw error;
    return { candidate: existing, created: false };
  }
}

export async function listMemoryCandidates(
  userId: string,
  opts: { status?: CandidateStatus; limit?: number } = {},
): Promise<MemoryCandidateDoc[]> {
  const queries = [
    Query.equal('userId', userId),
    Query.orderDesc('$createdAt'),
    Query.limit(Math.max(1, Math.min(opts.limit ?? 100, 100))),
  ];
  if (opts.status) queries.push(Query.equal('status', opts.status));
  const result = await adminDb.listDocuments(
    DATABASE_ID,
    COLLECTIONS.memoryCandidates,
    queries,
  );
  return (result.documents as unknown as StoredCandidateDoc[]).map(
    decodeCandidateDocument,
  );
}

export async function getMemoryCandidate(
  userId: string,
  id: string,
  transactionId?: string,
): Promise<MemoryCandidateDoc | null> {
  try {
    const row = (await adminDb.getDocument(
      DATABASE_ID,
      COLLECTIONS.memoryCandidates,
      id,
      undefined,
      transactionId,
    )) as unknown as StoredCandidateDoc;
    return row.userId === userId ? decodeCandidateDocument(row) : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function transitionMemoryCandidate(
  userId: string,
  id: string,
  from: CandidateStatus,
  to: CandidateStatus,
): Promise<{ candidate: MemoryCandidateDoc | null; changed: boolean }> {
  const transaction = await adminDb.createTransaction({ ttl: 60 });
  try {
    const current = await getMemoryCandidate(userId, id, transaction.$id);
    if (!current) {
      await adminDb.updateTransaction({ transactionId: transaction.$id, rollback: true });
      return { candidate: null, changed: false };
    }
    if (current.status !== from) {
      await adminDb.updateTransaction({ transactionId: transaction.$id, rollback: true });
      return { candidate: current, changed: false };
    }
    const updated = await adminDb.updateDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.memoryCandidates,
      documentId: id,
      data: {
        status: to,
        ...(to === 'rejected' ? { reviewedAt: new Date().toISOString() } : {}),
      },
      transactionId: transaction.$id,
    });
    await adminDb.updateTransaction({ transactionId: transaction.$id, commit: true });
    return {
      candidate: decodeCandidateDocument(updated as unknown as StoredCandidateDoc),
      changed: true,
    };
  } catch (error) {
    await adminDb
      .updateTransaction({ transactionId: transaction.$id, rollback: true })
      .catch(() => {});
    throw error;
  }
}

export async function completeCandidateApproval(
  userId: string,
  id: string,
  decision: Decision,
): Promise<MemoryCandidateDoc | null> {
  const candidate = await getMemoryCandidate(userId, id);
  if (!candidate || candidate.status !== 'approved') return null;
  const updated = await adminDb.updateDocument(
    DATABASE_ID,
    COLLECTIONS.memoryCandidates,
    id,
    {
      decision: encryptedField(
        JSON.stringify(decision),
        userId,
        id,
        'decision',
      ),
      reviewedAt: new Date().toISOString(),
    },
  );
  return decodeCandidateDocument(updated as unknown as StoredCandidateDoc);
}
