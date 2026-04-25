---
status: closed
governed_by: task_review:a3
closed_at: 2026-04-25T04:07:17.326Z
closed_by: a3
---

# Optimize Task Recommend Focused Test Runtime

## Chapter

Agent Self Cycle Rough Surfaces Follow-up

## Goal

Reduce task-recommend.test.ts runtime after SQLite-authority repair so the full focused file is comfortably fast, not merely passing.

## Context

`task-recommend.test.ts` was passing but too slow for routine focused verification because every test rebuilt the same temporary Narada repo and SQLite lifecycle store from scratch. The optimization must stay test-local: no production shortcuts, no weakening recommendation behavior, and no removal of meaningful cases.

## Required Work

1. Identify the test-only setup bottleneck in `task-recommend.test.ts`.
2. Replace repeated expensive setup with an equivalent reusable fixture pattern.
3. Preserve per-test isolation so mutating tests cannot leak state.
4. Keep all existing assertions and recommendation behavior intact.
5. Verify the full focused test file through TIZ.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Changed `packages/layers/cli/test/commands/task-recommend.test.ts` to create one baseline temporary repo in `beforeAll()`.
2. Each test now copies the closed baseline fixture into its own temp directory in `beforeEach()`, preserving isolation while avoiding repeated SQLite schema creation and fixture seeding.
3. Kept existing test cases and assertions intact.
4. Removed no production logic and changed no recommendation scoring/runtime behavior.

## Verification

| Command | Result |
| --- | --- |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts --pool=forks"` | Passed, 33/33 tests, about 13 seconds |
| `pnpm --filter @narada2/cli build` | Passed |

Observed improvement: previous full focused file runtime was about 126 seconds; after fixture baseline/copy, it is about 13 seconds.

## Acceptance Criteria

- [x] Full focused `task-recommend.test.ts` runtime is comfortably below the prior slow path.
- [x] All existing task recommendation tests still pass.
- [x] Per-test isolation is preserved by copying a closed baseline fixture per test.
- [x] No production behavior changes are made solely for test speed.



