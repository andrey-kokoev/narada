---
status: confirmed
closed: 2026-04-22
depends_on: [411, 412, 413]
---

## Chapter

Construction Operation

# Task 414 — Construction Operation Fixture

## Assignment

Build a fixture that proves the assignment recommendation and review-separation designs work under realistic task-graph conditions.

## Required Reading

- `.ai/decisions/20260422-411-assignment-planner-design.md`
- `.ai/decisions/20260422-412-principal-runtime-integration-contract.md`
- `.ai/decisions/20260422-413-review-separation-write-set-conflict.md`
- `packages/layers/cli/src/lib/task-governance.ts`

## Context

A fixture is a synthetic but realistic scenario that exercises the designed surfaces without requiring full implementation. It proves that the recommendation algorithm, integration contract, and conflict detection are coherent and useful.

## Concrete Deliverables

1. Fixture implementation in `packages/layers/cli/test/fixtures/construction-operation/` containing:
   - Synthetic task graph (≥10 tasks, with dependencies, varying capabilities, write-sets)
   - Synthetic roster (≥3 agents with different capabilities)
   - Synthetic PrincipalRuntime states
   - Recommendation engine test harness (implements the designed algorithm)
   - Test cases:
     - Basic recommendation: task with matching capability gets ranked highest
     - Affinity routing: continuation task prefers warm agent
     - Dependency blocking: task with unmet dependencies is not recommended
     - Review separation: reviewer==worker is detected and warned
     - Write-set conflict: overlapping assignments are detected
     - Budget exhaustion: principal with depleted budget is not recommended
     - No suitable agent: planner abstains gracefully

2. Fixture report showing:
   - Top-1 accuracy (recommendation matches ideal assignment)
   - Top-3 accuracy
   - False positive rate for conflict detection
   - Coverage of edge cases

## Explicit Non-Goals

- Do not implement production assignment planner (this is a fixture/prototype).
- Do not modify production task governance code.
- Do not create real assignments or roster entries.
- Do not require external services (API keys, git remotes).

## Acceptance Criteria

- [x] Fixture exists and runs with `pnpm test`.
- [x] All 7 test cases pass.
- [x] Top-3 accuracy ≥ 80%.
- [x] Review-separation detection has 0 false negatives.
- [x] Write-set conflict detection has 0 false negatives.
- [x] Fixture is isolated (no mutations to production stores).

## Verification Scope

Run fixture tests with `pnpm test:cli` or `pnpm test`.

## Execution Notes

### Write Set

- `packages/layers/cli/test/fixtures/construction-operation/engine.ts` — recommendation engine, review-separation check, write-set conflict detection
- `packages/layers/cli/test/fixtures/construction-operation/types.ts` — fixture-specific types
- `packages/layers/cli/test/commands/construction-operation.test.ts` — 10 test cases (7 required + 3 supplementary)

### Fixture Structure

**Synthetic data:**
- 10 tasks with varying capabilities, dependencies, and affinity
- 4 agents with distinct capability profiles
- 4 PrincipalRuntime states (1 budget-exhausted for exclusion testing)
- 5 historical assignments (for history/affinity scoring)
- 10 write-set manifests (2 overlapping for conflict detection)

**Engine implements:**
- 6-dimension scoring function (affinity, capability, load, history, review separation, budget)
- Greedy conflict resolution
- Confidence classification (high/medium/low)
- Abstain logic
- Review-separation check (0 false negatives verified)
- Write-set conflict detection (0 false negatives verified)
- Fixture report generation (top-1, top-3 accuracy, false positive rate)

### Test Results

```
pnpm --filter @narada2/cli exec vitest run test/commands/construction-operation.test.ts
✓ 10 tests passed
```

Full CLI suite: 235/235 tests pass.

### Metrics

- Top-3 accuracy: ≥ 80% (fixture report test enforces this)
- Review-separation: 0 false negatives (4 edge cases tested)
- Write-set conflict: 0 false negatives (3 scenarios tested)
- Fixture is fully isolated: uses `mkdtempSync` temp directories, no production store mutations

### Residuals

- Capability extraction heuristic refinement → Future telemetry task
- Weight tuning → Future telemetry task
- Cost estimation integration → Post-415 chapter

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
