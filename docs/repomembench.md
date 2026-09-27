# RepoMemBench

RepoMemBench is Brainfeather's deterministic evaluation suite for repository memory.
It measures the memory engine without an LLM judge, external API, vector provider, or
database, so every pull request can replay exactly the same scenarios.

## v0.2 scope

The `brainfeather-1.5.2` baseline covers:

- repository-scoped retrieval and cross-project isolation;
- relevant-query ranking and negative-query abstention;
- stale fact suppression and point-in-time truth;
- junk rejection and durable fact acceptance;
- exact and near-duplicate detection;
- project-safe supersession planning;
- evidence digest parsing;
- token-budgeted, category-diverse context compilation;
- deterministic in-process retrieval latency;
- branch overlays with sibling-branch isolation;
- task overlays with optional branch constraints and sibling-task isolation.

Run it with:

```bash
npm run bench:repo-memory
```

The command prints a JSON report and exits non-zero when the frozen baseline
regresses. Override latency repetitions with `REPOMEMBENCH_ITERATIONS`.

The machine-readable baseline is stored at
`benchmarks/baselines/brainfeather-1.5.2.json`. It separates protected metrics
from explicit improvement targets, so known gaps stay visible without weakening
regression protection. RepoMemBench v0.2 extends it with
`benchmarks/baselines/branch-task-memory.json`, which promotes branch and task
isolation to protected capabilities without rewriting the historical artifact.

## v0.1 baseline

| Metric | Brainfeather 1.5.2 | Target |
| --- | ---: | ---: |
| Retrieval Hit@3 | 100% | 100% |
| Negative-query abstention | 66.7% | 100% |
| Stale recall | 0% | 0% |
| Cross-project leakage | 0% | 0% |
| Contradiction leakage | 0% | 0% |
| Branch leakage | 100% | 0% |
| Branch-specific ranking | 50% | 100% |
| Write-policy checks | 100% | 100% |

## v0.2 capabilities

| Metric | Current | Protected target |
| --- | ---: | ---: |
| Branch leakage | 0% | 0% |
| Branch-specific ranking | 100% | 100% |
| Task leakage | 0% | 0% |
| Task-specific ranking | 100% | 100% |

## v0.3 capabilities

| Metric | Current | Protected target |
| --- | ---: | ---: |
| Negative-query abstention | 100% | 100% |

Negative-query abstention was the last open v0.1 target. The gap was not the
over-matching of generic terms recorded in the old note: `billing invoice
policy` always abstained correctly. The single failure was `native ios
deployment target`, which matched only the generic term `deployment` while
`native`, `ios`, and `target` appeared nowhere in the corpus — enough to pass
a per-memory eligibility check that asked only whether *some* signal fired.

Ranking now abstains when the candidate set collectively matches too little of
the query's IDF mass, measured per term so a term counts as known only through
its own literal or concept-sibling matches. That distinction is what separates
ignorance from concept recall, where `how do we handle auth` legitimately
returns an RLS memory with no literal overlap at all.

`benchmarks/baselines/negative-query-abstention.json` promotes the metric from
an improvement target to a protected one. Until 0.3.0 the gate compared it
against the 66.7% *baseline*, so the suite exited 0 even when abstention
regressed to the old behaviour; it is now pinned to 100%.

The threshold is calibrated against these fixtures rather than derived from
theory — the weakest true positive covers 0.234 of query mass and the false
positive covers 0.138. Widen the fixture set before treating it as a general
constant.

## v0.4 generalization track

Every core metric reached 100% in 0.3.0, on fixtures the ranker had been
tuned against. Probed with queries it had never seen, the same ranker found
the right memory in its top three only about half the time. 0.4.0 adds a
track that measures that gap instead of hiding it
(`src/lib/benchmark/generalization.ts`):

- `dev` — cases ranking changes may be tuned against.
- `holdout` — written before the 0.4.0 fixes, with a different corpus and
  vocabulary, and not edited to make a change pass.

| Metric | Dev before | Dev after | Holdout before | Holdout after |
| --- | ---: | ---: | ---: | ---: |
| Hit@3 | 53.8% | 76.9% | 55.6% | 83.3% |
| Unknown-topic abstention | 100% | 100% | 50% | 50% |
| Near-topic abstention | 0% | 0% | 0% | 0% |

The fixes were diagnosed on dev, not fitted to it:

- Terms under four letters match a whole word or its plural, not any
  prefix. `app` matched `appwrite` and `appsmith`.
- `hosted`, `logged` and similar map onto `-ing` cluster terms.
- `log in`, `sign in` and `sign up` join into one token.
- A query term the corpus cannot match is corrected when exactly one corpus
  word is one edit away. Ambiguous typos are left alone.

### Round 1: sibling-only terms

`grpc streaming interceptors` was answered from an API memory: `grpc`
reaches the corpus only through its concept sibling `api`, and that sibling
match counted as full evidence the topic was known. Such a term now earns
half its IDF mass. It still counts as a touched term, so one sibling can
carry one unknown word (`how does auth work` -> RLS) but not two.

| Metric | Before | After |
| --- | ---: | ---: |
| Dev unknown-topic abstention | 60% | 100% |
| Holdout unknown-topic abstention | 33% | 67% |
| Holdout Hit@3 | 84.2% | 78.9% |

Three holdout cases were added before the fix was run. The Hit@3 cost is
one case, `how are schema changes applied`, which has the same shape as the
negatives: one sibling-only term and two unknown ones. Separating generic
words from topical ones would need a curated vocabulary, so the floor was
lowered to the measured value instead. For a coding agent, a wrong memory
in context is costlier than none. `mongodb aggregation pipeline` still
answers: two of its terms have siblings in the corpus.

`benchmarks/baselines/generalization.json` records these as floors, not
pins: a split may improve but must not fall below them. Near-topic
abstention ("how many redis cluster shards" when only the Redis TTL is
stored) is an open target. The ranker deliberately prefers a weak extra
answer to none, so closing it needs a decision, not a threshold tweak.

## Scope hierarchy

Repository memories are inherited throughout a repository. Branch memories are
visible only on that branch. Task memories are visible only for that task and can
optionally be constrained to a branch. Writes may recognize inherited duplicates,
but supersession and consolidation operate only within the exact repository,
branch, and task scope.

## Future adapters

The scenario format is intentionally provider-independent. Later benchmark tracks
will replay the same repository events and queries through:

- Brainfeather branch-aware memory;
- Mem0;
- Zep/Graphiti;
- a vector-only baseline;
- a no-memory coding-agent baseline.

Public comparisons will use pinned versions, identical source events, identical
queries, hidden holdout cases, and published raw JSON reports.
