---
status: closed
depends_on: [624]
closed_at: 2026-04-24T23:46:41.551Z
closed_by: codex
governed_by: task_close:codex
---

# Task 625 - Task Read And Amend From SQLite Projection

## Execution Mode

Proceed directly. This is an implementation task.

## Context

Narada already has task read/create surfaces, but markdown still sits underneath as the authored source. This task moves normal read and amend operations to SQLite-owned task spec, with markdown produced only as projection or export.

## Required Work

1. Implement SQLite-backed task spec read.
2. Implement SQLite-backed task amend.
3. Make `task read` and related observation surfaces consume SQLite-owned spec.
4. Preserve operator-usable output and projection behavior.
5. Add focused tests for read/amend correctness and projection coherence.

## Non-Goals

- Do not keep markdown as authoritative fallback.
- Do not broaden scope into unrelated task-state operators.

## Execution Notes

1. Reworked `packages/layers/cli/src/commands/task-read.ts` so spec fields come from SQLite `task_specs`.
2. Reworked `packages/layers/cli/src/commands/task-amend.ts` so spec mutation writes SQLite first, then regenerates markdown projection.
3. Added `packages/layers/cli/src/lib/task-spec.ts` to centralize:
   - spec parsing
   - section extraction
   - projection rendering
   - acceptance-criteria state merge
4. Added `non_goals` to task-read output.
5. Removed normal-path markdown hydration from `task read` and `task amend`; missing SQLite spec is now explicit error, not silent fallback.

## Verification

- `pnpm --filter @narada2/cli typecheck` -> passed
- `pnpm --filter @narada2/cli build` -> passed
- `timeout 240s pnpm --filter @narada2/cli exec vitest run test/commands/task-read.test.ts --pool=forks --reporter=dot` -> passed (11/11, ~103s)
- `timeout 420s pnpm --filter @narada2/cli exec vitest run test/commands/task-amend.test.ts --pool=forks --reporter=dot` -> passed (17/17, ~281s)
- direct temp-repo verification:
  - `task create` created SQLite-backed spec row
  - `task read` returned SQLite-backed title/goal/non-goals/criteria
  - `task amend` updated SQLite-backed title/goal/criteria
  - reread reflected amended SQLite-backed spec
- existing repo task `623` reads successfully after backfill

## Acceptance Criteria

- [x] Task read uses SQLite-owned spec.
- [x] Task amend uses SQLite-owned spec.
- [x] Projection/output remains usable.
- [x] Focused tests exist and pass.
- [x] Verification or bounded blocker evidence is recorded.

