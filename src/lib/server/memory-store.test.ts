import './test-env.ts';

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  decodeMemoryDocument,
  encodeMemoryDocument,
  mentionEdgeId,
} from './memory-store.ts';

const ORIGINAL_MODE = process.env.BRAINFEATHER_DATA_ENCRYPTION;
const ORIGINAL_KEYS = process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS;
const ORIGINAL_INDEX_KEY = process.env.BRAINFEATHER_DATA_INDEX_KEY;
const key = randomBytes(32).toString('base64url');
const indexKey = randomBytes(32).toString('base64url');

test.beforeEach(() => {
  process.env.BRAINFEATHER_DATA_ENCRYPTION = 'encrypted';
  process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS = `v1:${key}`;
  process.env.BRAINFEATHER_DATA_INDEX_KEY = indexKey;
});

test.after(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.BRAINFEATHER_DATA_ENCRYPTION;
  else process.env.BRAINFEATHER_DATA_ENCRYPTION = ORIGINAL_MODE;
  if (ORIGINAL_KEYS === undefined) delete process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS;
  else process.env.BRAINFEATHER_DATA_ENCRYPTION_KEYS = ORIGINAL_KEYS;
  if (ORIGINAL_INDEX_KEY === undefined) delete process.env.BRAINFEATHER_DATA_INDEX_KEY;
  else process.env.BRAINFEATHER_DATA_INDEX_KEY = ORIGINAL_INDEX_KEY;
});

test('mention edge ids are stable and scoped to user, memory, and entity', () => {
  const first = mentionEdgeId('user-1', 'mem-1', 'ent-1');
  assert.equal(first, mentionEdgeId('user-1', 'mem-1', 'ent-1'));
  assert.equal(first.length, 36);
  assert.notEqual(first, mentionEdgeId('user-2', 'mem-1', 'ent-1'));
  assert.notEqual(first, mentionEdgeId('user-1', 'mem-2', 'ent-1'));
});

test('round-trips encrypted memory documents without leaking plaintext fields', () => {
  const encoded = encodeMemoryDocument('user-1', 'memory-1', {
    content: 'This project uses Vitest.',
    category: 'code',
    source: 'cursor',
    title: 'Testing',
    projectId: 'proj-1',
    branch: 'feature/auth',
    taskId: 'task-42',
    metadata: JSON.stringify({ memoryType: 'pattern' }),
  });

  assert.equal(encoded.userId, 'user-1');
  assert.equal(encoded.status, 'active');
  assert.equal(encoded.category, 'code');
  assert.notEqual(encoded.content, 'This project uses Vitest.');
  assert.notEqual(encoded.title, 'Testing');
  assert.notEqual(encoded.projectId, 'proj-1');

  const decoded = decodeMemoryDocument({
    $id: 'memory-1',
    $createdAt: '2026-08-28T00:00:00.000Z',
    userId: encoded.userId,
    source: encoded.source,
    title: encoded.title,
    content: encoded.content,
    category: encoded.category,
    tags: encoded.tags,
    status: encoded.status,
    projectId: encoded.projectId,
    metadata: encoded.metadata,
  });

  assert.equal(decoded.content, 'This project uses Vitest.');
  assert.equal(decoded.title, 'Testing');
  assert.equal(decoded.projectId, 'proj-1');
  assert.equal(decoded.branch, 'feature/auth');
  assert.equal(decoded.taskId, 'task-42');
  assert.equal(JSON.parse(decoded.metadata ?? '{}').mt, 'pattern');
});

test('stores plaintext when encryption is disabled', () => {
  process.env.BRAINFEATHER_DATA_ENCRYPTION = 'plaintext';
  const encoded = encodeMemoryDocument('user-1', 'memory-2', {
    content: 'Prefer terse replies.',
    category: 'preference',
  });
  assert.equal(encoded.content, 'Prefer terse replies.');
  assert.equal(encoded.title, '');
  assert.equal(encoded.source, 'manual');
});
