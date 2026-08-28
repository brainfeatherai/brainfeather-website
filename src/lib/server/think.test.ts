import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectMemoryType,
  findDuplicate,
  junkReason,
  planSupersedes,
} from './think.ts';

test('rejects greetings, filler, and transient agent chatter', () => {
  assert.equal(junkReason('ok'), 'too short to be a durable fact');
  assert.equal(junkReason('hello there everyone'), 'small talk');
  assert.equal(
    junkReason("I'll now search the repository for the auth module"),
    'meta-talk about what the agent is doing',
  );
  assert.equal(junkReason('currently trying a workaround'), 'transient state, not a stable fact');
  assert.equal(junkReason('This project uses Vitest for unit tests.'), null);
});

test('classifies decisions, preferences, patterns, and corrections', () => {
  assert.equal(detectMemoryType('We decided to use Postgres for the primary store.'), 'decision');
  assert.equal(detectMemoryType('I prefer terse answers in this repo.'), 'preference');
  assert.equal(detectMemoryType('We always run tests before merging.'), 'pattern');
  assert.equal(detectMemoryType('Actually, auth should be Supabase, not Clerk.'), 'correction');
  assert.equal(detectMemoryType('The API lives in apps/api.'), 'fact');
});

test('finds exact and near-duplicate facts before junk filtering would matter', () => {
  const existing = [
    { $id: 'm1', content: 'This project uses Vitest for tests.', projectId: 'p1' },
  ];
  assert.equal(
    findDuplicate('this project uses vitest for tests.', existing)?.$id,
    'm1',
  );
  assert.equal(
    findDuplicate('This project uses Vitest for unit tests in CI.', existing)?.$id,
    'm1',
  );
  assert.equal(
    findDuplicate('Authentication uses row-level security in Supabase.', existing),
    undefined,
  );
});

test('plans supersession for refinements, labels, and explicit corrections', () => {
  const existing = [
    {
      $id: 'old',
      content: 'Backend: Express.',
      projectId: 'p1',
    },
    {
      $id: 'other',
      content: 'We use Jest for authentication tests.',
      projectId: 'p1',
    },
  ];

  const refined = planSupersedes(
    'Backend: Express with TypeScript and strict routing.',
    existing,
    { projectId: 'p1', currentlyValid: true },
  );
  assert.ok(!('reject' in refined));
  if ('reject' in refined) return;
  assert.ok(refined.doomed.includes('old'));

  const labelled = planSupersedes('Backend: Fastify.', existing, {
    projectId: 'p1',
    currentlyValid: true,
  });
  assert.ok(!('reject' in labelled));
  if ('reject' in labelled) return;
  assert.ok(labelled.doomed.includes('old'));

  const correction = planSupersedes(
    'Actually, tests should be Vitest, not Jest.',
    existing,
    {
      projectId: 'p1',
      currentlyValid: true,
    },
  );
  assert.ok(!('reject' in correction));
  if ('reject' in correction) return;
  assert.equal(correction.type, 'correction');
  assert.ok(correction.doomed.includes('other'));
});

test('does not treat another project as a contradiction target', () => {
  const planned = planSupersedes(
    'Backend: Fastify.',
    [{ $id: 'old', content: 'Backend: Express.', projectId: 'other' }],
    { projectId: 'p1', currentlyValid: true },
  );
  assert.ok(!('reject' in planned));
  if ('reject' in planned) return;
  assert.deepEqual(planned.doomed, []);
});
