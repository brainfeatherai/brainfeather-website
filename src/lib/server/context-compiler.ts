import { rankMemoriesWithExplanations, type MemoryExplanation } from './retrieval-ranking.ts';
import { memoryEvidence, type MemoryEvidence } from './memory-temporal.ts';

export type ContextMemory = {
  $id: string;
  $createdAt: string;
  title?: string;
  content: string;
  category: string;
  metadata?: string;
};

type Group = 'facts' | 'decisions' | 'patterns';

export type CompiledContext = {
  facts: string[];
  decisions: string[];
  patterns: string[];
  counts: { facts: number; decisions: number; patterns: number; total: number };
  explanations?: {
    facts: (MemoryExplanation | null)[];
    decisions: (MemoryExplanation | null)[];
    patterns: (MemoryExplanation | null)[];
  };
  evidence?: {
    facts: (MemoryEvidence | null)[];
    decisions: (MemoryEvidence | null)[];
    patterns: (MemoryEvidence | null)[];
  };
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

/** Hook-sized budgets decrypt fewer rows; explicit tool calls keep the full window. */
export function recallFetchLimit(maxTokens: number): number {
  return maxTokens <= 1_600 ? 40 : 100;
}

export function compileContext<T extends ContextMemory>(
  memories: readonly T[],
  options: {
    query?: string;
    maxTokens: number;
    asOfMs?: number;
    includeExplanations?: boolean;
    includeEvidence?: boolean;
  },
): CompiledContext {
  const grouped = memories.filter((memory) => groupOf(memory.category) !== null);
  const query = options.query?.trim() ?? '';
  const relevantHits = rankMemoriesWithExplanations(grouped, query, {
    limit: grouped.length,
    asOfMs: options.asOfMs,
  });
  /* A non-empty query with no relevant hits is an intentional abstention.
     Known queries retain the existing newest-first tail for category diversity,
     but an unknown topic must not be answered with unrelated recent memories. */
  const relevantIds = new Set(relevantHits.map(({ memory }) => memory.$id));
  const newestHits = rankMemoriesWithExplanations(
    grouped.filter((memory) => !relevantIds.has(memory.$id)),
    '',
    { limit: grouped.length, asOfMs: options.asOfMs },
  );
  const hits = query && relevantHits.length === 0
    ? []
    : [...relevantHits, ...newestHits];
  const ranked = hits.map(({ memory }) => memory);
  const explanationOf = new Map(hits.map(({ memory, explanation }) => [memory.$id, explanation]));
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

  if (options.query && ranked[0]) include(ranked[0]);

  /* Reserve one slot per available group before filling by relevance. */
  for (const group of ['decisions', 'patterns', 'facts'] as const) {
    if (selected.some((memory) => groupOf(memory.category) === group)) continue;
    for (const candidate of ranked) {
      if (groupOf(candidate.category) === group && include(candidate)) break;
    }
  }
  for (const memory of ranked) include(memory);

  const groupRows = (group: Group) =>
    selected.filter((memory) => groupOf(memory.category) === group);
  const contents = (group: Group) => groupRows(group).map((memory) => memory.content);
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
    /* Same order as the content arrays, so callers zip them by index. */
    ...(options.includeExplanations
      ? {
          explanations: {
            facts: groupRows('facts').map((memory) => explanationOf.get(memory.$id) ?? null),
            decisions: groupRows('decisions').map((memory) => explanationOf.get(memory.$id) ?? null),
            patterns: groupRows('patterns').map((memory) => explanationOf.get(memory.$id) ?? null),
          },
        }
      : {}),
    ...(options.includeEvidence
      ? {
          evidence: {
            facts: groupRows('facts').map((memory) => memoryEvidence(memory.metadata) ?? null),
            decisions: groupRows('decisions').map(
              (memory) => memoryEvidence(memory.metadata) ?? null,
            ),
            patterns: groupRows('patterns').map(
              (memory) => memoryEvidence(memory.metadata) ?? null,
            ),
          },
        }
      : {}),
  };
}
