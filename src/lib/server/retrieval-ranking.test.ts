import assert from 'node:assert/strict';
import test from 'node:test';
import { rankMemories, type RankableMemory } from './retrieval-ranking.ts';

const NOW = Date.parse('2026-08-27T00:00:00Z');

function memory(
  $id: string,
  content: string,
  daysAgo: number,
  title?: string,
): RankableMemory {
  return {
    $id,
    content,
    title,
    $createdAt: new Date(NOW - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  };
}

test('ranks rare literal terms with BM25 and normalizes document length', () => {
  const rows = [
    memory('long', `Postgres ${'database '.repeat(80)}`, 1),
    memory('focused', 'Postgres is the production database.', 20),
    memory('other', 'Redis caches sessions.', 0),
  ];

  assert.deepEqual(
    rankMemories(rows, 'Postgres database', { limit: 3, asOfMs: NOW })
      .slice(0, 2)
      .map((row) => row.$id),
    ['focused', 'long'],
  );
});

test('keeps literal matches ahead of concept-only matches', () => {
  const rows = [
    memory('related', 'Supabase RLS policies enforce permissions.', 0),
    memory('literal', 'Authentication uses short-lived sessions.', 30),
  ];
  assert.deepEqual(
    rankMemories(rows, 'authentication', { limit: 2, asOfMs: NOW }).map((row) => row.$id),
    ['literal', 'related'],
  );
});

test('recalls concept-only authentication matches without embeddings', () => {
  const rows = [
    memory('unrelated', 'The UI uses Tailwind CSS.', 0),
    memory('rls', 'Supabase RLS policies enforce permissions.', 30),
  ];
  assert.equal(rankMemories(rows, 'how do we handle auth', { limit: 1, asOfMs: NOW })[0]?.$id, 'rls');
});

test('uses canonical entity aliases as a separate retrieval signal', () => {
  const rows = [
    memory('typescript', 'The service is written in TypeScript.', 30),
    memory('javascript', 'The browser bundle uses JavaScript.', 0),
  ];
  assert.equal(rankMemories(rows, 'TS language', { limit: 1, asOfMs: NOW })[0]?.$id, 'typescript');
});

test('gives bounded recency more weight for explicitly current queries', () => {
  const rows = [
    memory('old', 'The package manager convention is npm.', 400),
    memory('new', 'The package manager convention is pnpm.', 2),
  ];
  assert.equal(rankMemories(rows, 'current package manager convention', { limit: 1, asOfMs: NOW })[0]?.$id, 'new');
});

test('does not let broad old concept matches bury a recent current-state fact', () => {
  const rows = [
    memory(
      'old-data',
      'Data model details. Data tables use a data repository with normalized data.',
      30,
    ),
    memory(
      'recent-encryption',
      'Production memory encryption uses a versioned keyring and encrypted mode.',
      1,
    ),
    memory('old-mode', 'The editor runs in focused mode.', 25),
  ];
  assert.equal(
    rankMemories(rows, 'current data encryption mode', { limit: 1, asOfMs: NOW })[0]?.$id,
    'recent-encryption',
  );
});

test('normalizes encryption inflections for lexical coverage', () => {
  const rows = [
    memory('unrelated', 'The project data model uses normalized tables.', 0),
    memory('encrypted', 'Production memory fields are encrypted with a versioned keyring.', 30),
  ];
  assert.equal(
    rankMemories(rows, 'encryption', { limit: 1, asOfMs: NOW })[0]?.$id,
    'encrypted',
  );
});

test('boosts concise titles without double-counting legacy title-body copies', () => {
  const rows = [
    memory(
      'legacy-encryption',
      'Memory encryption',
      3,
      'Memory encryption',
    ),
    memory(
      'encryption-decision',
      'Production memory fields use authenticated encryption and a versioned keyring.',
      1,
      'Production memory encryption',
    ),
  ];
  assert.equal(
    rankMemories(rows, 'current memory encryption', { limit: 1, asOfMs: NOW })[0]?.$id,
    'encryption-decision',
  );
});

test('never admits a newer irrelevant memory on recency alone', () => {
  const rows = [
    memory('relevant', 'Postgres stores production records.', 400),
    memory('new', 'The interface uses a dark green theme.', 0),
  ];
  assert.deepEqual(rankMemories(rows, 'Postgres', { limit: 5, asOfMs: NOW }).map((row) => row.$id), ['relevant']);
});

test('falls back to explicit newest-first ordering for empty-signal queries', () => {
  const rows = [memory('older', 'Older fact.', 20), memory('newer', 'Newer fact.', 1)];
  assert.deepEqual(rankMemories(rows, 'how do we handle this', { limit: 2, asOfMs: NOW }).map((row) => row.$id), ['newer', 'older']);
});

test('uses stable ids for final ties and does not mutate candidates', () => {
  const rows = [memory('b', 'Vitest runs tests.', 2), memory('a', 'Vitest runs tests.', 2)];
  const original = [...rows];
  assert.deepEqual(rankMemories(rows, 'Vitest', { limit: 1, asOfMs: NOW }).map((row) => row.$id), ['a']);
  assert.deepEqual(rows, original);
});
