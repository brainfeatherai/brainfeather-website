import { performance } from 'node:perf_hooks';
import { expand, score } from '../src/lib/server/concepts.ts';
import { rankMemories, type RankableMemory } from '../src/lib/server/retrieval-ranking.ts';

const NOW = Date.parse('2026-08-27T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const memories: RankableMemory[] = [
  { $id: 'auth', $createdAt: new Date(NOW - 20 * DAY).toISOString(), content: 'Supabase RLS policies enforce permissions.' },
  { $id: 'tests', $createdAt: new Date(NOW - 15 * DAY).toISOString(), content: 'Colocate .test.ts files and run them with Vitest.' },
  { $id: 'deploy', $createdAt: new Date(NOW - 10 * DAY).toISOString(), content: 'Production deploys to Vercel.' },
  { $id: 'typescript', $createdAt: new Date(NOW - 8 * DAY).toISOString(), content: 'The service is written in TypeScript.' },
  { $id: 'package-old', $createdAt: new Date(NOW - 400 * DAY).toISOString(), content: 'The package manager convention is npm.' },
  { $id: 'package-new', $createdAt: new Date(NOW - 2 * DAY).toISOString(), content: 'The package manager convention is pnpm.' },
  { $id: 'database', $createdAt: new Date(NOW - 30 * DAY).toISOString(), content: 'Postgres is the production database.' },
  { $id: 'encryption', $createdAt: new Date(NOW - DAY).toISOString(), content: 'Production memory encryption uses a versioned keyring and encrypted mode.' },
  { $id: 'ui', $createdAt: new Date(NOW - DAY).toISOString(), content: 'The interface uses Tailwind CSS.' },
];

const cases = [
  { query: 'how do we handle auth', expected: 'auth' },
  { query: 'testing convention', expected: 'tests' },
  { query: 'where does production ship', expected: 'deploy' },
  { query: 'TS language', expected: 'typescript' },
  { query: 'current package manager convention', expected: 'package-new' },
  { query: 'current data encryption mode', expected: 'encryption' },
  { query: 'Postgres database', expected: 'database' },
  { query: 'billing invoice policy', expected: null },
  { query: 'maintainer alice', expected: null },
];

function legacy(query: string): RankableMemory[] {
  const expanded = expand(query);
  return memories
    .map((memory) => ({ memory, relevance: score(memory.content, expanded) }))
    .filter(({ relevance }) => relevance > 0)
    .sort((left, right) => right.relevance - left.relevance)
    .map(({ memory }) => memory);
}

function metrics(rank: (query: string) => RankableMemory[]) {
  let reciprocalRank = 0;
  let hitsAtOne = 0;
  let hitsAtThree = 0;
  let abstentions = 0;
  const relevant = cases.filter((item) => item.expected !== null);
  const negative = cases.filter((item) => item.expected === null);
  for (const item of relevant) {
    const position = rank(item.query).findIndex((memory) => memory.$id === item.expected);
    if (position >= 0) reciprocalRank += 1 / (position + 1);
    if (position === 0) hitsAtOne++;
    if (position >= 0 && position < 3) hitsAtThree++;
  }
  for (const item of negative) if (rank(item.query).length === 0) abstentions++;
  return {
    mrr: reciprocalRank / relevant.length,
    hitAtOne: hitsAtOne / relevant.length,
    hitAtThree: hitsAtThree / relevant.length,
    abstentionAccuracy: abstentions / negative.length,
  };
}

const hybrid = (query: string) => rankMemories(memories, query, { limit: 8, asOfMs: NOW });
const iterations = 500;
const latencySamples: number[] = [];
for (let iteration = 0; iteration < iterations; iteration++) {
  for (const item of cases) {
    const started = performance.now();
    hybrid(item.query);
    latencySamples.push(performance.now() - started);
  }
}
latencySamples.sort((left, right) => left - right);
const averageLatencyMs =
  latencySamples.reduce((sum, latency) => sum + latency, 0) / latencySamples.length;
const p95LatencyMs = latencySamples[Math.floor(latencySamples.length * 0.95)] ?? 0;
const report = {
  cases: cases.length,
  legacy: metrics(legacy),
  hybrid: metrics(hybrid),
  latencyMs: { average: averageLatencyMs, p95: p95LatencyMs },
};
console.log(JSON.stringify(report, null, 2));

if (
  report.hybrid.hitAtThree < 1 ||
  report.hybrid.abstentionAccuracy < 1 ||
  report.hybrid.mrr < report.legacy.mrr ||
  report.latencyMs.p95 > 10
) {
  process.exitCode = 1;
}
