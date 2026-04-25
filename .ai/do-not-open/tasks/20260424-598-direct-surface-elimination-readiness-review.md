---
status: closed
created: 2026-04-24
depends_on: [595, 596, 597]
closed_at: 2026-04-24T21:41:54.839Z
closed_by: a1
governed_by: task_close:a1
---

# Task 598 - Direct-Surface Elimination Readiness Review

## Goal

Review whether Narada's task surface is now complete enough to actually eliminate direct task markdown and direct SQLite use from normal work.

## Required Work

1. Review the combined state of:
   - task create
   - task read
   - task spec amendment
   - lifecycle commands
   - assignment/dispatch commands
2. Identify any remaining normal workflow that still depends on:
   - direct markdown reading
   - direct markdown editing
   - direct task creation by file authoring
   - direct SQLite task interaction
3. State whether direct-surface elimination is now:
   - ready
   - blocked
   - or only partially ready
4. If blocked, name the exact residual commands or workflow gaps.
5. Record verification or bounded blockers.

## Execution Notes

- Reviewed combined state of task create, task read, task amend, lifecycle commands, assignment/dispatch commands.
- **Readiness judgment: partially ready.** The command surface is complete enough that a normal operator never needs to directly read, edit, or create markdown task files, nor directly query SQLite. However, substrate sync inconsistencies create stale state that undermines reliability.

### Surface Completeness (Normal Workflow)

| Operation | Command | Direct substrate needed? |
|-----------|---------|-------------------------|
| Create task | `narada task create` | No |
| Read task | `narada task read` | No |
| Amend spec | `narada task amend` | No |
| Claim | `narada task claim` | No |
| Release | `narada task release` | No |
| Continue | `narada task continue` | No |
| Report | `narada task report` | No |
| Review | `narada task review` | No |
| Close | `narada task close` | No |
| Reopen | `narada task reopen` | No |
| Confirm | `narada task confirm` | No |
| List | `narada task list` | No |
| Evidence | `narada task evidence` | No |
| Roster | `narada task roster ...` | No |
| Dispatch | `narada task dispatch ...` | No |

### Concrete Residual Blockers

1. **SQLite lifecycle sync gaps** — `task claim`, `task release`, `task report`, `task continue`, `task reopen`, `task confirm` do not write to the SQLite lifecycle store. This causes `task read` to show stale status when SQLite is authoritative. Commands that DO sync: `task review`, `task close`.
2. **Roster sync gap on claim** — `task claim` updates `last_active_at` but does not set roster status to `working` or attach the task. Operators must run a separate `task roster assign --no-claim` to reflect working state.
3. **Test runner posture** — On-disk SQLite tests require `--pool=forks` to avoid worker-thread native-resource hangs. This is recorded and bounded, not user-facing.

### Bounded Exceptional Paths

- `needs_continuation → opened`: No direct command. Path via `task continue` → `task release --reason abandoned`. Exceptional.
- `draft → opened`: `task create` produces `opened` directly. `draft` is pre-creation placeholder.
- `confirmed → in_review`: `task reopen --force`. Exceptional.

## Verification

Verified by attempting normal workflow end-to-end:
- Created, read, amended, claimed, released, reported, reviewed, closed, reopened, confirmed tasks all via CLI without direct markdown/SQLite access.
- Encountered stale SQLite status during Task 596 closure (markdown showed `in_review`, SQLite still showed `claimed`), requiring direct SQLite repair to proceed. This confirms blocker #1 is real and affects normal work.

## Acceptance Criteria

- [x] Remaining normal direct-surface dependencies are explicitly identified or eliminated
- [x] Readiness judgment is explicit
- [x] Residual blockers, if any, are concrete
- [x] Verification or bounded blocker evidence is recorded



