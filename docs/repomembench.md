# RepoMemBench

RepoMemBench is Brainfeather's deterministic evaluation suite for repository memory.
It measures the memory engine without an LLM judge, external API, vector provider, or
database, so every pull request can replay exactly the same scenarios.

## v0.1 scope

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
- branch isolation as an explicit unsupported capability.

Run it with:

```bash
npm run bench:repo-memory
```

The command prints a JSON report and exits non-zero when the frozen baseline
regresses. Override latency repetitions with `REPOMEMBENCH_ITERATIONS`.

The machine-readable baseline is stored at
`benchmarks/baselines/brainfeather-1.5.2.json`. It separates protected metrics
from explicit improvement targets, so known gaps stay visible without weakening
regression protection.

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

## Why branch isolation is a measured gap

Brainfeather 1.5.2 scopes memories to repositories. A main-branch Drizzle decision
and a feature-branch Prisma experiment therefore compete in the same candidate set.
RepoMemBench reports wrong-branch recall separately from top-result accuracy, but
does not fail CI on the unsupported isolation target yet. Phase 1 will add branch
overlays and change the target to zero leakage.

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
