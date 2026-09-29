import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alreadyKnown,
  captureConfidence,
  captureRejectReason,
  categoryForType,
  earlierSessionCapture,
  extractActivityFacts,
} from './capture.ts';
import { detectMemoryType } from './memory-policy.ts';

test('extracts durable facts from agent activity and drops chatter', () => {
  const facts = extractActivityFacts(
    [
      'hello',
      'let me check that',
      'This project uses Vitest for unit tests.',
      'We decided to store sessions as signed tokens.',
      'I prefer terse tool output.',
    ].join('\n'),
  );

  assert.deepEqual(
    facts.map((fact) => fact.content),
    [
      'This project uses Vitest for unit tests.',
      'We decided to store sessions as signed tokens.',
      'I prefer terse tool output.',
    ],
  );
  assert.equal(facts[0].category, 'project');
  assert.equal(facts[1].category, 'decision');
  assert.equal(facts[2].category, 'preference');
});

test('maps memory types onto storage categories', () => {
  assert.equal(categoryForType(detectMemoryType('We always use pnpm.'), 'We always use pnpm.'), 'code');
  assert.equal(
    categoryForType('fact', 'This project uses an Appwrite database.'),
    'project',
  );
});

test('requires a durable signal instead of capturing arbitrary agent claims', () => {
  assert.deepEqual(
    extractActivityFacts(
      [
        'The command completed successfully after three retries.',
        'This project uses pnpm for package management.',
      ].join('\n'),
    ).map((fact) => fact.content),
    ['This project uses pnpm for package management.'],
  );
});

test('explains why narration, hedges, and fragments are not captured', () => {
  assert.equal(captureRejectReason('It uses Redis for caching.'), 'depends on earlier context (unresolved reference)');
  assert.equal(captureRejectReason('Maybe we should use Postgres.'), 'speculative, not settled');
  assert.equal(captureRejectReason('I added a test for the auth route.'), 'narrates this session, not a durable fact');
  assert.equal(captureRejectReason('We will migrate the database next week.'), 'a plan, not a settled fact');
  assert.equal(captureRejectReason('Never deploy on Fridays because rollbacks might be slow.'), null);
  assert.equal(captureRejectReason('This project uses pnpm.'), null);
});

test('ranks rules and decisions above plain facts, within bounds', () => {
  const rule = captureConfidence('Never run database migrations against production from a laptop.');
  const plain = captureConfidence('Our staging environment runs on Fly.io.');
  assert.ok(rule > plain);
  for (const value of [rule, plain]) assert.ok(value >= 0.3 && value <= 0.95);
});

test('caps one capture at eight candidates, keeping the strongest', () => {
  const lines = Array.from({ length: 12 }, (_, index) => `This project uses tool${index} for builds.`);
  lines.push('We decided to never commit directly to main.');
  const facts = extractActivityFacts(lines.join('\n'));
  assert.equal(facts.length, 8);
  assert.ok(facts.some((fact) => fact.content.startsWith('We decided')));
});

test('skips restatements but lets corrections reach review', () => {
  const known = [{ $id: 'm1', content: 'The backend is deployed on Vercel.' }];
  assert.equal(alreadyKnown('The backend is deployed on Vercel', known), true);
  assert.equal(alreadyKnown('The backend is deployed on Fly.io.', known), false);
});

test('corroborates a fact only from an earlier, separate session in the same scope', () => {
  const nowMs = Date.parse('2026-09-29T12:00:00.000Z');
  const row = (id: string, minutesAgo: number, extra: Record<string, string> = {}) => ({
    $id: id,
    $createdAt: new Date(nowMs - minutesAgo * 60_000).toISOString(),
    content: 'This project uses Vitest for unit tests.',
    projectId: 'proj-1',
    status: 'pending' as const,
    ...extra,
  });
  const fact = { content: 'this project  uses Vitest for unit tests.', projectId: 'proj-1' };

  assert.equal(
    earlierSessionCapture(fact, [row('old', 120)], { excludeId: 'new', nowMs }),
    'old',
  );
  // Same conversation (minutes apart) does not count as a second session.
  assert.equal(earlierSessionCapture(fact, [row('old', 5)], { excludeId: 'new', nowMs }), undefined);
  // The candidate itself, another project, another branch, or different words never match.
  assert.equal(earlierSessionCapture(fact, [row('new', 120)], { excludeId: 'new', nowMs }), undefined);
  assert.equal(
    earlierSessionCapture(fact, [row('old', 120, { projectId: 'proj-2' })], { excludeId: 'new', nowMs }),
    undefined,
  );
  assert.equal(
    earlierSessionCapture(fact, [row('old', 120, { branch: 'feature/x' })], { excludeId: 'new', nowMs }),
    undefined,
  );
  assert.equal(
    earlierSessionCapture(fact, [row('old', 120, { content: 'This project uses Jest.' })], {
      excludeId: 'new',
      nowMs,
    }),
    undefined,
  );
  // A rejected or undone copy vetoes auto-approval even with a corroborating session.
  assert.equal(
    earlierSessionCapture(fact, [row('old', 120), row('gone', 300, { status: 'rejected' })], {
      excludeId: 'new',
      nowMs,
    }),
    undefined,
  );
});
