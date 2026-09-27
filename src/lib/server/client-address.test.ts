import assert from 'node:assert/strict';
import test from 'node:test';
import { clientAddress } from './client-address.ts';

/* The regression this file exists for: the old implementation took the
   left-most X-Forwarded-For entry, so a caller could supply its own
   value and mint a fresh rate-limit bucket per request. */
test('a client-supplied left-most forwarded entry cannot choose the bucket', () => {
  const spoofed = clientAddress(
    new Headers({ 'x-forwarded-for': '10.0.0.1, 203.0.113.10' }),
  );
  assert.equal(spoofed, '203.0.113.10');
});

test('the platform header wins over anything a proxy may have rewritten', () => {
  const address = clientAddress(
    new Headers({
      'x-vercel-forwarded-for': '203.0.113.10',
      'x-real-ip': '198.51.100.7',
      'x-forwarded-for': '10.0.0.1',
    }),
  );
  assert.equal(address, '203.0.113.10');
});

test('x-real-ip is preferred over a forwarded chain', () => {
  const address = clientAddress(
    new Headers({ 'x-real-ip': '203.0.113.10', 'x-forwarded-for': '10.0.0.1' }),
  );
  assert.equal(address, '203.0.113.10');
});

test('a single forwarded entry is used as-is', () => {
  assert.equal(
    clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.10' })),
    '203.0.113.10',
  );
});

/* Unidentifiable callers must share one bucket rather than skip the
   limit, so the fallback is a constant and never empty. */
test('an unidentifiable caller falls back to a single shared bucket', () => {
  assert.equal(clientAddress(new Headers()), 'unknown');
  assert.equal(clientAddress(new Headers({ 'x-forwarded-for': '  ,  ' })), 'unknown');
});
