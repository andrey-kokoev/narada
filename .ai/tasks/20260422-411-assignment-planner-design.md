---
status: confirmed
closed: 2026-04-22
depends_on: [410]
---

## Chapter

Construction Operation

# Task 411 — Assignment Planner / Dispatcher Design

## Assignment

Design the assignment recommendation algorithm that consumes task graph, roster, principal state, dependencies, capabilities, affinity, review separation, and write-set risk to produce ranked assignment recommendations.

## Required Reading

- `.ai/decisions/20260422-408-construction-operation-readiness.md`
- `.ai/decisions/20260422-410-construction-operation-boundary-contract.md`
- `packages/layers/cli/src/lib/task-governance.ts`
- `packages/layers/cli/src/commands/task-list.ts`
- `.ai/decisions/20260422-406-principal-runtime-state-machine.md`

## Context

Currently, `narada task list` shows runnable tasks sorted by continuation affinity. The operator manually decides which agent claims which task. The assignment planner should produce a recommendation that the operator can accept, modify, or veto.

The recommendation must be:
- **Advisory** — it does not auto-claim.
- **Auditable** — every recommendation is recorded with rationale.
- **Bounded** — it only recommends from runnable tasks to available principals.

## Concrete Deliverables

1. Decision artifact at `.ai/decisions/20260422-411-assignment-planner-design.md` containing:
   - Input model (what data the planner consumes)
   - Scoring function (how candidate assignments are ranked)
   - Output model (recommendation record schema)
   - Algorithm pseudocode or flow
   - Rationale format (why each recommendation was made)
   - Confidence levels and when to abstain
   - CLI surface design (`narada task recommend` or equivalent)

2. Recommendation record schema definition (JSON shape).

## Explicit Non-Goals

- Do not implement the planner code.
- Do not auto-claim tasks.
- Do not mutate roster or assignment records.
- Do not replace the human operator.
- Do not design cost estimation (deferred).

## Acceptance Criteria

- [x] Decision artifact exists.
- [x] Scoring function is defined with explicit weights or heuristics.
- [x] Output model includes recommendation_id, rationale, confidence, and alternative candidates.
- [x] Algorithm handles the case where no suitable principal exists (abstain).
- [x] Algorithm respects dependency constraints.
- [x] Algorithm respects review separation (does not recommend worker as reviewer).
- [x] No implementation code is added.

## Verification Scope

Review by operator or architect. No automated tests required.

## Execution Notes

### Write Set

- `.ai/decisions/20260422-411-assignment-planner-design.md` — new decision artifact

### Content Summary

The design defines a complete advisory assignment recommendation system:

1. **Input model**: Five input domains — Task Graph, Agent Roster, PrincipalRuntime State, Assignment History, Review Records — all read-only.
2. **Scoring function**: Weighted sum of 6 dimensions (affinity 0.30, capability 0.25, load 0.20, history 0.10, review separation 0.10, budget 0.05). Each dimension has explicit pseudocode.
3. **Output model**: `AssignmentRecommendation` with `primary`, `alternatives`, `abstained`, per-dimension `breakdown`, and human-readable `rationale`.
4. **Algorithm**: 8-step flow — load tasks, load principals, load history, score pairs, resolve conflicts greedily, classify confidence, build abstained list, record recommendation.
5. **Abstain conditions**: 6 explicit conditions (no runnable tasks, no available principals, no capability match, all principals busy, all budgets exhausted, preferred principal unavailable).
6. **Rationale format**: Structured human-readable strings with capability summary, affinity clause, load clause, history clause, and caveat clause.
7. **Confidence levels**: High (score ≥ 0.8, gap ≥ 0.2), Medium (score ≥ 0.5), Low (score < 0.5).
8. **CLI surface**: `narada task recommend` with `--task`, `--agent`, `--weights`, `--dry-run`; extension to `narada task claim --recommendation-id` for audit trail.

### Residuals

- Capability heuristic refinement → Task 414 fixture
- Weight tuning → Task 414 fixture
- Write-set overlap scoring → Task 413 design
- Cost estimation → Post-415 chapter
- `--explain` debugging surface → Future enhancement

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
