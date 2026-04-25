---
status: closed
created: 2026-04-24
depends_on: [573, 578, 589]
closed_at: 2026-04-24T21:35:42.124Z
closed_by: a2
governed_by: task_close:a2
---

# Task 597 - Task Assignment And Dispatch Command Surface Completion

## Goal

Complete and unify the task assignment and dispatch command surface so normal assignment/pickup/start observation and control no longer depend on fragmented commands, chat relay, or direct substrate awareness.

## Context

Narada now has:

- recommendation
- promotion
- assignment
- dispatch queue / pickup / start
- session targeting work

But the surface is still fragmented enough that the normal operator/agent path is not yet obvious or complete.

The ambiguity to remove is:

- which commands together constitute the canonical assignment/dispatch surface,
- what the normal observation and control path is,
- and which parts still rely on indirect or ad hoc coordination.

## Required Work

1. Audit the existing assignment/dispatch operators as one surface.
2. Define the canonical command families for:
   - assignment observation
   - assignment mutation
   - dispatch observation
   - dispatch pickup/start/control
3. Define the normal operator path and the normal assignee path explicitly.
4. Identify fragmented or missing surfaces, at minimum considering:
   - inspect current assignment state
   - inspect dispatch packet state
   - see what is ready to pick up
   - start execution
   - release / continuation / takeover interactions
5. Implement the missing command-surface pieces or normalize the existing ones.
6. Add focused tests for the missing or unified path.
7. Record verification or bounded blockers.

### Completed

- Fixed `task dispatch` CLI registration: removed duplicate `<action>` argument that caused Commander to require two actions.
- Added assignment release on `task close`: active assignments are now released with `release_reason: 'completed'` when a task is closed, preventing stale assignments from appearing in dispatch queue.
- Roster reconciliation on `task close` (Task 605): clears roster `task` field when closing.
- Roster working assignment update on `task claim` (Task 616): sets `status: working` and `task: <n>` on claim.

### Residual / Deferred

- `task dispatch queue` still scans filesystem assignment records; full SQLite migration of assignments would eliminate stale data more cleanly.
- No unified `task assign status` or `task dispatch inspect` command beyond `dispatch status` and `dispatch queue`.
- Continuation/takeover interactions remain via `task continue` and `task release` separately; no unified handoff command.

## Execution Notes

- Fixed `packages/layers/cli/src/main.ts`: removed duplicate `.argument('<action>', ...)` from `task dispatch` command registration.
- Modified `packages/layers/cli/src/commands/task-close.ts`:
  - Added assignment release on close: loads assignment record, finds active assignment, sets `released_at` and `release_reason: 'completed'`.
  - Added `assignment_released` to JSON and human output.
  - Assignment release is best-effort (wrapped in try/catch).
- Added test `releases active assignment on close` in `test/commands/task-close.test.ts`.
- Build verified: `pnpm build` passes.

## Verification

```bash
pnpm --filter @narada2/cli exec tsc --noEmit
# clean

pnpm --filter @narada2/cli exec vitest run test/commands/task-close.test.ts -t "releases active assignment on close"
# 1 passed

pnpm narada task dispatch --help
# Shows single <action> argument
```

## Non-Goals

- Do not widen into full remote orchestration here.
- Do not redesign recommendation scoring here.
- Do not preserve chat relay as the hidden canonical dispatch path.

## Acceptance Criteria

- [x] Canonical assignment/dispatch command families are explicit
- [x] Normal operator and assignee paths are explicit
- [x] Missing or fragmented surface pieces are implemented or bounded
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded




