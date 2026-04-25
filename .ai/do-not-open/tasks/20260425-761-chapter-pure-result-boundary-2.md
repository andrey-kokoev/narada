---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:34:19.947Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:34:20.323Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 761 — Make chapter close a pure result producer

## Goal

Remove formatter-side stdout writes from chapter close so legacy and range closure outputs pass through the same output boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Replace runLegacyClose human-mode formatter printing with returned _formatted output.
2. Replace runRangeClose human-mode formatter printing with returned _formatted output for start, finish, and reopen paths.
3. Migrate the chapter close CLI registration to runDirectCommand.
4. Preserve legacy chapter-name mode and range workflow semantics.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] chapterCloseCommand does not print directly to stdout for success, dry-run, start, finish, or reopen output.
- [x] narada chapter close routes through runDirectCommand.
- [x] Legacy and range close result shapes remain structured.
- [x] Existing chapter-close tests pass.
