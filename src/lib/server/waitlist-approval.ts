import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { SITE_URL } from '../site.ts';
import { normalizeWaitlistEmail } from '../waitlist-email-address.ts';

const LINK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const CONTEXT = 'brainfeather:waitlist-approval:v1';

function isWaitlistId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(value);
}

function signingSecret(): string {
  /* Dedicated secret only, never APPWRITE_API_KEY: rotating the Appwrite
     master credential is routine, and it would silently invalidate every
     outstanding 30-day approval email with no error anywhere. Production
     boot enforces the same requirement via production-config.ts. */
  const secret = process.env.WAITLIST_APPROVAL_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      '[brainfeather] WAITLIST_APPROVAL_SECRET must be a dedicated secret of at least 32 characters.',
    );
  }
  return secret;
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

  /* One secret, one code path. The migration fallback that verified
     links signed with APPWRITE_API_KEY is gone: links live 30 days, the
     dedicated secret has been in place far longer than that, so every
     outstanding link is already signed with it. Keeping the fallback
     only kept the Appwrite master credential inside a crypto path. */
  return signaturesMatch(signature(input.rowId, input.email, expires), input.signature);
}
