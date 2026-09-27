import assert from 'node:assert/strict';
import test from 'node:test';
import { searchTokens, termMatchesToken } from './concepts.ts';
import { rankMemories, type RankableMemory } from './retrieval-ranking.ts';

const NOW = Date.parse('2026-08-30T00:00:00Z');

function memory($id: string, content: string): RankableMemory {
  return { $id, content, $createdAt: new Date(NOW - 86_400_000).toISOString() };
}

test('short terms match whole words or plurals, not arbitrary prefixes', () => {
  assert.equal(termMatchesToken('appwrite', 'app'), false);
  assert.equal(termMatchesToken('appsmith', 'app'), false);
  assert.equal(termMatchesToken('apps', 'app'), true);
  assert.equal(termMatchesToken('app', 'app'), true);
  /* Four letters and up keep prefix matching, so morphology still works. */
  assert.equal(termMatchesToken('deployment', 'deploy'), true);
});

test('a short query term no longer retrieves an unrelated product name', () => {
  const rows = [
    memory('auth', 'Authentication uses Appwrite sessions and JWT access checks.'),
    memory('deploy', 'Production deploys to Vercel in the Singapore region.'),
  ];
  assert.equal(rankMemories(rows, 'where is the app hosted', { limit: 3, asOfMs: NOW })[0]?.$id, 'deploy');
});

test('joins two-word spellings of concept terms', () => {
  assert.ok(searchTokens('how do users log in').includes('login'));
  assert.ok(searchTokens('sign up flow').includes('signup'));
  /* A bare "log" stays a word. Known limitation: the join is not
     grammatical, so "audit log in batches" also yields `login`. */
  assert.ok(searchTokens('write to the audit log').includes('log'));
  assert.ok(!searchTokens('write to the audit log').includes('login'));
});

test('maps past tenses onto -ing cluster terms', () => {
  assert.deepEqual(searchTokens('hosted'), ['hosting']);
  assert.deepEqual(searchTokens('logged'), ['logging']);
});

test('corrects a single-edit typo to the one corpus word it misspells', () => {
  const rows = [
    memory('tests', 'Testing uses Vitest with colocated .test.ts files.'),
    memory('cache', 'Redis caches API responses for five minutes.'),
  ];
  assert.equal(rankMemories(rows, 'vitset config', { limit: 3, asOfMs: NOW })[0]?.$id, 'tests');
  assert.equal(rankMemories(rows, 'vitest', { limit: 3, asOfMs: NOW })[0]?.$id, 'tests');
});

test('a lone concept sibling cannot carry two unknown terms', () => {
  const rows = [
    memory('api', 'The public API server is versioned under /v1.'),
    memory('rls', 'Row-level security policies guard every table.'),
  ];
  /* "grpc" reaches the corpus only through its sibling "api". */
  assert.deepEqual(rankMemories(rows, 'grpc streaming interceptors', { limit: 3, asOfMs: NOW }), []);
  /* One sibling next to one unknown word still recalls by concept. */
  assert.ok(rankMemories(rows, 'grpc endpoints', { limit: 3, asOfMs: NOW }).length > 0);
});

test('leaves an ambiguous typo uncorrected rather than guessing', () => {
  /* `tokem` is one edit from both `token` and `totem`. */
  const rows = [
    memory('token', 'Token rotation happens daily.'),
    memory('totem', 'The totem service is archived.'),
  ];
  assert.deepEqual(rankMemories(rows, 'tokem', { limit: 3, asOfMs: NOW }), []);
});
