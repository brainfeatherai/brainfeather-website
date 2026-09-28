import './test-env.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { extractActivityFacts } from './capture.ts';

/* Labelled capture set. Synthetic sentences in the shapes Stop-hook
   transcripts actually produce. `true` means a reviewer would want it as a
   durable memory. Each sentence is scored on its own so the per-capture cap
   cannot affect the result. */
const LABELLED: Array<[string, boolean]> = [
  ['This project uses Vitest for unit tests.', true],
  ['We decided to store sessions as signed cookies instead of JWTs.', true],
  ['I prefer terse tool output without summaries.', true],
  ['Never run database migrations against production from a laptop.', true],
  ['The backend is deployed on Vercel with Appwrite as the database.', true],
  ['We switched from npm to pnpm last month.', true],
  ['Always use date-fns instead of moment for date formatting.', true],
  ['The team convention is to squash-merge pull requests.', true],
  ['Authentication uses Appwrite JWTs verified on every API request.', true],
  ['We chose Tailwind v4 over CSS modules for styling.', true],
  ['Use `pnpm run check` before pushing because CI requires it.', true],
  ['API keys are stored as SHA-256 digests, never in plaintext.', true],
  ['The monorepo keeps shared types in packages/types.', true],
  ["I don't want emoji in commit messages.", true],
  ['Our staging environment runs on Fly.io.', true],

  ['Let me check the test output.', false],
  ["I've updated the config to use the new endpoint.", false],
  ['It uses Redis for caching.', false],
  ["That's the approach we decided on.", false],
  ['Done! All tests pass now.', false],
  ['The build failed because of a missing import.', false],
  ['Maybe we should use Postgres for this.', false],
  ['I think the database might be the bottleneck.', false],
  ["Now I'll run the migration script.", false],
  ['Running pnpm install to fix the lockfile.', false],
  ['I added a test for the auth route.', false],
  ['These changes use the existing helper.', false],
  ['Currently trying a different database driver.', false],
  ['Should I switch the project to ESM?', false],
  ['I ran the backend tests and they passed.', false],
  ['Thanks, that looks great.', false],
  ["It's probably configured in the deploy script.", false],
  ['The project might use Docker, not sure.', false],
  ["I don't know why the frontend build is slow.", false],
];

test('capture keeps durable facts and drops agent narration (precision/recall)', () => {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  const mistakes: string[] = [];
  for (const [sentence, durable] of LABELLED) {
    const captured = extractActivityFacts(sentence).length > 0;
    if (captured && durable) truePositive++;
    else if (captured) {
      falsePositive++;
      mistakes.push(`kept: ${sentence}`);
    } else if (durable) {
      falseNegative++;
      mistakes.push(`missed: ${sentence}`);
    }
  }
  const precision = truePositive / (truePositive + falsePositive || 1);
  const recall = truePositive / (truePositive + falseNegative || 1);
  console.log(
    `capture eval: precision ${precision.toFixed(2)} recall ${recall.toFixed(2)} (${LABELLED.length} labelled)`,
  );
  assert.ok(precision >= 0.9, `precision ${precision.toFixed(2)} < 0.90\n${mistakes.join('\n')}`);
  assert.ok(recall >= 0.85, `recall ${recall.toFixed(2)} < 0.85\n${mistakes.join('\n')}`);
});

/* Held out: written before the rules were tuned and never used to tune
   them. Thresholds sit just under the measured result so a regression
   fails, without pretending the rules generalize better than they do.
   The original rules scored precision 0.71 / recall 0.50 here. */
const HELD_OUT: Array<[string, boolean]> = [
  ['Payments are processed through Stripe webhooks, never polled.', true],
  ['We picked Drizzle ORM over Prisma for type-safe queries.', true],
  ['Feature flags are managed in LaunchDarkly.', true],
  ['Every pull request requires one approving review.', true],
  ['I prefer small commits with descriptive messages.', true],
  ['The mobile app is built with React Native and Expo.', true],
  ['Logs are shipped to Datadog from all services.', true],
  ['Background jobs run on BullMQ backed by Redis.', true],
  ['Do not import server modules from client components.', true],
  ['We standardized on Zod for request validation.', true],
  ['Great, the migration ran cleanly.', false],
  ['I fixed the typo in the README.', false],
  ['Hmm, the database connection seems flaky.', false],
  ['Would it be better to use GraphQL here?', false],
  ['This should work now.', false],
  ['I will open a PR once the tests pass.', false],
  ['The error happens because the env var is missing.', false],
  ['As mentioned earlier, the frontend needs a rebuild.', false],
  ['We might switch to Bun at some point.', false],
  ['Pushing the branch now so CI can run.', false],
];

test('held-out capture set does not regress', () => {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const [sentence, durable] of HELD_OUT) {
    const captured = extractActivityFacts(sentence).length > 0;
    if (captured && durable) truePositive++;
    else if (captured) falsePositive++;
    else if (durable) falseNegative++;
  }
  const precision = truePositive / (truePositive + falsePositive || 1);
  const recall = truePositive / (truePositive + falseNegative || 1);
  console.log(`held-out capture: precision ${precision.toFixed(2)} recall ${recall.toFixed(2)}`);
  assert.ok(precision >= 0.85, `held-out precision ${precision.toFixed(2)} < 0.85`);
  assert.ok(recall >= 0.6, `held-out recall ${recall.toFixed(2)} < 0.60`);
});
