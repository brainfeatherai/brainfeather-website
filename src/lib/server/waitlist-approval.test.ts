import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  createWaitlistApprovalLink,
  verifyWaitlistApprovalLink,
} from './waitlist-approval.ts';

const ORIGINAL_SECRET = process.env.WAITLIST_APPROVAL_SECRET;
const ORIGINAL_APPWRITE_KEY = process.env.APPWRITE_API_KEY;
const CONTEXT = 'brainfeather:waitlist-approval:v1';

test.beforeEach(() => {
  process.env.WAITLIST_APPROVAL_SECRET = 'test-only-approval-secret-with-32-chars';
  process.env.APPWRITE_API_KEY = 'legacy-appwrite-key';
});

test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.WAITLIST_APPROVAL_SECRET;
  else process.env.WAITLIST_APPROVAL_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_APPWRITE_KEY === undefined) delete process.env.APPWRITE_API_KEY;
  else process.env.APPWRITE_API_KEY = ORIGINAL_APPWRITE_KEY;
});

test('creates a signed, expiring review link', () => {
  const now = 1_800_000_000_000;
  const url = new URL(createWaitlistApprovalLink('request_123', 'Person+tag@gmail.com', now));
  assert.equal(url.pathname, '/approve');
  assert.equal(url.searchParams.get('request'), 'request_123');
  assert.equal(
    verifyWaitlistApprovalLink({
      rowId: 'request_123',
      email: 'person@gmail.com',
      expires: url.searchParams.get('expires')!,
      signature: url.searchParams.get('signature')!,
      now,
    }),
    true,
  );
});

test('rejects tampered and expired review links', () => {
  const now = 1_800_000_000_000;
  const url = new URL(createWaitlistApprovalLink('request_123', 'person@example.com', now));
  const input = {
    rowId: 'request_123',
    email: 'person@example.com',
    expires: url.searchParams.get('expires')!,
    signature: url.searchParams.get('signature')!,
  };
  assert.equal(verifyWaitlistApprovalLink({ ...input, rowId: 'request_456', now }), false);
  assert.equal(verifyWaitlistApprovalLink({ ...input, email: 'other@example.com', now }), false);
  assert.equal(
    verifyWaitlistApprovalLink({ ...input, now: Number(input.expires) + 1 }),
    false,
  );
});

const legacySignature = (rowId: string, email: string, expires: number): string =>
  createHmac('sha256', process.env.APPWRITE_API_KEY!)
    .update(`${CONTEXT}\0${rowId}\0${email}\0${expires}`)
    .digest('base64url');

/* The cutover, and the reason the legacy branch cannot be deleted yet:
   production has been signing with APPWRITE_API_KEY because
   WAITLIST_APPROVAL_SECRET was never set. Links live 30 days, so on the
   day the dedicated secret is introduced there are real approval emails
   in real inboxes carrying Appwrite-key signatures. Rejecting them would
   silently strand those applicants. */
test('still accepts Appwrite-key links during the cutover window', () => {
  const rowId = 'request_legacy';
  const email = 'person@example.com';
  const expires = Date.parse('2026-10-15T00:00:00.000Z');

  assert.equal(
    verifyWaitlistApprovalLink({
      rowId,
      email,
      expires: String(expires),
      signature: legacySignature(rowId, email, expires),
      now: Date.parse('2026-09-15T00:00:00.000Z'),
    }),
    true,
  );
});

/* The other half of the contract: the fallback self-retires. Without
   this, the Appwrite master key stays a valid signing key indefinitely. */
test('rejects Appwrite-key links once the cutover window closes', () => {
  const rowId = 'request_legacy';
  const email = 'person@example.com';
  const expires = Date.parse('2026-12-10T00:00:00.000Z');

  assert.equal(
    verifyWaitlistApprovalLink({
      rowId,
      email,
      expires: String(expires),
      signature: legacySignature(rowId, email, expires),
      now: Date.parse('2026-11-20T00:00:00.000Z'),
    }),
    false,
  );
});

/* Production today: no dedicated secret, so signing must fall back rather
   than throw. This is the case whose absence would have taken the site
   down — approval emails could not be generated at all. */
test('signs and verifies with the Appwrite key when no dedicated secret exists', () => {
  delete process.env.WAITLIST_APPROVAL_SECRET;
  const now = 1_800_000_000_000;
  const original = console.warn;
  console.warn = () => {};
  try {
    const url = new URL(createWaitlistApprovalLink('request_123', 'person@example.com', now));
    assert.equal(
      verifyWaitlistApprovalLink({
        rowId: 'request_123',
        email: 'person@example.com',
        expires: url.searchParams.get('expires')!,
        signature: url.searchParams.get('signature')!,
        now,
      }),
      true,
    );
  } finally {
    console.warn = original;
  }
});

test('throws only when neither signing secret is available', () => {
  delete process.env.WAITLIST_APPROVAL_SECRET;
  delete process.env.APPWRITE_API_KEY;
  assert.throws(
    () => createWaitlistApprovalLink('request_123', 'person@example.com'),
    /signing is unavailable/,
  );
});
