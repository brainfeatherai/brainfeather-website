import { rankMemoriesWithExplanations } from '../server/retrieval-ranking.ts';

/* Generalization track.

   The core RepoMemBench fixtures reached 100% on every metric in 0.3.0,
   and the abstention floor was calibrated against those same fixtures.
   A perfect score on the data a ranker was tuned against says little
   about queries it has never seen: probed with fresh paraphrases, typos
   and near-topic questions, the same ranker managed 54% Hit@3.

   So this track is split, and the split is the point:

   - `dev` is the set ranking changes may be tuned against.
   - `holdout` was written before those changes and is not edited to
     make a change pass. Its corpus uses different vocabulary so a fix
     that only memorised dev wording shows up as a gap here.

   Neither split is pinned to 100%. baselinePasses() enforces floors from
   benchmarks/baselines/generalization.json, so an improvement cannot
   silently regress, while known gaps stay visible instead of being
   tuned away. */

export type CaseKind =
  | 'paraphrase'
  | 'typo'
  | 'morphology'
  | 'literal'
  | 'negative'
  | 'near-topic';

type Memory = {
  $id: string;
  $createdAt: string;
  projectId: string;
  category: string;
  content: string;
};

type Case = { id: string; kind: CaseKind; query: string; expected: string | null };

export type SplitMetrics = {
  relevantCases: number;
  hitAtOne: number;
  hitAtThree: number;
  mrr: number;
  /* Relevant cases that returned nothing at all. Hit@3 alone cannot tell
     a stricter abstention gate (declined) from a worse ranking (answered
     wrongly); the two fail differently for an agent, so report both. */
  falseAbstentionRate: number;
  /* Unknown topic: nothing in the corpus is about it. */
  abstentionAccuracy: number;
  /* Known topic, unknown answer: "redis cluster shards" when only the
     Redis cache TTL is stored. Returning the TTL is a confident wrong
     answer, not a miss — measured separately because the ranker
     deliberately biases toward answering (see MIN_KNOWN_QUERY_MASS). */
  nearTopicAbstention: number;
  /* Near-topic cases the agent is warned about: declined outright, or
     answered with the `partial` recall reason on the top hit. */
  nearTopicFlagged: number;
  /* Correct top-3 answers wrongly marked `partial`. A flag that fires on
     good answers teaches the agent to ignore it, so this must stay low. */
  partialOnCorrectRate: number;
  byKind: Partial<Record<CaseKind, { cases: number; correct: number }>>;
  failedCases: string[];
};

const NOW = Date.parse('2026-08-30T00:00:00.000Z');
const DAY = 86_400_000;

function memory(projectId: string, id: string, category: string, content: string, daysAgo = 5): Memory {
  return {
    $id: id,
    $createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
    projectId,
    category,
    content,
  };
}

const DEV_PROJECT = 'github.com/acme/api';
const devCorpus: Memory[] = [
  memory(DEV_PROJECT, 'auth', 'decision', 'Authentication uses Appwrite sessions and JWT access checks.'),
  memory(DEV_PROJECT, 'tests', 'code', 'Testing uses Vitest with colocated .test.ts files.'),
  memory(DEV_PROJECT, 'deploy', 'project', 'Production deploys to Vercel in the Singapore region.'),
  memory(DEV_PROJECT, 'db', 'project', 'Postgres is the production database.'),
  memory(DEV_PROJECT, 'cache', 'project', 'Redis caches API responses for five minutes.'),
  memory(DEV_PROJECT, 'pnpm', 'decision', 'Package manager: pnpm.'),
  memory(DEV_PROJECT, 'lint', 'code', 'ESLint runs with zero warnings allowed in CI.'),
  memory(DEV_PROJECT, 'errors', 'code', 'Server errors are reported to Sentry with operation tags.'),
  memory(DEV_PROJECT, 'style', 'preference', 'Prefer small focused pull requests with a written test plan.'),
  memory(DEV_PROJECT, 'secrets', 'decision', 'Secrets live in Vercel environment variables, never in the repo.'),
  memory(DEV_PROJECT, 'node', 'project', 'The runtime is Node 22 on Vercel functions.'),
  memory(DEV_PROJECT, 'i18n', 'decision', 'User-facing copy is British English.'),
];

const devCases: Case[] = [
  { id: 'dev-para-login', kind: 'paraphrase', query: 'how do users log in', expected: 'auth' },
  { id: 'dev-para-unit', kind: 'paraphrase', query: 'which framework runs the unit tests', expected: 'tests' },
  { id: 'dev-para-host', kind: 'paraphrase', query: 'where is the app hosted', expected: 'deploy' },
  { id: 'dev-para-sql', kind: 'paraphrase', query: 'what SQL database do we use', expected: 'db' },
  { id: 'dev-para-crash', kind: 'paraphrase', query: 'where do exceptions get logged', expected: 'errors' },
  { id: 'dev-para-env', kind: 'paraphrase', query: 'where should I put an API token', expected: 'secrets' },
  { id: 'dev-para-pr', kind: 'paraphrase', query: 'how big should a PR be', expected: 'style' },
  { id: 'dev-para-spell', kind: 'paraphrase', query: 'should I write color or colour', expected: 'i18n' },
  { id: 'dev-typo-vitest', kind: 'typo', query: 'vitset config', expected: 'tests' },
  { id: 'dev-typo-postgres', kind: 'typo', query: 'postgress', expected: 'db' },
  { id: 'dev-case-redis', kind: 'literal', query: 'REDIS TTL', expected: 'cache' },
  { id: 'dev-ident-node', kind: 'literal', query: 'node version', expected: 'node' },
  { id: 'dev-ident-eslint', kind: 'literal', query: 'eslint warnings', expected: 'lint' },
  { id: 'dev-near-redis', kind: 'near-topic', query: 'how many redis cluster shards', expected: null },
  { id: 'dev-near-postgres', kind: 'near-topic', query: 'postgres backup retention schedule', expected: null },
  { id: 'dev-near-vercel', kind: 'near-topic', query: 'monthly vercel bill amount', expected: null },
  { id: 'dev-neg-oncall', kind: 'negative', query: 'who is on call this week', expected: null },
  { id: 'dev-neg-k8s', kind: 'negative', query: 'kubernetes helm chart values', expected: null },
  { id: 'dev-neg-android', kind: 'negative', query: 'android minimum sdk version', expected: null },
  /* Round 1: only a concept sibling is known ("grpc" ~ api) while the
     rest of the query is wholly unknown. */
  { id: 'dev-neg-grpc', kind: 'negative', query: 'grpc streaming interceptors', expected: null },
  { id: 'dev-neg-webpack', kind: 'negative', query: 'webpack chunk splitting', expected: null },
];

/* Frozen. Do not edit these to make a ranking change pass — add new
   cases to `dev` instead, and record any holdout change in the baseline
   artifact's history with the reason. */
const HOLDOUT_PROJECT = 'github.com/acme/worker';
const holdoutCorpus: Memory[] = [
  memory(HOLDOUT_PROJECT, 'queue', 'project', 'Background jobs run on BullMQ backed by Redis.'),
  memory(HOLDOUT_PROJECT, 'email', 'decision', 'Transactional email is sent through Resend.'),
  memory(HOLDOUT_PROJECT, 'storage', 'project', 'User uploads are stored in S3 with signed URLs.'),
  memory(HOLDOUT_PROJECT, 'flags', 'decision', 'Feature flags are managed in LaunchDarkly.'),
  memory(HOLDOUT_PROJECT, 'ci', 'code', 'GitHub Actions runs lint, typecheck, and tests on every pull request.'),
  memory(HOLDOUT_PROJECT, 'migrations', 'code', 'Database migrations run with drizzle-kit before each release.'),
  memory(HOLDOUT_PROJECT, 'timezone', 'decision', 'All timestamps are stored in UTC.'),
  memory(HOLDOUT_PROJECT, 'retries', 'code', 'Failed webhooks are retried three times with exponential backoff.'),
  memory(HOLDOUT_PROJECT, 'logging', 'project', 'Structured logs are shipped to Datadog.'),
  memory(HOLDOUT_PROJECT, 'authz', 'decision', 'Admin routes require the owner role.'),
  memory(HOLDOUT_PROJECT, 'versioning', 'decision', 'Public API versions are prefixed with /v1.'),
  memory(HOLDOUT_PROJECT, 'adr', 'preference', 'Architecture decisions are recorded as ADRs in docs/adr.'),
  memory(HOLDOUT_PROJECT, 'appsmith', 'project', 'Appsmith powers the internal admin dashboard.'),
];

const holdoutCases: Case[] = [
  { id: 'ho-para-jobs', kind: 'paraphrase', query: 'how are background tasks processed', expected: 'queue' },
  { id: 'ho-para-mail', kind: 'paraphrase', query: 'which service sends emails', expected: 'email' },
  { id: 'ho-para-uploads', kind: 'paraphrase', query: 'where do uploaded files go', expected: 'storage' },
  { id: 'ho-para-flags', kind: 'paraphrase', query: 'how do we toggle features', expected: 'flags' },
  { id: 'ho-para-ci', kind: 'paraphrase', query: 'what runs on each PR', expected: 'ci' },
  { id: 'ho-para-schema', kind: 'paraphrase', query: 'how are schema changes applied', expected: 'migrations' },
  { id: 'ho-para-tz', kind: 'paraphrase', query: 'what timezone are dates saved in', expected: 'timezone' },
  { id: 'ho-para-webhook', kind: 'paraphrase', query: 'what happens when a webhook fails', expected: 'retries' },
  { id: 'ho-para-logs', kind: 'paraphrase', query: 'where can I see the logs', expected: 'logging' },
  { id: 'ho-para-admin', kind: 'paraphrase', query: 'who can access admin pages', expected: 'authz' },
  { id: 'ho-typo-launchdarkly', kind: 'typo', query: 'lanchdarkly setup', expected: 'flags' },
  { id: 'ho-typo-datadog', kind: 'typo', query: 'datadgo', expected: 'logging' },
  { id: 'ho-typo-bullmq', kind: 'typo', query: 'bulmq worker', expected: 'queue' },
  { id: 'ho-morph-retry', kind: 'morphology', query: 'retrying webhooks', expected: 'retries' },
  { id: 'ho-morph-upload', kind: 'morphology', query: 'uploading user files', expected: 'storage' },
  { id: 'ho-lit-utc', kind: 'literal', query: 'utc', expected: 'timezone' },
  { id: 'ho-lit-drizzle', kind: 'literal', query: 'drizzle kit', expected: 'migrations' },
  { id: 'ho-lit-v1', kind: 'literal', query: 'api version prefix', expected: 'versioning' },
  { id: 'ho-near-redis', kind: 'near-topic', query: 'redis memory limit', expected: null },
  { id: 'ho-near-datadog', kind: 'near-topic', query: 'datadog monthly cost', expected: null },
  { id: 'ho-near-resend', kind: 'near-topic', query: 'resend domain dns records', expected: null },
  { id: 'ho-neg-graphql', kind: 'negative', query: 'graphql subscription resolvers', expected: null },
  { id: 'ho-neg-ios', kind: 'negative', query: 'ios push notification certificate', expected: null },
  { id: 'ho-neg-appstore', kind: 'negative', query: 'app store release checklist', expected: null },
  { id: 'ho-neg-prototype', kind: 'negative', query: 'who wrote the original prototype', expected: null },
  /* Added in round 1, before the round-1 fix was run: a concept term
     reachable only through a sibling, next to unknown terms. Written
     from the failure class, not tuned — mongo is expected to stay open. */
  { id: 'ho-neg-jest', kind: 'negative', query: 'jest snapshot serializers', expected: null },
  { id: 'ho-neg-mongo', kind: 'negative', query: 'mongodb aggregation pipeline', expected: null },
  { id: 'ho-para-jest', kind: 'paraphrase', query: 'how do we run jest', expected: 'ci' },
];

/* Frozen, written 2026-09-29 before round 4 was implemented. The first
   holdout's query tokenization was printed while diagnosing round 3, so
   it is no longer fully blind; this split is. Same rules: do not edit
   it to make a change pass, and never diagnose a fix on it. */
const HOLDOUT2_PROJECT = 'github.com/acme/billing';
const holdout2Corpus: Memory[] = [
  memory(HOLDOUT2_PROJECT, 'payments', 'decision', 'Payments are processed through Stripe Checkout.'),
  memory(HOLDOUT2_PROJECT, 'currency', 'decision', 'Prices are stored as integer cents, never floats.'),
  memory(HOLDOUT2_PROJECT, 'orm', 'code', 'Prisma is the ORM; the schema lives in prisma/schema.prisma.'),
  memory(HOLDOUT2_PROJECT, 'e2e', 'code', 'Playwright covers the checkout flow end to end.'),
  memory(HOLDOUT2_PROJECT, 'invoices', 'project', 'Invoices are generated as PDFs by a nightly cron job.'),
  memory(HOLDOUT2_PROJECT, 'search', 'project', 'Product search is served by Meilisearch.'),
  memory(HOLDOUT2_PROJECT, 'cdn', 'project', 'Static assets are served from Cloudflare.'),
  memory(HOLDOUT2_PROJECT, 'monorepo', 'project', 'The repo is a Turborepo monorepo with apps/ and packages/.'),
  memory(HOLDOUT2_PROJECT, 'commits', 'preference', 'Commit messages follow Conventional Commits.'),
  memory(HOLDOUT2_PROJECT, 'tax', 'decision', 'Sales tax is calculated by Stripe Tax.'),
  memory(HOLDOUT2_PROJECT, 'ratelimit', 'code', 'Public endpoints are rate limited to 100 requests per minute.'),
  memory(HOLDOUT2_PROJECT, 'fonts', 'preference', 'The UI uses the Inter typeface.'),
];

const holdout2Cases: Case[] = [
  { id: 'h2-para-pay', kind: 'paraphrase', query: 'how do customers pay', expected: 'payments' },
  { id: 'h2-para-money', kind: 'paraphrase', query: 'how is money represented in the database', expected: 'currency' },
  { id: 'h2-para-orm', kind: 'paraphrase', query: 'how do we access the database from code', expected: 'orm' },
  { id: 'h2-para-e2e', kind: 'paraphrase', query: 'what tests the checkout in a browser', expected: 'e2e' },
  { id: 'h2-para-invoice', kind: 'paraphrase', query: 'when are invoices created', expected: 'invoices' },
  { id: 'h2-para-search', kind: 'paraphrase', query: 'what powers product search', expected: 'search' },
  { id: 'h2-para-cdn', kind: 'paraphrase', query: 'where are images and css hosted', expected: 'cdn' },
  { id: 'h2-para-layout', kind: 'paraphrase', query: 'how is the codebase organised', expected: 'monorepo' },
  { id: 'h2-para-commit', kind: 'paraphrase', query: 'how should I word a commit message', expected: 'commits' },
  { id: 'h2-para-tax', kind: 'paraphrase', query: 'who computes sales tax', expected: 'tax' },
  { id: 'h2-para-limit', kind: 'paraphrase', query: 'how many API calls can a client make', expected: 'ratelimit' },
  { id: 'h2-para-font', kind: 'paraphrase', query: 'what font does the site use', expected: 'fonts' },
  { id: 'h2-typo-meili', kind: 'typo', query: 'meilisaerch', expected: 'search' },
  { id: 'h2-typo-playwright', kind: 'typo', query: 'playwrigt tests', expected: 'e2e' },
  { id: 'h2-morph-invoice', kind: 'morphology', query: 'invoicing schedule', expected: 'invoices' },
  { id: 'h2-morph-limit', kind: 'morphology', query: 'rate limiting', expected: 'ratelimit' },
  { id: 'h2-lit-turbo', kind: 'literal', query: 'turborepo', expected: 'monorepo' },
  { id: 'h2-lit-checkout', kind: 'literal', query: 'stripe checkout', expected: 'payments' },
  { id: 'h2-lit-cents', kind: 'literal', query: 'cents', expected: 'currency' },
  { id: 'h2-near-webhook', kind: 'near-topic', query: 'stripe webhook signing secret', expected: null },
  { id: 'h2-near-meili', kind: 'near-topic', query: 'meilisearch index settings', expected: null },
  { id: 'h2-near-purge', kind: 'near-topic', query: 'cloudflare cache purge', expected: null },
  { id: 'h2-near-rollback', kind: 'near-topic', query: 'prisma migration rollback', expected: null },
  { id: 'h2-neg-kafka', kind: 'negative', query: 'kafka consumer lag', expected: null },
  { id: 'h2-neg-terraform', kind: 'negative', query: 'terraform state bucket', expected: null },
  { id: 'h2-neg-figma', kind: 'negative', query: 'figma design tokens', expected: null },
  { id: 'h2-neg-vacation', kind: 'negative', query: 'who approves vacation requests', expected: null },
];

function evaluate(corpus: readonly Memory[], cases: readonly Case[]): SplitMetrics {
  let relevant = 0;
  let hitAtOne = 0;
  let hitAtThree = 0;
  let reciprocal = 0;
  let falseAbstained = 0;
  let negatives = 0;
  let abstained = 0;
  let nearTopic = 0;
  let nearAbstained = 0;
  let nearFlagged = 0;
  let partialOnCorrect = 0;
  const byKind: SplitMetrics['byKind'] = {};
  const failedCases: string[] = [];

  for (const item of cases) {
    /* Fixtures carry no metadata, so the evidence bonus is zero and this
       order is exactly rankMemories' order. */
    const hits = rankMemoriesWithExplanations(corpus, item.query, { limit: 8, asOfMs: NOW });
    const ranked = hits.map(({ memory }) => memory.$id);
    const flaggedPartial = hits[0]?.explanation.reasons.includes('partial') ?? false;
    let correct: boolean;
    if (item.expected !== null) {
      relevant++;
      if (ranked.length === 0) falseAbstained++;
      const position = ranked.indexOf(item.expected);
      if (position === 0) hitAtOne++;
      if (position >= 0) reciprocal += 1 / (position + 1);
      correct = position >= 0 && position < 3;
      if (correct) hitAtThree++;
      if (correct && flaggedPartial) partialOnCorrect++;
    } else {
      correct = ranked.length === 0;
      if (item.kind === 'near-topic') {
        nearTopic++;
        if (correct) nearAbstained++;
        if (correct || flaggedPartial) nearFlagged++;
      } else {
        negatives++;
        if (correct) abstained++;
      }
    }
    const tally = (byKind[item.kind] ??= { cases: 0, correct: 0 });
    tally.cases++;
    if (correct) tally.correct++;
    if (!correct) failedCases.push(item.id);
  }

  const share = (part: number, whole: number) => (whole ? part / whole : 1);
  return {
    relevantCases: relevant,
    hitAtOne: share(hitAtOne, relevant),
    hitAtThree: share(hitAtThree, relevant),
    mrr: share(reciprocal, relevant),
    falseAbstentionRate: relevant ? falseAbstained / relevant : 0,
    abstentionAccuracy: share(abstained, negatives),
    nearTopicAbstention: share(nearAbstained, nearTopic),
    nearTopicFlagged: share(nearFlagged, nearTopic),
    partialOnCorrectRate: hitAtThree ? partialOnCorrect / hitAtThree : 0,
    byKind,
    failedCases,
  };
}

export function generalizationCaseCount(): number {
  return devCases.length + holdoutCases.length + holdout2Cases.length;
}

export function runGeneralizationTrack(): {
  dev: SplitMetrics;
  holdout: SplitMetrics;
  holdout2: SplitMetrics;
} {
  return {
    dev: evaluate(devCorpus, devCases),
    holdout: evaluate(holdoutCorpus, holdoutCases),
    holdout2: evaluate(holdout2Corpus, holdout2Cases),
  };
}
