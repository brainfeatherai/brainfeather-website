import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rankMemories,
  rankMemoriesWithExplanations,
  RECALL_REASONS,
  type ExplainableMemory,
  type RankableMemory,
} from './retrieval-ranking.ts';

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

function explainable(
  $id: string,
  content: string,
  daysAgo: number,
  metadata?: string,
  title?: string,
): ExplainableMemory {
  return { ...memory($id, content, daysAgo, title), ...(metadata ? { metadata } : {}) };
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

/* RepoMemBench negative-query abstention. One generic term hit used to be
   enough to qualify a memory, so this query returned four irrelevant facts
   while its distinctive terms — native, ios, target — matched nothing. */
test('abstains when the corpus does not know the query topic', () => {
  const rows = [
    memory('deploy-vercel', 'Production deploys to Vercel in the Singapore region.', 10),
    memory('rollback', 'Deployment 814 was rolled back after authentication failures.', 4),
    memory('procedure', 'Appwrite schema changes require migration, then deployment.', 3),
  ];
  assert.deepEqual(rankMemories(rows, 'native ios deployment target', { limit: 8, asOfMs: NOW }), []);
});

/* The explained path is what context-compiler calls, so it must abstain too
   rather than hand the agent weak context with a confident reason list. */
test('abstains on an unknown topic in the explained path as well', () => {
  const rows = [
    explainable('deploy-vercel', 'Production deploys to Vercel in the Singapore region.', 10),
    explainable('rollback', 'Deployment 814 was rolled back after authentication.', 4),
  ];
  assert.deepEqual(
    rankMemoriesWithExplanations(rows, 'native ios deployment target', { limit: 8, asOfMs: NOW }),
    [],
  );
});

/* A recognized entity alias carries the topic on its own. "tailwindcss"
   shares no literal token and no concept sibling with "Tailwind CSS", so
   without the entity signal the abstention floor would silently drop it. */
test('does not abstain on a distinctive exact term in a verbose query', () => {
  const rows = [
    memory('codename', 'The release codename is hummingbird.', 30),
    memory('database', 'Postgres stores production records.', 10),
  ];
  assert.equal(
    rankMemories(
      rows,
      'Which rollout checklist applies to hummingbird when enabling regional canaries for enterprise tenants?',
      { limit: 1, asOfMs: NOW },
    )[0]?.$id,
    'codename',
  );
});

test('does not abstain when a query names an entity the corpus knows', () => {
  const rows = [
    memory('tailwind', 'Styling uses Tailwind CSS.', 30),
    memory('postgres', 'Postgres is the production database.', 10),
  ];
  assert.equal(rankMemories(rows, 'tailwindcss', { limit: 1, asOfMs: NOW })[0]?.$id, 'tailwind');
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

test('explanations name lexical matches with their matched terms', () => {
  const rows = [
    explainable('pg', 'Postgres is the production database.', 20),
    explainable('ui', 'The interface uses a dark theme.', 0),
  ];
  const hits = rankMemoriesWithExplanations(rows, 'Postgres production', { limit: 2, asOfMs: NOW });
  assert.deepEqual(hits.map(({ memory }) => memory.$id), ['pg']);
  const { explanation } = hits[0];
  assert.ok(explanation.reasons.includes('lexical'));
  assert.ok(explanation.matchedTerms.includes('postgres'));
  assert.equal(explanation.confidence, 0.5);
  assert.equal(explanation.provenance, undefined);
});

test('explanations name entity matches through canonical aliases', () => {
  const rows = [explainable('ts', 'The service is written in TypeScript.', 30)];
  const [{ explanation }] = rankMemoriesWithExplanations(rows, 'TS language', {
    limit: 1,
    asOfMs: NOW,
  });
  assert.ok(explanation.reasons.includes('entity'));
});

test('user provenance breaks a relevance tie with a bounded bonus', () => {
  const content = 'The deployment target is Vercel.';
  const rows = [
    explainable('agent-1', content, 5),
    explainable('user-1', content, 5, '{"confidence":0.5,"provenance":{"type":"user"}}'),
  ];
  assert.deepEqual(
    rankMemoriesWithExplanations(rows, 'deployment target', { limit: 2, asOfMs: NOW })
      .map(({ memory }) => memory.$id),
    ['user-1', 'agent-1'],
  );
  assert.deepEqual(
    rankMemories(rows, 'deployment target', { limit: 2, asOfMs: NOW }).map((row) => row.$id),
    ['agent-1', 'user-1'],
  );
});

test('strong evidence never promotes an irrelevant memory over a relevant one', () => {
  const rows = [
    explainable('relevant', 'Postgres stores production records.', 400),
    explainable(
      'irrelevant',
      'The interface uses a dark green theme.',
      0,
      '{"confidence":1,"provenance":{"type":"user"}}',
    ),
  ];
  assert.deepEqual(
    rankMemoriesWithExplanations(rows, 'Postgres', { limit: 5, asOfMs: NOW })
      .map(({ memory }) => memory.$id),
    ['relevant'],
  );
});

test('commit evidence earns a smaller bonus than user provenance', () => {
  const content = 'The cache invalidation uses versioned keys.';
  const rows = [
    explainable('commit-1', content, 5, '{"provenance":{"type":"commit"}}'),
    explainable('plain-1', content, 5),
  ];
  assert.equal(
    rankMemoriesWithExplanations(rows, 'cache invalidation', { limit: 1, asOfMs: NOW })[0]
      .memory.$id,
    'commit-1',
  );
  const [{ explanation }] = rankMemoriesWithExplanations(
    [explainable('commit-1', content, 5, '{"provenance":{"type":"commit"}}')],
    'cache invalidation',
    { limit: 1, asOfMs: NOW },
  );
  assert.ok(explanation.reasons.includes('evidence'));
  assert.ok(!explanation.reasons.includes('user-confirmed'));
});

test('explanations mark user-confirmed and high-confidence facts', () => {
  const rows = [
    explainable(
      'confirmed',
      'Authentication uses short-lived sessions.',
      10,
      '{"c":0.9,"p":{"t":"user_stated","r":"commit abc123"}}',
    ),
  ];
  const [{ explanation }] = rankMemoriesWithExplanations(rows, 'authentication sessions', {
    limit: 1,
    asOfMs: NOW,
  });
  assert.ok(explanation.reasons.includes('user-confirmed'));
  assert.ok(explanation.reasons.includes('high-confidence'));
  assert.equal(explanation.confidence, 0.9);
  assert.deepEqual(explanation.provenance, { type: 'user', reference: 'commit abc123' });
});

test('explanations stay within the stable reason vocabulary and never expose weights', () => {
  const rows = [
    explainable('pg', 'Postgres is the production database.', 1),
    explainable('ui', 'The interface uses a dark theme.', 0),
  ];
  for (const { explanation } of rankMemoriesWithExplanations(rows, 'Postgres production', {
    limit: 2,
    asOfMs: NOW,
  })) {
    for (const reason of explanation.reasons) {
      assert.ok((RECALL_REASONS as readonly string[]).includes(reason));
    }
    for (const key of Object.keys(explanation)) {
      assert.ok(['reasons', 'matchedTerms', 'confidence', 'provenance'].includes(key));
    }
  }
});

test('empty-signal queries explain themselves as newest-first recall', () => {
  const rows = [
    explainable('older', 'Older fact.', 20),
    explainable('newer', 'Newer fact.', 1),
  ];
  const hits = rankMemoriesWithExplanations(rows, 'how do we handle this', {
    limit: 2,
    asOfMs: NOW,
  });
  assert.deepEqual(hits.map(({ memory }) => memory.$id), ['newer', 'older']);
  assert.ok(hits[0].explanation.reasons.includes('newest'));
  assert.ok(!hits[0].explanation.reasons.includes('lexical'));
  assert.deepEqual(hits[0].explanation.matchedTerms, []);
});

test('malformed metadata never breaks explanations', () => {
  const rows = [explainable('broken', 'Postgres stores production records.', 5, 'not-json{')];
  const [{ explanation }] = rankMemoriesWithExplanations(rows, 'Postgres', {
    limit: 1,
    asOfMs: NOW,
  });
  assert.equal(explanation.confidence, 0.5);
  assert.ok(explanation.reasons.includes('lexical'));
  assert.equal(explanation.provenance, undefined);
});
