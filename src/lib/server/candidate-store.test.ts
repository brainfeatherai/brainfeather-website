import './test-env.ts';

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  candidateDocumentId,
  decodeCandidateDocument,
  encodeCandidateDocument,
} from './candidate-store.ts';

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

test('candidate document ids are stable and scoped to user, session, and content', () => {
  const candidate = {
    content: 'This project uses Vitest.',
    category: 'code',
    source: 'cursor',
    projectId: 'proj-1',
    branch: 'feature/auth',
    taskId: 'task-42',
  };
  const first = candidateDocumentId('user-1', candidate, 'session-1');
  assert.equal(first, candidateDocumentId('user-1', candidate, 'session-1'));
  assert.equal(first.length, 36);
  assert.notEqual(first, candidateDocumentId('user-2', candidate, 'session-1'));
  assert.notEqual(first, candidateDocumentId('user-1', candidate, 'session-2'));
  assert.notEqual(
    first,
    candidateDocumentId('user-1', { ...candidate, branch: 'feature/other' }, 'session-1'),
  );
  assert.notEqual(
    first,
    candidateDocumentId('user-1', { ...candidate, taskId: 'task-99' }, 'session-1'),
  );
  assert.notEqual(
    first,
    candidateDocumentId('user-1', { ...candidate, content: 'This project uses Jest.' }, 'session-1'),
  );
});

test('round-trips encrypted candidate documents without leaking plaintext fields', () => {
  const encoded = encodeCandidateDocument(
    'user-1',
    'candidate-1',
    {
      content: 'This project uses Vitest.',
      category: 'code',
      source: 'cursor',
      title: 'Testing',
      projectId: 'proj-1',
      branch: 'feature/auth',
      taskId: 'task-42',
      provenance: { type: 'agent', reference: 'session-1' },
      confidence: 0.7,
    },
    'session-1',
  );

  assert.equal(encoded.userId, 'user-1');
  assert.equal(encoded.status, 'pending');
  assert.equal(encoded.category, 'code');
  assert.notEqual(encoded.content, 'This project uses Vitest.');
  assert.notEqual(encoded.title, 'Testing');
  assert.notEqual(encoded.projectId, 'proj-1');
  assert.notEqual(encoded.sessionId, 'session-1');
  assert.ok((encoded.provenance?.length ?? 0) <= 768);

  const decoded = decodeCandidateDocument({
    $id: 'candidate-1',
    $createdAt: '2026-08-28T00:00:00.000Z',
    $updatedAt: '2026-08-28T00:00:00.000Z',
    userId: encoded.userId,
    sessionId: encoded.sessionId,
    source: encoded.source,
    category: encoded.category,
    content: encoded.content,
    title: encoded.title,
    projectId: encoded.projectId,
    provenance: encoded.provenance,
    confidence: encoded.confidence,
    status: encoded.status,
  });

  assert.equal(decoded.content, 'This project uses Vitest.');
  assert.equal(decoded.title, 'Testing');
  assert.equal(decoded.projectId, 'proj-1');
  assert.equal(decoded.branch, 'feature/auth');
  assert.equal(decoded.taskId, 'task-42');
  assert.equal(decoded.sessionId, 'session-1');
  assert.equal(decoded.provenance?.type, 'agent');
  assert.equal(decoded.provenance?.reference, 'session-1');
});

test('fits maximum validated scope and provenance in the candidate envelope', () => {
  const encoded = encodeCandidateDocument('user-1', 'candidate-max', {
    content: 'This project uses Vitest for unit tests.',
    category: 'code',
    projectId: 'p'.repeat(64),
    branch: 'b'.repeat(128),
    taskId: 't'.repeat(128),
    provenance: {
      type: 'file',
      reference: 'r'.repeat(128),
      digest: `sha256:${'a'.repeat(64)}`,
    },
  });

  assert.ok((encoded.projectId?.length ?? 0) <= 256);
  assert.ok((encoded.provenance?.length ?? 0) <= 768);
});
