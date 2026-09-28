import assert from 'node:assert/strict';
import test from 'node:test';
import type { Event } from '@sentry/nextjs';
import { filterBrowserEvent, isForeignException, sanitizeSentryEvent } from './sentry-privacy.ts';

function eventWithFrames(...filenames: string[]): Event {
  return {
    exception: {
      values: [
        {
          type: 'TypeError',
          value: 'secret memory content',
          stacktrace: { frames: filenames.map((filename) => ({ filename })) },
        },
      ],
    },
  };
}

test('errors thrown entirely outside our bundle are dropped', () => {
  /* The live BRAINFEATHER-WEBSITE-D issue: an injected executor script,
     with no frame from the site's own code. */
  const foreign = eventWithFrames('app:///executors/200.js', 'app:///executors/200.js');
  assert.equal(isForeignException(foreign), true);
  assert.equal(filterBrowserEvent(foreign), null);
});

test('errors with any frame from our bundle are kept and sanitized', () => {
  const ours = eventWithFrames(
    'app:///executors/200.js',
    'app:///_next/static/chunks/app/page-abc123.js',
  );
  assert.equal(isForeignException(ours), false);
  const kept = filterBrowserEvent(ours);
  assert.ok(kept);
  assert.equal(kept.exception?.values?.[0].value, 'Application error');
});

test('errors without a stack are kept, since they may still be ours', () => {
  const bare: Event = { exception: { values: [{ type: 'TypeError', value: 'x' }] } };
  assert.equal(isForeignException(bare), false);
  assert.ok(filterBrowserEvent(bare));
});

test('only browser and OS family survive sanitizing', () => {
  const event = sanitizeSentryEvent({
    contexts: {
      browser: { name: 'Chrome', version: '140', extra: 'drop me' },
      os: { name: 'macOS', version: '27', build: 'drop me' },
      device: { model: 'drop me' },
      geo: { city: 'drop me' },
    },
  } as Event);
  assert.deepEqual(event.contexts, {
    browser: { name: 'Chrome', version: '140' },
    os: { name: 'macOS' },
  });
});
