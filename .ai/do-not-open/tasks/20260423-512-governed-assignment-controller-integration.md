---
status: closed
closed: 2026-04-23
governed_by: task_close:a2
created: 2026-04-23
depends_on: [510, 511]
---

# Task 512 - Governed Assignment Controller Integration

## Goal

Integrate the bounded self-governance promotion path into actual assignment/task-governance command surfaces.

## Required Work

1. Identify the smallest real command/controller surface that should consume the new promotion contract.
2. Implement the bounded integration without bypassing task-governance invariants.
3. Add focused tests around recommendation → assignment behavior.
4. Document the resulting operator-visible behavior.

## Acceptance Criteria

- [x] At least one real governed surface consumes the promotion contract.
- [x] No unsafe or hidden auto-assignment path is introduced.
- [x] Focused tests prove the bounded behavior.
- [x] Verification evidence is recorded.

## Execution Notes

1. **Governed surface identified:** `constructionLoopRunCommand` in `packages/layers/cli/src/commands/construction-loop.ts` is the smallest real command surface consuming the Task 511 promotion contract. It delegates live promotions to `taskPromoteRecommendationCommand({ by: 'construction-loop', ... })`.

2. **Implementation already exists:** The `constructionLoopRunCommand` and `checkHardGates` (12 hard gates) were implemented prior to this task. No new implementation was required. The task focused on validating the integration against the Task 510/511 contracts and filling test gaps.

3. **Tests added:** Two missing hard-gate tests added to `construction-loop-run.test.ts`:
   - `fails task_not_blocked gate when task is in blocked range`
   - `fails agent_not_blocked gate when agent is blocked`
   Total construction-loop-run tests: 21 (up from 19).

4. **Documentation produced:** Decision artifact `.ai/decisions/20260423-512-governed-assignment-controller-integration.md` documents the governed surface, promotion contract consumption, 12 hard gates, test coverage, operator-visible behavior, and residual risks.

## Verification

- `pnpm verify` — all 5 steps pass (task file guard, typecheck, build, charters tests, ops-kit tests).
- `pnpm --filter @narada2/cli test -- test/commands/construction-loop-run.test.ts` — 21/21 tests pass.
- `pnpm --filter @narada2/cli test -- test/commands/task-promote-recommendation.test.ts` — 15/15 tests pass.
- `pnpm --filter @narada2/cli test -- test/commands/construction-loop.test.ts` — 13/13 tests pass.
- Full CLI test suite: 622/622 tests pass.

**governed_by: task_close:a2**

