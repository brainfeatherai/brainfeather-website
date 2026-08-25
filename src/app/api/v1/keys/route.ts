import { Query } from 'node-appwrite';
import {
  apiKeyHashWritesEnabled,
  apiKeyHint,
  apiKeySlotId,
  createApiKey,
  storedApiKey,
} from '@/lib/api-key';
import { authenticateDashboard, fail } from '@/lib/server/api-auth';
import { adminDb, COLLECTIONS, DATABASE_ID } from '@/lib/server/appwrite-admin';
import { readJson, str } from '@/lib/server/validate';

function safeKey(row: Record<string, unknown>) {
  return {
    $id: row.$id as string,
    $createdAt: row.$createdAt as string,
    name: row.name as string,
    keyHint: apiKeyHint(row.key as string),
    lastUsedAt: row.lastUsedAt as string | undefined,
  };
}

const noStore = { 'Cache-Control': 'no-store, private' };

export async function GET(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const result = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.apiKeys, [
    Query.equal('userId', auth.userId),
    Query.orderDesc('$createdAt'),
    Query.limit(100),
  ]);
  const rows = await Promise.all(
    result.documents.map(async (row) => {
      if (
        apiKeyHashWritesEnabled() &&
        typeof row.key === 'string' &&
        !row.key.startsWith('sha256:')
      ) {
        return await adminDb.updateDocument({
          databaseId: DATABASE_ID,
          collectionId: COLLECTIONS.apiKeys,
          documentId: row.$id,
          data: { key: storedApiKey(row.key) },
          permissions: [],
        });
      }
      return row;
    }),
  );
  return Response.json(
    { keys: rows.map((row) => safeKey(row)) },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  const auth = await authenticateDashboard(request);
  if (!auth.ok) return fail(auth.status, auth.error);

  const body = await readJson(request);
  if (!body) return fail(400, 'Body must be a JSON object.');
  const name = str(body.name, 'name', { min: 1, max: 128 });
  if (!name.ok) return fail(400, name.error);

  const token = createApiKey();
  const stored = apiKeyHashWritesEnabled() ? storedApiKey(token) : token;
  let document;

  for (let attempt = 0; attempt < 3 && !document; attempt++) {
    const existing = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.apiKeys, [
      Query.equal('userId', auth.userId),
      Query.limit(100),
    ]);
    if (existing.documents.length >= 25) {
      return fail(409, 'Revoke an existing API key before creating another.');
    }

    const occupied = new Set(existing.documents.map((row) => row.$id));
    const slot = Array.from({ length: 25 }, (_, index) => index).find(
      (index) => !occupied.has(apiKeySlotId(auth.userId, index)),
    );
    if (slot === undefined) {
      return fail(409, 'Revoke an existing API key before creating another.');
    }

    try {
      document = await adminDb.createDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTIONS.apiKeys,
        documentId: apiKeySlotId(auth.userId, slot),
        data: { userId: auth.userId, name: name.value, key: stored },
        permissions: [],
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 409) throw error;
    }
  }

  if (!document) return fail(409, 'Concurrent key creation detected. Try again.');

  return Response.json(
    { key: safeKey(document), token },
    { status: 201, headers: noStore },
  );
}
