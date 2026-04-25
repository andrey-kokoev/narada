---
status: closed
governed_by: task_review:a3
closed_at: 2026-04-25T04:26:37.582Z
closed_by: a3
---

# Repair Chapter Range Closure Artifact Filtering

## Chapter

Ops Zone Completion Follow-up

## Goal

Ensure range-based chapter closure ignores chapter range artifacts and only closes executable child tasks.

## Context

While closing chapter `644-649`, `narada chapter close 644-649 --start` failed because `scanTasksByRange()` included the chapter range artifact `20260425-644-649-ops-zone-completion.md` as a non-terminal child task. Range closure should operate on executable child tasks only; chapter range files are planning artifacts.

## Required Work

1. Update range task scanning to ignore non-executable files, including chapter range artifacts.
2. Add a regression test proving range closure ignores the range artifact itself.
3. Repair stale chapter-close review test setup so it uses SQLite-backed reviews.
4. Verify focused chapter-close tests and CLI build.
5. Confirm chapter `644-649` can start and finish closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Updated `packages/layers/cli/src/lib/task-governance.ts` so `scanTasksByRange()` skips files rejected by `isExecutableTaskFile()`.
2. Added a range closure regression test in `packages/layers/cli/test/commands/chapter-close.test.ts` where a `100-101` range artifact remains opened while executable child tasks are closed; closure start succeeds and reports two child tasks.
3. Updated the legacy review-findings test to seed reviews through SQLite-backed `saveReview()` and seed the required lifecycle row, matching the current review authority.
4. Verified that chapter `644-649` closure start and finish now succeed.

## Verification

| Command | Result |
| --- | --- |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/chapter-close.test.ts --pool=forks"` | Passed, 17/17 tests |
| `pnpm --filter @narada2/cli build` | Passed |
| `narada chapter close 644-649 --start --by a2` | Passed |
| `narada chapter close 644-649 --finish --by a2` | Passed |

## Acceptance Criteria

- [x] Range chapter closure ignores the range artifact itself
- [x] Focused chapter-close tests cover the regression
- [x] CLI package build passes
- [x] Chapter closure can start and finish for 644-649



