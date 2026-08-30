import { performance } from 'node:perf_hooks';
import baselineArtifact from '../../../benchmarks/baselines/brainfeather-1.5.2.json' with { type: 'json' };
import { compileContext, estimateTokens } from '../server/context-compiler.ts';
import {
  memoryEvidence,
  memoryIsRetrievable,
  memoryIsVisibleAt,
} from '../server/memory-temporal.ts';
import { rankMemories } from '../server/retrieval-ranking.ts';
import {
  findDuplicate,
  junkReason,
  planSupersedes,
  type StoredFact,
} from '../server/memory-policy.ts';

export const REPOMEMBENCH_VERSION = '0.1.0';
export const BASELINE_RELEASE = 'brainfeather-1.5.2';
const NOW = Date.parse('2026-08-30T00:00:00.000Z');
const DAY = 86_400_000;

export type BenchMemory = StoredFact & {
  $createdAt: string;
  title?: string;
  category: string;
  status: 'active' | 'invalid';
  metadata?: string;
  branch?: string;
};

type RetrievalCase = {
  id: string;
  query: string;
  projectId: string;
  expected: string | null;
  forbidden?: string[];
  referenceAt?: string;
  branch?: string;
  capability?: 'current' | 'branch-aware';
};

type BoundaryCase = {
  retrievalCaseId: string;
  forbidden: string[];
};

export type RepoMemBenchReport = {
  benchmark: typeof REPOMEMBENCH_VERSION;
  baseline: typeof BASELINE_RELEASE;
  generatedAt: string;
  counts: {
    memories: number;
    retrievalCases: number;
    boundaryCases: number;
    writeCases: number;
    totalChecks: number;
  };
  retrieval: {
    mrr: number;
    hitAtOne: number;
    hitAtThree: number;
    abstentionAccuracy: number;
    staleRecallRate: number;
    crossProjectLeakageRate: number;
    contradictionLeakageRate: number;
    evaluatedCases: number;
    failedCases: string[];
  };
  writes: {
    junkPrecision: number;
    durableAcceptance: number;
    duplicateAccuracy: number;
    supersessionAccuracy: number;
  };
  temporal: {
    historicalAccuracy: number;
    currentAccuracy: number;
  };
  context: {
    budgetRespected: boolean;
    diversityGroups: number;
    selected: number;
    estimatedTokens: number;
    maxTokens: number;
  };
  evidence: {
    validFileEvidencePreserved: boolean;
    malformedDigestRejected: boolean;
  };
  latencyMs: {
    iterations: number;
    average: number;
    p50: number;
    p95: number;
  };
  capabilityGaps: {
    negativeQueryAbstention: {
      measuredAccuracy: number;
      target: '100%';
      note: string;
    };
    branchIsolation: {
      supported: false;
      rankingAccuracy: number;
      rankingTarget: '100%';
      measuredLeakageRate: number;
      target: '0%';
      note: string;
    };
  };
};

const memories: BenchMemory[] = [
  memory('auth-appwrite', 'github.com/acme/api', 'decision', 'Authentication uses Appwrite sessions and JWT access checks.', 25),
  memory('auth-supabase', 'github.com/acme/storefront', 'decision', 'Authentication uses Supabase row-level security policies.', 20),
  memory('tests-vitest', 'github.com/acme/api', 'code', 'Testing uses Vitest with colocated .test.ts files.', 15),
  memory('deploy-vercel', 'github.com/acme/api', 'project', 'Production deploys to Vercel in the Singapore region.', 10),
  memory('language-typescript', 'github.com/acme/api', 'project', 'The service is written in TypeScript.', 8),
  memory('package-npm', 'github.com/acme/api', 'decision', 'Package manager: npm.', 300, {
    status: 'invalid',
    metadata: temporal('2025-01-01T00:00:00.000Z', '2026-07-15T00:00:00.000Z'),
  }),
  memory('package-pnpm', 'github.com/acme/api', 'decision', 'Package manager: pnpm.', 5, {
    metadata: temporal('2026-07-15T00:00:00.000Z'),
  }),
  memory('db-postgres', 'github.com/acme/api', 'project', 'Postgres is the production database.', 30),
  memory('cache-redis', 'github.com/acme/api', 'project', 'Redis caches API responses for five minutes.', 12),
  memory('ui-tailwind', 'github.com/acme/storefront', 'code', 'The storefront interface uses Tailwind CSS.', 7),
  memory('orm-drizzle-main', 'github.com/acme/api', 'decision', 'Database ORM: Drizzle on main.', 18, { branch: 'main' }),
  memory('orm-prisma-branch', 'github.com/acme/api', 'decision', 'Database ORM: Prisma on feature/prisma-migration.', 2, {
    branch: 'feature/prisma-migration',
  }),
  memory('rollback', 'github.com/acme/api', 'context', 'Deployment 814 was rolled back after authentication failures.', 4),
  memory('procedure-schema', 'github.com/acme/api', 'code', 'Appwrite schema changes require migration, availability polling, verification, then deployment.', 3),
  memory('evidence-file', 'github.com/acme/api', 'project', 'The API rate limiter is configured in src/rate-limit.ts.', 1, {
    metadata: evidence('file', 'src/rate-limit.ts', `sha256:${'a'.repeat(64)}`),
  }),
  memory('noise-billing', 'github.com/acme/storefront', 'context', 'Stripe invoices are emailed to finance monthly.', 40),
];

const retrievalCases: RetrievalCase[] = [
  query('auth-api', 'how does API authentication work', 'github.com/acme/api', 'auth-appwrite', ['auth-supabase']),
  query('auth-storefront', 'how does storefront auth work', 'github.com/acme/storefront', 'auth-supabase', ['auth-appwrite']),
  query('testing', 'testing convention', 'github.com/acme/api', 'tests-vitest'),
  query('deployment', 'where does production deploy', 'github.com/acme/api', 'deploy-vercel'),
  query('language', 'what language is the service written in', 'github.com/acme/api', 'language-typescript'),
  query('current-package', 'current package manager', 'github.com/acme/api', 'package-pnpm', ['package-npm']),
  query('historical-package', 'package manager', 'github.com/acme/api', 'package-npm', ['package-pnpm'], {
    referenceAt: '2026-06-01T00:00:00.000Z',
  }),
  query('database', 'production data store', 'github.com/acme/api', 'db-postgres'),
  query('cache', 'how are API responses cached', 'github.com/acme/api', 'cache-redis'),
  query('rollback', 'what deployment was rolled back', 'github.com/acme/api', 'rollback'),
  query('procedure', 'how do we deploy Appwrite schema changes', 'github.com/acme/api', 'procedure-schema'),
  query('evidence', 'where is the rate limiter configured', 'github.com/acme/api', 'evidence-file'),
  query('negative-maintainer', 'who is the maintainer alice', 'github.com/acme/api', null),
  query('negative-billing', 'billing invoice policy', 'github.com/acme/api', null, ['noise-billing']),
  query('negative-mobile', 'native ios deployment target', 'github.com/acme/api', null),
  query('branch-main', 'current database ORM', 'github.com/acme/api', 'orm-drizzle-main', ['orm-prisma-branch'], {
    branch: 'main',
    capability: 'branch-aware',
  }),
  query('branch-feature', 'current database ORM', 'github.com/acme/api', 'orm-prisma-branch', ['orm-drizzle-main'], {
    branch: 'feature/prisma-migration',
    capability: 'branch-aware',
  }),
];

const scopeBoundaryCases: BoundaryCase[] = [
  {
    retrievalCaseId: 'auth-api',
    forbidden: ['auth-supabase', 'ui-tailwind', 'noise-billing'],
  },
  {
    retrievalCaseId: 'auth-storefront',
    forbidden: [
      'auth-appwrite',
      'tests-vitest',
      'deploy-vercel',
      'language-typescript',
      'package-npm',
      'package-pnpm',
      'db-postgres',
      'cache-redis',
      'orm-drizzle-main',
      'orm-prisma-branch',
      'rollback',
      'procedure-schema',
      'evidence-file',
    ],
  },
];

const temporalBoundaryCases: BoundaryCase[] = [
  { retrievalCaseId: 'current-package', forbidden: ['package-npm'] },
  { retrievalCaseId: 'historical-package', forbidden: ['package-pnpm'] },
];

const junkCases = [
  'hello there everyone',
  "I'll now search the repository for the auth module",
  'currently trying a temporary workaround',
  'run the server in dev mode',
  'https://example.com/some/path',
];

const durableCases = [
  'This project uses Vitest for unit tests.',
  'We decided to deploy the API to Vercel.',
  'I prefer concise code review summaries.',
  'Backend: Fastify with TypeScript.',
  'We always run schema verification before deployment.',
];

function memory(
  id: string,
  projectId: string,
  category: string,
  content: string,
  daysAgo: number,
  overrides: Partial<BenchMemory> = {},
): BenchMemory {
  return {
    $id: id,
    $createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
    projectId,
    category,
    content,
    status: 'active',
    ...overrides,
  };
}

function temporal(validFrom: string, validTo?: string): string {
  return JSON.stringify({ vf: validFrom, ...(validTo ? { vt: validTo } : {}) });
}

function evidence(type: string, reference: string, digest: string): string {
  return JSON.stringify({ p: { t: type, r: reference, d: digest } });
}

function query(
  id: string,
  text: string,
  projectId: string,
  expected: string | null,
  forbidden: string[] = [],
  options: Partial<RetrievalCase> = {},
): RetrievalCase {
  return { id, query: text, projectId, expected, forbidden, capability: 'current', ...options };
}

function referenceAtMs(item: RetrievalCase): number {
  return Date.parse(item.referenceAt ?? new Date(NOW).toISOString());
}

function boundedCandidates(item: RetrievalCase): BenchMemory[] {
  return memories.filter((candidate) =>
    memoryIsRetrievable(candidate, {
      projectId: item.projectId,
      strictScope: true,
      referenceAtMs: referenceAtMs(item),
    }),
  );
}

function rank(item: RetrievalCase, context: { branch?: string } = {}): BenchMemory[] {
  // Branch is deliberately carried through the query context but not applied in
  // the 1.5.2 baseline, which only supports repository-level isolation.
  void context.branch;
  return rankMemories(boundedCandidates(item), item.query, {
    limit: 8,
    asOfMs: referenceAtMs(item),
  });
}

function boundaryLeakageRate(cases: BoundaryCase[]): number {
  const leaks = cases.filter(({ retrievalCaseId, forbidden }) => {
    const item = retrievalCases.find((candidate) => candidate.id === retrievalCaseId);
    if (!item) throw new Error(`Unknown retrieval case: ${retrievalCaseId}`);
    return boundedCandidates(item).some((candidate) => forbidden.includes(candidate.$id));
  }).length;
  return cases.length ? leaks / cases.length : 0;
}

function retrievalMetrics(cases: RetrievalCase[]) {
  const evaluable = cases.filter((item) => item.capability === 'current');
  const relevant = evaluable.filter((item) => item.expected !== null);
  const negative = evaluable.filter((item) => item.expected === null);
  let reciprocalRank = 0;
  let hitAtOne = 0;
  let hitAtThree = 0;
  let correctAbstentions = 0;
  let contradictionLeaks = 0;
  const failedCases: string[] = [];

  for (const item of relevant) {
    const ranked = rank(item);
    const position = ranked.findIndex((candidate) => candidate.$id === item.expected);
    if (position >= 0) reciprocalRank += 1 / (position + 1);
    if (position === 0) hitAtOne++;
    if (position >= 0 && position < 3) hitAtThree++;
    const contradiction = ranked.some((candidate) => item.forbidden?.includes(candidate.$id));
    if (contradiction) contradictionLeaks++;
    if (position < 0 || position >= 3 || contradiction) failedCases.push(item.id);
  }
  for (const item of negative) {
    const ranked = rank(item);
    if (!ranked.length) correctAbstentions++;
    else failedCases.push(item.id);
    if (ranked.some((candidate) => item.forbidden?.includes(candidate.$id))) contradictionLeaks++;
  }

  return {
    mrr: relevant.length ? reciprocalRank / relevant.length : 1,
    hitAtOne: relevant.length ? hitAtOne / relevant.length : 1,
    hitAtThree: relevant.length ? hitAtThree / relevant.length : 1,
    abstentionAccuracy: negative.length ? correctAbstentions / negative.length : 1,
    staleRecallRate: boundaryLeakageRate(temporalBoundaryCases),
    crossProjectLeakageRate: boundaryLeakageRate(scopeBoundaryCases),
    contradictionLeakageRate: evaluable.length ? contradictionLeaks / evaluable.length : 0,
    evaluatedCases: evaluable.length,
    failedCases,
  };
}

function branchMetrics() {
  const cases = retrievalCases.filter((item) => item.capability === 'branch-aware');
  let correctRankings = 0;
  let leaks = 0;
  for (const item of cases) {
    const ranked = rank(item, { branch: item.branch });
    if (ranked[0]?.$id === item.expected) correctRankings++;
    if (
      ranked.some(
        (candidate) => candidate.branch !== undefined && candidate.branch !== item.branch,
      )
    ) {
      leaks++;
    }
  }
  return {
    rankingAccuracy: cases.length ? correctRankings / cases.length : 1,
    measuredLeakageRate: cases.length ? leaks / cases.length : 0,
  };
}

function writeMetrics() {
  const duplicateExisting: StoredFact[] = [
    { $id: 'known', content: 'This project uses Vitest for unit tests.', projectId: 'github.com/acme/api' },
  ];
  const duplicateCases = [
    ['This project uses Vitest for unit tests.', true],
    ['This project uses Vitest for unit tests in CI.', true],
    ['Authentication uses Appwrite sessions.', false],
  ] as const;
  const existing: StoredFact[] = [
    { $id: 'old-backend', content: 'Backend: Express.', projectId: 'github.com/acme/api' },
    { $id: 'other-project', content: 'Backend: Rails.', projectId: 'github.com/acme/storefront' },
  ];
  const replacement = planSupersedes('Backend: Fastify with TypeScript.', existing, {
    projectId: 'github.com/acme/api',
    currentlyValid: true,
  });
  const supersessionCorrect =
    !('reject' in replacement) &&
    replacement.doomed.includes('old-backend') &&
    !replacement.doomed.includes('other-project');

  return {
    junkPrecision: junkCases.filter((content) => junkReason(content) !== null).length / junkCases.length,
    durableAcceptance: durableCases.filter((content) => junkReason(content) === null).length / durableCases.length,
    duplicateAccuracy:
      duplicateCases.filter(
        ([content, expected]) => Boolean(findDuplicate(content, duplicateExisting)) === expected,
      ).length / duplicateCases.length,
    supersessionAccuracy: supersessionCorrect ? 1 : 0,
  };
}

function temporalMetrics() {
  const old = memories.find((item) => item.$id === 'package-npm')!;
  const current = memories.find((item) => item.$id === 'package-pnpm')!;
  const historical = Date.parse('2026-06-01T00:00:00.000Z');
  return {
    historicalAccuracy: Number(memoryIsVisibleAt(old, historical) && !memoryIsVisibleAt(current, historical)),
    currentAccuracy: Number(!memoryIsVisibleAt(old, NOW) && memoryIsVisibleAt(current, NOW)),
  };
}

function contextMetrics() {
  const candidates = memories.filter(
    (item) => item.projectId === 'github.com/acme/api' && memoryIsVisibleAt(item, NOW),
  );
  const maxTokens = 128;
  const compiled = compileContext(candidates, {
    query: 'authentication testing deployment',
    maxTokens,
    asOfMs: NOW,
  });
  const selected = [...compiled.facts, ...compiled.decisions, ...compiled.patterns];
  const estimatedTokens = selected.reduce((sum, content) => sum + estimateTokens(content), 0);
  return {
    budgetRespected: estimatedTokens <= maxTokens,
    diversityGroups: Number(Boolean(compiled.facts.length)) + Number(Boolean(compiled.decisions.length)) + Number(Boolean(compiled.patterns.length)),
    selected: compiled.counts.total,
    estimatedTokens,
    maxTokens,
  };
}

function evidenceMetrics() {
  const valid = memories.find((item) => item.$id === 'evidence-file')!;
  const malformed = JSON.stringify({ p: { t: 'file', r: 'src/a.ts', d: 'sha256:not-valid' } });
  return {
    validFileEvidencePreserved: memoryEvidence(valid.metadata)?.digest === `sha256:${'a'.repeat(64)}`,
    malformedDigestRejected: memoryEvidence(malformed)?.digest === undefined,
  };
}

function latencyMetrics(iterations: number) {
  const samples: number[] = [];
  const cases = retrievalCases.filter((item) => item.capability === 'current');
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (const item of cases) {
      const started = performance.now();
      rank(item);
      samples.push(performance.now() - started);
    }
  }
  samples.sort((left, right) => left - right);
  const percentile = (value: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * value))] ?? 0;
  return {
    iterations,
    average: samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
  };
}

export function runRepoMemBench(options: { iterations?: number } = {}): RepoMemBenchReport {
  const retrieval = retrievalMetrics(retrievalCases);
  const writes = writeMetrics();
  const report: RepoMemBenchReport = {
    benchmark: REPOMEMBENCH_VERSION,
    baseline: BASELINE_RELEASE,
    generatedAt: new Date(NOW).toISOString(),
    counts: {
      memories: memories.length,
      retrievalCases: retrievalCases.length,
      boundaryCases: scopeBoundaryCases.length + temporalBoundaryCases.length,
      writeCases: junkCases.length + durableCases.length + 3 + 1,
      totalChecks:
        retrievalCases.length +
        scopeBoundaryCases.length +
        temporalBoundaryCases.length +
        junkCases.length +
        durableCases.length +
        3 +
        1 +
        2 +
        4 +
        2,
    },
    retrieval,
    writes,
    temporal: temporalMetrics(),
    context: contextMetrics(),
    evidence: evidenceMetrics(),
    latencyMs: latencyMetrics(options.iterations ?? 300),
    capabilityGaps: {
      negativeQueryAbstention: {
        measuredAccuracy: retrieval.abstentionAccuracy,
        target: '100%',
        note: 'The current ranker can over-match generic terms such as policy. Phase 1 adds calibrated confidence thresholds.',
      },
      branchIsolation: {
        supported: false,
        ...branchMetrics(),
        rankingTarget: '100%',
        target: '0%',
        note: 'Brainfeather 1.5.2 scopes by repository, not branch. Phase 1 adds branch overlays.',
      },
    },
  };
  return report;
}

export function baselinePasses(report: RepoMemBenchReport): boolean {
  const protectedMetrics = {
    'retrieval.hitAtThree': report.retrieval.hitAtThree,
    'retrieval.staleRecallRate': report.retrieval.staleRecallRate,
    'retrieval.crossProjectLeakageRate': report.retrieval.crossProjectLeakageRate,
    'retrieval.contradictionLeakageRate': report.retrieval.contradictionLeakageRate,
    'writes.junkPrecision': report.writes.junkPrecision,
    'writes.durableAcceptance': report.writes.durableAcceptance,
    'writes.duplicateAccuracy': report.writes.duplicateAccuracy,
    'writes.supersessionAccuracy': report.writes.supersessionAccuracy,
    'temporal.historicalAccuracy': report.temporal.historicalAccuracy,
    'temporal.currentAccuracy': report.temporal.currentAccuracy,
    'context.budgetRespected': report.context.budgetRespected,
    'context.diversityGroups': report.context.diversityGroups,
    'evidence.validFileEvidencePreserved': report.evidence.validFileEvidencePreserved,
    'evidence.malformedDigestRejected': report.evidence.malformedDigestRejected,
  } satisfies Omit<typeof baselineArtifact.protected, 'latencyMs.p95UpperBound'>;
  const protectedPass = Object.entries(protectedMetrics).every(
    ([metric, actual]) =>
      actual === baselineArtifact.protected[metric as keyof typeof protectedMetrics],
  );

  return (
    report.benchmark === baselineArtifact.benchmark &&
    report.baseline === baselineArtifact.baseline &&
    protectedPass &&
    report.latencyMs.p95 < baselineArtifact.protected['latencyMs.p95UpperBound'] &&
    report.retrieval.abstentionAccuracy >=
      baselineArtifact.targets['retrieval.abstentionAccuracy'].baseline &&
    report.capabilityGaps.branchIsolation.measuredLeakageRate <=
      baselineArtifact.targets['branchIsolation.leakageRate'].baseline &&
    report.capabilityGaps.branchIsolation.rankingAccuracy >=
      baselineArtifact.targets['branchIsolation.rankingAccuracy'].baseline
  );
}
