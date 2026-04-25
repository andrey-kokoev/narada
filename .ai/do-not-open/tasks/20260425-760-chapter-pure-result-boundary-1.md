---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:34:03.937Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:34:04.072Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 760 — Make chapter init a pure result producer

## Goal

Remove formatter-side stdout writes from chapter init so the CLI boundary owns all output admission.

## Context

<!-- Context placeholder -->

## Required Work

1. Replace chapterInitCommand human-mode formatter printing with a returned _formatted string.
2. Add or preserve structured JSON result fields for dry-run and success modes.
3. Migrate the chapter init CLI registration to runDirectCommand.
4. Preserve existing inputs, file creation behavior, and collision validation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] chapterInitCommand does not print directly to stdout for success or dry-run output.
- [x] narada chapter init routes through runDirectCommand.
- [x] Human output remains readable through the shared emitter.
- [x] Existing chapter-init tests pass.
