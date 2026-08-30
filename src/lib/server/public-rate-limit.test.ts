import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { rateLimitRowId } from './public-rate-limit.ts';

test('rate-limit ids are stable without retaining the network address', () => {
  const secret = 'test-secret-with-at-least-thirty-two-characters';
  const first = rateLimitRowId('waitlist', '203.0.113.10', 1000, secret);
  assert.equal(first, rateLimitRowId('waitlist', '203.0.113.10', 1000, secret));
  assert.notEqual(first, rateLimitRowId('waitlist', '203.0.113.11', 1000, secret));
  assert.notEqual(first, rateLimitRowId('waitlist', '203.0.113.10', 2000, secret));
  assert.doesNotMatch(first, /203/);
});
