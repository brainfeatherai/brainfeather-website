import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateReviewError,
  candidateForApproval,
} from './candidate-review.ts';

test('maps a stored candidate onto the think() input without activating it', () => {
  const candidate = candidateForApproval({
    $id: 'cand-1',
    $createdAt: '2026-08-28T00:00:00.000Z',
    $updatedAt: '2026-08-28T00:00:00.000Z',
    userId: 'user-1',
    sessionId: 'session-1',
    source: 'cursor',
    category: 'decision',
    content: 'We decided to store sessions as signed tokens.',
    projectId: 'proj-1',
    branch: 'feature/auth',
    taskId: 'task-42',
    provenance: { type: 'agent', reference: 'session-1' },
    confidence: 0.7,
    status: 'pending',
  });

  assert.deepEqual(candidate, {
    content: 'We decided to store sessions as signed tokens.',
    category: 'decision',
    source: 'cursor',
    title: undefined,
    projectId: 'proj-1',
    branch: 'feature/auth',
    taskId: 'task-42',
    provenance: { type: 'agent', reference: 'session-1' },
    confidence: 0.7,
  });
});

test('review conflicts keep pending and rejected states distinct', () => {
  const missing = new CandidateReviewError('No such memory candidate.', 404);
  const conflict = new CandidateReviewError('This candidate was already rejected.', 409);
  assert.equal(missing.status, 404);
  assert.equal(conflict.status, 409);
});
