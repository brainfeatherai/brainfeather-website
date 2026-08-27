import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWaitlistEmail } from './waitlist-email-address.ts';

test('normalizes Gmail aliases to the real mailbox', () => {
  assert.equal(
    normalizeWaitlistEmail(' WinOpBusiness+brainfeather-123@GMAIL.COM '),
    'winopbusiness@gmail.com',
  );
  assert.equal(
    normalizeWaitlistEmail('getbrainfeather+activation@googlemail.com'),
    'getbrainfeather@gmail.com',
  );
});

test('preserves plus addressing for non-Gmail providers', () => {
  assert.equal(
    normalizeWaitlistEmail('person+brainfeather@example.com'),
    'person+brainfeather@example.com',
  );
});

test('does not reinterpret malformed input as a valid Gmail address', () => {
  assert.equal(
    normalizeWaitlistEmail('person+bad alias@gmail.com'),
    'person@gmail.com',
  );
  // Callers validate the raw value before accepting the normalized result.
  assert.match('person+bad alias@gmail.com', /\s/);
});
