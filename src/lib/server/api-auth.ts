import 'server-only';

/* ────────────────────────────────────────────────────────────────
   Bearer-token authentication for /api/v1/*.

   A caller presents `Authorization: Bearer bf_live_…`. This resolves it
   to a userId by looking the token up in `api_keys`, which is what makes
   keys revocable: delete the row and the token stops working on the next
   request, with no deploy and no shared secret to rotate.

   Verified: `key` carries no index (api_keys has only idx_user on
   userId) and Appwrite still serves Query.equal on it. Worth revisiting
   if the table grows — an unindexed equality scan is fine at hundreds of
   rows and not at millions.

   Two things deliberately NOT done yet, both noted in the repo README:
   keys are stored in plaintext rather than hashed, and there is no rate
   limiting. Neither blocks the transport swap, and both matter before
   this is public.
   ──────────────────────────────────────────────────────────────── */

import { Query } from 'node-appwrite';
import { adminDb, DATABASE_ID, COLLECTIONS } from './appwrite-admin';

export type AuthResult =
  | { ok: true; userId: string; keyId: string }
  | { ok: false; status: 401 | 403; error: string };

const PREFIXES = ['bf_live_', 'bf_test_'];

export async function authenticate(request: Request): Promise<AuthResult> {
  const header = request.headers.get('authorization');
  if (!header) {
    return { ok: false, status: 401, error: 'Missing Authorization header.' };
  }

  /* Accept a bare token as well as `Bearer <token>`. Enough clients get
     this wrong that rejecting the bare form buys nothing. */
  const token = header.replace(/^Bearer\s+/i, '').trim();

  if (!PREFIXES.some((p) => token.startsWith(p))) {
    return {
      ok: false,
      status: 401,
      error: 'Malformed token. Expected a bf_live_ or bf_test_ key.',
    };
  }

  let found;
  try {
    found = await adminDb.listDocuments(DATABASE_ID, COLLECTIONS.apiKeys, [
      Query.equal('key', token),
      Query.limit(1),
    ]);
  } catch {
    /* An Appwrite failure here is ours, not the caller's — do not report
       it as an auth rejection, which would send them chasing their key. */
    return { ok: false, status: 403, error: 'Could not verify token.' };
  }

  const row = found.documents[0];
  if (!row) {
    // Same message for "never existed" and "revoked": telling them apart
    // lets someone probe which tokens were once valid.
    return { ok: false, status: 401, error: 'Invalid or revoked token.' };
  }

  /* Usage tracking, fire and forget. A failed timestamp write must not
     fail the request it is annotating. */
  void adminDb
    .updateDocument(DATABASE_ID, COLLECTIONS.apiKeys, row.$id, {
      lastUsedAt: new Date().toISOString(),
    })
    .catch(() => {});

  return { ok: true, userId: row.userId as string, keyId: row.$id };
}

/** Uniform error body, so every route fails the same shape. */
export function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}
