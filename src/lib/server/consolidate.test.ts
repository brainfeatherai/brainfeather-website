import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consolidationCommits,
  memoriesByProject,
  mergeClusterContent,
  relatedMemoryClusters,
} from './consolidate.ts';

test('clusters related memories in the same category', () => {
  const clusters = relatedMemoryClusters([
    {
      $id: 'a',
      $createdAt: '2026-08-28T12:00:00.000Z',
      category: 'code',
      content: 'This project uses Vitest for unit tests.',
    },
    {
      $id: 'b',
      $createdAt: '2026-08-28T13:00:00.000Z',
      category: 'code',
      content: 'This project uses Vitest for unit tests in CI.',
    },
    {
      $id: 'c',
      $createdAt: '2026-08-28T14:00:00.000Z',
      category: 'decision',
      content: 'Authentication uses Supabase row-level security.',
    },
  ]);

  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].ids, ['b', 'a']);
  assert.equal(clusters[0].category, 'code');
  assert.match(clusters[0].mergedContent, /Vitest/);
});

test('merges overlapping cluster text without repeating the shorter copy', () => {
  assert.equal(
    mergeClusterContent([
      'This project uses Vitest.',
      'This project uses Vitest for unit tests.',
    ]),
    'This project uses Vitest for unit tests.',
  );
});

test('consolidation stays a dry-run unless commit is explicit', () => {
  assert.equal(consolidationCommits({}), false);
  assert.equal(consolidationCommits({ commit: false }), false);
  assert.equal(consolidationCommits({ commit: true }), true);
});

test('keeps similar memories from different projects in separate clusters', () => {
  const memories = [
    {
      $id: 'a',
      $createdAt: '2026-08-28T12:00:00.000Z',
      userId: 'user-1',
      source: 'cursor',
      category: 'code',
      content: 'This project uses Vitest for unit tests.',
      status: 'active' as const,
      projectId: 'alpha',
    },
    {
      $id: 'b',
      $createdAt: '2026-08-28T13:00:00.000Z',
      userId: 'user-1',
      source: 'cursor',
      category: 'code',
      content: 'This project uses Vitest for unit tests in CI.',
      status: 'active' as const,
      projectId: 'beta',
    },
  ];
  const groups = memoriesByProject(memories);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.flatMap((group) => relatedMemoryClusters(group)),
    [],
  );
  assert.equal(relatedMemoryClusters(memories).length, 1);
});
