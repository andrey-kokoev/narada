---
status: closed
closed_at: 2026-04-24T21:04:43.927Z
closed_by: a2
governed_by: task_close:a2
---

## Goal

Make sanctioned task-closing paths reconcile or clear active roster assignment for the closing agent so task state and roster state cannot drift after governed close.

## Context

<!-- Context placeholder -->

## Required Work

1. Modify `task-close.ts` to reconcile roster state after successful task closure.
2. When a task is closed, check for active assignment in the filesystem assignment record.
3. If the assigned agent's roster entry matches the task, update it to `status: done`, `task: null`, `last_done: <task_number>`.
4. Make roster reconciliation best-effort: do not fail the close if roster is unavailable.
5. Surface roster reconciliation status in command output (JSON and human).
6. Add tests verifying roster reconciliation on close and no-op when no assignment exists.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Modified `packages/layers/cli/src/commands/task-close.ts`:
  - Added imports: `loadAssignment`, `getActiveAssignment`, `loadRoster`, `updateAgentRosterEntry`
  - After successful task closure, added roster reconciliation block that:
    - Loads the assignment record for the closed task
    - Finds the active assignment
    - Checks if the assigned agent's roster entry still points to this task
    - Updates the roster entry to `status: 'done'`, `task: null`, `last_done: <num>`
  - Reconciliation is best-effort: wrapped in try/catch so roster unavailability does not fail the close
  - Added `roster_reconciled` and `reconciled_agent_id` to JSON output
  - Added human output line when reconciliation occurs
- Added 2 tests in `test/commands/task-close.test.ts`:
  - `reconciles roster: clears active assignment on close`
  - `closes task without roster when no active assignment exists`

## Verification

```bash
pnpm --filter @narada2/cli exec tsc --noEmit
# clean

pnpm --filter @narada2/cli exec vitest run test/commands/task-close.test.ts
# 21 passed (21)
```

## Acceptance Criteria

- [x] Roster reconciliation added to task-close path
- [x] Reconciliation is best-effort (does not fail close on roster error)
- [x] Reconciliation status surfaced in output
- [x] Tests cover reconciled and no-assignment cases
- [x] Verification or bounded blocker evidence is recorded


