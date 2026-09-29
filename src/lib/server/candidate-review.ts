import 'server-only';

import {
  completeCandidateApproval,
  getMemoryCandidate,
  transitionMemoryCandidate,
  type MemoryCandidateDoc,
} from './candidate-store.ts';
import { undoBlocker } from '../auto-approval.ts';
import { syncMentionEdges, updateMemory } from './memory-store.ts';
import { NeedsReview, think, type Candidate, type Decision } from './think.ts';

export class CandidateReviewError extends Error {
  status: 404 | 409;

  constructor(message: string, status: 404 | 409) {
    super(message);
    this.status = status;
  }
}

export function candidateForApproval(candidate: MemoryCandidateDoc): Candidate {
  return {
    content: candidate.content,
    category: candidate.category,
    source: candidate.source,
    title: candidate.title,
    projectId: candidate.projectId,
    ...(candidate.branch ? { branch: candidate.branch } : {}),
    ...(candidate.taskId ? { taskId: candidate.taskId } : {}),
    provenance: candidate.provenance,
    confidence: candidate.confidence,
  };
}

export async function approveMemoryCandidate(
  userId: string,
  id: string,
): Promise<{ candidate: MemoryCandidateDoc; decision: Decision; idempotent: boolean }> {
  const existing = await getMemoryCandidate(userId, id);
  if (!existing) throw new CandidateReviewError('No such memory candidate.', 404);
  if (existing.status === 'rejected') {
    throw new CandidateReviewError('This candidate was already rejected.', 409);
  }
  if (existing.status === 'approved') {
    if (!existing.decision) {
      throw new CandidateReviewError('This candidate approval is already in progress.', 409);
    }
    return { candidate: existing, decision: existing.decision, idempotent: true };
  }

  const claimed = await transitionMemoryCandidate(
    userId,
    id,
    'pending',
    'approved',
  );
  if (!claimed.candidate) {
    throw new CandidateReviewError('No such memory candidate.', 404);
  }
  if (!claimed.changed) {
    if (claimed.candidate.status === 'approved' && claimed.candidate.decision) {
      return {
        candidate: claimed.candidate,
        decision: claimed.candidate.decision,
        idempotent: true,
      };
    }
    throw new CandidateReviewError('This candidate is no longer pending.', 409);
  }

  try {
    const decision = await think(userId, candidateForApproval(claimed.candidate));
    const completed = await completeCandidateApproval(userId, id, decision);
    if (!completed) {
      throw new Error('Candidate approval state changed before completion.');
    }
    return { candidate: completed, decision, idempotent: false };
  } catch (error) {
    await transitionMemoryCandidate(userId, id, 'approved', 'pending').catch(() => {});
    throw error;
  }
}

export async function rejectMemoryCandidate(
  userId: string,
  id: string,
): Promise<{ candidate: MemoryCandidateDoc; idempotent: boolean }> {
  const existing = await getMemoryCandidate(userId, id);
  if (!existing) throw new CandidateReviewError('No such memory candidate.', 404);
  if (existing.status === 'approved') {
    throw new CandidateReviewError('This candidate was already approved.', 409);
  }
  if (existing.status === 'rejected') {
    return { candidate: existing, idempotent: true };
  }

  const rejected = await transitionMemoryCandidate(
    userId,
    id,
    'pending',
    'rejected',
  );
  if (!rejected.candidate) {
    throw new CandidateReviewError('No such memory candidate.', 404);
  }
  if (!rejected.changed && rejected.candidate.status !== 'rejected') {
    throw new CandidateReviewError('This candidate is no longer pending.', 409);
  }
  return { candidate: rejected.candidate, idempotent: !rejected.changed };
}

/* Approve without a person, but only when the save is purely additive.
   Anything think() would reject, or that would retire an existing memory,
   is put back in the queue so the owner decides. Returns null in that case. */
export async function autoApproveMemoryCandidate(
  userId: string,
  id: string,
): Promise<Decision | null> {
  const claimed = await transitionMemoryCandidate(userId, id, 'pending', 'approved');
  if (!claimed.candidate || !claimed.changed) return null;

  const release = () =>
    transitionMemoryCandidate(userId, id, 'approved', 'pending').catch(() => {});
  try {
    const decision = await think(userId, candidateForApproval(claimed.candidate), {
      requireNoSupersede: true,
    });
    if (decision.action === 'reject') {
      await release();
      return null;
    }
    const completed = await completeCandidateApproval(userId, id, decision, { auto: true });
    if (!completed) throw new Error('Candidate approval state changed before completion.');
    return decision;
  } catch (error) {
    await release();
    if (error instanceof NeedsReview) return null;
    throw error;
  }
}

/* Undo an auto-approval: retract the memory it created and mark the
   candidate rejected, so the same fact is never auto-approved again. */
export async function undoAutoApproval(
  userId: string,
  id: string,
): Promise<{ candidate: MemoryCandidateDoc }> {
  const existing = await getMemoryCandidate(userId, id);
  if (!existing) throw new CandidateReviewError('No such memory candidate.', 404);
  const blocked = undoBlocker(existing);
  if (blocked) throw new CandidateReviewError(blocked, 409);

  const memoryId = (existing.decision as { id: string }).id;
  const retracted = await updateMemory(userId, memoryId, {
    status: 'invalid',
    supersededBy: 'dashboard',
  });
  if (retracted) await syncMentionEdges(userId, memoryId, []).catch(() => {});

  const result = await transitionMemoryCandidate(userId, id, 'approved', 'rejected');
  if (!result.candidate) throw new CandidateReviewError('No such memory candidate.', 404);
  if (!result.changed && result.candidate.status !== 'rejected') {
    throw new CandidateReviewError('This candidate is no longer approved.', 409);
  }
  return { candidate: result.candidate };
}
