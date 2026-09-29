/* Auto-approval rules shared by the capture pipeline and the review page.
   Pure so both sides agree on the undo window and it can be tested alone. */

/** How long an auto-approved memory can be undone from the review page. */
export const AUTO_APPROVAL_UNDO_MS = 7 * 24 * 60 * 60 * 1000;

/* Hooks run as a new process on every event, so each capture can arrive
   with a fresh server session. Two captures only count as separate
   sessions when they are also this far apart in time. */
export const SESSION_GAP_MS = 60 * 60 * 1000;

type Undoable = {
  status: string;
  autoApproved?: boolean;
  reviewedAt?: string;
  decision?: { action: string; id?: string };
};

/** Why an auto-approval can no longer be undone, or null if it still can. */
export function undoBlocker(item: Undoable, nowMs = Date.now()): string | null {
  if (item.status !== 'approved' || !item.autoApproved) {
    return 'Only auto-approved memories can be undone.';
  }
  if (item.decision?.action !== 'add' || !item.decision.id) {
    return 'This approval did not create a memory.';
  }
  const reviewedAt = Date.parse(item.reviewedAt ?? '');
  if (!Number.isFinite(reviewedAt) || nowMs - reviewedAt > AUTO_APPROVAL_UNDO_MS) {
    return 'The 7-day undo window has passed. Retract it from Memories instead.';
  }
  return null;
}
