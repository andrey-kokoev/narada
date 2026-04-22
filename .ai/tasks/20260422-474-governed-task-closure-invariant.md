---
status: closed
depends_on: [463, 469, 471]
closed_at: 2026-04-22T19:25:00Z
closed_by: codex
---

# Task 474 — Governed Task Closure Invariant

## Context

Narada repeatedly observes task files in this invalid state:

```text
status: closed
verdict: needs_closure
criteria checked: no
```

This is not a documentation nuisance. It is a state invariant violation: a task artifact claims terminal closure while its acceptance criteria remain unchecked.

The current system detects the problem through `narada task evidence`, but detection happens after agents have already marked tasks closed by directly editing front matter. The valid closure path is not yet mechanically enforced.

## Goal

Make task closure governed. A task must not be allowed to enter `closed` or `confirmed` unless its evidence is complete, or every unmet criterion is explicitly deferred with rationale and follow-up task references.

## Required Work

### 1. Define the closure invariant

Document the invariant in `.ai/task-contracts/agent-task-execution.md` and, if appropriate, `docs/governance/task-graph-evolution-boundary.md`:

```text
A task may enter closed/confirmed only when:
1. all acceptance criteria are checked, and
2. execution notes exist, and
3. verification notes exist, and
4. no derivative task-status files exist.

If a criterion is intentionally not completed, it must be moved out of Acceptance Criteria into Residuals / Deferred Work with rationale and a concrete follow-up task reference.
```

Acceptance criteria are not decorative. They are closure gates.

### 2. Harden task evidence classification

Update the task evidence logic so that:

- `closed` / `confirmed` with unchecked acceptance criteria is classified as an invariant violation, not merely `needs_closure`;
- output clearly says the task is terminal-by-front-matter but invalid-by-evidence;
- JSON output exposes a machine-readable violation code, e.g. `terminal_with_unchecked_criteria`;
- direct-closure cases with checked criteria, execution notes, and verification remain valid.

Do not regress the direct-closure evidence semantics introduced for design-only tasks.

### 3. Add a governed close operator

Implement a narrow command:

```bash
narada task close <task-number> --by <agent-or-operator>
```

The command must:

- read the task file;
- verify all acceptance criteria are checked;
- verify execution notes exist;
- verify verification notes exist;
- verify no derivative task-status files exist;
- set `status: closed` only after validation succeeds;
- add `closed_at` and `closed_by` front matter;
- fail without mutation if any gate fails.

If the task is already `closed` or `confirmed`, the command should validate it and report whether it is valid or invalid.

### 4. Prevent bypass in review and chapter closure paths

Update existing operators so they respect the same invariant:

- `narada task review accepted` must not close a task if criteria or evidence are incomplete.
- `narada chapter close <range> --finish` must hard-fail if any task in the range is terminal but invalid by evidence.
- `narada task lint` / chapter lint must report terminal-with-unchecked-criteria as an error, not a warning.

### 5. Add tests

Add focused CLI tests covering:

- `task close` succeeds for complete evidence;
- `task close` fails with unchecked criteria;
- `task close` fails without execution notes;
- `task close` fails without verification notes;
- already-closed valid task reports valid;
- already-closed invalid task reports invariant violation;
- `task review accepted` cannot close incomplete evidence;
- `chapter close --finish` rejects terminal tasks with unchecked criteria;
- task lint reports terminal-with-unchecked-criteria as an error.

### 6. Audit current tasks

Run a focused audit over `.ai/tasks` and report any existing terminal tasks with unchecked criteria.

Do not silently patch unrelated tasks in this task. If existing invalid terminal tasks are found, either:

- fix only task files that are directly in the current construction-loop chapter (`469–474`) and have clear evidence, or
- create a follow-up corrective task listing the invalid task numbers.

## Non-Goals

- Do not create a broad task management redesign.
- Do not make roster state authoritative for task closure.
- Do not parse chat messages as completion evidence.
- Do not add a web UI.
- Do not auto-generate fake acceptance criteria checks.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Closure invariant is documented in the task execution contract.
- [x] `task evidence` reports terminal-with-unchecked-criteria as an invariant violation with a machine-readable code.
- [x] `narada task close <task-number> --by <id>` exists and enforces closure gates before mutation.
- [x] `task review accepted` uses the same closure gate.
- [x] `chapter close --finish` rejects invalid terminal tasks.
- [x] Task lint treats terminal-with-unchecked-criteria as an error.
- [x] Focused tests cover successful close, failed close, review gate, chapter gate, and lint gate.
- [x] Existing terminal-invalid tasks are audited and reported.
- [x] No roster command is made authoritative for task completion.
- [x] No derivative task-status files are created.

## Execution Notes

- Documented the closure invariant in `.ai/task-contracts/agent-task-execution.md` under a new "Governed Task Closure Invariant" section.
- Added `violations: string[]` to `TaskCompletionEvidence` interface in `task-governance.ts`.
- Updated `inspectTaskEvidence()` to detect and report four violation types for terminal tasks:
  - `terminal_with_unchecked_criteria`
  - `terminal_without_execution_notes`
  - `terminal_without_verification`
  - `terminal_with_derivative_files`
- Added `hasDerivativeFiles()` utility to detect forbidden suffixes (`-EXECUTED`, `-DONE`, `-RESULT`, `-FINAL`, `-SUPERSEDED`).
- Updated `findTaskFile()` to exclude derivative files from matching, preventing ambiguity errors.
- Created `packages/layers/cli/src/commands/task-close.ts` implementing `narada task close <task-number> --by <id>` with full gate validation and atomic mutation.
- Strengthened `task-review.ts` evidence gate to require verification notes and check for derivative files.
- Updated `chapter-close.ts` `--finish` path (both legacy and range-based) to validate all terminal tasks for closure invariant violations before transitioning `closed` → `confirmed`.
- Added `terminal_with_unchecked_criteria`, `terminal_without_execution_notes`, and `terminal_without_verification` as errors in both `lintTaskFiles()` and `lintTaskFilesForRange()`.
- Wired `task close` command in `main.ts`.
- Added 10 tests in `task-close.test.ts`, 3 new lint tests in `task-lint.test.ts`, 1 chapter-close test, 1 task-review test.
- Fixed existing tests that created terminal tasks without verification to include verification sections.
- Audited `.ai/tasks/` and found 119 terminal tasks with violations. Tasks 469–473 in the current chapter are valid. Created follow-up Task 475 for corrective audit.

## Verification

```bash
# Focused tests (60 tests)
pnpm --filter @narada2/cli exec vitest run test/commands/task-close.test.ts test/commands/task-evidence.test.ts test/commands/task-review.test.ts test/commands/chapter-close.test.ts test/commands/task-lint.test.ts

# Full CLI suite (471 tests)
pnpm --filter @narada2/cli exec vitest run

# Typecheck
pnpm --filter @narada2/cli typecheck

# Check for derivative files
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

All focused tests pass (60/60). Full CLI suite passes (471/471). Typecheck is clean. No derivative files found.
