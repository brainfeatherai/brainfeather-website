import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicAccessStore, type PublicAccess } from './public-access-store-core.ts';

type Result = Exclude<PublicAccess, 'loading'>;

function deferredProbe() {
  const pending: ((value: Result) => void)[] = [];
  return {
    probe: () => new Promise<Result>((resolve) => pending.push(resolve)),
    resolve(index: number, value: Result) {
      pending[index](value);
    },
  };
}

function lifecycle() {
  let intervalRefresh: (() => void) | undefined;
  let visibilityRefresh: (() => void) | undefined;
  return {
    value: {
      startInterval(refresh: () => void) {
        intervalRefresh = refresh;
        return () => { intervalRefresh = undefined; };
      },
      listenForVisibility(refresh: () => void) {
        visibilityRefresh = refresh;
        return () => { visibilityRefresh = undefined; };
      },
    },
    interval: () => intervalRefresh?.(),
    visible: () => visibilityRefresh?.(),
  };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('only the newest probe in a subscriber generation can publish', async () => {
  const source = deferredProbe();
  const events = lifecycle();
  const store = createPublicAccessStore(source.probe, events.value);
  const unsubscribe = store.subscribe(() => {});

  events.visible();
  source.resolve(1, 'none');
  await tick();
  assert.equal(store.getSnapshot(), 'none');

  source.resolve(0, 'console');
  await tick();
  assert.equal(store.getSnapshot(), 'none');
  unsubscribe();
});

test('ignores an old generation and resets each subscriber cycle to loading', async () => {
  const source = deferredProbe();
  const events = lifecycle();
  const store = createPublicAccessStore(source.probe, events.value);
  const unsubscribeFirst = store.subscribe(() => {});
  unsubscribeFirst();

  const unsubscribeSecond = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), 'loading');
  source.resolve(0, 'console');
  await tick();
  assert.equal(store.getSnapshot(), 'loading');

  source.resolve(1, 'approved');
  await tick();
  assert.equal(store.getSnapshot(), 'approved');
  unsubscribeSecond();
  events.interval();
  assert.equal(store.getSnapshot(), 'loading');
});
