---
status: closed
depends_on: []
criteria_proved_by: a2
criteria_proved_at: 2026-04-26T01:38:45.990Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-26T01:38:46.113Z
closed_by: a2
governed_by: task_close:a2
closure_mode: agent_finish
---

# Task 774 — Migrate task next surfaces to shared output admission

## Goal

Route peek-next, pull-next, and work-next through the shared direct-command boundary.

## Context

<!-- Context placeholder -->

## Required Work

1. Replace bespoke output and exit handling for task peek-next.
2. Replace bespoke output and exit handling for task pull-next.
3. Replace bespoke output and exit handling for task work-next.
4. Preserve existing option names, defaults, and command service behavior.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] peek-next uses shared direct command admission.
- [x] pull-next uses shared direct command admission.
- [x] work-next uses shared direct command admission.
- [x] Focused task-next tests pass.
