import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedInt, dateTime, memoryScope } from './validate.ts';

test('requires timezone-qualified ISO date-times', () => {
  assert.equal(dateTime('2026-08-27T12:30:00Z', 'referenceAt').ok, true);
  assert.equal(dateTime('2026-08-27T12:30:00+05:30', 'referenceAt').ok, true);
  assert.equal(dateTime('2026-08-27', 'referenceAt').ok, false);
  assert.equal(dateTime('2026-08-27T12:30:00', 'referenceAt').ok, false);
});

test('validates bounded integer query controls', () => {
  assert.deepEqual(
    boundedInt(null, 'maxTokens', { min: 256, max: 12_000, fallback: 4_000 }),
    { ok: true, value: 4_000 },
  );
  assert.equal(
    boundedInt('255', 'maxTokens', { min: 256, max: 12_000, fallback: 4_000 }).ok,
    false,
  );
  assert.equal(
    boundedInt('1024.5', 'maxTokens', { min: 256, max: 12_000, fallback: 4_000 }).ok,
    false,
  );
});

test('normalizes accepted date-times to UTC', () => {
  const parsed = dateTime('2026-08-27T18:00:00+05:30', 'observedAt');
  assert.deepEqual(parsed, {
    ok: true,
    value: '2026-08-27T12:30:00.000Z',
    ms: Date.parse('2026-08-27T12:30:00.000Z'),
  });
});

test('validates hierarchical memory scope identifiers', () => {
  assert.deepEqual(
    memoryScope({ projectId: 'github.com/acme/api', branch: 'feature/auth', taskId: 'task-42' }),
    {
      ok: true,
      value: {
        projectId: 'github.com/acme/api',
        branch: 'feature/auth',
        taskId: 'task-42',
      },
    },
  );
  assert.deepEqual(memoryScope({ branch: 'main' }), {
    ok: false,
    error: 'branch and taskId require projectId.',
  });
  assert.equal(memoryScope({ projectId: 'repo\nother' }).ok, false);
  assert.equal(memoryScope({ projectId: 'repo', branch: 'x'.repeat(129) }).ok, false);
});
