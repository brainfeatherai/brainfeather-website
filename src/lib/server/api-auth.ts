import 'server-only';

import { Account, Client, Query } from 'node-appwrite';
import {
  apiKeyHashWritesEnabled,
  isBrainfeatherApiKey,
  storedApiKey,
} from '@/lib/api-key';
import { adminDb, DATABASE_ID, COLLECTIONS } from './appwrite-admin';

export type AuthResult =
  | {
      ok: true;
      userId: string;
      credential: 'apiKey' | 'jwt';
      keyId?: string;
    }
  | { ok: false; status: 401 | 403; error: string };

/* Telemetry wrappers and route handlers both need the auth result. Cache
   it by Request object so wrapping a route never repeats token hashing,
   database lookup, or Appwrite JWT verification. */
const authCache = new WeakMap<Request, Promise<AuthResult>>();

async function authenticateApiKey(token: string): Promise<AuthResult> {
  const hashed = storedApiKey(token);
  let found;
  try {
    found = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.apiKeys, [
      Query.equal('key', hashed),
      Query.limit(1),
    ]);

    /* Compatibility migration: prove the caller knows the old plaintext
       token, then replace it with its digest before accepting the call. */
    if (!found.documents.length) {
      const legacy = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.apiKeys, [
        Query.equal('key', token),
        Query.limit(1),
      ]);
      const row = legacy.documents[0];
      if (row && apiKeyHashWritesEnabled()) {
        await adminDb.updateDocument(DATABASE_ID, COLLECTIONS.apiKeys, row.$id, {
          key: hashed,
          lastUsedAt: new Date().toISOString(),
        });
        found = legacy;
      } else if (row) {
        found = legacy;
      } else {
        /* Settings may have migrated the row between our digest and
           plaintext reads. Recheck the final state before rejecting. */
        found = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.apiKeys, [
          Query.equal('key', hashed),
          Query.limit(1),
        ]);
      }
    }
  } catch {
    return { ok: false, status: 403, error: 'Could not verify token.' };
  }

  const row = found.documents[0];
  if (!row) return { ok: false, status: 401, error: 'Invalid or revoked token.' };

  void adminDb
    .updateDocument(DATABASE_ID, COLLECTIONS.apiKeys, row.$id, {
      lastUsedAt: new Date().toISOString(),
    })
    .catch(() => {});

  return {
    ok: true,
    userId: row.userId as string,
    credential: 'apiKey',
    keyId: row.$id,
  };
}

async function authenticateJwt(token: string): Promise<AuthResult> {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  if (!endpoint || !project) {
    return { ok: false, status: 403, error: 'Dashboard authentication is unavailable.' };
  }

  try {
    const account = new Account(
      new Client().setEndpoint(endpoint).setProject(project).setJWT(token),
    );
    const user = await account.get();
    return { ok: true, userId: user.$id, credential: 'jwt' };
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired dashboard session.' };
  }
}

async function authenticateUncached(request: Request): Promise<AuthResult> {
  const header = request.headers.get('authorization');
  if (!header) return { ok: false, status: 401, error: 'Missing Authorization header.' };

  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 4096) {
    return { ok: false, status: 401, error: 'Malformed authorization token.' };
  }

  if (token.startsWith('bf_')) {
    return isBrainfeatherApiKey(token)
      ? authenticateApiKey(token)
      : { ok: false, status: 401, error: 'Malformed API key.' };
  }
  return authenticateJwt(token);
}

export function authenticate(request: Request): Promise<AuthResult> {
  const cached = authCache.get(request);
  if (cached) return cached;
  const result = authenticateUncached(request);
  authCache.set(request, result);
  return result;
}

export async function authenticateDashboard(request: Request): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  if (auth.credential !== 'jwt') {
    return { ok: false, status: 403, error: 'Dashboard session required.' };
  }
  return auth;
}

export function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}
