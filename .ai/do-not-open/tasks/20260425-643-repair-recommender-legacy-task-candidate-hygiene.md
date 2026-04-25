---
status: closed
governed_by: task_review:a3
closed_at: 2026-04-25T04:10:04.372Z
closed_by: a3
---

# Repair Recommender Legacy Task Candidate Hygiene

## Chapter

Agent Self Cycle Rough Surfaces Follow-up

## Goal

Prevent task recommendation from surfacing obsolete legacy task artifacts ahead of governed current work.

## Context

After tasks 640-642 closed, `task recommend --agent a2 --limit 5` returned legacy low-number planning notes such as task 1 as primary work. Those files predate canonical task front matter and should not be treated as executable current work merely because SQLite contains legacy lifecycle/spec rows. The recommender must prefer governed task artifacts and abstain cleanly when no current runnable work exists.

## Required Work

1. Prevent recommendation candidates from including markdown files that lack canonical task front matter.
2. Keep blocked canonical tasks visible in the abstained list with bounded output.
3. Add a focused test for a legacy no-front-matter markdown file that has an opened SQLite lifecycle/spec row.
4. Verify live recommendation no longer promotes legacy task 1.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Updated `packages/layers/cli/src/lib/task-recommender.ts` so candidate loading skips files whose parsed front matter has no `status`.
2. This preserves canonical front-matter tasks such as 403/404 while excluding old planning notes that were not authored as governed task artifacts.
3. Added a regression test in `packages/layers/cli/test/commands/task-recommend.test.ts` where a no-front-matter legacy markdown note has opened SQLite lifecycle/spec rows and is still excluded from primary, alternatives, and abstained output.

## Verification

| Command | Result |
| --- | --- |
| `pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts --pool=forks"` | Passed, 34/34 tests |
| `pnpm --filter @narada2/cli build` | Passed |
| `OUTPUT_FORMAT=json narada task recommend --agent a2 --limit 3` | Returned no primary recommendation; only blocked canonical tasks 403 and 404 in abstained |

## Acceptance Criteria

- [x] Legacy unknown-status tasks are not recommended as primary work
- [x] Recommendation output remains bounded
- [x] Focused task-recommend tests cover legacy candidate exclusion
- [x] No direct task-file deletion is used



