---
status: closed
created: 2026-04-23
depends_on: [510]
closed_at: 2026-04-23T20:45:00.000Z
closed_by: a2
governed_by: task_close:a2
---

# Task 511 - Recommendation To Assignment Promotion Contract

## Goal

Turn recommendation-to-assignment into an explicit governed promotion path rather than an implicit human handwave.

## Required Work

1. Define the durable artifacts and preconditions for promotion from recommendation to assignment.
2. State what evidence and authority are required for auto-promotion vs operator confirmation.
3. Reconcile with existing assignment intent, roster, and promotion operators.
4. Record residual risks and unsafe cases that must remain blocked.

## Acceptance Criteria

- [x] Promotion from recommendation to assignment has an explicit contract.
- [x] The contract distinguishes bounded auto-promotion from operator-confirmed promotion.
- [x] Existing task-governance artifacts are mapped against the contract.
- [x] Verification or bounded blocker evidence is recorded.

---

## Execution Notes

### Document Review

Read and analyzed existing promotion surfaces:

1. **`packages/layers/cli/src/commands/task-promote-recommendation.ts`** (505 lines) — Operator-confirmed promotion with 9 validation checks, dry-run, override-risk, audit record writing to `.ai/do-not-open/tasks/tasks/promotions/`.
2. **`packages/layers/cli/src/lib/construction-loop-plan.ts`** — Plan builder that produces promotion candidates with policy-filtered dry-run results but does NOT auto-execute promotions.
3. **`packages/layers/cli/src/lib/task-recommender.ts`** — Recommendation engine producing `TaskRecommendation` with `CandidateAssignment`, `ScoreBreakdown`, `RecommendationReason`, `RecommendationRisk`.
4. **Decision 427** — Governed promotion design with authority classes (`claim` sufficient), object diagram, and state machine.
5. **Decision 468** — Assignment promotion implementation closure documenting `task-promote-recommendation.ts` delivery.
6. **Decision 490** — Task attachment/carriage boundary with intent enum (`primary`, `review`, `repair`, `takeover`).
7. **Decision 510** — Self-governance boundary contract establishing that bounded auto-promotion is the only self-governed mutation.

### Key Finding: Auto-Promotion Is Plan-Only

The construction loop controller (`construction-loop plan`) produces `PromotionCandidate` objects with `dry_run_result` and `blocked_by_policy`, and suggests promotion commands in `suggested_actions`. However, there is **no code path** that automatically calls `taskPromoteRecommendationCommand` with `dryRun: false`. True bounded auto-promotion execution is **not implemented** in v0. This is recorded honestly in the contract.

### Contract Production

Created `.ai/decisions/20260423-511-recommendation-to-assignment-promotion-contract.md` containing:

- **Three-stage pipeline**: Recommendation (advisory) → Promotion Request (durable intent) → Assignment (authoritative)
- **Stage 1 artifact**: `TaskRecommendation` with authority `derive`, self-governed at any level ≥ `recommend`
- **Stage 2 artifact**: `AssignmentPromotionRequest` with 9 validation gates mapped to hard/overrideable/advisory categories
- **Stage 3 artifact**: `TaskAssignmentRecord` with `intent: primary`, authority `claim`, never self-governed
- **Operator-confirmed vs bounded auto-promotion table**: 8 aspects compared (trigger, requested_by, override, audit trail, failure handling)
- **Assignment intent reconciliation**: 4 operators mapped to intents, confirming promotion always produces `primary`
- **Durable artifact chain**: 5-step trace from ephemeral recommendation to roster update
- **6 residual risks**: hard gate override impossibility, auto-promotion override blocking, review separation, chapter boundary crossing, roster race condition, stale recommendation after plan generation
- **Existing surface mapping**: 5 commands mapped to stages, authority, and mutability

## Verification

- Promotion contract exists: `wc -l .ai/decisions/20260423-511-recommendation-to-assignment-promotion-contract.md` → 249 lines.
- Bounded auto-promotion distinguished from operator-confirmed: §Operator-Confirmed vs Bounded Auto-Promotion table has 8 rows.
- Existing artifacts mapped: §Existing Surface Mapping table covers 5 commands; §Durable Artifact Chain shows 5-step trace.
- Residual risks recorded: 6 risks enumerated with mitigation notes.
- `pnpm verify` → all 5 steps pass.
- `pnpm --filter @narada2/cli typecheck` → passes.


