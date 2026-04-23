---
status: closed
created: 2026-04-23
owner: unassigned
depends_on: [463]
closed_at: 2026-04-23T14:13:53.735Z
closed_by: a3
---

# Task 488 - Evidence-Based Not-Complete Task List

## Context

`narada task list` currently lists runnable tasks by lifecycle status and continuation affinity. That is useful for assignment, but it does not answer the operator question:

```text
Which tasks are not actually complete by evidence?
```

Status alone is insufficient. A task can be `closed` while still invalid by evidence, as seen with Tasks 484 and 486 before repair. Operators need a read-only command that lists incomplete, attempt-complete, needs-review, and needs-closure tasks using the same evidence classifier as `narada task evidence <n>`.

## Goal

Add an evidence-based task listing surface for "not done" / "not complete" tasks.

Suggested command shapes:

```bash
narada task evidence list --verdict incomplete,attempt_complete,needs_review,needs_closure
narada task list --not-complete
```

Choose the surface that best matches existing CLI organization, but preserve the distinction:

- `task list` = runnable/status/assignment view;
- evidence list = completion/evidence view.

## Read First

- `.ai/task-contracts/agent-task-execution.md`
- `AGENTS.md` Task Completion Semantics
- `.ai/tasks/20260422-463-task-completion-evidence-and-closure-enforcement.md`
- `.ai/tasks/20260422-474-governed-task-closure-invariant.md`
- `packages/layers/cli/src/commands/task-evidence.ts`
- `packages/layers/cli/src/commands/task-list.ts`
- `packages/layers/cli/src/lib/task-governance.ts`

## Non-Goals

- Do not mutate task files, roster, assignments, reports, reviews, or closure decisions.
- Do not replace `task list` runnable-task behavior.
- Do not close, reopen, repair, or assign tasks automatically.
- Do not make evidence warnings authoritative lifecycle transitions.

## Required Work

1. Add a read-only evidence listing command.
   - It should scan task files and call the existing evidence inspector.
   - It should support filtering by verdict:
     - `incomplete`;
     - `attempt_complete`;
     - `needs_review`;
     - `needs_closure`;
     - `complete`;
     - `unknown`.
   - Default should show not-complete verdicts only.

2. Include useful columns.
   - Task number and title.
   - Front-matter status.
   - Evidence verdict.
   - Missing evidence flags:
     - unchecked criteria count;
     - execution notes missing;
     - verification missing;
     - report missing;
     - review missing;
     - closure missing.
   - Current roster agent if any.

3. Add JSON output.
   - JSON output should expose stable fields for automation.
   - Include violations and warnings from evidence inspection.

4. Add operator ergonomics.
   - Support `--range <start-end>` if easy using existing task graph helpers.
   - Support `--status <csv>` if it can be done without duplicating status parsing.
   - Human output should make closed-but-invalid tasks obvious.

5. Add tests.
   - Lists opened incomplete tasks.
   - Lists claimed attempt-complete tasks.
   - Lists closed-but-invalid tasks.
   - Filters by verdict.
   - JSON output is stable.
   - Command is read-only.

6. Update docs.
   - Update `AGENTS.md` Task Completion Semantics with the new list command.
   - Update `.ai/task-contracts/agent-task-execution.md` if agents should use it before declaring chapter/task state.

## Acceptance Criteria

- [x] A read-only evidence-based task listing command exists.
- [x] Default output lists tasks that are not complete by evidence, not merely by status.
- [x] Closed-but-invalid tasks are included and visibly marked.
- [x] Filtering by verdict works.
- [x] JSON output includes status, verdict, missing evidence flags, violations, and warnings.
- [x] Current roster assignment is shown when available.
- [x] Tests cover incomplete, attempt-complete, needs-review, needs-closure, filtering, JSON, and read-only behavior.
- [x] Documentation distinguishes runnable task listing from evidence completion listing.
- [x] Verification evidence is recorded in this task.

## Execution Notes

Implemented `narada task evidence list` as a read-only evidence-based task listing command.

### Changes

1. **`packages/layers/cli/src/lib/task-governance.ts`**
   - Added `EvidenceBasedTaskEntry` interface.
   - Added `listEvidenceBasedTasks()` function that scans all task files, calls `inspectTaskEvidence()` for each, and supports filtering by verdict, status, and numeric range. Default filter shows not-complete verdicts (`incomplete`, `attempt_complete`, `needs_review`, `needs_closure`). Loads roster to include current agent assignment.

2. **`packages/layers/cli/src/commands/task-evidence-list.ts`** (new)
   - `taskEvidenceListCommand` with JSON and human output.
   - Human output shows task number, status, verdict, title, missing evidence flags, and assigned agent. Closed-but-invalid tasks are visibly marked with `⚠`.
   - JSON output exposes stable fields: `task_number`, `task_id`, `title`, `status`, `verdict`, `missing` (boolean flags for each evidence type), `warnings`, `violations`, `assigned_agent`.
   - Supports `--verdict`, `--status`, `--range`, `--format`, `--cwd` options.

3. **`packages/layers/cli/src/main.ts`**
   - Reorganized `task evidence` into a command group with subcommands:
     - `narada task evidence inspect <task-number>` — single-task evidence inspection
     - `narada task evidence list` — evidence-based listing
     - Backward compatibility: `narada task evidence <task-number>` still routes to inspect.

4. **`packages/layers/cli/test/commands/task-evidence-list.test.ts`** (new)
   - 13 tests covering: default not-complete filter, incomplete tasks, attempt-complete tasks, closed-but-invalid tasks, needs-review tasks, verdict filtering, status filtering, range filtering, complete-task filtering, assigned agent display, stable JSON shape, read-only behavior (mtime unchanged), and human output.

5. **Documentation updates**
   - `AGENTS.md`: Added `narada task evidence list` to Task Completion Semantics table and key rules.
   - `.ai/task-contracts/agent-task-execution.md`: Added references to `narada task evidence list` in operator handoff and closure invariant sections.

### Design Decisions

- Chose `task evidence list` as a subcommand of `task evidence` rather than `task list --not-complete` to preserve the clean distinction between runnable/status view (`task list`) and completion/evidence view (`task evidence list`).
- Default filter is not-complete verdicts so operators immediately see what needs attention.
- Human output uses the existing formatter library for consistent table styling.

## Verification

```bash
# New command tests
pnpm --filter @narada2/cli exec vitest run test/commands/task-evidence-list.test.ts
# 13 tests passed

# Existing evidence and list command tests (regression check)
pnpm --filter @narada2/cli exec vitest run test/commands/task-evidence.test.ts test/commands/task-list.test.ts
# 14 tests passed

# Typecheck
pnpm --filter @narada2/cli typecheck
# Clean

# Full CLI test suite
pnpm --filter @narada2/cli exec vitest run
# 534 tests passed across 55 test files

# Full monorepo verification
pnpm verify
# All 5 steps passed
```


