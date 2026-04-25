---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-25T23:22:45.045Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-25T23:22:45.176Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 757 — Migrate chapter completion inspection commands to shared runner

## Goal

Route chapter finish-range and chapter assert-complete through the shared direct-command boundary so success output, nonzero results, and thrown errors are admitted consistently.

## Context

<!-- Context placeholder -->

## Required Work

1. Replace hand-rolled result handling for narada chapter finish-range with runDirectCommand.
2. Replace hand-rolled result handling for narada chapter assert-complete with runDirectCommand.
3. Preserve existing command inputs, defaults, and human/json format behavior.
4. Do not broaden this task into chapter init or chapter close semantics.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] chapter finish-range no longer directly calls console.error/process.exit for command-result failure handling.
- [x] chapter assert-complete no longer directly calls process.exit for command-result failure handling.
- [x] Both commands pass their service result through the shared output admission path.
- [x] Focused CLI tests or typecheck cover the changed command registration.
