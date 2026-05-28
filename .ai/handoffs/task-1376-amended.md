---
status: claimed
---

# Repair work-next stale review obligation selection

## Goal

Ensure Builder work-next does not select directed review obligations for tasks that are no longer in review.

## Context

During Builder duty-loop execution on 2026-05-16, work-next repeatedly selected stale review_request obligations for terminal tasks 1357 and 1358. Direct task review was rejected because the tasks were already closed, proving the obligation selector was stale rather than actionable work.

## Required Work

Update work-next/task-next directed-obligation selection so review_request obligations are selectable only when the referenced lifecycle task is in_review, add a regression test, rebuild the CLI, and verify live Builder work-next no longer loops on closed tasks.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Updated `packages/layers/cli/src/commands/work-next.ts` and `packages/layers/cli/src/commands/task-next.ts` so directed `review_request` obligations are selectable only when the referenced task lifecycle status is `in_review`. Non-review obligations remain selectable through the existing path.

Added a regression in `packages/layers/cli/test/commands/work-next.test.ts` proving a stale closed-task review obligation does not block normal Builder work-next selection.

Built the CLI after the source change so the live `narada` shim used the repaired selector.

Recorded the handoff report in `.ai/handoffs/task-1376-report.json`.

## Verification

- `pnpm --dir packages/layers/cli test -- test/commands/work-next.test.ts` passed.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `narada task work-next --agent narada.builder --format json` returned `empty` / `no_admissible_task` after rebuild instead of selecting stale closed-task review obligations for 1357 or 1358.

Residual verification note: `pnpm --dir packages/layers/cli test -- test/commands/task-next.test.ts` currently fails 10 broader task-next tests with fixture/expectation drift such as `agent_not_found` versus `agent_not_in_roster` and opened-task selection expectations returning `empty`. That broader suite drift was observed but not repaired in this narrow selector task.

## Acceptance Criteria

- [x] Closed-task review_request obligations are skipped by work-next selection.
- [x] The CLI build used by the live narada shim contains the selector repair.
- [x] A regression test proves stale review obligations do not block normal Builder work-next selection.
- [x] Live Builder work-next returns no stale review obligation for tasks 1357 or 1358.
