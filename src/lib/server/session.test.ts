import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeSession,
  encodeSession,
  markRecalled,
  needsProactiveRecall,
  recordCapture,
  startSession,
  tryEncodeSession,
} from './session.ts';

const SECRET = 'test-session-secret';

test('new sessions need proactive recall until context is loaded', () => {
  const session = startSession(
    'user-1',
    { projectId: 'proj-1', branch: 'feature/auth', taskId: 'task-42' },
    new Date('2026-08-28T12:00:00.000Z'),
  );
  assert.equal(session.userId, 'user-1');
  assert.equal(session.projectId, 'proj-1');
  assert.equal(session.branch, 'feature/auth');
  assert.equal(session.taskId, 'task-42');
  assert.equal(session.captureCount, 0);
  assert.equal(needsProactiveRecall(session), true);

  const recalled = markRecalled(session, new Date('2026-08-28T12:01:00.000Z'));
  assert.equal(needsProactiveRecall(recalled), false);
  assert.equal(recalled.recalledAt, '2026-08-28T12:01:00.000Z');
});

test('records capture activity against the same session', () => {
  const session = recordCapture(startSession('user-1'), 2, new Date('2026-08-28T12:02:00.000Z'));
  assert.equal(session.captureCount, 2);
  assert.equal(session.lastActivityAt, '2026-08-28T12:02:00.000Z');
});

test('signs session tokens so they cannot be swapped across users', () => {
  const session = startSession('user-1', { projectId: 'proj-1' });
  const token = encodeSession(session, SECRET);
  assert.deepEqual(decodeSession(token, 'user-1', SECRET)?.id, session.id);
  assert.equal(decodeSession(token, 'user-2', SECRET), null);
  assert.equal(decodeSession(token.slice(0, -2) + 'ab', 'user-1', SECRET), null);
});

test('tryEncodeSession omits the token when signing is not configured', () => {
  const session = startSession('user-1', { projectId: 'proj-1' });
  assert.equal(tryEncodeSession(session, ''), undefined);
  assert.equal(typeof tryEncodeSession(session, SECRET), 'string');
});

test('rejects session tokens older than 24 hours', () => {
  const expired = startSession(
    'user-1',
    { projectId: 'proj-1' },
    new Date(Date.now() - 24 * 60 * 60 * 1000 - 1),
  );
  assert.equal(decodeSession(encodeSession(expired, SECRET), 'user-1', SECRET), null);
});
