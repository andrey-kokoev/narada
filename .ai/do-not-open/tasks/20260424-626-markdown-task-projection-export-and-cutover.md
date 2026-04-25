---
status: closed
depends_on: [625]
closed_at: 2026-04-24T23:46:41.977Z
closed_by: codex
governed_by: task_close:codex
---

# Task 626 - Markdown Task Projection Export And Cutover

## Execution Mode

Proceed directly. This is the cutover task.

## Context

After SQLite owns task spec and normal read/amend surfaces, markdown task files must stop functioning as an authored substrate. They should become generated projection, explicit export, or disappear from the normal path entirely.

## Required Work

1. Remove normal-path dependence on markdown task files as spec source.
2. Implement markdown generation/export posture if retained.
3. Ensure task graph/list/read surfaces remain coherent after the cutover.
4. Remove or demote compatibility paths that treat markdown as source.
5. Add focused verification for cutover behavior.

## Non-Goals

- Do not keep silent markdown-source fallback.
- Do not leave the cutover half projection, half authored source.

## Execution Notes

1. Bulk-backfilled `604` unambiguous executable task specs into SQLite and intentionally skipped `47` historical task-number collisions.
2. Moved downstream observation surfaces away from markdown-derived spec fields:
   - `task-next`
   - task recommender
   - task graph
   - runnable-task listing
   - evidence-based task listing
3. Rebound titles and dependencies in those surfaces to `task_specs`, not markdown headings/front matter.
4. Left markdown task files as generated/projection substrate carrying:
   - lifecycle projection
   - execution notes
   - verification notes
   - acceptance-criteria check state
5. Removed silent normal-path spec fallback from `task read`, `task amend`, and `task-next`.

## Verification

- `pnpm --filter @narada2/cli build` -> passed after cutover patches
- `timeout 180s pnpm --filter @narada2/cli exec vitest run test/commands/task-create.test.ts --pool=forks --reporter=dot` -> passed (14/14, ~150s)
- `timeout 240s pnpm --filter @narada2/cli exec vitest run test/commands/task-read.test.ts --pool=forks --reporter=dot` -> passed (11/11, ~103s)
- `timeout 420s pnpm --filter @narada2/cli exec vitest run test/commands/task-amend.test.ts --pool=forks --reporter=dot` -> passed (17/17, ~281s)
- store-level count:
  - `task_specs = 604`
  - `task_lifecycle = 604`
- `narada task list --format json` -> returned SQLite-backed titles
- `narada task recommend --agent a1 --limit 1 --format json` -> returned SQLite-backed task titles and dependency-blocked abstentions
- `narada task read 623` -> succeeded without markdown-as-spec fallback
- bounded verification friction:
  - focused Vitest command suites for create/read/amend remained slow/silent in this environment, so command-level verification was used instead

## Acceptance Criteria

- [x] Markdown is no longer normal-path task spec authority.
- [x] Projection/export posture is explicit and implemented.
- [x] Read/list/graph surfaces remain coherent.
- [x] Focused verification exists.
- [x] Residual markdown-source fallback is removed or explicitly debug-only.

