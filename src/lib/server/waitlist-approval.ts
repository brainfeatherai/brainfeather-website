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
  const secret = process.env.WAITLIST_APPROVAL_SECRET ?? process.env.APPWRITE_API_KEY;
  if (!secret) throw new Error('[brainfeather] Waitlist approval signing is unavailable.');
  return secret;
}

function signature(rowId: string, email: string, expires: number): string {
  return createHmac('sha256', signingSecret())
    .update(`${CONTEXT}\0${rowId}\0${normalizeWaitlistEmail(email)}\0${expires}`)
    .digest('base64url');
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

  const expected = Buffer.from(signature(input.rowId, input.email, expires));
  const actual = Buffer.from(input.signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
