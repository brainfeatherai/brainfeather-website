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
const HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;
const TEMPORAL_QUERY = /\b(current|currently|latest|newest|recent|recently|now|today)\b/i;

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

function recency(createdAt: string, asOfMs: number): number {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return 0;
  return 0.5 ** (Math.max(0, asOfMs - createdMs) / HALF_LIFE_MS);
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

  const expanded = expand(query);
  const queryEntities = entityKeys(query);
  if (!expanded.exact.length && !queryEntities.size) {
    return [...memories].sort(newestFirst).slice(0, limit);
  }

  const texts = memories.map(textOf);
  const tokenized = texts.map((text) => searchTokens(text));
  const bm25 = bm25Scores(tokenized, expanded.exact);
  const maxBm25 = Math.max(...bm25, 0);
  const asOfMs = options.asOfMs ?? Date.now();
  const temporal = TEMPORAL_QUERY.test(query);
  const weights = temporal
    ? { lexical: 0.55, concept: 0.15, entity: 0.15, recency: 0.15 }
    : { lexical: 0.6, concept: 0.2, entity: 0.15, recency: 0.05 };

  return memories
    .map((memory, index) => {
      const lexical = maxBm25 ? bm25[index] / maxBm25 : 0;
      const concept = conceptRelatedScore(texts[index], expanded);
      const entity = entityOverlap(queryEntities, texts[index]);
      const eligible = bm25[index] > 0 || concept > 0 || entity > 0;
      return {
        memory,
        lexical,
        concept,
        entity,
        eligible,
        combined:
          lexical * weights.lexical +
          concept * weights.concept +
          entity * weights.entity +
          recency(memory.$createdAt, asOfMs) * weights.recency,
      };
    })
    .filter(({ eligible }) => eligible)
    .sort(
      (left, right) =>
        right.combined - left.combined ||
        right.lexical - left.lexical ||
        right.entity - left.entity ||
        newestFirst(left.memory, right.memory),
    )
    .slice(0, limit)
    .map(({ memory }) => memory);
}
