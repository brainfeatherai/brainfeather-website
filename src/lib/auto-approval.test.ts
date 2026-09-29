import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTO_APPROVAL_UNDO_MS, undoBlocker } from './auto-approval.ts';

const now = Date.parse('2026-09-29T12:00:00.000Z');
const approved = {
  status: 'approved',
  autoApproved: true,
  reviewedAt: new Date(now - 60_000).toISOString(),
  decision: { action: 'add', id: 'mem-1' },
};

test('an auto-approved memory can be undone inside the window', () => {
  assert.equal(undoBlocker(approved, now), null);
});

test('undo is refused after seven days', () => {
  const old = { ...approved, reviewedAt: new Date(now - AUTO_APPROVAL_UNDO_MS - 1).toISOString() };
  assert.match(undoBlocker(old, now) ?? '', /7-day/);
});

test('manual approvals and duplicates cannot be undone here', () => {
  assert.ok(undoBlocker({ ...approved, autoApproved: undefined }, now));
  assert.ok(undoBlocker({ ...approved, decision: { action: 'duplicate', id: 'mem-1' } }, now));
  assert.ok(undoBlocker({ ...approved, status: 'rejected' }, now));
  assert.ok(undoBlocker({ ...approved, reviewedAt: undefined }, now));
});
