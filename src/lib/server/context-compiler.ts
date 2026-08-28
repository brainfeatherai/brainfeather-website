import { rankMemories } from './retrieval-ranking.ts';

export type ContextMemory = {
  $id: string;
  $createdAt: string;
  title?: string;
  content: string;
  category: string;
};

type Group = 'facts' | 'decisions' | 'patterns';

export type CompiledContext = {
  facts: string[];
  decisions: string[];
  patterns: string[];
  counts: { facts: number; decisions: number; patterns: number; total: number };
};

function groupOf(category: string): Group | null {
  if (category === 'decision') return 'decisions';
  if (category === 'code' || category === 'preference') return 'patterns';
  if (category === 'context' || category === 'project') return 'facts';
  return null;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4) + 4);
}

export function compileContext<T extends ContextMemory>(
  memories: readonly T[],
  options: { query?: string; maxTokens: number; asOfMs?: number },
): CompiledContext {
  const grouped = memories.filter((memory) => groupOf(memory.category) !== null);
  const relevant = rankMemories(grouped, options.query ?? '', {
    limit: grouped.length,
    asOfMs: options.asOfMs,
  });
  const newest = rankMemories(grouped, '', {
    limit: grouped.length,
    asOfMs: options.asOfMs,
  });
  const relevantIds = new Set(relevant.map((memory) => memory.$id));
  const ranked = [...relevant, ...newest.filter((memory) => !relevantIds.has(memory.$id))];
  const selected: T[] = [];
  const used = new Set<string>();
  let remaining = Math.max(0, Math.floor(options.maxTokens));

  const include = (memory: T) => {
    if (used.has(memory.$id)) return false;
    const cost = estimateTokens(memory.content);
    if (cost > remaining) return false;
    used.add(memory.$id);
    selected.push(memory);
    remaining -= cost;
    return true;
  };

  if (options.query && relevant[0]) include(relevant[0]);

  /* Reserve one slot per available group before filling by relevance. */
  for (const group of ['decisions', 'patterns', 'facts'] as const) {
    if (selected.some((memory) => groupOf(memory.category) === group)) continue;
    for (const candidate of ranked) {
      if (groupOf(candidate.category) === group && include(candidate)) break;
    }
  }
  for (const memory of ranked) include(memory);

  const contents = (group: Group) =>
    selected.filter((memory) => groupOf(memory.category) === group).map((memory) => memory.content);
  const facts = contents('facts');
  const decisions = contents('decisions');
  const patterns = contents('patterns');

  return {
    facts,
    decisions,
    patterns,
    counts: {
      facts: facts.length,
      decisions: decisions.length,
      patterns: patterns.length,
      total: selected.length,
    },
  };
}
