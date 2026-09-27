import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { SITE_URL } from '../site.ts';
import { normalizeWaitlistEmail } from '../waitlist-email-address.ts';

const LINK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const CONTEXT = 'brainfeather:waitlist-approval:v1';
/* Verification-only fallback for links already in flight.

   This is NOT dead weight: WAITLIST_APPROVAL_SECRET is not yet set in
   Vercel, so the deployed code has been signing every approval link with
   APPWRITE_API_KEY via its own `?? process.env.APPWRITE_API_KEY`
   fallback. Outstanding 30-day links in real inboxes therefore carry
   Appwrite-key signatures, and dropping this branch would reject them
   the moment the dedicated secret is introduced.

   Signing uses the dedicated secret only (see signingSecret), so the
   fallback self-retires: once every link issued before the cutover has
   expired, delete this constant and the branch in
   verifyWaitlistApprovalLink. */
const LEGACY_SIGNATURE_EXPIRES_BY = Date.parse('2026-10-31T23:59:59.999Z');

function isWaitlistId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(value);
}

let warnedAboutLegacySigning = false;

/* Prefer the dedicated secret; fall back to APPWRITE_API_KEY rather than
   throwing.

   The goal is to stop using the Appwrite master credential as an HMAC key:
   rotating it is routine, and rotation silently invalidates every
   outstanding approval email with no error anywhere. But WAITLIST_APPROVAL_SECRET
   is not set in Vercel, so throwing here would stop approval emails from
   being sent at all — a regression in exchange for a hardening. The
   fallback keeps today's behaviour and the improvement lands the moment
   the dedicated secret appears, with no code change and no cutover. */
function signingSecret(): string {
  const dedicated = process.env.WAITLIST_APPROVAL_SECRET;
  if (dedicated && dedicated.length >= 32) return dedicated;

  const legacy = process.env.APPWRITE_API_KEY;
  if (legacy) {
    if (!warnedAboutLegacySigning) {
      warnedAboutLegacySigning = true;
      console.warn(
        '[brainfeather] Signing waitlist approval links with APPWRITE_API_KEY. ' +
          'Set WAITLIST_APPROVAL_SECRET (32+ chars) so rotating the Appwrite key ' +
          'cannot invalidate outstanding approval emails.',
      );
    }
    return legacy;
  }

  throw new Error('[brainfeather] Waitlist approval signing is unavailable.');
}

function signatureWithSecret(
  secret: string,
  rowId: string,
  email: string,
  expires: number,
): string {
  return createHmac('sha256', secret)
    .update(`${CONTEXT}\0${rowId}\0${normalizeWaitlistEmail(email)}\0${expires}`)
    .digest('base64url');
}

function signature(rowId: string, email: string, expires: number): string {
  return signatureWithSecret(signingSecret(), rowId, email, expires);
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createWaitlistApprovalLink(
  rowId: string,
  email: string,
  now = Date.now(),
): string {
  if (!isWaitlistId(rowId)) throw new Error('[brainfeather] Invalid waitlist row ID.');
  const expires = now + LINK_LIFETIME_MS;
  const params = new URLSearchParams({
    request: rowId,
    expires: String(expires),
    signature: signature(rowId, email, expires),
  });
  return `${SITE_URL}/approve?${params}`;
}

export function verifyWaitlistApprovalLink(input: {
  rowId: string;
  email: string;
  expires: string;
  signature: string;
  now?: number;
}): boolean {
  const expires = Number(input.expires);
  const now = input.now ?? Date.now();
  if (
    !isWaitlistId(input.rowId) ||
    !Number.isSafeInteger(expires) ||
    expires <= now ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.signature)
  ) {
    return false;
  }

  if (signaturesMatch(signature(input.rowId, input.email, expires), input.signature)) {
    return true;
  }

  /* Cutover window only. While signingSecret() is still falling back to
     APPWRITE_API_KEY the branch above already covers those links, so this
     matters for exactly one transition: the day WAITLIST_APPROVAL_SECRET
     is introduced, every link already sitting in an inbox was signed with
     the Appwrite key and would otherwise start failing. */
  const legacy = process.env.APPWRITE_API_KEY;
  if (
    legacy &&
    process.env.WAITLIST_APPROVAL_SECRET &&
    now <= LEGACY_SIGNATURE_EXPIRES_BY
  ) {
    return signaturesMatch(
      signatureWithSecret(legacy, input.rowId, input.email, expires),
      input.signature,
    );
  }

  return false;
}
