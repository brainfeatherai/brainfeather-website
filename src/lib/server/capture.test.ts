import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryForType, extractActivityFacts } from './capture.ts';
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
