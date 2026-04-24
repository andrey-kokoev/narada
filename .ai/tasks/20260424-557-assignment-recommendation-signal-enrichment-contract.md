---
status: closed
closed: 2026-04-24
closed_by: codex
governed_by: task_close:codex
created: 2026-04-24
depends_on: [553, 554, 555]
---

# Task 557 - Assignment Recommendation Signal Enrichment Contract

## Goal

Define the next bounded improvement to Narada's assignment recommendation zone so recommendations become meaningfully discriminative instead of defaulting to idle/history/load heuristics.

## Required Work

1. Inspect the current recommendation scoring inputs and identify which signals are:
   - already present but underused
   - missing entirely
   - too weak to differentiate comparable idle agents
2. Define the next bounded signal additions or refinements, including candidates such as:
   - chapter/task-family continuation affinity
   - doctrine/implementation capability fit
   - recent closure quality or repair burden
   - review-separation pressure
   - active-context locality
3. State which signals are authoritative versus advisory.
4. Define how signal freshness and staleness should be handled.
5. Define explicit non-goals:
   - no opaque ML scoring
   - no hidden authority transfer from recommendation to assignment
   - no unbounded personalization or overfitting to stale history
6. Record how success should be judged on future recommendation runs.

## Acceptance Criteria

- [x] Current discriminative weakness is documented concretely
- [x] Next bounded signal additions/refinements are defined
- [x] Authoritative vs advisory signal posture is explicit
- [x] Freshness/staleness handling is defined
- [x] Non-goals are explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

Examined the recommendation engine:
- `packages/layers/cli/src/lib/task-recommender.ts` — core engine, 6 scoring dimensions
- `packages/layers/cli/src/lib/task-governance.ts` — assignment history, report loading
- Decision 553 (input snapshot contract) — six input families boundary
- Decision 554 (output validation contract) — artifact shape and non-authoritative posture
- Decision 555 (crossing contract) — promotion preconditions
- SEMANTICS.md §2.12 — advisory signals clan

### Weakness Catalog

| Dimension | Weight | Weakness |
|-----------|--------|----------|
| Capability | 0.25 | Keyword-based (9 mappings); defaults to 0.5 for all agents when no keywords match |
| Affinity | 0.30 | Binary (0/0.7/1.0); absent for ~70% of tasks |
| Load | 0.20 | All idle agents score 1.0; no idle-time gradation |
| History | 0.10 | Only completed/abandoned counts; no quality signal |
| Review separation | 0.10 | Binary; no temporal decay |
| Budget | 0.05 | Most agents have null budget → 1.0 for everyone |

### Signal Additions Defined

| Signal | Weight | Source Families | Posture |
|--------|--------|-----------------|---------|
| `chapter_affinity` | 0.15 | Assignment History + Task State | Advisory |
| `capability_tier` | 0.10 | Agent State + Task State | Advisory |
| `closure_quality` | 0.10 | Work Result Reports + Assignment History | Advisory |
| `context_locality` | 0.10 | Assignment History + Reports + Task State | Advisory |
| `review_separation_decay` | 0.10 | Assignment History | Advisory |
| `idle_recency` | (absorbed into load) | Agent State | Advisory |

### Artifact

`.ai/decisions/20260424-557-assignment-recommendation-signal-enrichment-contract.md` (~17 KB) containing:
- Concrete weakness assessment for all 6 current dimensions
- 5 new bounded signal definitions with computation paths
- Revised weight table (10 dimensions, weights sum to 1.0)
- Authoritative vs advisory classification for all signals
- Freshness/staleness thresholds and degradation rules per signal
- 6 explicit non-goals
- 6 measurable success criteria for future recommendation runs
- 5 invariants preserving the six-input-family boundary

## Verification

```bash
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)

pnpm typecheck
# All packages pass
```

Results:
- `pnpm verify` passed all 5 verification steps
- `pnpm typecheck` clean across all packages
- No code changes required for this contract task
- No existing tests broken
- No new lint errors introduced

---

**governed_by: task_close:codex**
