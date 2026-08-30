import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiKeyHashWritesEnabled,
  apiKeyDigest,
  apiKeyHint,
  apiKeySlotId,
  createApiKey,
  isBrainfeatherApiKey,
  isHashedApiKey,
  legacyStoredApiKey,
  storedApiKey,
} from './api-key.ts';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_STORAGE_MODE = process.env.BRAINFEATHER_API_KEY_STORAGE;
const mutableEnv = process.env as Record<string, string | undefined>;

test.after(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_STORAGE_MODE === undefined) delete process.env.BRAINFEATHER_API_KEY_STORAGE;
  else process.env.BRAINFEATHER_API_KEY_STORAGE = ORIGINAL_STORAGE_MODE;
});

test('creates high-entropy Brainfeather tokens', () => {
  const first = createApiKey();
  const second = createApiKey();

  assert.match(first, /^bf_live_[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test('stores a deterministic digest without the token', () => {
  const token = 'bf_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const stored = storedApiKey(token);

  assert.equal(stored, `sha256:${apiKeyDigest(token)}:live:cdef`);
  assert.equal(stored.includes(token), false);
  assert.equal(isHashedApiKey(stored), true);
  assert.equal(apiKeyHint(stored), 'bf_live_...cdef');
});

test('renders a safe hint for legacy rows during migration', () => {
  assert.equal(apiKeyHint('bf_live_1234567890abcdef'), 'bf_live_...cdef');
  assert.equal(isHashedApiKey('bf_live_1234567890abcdef'), false);
  assert.equal(
    apiKeyHint(storedApiKey('bf_test_1234567890abcdef')),
    'bf_test_...cdef',
  );
  const oldDigest = legacyStoredApiKey('bf_live_1234567890abcdef');
  assert.equal(isHashedApiKey(oldDigest), true);
  assert.equal(apiKeyHint(oldDigest), 'bf_...cdef');
});

test('assigns stable, distinct per-user key slots', () => {
  assert.match(apiKeySlotId('user-1', 0), /^[a-f0-9]{36}$/);
  assert.notEqual(apiKeySlotId('user-1', 0), apiKeySlotId('user-1', 1));
  assert.notEqual(apiKeySlotId('user-1', 0), apiKeySlotId('user-2', 0));
});

test('recognizes current and historical token formats', () => {
  assert.equal(isBrainfeatherApiKey('bf_live_1234567890abcdef'), true);
  assert.equal(isBrainfeatherApiKey('bf_test_1234567890abcdef'), true);
  assert.equal(isBrainfeatherApiKey('bf_1234567890abcdef'), true);
  assert.equal(isBrainfeatherApiKey('bf_live_short'), false);
  assert.equal(isBrainfeatherApiKey('not-a-key'), false);
  assert.equal(apiKeyHint(storedApiKey('bf_1234567890abcdef')), 'bf_...cdef');
});

test('defaults production API-key writes to hashed storage', () => {
  mutableEnv.NODE_ENV = 'production';
  delete process.env.BRAINFEATHER_API_KEY_STORAGE;
  assert.equal(apiKeyHashWritesEnabled(), true);
});
