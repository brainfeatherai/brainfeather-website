export type PublicAccess = "loading" | "none" | "pending" | "approved" | "console";

type Listener = () => void;

type Lifecycle = {
  startInterval: (refresh: () => void) => () => void;
  listenForVisibility: (refresh: () => void) => () => void;
};

export function createPublicAccessStore(
  probe: () => Promise<Exclude<PublicAccess, "loading">>,
  lifecycle: Lifecycle,
) {
  let access: PublicAccess = "loading";
  let generation = 0;
  let probeSequence = 0;
  let stopInterval: (() => void) | undefined;
  let stopVisibility: (() => void) | undefined;
  const listeners = new Set<Listener>();

  function publish(next: PublicAccess) {
    if (next === access) return;
    access = next;
    for (const listener of listeners) listener();
  }

  async function refresh() {
    const currentGeneration = generation;
    const currentProbe = ++probeSequence;
    const next = await probe();
    if (
      listeners.size === 0 ||
      generation !== currentGeneration ||
      probeSequence !== currentProbe
    ) {
      return;
    }
    publish(next);
  }

  function subscribe(listener: Listener): () => void {
    const first = listeners.size === 0;
    listeners.add(listener);
    if (first) {
      generation++;
      probeSequence = 0;
      access = "loading";
      void refresh();
      stopInterval = lifecycle.startInterval(() => void refresh());
      stopVisibility = lifecycle.listenForVisibility(() => void refresh());
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size > 0) return;
      generation++;
      probeSequence++;
      stopInterval?.();
      stopVisibility?.();
      stopInterval = undefined;
      stopVisibility = undefined;
      access = "loading";
    };
  }

  return {
    subscribe,
    getSnapshot: () => access,
    refresh: () => void refresh(),
  };
}
