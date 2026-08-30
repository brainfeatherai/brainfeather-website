import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  blindIndex,
  decryptStoredValue,
  encryptStoredValue,
  isEncryptedValue,
  lookupValues,
} from './data-encryption.ts';

const ORIGINAL_MODE = process.env.BRAINFEATHER_DATA_ENCRYPTION;
const ORIGINAL_KEYS = process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS;
const ORIGINAL_INDEX_KEY = process.env.BRAINFEATHER_DATA_INDEX_KEY;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

const firstKey = randomBytes(32).toString('base64url');
const secondKey = randomBytes(32).toString('base64url');
const indexKey = randomBytes(32).toString('base64url');

const context = {
  userId: 'user-1',
  collection: 'memories',
  documentId: 'memory-1',
  field: 'content',
};

test.beforeEach(() => {
  process.env.BRAINFEATHER_DATA_ENCRYPTION = 'encrypted';
  process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS = `v1:${firstKey}`;
  process.env.BRAINFEATHER_DATA_INDEX_KEY = indexKey;
});

test.after(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.BRAINFEATHER_DATA_ENCRYPTION;
  else process.env.BRAINFEATHER_DATA_ENCRYPTION = ORIGINAL_MODE;
  if (ORIGINAL_KEYS === undefined) delete process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS;
  else process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS = ORIGINAL_KEYS;
  if (ORIGINAL_INDEX_KEY === undefined) delete process.env.BRAINFEATHER_DATA_INDEX_KEY;
  else process.env.BRAINFEATHER_DATA_INDEX_KEY = ORIGINAL_INDEX_KEY;
  if (ORIGINAL_NODE_ENV === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
});

test('encrypts with randomized authenticated envelopes and decrypts losslessly', () => {
  const plaintext = 'The user prefers concise answers.';
  const first = encryptStoredValue(plaintext, context);
  const second = encryptStoredValue(plaintext, context);

  assert.equal(isEncryptedValue(first), true);
  assert.equal(first.includes(plaintext), false);
  assert.notEqual(first, second);
  assert.equal(decryptStoredValue(first, context), plaintext);
  assert.equal(decryptStoredValue(second, context), plaintext);
});

test('binds ciphertext to its user, row, collection, and field', () => {
  const encrypted = encryptStoredValue('private', context);

  for (const changed of [
    { ...context, userId: 'user-2' },
    { ...context, documentId: 'memory-2' },
    { ...context, collection: 'entities' },
    { ...context, field: 'title' },
  ]) {
    assert.throws(() => decryptStoredValue(encrypted, changed), /authenticate encrypted data/);
  }
});

test('rejects tampered ciphertext', () => {
  const encrypted = encryptStoredValue('private', context);
  const parts = encrypted.split('.');
  const ciphertext = Buffer.from(parts[4], 'base64url');
  ciphertext[0] ^= 1;
  parts[4] = ciphertext.toString('base64url');
  const tampered = parts.join('.');
  assert.throws(() => decryptStoredValue(tampered, context), /authenticate encrypted data/);
});

test('supports key rotation while old keys remain in the keyring', () => {
  const oldCiphertext = encryptStoredValue('before rotation', context);
  process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS = `v2:${secondKey},v1:${firstKey}`;
  const newCiphertext = encryptStoredValue('after rotation', context);

  assert.match(oldCiphertext, /^bfe1\.v1\./);
  assert.match(newCiphertext, /^bfe1\.v2\./);
  assert.equal(decryptStoredValue(oldCiphertext, context), 'before rotation');
  assert.equal(decryptStoredValue(newCiphertext, context), 'after rotation');
});

test('reads legacy plaintext and leaves writes plaintext while disabled', () => {
  process.env.BRAINFEATHER_DATA_ENCRYPTION = 'plaintext';
  assert.equal(decryptStoredValue('legacy value', context), 'legacy value');
  assert.equal(encryptStoredValue('legacy value', context), 'legacy value');
});

test('refuses an implicit plaintext mode in production runtimes', () => {
  mutableEnv.NODE_ENV = 'production';
  delete process.env.BRAINFEATHER_DATA_ENCRYPTION;
  assert.throws(
    () => encryptStoredValue('must not leak', context),
    /must be explicit in production runtimes/,
  );
});

test('compatibility mode reads both formats, queries both indexes, and writes plaintext', () => {
  const encrypted = encryptStoredValue('encrypted value', context);
  process.env.BRAINFEATHER_DATA_ENCRYPTION = 'compatibility';

  assert.equal(decryptStoredValue(encrypted, context), 'encrypted value');
  assert.equal(encryptStoredValue('new value', context), 'new value');
  assert.deepEqual(lookupValues('repo', 'user-1', 'memory.projectId'), [
    blindIndex('repo', 'user-1', 'memory.projectId'),
    'repo',
  ]);
  const preserved = encryptStoredValue('edited encrypted value', context, true);
  assert.equal(decryptStoredValue(preserved, context), 'edited encrypted value');
});

test('creates tenant-bound blind indexes with legacy lookup compatibility', () => {
  const first = blindIndex('github.com/acme/repo', 'user-1', 'memory.projectId');
  const repeated = blindIndex('github.com/acme/repo', 'user-1', 'memory.projectId');
  const otherUser = blindIndex('github.com/acme/repo', 'user-2', 'memory.projectId');

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, repeated);
  assert.notEqual(first, otherUser);
  assert.deepEqual(lookupValues('github.com/acme/repo', 'user-1', 'memory.projectId'), [
    first,
    'github.com/acme/repo',
  ]);
});

test('fits worst-case validated values in the documented columns', () => {
  const memoryContent = encryptStoredValue('😀'.repeat(2000), context);
  const memoryTitle = encryptStoredValue('😀'.repeat(120), {
    ...context,
    field: 'title',
  });
  const memoryMetadata = encryptStoredValue(JSON.stringify({
    v: 2,
    m: JSON.stringify({
      v: 2,
      mt: 'correction',
      c: 1,
      p: { t: 'commit', r: 'r'.repeat(128) },
      is: Array.from({ length: 25 }, () => 'a'.repeat(64)),
      oa: '2026-08-27T00:00:00.000Z',
      vf: '2026-08-27T00:00:00.000Z',
      vt: '2026-09-27T00:00:00.000Z',
      ia: '2026-09-27T00:00:00.000Z',
      tt: 'decision',
    }),
    p: 'p'.repeat(64),
  }), {
    ...context,
    field: 'metadata',
  });
  const entitySummary = encryptStoredValue('😀'.repeat(500), {
    ...context,
    collection: 'entities',
    documentId: 'entity-1',
    field: 'summary',
  });

  assert.ok(memoryContent.length <= 11000);
  assert.ok(memoryTitle.length <= 1024);
  assert.ok(memoryMetadata.length <= 3000);
  assert.ok(entitySummary.length <= 3000);
});
