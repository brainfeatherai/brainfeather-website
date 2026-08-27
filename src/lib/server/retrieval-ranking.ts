import { conceptRelatedScore, expand, searchTokens } from './concepts.ts';
import { extractEntities } from './entities.ts';

export type RankableMemory = {
  $id: string;
  $createdAt: string;
  title?: string;
  content: string;
};

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 2;
const HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;
const CURRENT_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const TEMPORAL_QUERY = /\b(current|currently|latest|newest|recent|recently|now|today)\b/i;
const TEMPORAL_TERMS = /\b(current|currently|latest|newest|recent|recently|now|today)\b/gi;

function textOf(memory: RankableMemory): string {
  return `${memory.title ?? ''} ${memory.content}`;
}

function tokenMatches(token: string, term: string): boolean {
  return token === term || token.startsWith(term);
}

function bm25Scores(tokenized: readonly string[][], queryTerms: readonly string[]): number[] {
  if (!tokenized.length || !queryTerms.length) return tokenized.map(() => 0);
  const averageLength =
    tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / tokenized.length || 1;
  const documentFrequency = new Map<string, number>();

  for (const term of queryTerms) {
    documentFrequency.set(
      term,
      tokenized.reduce(
        (count, tokens) => count + Number(tokens.some((token) => tokenMatches(token, term))),
        0,
      ),
    );
  }

  return tokenized.map((tokens) => {
    let total = 0;
    for (const term of queryTerms) {
      let frequency = 0;
      for (const token of tokens) if (tokenMatches(token, term)) frequency++;
      if (!frequency) continue;

      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (tokenized.length - df + 0.5) / (df + 0.5));
      const lengthNormalization = K1 * (1 - B + B * (tokens.length / averageLength));
      total += idf * ((frequency * (K1 + 1)) / (frequency + lengthNormalization));
    }
    return total;
  });
}

function exactCoverage(tokens: readonly string[], queryTerms: readonly string[]): number {
  if (!queryTerms.length) return 0;
  let matches = 0;
  for (const term of queryTerms) {
    if (tokens.some((token) => tokenMatches(token, term))) matches++;
  }
  return matches / queryTerms.length;
}

function entityKeys(text: string): Set<string> {
  return new Set(extractEntities(text).map(({ name, type }) => `${type}:${name}`));
}

function entityOverlap(query: Set<string>, text: string): number {
  if (!query.size) return 0;
  const document = entityKeys(text);
  let matches = 0;
  for (const entity of query) if (document.has(entity)) matches++;
  return matches / query.size;
}

function recency(createdAt: string, asOfMs: number, halfLifeMs: number): number {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return 0;
  return 0.5 ** (Math.max(0, asOfMs - createdMs) / halfLifeMs);
}

function newestFirst<T extends RankableMemory>(left: T, right: T): number {
  const leftTime = Date.parse(left.$createdAt);
  const rightTime = Date.parse(right.$createdAt);
  const timeDifference =
    (Number.isFinite(rightTime) ? rightTime : 0) -
    (Number.isFinite(leftTime) ? leftTime : 0);
  return timeDifference || left.$id.localeCompare(right.$id);
}

export function rankMemories<T extends RankableMemory>(
  memories: readonly T[],
  query: string,
  options: { limit: number; asOfMs?: number },
): T[] {
  const limit = Math.max(0, Math.floor(options.limit));
  if (!limit || !memories.length) return [];

  const temporal = TEMPORAL_QUERY.test(query);
  const relevanceQuery = temporal ? query.replace(TEMPORAL_TERMS, ' ') : query;
  const expanded = expand(relevanceQuery);
  const queryEntities = entityKeys(relevanceQuery);
  if (!expanded.exact.length && !queryEntities.size) {
    return [...memories].sort(newestFirst).slice(0, limit);
  }

  const texts = memories.map(textOf);
  const titleTokens = memories.map((memory) => searchTokens(memory.title ?? ''));
  const contentTokens = memories.map((memory) =>
    memory.title?.trim() === memory.content.trim() ? [] : searchTokens(memory.content),
  );
  const tokenized = titleTokens.map((title, index) => [...title, ...contentTokens[index]]);
  const titleBm25 = bm25Scores(titleTokens, expanded.exact);
  const contentBm25 = bm25Scores(contentTokens, expanded.exact);
  const bm25 = titleBm25.map(
    (titleScore, index) => titleScore * TITLE_WEIGHT + contentBm25[index],
  );
  const maxBm25 = Math.max(...bm25, 0);
  const asOfMs = options.asOfMs ?? Date.now();
  const weights = temporal
    ? { lexical: 0.25, coverage: 0.25, concept: 0.05, entity: 0.1, recency: 0.35 }
    : { lexical: 0.55, coverage: 0.05, concept: 0.2, entity: 0.15, recency: 0.05 };
  const halfLifeMs = temporal ? CURRENT_HALF_LIFE_MS : HALF_LIFE_MS;

  return memories
    .map((memory, index) => {
      const lexical = maxBm25 ? bm25[index] / maxBm25 : 0;
      const coverage = exactCoverage(tokenized[index], expanded.exact);
      const concept = conceptRelatedScore(texts[index], expanded);
      const entity = entityOverlap(queryEntities, texts[index]);
      const eligible = bm25[index] > 0 || concept > 0 || entity > 0;
      return {
        memory,
        lexical,
        coverage,
        concept,
        entity,
        eligible,
        combined:
          lexical * weights.lexical +
          coverage * weights.coverage +
          concept * weights.concept +
          entity * weights.entity +
          recency(memory.$createdAt, asOfMs, halfLifeMs) * weights.recency,
      };
    })
    .filter(({ eligible }) => eligible)
    .sort(
      (left, right) =>
        right.combined - left.combined ||
        right.coverage - left.coverage ||
        right.lexical - left.lexical ||
        right.entity - left.entity ||
        newestFirst(left.memory, right.memory),
    )
    .slice(0, limit)
    .map(({ memory }) => memory);
}
