import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOAuthRedirectUrls,
  dashboardSessionPath,
} from './invitation-auth.ts';
import {
  normalizeWaitlistEmail,
  waitlistEmailsMatch,
} from './waitlist-email-address.ts';

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

test('matches an authenticated account to its normalized invitation email', () => {
  assert.equal(
    waitlistEmailsMatch('Person+brainfeather@gmail.com', 'person@gmail.com'),
    true,
  );
  assert.equal(waitlistEmailsMatch('other@example.com', 'person@example.com'), false);
});

test('preserves the invitation through Google OAuth and session verification', () => {
  const redirects = buildOAuthRedirectUrls('https://brainfeather.com', 'request_123');
  assert.equal(
    redirects.success,
    'https://brainfeather.com/auth/callback?invite=request_123',
  );
  assert.equal(
    redirects.failure,
    'https://brainfeather.com/login?error=oauth&invite=request_123',
  );
  assert.equal(dashboardSessionPath('request_123'), '/api/public/session?invite=request_123');
  assert.equal(dashboardSessionPath(), '/api/public/session');
});
