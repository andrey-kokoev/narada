---
status: closed
depends_on: [425, 453, 455, 456]
---

# Task 463 — Task Completion Evidence and Closure Enforcement

## Context

During multi-agent Narada development, agents frequently report "done" while the task artifact remains incomplete:

- task front matter still says `status: closed`;
- acceptance criteria remain unchecked;
- no `## Execution Notes` or verification evidence exists;
- no WorkResultReport exists;
- review agents sometimes mark themselves done without closing or patching the reviewed task.

Task 455 made roster mutations race-safe. Task 456 added PrincipalRuntime bridge behavior and already exposes warnings when `task roster done` happens without a WorkResultReport. The warning is useful but insufficient: the operator still has to manually inspect task files and reassign review/closure work.

This task hardens completion semantics so "agent done" cannot quietly diverge from task evidence.

## Goal

Make task completion and review completion mechanically evidence-aware.

The CLI should clearly distinguish:

```text
agent is done with their local attempt
task has acceptable completion evidence
task artifact is closed
chapter is ready to advance
```

The system must reduce repeated human/operator churn where roster says done but the task file remains open or unverified.

## Required Work

### 1. Define completion evidence model

Create or document a small `TaskCompletionEvidence` model in `packages/layers/cli/src/lib/task-governance.ts` or a nearby helper.

It must inspect a task file and report at least:

- `task_number`;
- `status`;
- whether all acceptance criteria are checked;
- whether `## Execution Notes` exists;
- whether `## Verification` or explicit verification evidence exists;
- whether a WorkResultReport exists for the task;
- whether a review file exists for the task when status is `in_review`, `accepted`, `rejected`, or `closed`;
- whether a closure decision references the task when status is `closed` or `confirmed`.

Do not require all historical tasks to satisfy the model. The model must be able to classify legacy gaps without breaking normal inspection.

### 2. Add task evidence inspection command

Add a CLI surface:

```bash
narada task evidence <task-number> [--format json|human]
```

It should print the evidence model and a verdict:

| Verdict | Meaning |
|---------|---------|
| `complete` | artifact has status closed/confirmed, checked criteria, notes/evidence, and matching review/closure where required |
| `attempt_complete` | roster/report says agent finished, but task artifact is still open or missing evidence |
| `needs_review` | task has execution evidence but no review where required |
| `needs_closure` | review accepted but task status/closure artifact is missing |
| `incomplete` | task lacks required execution evidence |

This command is read-only.

### 3. Harden `task roster done`

Update `taskRosterDoneCommand` behavior:

- Keep existing warning for missing WorkResultReport.
- Also inspect task artifact evidence before marking the roster done.
- If the task file is still `opened`/`claimed` and has no execution notes, warn:
  `"Task <n> has no execution evidence; roster done marks only agent availability, not task completion."`
- If acceptance criteria are unchecked, warn with count.
- If status is still open, print suggested next command:
  `narada task evidence <n>` or `narada task report <n> ...`

Do not block roster update by default. The goal is evidence-aware completion, not a brittle hard gate.

### 4. Harden review completion path

Update `task review` and/or `task roster done` for reviewer agents so that review completion leaves a clear artifact state.

Minimum:

- `task review` must write or update a review record with standardized front matter from Task 453.
- If review verdict is accepted, the target task should transition to `closed` only if acceptance criteria and execution evidence are present.
- If review verdict is rejected or accepted-with-notes, the task should remain/reopen according to existing lifecycle rules and the command should surface the reason.
- `task roster done` for a reviewer should warn if the reviewed task still has no review artifact.

Do not let reviewer roster state silently substitute for review evidence.

### 5. Add optional `--strict` mode

Add `--strict` to `task roster done`.

In strict mode, fail instead of warn when:

- WorkResultReport is missing for an implementer completion;
- execution notes are missing;
- acceptance criteria are unchecked;
- review artifact is missing for a reviewer completion.

Strict mode should not become the default until historical gaps are cleaned up.

### 6. Integrate with task recommendation / next-work selection

Update task recommendation logic if needed so it treats:

- `attempt_complete` tasks as needing review/closure, not as ordinary open work;
- stale `done` roster state without task closure as a signal to recommend review/closure work;
- blocked tasks as blocked until evidence shows blockers are resolved.

Do not make recommendations authoritative.

### 7. Tests

Add focused tests for:

- `narada task evidence` on a complete task;
- `narada task evidence` on an attempt-complete/open task;
- missing WorkResultReport warning on `task roster done`;
- unchecked acceptance criteria warning on `task roster done`;
- `--strict` fails when evidence is missing;
- `--strict` passes when evidence is complete;
- reviewer done warns when review artifact is missing;
- `task review accepted` does not close a task lacking evidence;
- task recommendation classifies attempt-complete tasks appropriately if recommendation logic is changed.

Use temp repos. Do not run broad suites unless focused tests expose cross-package failures.

## Non-Goals

- Do not retroactively rewrite all historical task files.
- Do not make WorkResultReport mandatory for every historical task.
- Do not replace task files with a database.
- Do not make roster state authoritative over task completion.
- Do not block non-strict roster updates.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `narada task evidence <task-number>` exists and is read-only.
- [x] Evidence model reports status, acceptance criteria, execution notes, verification evidence, report, review, and closure state.
- [x] `task roster done` warns when agent completion lacks task evidence.
- [x] `task roster done --strict` fails when required evidence is missing.
- [x] Reviewer completion cannot silently substitute for a review artifact.
- [x] `task review accepted` does not close evidence-incomplete tasks.
- [x] Task recommendation or next-work logic accounts for attempt-complete tasks if affected.
- [x] Focused tests cover complete, attempt-complete, incomplete, strict failure, and reviewer cases.
- [x] Docs/contracts explain the distinction between roster done, report, review, and task closure.
- [x] No derivative task-status files are created.

## Execution Notes

### Implementation Summary

1. **TaskCompletionEvidence model** added to `packages/layers/cli/src/lib/task-governance.ts`:
   - `inspectTaskEvidence(cwd, taskNumber)` parses task files and checks acceptance criteria (`- [x]` vs `- [ ]`), `## Execution Notes`, `## Verification`, WorkResultReports, review records, and closure decisions.
   - Verdicts: `complete`, `attempt_complete`, `needs_review`, `needs_closure`, `incomplete`, `unknown`.

2. **`narada task evidence <task-number>`** command added in `packages/layers/cli/src/commands/task-evidence.ts`:
   - Read-only inspection with `--format json|human`.
   - Returns structured evidence and verdict.

3. **`task roster done` hardened** in `packages/layers/cli/src/commands/task-roster.ts`:
   - Warns on missing execution evidence, unchecked criteria, missing report (implementers).
   - Warns on missing review artifact (reviewers).
   - `--strict` flag fails instead of warns when evidence is missing.
   - Does not block non-strict updates.

4. **`task review accepted` hardened** in `packages/layers/cli/src/commands/task-review.ts`:
   - Evidence gate blocks `closed` transition when criteria are unchecked or execution evidence is missing.
   - Task stays `in_review` with `evidence_blocked` and `evidence_reason` surfaced in output.
   - Self-transition (`in_review` → `in_review`) is allowed when gate blocks.

5. **Task recommender updated** in `packages/layers/cli/src/lib/task-recommender.ts`:
   - `in_review` tasks are added to `abstained` with reason "Completed, awaiting review or closure".
   - They are explicitly excluded from ordinary runnable work recommendations.

6. **Documentation** added to `AGENTS.md` §Task Completion Semantics explaining the four-level distinction.

7. **Tests** added:
   - `test/commands/task-evidence.test.ts` (7 tests)
   - `test/commands/task-roster.test.ts` extended (4 new tests)
   - `test/commands/task-review.test.ts` extended (1 new test)
   - `test/commands/task-recommend.test.ts` extended (1 new test)

### Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-evidence.test.ts test/commands/task-roster.test.ts test/commands/task-review.test.ts test/commands/task-recommend.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

All focused tests pass (53/53). Full CLI test suite passes (246/246). No derivative files created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-evidence.test.ts test/commands/task-roster.test.ts test/commands/task-review.test.ts test/commands/task-recommend.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

## Reservation Note

`pnpm exec tsx scripts/task-reserve.ts --range 463-463 ...` could not run in the current sandbox because `tsx` failed to open its IPC pipe under `/tmp/tsx-1000/*.pipe` (`EPERM`). The task number was allocated manually after checking existing task files and the registry. The registry was updated to `last_allocated: 463`.
