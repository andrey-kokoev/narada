---
status: closed
closed_at: 2026-04-24T23:55:44.772Z
closed_by: codex
governed_by: task_close:codex
---

# Settle historical duplicate task-number collisions after SQLite spec cutover

## Goal

Resolve or quarantine pre-existing duplicate task numbers so graph, list, and recommendation surfaces stop presenting duplicate logical tasks.

## Context

Historical task-number collisions remained on disk from earlier planning eras. After SQLite task-spec authority was introduced, those collisions still smeared operator-facing surfaces:
- `task recommend` could surface multiple logical tasks for one task number
- `task list` could repeat the same logical task number
- `task graph` could render duplicate executable nodes for one task number

The cutover posture for this task is:
- use one canonical executable owner per task number when a winner can be derived from SQLite authority
- quarantine unresolved conflicts from executable operator surfaces instead of guessing

## Required Work

1. Introduce canonical executable task-number ownership resolution.
2. Apply ownership/quarantine filtering to operator-facing executable surfaces.
3. Remove any stale assignment-history file-path dependence uncovered while fixing those surfaces.
4. Record any residual blockers explicitly.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added `resolveExecutableTaskNumberOwnership()` to [packages/layers/cli/src/lib/task-governance.ts](/home/andrey/src/narada/packages/layers/cli/src/lib/task-governance.ts).
It scans executable task files, groups them by task number, and derives a canonical owner from SQLite authority:
- prefer `task_specs.task_id`
- otherwise prefer `task_lifecycle.task_id`
- otherwise mark the number as conflicted and quarantine it

2. Applied that ownership/quarantine filter to executable task scans in:
- [packages/layers/cli/src/lib/task-governance.ts](/home/andrey/src/narada/packages/layers/cli/src/lib/task-governance.ts)
  - `findTaskFile()`
  - `scanTasksByChapter()`
  - `scanTasksByRange()`
  - `listEvidenceBasedTasks()`
  - `listRunnableTasks()`
- [packages/layers/cli/src/lib/task-projection.ts](/home/andrey/src/narada/packages/layers/cli/src/lib/task-projection.ts)
  - `listRunnableTasksWithProjection()`
- [packages/layers/cli/src/lib/task-graph.ts](/home/andrey/src/narada/packages/layers/cli/src/lib/task-graph.ts)
  - `readTaskGraph()`
- [packages/layers/cli/src/lib/task-recommender.ts](/home/andrey/src/narada/packages/layers/cli/src/lib/task-recommender.ts)
  - `generateRecommendations()`

3. While fixing recommender leakage, replaced a stale deleted-file assignment-history path with SQLite `task_assignments` reads in [task-recommender.ts](/home/andrey/src/narada/packages/layers/cli/src/lib/task-recommender.ts).
Warm-context history, completion counts, last-worker tracking, and active-assignment write-set risk now read from SQLite rows instead of filesystem assignment JSON.

4. The settlement posture is intentionally conservative:
- canonical owner when SQLite authority can identify one
- otherwise omit the conflicted executable number from runnable/recommendation/graph/list surfaces
- do not guess a winner from file ordering or date ordering

## Verification

1. `pnpm --filter @narada2/cli build`
- passed

2. `narada task graph --format json --range 1-25`
- returned `Task Graph (25 nodes, 0 edges)`
- known historical collision numbers in that span now render once each:
  - `3`
  - `20`
  - `21`

3. `python3` count checks over `narada task recommend --agent a1 --limit 3 --format json`
- `task_number: 3` count = `1`
- `task_number: 20` count = `1`
- `task_number: 21` count = `1`

4. `python3` count checks over `narada task list --format json`
- `task_number: 3` count = `1`
- `task_number: 20` count = `1`
- `task_number: 21` count = `1`

5. `narada task graph --format json --range 619-628`
- returned a clean non-duplicated local frontier around the new migration tasks

6. Residual blocker posture
- historical duplicate-number files still exist on disk
- they are now quarantined from operator-facing executable surfaces unless SQLite authority identifies a canonical owner
- no guessed renumbering or destructive file rewrite was done here

## Acceptance Criteria

- [x] Historical duplicate executable task numbers are either resolved to one canonical owner or quarantined from executable operator surfaces.
- [x] `task recommend`, `task list`, and `task graph` no longer present duplicate logical executable tasks for known collided numbers.
- [x] Any residual blocker or non-goal is recorded explicitly rather than guessed through silent renumbering.

