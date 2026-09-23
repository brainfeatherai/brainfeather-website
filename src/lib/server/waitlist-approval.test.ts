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

/* The Appwrite master key is no longer accepted as a signing secret.
   Asserting rejection — rather than deleting the case — is what stops
   the fallback from being reintroduced as a convenience later. */
test('rejects links signed with the Appwrite master key', () => {
  const rowId = 'request_legacy';
  const email = 'person@example.com';
  const expires = Date.parse('2026-10-15T00:00:00.000Z');
  const legacy = createHmac('sha256', process.env.APPWRITE_API_KEY!)
    .update(`${CONTEXT}\0${rowId}\0${email}\0${expires}`)
    .digest('base64url');

  assert.equal(
    verifyWaitlistApprovalLink({
      rowId,
      email,
      expires: String(expires),
      signature: legacy,
      now: Date.parse('2026-09-15T00:00:00.000Z'),
    }),
    false,
  );
});
