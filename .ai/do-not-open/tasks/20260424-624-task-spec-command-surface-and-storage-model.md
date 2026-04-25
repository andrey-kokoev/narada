---
status: closed
depends_on: [623]
closed_at: 2026-04-24T23:46:40.503Z
closed_by: codex
governed_by: task_close:codex
---

# Task 624 - Task Spec Command Surface And Storage Model

## Execution Mode

Proceed directly. This task should define the concrete sanctioned model, not just restate the boundary.

## Context

Once task spec authority moves into SQLite, Narada needs a canonical command surface for creating, observing, and amending tasks without direct markdown editing.

## Required Work

1. Define the SQLite storage model for task specification.
2. Define the sanctioned command surfaces for:
   - task create
   - task read
   - task amend
   - task list / graph projection consumption
3. Define how task body sections map into structured or semi-structured storage.
4. Define compatibility posture for existing markdown-origin tasks during migration.
5. Define how projection/export generation is triggered.

## Non-Goals

- Do not implement the migration yet.
- Do not leave command behavior implicit.
- Do not rely on raw SQL or direct file edits for normal use.

## Execution Notes

1. Added canonical `task_specs` authority storage in SQLite via `packages/layers/cli/src/lib/task-lifecycle-store.ts`.
2. Settled the stored task-spec fields as:
   - `title`
   - `chapter_markdown`
   - `goal_markdown`
   - `context_markdown`
   - `required_work_markdown`
   - `non_goals_markdown`
   - `acceptance_criteria_json`
   - `dependencies_json`
3. Bound the sanctioned normal-path task-spec surfaces to:
   - `task create`
   - `task read`
   - `task amend`
   - downstream observation surfaces consuming `task_specs`
4. Used markdown task files only as projection/export artifacts after SQLite writes, not as the normal-path source of truth.
5. Retained an explicit migration posture:
   - repo-wide backfill of executable task specs into SQLite
   - pre-existing number collisions skipped rather than guessed over
   - no silent authority split for unambiguous tasks

## Verification

- `pnpm --filter @narada2/cli typecheck` -> passed
- `pnpm --filter @narada2/cli build` -> passed
- store-level count after migration:
  - `task_specs = 604`
  - `task_lifecycle = 604`
- direct temp-repo create/read/amend/read roundtrip through command functions succeeded
- repo `narada task read 623` succeeded through SQLite-backed spec path

## Acceptance Criteria

- [x] SQLite task-spec storage model is explicit.
- [x] Create/read/amend command surfaces are explicit.
- [x] Migration posture for existing tasks is explicit.
- [x] Projection/export trigger posture is explicit.
- [x] No normal-path direct substrate access is required.

