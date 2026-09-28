import assert from 'node:assert/strict';
import test from 'node:test';
import { byReviewPriority, confidenceBand, confidencePercent } from './review-order.ts';

const item = (id: string, confidence: number, createdAt: string) => ({
  $id: id,
  confidence,
  $createdAt: createdAt,
});

test('orders pending candidates by confidence, newest first on ties', () => {
  const ordered = byReviewPriority([
    item('low', 0.4, '2026-09-28T10:00:00Z'),
    item('high-old', 0.9, '2026-09-01T10:00:00Z'),
    item('high-new', 0.9, '2026-09-27T10:00:00Z'),
    item('mid', 0.6, '2026-09-28T09:00:00Z'),
  ]);
  assert.deepEqual(
    ordered.map((candidate) => candidate.$id),
    ['high-new', 'high-old', 'mid', 'low'],
  );
});

test('does not mutate the input and tolerates malformed values', () => {
  const input = [item('bad', Number.NaN, 'not a date'), item('ok', 0.5, '2026-09-28T10:00:00Z')];
  const ordered = byReviewPriority(input);
  assert.deepEqual(input.map((candidate) => candidate.$id), ['bad', 'ok']);
  assert.deepEqual(ordered.map((candidate) => candidate.$id), ['ok', 'bad']);
});

test('maps confidence to a readable band and percent', () => {
  assert.equal(confidenceBand(0.8), 'high');
  assert.equal(confidenceBand(0.75), 'high');
  assert.equal(confidenceBand(0.7), 'medium');
  assert.equal(confidenceBand(0.4), 'low');
  assert.equal(confidenceBand(Number.NaN), 'low');
  assert.equal(confidencePercent(0.826), '83%');
  assert.equal(confidencePercent(1.4), '100%');
  assert.equal(confidencePercent(Number.NaN), '0%');
});
