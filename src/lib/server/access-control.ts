import 'server-only';

import { adminDb, COLLECTIONS, DATABASE_ID } from './appwrite-admin';
import { findWaitlistRequest } from './waitlist';

export async function hasProfile(userId: string): Promise<boolean> {
  try {
    await adminDb.getDocument(DATABASE_ID, COLLECTIONS.users, userId);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 404) return false;
    throw error;
  }
}

/* ────────────────────────────────────────────────────────────────
   The single answer to "may this account use the dashboard?".

   Previously `hasProfile(id) || isApprovedEmail(email)`, which made
   revocation impossible: the `users` row is created on first sign-in
   and never removed, so the left side short-circuited true forever and
   setting `approved: false` — or deleting the waitlist row outright —
   changed nothing. There was no way to de-authorise anyone short of
   deleting their Appwrite account.

   Now the waitlist row is authoritative whenever one exists, so
   revoking approval revokes access on the next request. `hasProfile`
   still grants access to accounts with NO waitlist row at all, which
   is what keeps administrative and pre-waitlist accounts working; it is
   a fallback for absent records, not an override of a present one.
   ──────────────────────────────────────────────────────────────── */
export async function accessAllowed(userId: string, email: string): Promise<boolean> {
  /* No address to look a waitlist row up by; the profile is all we have. */
  if (!email) return hasProfile(userId);

  const request = await findWaitlistRequest(email);
  if (request) return request.approved === true;
  return hasProfile(userId);
}
