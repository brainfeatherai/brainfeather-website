import { conceptRelatedScore, expand, searchTokens, termMatchesToken } from './concepts.ts';
import { extractEntities } from './entities.ts';

export type RankableMemory = {
  $id: string;
  $createdAt: string;
  title?: string;
  content: string;
};

/* Explanations read only confidence + provenance from the stored
   metadata string — the same JSON memory-temporal writes, parsed
   tolerantly so the ranker stays dependency-free and testable. */
export type ExplainableMemory = RankableMemory & { metadata?: string };

/* Stable public values. Consumers match on these strings; a reason may
   be added in future releases but existing ones never change meaning. */
export const RECALL_REASONS = [
  'lexical',
  'concept',
  'entity',
  'recent',
  'evidence',
  'user-confirmed',
  'high-confidence',
  'newest',
] as const;

export type RecallReason = (typeof RECALL_REASONS)[number];

export type ExplanationProvenance = {
  type: string;
  reference?: string;
};

export type MemoryExplanation = {
  reasons: RecallReason[];
  matchedTerms: string[];
  confidence: number;
  provenance?: ExplanationProvenance;
};

export type RankedHit<T extends ExplainableMemory> = {
  memory: T;
  explanation: MemoryExplanation;
};

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 2;
const HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;
const CURRENT_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const TEMPORAL_QUERY = /\b(current|currently|latest|newest|recent|recently|now|today)\b/i;
const TEMPORAL_TERMS = /\b(current|currently|latest|newest|recent|recently|now|today)\b/gi;

/* Evidence is a bounded trust bonus, never a ranking driver. The cap of
   0.03 stays under the 0.05 combined-score gap that separates clearly
   different memories, so provenance can only break near-ties — strong
   evidence can never promote an irrelevant fact over a relevant one. */
const MAX_EVIDENCE_BONUS = 0.03;
const HIGH_CONFIDENCE = 0.8;
const DEFAULT_CONFIDENCE = 0.5;
const RECENT_THRESHOLD = 0.5;

/* Abstention floor: the share of a query's IDF mass that the candidate set
   must collectively match before any result is returned.

   Per-memory eligibility cannot decide this. A query like "native ios
   deployment target" matches only "deployment" (IDF 1.48 of 10.75 total)
   while its distinctive terms — native, ios, target — appear nowhere in a
   backend corpus. Every individual memory still looks eligible, because one
   generic term hit, or a concept score alone, is enough. Whether the corpus
   knows the TOPIC is a property of the query against the whole candidate
   set, so it is measured there.

   Calibrated against the RepoMemBench and unit fixtures, not derived from
   theory: across 13 true positives the weakest covers 0.234, and the false
   positive covers 0.138. This sits between them, deliberately nearer the
   false positive — a missed recall makes the agent ask the user again, which
   is worse than one weak extra line, so the bias is toward answering. Treat
   it as a fixture-fitted constant; widen the fixtures before trusting it as
   a general threshold. */
const MIN_KNOWN_QUERY_MASS = 0.18;

const PROVENANCE_TYPES = new Set([
  'user',
  'agent',
  'commit',
  'pull_request',
  'issue',
  'file',
  'deployment',
]);

function textOf(memory: RankableMemory): string {
  return `${memory.title ?? ''} ${memory.content}`;
}

/* Shared with concepts.ts so lexical scoring and concept expansion agree
   on what a match is. A private `startsWith` here let `app` match
   `appwrite` in BM25 even after the concept layer stopped doing so. */
const tokenMatches = termMatchesToken;

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

/* Share of the query's IDF mass this corpus can speak to at all.

   Measured across the whole candidate set, not per memory: the question is
   whether the corpus knows the query's TOPIC, which no single memory's score
   can answer. The IDF formula mirrors bm25Scores so both agree on rarity.

   A term counts as known when the corpus matches it literally OR matches one
   of THAT TERM's own concept siblings. The per-term attribution is the whole
   point: the flat expand().related list for "native ios deployment target"
   contains vercel and production — siblings of "deployment" — so a flat
   check would credit "native" for a match only "deployment" earned. That
   conflation is what makes concept recall (auth -> rls, with no literal
   overlap at all) indistinguishable from plain topic-ignorance. */
function knownQueryEvidence(
  tokenized: readonly string[][],
  queryTerms: readonly string[],
): { mass: number; termCount: number } {
  if (!queryTerms.length || !tokenized.length) {
    return { mass: 1, termCount: queryTerms.length };
  }
  const matchesAnywhere = (term: string) =>
    tokenized.some((tokens) => tokens.some((token) => tokenMatches(token, term)));

  let total = 0;
  let known = 0;
  let termCount = 0;
  for (const term of queryTerms) {
    const df = tokenized.reduce(
      (count, tokens) => count + Number(tokens.some((token) => tokenMatches(token, term))),
      0,
    );
    const idf = Math.log(1 + (tokenized.length - df + 0.5) / (df + 0.5));
    total += idf;
    if (df > 0 || expand(term).related.some(matchesAnywhere)) {
      known += idf;
      termCount++;
    }
  }
  return { mass: total ? known / total : 1, termCount };
}

function exactCoverage(tokens: readonly string[], queryTerms: readonly string[]): number {
  if (!queryTerms.length) return 0;
  let matches = 0;
  for (const term of queryTerms) {
    if (tokens.some((token) => tokenMatches(token, term))) matches++;
  }
  return matches / queryTerms.length;
}

/* One project-specific literal can carry a verbose query even when its IDF
   share falls below the corpus-wide floor. Keep this escape hatch narrow:
   the term must be a long exact token, occur in exactly one candidate, and
   have no curated concept siblings. Generic vocabulary such as deployment
   therefore cannot turn a topic-unknown query into a weak match. */
function hasDistinctiveLiteral(
  tokenized: readonly string[][],
  queryTerms: readonly string[],
): boolean {
  return queryTerms.some((term) => {
    if (term.length < 6 || expand(term).related.length > 0) return false;
    return tokenized.reduce(
      (count, tokens) => count + Number(tokens.includes(term)),
      0,
    ) === 1;
  });
}

/* Typo tolerance, kept narrow on purpose. Four-letter words sit one edit
   from too many real words (`test`/`text`/`best`) for a correction to be
   a correction rather than a guess. */
const MIN_TYPO_LENGTH = 5;

/* One insertion, deletion, substitution, or adjacent transposition —
   the optimal-string-alignment distance-1 test, without building the
   full matrix. `vitset` -> `vitest` is a transposition. */
function withinOneEdit(left: string, right: string): boolean {
  if (left === right || Math.abs(left.length - right.length) > 1) return false;
  let at = 0;
  while (at < left.length && at < right.length && left[at] === right[at]) at++;
  if (left.length === right.length) {
    if (left.slice(at + 1) === right.slice(at + 1)) return true;
    return (
      at + 1 < left.length &&
      left[at] === right[at + 1] &&
      left[at + 1] === right[at] &&
      left.slice(at + 2) === right.slice(at + 2)
    );
  }
  return left.length > right.length
    ? left.slice(at + 1) === right.slice(at)
    : left.slice(at) === right.slice(at + 1);
}

/* Rewrites a query term to the corpus word it misspells. Only a term the
   corpus cannot otherwise match is touched, only when exactly one corpus
   word is one edit away, and never a curated concept term, so a correct
   query can never be rewritten and an ambiguous typo stays unanswered
   rather than guessed. */
function correctTypos(tokenized: readonly string[][], terms: readonly string[]): string[] {
  let vocabulary: Set<string> | undefined;
  return terms.map((term) => {
    if (term.length < MIN_TYPO_LENGTH || expand(term).related.length) return term;
    if (tokenized.some((tokens) => tokens.some((token) => tokenMatches(token, term)))) return term;
    vocabulary ??= new Set(tokenized.flat());
    let correction: string | undefined;
    for (const word of vocabulary) {
      if (word.length < MIN_TYPO_LENGTH || !withinOneEdit(term, word)) continue;
      if (correction !== undefined) return term;
      correction = word;
    }
    return correction ?? term;
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

type ScoredMemory<T extends RankableMemory> = {
  memory: T;
  lexical: number;
  coverage: number;
  concept: number;
  entity: number;
  recencyScore: number;
  combined: number;
  eligible: boolean;
  matched: string[];
};

type ScoredSet<T extends RankableMemory> = {
  fallbackNewest: boolean;
  /* False when the corpus does not know enough of the query's distinctive
     terms to answer it. Callers return nothing rather than a weak guess. */
  topicKnown: boolean;
  scored: ScoredMemory<T>[];
};

function matchedQueryTerms(
  tokens: readonly string[],
  queryTerms: readonly string[],
): string[] {
  const matched: string[] = [];
  for (const term of queryTerms) {
    if (tokens.some((token) => tokenMatches(token, term))) matched.push(term);
  }
  return matched;
}

/* Shared scoring core. Ordering and filtering stay with the callers so
   rankMemories keeps its exact current behaviour and the explanation
   variant can add the evidence bonus without touching this function. */
function scoreMemories<T extends RankableMemory>(
  memories: readonly T[],
  query: string,
  options: { asOfMs?: number },
): ScoredSet<T> {
  const temporal = TEMPORAL_QUERY.test(query);
  const relevanceQuery = temporal ? query.replace(TEMPORAL_TERMS, ' ') : query;
  const expanded = expand(relevanceQuery);
  const queryEntities = entityKeys(relevanceQuery);
  const asOfMs = options.asOfMs ?? Date.now();

  if (!expanded.exact.length && !queryEntities.size) {
    const halfLifeMs = temporal ? CURRENT_HALF_LIFE_MS : HALF_LIFE_MS;
    /* No query to be ignorant of: an empty or stopword-only query asks for
       the newest facts, which is what get_context does with no query. */
    return {
      fallbackNewest: true,
      topicKnown: true,
      scored: [...memories]
        .sort(newestFirst)
        .map((memory) => ({
          memory,
          lexical: 0,
          coverage: 0,
          concept: 0,
          entity: 0,
          recencyScore: recency(memory.$createdAt, asOfMs, halfLifeMs),
          combined: 0,
          eligible: true,
          matched: [],
        })),
    };
  }

  const relevance = scoreRelevance(memories, expanded, queryEntities, { temporal, asOfMs });
  return {
    fallbackNewest: false,
    topicKnown: relevance.topicKnown,
    scored: relevance.scored,
  };
}

function scoreRelevance<T extends RankableMemory>(
  memories: readonly T[],
  typed: ReturnType<typeof expand>,
  queryEntities: Set<string>,
  context: { temporal: boolean; asOfMs: number },
): { scored: ScoredMemory<T>[]; topicKnown: boolean } {
  const texts = memories.map(textOf);
  const titleTokens = memories.map((memory) => searchTokens(memory.title ?? ''));
  const contentTokens = memories.map((memory) =>
    memory.title?.trim() === memory.content.trim() ? [] : searchTokens(memory.content),
  );
  const tokenized = titleTokens.map((title, index) => [...title, ...contentTokens[index]]);
  /* Corrected before scoring so BM25, coverage, concept expansion and the
     abstention check all see the same terms. */
  const corrected = correctTypos(tokenized, typed.exact);
  const expanded = corrected.some((term, index) => term !== typed.exact[index])
    ? expand(corrected.join(' '))
    : typed;
  const titleBm25 = bm25Scores(titleTokens, expanded.exact);
  const contentBm25 = bm25Scores(contentTokens, expanded.exact);
  const bm25 = titleBm25.map(
    (titleScore, index) => titleScore * TITLE_WEIGHT + contentBm25[index],
  );
  const maxBm25 = Math.max(...bm25, 0);
  const weights = context.temporal
    ? { lexical: 0.25, coverage: 0.25, concept: 0.05, entity: 0.1, recency: 0.35 }
    : { lexical: 0.55, coverage: 0.05, concept: 0.2, entity: 0.15, recency: 0.05 };
  const halfLifeMs = context.temporal ? CURRENT_HALF_LIFE_MS : HALF_LIFE_MS;

  const scored = memories.map((memory, index) => {
    const lexical = maxBm25 ? bm25[index] / maxBm25 : 0;
    const coverage = exactCoverage(tokenized[index], expanded.exact);
    const concept = conceptRelatedScore(texts[index], expanded);
    const entity = entityOverlap(queryEntities, texts[index]);
    const recencyScore = recency(memory.$createdAt, context.asOfMs, halfLifeMs);
    const eligible = bm25[index] > 0 || concept > 0 || entity > 0;
    return {
      memory,
      lexical,
      coverage,
      concept,
      entity,
      recencyScore,
      eligible,
      matched: matchedQueryTerms(tokenized[index], expanded.exact),
      combined:
        lexical * weights.lexical +
        coverage * weights.coverage +
        concept * weights.concept +
        entity * weights.entity +
        recencyScore * weights.recency,
    };
  });

  /* Reuses `tokenized` rather than tokenizing again — p95 latency is a
     protected metric, so this check must stay off the hot path's budget.
     IDF mass alone is unstable on tiny corpora: one generic known term can
     exceed the floor while most of the query is unknown. Require support
     for at least one-third of meaningful terms, unless a unique literal or
     recognized entity carries the topic on its own. */
  const known = knownQueryEvidence(tokenized, expanded.exact);
  const knownTermShare = known.termCount / expanded.exact.length;
  const topicKnown =
    (known.mass >= MIN_KNOWN_QUERY_MASS && knownTermShare >= 1 / 3) ||
    hasDistinctiveLiteral(tokenized, expanded.exact) ||
    scored.some(({ entity }) => entity > 0);

  return { scored, topicKnown };
}

export function rankMemories<T extends RankableMemory>(
  memories: readonly T[],
  query: string,
  options: { limit: number; asOfMs?: number },
): T[] {
  const limit = Math.max(0, Math.floor(options.limit));
  if (!limit || !memories.length) return [];

  const { fallbackNewest, topicKnown, scored } = scoreMemories(memories, query, {
    asOfMs: options.asOfMs,
  });
  if (fallbackNewest) return scored.slice(0, limit).map(({ memory }) => memory);
  /* Abstain rather than answer a question this corpus cannot support. */
  if (!topicKnown) return [];

  return scored
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

function trustOf(provenance: ExplanationProvenance | undefined): number {
  if (!provenance || provenance.type === 'agent') return 0;
  return provenance.type === 'user' ? 1 : 0.5;
}

function explanationInputs(memory: ExplainableMemory): {
  confidence: number;
  provenance?: ExplanationProvenance;
} {
  let confidence = DEFAULT_CONFIDENCE;
  let provenance: ExplanationProvenance | undefined;
  try {
    const parsed: unknown = JSON.parse(memory.metadata ?? '{}');
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const raw = parsed as Record<string, unknown>;
      const rawConfidence = raw.confidence ?? raw.c;
      if (typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)) {
        confidence = Math.min(1, Math.max(0, rawConfidence));
      }
      const rawProvenance = raw.provenance ?? raw.p;
      if (
        typeof rawProvenance === 'object' &&
        rawProvenance !== null &&
        !Array.isArray(rawProvenance)
      ) {
        const candidate = rawProvenance as Record<string, unknown>;
        let type: unknown = candidate.type ?? candidate.t;
        if (type === 'user_stated') type = 'user';
        if (typeof type === 'string' && PROVENANCE_TYPES.has(type)) {
          const reference = candidate.reference ?? candidate.r;
          provenance = {
            type,
            ...(typeof reference === 'string' && reference ? { reference } : {}),
          };
        }
      }
    }
  } catch {
    /* Malformed metadata keeps defaults; ranking never fails on it. */
  }
  return { confidence, provenance };
}

function buildExplanation(
  scored: Pick<
    ScoredMemory<ExplainableMemory>,
    'lexical' | 'coverage' | 'concept' | 'entity' | 'recencyScore' | 'matched'
  >,
  inputs: { confidence: number; provenance?: ExplanationProvenance },
  context: { fallbackNewest: boolean },
): MemoryExplanation {
  const reasons = new Set<RecallReason>();
  if (scored.matched.length) reasons.add('lexical');
  if (scored.concept > 0) reasons.add('concept');
  if (scored.entity > 0) reasons.add('entity');
  if (!context.fallbackNewest && scored.recencyScore >= RECENT_THRESHOLD) reasons.add('recent');
  if (context.fallbackNewest) reasons.add('newest');
  if (inputs.provenance && inputs.provenance.type !== 'agent') {
    reasons.add('evidence');
    if (inputs.provenance.type === 'user') reasons.add('user-confirmed');
  }
  if (inputs.confidence >= HIGH_CONFIDENCE) reasons.add('high-confidence');

  return {
    reasons: [...RECALL_REASONS].filter((reason) => reasons.has(reason)),
    matchedTerms: [...scored.matched],
    confidence: inputs.confidence,
    ...(inputs.provenance ? { provenance: inputs.provenance } : {}),
  };
}

/* Ranking with per-memory recall explanations. Order matches rankMemories
   except for the bounded evidence trust bonus on near-ties (see
   MAX_EVIDENCE_BONUS). Explanations name WHY a memory was recalled —
   never its raw weights, which stay internal. */
export function rankMemoriesWithExplanations<T extends ExplainableMemory>(
  memories: readonly T[],
  query: string,
  options: { limit: number; asOfMs?: number },
): RankedHit<T>[] {
  const limit = Math.max(0, Math.floor(options.limit));
  if (!limit || !memories.length) return [];

  const { fallbackNewest, topicKnown, scored } = scoreMemories(memories, query, {
    asOfMs: options.asOfMs,
  });
  if (!fallbackNewest && !topicKnown) return [];
  const inputs = scored.map(({ memory }) => explanationInputs(memory));

  if (fallbackNewest) {
    return scored.slice(0, limit).map((entry, index) => ({
      memory: entry.memory,
      explanation: buildExplanation(entry, inputs[index], { fallbackNewest: true }),
    }));
  }

  return scored
    .map((entry, index) => ({ ...entry, index, trust: trustOf(inputs[index].provenance) }))
    .filter(({ eligible }) => eligible)
    .sort(
      (left, right) =>
        right.combined + right.trust * MAX_EVIDENCE_BONUS -
          (left.combined + left.trust * MAX_EVIDENCE_BONUS) ||
        right.coverage - left.coverage ||
        right.lexical - left.lexical ||
        right.entity - left.entity ||
        newestFirst(left.memory, right.memory),
    )
    .slice(0, limit)
    .map((entry) => ({
      memory: entry.memory,
      explanation: buildExplanation(entry, inputs[entry.index], { fallbackNewest: false }),
    }));
}
