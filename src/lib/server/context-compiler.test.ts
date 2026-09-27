import assert from 'node:assert/strict';
import test from 'node:test';
import { compileContext, estimateTokens, recallFetchLimit, type ContextMemory } from './context-compiler.ts';

const NOW = Date.parse('2026-08-27T00:00:00Z');

function memory(
  id: string,
  category: string,
  content: string,
  daysAgo: number,
): ContextMemory {
  return {
    $id: id,
    category,
    content,
    $createdAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  };
}

test('reserves category diversity before filling by relevance', () => {
  const rows = [
    memory('decision', 'decision', 'Use Postgres for production data.', 2),
    memory('pattern', 'code', 'Colocate Vitest files with source.', 3),
    memory('fact', 'project', 'Deploy the API to Vercel.', 1),
    memory('extra', 'project', 'The UI uses Tailwind CSS.', 0),
  ];
  const budget =
    estimateTokens(rows[0].content) +
    estimateTokens(rows[1].content) +
    estimateTokens(rows[2].content);
  const context = compileContext(rows, { query: 'production project conventions', maxTokens: budget, asOfMs: NOW });
  assert.equal(context.decisions.length, 1);
  assert.equal(context.patterns.length, 1);
  assert.equal(context.facts.length, 1);
  assert.equal(context.counts.total, 3);
});

test('honors the token budget without truncating memory text', () => {
  const short = memory('short', 'decision', 'Use pnpm.', 1);
  const long = memory('long', 'project', 'x'.repeat(400), 0);
  const context = compileContext([long, short], {
    maxTokens: estimateTokens(short.content),
    asOfMs: NOW,
  });
  assert.deepEqual(context.decisions, ['Use pnpm.']);
  assert.equal(context.facts.length, 0);
});

test('uses query-aware ranking while preserving grouped output', () => {
  const rows = [
    memory('ui', 'project', 'The UI uses Tailwind CSS.', 0),
    memory('auth', 'decision', 'Supabase RLS policies enforce permissions.', 20),
  ];
  const context = compileContext(rows, { query: 'how do we handle auth', maxTokens: 500, asOfMs: NOW });
  assert.equal(context.decisions[0], rows[1].content);
});

test('preserves ranker abstention instead of filling with unrelated newest memories', () => {
  const rows = [
    memory('api', 'project', 'Deploy the backend API to Vercel.', 0),
    memory('database', 'decision', 'Use Postgres for application data.', 1),
  ];
  const context = compileContext(rows, {
    query: 'native ios deployment target',
    maxTokens: 500,
    asOfMs: NOW,
    includeExplanations: true,
  });

  assert.deepEqual(context, {
    facts: [],
    decisions: [],
    patterns: [],
    counts: { facts: 0, decisions: 0, patterns: 0, total: 0 },
    explanations: { facts: [], decisions: [], patterns: [] },
  });
});

test('does not spend a diversity slot twice on the pinned result group', () => {
  const rows = [
    memory('top', 'decision', 'Use Postgres for authentication data.', 1),
    memory('second-decision', 'decision', 'Use Redis for caching.', 2),
    memory('pattern', 'code', 'Colocate Vitest files with source.', 3),
    memory('fact', 'project', 'Deploy the API to Vercel.', 4),
  ];
  const budget =
    estimateTokens(rows[0].content) +
    estimateTokens(rows[2].content) +
    estimateTokens(rows[3].content);
  const context = compileContext(rows, {
    query: 'Postgres authentication',
    maxTokens: budget,
    asOfMs: NOW,
  });
  assert.deepEqual(context.decisions, [rows[0].content]);
  assert.equal(context.patterns.length, 1);
  assert.equal(context.facts.length, 1);
});

test('preserves existing context semantics by excluding team-only memories', () => {
  const rows = [
    memory('team', 'team', 'Alice owns production deployments.', 0),
    memory('fact', 'project', 'Deploy the API to Vercel.', 1),
  ];
  const context = compileContext(rows, { maxTokens: 500, asOfMs: NOW });
  assert.deepEqual(context.facts, [rows[1].content]);
  assert.equal(context.counts.total, 1);
});

test('returns evidence arrays aligned with selected context only when requested', () => {
  const rows = [
    {
      ...memory('fact', 'project', 'Architecture is documented.', 1),
      metadata: JSON.stringify({
        p: {
          t: 'file',
          r: 'docs/architecture.md',
          d: `sha256:${'b'.repeat(64)}`,
        },
      }),
    },
    memory('decision', 'decision', 'Use Postgres.', 0),
  ];
  const compatible = compileContext(rows, { maxTokens: 500, asOfMs: NOW });
  assert.equal('evidence' in compatible, false);

  const context = compileContext(rows, {
    maxTokens: 500,
    asOfMs: NOW,
    includeEvidence: true,
  });
  assert.equal(context.evidence?.facts.length, context.facts.length);
  assert.deepEqual(context.evidence?.facts[0], {
    type: 'file',
    reference: 'docs/architecture.md',
    digest: `sha256:${'b'.repeat(64)}`,
  });
  assert.equal(context.evidence?.decisions.length, context.decisions.length);
  assert.equal(context.evidence?.decisions[0], null);
});

test('hook-sized token budgets fetch a smaller decrypt window', () => {
  assert.equal(recallFetchLimit(800), 40);
  assert.equal(recallFetchLimit(1_600), 40);
  assert.equal(recallFetchLimit(1_601), 100);
  assert.equal(recallFetchLimit(4_000), 100);
});

test('opt-in explanations zip with the content arrays per group', () => {
  const rows = [
    memory('decision', 'decision', 'Use Postgres for production data.', 2),
    memory('pattern', 'code', 'Colocate Vitest files with source.', 3),
    memory('fact', 'project', 'Deploy the API to Vercel.', 1),
  ];
  const plain = compileContext(rows, { maxTokens: 500, asOfMs: NOW });
  assert.equal('explanations' in plain, false);

  const context = compileContext(rows, {
    query: 'production data',
    maxTokens: 500,
    asOfMs: NOW,
    includeExplanations: true,
  });
  assert.equal(context.explanations?.decisions.length, context.decisions.length);
  assert.equal(context.explanations?.patterns.length, context.patterns.length);
  assert.equal(context.explanations?.facts.length, context.facts.length);
  const explained = [
    ...(context.explanations?.decisions ?? []),
    ...(context.explanations?.patterns ?? []),
    ...(context.explanations?.facts ?? []),
  ].filter((explanation) => explanation !== null);
  assert.ok(explained.length > 0);
  for (const explanation of explained) {
    assert.ok(explanation.reasons.every((reason) => typeof reason === 'string'));
    assert.ok(explanation.matchedTerms.every((term) => typeof term === 'string'));
    assert.ok(explanation.confidence >= 0 && explanation.confidence <= 1);
  }
});
