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
