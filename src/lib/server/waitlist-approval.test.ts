import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWaitlistApprovalLink,
  verifyWaitlistApprovalLink,
} from './waitlist-approval.ts';

const ORIGINAL_SECRET = process.env.WAITLIST_APPROVAL_SECRET;

test.beforeEach(() => {
  process.env.WAITLIST_APPROVAL_SECRET = 'test-only-approval-secret';
});

test.after(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.WAITLIST_APPROVAL_SECRET;
  else process.env.WAITLIST_APPROVAL_SECRET = ORIGINAL_SECRET;
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
